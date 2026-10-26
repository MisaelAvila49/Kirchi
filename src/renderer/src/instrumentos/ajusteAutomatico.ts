import { formatearMedida } from '../valores/valores'
import { BASE_RANGO, DIVISIONES_H, FRECUENCIA_AC, POS_RANGO, VDIV_RANGO, type Acople } from './ajustes'
import type { MedidaSab } from '../sim/protocoloInstrumentos'
import { valoresSerie } from './serie'

/** Divisiones que ocupa la señal tras el ajuste automático. */
const DIVISIONES_SENAL = 6
/** Periodos a la vista, al menos, con la holgura de la frecuencia medida (1 kHz puede medirse 999.6 Hz). */
const PERIODOS = 2
const HOLGURA_PERIODOS = 0.01
/** El centro de la señal queda a lo más a cuatro divisiones del centro de la pantalla (la posición llega a ±4). */
const DIVISIONES_CENTRO = POS_RANGO[1]
/** El paso de la posición (el del control del panel). */
const PASO_POS = 0.2
/** En DC, una variación de menos de una división no se distingue: si la señal es rápida, el ajuste pasa a AC. */
const DIVISIONES_MIN_DC = 1
/** Pasa a AC solo si la señal es al menos diez veces más rápida que el filtro del acoplamiento AC (no la deforma). */
const VECES_FILTRO_AC = 10

/** Canal que usa el ajuste automático: el primero encendido, fuera de GND y con medidas, de preferencia con señal (Vpp >
 * 0); si ninguno, el primero con medidas, y si no, A.
 * Un canal sin conexión no tiene medidas, y mirar solo A dejaba sin ajuste una señal en B. */
export function canalDeReferencia(canales: readonly { on: boolean; acople: Acople; medidas: readonly MedidaSab[] }[]): number {
  const conDatos = canales.map((c, i) => ({ c, i })).filter(({ c }) => c.on && c.acople !== 'GND' && c.medidas[0] && !c.medidas[0].razon && Number.isFinite(c.medidas[0].valor))
  return (conDatos.find(({ c }) => c.medidas[0].valor > 0) ?? conDatos[0])?.i ?? 0
}

export interface ResultadoAjuste {
  vdiv: number
  base: number
  nivel: number
  /** La posición del canal A, en divisiones (centra la señal). */
  pos: number
  acople: Acople
  /** Lo que el panel dice cuando el ajuste cambió el acoplamiento; null si no lo cambió. */
  nota: string | null
}

/** «Ajuste automático» sobre el canal A: V/div para ocupar unas seis divisiones centrada, la base más corta con al menos
 * dos periodos y disparo a media señal. Sin frecuencia la base no cambia; bajo 1 mV queda a 1 V/div. Pasa de DC a AC solo
 * con una señal rápida de menos de una división sobre mucha continua. */
export function ajusteAutomatico(s: { vmin: number; vmax: number; frecuencia: number | null; acople: Acople; base: number; canal?: string }): ResultadoAjuste {
  const vs = valoresSerie(VDIV_RANGO[0], VDIV_RANGO[1])
  const serie = (minimo: number) => (minimo > 0 ? (vs.find((v) => v >= minimo * (1 - 1e-9)) ?? VDIV_RANGO[1]) : 1)
  const bs = valoresSerie(BASE_RANGO[0], BASE_RANGO[1])
  const base = s.frecuencia && s.frecuencia > 0 ? (bs.find((b) => b * DIVISIONES_H * s.frecuencia! >= PERIODOS * (1 - HOLGURA_PERIODOS)) ?? BASE_RANGO[1]) : s.base
  const centro = (s.vmax + s.vmin) / 2
  const vpp = Math.max(0, s.vmax - s.vmin)
  if (Math.max(Math.abs(s.vmax), Math.abs(s.vmin)) < VDIV_RANGO[0]) return { vdiv: 1, base, nivel: 0, pos: 0, acople: s.acople, nota: null }
  const vdiv = serie(Math.max(vpp / DIVISIONES_SENAL, Math.abs(centro) / DIVISIONES_CENTRO))
  const rapida = s.frecuencia !== null && s.frecuencia >= VECES_FILTRO_AC * FRECUENCIA_AC
  if (s.acople === 'DC' && vpp > 0 && vpp / vdiv < DIVISIONES_MIN_DC && rapida) {
    const nota = `Ajuste automático puso ${s.canal ?? 'A'} en AC: la señal varía ${formatearMedida(vpp, 'V', 4)} sobre ${formatearMedida(centro, 'V', 4)} de continua, que en DC no se distinguiría.`
    return { vdiv: serie(vpp / DIVISIONES_SENAL), base, nivel: 0, pos: 0, acople: 'AC', nota }
  }
  const pos = Math.min(POS_RANGO[1], Math.max(POS_RANGO[0], Math.round(-centro / vdiv / PASO_POS) * PASO_POS))
  return { vdiv, base, nivel: centro, pos: Number(pos.toFixed(1)) || 0, acople: s.acople, nota: null }
}

const PREFIJOS: [number, string][] = [[1, ''], [1e-3, 'm'], [1e-6, 'u'], [1e-9, 'n'], [1e-12, 'p']]

/** Un valor de la serie como se guarda en una propiedad: 0.2 → «200m», 1e-6 → «1u». */
export function textoDeSerie(v: number): string {
  const [e, p] = PREFIJOS.find(([x]) => v >= x * (1 - 1e-9)) ?? PREFIJOS[PREFIJOS.length - 1]
  return `${Number((v / e).toPrecision(12))}${p}`
}

/** Por debajo de esto un número de un ajuste (un nivel, una posición) es cero: lo que queda de sumar y restar pasos. */
const CERO_AJUSTE = 1e-12

/** Número como se guarda en una propiedad, con `cifras` significativas y sin potencias de diez: `String(2.38e-7)` da
 * «2.38e-7», que no se lee como valor; aquí «238n». El residuo de sumar pasos (5.6e-17) es «0». */
export function textoDeNumero(v: number, cifras = 4): string {
  const x = Number(v.toPrecision(cifras))
  if (!(Math.abs(x) >= CERO_AJUSTE)) return '0'
  const t = String(x)
  if (!t.includes('e')) return t
  const [e, p] = PREFIJOS.find(([f]) => Math.abs(x) >= f * (1 - 1e-9)) ?? [1e-12, 'p']
  return `${Number((x / e).toPrecision(cifras))}${p}`
}

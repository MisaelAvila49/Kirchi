import { formatearValor, leerValor } from '../../valores/valores'

/**
 * Velocidad del tiempo simulado: ocho opciones fijas y «Lo más rápido posible» (el worker corre sin tope de reloj). Es de la sesión de cada ventana, no va al documento ni a los ajustes.
 */
export const LO_MAS_RAPIDO = Number.POSITIVE_INFINITY
export const VELOCIDAD_INICIAL = 1

/** Las ocho velocidades fijas, de la más rápida a la más lenta (menos «Sin límite de tiempo real»). */
export const VELOCIDADES: readonly number[] = [10, 5, 2, 1, 0.5, 0.1, 0.01, 0.001]

/** La velocidad de la serie más cercana (para comparar sin errores de redondeo); infinito se queda. */
const enSerie = (v: number): number => (v === LO_MAS_RAPIDO ? v : VELOCIDADES.reduce((a, b) => (Math.abs(Math.log(b / v)) < Math.abs(Math.log(a / v)) ? b : a)))

/** «Más lento»: la siguiente de la serie hacia abajo; null en la más lenta. Desde «Sin límite de tiempo real», 10×. */
export function masLenta(v: number): number | null {
  if (v === LO_MAS_RAPIDO) return VELOCIDADES[0]
  const i = VELOCIDADES.indexOf(enSerie(v))
  return i < VELOCIDADES.length - 1 ? VELOCIDADES[i + 1] : null
}

/** «Más rápido»: la siguiente hacia arriba; desde 10×, «Sin límite de tiempo real»; null ahí. */
export function masRapida(v: number): number | null {
  if (v === LO_MAS_RAPIDO) return null
  const i = VELOCIDADES.indexOf(enSerie(v))
  return i > 0 ? VELOCIDADES[i - 1] : LO_MAS_RAPIDO
}

/** Decimales que pide una cifra de la serie para escribirse sin potencia de diez («0.001»). */
const decimales = (v: number): number => Math.max(0, -Math.floor(Math.log10(v) + 1e-9))

/** «10×», «1×», «0.001×» o «Sin límite de tiempo real». */
export function textoVelocidad(v: number): string {
  if (v === LO_MAS_RAPIDO) return 'Sin límite de tiempo real'
  const s = enSerie(v)
  return `${s.toFixed(decimales(s))}×`
}

/** Lo que se simula en un segundo de reloj: «1 ms simulado», «10 s simulados»; vacío con «Sin límite de tiempo real». */
export function porSegundo(v: number): string {
  if (v === LO_MAS_RAPIDO) return ''
  const s = enSerie(v)
  const t = formatearValor(s, 's')
  return `${t} ${/^1 \D/.test(t) ? 'simulado' : 'simulados'}`
}

/** El renglón del menú: «×0.001 (1 s = 1 ms simulado)». */
export const textoDelMenu = (v: number): string => (v === LO_MAS_RAPIDO ? textoVelocidad(v) : `×${textoVelocidad(v).slice(0, -1)} (1 s = ${porSegundo(v)})`)

/** Para lectores de pantalla: «Velocidad ×0.001 (1 s = 1 ms simulado).» */
export const anuncioDeVelocidad = (v: number): string => `Velocidad ${textoDelMenu(v)}.`

const UNIDADES_TIEMPO: readonly [number, string][] = [[1, 's'], [1e-3, 'ms'], [1e-6, 'µs'], [1e-9, 'ns']]

/**
 * Tiempo simulado de la barra de estado, con las cifras que pida la velocidad para que la última cambie unas diez veces por segundo (mínimo cuatro significativas): a 1× «12.35 s». Sin el «t = ».
 */
export function formatearTiempo(t: number, v: number): string {
  if (!Number.isFinite(t) || t <= 0) return '0 s'
  const [escala, unidad] = UNIDADES_TIEMPO.find(([e]) => t >= e * (1 - 1e-12)) ?? UNIDADES_TIEMPO[UNIDADES_TIEMPO.length - 1]
  const porVelocidad = v === LO_MAS_RAPIDO ? Number.POSITIVE_INFINITY : 10 ** Math.floor(Math.log10(v / 10) + 1e-9)
  const porCifras = 10 ** (Math.floor(Math.log10(t) + 1e-12) - 3)
  const paso = Math.min(porVelocidad, porCifras) / escala
  const d = Math.min(9, Math.max(0, -Math.floor(Math.log10(paso) + 1e-9)))
  return `${(t / escala).toFixed(d)} ${unidad}`
}

/**
 * Intervalo de «Avanzar» (F6). `automatico` es una división del osciloscopio a la vista o lo que la velocidad recorre en 0.1 s; `paso` un paso del motor; un número, segundos.
 */
export type DeltaAvance = 'automatico' | 'paso' | number

/** Los Δ escritos se aceptan de 1 ns a 1,000 s. */
export const RANGO_DELTA: readonly [number, number] = [1e-9, 1e3]

/** El intervalo de un avance automático en segundos simulados. */
export function deltaAutomatico(v: number, divisionOsciloscopio: number | null): number {
  if (divisionOsciloscopio !== null && divisionOsciloscopio > 0) return divisionOsciloscopio
  return 0.1 * (v === LO_MAS_RAPIDO ? 1 : enSerie(v))
}

/**
 * División que cuenta para «Una división»: la del osciloscopio a la vista o, con la franja plegada, la del que se abrirá al simular (el primer avance la abre y el tramo debe coincidir).
 */
export const divisionDeVista = (franjaAbierta: boolean, pestaña: string, base: number | null): number | null => (franjaAbierta && pestaña !== 'osciloscopio' ? null : base)

/** Lo que manda un avance: segundos o un paso del motor. */
export const intervaloDe = (d: DeltaAvance, v: number, divisionOsciloscopio: number | null): number | 'paso' =>
  d === 'paso' ? 'paso' : d === 'automatico' ? deltaAutomatico(v, divisionOsciloscopio) : d

/**
 * Texto de un Δ o instante («10 µs», «2 ms», «0.5») en segundos, o el error junto al campo. `que` solo cambia el sujeto del aviso de rango.
 */
export function leerDelta(texto: string, que: 'intervalo' | 'instante' = 'intervalo'): { valor: number } | { error: string } {
  if (texto.trim() === '') return { error: 'Escribe un tiempo, por ejemplo 2 ms.' }
  const v = leerValor(texto.trim())
  if (!v || (v.unidad !== '' && v.unidad !== 's')) return { error: 'Escribe un tiempo con unidades, como «10 µs» o «2 ms».' }
  if (!(v.valor >= RANGO_DELTA[0] && v.valor <= RANGO_DELTA[1])) return { error: `${que === 'instante' ? 'El instante' : 'El intervalo'} va de 1 ns a 1000 s.` }
  return { valor: v.valor }
}

/** El instante que propone «Avanzar hasta t»: el siguiente de la serie 1-2-5 (desde 1 ms) por encima del tiempo actual, hasta 1000 s. */
export function instantePorOmision(t: number): number {
  for (let e = -3; e <= 3; e++) for (const m of [1, 2, 5]) {
    const c = Number((m * 10 ** e).toPrecision(1))
    if (c > t * (1 + 1e-9)) return c
  }
  return RANGO_DELTA[1]
}

/**
 * «Una división (1 ms)», «Un paso de cálculo (20 µs)» o «2 ms». `paso` es el paso máximo de la vista previa; sin él no hay cifra.
 */
export function textoDelta(d: DeltaAvance, v: number, divisionOsciloscopio: number | null, paso?: number): string {
  if (d === 'paso') return paso ? `Un paso de cálculo (${formatearValor(paso, 's')})` : 'Un paso de cálculo'
  if (d === 'automatico') return `Una división (${formatearValor(deltaAutomatico(v, divisionOsciloscopio), 's')})`
  return formatearValor(d, 's')
}

/** Lo que avanza cada avance, para el globo de Avanzar. `paso` es lo que dura hoy un paso del motor. */
export function textoCantidad(d: DeltaAvance, v: number, divisionOsciloscopio: number | null, paso?: number): string {
  if (d === 'paso') return paso ? `un paso de cálculo (${formatearValor(paso, 's')})` : 'un paso de cálculo'
  return formatearValor(d === 'automatico' ? deltaAutomatico(v, divisionOsciloscopio) : d, 's')
}

/**
 * El barrido pasa a rodillo cuando una pantalla tarda 0.5 s de reloj o más en llenarse. Vive en `instrumentos/barrido.ts` (`esRodillo`).
 */

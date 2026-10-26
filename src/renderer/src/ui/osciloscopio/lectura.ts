import { prefijoParaRango, unidadConPrefijo, valorEnPrefijo } from '../../../../compartido/grafica/ejes'
import type { PrefijoEje } from '../../../../compartido/grafica/aspecto'
import { DIVISIONES_H, DIVISIONES_V, type AjustesOsciloscopio, type CanalOMatematico } from '../../instrumentos/ajustes'
import { CIFRAS_COLUMNA, type PantallaSab } from '../../sim/protocoloInstrumentos'
import { BANDERA_VACIA, trazas } from './dibujar'
import type { Marco } from './marco'

/**
 * Lo que el puntero lee sobre la pantalla: instante y voltaje de cada canal encendido. Sin DOM, en píxeles de dispositivo.
 */
export interface FilaOsc {
  canal: CanalOMatematico
  voltaje: number
  texto: string
  /** El píxel vertical del punto (en el lienzo, no en la retícula). */
  yPx: number
}

export interface LecturaOsc {
  /** Dónde cae la cruz (el píxel horizontal del puntero). */
  xPx: number
  /** «t = 1.25 ms»: el instante respecto al disparo (o desde el borde izquierdo sin disparo). */
  encabezado: string
  filas: FilaOsc[]
}

/** El voltaje de una columna: la mitad entre su primer y su último valor (la línea de la pantalla pasa por esos dos). */
const valorDeColumna = (col: Float32Array, q: number): number => (col[q + 2] + col[q + 3]) / 2

export function lecturaPantalla(
  p: PantallaSab,
  a: AjustesOsciloscopio,
  m: Marco,
  xPx: number,
  prefijos: Readonly<Partial<Record<string, PrefijoEje | null>>> = {},
  prefijoTiempo: PrefijoEje | null = null
): LecturaOsc | null {
  if (p.ncol <= 0 || !Number.isFinite(p.t0)) return null
  if (!(xPx >= m.x && xPx <= m.x + m.w)) return null
  const f = (xPx - m.x) / m.w
  const j = Math.min(p.ncol - 1, Math.floor(f * p.ncol))
  const t = p.t0 + f * DIVISIONES_H * a.base
  const filas: FilaOsc[] = []
  for (const tr of trazas(a)) {
    const q = tr.i * p.ncol * CIFRAS_COLUMNA + j * CIFRAS_COLUMNA
    if (p.columnas[q + 4] & BANDERA_VACIA) continue
    const v = valorDeColumna(p.columnas, q)
    if (!Number.isFinite(v)) continue
    const pref = prefijos[tr.id] ?? prefijoParaRango(Math.abs(v), 'V')
    const yPx = Math.max(m.y, Math.min(m.y + m.h, m.y + m.h / 2 - (v / tr.vdiv + tr.pos) * (m.h / DIVISIONES_V)))
    filas.push({ canal: tr.id, voltaje: v, texto: `${valorEnPrefijo(v, pref, 3)} ${unidadConPrefijo('V', pref)}`.trim(), yPx })
  }
  const conDisparo = Number.isFinite(p.tDisparo)
  const rel = conDisparo ? t - p.tDisparo : t - p.t0
  const pt = prefijoTiempo ?? prefijoParaRango(Math.abs(rel), 's')
  const texto = `${valorEnPrefijo(rel, pt, 3)} ${unidadConPrefijo('s', pt)}`.trim()
  return { xPx, encabezado: `t = ${texto}`, filas }
}

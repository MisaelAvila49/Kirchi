import { admitePrefijo, unidadConPrefijo, valorEnPrefijo, type FormatoEje } from '../../../../../compartido/grafica/ejes'
import { FACTOR_PREFIJO } from '../../../../../compartido/grafica/aspecto'
import { formatearSI } from '../../../valores/valores'
import type { NotaEtiqueta } from '../../../../../compartido/grafica/anotaciones'
import type { Rect, TrazaGeom } from './geometria'

/** El punto de una traza más cercano a (px, py): su índice, su posición y su valor. */
export interface PuntoElegido {
  i: number
  px: number
  py: number
  x: number
  y: number
  /** Distancia en px al puntero. */
  d: number
}

/** Mide un texto en px de la figura (el editor da una medida real con un lienzo; las pruebas, la estimada). */
export type Medir = (texto: string, tam: number, negrita: boolean) => number
export const medirEstimado: Medir = (texto, tam, negrita) => texto.length * tam * (negrita ? 0.6 : 0.55)
/** Las cifras del globo van en la familia mono: todas miden lo mismo, así que su caja es la misma en la vista y en el archivo. */
export const medirMono: Medir = (texto, tam) => texto.length * tam * 0.6

/** Primer índice con px ≥ v (px no decrece). */
function primeroDesde(t: Pick<TrazaGeom, 'px'>, v: number): number {
  let lo = 0
  let hi = t.px.length
  while (lo < hi) {
    const m = (lo + hi) >> 1
    if (t.px[m] < v) lo = m + 1
    else hi = m
  }
  return lo
}

type Muestras = Pick<TrazaGeom, 'px' | 'py' | 'x' | 'y'> & { logX?: boolean }

/** El valor horizontal a la fracción `s` del tramo entre dos muestras: en el espacio del eje, o sea logarítmico si el eje lo es. */
function interpolarX(t: Muestras, i: number, s: number): number {
  const a = t.x[i]
  const b = t.x[i + 1]
  if (t.logX && a > 0 && b > 0) return Math.exp(Math.log(a) + s * (Math.log(b) - Math.log(a)))
  return a + s * (b - a)
}

/** El punto del tramo `i` (entre las muestras i e i+1) a la fracción `s`, con sus valores interpolados en el espacio de cada eje. */
function enTramo(t: Muestras, i: number, s: number, d: number): PuntoElegido {
  return { i: s < 0.5 ? i : i + 1, px: t.px[i] + s * (t.px[i + 1] - t.px[i]), py: t.py[i] + s * (t.py[i + 1] - t.py[i]), x: interpolarX(t, i, s), y: t.y[i] + s * (t.y[i + 1] - t.y[i]), d }
}

/**
 * Punto de la traza más cercano al puntero, o null. La distancia es a los tramos entre muestras (se interpolan), no a las muestras.
 */
export function puntoMasCercano(t: Muestras, px: number, py: number): PuntoElegido | null {
  const n = t.px.length
  if (n === 0) return null
  if (n === 1) return { i: 0, px: t.px[0], py: t.py[0], x: t.x[0], y: t.y[0], d: Math.hypot(t.px[0] - px, t.py[0] - py) }
  const k = Math.max(0, Math.min(n - 2, primeroDesde(t, px) - 1))
  const caja: { mejor: PuntoElegido | null } = { mejor: null }
  const probar = (j: number) => {
    const x1 = t.px[j]
    const y1 = t.py[j]
    const dx = t.px[j + 1] - x1
    const dy = t.py[j + 1] - y1
    const l2 = dx * dx + dy * dy
    const s = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l2))
    const d = Math.hypot(px - (x1 + s * dx), py - (y1 + s * dy))
    if (!caja.mejor || d < caja.mejor.d) caja.mejor = enTramo(t, j, s, d)
  }
  for (let j = k; j < n - 1; j++) {
    if (caja.mejor && t.px[j] - px > caja.mejor.d) break
    probar(j)
  }
  for (let j = k - 1; j >= 0; j--) {
    if (caja.mejor && px - t.px[j + 1] > caja.mejor.d) break
    probar(j)
  }
  return caja.mejor
}

/** La traza y el punto más cercano al puntero entre todas (o entre una sola, `solo`). */
export function puntoGlobal(trazas: readonly TrazaGeom[], px: number, py: number, solo?: string): { traza: TrazaGeom; punto: PuntoElegido } | null {
  let mejor: { traza: TrazaGeom; punto: PuntoElegido } | null = null
  for (const t of trazas) {
    if (solo !== undefined && t.id !== solo) continue
    const p = puntoMasCercano(t, px, py)
    if (p && (!mejor || p.d < mejor.punto.d)) mejor = { traza: t, punto: p }
  }
  return mejor
}

/** El punto de una traza en el valor horizontal `x` (el de una etiqueta guardada): interpolado entre las dos muestras que lo encierran, o la del extremo si cae fuera. */
export function puntoDeValor(t: Muestras, x: number): PuntoElegido | null {
  const n = t.x.length
  if (n === 0) return null
  if (n === 1 || x <= t.x[0]) return { i: 0, px: t.px[0], py: t.py[0], x: t.x[0], y: t.y[0], d: 0 }
  if (x >= t.x[n - 1]) return { i: n - 1, px: t.px[n - 1], py: t.py[n - 1], x: t.x[n - 1], y: t.y[n - 1], d: 0 }
  let lo = 0
  let hi = n - 1
  // x crece con px: se busca el tramo que lo encierra.
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1
    if (t.x[m] <= x) lo = m
    else hi = m
  }
  const a = t.x[lo]
  const b = t.x[hi]
  let s = 0
  if (b !== a) s = t.logX && a > 0 && b > 0 && x > 0 ? (Math.log(x) - Math.log(a)) / (Math.log(b) - Math.log(a)) : (x - a) / (b - a)
  const p = enTramo(t, lo, Math.max(0, Math.min(1, s)), 0)
  return { ...p, x }
}

/** Los dos renglones del globo de una etiqueta: el valor horizontal y el vertical en unidades del SI. */
/** Un valor con el prefijo y los decimales de su eje («12.346 ms»); «auto» da cuatro cifras significativas; sin formato, el SI de siempre. */
export function textoValorEje(valor: number, unidad: string, formato?: FormatoEje): string {
  if (!formato || !admitePrefijo(unidad)) return formatearSI(valor, unidad)
  if (!Number.isFinite(valor)) return formatearSI(valor, unidad)
  const u = unidadConPrefijo(unidad, formato.prefijo)
  if (Math.abs(valor) < 1e-18) return `0 ${u}`
  const f = FACTOR_PREFIJO[formato.prefijo]
  const d = formato.decimales
  const n = d === 'auto' ? valorEnPrefijo(valor, formato.prefijo, 4) : (valor / f).toFixed(d ?? formato.omision)
  return `${/^-?0(\.0*)?$/.test(n) ? n.replace('-', '') : n} ${u}`.replace('-', '−')
}

export function textoDeEtiqueta(t: Pick<TrazaGeom, 'unidadX' | 'unidadY' | 'formatoX' | 'formatoY'>, x: number, y: number): [string, string] {
  return [`x: ${textoValorEje(x, t.unidadX, t.formatoX)}`, `y: ${textoValorEje(y, t.unidadY, t.formatoY)}`]
}

export const TAM_GLOBO = 11
const RENGLON = 14

/** El recuadro del globo de una etiqueta (esquina superior izquierda en `punto` + el desplazamiento) y sus renglones. */
export function cajaDeEtiqueta(e: Pick<NotaEtiqueta, 'dx' | 'dy'>, punto: { px: number; py: number }, renglones: readonly string[], medir: Medir): Rect {
  const w = Math.max(...renglones.map((r) => medir(r, TAM_GLOBO, false))) + 12
  return { x: punto.px + e.dx, y: punto.py + e.dy, w, h: renglones.length * RENGLON + 8 }
}
export const ALTO_RENGLON_GLOBO = RENGLON

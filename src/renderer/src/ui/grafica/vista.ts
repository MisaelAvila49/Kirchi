/** Cuentas de la vista de una gráfica (valor a píxel, zoom, desplazamiento, cursores) sin dibujo ni DOM. */

export type Escala = 'lin' | 'log'
export interface Dominio {
  min: number
  max: number
}

/** Ancho relativo mínimo que deja el zoom (una millonésima del ancho de los datos o, en log, una milésima de década). */
const ANCHO_MINIMO = 1e-6

const t = (v: number, e: Escala): number => (e === 'log' ? Math.log10(v) : v)
const inv = (u: number, e: Escala): number => (e === 'log' ? 10 ** u : u)

/** El píxel de un valor en un eje que va de `p0` (el mínimo) a `p1` (el máximo); `p0` > `p1` invierte el eje (el vertical). */
export function aPixel(v: number, d: Dominio, e: Escala, p0: number, p1: number): number {
  const a = t(d.min, e)
  const b = t(d.max, e)
  return p0 + ((t(v, e) - a) / (b - a)) * (p1 - p0)
}

export function deValor(p: number, d: Dominio, e: Escala, p0: number, p1: number): number {
  const a = t(d.min, e)
  const b = t(d.max, e)
  return inv(a + ((p - p0) / (p1 - p0)) * (b - a), e)
}

/** Acerca (`factor` < 1) o aleja (> 1) la ventana alrededor del punto que está a la fracción `centro` (0 a 1) de su ancho. */
export function zoomEn(d: Dominio, e: Escala, centro: number, factor: number): Dominio {
  const a = t(d.min, e)
  const b = t(d.max, e)
  const c = a + centro * (b - a)
  const ancho = (b - a) * factor
  return { min: inv(c - centro * ancho, e), max: inv(c + (1 - centro) * ancho, e) }
}

/** La ventana entre las fracciones `f0` y `f1` del ancho actual (en cualquier orden): lo que se arrastró con la caja. */
export function zoomCaja(d: Dominio, e: Escala, f0: number, f1: number): Dominio {
  const a = t(d.min, e)
  const b = t(d.max, e)
  const [lo, hi] = f0 <= f1 ? [f0, f1] : [f1, f0]
  return { min: inv(a + lo * (b - a), e), max: inv(a + hi * (b - a), e) }
}

/** Mueve la ventana una fracción de su ancho (positiva: hacia valores mayores). */
export function desplazar(d: Dominio, e: Escala, fraccion: number): Dominio {
  const a = t(d.min, e)
  const b = t(d.max, e)
  const s = fraccion * (b - a)
  return { min: inv(a + s, e), max: inv(b + s, e) }
}

/** Deja la ventana dentro de los datos (`limite`) y con un ancho mínimo; más ancha que los datos, se queda en los datos. */
export function acotar(d: Dominio, limite: Dominio, e: Escala): Dominio {
  const L0 = t(limite.min, e)
  const L1 = t(limite.max, e)
  const total = L1 - L0
  let a = t(d.min, e)
  let b = t(d.max, e)
  let ancho = b - a
  if (!(ancho < total)) return { ...limite }
  const minimo = Math.abs(total) * ANCHO_MINIMO
  if (ancho < minimo) {
    const c = (a + b) / 2
    a = c - minimo / 2
    b = c + minimo / 2
    ancho = minimo
  }
  if (a < L0) [a, b] = [L0, L0 + ancho]
  if (b > L1) [a, b] = [L1 - ancho, L1]
  return { min: inv(a, e), max: inv(b, e) }
}

/** La diferencia de los dos cursores; en un eje logarítmico también cuántas veces uno es el otro (la razón, siempre ≥ 1). */
export function deltaCursores(x: readonly [number, number], e: Escala): { dx: number; razon: number | null } {
  const dx = Math.abs(x[1] - x[0])
  if (e !== 'log' || !(x[0] > 0) || !(x[1] > 0)) return { dx, razon: null }
  return { dx, razon: Math.max(x[0], x[1]) / Math.min(x[0], x[1]) }
}

/** El cursor (0 o 1) a `radio` píxeles o menos del puntero en `px`; el más cercano si hay dos, o null. */
export function indiceCursorCercano(x: readonly [number, number], px: number, d: Dominio, e: Escala, p0: number, p1: number, radio: number): 0 | 1 | null {
  let mejor: 0 | 1 | null = null
  let dist = Infinity
  for (const i of [0, 1] as const) {
    const q = Math.abs(aPixel(x[i], d, e, p0, p1) - px)
    if (q <= radio && q < dist) [mejor, dist] = [i, q]
  }
  return mejor
}

/** El valor de una traza (x monótona, creciente o decreciente como un barrido de `hasta` a `desde`) en `v`: lineal en la gráfica (en log de x si el eje x es log); NaN fuera de sus datos. */
export function interpolar(x: Float64Array, y: Float64Array, v: number, e: Escala): number {
  const n = x.length
  if (n === 0) return Number.NaN
  const dec = x[0] > x[n - 1]
  const [m0, m1] = dec ? [x[n - 1], x[0]] : [x[0], x[n - 1]]
  if (!(v >= m0) || !(v <= m1)) return Number.NaN
  // «antes» es verdadero mientras el punto está antes de `v` en el orden en que viene la traza.
  const antes = (k: number): boolean => (dec ? x[k] >= v : x[k] <= v)
  let lo = 0
  let hi = n - 1
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1
    if (antes(m)) lo = m
    else hi = m
  }
  if (x[hi] === x[lo]) return y[lo]
  const f = (t(v, e) - t(x[lo], e)) / (t(x[hi], e) - t(x[lo], e))
  return y[lo] + f * (y[hi] - y[lo])
}

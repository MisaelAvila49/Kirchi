import type { TonoFigura } from '../../../../../compartido/ajustes'
import type { FormatoEje } from '../../../../../compartido/grafica/ejes'

/**
 * Dónde cae cada cosa de una figura, en px a 1×. Pura (no dibuja): la usa el editor para saber qué hay bajo el puntero.
 */
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface TrazaGeom {
  /** La clave con que se guarda su estilo (letra del canal o clave de la traza). */
  id: string
  etiqueta: string
  tono: TonoFigura
  /** Unidades de sus dos ejes, para escribir los valores de una etiqueta («s», «V», «Hz», «dB»). */
  unidadX: string
  unidadY: string
  /** Prefijo y decimales de cada eje, para escribir con ellos los valores de una etiqueta; ausentes, el SI de siempre. */
  formatoX?: FormatoEje
  formatoY?: FormatoEje
  /** El eje horizontal es logarítmico: las etiquetas interpolan su valor entre muestras en ese espacio. */
  logX?: boolean
  /** Posición de cada punto en la figura; `px` no decrece. */
  px: Float64Array
  py: Float64Array
  /** El valor del punto en sus ejes. */
  x: Float64Array
  y: Float64Array
}

/** Algo que se puede elegir en la figura aparte de las notas: los títulos y los ejes. */
export interface ObjetoGeom {
  /** `titulo`, `subtitulo`, `eje:x` o `eje:<id de la traza>`. */
  id: string
  tipo: 'fijo' | 'eje'
  etiqueta: string
  rect: Rect
}

export interface GeometriaFigura {
  ancho: number
  alto: number
  /** La retícula (donde viven las trazas). */
  area: Rect
  trazas: TrazaGeom[]
  objetos: ObjetoGeom[]
}

export const dentro = (r: Rect, x: number, y: number, holgura = 0): boolean => x >= r.x - holgura && x <= r.x + r.w + holgura && y >= r.y - holgura && y <= r.y + r.h + holgura

/** Distancia de un punto a un segmento. */
export function distanciaASegmento(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1
  const dy = y2 - y1
  const l2 = dx * dx + dy * dy
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l2))
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}

/** Pasa un arreglo de pares (px, py, x, y) con posibles huecos a una traza limpia: solo puntos finitos y px creciente. */
export function trazaLimpia(base: Omit<TrazaGeom, 'px' | 'py' | 'x' | 'y'>, px: ArrayLike<number>, py: ArrayLike<number>, x: ArrayLike<number>, y: ArrayLike<number>, tope = 6000): TrazaGeom {
  const n = Math.min(px.length, py.length, x.length, y.length)
  const idx: number[] = []
  let ultimo = -Infinity
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(px[i]) || !Number.isFinite(py[i]) || !Number.isFinite(x[i]) || !Number.isFinite(y[i])) continue
    if (px[i] < ultimo) continue
    ultimo = px[i]
    idx.push(i)
  }
  // Con muchísimos puntos se toma uno de cada tantos: basta para elegir el punto más cercano y no pesa en cada movimiento del puntero.
  const paso = Math.max(1, Math.ceil(idx.length / tope))
  const sel = paso === 1 ? idx : idx.filter((_, k) => k % paso === 0 || k === idx.length - 1)
  const a = (f: ArrayLike<number>) => Float64Array.from(sel, (i) => f[i])
  return { ...base, px: a(px), py: a(py), x: a(x), y: a(y) }
}

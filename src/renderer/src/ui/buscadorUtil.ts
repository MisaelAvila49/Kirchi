import type { Geometria } from '../piezas/tipos'

export interface VistaPrevia {
  viewBox: string
  /** Atributo `points` de cada polilínea. */
  lineas: string[]
  /** Atributo `points` de cada triángulo relleno. */
  triangulos: string[]
}

const num = (v: number) => String(Math.round(v * 1000) / 1000 + 0)
const par = (a: ArrayLike<number>, i: number) => `${num(a[i])},${num(a[i + 1])}`

export function vistaPrevia(g: Geometria, margen = 1): VistaPrevia {
  const c = g.caja
  const viewBox = [c.minX - margen, c.minY - margen, c.maxX - c.minX + 2 * margen, c.maxY - c.minY + 2 * margen].map(num).join(' ')
  const lineas = g.trazos.map((t) => {
    const out: string[] = []
    for (let i = 0; i + 1 < t.length; i += 2) out.push(par(t, i))
    return out.join(' ')
  })
  const triangulos: string[] = []
  for (let i = 0; i + 5 < g.rellenos.length; i += 6) triangulos.push([par(g.rellenos, i), par(g.rellenos, i + 2), par(g.rellenos, i + 4)].join(' '))
  return { viewBox, lineas, triangulos }
}

/** Tamaño del icono en píxeles (el de `.simbolo` en styles.css) y grosor mínimo legible del trazo. */
export const ICONO_ANCHO = 26
export const ICONO_ALTO = 14
export const TRAZO_MIN_PX = 0.9
/** Grosor por omisión del trazo del símbolo, en unidades de la pieza (el de `.simbolo polyline`). */
export const TRAZO_UNIDADES = 0.25

/**
 * Grosor del trazo en unidades del viewBox. Se sube lo justo para que un símbolo alto mida al menos `TRAZO_MIN_PX` píxeles.
 */
export function grosorIcono(viewBox: string): number {
  const [, , w, h] = viewBox.split(' ').map(Number)
  const pxPorUnidad = Math.min(ICONO_ANCHO / w, ICONO_ALTO / h)
  return Math.max(TRAZO_UNIDADES, TRAZO_MIN_PX / pxPorUnidad)
}

export const ANCHO_BUSCADOR = 520
export const ALTO_BUSCADOR = 340
const HUECO = 24

/** Esquina del buscador para un clic en (x, y) de ventana sobre una vista de vw × vh. */
export function posicionBuscador(x: number, y: number, vw: number, vh: number, w = ANCHO_BUSCADOR, h = ALTO_BUSCADOR): { left: number; top: number } {
  let left = x + HUECO
  if (left + w > vw - 8) left = x - HUECO - w
  if (left < 8) left = 8
  const top = Math.min(Math.max(y - h / 3, 8), Math.max(8, vh - h - 8))
  return { left, top }
}

/** Limita `v` a [min, max]; si no cabe (max < min) gana `min`, que es el borde que debe verse. */
export const acotar = (v: number, min: number, max: number): number => Math.max(min, Math.min(v, Math.max(min, max)))

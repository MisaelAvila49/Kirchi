/**
 * Zoom y desplazamiento de la vista previa, en px de pantalla (la figura mide `fw` por `fh` a 1×). Acerca alrededor de un punto fijo y no deja salir la figura de la caja.
 */
export interface VistaZoom {
  /** Px de pantalla por px de la figura. */
  k: number
  /** Dónde cae el origen de la figura en la caja. */
  tx: number
  ty: number
}

export const ZOOM_MIN = 0.2
export const ZOOM_MAX = 8
export const MARGEN_VISTA = 24
/** Cuánta figura se queda a la vista como mínimo al desplazar (px de pantalla). */
const QUEDA = 80

export interface Caja {
  w: number
  h: number
}
export interface TamanoFigura {
  fw: number
  fh: number
}

export function ajustar(caja: Caja, f: TamanoFigura, margen = MARGEN_VISTA): VistaZoom {
  const k = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.min((caja.w - 2 * margen) / f.fw, (caja.h - 2 * margen) / f.fh)))
  return { k, tx: (caja.w - f.fw * k) / 2, ty: (caja.h - f.fh * k) / 2 }
}

export const aFigura = (v: VistaZoom, x: number, y: number): [number, number] => [(x - v.tx) / v.k, (y - v.ty) / v.k]
export const aPantalla = (v: VistaZoom, x: number, y: number): [number, number] => [x * v.k + v.tx, y * v.k + v.ty]

/** Que siempre quede a la vista un pedazo de la figura. */
export function acotar(v: VistaZoom, caja: Caja, f: TamanoFigura): VistaZoom {
  const w = f.fw * v.k
  const h = f.fh * v.k
  const q = Math.min(QUEDA, w, h)
  return { k: v.k, tx: Math.max(q - w, Math.min(caja.w - q, v.tx)), ty: Math.max(q - h, Math.min(caja.h - q, v.ty)) }
}

/** Acerca o aleja por `factor` dejando quieto el punto (cx, cy) de la caja. */
export function zoomEn(v: VistaZoom, factor: number, cx: number, cy: number, caja: Caja, f: TamanoFigura): VistaZoom {
  const k = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, v.k * factor))
  const [fx, fy] = aFigura(v, cx, cy)
  return acotar({ k, tx: cx - fx * k, ty: cy - fy * k }, caja, f)
}

export function desplazar(v: VistaZoom, dx: number, dy: number, caja: Caja, f: TamanoFigura): VistaZoom {
  return acotar({ ...v, tx: v.tx + dx, ty: v.ty + dy }, caja, f)
}

/** El zoom como porcentaje respecto de la figura a tamaño real. */
export const porcentaje = (v: VistaZoom): number => Math.round(v.k * 100)

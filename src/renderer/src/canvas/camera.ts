/** `x`, `y`: coordenada de mundo en la esquina superior izquierda; `zoom`: píxeles CSS por unidad. */
export interface Camera {
  x: number
  y: number
  zoom: number
}

export interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export const ZOOM_MIN = 0.02
/** 900 % del tamaño real (ZOOM_100 de lienzo/medidas.ts: 96 ppp, 1.25 mm por unidad). */
export const ZOOM_MAX = 9 * ((96 / 25.4) * 1.25)

export function screenToWorld(c: Camera, sx: number, sy: number) {
  return { x: c.x + sx / c.zoom, y: c.y + sy / c.zoom }
}

export function worldToScreen(c: Camera, wx: number, wy: number) {
  return { x: (wx - c.x) * c.zoom, y: (wy - c.y) * c.zoom }
}

export function zoomAt(c: Camera, sx: number, sy: number, factor: number): Camera {
  const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, c.zoom * factor))
  const w = screenToWorld(c, sx, sy)
  return { zoom, x: w.x - sx / zoom, y: w.y - sy / zoom }
}

export function pan(c: Camera, dsx: number, dsy: number): Camera {
  return { zoom: c.zoom, x: c.x - dsx / c.zoom, y: c.y - dsy / c.zoom }
}

export function fitCamera(b: Bounds, width: number, height: number, margin = 40): Camera {
  const bw = Math.max(b.maxX - b.minX, 1)
  const bh = Math.max(b.maxY - b.minY, 1)
  const raw = Math.min((width - 2 * margin) / bw, (height - 2 * margin) / bh)
  const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, raw))
  return {
    zoom,
    x: b.minX - (width / zoom - bw) / 2,
    y: b.minY - (height / zoom - bh) / 2
  }
}

/** Aire alrededor del dibujo al encuadrar: el mayor entre 24 px y el 4 % del lado menor de la vista. */
export const margenEncuadre = (width: number, height: number): number => Math.max(24, 0.04 * Math.min(width, height))

/** Encuadra `b` dentro del rectángulo de pantalla (x, y, w, h) con `margin` por lado. */
function encuadrarEn(b: Bounds, x: number, y: number, w: number, h: number, margin: number, tope: number): Camera {
  const bw = Math.max(b.maxX - b.minX, 1)
  const bh = Math.max(b.maxY - b.minY, 1)
  const raw = Math.min((w - 2 * margin) / bw, (h - 2 * margin) / bh)
  const zoom = Math.min(tope, ZOOM_MAX, Math.max(ZOOM_MIN, raw))
  return { zoom, x: (b.minX + b.maxX) / 2 - (x + w / 2) / zoom, y: (b.minY + b.maxY) / 2 - (y + h / 2) / zoom }
}

// Con una milésima de píxel de tolerancia: el encuadre en una franja deja el dibujo justo en el borde del aire.
const E = 1e-3
const cruzan = (a: Bounds, b: Bounds) => a.minX < b.maxX - E && b.minX < a.maxX - E && a.minY < b.maxY - E && b.minY < a.maxY - E

/** Encuadre que deja libres las `reservas` (rectángulos tapados por la interfaz) con `margin` de aire. `tope`: zoom máximo
 * (la rueda no lo usa). `paso`: baja el zoom al múltiplo más alto que cabe; si ninguno cabe, queda el exacto. */
export function encuadrarConReservas(b: Bounds, width: number, height: number, margin: number, reservas: Bounds[] = [], tope: number = ZOOM_MAX, paso?: number): Camera {
  const c = encuadrarContinuo(b, width, height, margin, reservas, tope)
  if (!paso || paso <= 0) return c
  const q = Math.floor(c.zoom / paso + 1e-9) * paso
  if (q < paso || q >= c.zoom) return c
  // El centro del dibujo se queda en el mismo punto de la pantalla.
  const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2
  const sx = (cx - c.x) * c.zoom, sy = (cy - c.y) * c.zoom
  return { zoom: q, x: cx - sx / q, y: cy - sy / q }
}

function encuadrarContinuo(b: Bounds, width: number, height: number, margin: number, reservas: Bounds[], tope: number): Camera {
  const enPantalla = (c: Camera): Bounds => {
    const a = worldToScreen(c, b.minX, b.minY), z = worldToScreen(c, b.maxX, b.maxY)
    return { minX: a.x, minY: a.y, maxX: z.x, maxY: z.y }
  }
  const libre = (c: Camera) => {
    const s = enPantalla(c)
    // La reserva con su aire: el dibujo queda al menos `margin` lejos de ella.
    return reservas.every((r) => !cruzan(s, { minX: r.minX - margin, minY: r.minY - margin, maxX: r.maxX + margin, maxY: r.maxY + margin }))
  }
  const completo = encuadrarEn(b, 0, 0, width, height, margin, tope)
  if (libre(completo)) return completo
  let mejor: Camera | null = null
  for (const r of reservas) {
    const franjas: [number, number, number, number][] = [
      [0, 0, r.minX, height],
      [r.maxX, 0, width - r.maxX, height],
      [0, 0, width, r.minY],
      [0, r.maxY, width, height - r.maxY]
    ]
    for (const [x, y, w, h] of franjas) {
      if (w <= 2 * margin || h <= 2 * margin) continue
      const c = encuadrarEn(b, x, y, w, h, margin, tope)
      if (libre(c) && (!mejor || c.zoom > mejor.zoom)) mejor = c
    }
  }
  return mejor ?? completo
}

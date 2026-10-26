import { enOrden, estiloDe } from '../doc/figuras'
import type { Documento, Opacidad, Pieza, Punto, Tinta, TipoFigura } from '../doc/tipos'
import type { Caja } from '../piezas/tipos'

/** La caja de una pieza en el mundo, o null si no se sabe (sin definición). */
export type CajaDePieza = (p: Pieza) => Caja | null

export interface Encuadre {
  escala: number
  ox: number
  oy: number
}

export function encuadreMinimapa(c: Caja, ancho: number, alto: number, margen = 6): Encuadre {
  const w = Math.max(c.maxX - c.minX, 1), h = Math.max(c.maxY - c.minY, 1)
  const escala = Math.min((ancho - 2 * margen) / w, (alto - 2 * margen) / h)
  return { escala, ox: (ancho - w * escala) / 2 - c.minX * escala, oy: (alto - h * escala) / 2 - c.minY * escala }
}

export const aMinimapa = (e: Encuadre, p: Punto): Punto => ({ x: p.x * e.escala + e.ox, y: p.y * e.escala + e.oy })
export const deMinimapa = (e: Encuadre, p: Punto): Punto => ({ x: (p.x - e.ox) / e.escala, y: (p.y - e.oy) / e.escala })

export function unirCajas(a: Caja | null, b: Caja | null): Caja | null {
  if (!a) return b
  if (!b) return a
  return { minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY), maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY) }
}

/**
 * Caja del documento: cada pieza (`cajaDe`) o su posición ± margen, más puntos de cables, etiquetas, notas y figuras.
 */
export function cajaDeDocumento(doc: Documento, margen = 4, cajaDe?: CajaDePieza): Caja | null {
  let c: Caja | null = null
  const sumar = (minX: number, minY: number, maxX: number, maxY: number) => (c = unirCajas(c, { minX, minY, maxX, maxY }))
  for (const p of Object.values(doc.piezas)) {
    const k = cajaDe?.(p)
    if (k) sumar(k.minX, k.minY, k.maxX, k.maxY)
    else sumar(p.x - margen, p.y - margen, p.x + margen, p.y + margen)
  }
  for (const k of Object.values(doc.cables)) for (const pt of k.puntos) sumar(pt.x, pt.y, pt.x, pt.y)
  for (const e of Object.values(doc.etiquetas)) sumar(e.x, e.y, e.x, e.y)
  for (const n of Object.values(doc.notas)) sumar(n.x, n.y, n.x + n.ancho, n.y + 2)
  for (const f of Object.values(doc.figuras ?? {})) sumar(Math.min(f.x1, f.x2), Math.min(f.y1, f.y2), Math.max(f.x1, f.x2), Math.max(f.y1, f.y2))
  return c
}

/** Figuras que dibuja el minimapa, como mucho: las del frente (un `.kir` alterado puede traer miles). */
export const MAX_FIGURAS_MINIMAPA = 1000

/** Una figura en píxeles del minimapa: sus dos puntos (la caja del rectángulo y la elipse), su tinta y su opacidad. */
export interface FiguraMinimapa {
  tipo: TipoFigura
  tinta: Tinta
  opacidad: Opacidad
  x1: number
  y1: number
  x2: number
  y2: number
}

/** Las figuras del documento en el minimapa, del fondo al frente; pasado el tope, solo las del frente. */
export function figurasDelMinimapa(doc: Pick<Documento, 'figuras'>, e: Encuadre, max = MAX_FIGURAS_MINIMAPA): FiguraMinimapa[] {
  const todas = enOrden(doc)
  return todas.slice(Math.max(0, todas.length - max)).map((f) => {
    const { tinta, opacidad } = estiloDe(f)
    const a = aMinimapa(e, { x: f.x1, y: f.y1 }), b = aMinimapa(e, { x: f.x2, y: f.y2 })
    return { tipo: f.tipo, tinta, opacidad, x1: a.x, y1: a.y, x2: b.x, y2: b.y }
  })
}

/**
 * Respaldo del lienzo del minimapa en píxeles de dispositivo: 0 × 0 con la ventana oculta, para liberar memoria.
 */
export function respaldoMinimapa(visible: boolean, ancho: number, alto: number, dpr: number): { w: number; h: number } {
  return visible ? { w: Math.round(ancho * dpr), h: Math.round(alto * dpr) } : { w: 0, h: 0 }
}

/** Pone el tamaño solo si cambió: asignar `width` aunque sea el mismo valor reasigna el respaldo y lo borra. Devuelve si cambió. */
export function ponerRespaldo(lienzo: { width: number; height: number }, r: { w: number; h: number }): boolean {
  if (lienzo.width === r.w && lienzo.height === r.h) return false
  lienzo.width = r.w
  lienzo.height = r.h
  return true
}

/** Si el minimapa se muestra: solo cuando hay algo que ubicar y no todo el circuito cabe en la vista. */
export function minimapaVisible(caja: Caja | null, vista: Caja): boolean {
  if (!caja) return false
  const cabe = caja.minX >= vista.minX && caja.minY >= vista.minY && caja.maxX <= vista.maxX && caja.maxY <= vista.maxY
  return !cabe
}

/** La caja de una pieza en píxeles del minimapa, con un tamaño mínimo (una resistencia no puede quedar en un punto). */
export function rectDeCaja(e: Encuadre, c: Caja, minimo = 3): { x: number; y: number; ancho: number; alto: number } {
  const a = aMinimapa(e, { x: c.minX, y: c.minY }), b = aMinimapa(e, { x: c.maxX, y: c.maxY })
  const ancho = Math.max(minimo, b.x - a.x), alto = Math.max(minimo, b.y - a.y)
  return { x: (a.x + b.x) / 2 - ancho / 2, y: (a.y + b.y) / 2 - alto / 2, ancho, alto }
}

/** Cables que dibuja el minimapa, como mucho (un `.kir` alterado puede traer miles). */
export const MAX_CABLES_MINIMAPA = 3000

/** Los cables del documento como polilíneas en píxeles del minimapa; pasado el tope, los primeros. */
export function cablesDelMinimapa(doc: Pick<Documento, 'cables'>, e: Encuadre, max = MAX_CABLES_MINIMAPA): Punto[][] {
  const out: Punto[][] = []
  for (const k of Object.values(doc.cables)) {
    if (out.length >= max) break
    if (k.puntos.length >= 2) out.push(k.puntos.map((p) => aMinimapa(e, p)))
  }
  return out
}

/**
 * Encuadre del minimapa: el del circuito y, si la vista se salió, también la vista. Al arrastrar se usa el `congelado`, porque la escala no puede seguir cada salto.
 */
export function encuadreConVista(caja: Caja | null, vista: Caja, ancho: number, alto: number, congelado: Encuadre | null): Encuadre {
  if (congelado) return congelado
  return encuadreMinimapa(caja ? unirCajas(caja, vista)! : vista, ancho, alto)
}

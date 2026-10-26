import type { Geometria } from './dibujo'
import type { VistaGrafica } from './modelo'
import { acotar, desplazar, deValor, indiceCursorCercano, zoomCaja, zoomEn, type Dominio, type Escala } from './vista'

/**
 * Gestos sobre una gráfica sin DOM: de un punto del lienzo (px de dispositivo) a cursor, panel o zoom. El componente solo traduce eventos.
 */

/** Cuánto acerca una muesca de la rueda. */
export const FACTOR_RUEDA = 0.8
/** Una caja de menos de este tamaño (px CSS) es un clic y no un zoom. */
export const CAJA_MINIMA = 6

export function panelEn(g: Geometria, _x: number, y: number): number | null {
  const i = g.paneles.findIndex((p) => y >= p.y0 && y < p.y0 + p.alto)
  return i < 0 ? null : i
}

/** Dos cursores iniciales: a un cuarto y tres cuartos de lo que se ve (en log, a la misma distancia en décadas). */
export function cursoresIniciales(g: Geometria): [number, number] {
  const col = g.paneles[0].col
  return [deValor(col.x + 0.25 * col.w, g.x, g.escalaX, col.x, col.x + col.w), deValor(col.x + 0.75 * col.w, g.x, g.escalaX, col.x, col.x + col.w)]
}

/** El cursor (0 o 1) a `radioCss` px o menos del puntero, mirando el eje horizontal de cualquier panel. */
export function cursorBajo(g: Geometria, v: VistaGrafica, x: number, y: number, radioCss: number): 0 | 1 | null {
  if (!v.cursores) return null
  const p = panelEn(g, x, y)
  if (p === null) return null
  const col = g.paneles[p].col
  if (y - g.paneles[p].y0 < col.y - 6 * g.dpr || y - g.paneles[p].y0 > col.y + col.h + 6 * g.dpr) return null
  return indiceCursorCercano(v.cursores, x, g.x, g.escalaX, col.x, col.x + col.w, radioCss * g.dpr)
}

/** El valor del eje horizontal en el píxel `x` (acotado a lo que se ve). */
export function xDePixel(g: Geometria, x: number): number {
  const col = g.paneles[0].col
  const px = Math.max(col.x, Math.min(col.x + col.w, x))
  return deValor(px, g.x, g.escalaX, col.x, col.x + col.w)
}

export function ponerCursorEn(g: Geometria, v: VistaGrafica, i: 0 | 1, x: number): VistaGrafica {
  if (!v.cursores) return v
  const nuevo: [number, number] = i === 0 ? [xDePixel(g, x), v.cursores[1]] : [v.cursores[0], xDePixel(g, x)]
  return { ...v, cursores: nuevo }
}

const conY = (v: VistaGrafica, p: number, f: [number, number] | null): VistaGrafica => {
  const y = [...v.y]
  while (y.length <= p) y.push(null)
  y[p] = f
  return { ...v, y }
}

/**
 * Rueda: acerca (`dir` −1) o aleja (1) el eje horizontal alrededor del puntero (con `vertical`, el del panel). `limite` es el tramo completo: alejar nunca lo pasa.
 */
export function zoomRueda(g: Geometria, v: VistaGrafica, x: number, y: number, dir: 1 | -1, vertical: boolean, limite: Dominio = g.x): VistaGrafica {
  const p = panelEn(g, x, y)
  if (p === null) return v
  const pan = g.paneles[p]
  const col = pan.col
  const factor = dir < 0 ? FACTOR_RUEDA : 1 / FACTOR_RUEDA
  if (vertical) {
    const f = v.y[p] ?? [0, 1]
    const cy = 1 - Math.max(0, Math.min(1, (y - pan.y0 - col.y) / col.h))
    const acotado = acotar(zoomEn({ min: f[0], max: f[1] }, 'lin', cy, factor), { min: 0, max: 1 }, 'lin')
    return conY(v, p, acotado.min <= 1e-9 && acotado.max >= 1 - 1e-9 ? null : [acotado.min, acotado.max])
  }
  const c = Math.max(0, Math.min(1, (x - col.x) / col.w))
  const nuevo = acotar(zoomEn(g.x, g.escalaX, c, factor), limite, g.escalaX)
  const completo = nuevo.min <= limite.min * (1 + 1e-12) && nuevo.max >= limite.max * (1 - 1e-12)
  return { ...v, x: completo ? null : nuevo }
}

/** Fracción del ancho visible que mueve Ctrl + flecha. */
export const PASO_DESPLAZAR = 0.2

/** Teclas + y −: acerca (`dir` −1) o aleja (1) el eje horizontal alrededor del centro de lo que se ve. */
export function zoomTeclado(g: Geometria, v: VistaGrafica, dir: 1 | -1, limite: Dominio = g.x): VistaGrafica {
  const nuevo = acotar(zoomEn(g.x, g.escalaX, 0.5, dir < 0 ? FACTOR_RUEDA : 1 / FACTOR_RUEDA), limite, g.escalaX)
  const completo = nuevo.min <= limite.min * (1 + 1e-12) && nuevo.max >= limite.max * (1 - 1e-12)
  return { ...v, x: completo ? null : nuevo }
}

/** Ctrl + flechas: mueve la ventana (`dir` −1 a la izquierda, 1 a la derecha) sin salirse de los datos. Sin acercar no hay a dónde ir. */
export function desplazarTeclado(g: Geometria, v: VistaGrafica, dir: 1 | -1, limite: Dominio = g.x): VistaGrafica {
  if (!v.x) return v
  const nuevo = acotar(desplazar(g.x, g.escalaX, dir * PASO_DESPLAZAR), limite, g.escalaX)
  return { ...v, x: nuevo }
}

/** Una caja arrastrada de (x0, y0) a (x1, y1) en el panel `p`: fija ambos ejes. Una caja diminuta devuelve la misma vista. */
export function zoomCajaEn(g: Geometria, v: VistaGrafica, p: number, x0: number, y0: number, x1: number, y1: number): VistaGrafica {
  const pan = g.paneles[p]
  const col = pan.col
  if (Math.abs(x1 - x0) < CAJA_MINIMA * g.dpr && Math.abs(y1 - y0) < CAJA_MINIMA * g.dpr) return v
  const fx = (px: number) => Math.max(0, Math.min(1, (px - col.x) / col.w))
  const fy = (py: number) => 1 - Math.max(0, Math.min(1, (py - pan.y0 - col.y) / col.h))
  let sig = v
  if (Math.abs(x1 - x0) >= CAJA_MINIMA * g.dpr) {
    const nuevo = zoomCaja(g.x, g.escalaX, fx(x0), fx(x1))
    sig = { ...sig, x: nuevo }
  }
  if (Math.abs(y1 - y0) >= CAJA_MINIMA * g.dpr) {
    const f = v.y[p] ?? [0, 1]
    const a = f[0] + fy(y0) * (f[1] - f[0])
    const b = f[0] + fy(y1) * (f[1] - f[0])
    sig = conY(sig, p, [Math.min(a, b), Math.max(a, b)])
  }
  return sig
}

// ---------- Botones de zoom y desplazamiento ----------

export type EjeZoom = 'ambos' | 'x' | 'y'
/** Cuánto acerca un clic del botón + (y lo que aleja −). */
export const FACTOR_BOTON = 0.7
/** Fracción de lo que se ve que mueve un clic de las flechas. */
export const PASO_BOTON = 0.25
/** Cuántas veces más chico que los datos puede quedar lo que se ve con los botones. */
export const ZOOM_MAXIMO = 1000

const ancho = (d: Dominio, e: Escala): number => (e === 'log' ? Math.log10(d.max) - Math.log10(d.min) : d.max - d.min)
const ampliacion = (limite: Dominio, d: Dominio, e: Escala): number => ancho(limite, e) / Math.max(1e-300, ancho(d, e))

/** Acerca (`dir` −1) o aleja (1) la vista desde el centro de lo que se ve: el eje horizontal, el vertical de cada panel o los dos. */
export function zoomBoton(g: Geometria, v: VistaGrafica, dir: 1 | -1, eje: EjeZoom, limite: Dominio = g.x): VistaGrafica {
  const factor = dir < 0 ? FACTOR_BOTON : 1 / FACTOR_BOTON
  let sig = v
  if (eje !== 'y') {
    const nuevo = acotar(zoomEn(g.x, g.escalaX, 0.5, factor), limite, g.escalaX)
    const completo = nuevo.min <= limite.min * (1 + 1e-12) && nuevo.max >= limite.max * (1 - 1e-12)
    if (completo) sig = { ...sig, x: null }
    else if (ampliacion(limite, nuevo, g.escalaX) <= ZOOM_MAXIMO) sig = { ...sig, x: nuevo }
  }
  if (eje !== 'x') {
    const y = [...v.y]
    for (let p = 0; p < g.paneles.length; p++) {
      const f = v.y[p] ?? [0, 1]
      const nuevo = acotar(zoomEn({ min: f[0], max: f[1] }, 'lin', 0.5, factor), { min: 0, max: 1 }, 'lin')
      while (y.length <= p) y.push(null)
      if (nuevo.min <= 1e-9 && nuevo.max >= 1 - 1e-9) y[p] = null
      else if (ampliacion({ min: 0, max: 1 }, nuevo, 'lin') <= ZOOM_MAXIMO) y[p] = [nuevo.min, nuevo.max]
    }
    sig = { ...sig, y }
  }
  return sig
}

/** Qué ejes tienen a dónde desplazarse: solo los que están acercados. */
export function puedeDesplazar(v: VistaGrafica): { x: boolean; y: boolean } {
  return { x: v.x !== null, y: v.y.some((f) => f !== null) }
}

/** Las flechas: `dx` −1 izquierda, 1 derecha; `dy` −1 abajo, 1 arriba. Lo que no está acercado no se mueve. */
export function desplazarBoton(g: Geometria, v: VistaGrafica, dx: -1 | 0 | 1, dy: -1 | 0 | 1, limite: Dominio = g.x): VistaGrafica {
  const puede = puedeDesplazar(v)
  let sig = v
  if (dx !== 0 && puede.x) sig = { ...sig, x: acotar(desplazar(g.x, g.escalaX, dx * PASO_BOTON), limite, g.escalaX) }
  if (dy !== 0 && puede.y) {
    const y = v.y.map((f) => (f ? ((d) => [d.min, d.max] as [number, number])(acotar(desplazar({ min: f[0], max: f[1] }, 'lin', dy * PASO_BOTON), { min: 0, max: 1 }, 'lin')) : f))
    sig = { ...sig, y }
  }
  return sig
}

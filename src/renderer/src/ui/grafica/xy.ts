/** Lectura y cursores de una gráfica X-Y: puntos de la curva (no valores del eje x) con su pendiente. Sin DOM, en píxeles de dispositivo. */
import { avanzarEnCurva, pendiente, puntoMasCercano, type Curva, type PuntoCurva } from '../../../../compartido/grafica/curva'
import { valorEnPrefijo } from '../../../../compartido/grafica/ejes'
import { textoMarca } from '../../../../compartido/grafica/ticks'
import type { Geometria } from './dibujo'
import type { LecturaEn } from './lectura'
import type { ModeloGrafica, VistaGrafica } from './modelo'
import { aPixel } from './vista'

interface Visible {
  /** Posición en `m.trazas`. */
  i: number
  curva: Curva
}

const visibles = (m: ModeloGrafica, v: VistaGrafica): Visible[] => m.trazas.flatMap((t, i) => (v.ocultas.has(t.clave) ? [] : [{ i, curva: { x: t.x, y: t.y } }]))

/** De un punto de datos de la traza `i` a píxeles del lienzo; null si su eje no se dibuja. */
function conversor(m: ModeloGrafica, g: Geometria, i: number): ((x: number, y: number) => [number, number]) | null {
  const pan = g.paneles[Math.min(g.paneles.length - 1, m.trazas[i].panel)]
  const gr = pan.grupos.find((k) => k.trazas.includes(i))
  if (!gr) return null
  return (x, y) => [aPixel(x, g.x, 'lin', pan.col.x, pan.col.x + pan.col.w), pan.y0 + aPixel(y, gr.dominio, 'lin', pan.col.y + pan.col.h, pan.col.y)]
}

function cercano(m: ModeloGrafica, v: VistaGrafica, g: Geometria, px: number, py: number): (PuntoCurva & { traza: number }) | null {
  const vis = visibles(m, v)
  const conv = vis.map((q) => conversor(m, g, q.i))
  const p = puntoMasCercano(vis.map((q) => q.curva), (x, y, k) => conv[k]?.(x, y) ?? [Number.NaN, Number.NaN], px, py)
  return p ? { ...p, traza: vis[p.curva].i } : null
}

/** La lectura bajo el puntero: el punto de la curva más cercano en pantalla, con su x y su y. */
export function lecturaXY(m: ModeloGrafica, v: VistaGrafica, g: Geometria, px: number, py: number): LecturaEn | null {
  const p = cercano(m, v, g, px, py)
  const conv = p && conversor(m, g, p.traza)
  if (!p || !conv) return null
  const t = m.trazas[p.traza]
  const pan = g.paneles[Math.min(g.paneles.length - 1, t.panel)]
  const gr = pan.grupos.find((k) => k.trazas.includes(p.traza))!
  const [xPx, yPx] = conv(p.x, p.y)
  const r = g.rotuloX
  const xTexto = r.compacto ? textoMarca(p.x, r.unidad) : `${valorEnPrefijo(p.x, r.prefijo)} ${r.unidad}`.trim()
  return {
    xPx,
    encabezado: `${m.ejeX.nombre || 'x'} = ${xTexto}`,
    filas: [{ clave: t.clave, etiqueta: t.etiqueta, tono: t.tono, panel: t.panel, yPx, valor: p.y, texto: `${valorEnPrefijo(p.y, gr.prefijo)} ${gr.unidadMostrada}`.trim() }]
  }
}

/** Los dos cursores iniciales: sobre la primera traza visible, a un cuarto y tres cuartos de su recorrido. */
export function cursoresInicialesXY(m: ModeloGrafica, v: VistaGrafica): Pick<VistaGrafica, 'cursores' | 'cursoresY'> {
  const q = visibles(m, v)[0]
  const n = q ? Math.min(q.curva.x.length, q.curva.y.length) : 0
  const en = (f: number): { x: number; y: number } | null => {
    for (let k = Math.round(f * (n - 1)); k < n; k++) if (Number.isFinite(q.curva.x[k]) && Number.isFinite(q.curva.y[k])) return { x: q.curva.x[k], y: q.curva.y[k] }
    return null
  }
  const a = en(0.25)
  const b = en(0.75)
  return a && b ? { cursores: [a.x, b.x], cursoresY: [a.y, b.y] } : { cursores: null, cursoresY: null }
}

/** El píxel del cursor `i` (en el lienzo), o null sin cursores o sin eje que lo dibuje. */
export function pixelCursorXY(m: ModeloGrafica, v: VistaGrafica, g: Geometria, i: 0 | 1): { x: number; y: number } | null {
  if (!v.cursores || !v.cursoresY) return null
  const q = visibles(m, v)[0]
  const conv = q && conversor(m, g, q.i)
  if (!conv) return null
  const [x, y] = conv(v.cursores[i], v.cursoresY[i])
  return { x, y }
}

/** El cursor (0 o 1) a `radio` px o menos del puntero; el más cercano si hay dos. */
export function cursorXYBajo(m: ModeloGrafica, v: VistaGrafica, g: Geometria, px: number, py: number, radio: number): 0 | 1 | null {
  let mejor: 0 | 1 | null = null
  let dist = Infinity
  for (const i of [0, 1] as const) {
    const c = pixelCursorXY(m, v, g, i)
    const d = c ? Math.hypot(c.x - px, c.y - py) : Infinity
    if (d <= radio && d < dist) [mejor, dist] = [i, d]
  }
  return mejor
}

/** El cursor `i` en el punto de la curva más cercano al puntero. */
export function ponerCursorXY(m: ModeloGrafica, v: VistaGrafica, g: Geometria, i: 0 | 1, px: number, py: number): VistaGrafica {
  const p = cercano(m, v, g, px, py)
  if (!p || !v.cursores || !v.cursoresY) return v
  const x: [number, number] = [v.cursores[0], v.cursores[1]]
  const y: [number, number] = [v.cursoresY[0], v.cursoresY[1]]
  x[i] = p.x
  y[i] = p.y
  return { ...v, cursores: x, cursoresY: y }
}

/** El cursor `i` `pasos` vértices adelante (o atrás) a lo largo de la curva en que está. */
export function moverCursorXY(m: ModeloGrafica, v: VistaGrafica, g: Geometria, i: 0 | 1, pasos: number): VistaGrafica {
  const c = pixelCursorXY(m, v, g, i)
  if (!c) return v
  const p = cercano(m, v, g, c.x, c.y)
  const nuevo = p && avanzarEnCurva({ x: m.trazas[p.traza].x, y: m.trazas[p.traza].y }, p, pasos)
  if (!nuevo) return v
  const x: [number, number] = [v.cursores![0], v.cursores![1]]
  const y: [number, number] = [v.cursoresY![0], v.cursoresY![1]]
  x[i] = nuevo.x
  y[i] = nuevo.y
  return { ...v, cursores: x, cursoresY: y }
}

/** Cuántos vértices recorre un uno por ciento de la curva (para las flechas). */
export function pasoDeFlechaXY(m: ModeloGrafica, v: VistaGrafica): number {
  const q = visibles(m, v)[0]
  return q ? Math.max(1, Math.round(q.curva.x.length / 100)) : 1
}

/** La lectura de los dos cursores: Δx, Δy y la pendiente (con los dos puntos en el detalle). */
export function lineasDeCursoresXY(m: ModeloGrafica, v: VistaGrafica, detalle: boolean): string[] {
  if (!v.cursores || !v.cursoresY) return []
  const q = visibles(m, v)[0]
  if (!q) return []
  const ux = m.ejeX.unidad
  const uy = m.trazas[q.i].unidad
  const a = { x: v.cursores[0], y: v.cursoresY[0] }
  const b = { x: v.cursores[1], y: v.cursoresY[1] }
  const nx = m.ejeX.nombre || 'x'
  const ny = m.trazas[q.i].etiqueta
  const s = pendiente(a, b)
  // Con la misma unidad arriba y abajo (la ganancia de Vout contra Vin) la pendiente es un número sin unidad.
  const unidadS = ux === uy ? '' : ux && uy ? `${uy}/${ux}` : uy || (ux ? `1/${ux}` : '')
  return [
    ...(detalle ? [`1: ${nx} ${textoMarca(a.x, ux)}, ${ny} ${textoMarca(a.y, uy)}`, `2: ${nx} ${textoMarca(b.x, ux)}, ${ny} ${textoMarca(b.y, uy)}`] : []),
    `Δ${nx} ${textoMarca(b.x - a.x, ux)}`,
    `Δ${ny} ${textoMarca(b.y - a.y, uy)}`,
    `Pendiente ${s === null ? 'sin dato' : textoMarca(s, unidadS)}`
  ]
}

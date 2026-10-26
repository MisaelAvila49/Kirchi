import type { Anotaciones, NotaEtiqueta, NotaFlecha, NotaTexto } from '../../../../../compartido/grafica/anotaciones'
import { cajaDeEtiqueta, medirMono, puntoDeValor, textoDeEtiqueta, type Medir, type PuntoElegido } from './etiquetas'
import { dentro, distanciaASegmento, type GeometriaFigura, type Rect, type TrazaGeom } from './geometria'

/** Lo que se puede elegir en la vista previa de exportar. */
export type TipoObjeto = 'texto' | 'flecha' | 'etiqueta' | 'traza' | 'eje' | 'fijo'
export interface Seleccion {
  tipo: TipoObjeto
  /** El nombre de la nota, la clave de la traza, `eje:x` / `eje:<traza>` o `titulo` / `subtitulo`. */
  id: string
}

export const mismaSeleccion = (a: Seleccion | null, b: Seleccion | null): boolean => (a === null || b === null ? a === b : a.tipo === b.tipo && a.id === b.id)

/** Qué tan cerca (px de la figura) tiene que estar el puntero de una línea para tomarla. */
export const TOLERANCIA = 6

/** El recuadro de un texto puesto a mano. */
export function cajaDeTexto(n: Pick<NotaTexto, 'texto' | 'fx' | 'fy' | 'tam' | 'negrita'>, geo: Pick<GeometriaFigura, 'ancho' | 'alto'>, medir: Medir): Rect {
  const w = medir(n.texto, n.tam, n.negrita)
  return { x: n.fx * geo.ancho, y: n.fy * geo.alto - n.tam * 0.65, w, h: n.tam * 1.3 }
}

export function extremosDeFlecha(f: NotaFlecha, geo: Pick<GeometriaFigura, 'ancho' | 'alto'>): [number, number, number, number] {
  return [f.x1 * geo.ancho, f.y1 * geo.alto, f.x2 * geo.ancho, f.y2 * geo.alto]
}

export interface EtiquetaResuelta {
  nota: NotaEtiqueta
  traza: TrazaGeom
  punto: PuntoElegido
  renglones: [string, string]
  caja: Rect
}

/** Una etiqueta guardada puesta sobre su traza: el punto, sus renglones y el recuadro del globo; null si su traza ya no está. */
export function resolverEtiqueta(e: NotaEtiqueta, geo: Pick<GeometriaFigura, 'trazas'>, medir: Medir): EtiquetaResuelta | null {
  const traza = geo.trazas.find((t) => t.id === e.traza)
  if (!traza) return null
  const punto = puntoDeValor(traza, e.x)
  if (!punto) return null
  const renglones = textoDeEtiqueta(traza, punto.x, punto.y)
  return { nota: e, traza, punto, renglones, caja: cajaDeEtiqueta(e, punto, renglones, medir) }
}

/** La traza bajo el puntero (a menos de `tol` px de alguno de sus tramos). */
export function trazaEn(geo: Pick<GeometriaFigura, 'trazas'>, x: number, y: number, tol = TOLERANCIA): TrazaGeom | null {
  let mejor: TrazaGeom | null = null
  let dMejor = tol
  for (const t of geo.trazas) {
    const n = t.px.length
    if (n === 0) continue
    // Primer punto con px >= x - tol: desde ahí hasta que la traza ya queda a más de tol a la derecha.
    let lo = 0
    let hi = n
    while (lo < hi) {
      const m = (lo + hi) >> 1
      if (t.px[m] < x - tol) lo = m + 1
      else hi = m
    }
    for (let i = Math.max(0, lo - 1); i < n; i++) {
      if (i > 0 && t.px[i - 1] > x + tol) break
      const d = i === 0 ? Math.hypot(t.px[0] - x, t.py[0] - y) : distanciaASegmento(x, y, t.px[i - 1], t.py[i - 1], t.px[i], t.py[i])
      if (d <= dMejor) {
        dMejor = d
        mejor = t
      }
    }
  }
  return mejor
}

export interface EntradaToque {
  geo: GeometriaFigura
  anot: Anotaciones
  medir: Medir
  /** El puntero en px de la figura. */
  x: number
  y: number
  tol?: number
}

/** Lo que hay bajo el puntero, de lo más fino a lo más ancho. Nada si cae en el fondo de la figura. */
export function objetoEn(e: EntradaToque): Seleccion | null {
  const tol = e.tol ?? TOLERANCIA
  const { geo, anot, x, y } = e
  for (const n of [...anot.etiquetas].reverse()) {
    const r = resolverEtiqueta(n, geo, medirMono)
    if (r && (dentro(r.caja, x, y) || Math.hypot(r.punto.px - x, r.punto.py - y) <= tol)) return { tipo: 'etiqueta', id: n.id }
  }
  for (const f of [...anot.flechas].reverse()) {
    const [x1, y1, x2, y2] = extremosDeFlecha(f, geo)
    if (distanciaASegmento(x, y, x1, y1, x2, y2) <= Math.max(tol, f.grosor / 2 + 3)) return { tipo: 'flecha', id: f.id }
  }
  for (const n of [...anot.textos].reverse()) if (dentro(cajaDeTexto(n, geo, e.medir), x, y, 2)) return { tipo: 'texto', id: n.id }
  for (const o of geo.objetos) if (o.tipo === 'fijo' && dentro(o.rect, x, y)) return { tipo: 'fijo', id: o.id }
  const t = trazaEn(geo, x, y, tol)
  if (t) return { tipo: 'traza', id: t.id }
  for (const o of geo.objetos) if (o.tipo === 'eje' && dentro(o.rect, x, y)) return { tipo: 'eje', id: o.id }
  return null
}

/** El recuadro con que se resalta un objeto elegido. */
export function cajaDeSeleccion(s: Seleccion, geo: GeometriaFigura, anot: Anotaciones, medir: Medir): Rect | null {
  if (s.tipo === 'texto') {
    const n = anot.textos.find((t) => t.id === s.id)
    return n ? cajaDeTexto(n, geo, medir) : null
  }
  if (s.tipo === 'flecha') {
    const f = anot.flechas.find((q) => q.id === s.id)
    if (!f) return null
    const [x1, y1, x2, y2] = extremosDeFlecha(f, geo)
    return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) }
  }
  if (s.tipo === 'etiqueta') {
    const n = anot.etiquetas.find((q) => q.id === s.id)
    return n ? (resolverEtiqueta(n, geo, medirMono)?.caja ?? null) : null
  }
  if (s.tipo === 'traza') {
    const t = geo.trazas.find((q) => q.id === s.id)
    if (!t || t.px.length === 0) return null
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity
    for (let i = 0; i < t.px.length; i++) {
      x0 = Math.min(x0, t.px[i])
      x1 = Math.max(x1, t.px[i])
      y0 = Math.min(y0, t.py[i])
      y1 = Math.max(y1, t.py[i])
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
  }
  return geo.objetos.find((o) => o.id === s.id)?.rect ?? null
}

export interface ItemObjeto {
  sel: Seleccion
  etiqueta: string
}

/** Todo lo que se puede elegir en la figura, en una lista con nombres: es la forma de elegir con teclado o lector de pantalla. */
export function listaDeObjetos(geo: Pick<GeometriaFigura, 'objetos' | 'trazas'>, anot: Anotaciones): ItemObjeto[] {
  const corto = (t: string) => (t.length > 24 ? `${t.slice(0, 23)}…` : t)
  return [
    ...geo.objetos.filter((o) => o.tipo === 'fijo').map((o) => ({ sel: { tipo: 'fijo' as const, id: o.id }, etiqueta: o.etiqueta })),
    ...geo.objetos.filter((o) => o.tipo === 'eje').map((o) => ({ sel: { tipo: 'eje' as const, id: o.id }, etiqueta: o.etiqueta })),
    ...geo.trazas.map((t) => ({ sel: { tipo: 'traza' as const, id: t.id }, etiqueta: `Traza ${t.etiqueta}` })),
    ...anot.textos.map((t) => ({ sel: { tipo: 'texto' as const, id: t.id }, etiqueta: `Texto «${corto(t.texto)}»` })),
    ...anot.flechas.map((f, i) => ({ sel: { tipo: 'flecha' as const, id: f.id }, etiqueta: `Flecha ${i + 1}` })),
    ...anot.etiquetas.map((q, i) => ({ sel: { tipo: 'etiqueta' as const, id: q.id }, etiqueta: `Valor ${i + 1} de ${geo.trazas.find((t) => t.id === q.traza)?.etiqueta ?? q.traza}` }))
  ]
}

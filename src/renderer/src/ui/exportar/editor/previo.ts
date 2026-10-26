import { formatearSI } from '../../../valores/valores'
import { deValor } from '../../grafica/vista'
import type { EjeDeFigura } from '../../osciloscopio/figura'
import { puntoGlobal, textoDeEtiqueta } from './etiquetas'
import type { GeometriaFigura } from './geometria'

/**
 * Vista previa sin DOM (px de la figura) de lo que se coloca: tramo en dos tiempos, guía, flecha y etiqueta de valor.
 */
export interface GestoRango {
  tipo: 'rango'
  a: number
  b: number
  /** El primer extremo quedó puesto con un clic (sin arrastrar): el siguiente clic pone el segundo. */
  fijado: boolean
}

/** Lo que un gesto de tramo pide al editor al terminar. */
export interface PasoRango {
  gesto: GestoRango | null
  /** Los dos extremos elegidos, en px de la figura y ordenados, cuando el tramo se completa. */
  aplicar?: [number, number]
}

/** Lo más corto (px de pantalla) que cuenta como tramo; menos es un clic. */
export const MINIMO_TRAMO_PX = 8

const termina = (g: GestoRango, k: number, b: number): PasoRango =>
  Math.abs(b - g.a) * k >= MINIMO_TRAMO_PX ? { gesto: null, aplicar: [Math.min(g.a, b), Math.max(g.a, b)] } : { gesto: null }

/** El gesto de tramo al presionar en `fx` (`k` es el aumento de la vista). */
export function rangoAlBajar(g: GestoRango | null, fx: number, k: number): PasoRango {
  if (g?.fijado) return termina(g, k, fx)
  return { gesto: { tipo: 'rango', a: fx, b: fx, fijado: false } }
}

/** El gesto de tramo al mover el puntero: el segundo extremo sigue al ratón. */
export const rangoAlMover = (g: GestoRango, fx: number): GestoRango => ({ ...g, b: fx })

/** Al soltar: si se arrastró lo bastante, el tramo está listo; si fue un clic, el primer extremo queda fijo y espera el segundo. */
export function rangoAlSubir(g: GestoRango, k: number): PasoRango {
  if (g.fijado) return { gesto: g }
  if (Math.abs(g.b - g.a) * k >= MINIMO_TRAMO_PX) return termina(g, k, g.b)
  return { gesto: { ...g, fijado: true } }
}

export type Previo =
  | { tipo: 'guia'; fx: number; texto: string }
  | { tipo: 'tramo'; desde: number; hasta: number; textoDesde: string; textoHasta: string }
  | { tipo: 'flecha'; x1: number; y1: number; x2: number; y2: number; fantasma: boolean }
  | { tipo: 'etiqueta'; px: number; py: number; renglones: [string, string] }
  | null

export interface EntradaPrevio {
  herramienta: string
  gesto: { tipo: string } | null
  /** El puntero sobre la figura (px de la figura), o null si no está encima. */
  cursor: readonly [number, number] | null
  geo: GeometriaFigura | null
  eje?: EjeDeFigura | null
  /** Distancia máxima a una traza, en px de la figura. */
  radio?: number
}

/** El valor del eje en la columna `fx` de la figura, con su unidad y contado desde el principio de lo capturado. */
export function textoDeColumna(eje: EjeDeFigura | null | undefined, fx: number): string {
  if (!eje) return ''
  const m = eje.mapa
  return formatearSI(deValor(fx, m.dom, m.escala, m.px0, m.px1) - (eje.origen ?? 0), eje.unidad)
}

/** Lo más lejos de una traza (px de la figura) donde la etiqueta de valor se puede poner y se ve su fantasma. */
export const RADIO_ETIQUETA = 28

export function previoDe(e: EntradaPrevio): Previo {
  const g = e.gesto as ({ tipo: string } & Partial<GestoRango> & { x1?: number; y1?: number; x2?: number; y2?: number }) | null
  if (g?.tipo === 'rango') {
    const a = g.a as number
    const b = g.b as number
    return { tipo: 'tramo', desde: Math.min(a, b), hasta: Math.max(a, b), textoDesde: textoDeColumna(e.eje, Math.min(a, b)), textoHasta: textoDeColumna(e.eje, Math.max(a, b)) }
  }
  if (g?.tipo === 'flecha') return { tipo: 'flecha', x1: g.x1 as number, y1: g.y1 as number, x2: g.x2 as number, y2: g.y2 as number, fantasma: false }
  if (g || !e.cursor) return null
  const [fx, fy] = e.cursor
  if (e.herramienta === 'rango') {
    const area = e.geo?.area
    if (area && (fx < area.x || fx > area.x + area.w)) return null
    return { tipo: 'guia', fx, texto: textoDeColumna(e.eje, fx) }
  }
  if (e.herramienta === 'etiqueta' && e.geo) {
    const r = puntoGlobal(e.geo.trazas, fx, fy)
    return r && r.punto.d <= (e.radio ?? RADIO_ETIQUETA) ? { tipo: 'etiqueta', px: r.punto.px, py: r.punto.py, renglones: textoDeEtiqueta(r.traza, r.punto.x, r.punto.y) } : null
  }
  return null
}

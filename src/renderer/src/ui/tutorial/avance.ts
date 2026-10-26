import type { AvanceCapitulo } from '../../../../compartido/ajustes'
import type { CapituloDef } from './tipos'

export type EstadoCapitulo = 'hecho' | 'curso' | 'nuevo' | 'pronto'

export interface ResumenCapitulo {
  estado: EstadoCapitulo
  /** Pasos ya hechos (el paso en que va). */
  paso: number
  total: number
  /** Lo que dice el selector: «Hecho», «En curso: 2 de 6», «Sin empezar» o «Próximamente». */
  etiqueta: string
  /** El botón del selector; null mientras el capítulo no existe. */
  accion: 'Repetir' | 'Continuar' | 'Empezar' | null
  /** Proporción 0..1 para la barra de avance del selector. */
  fraccion: number
}

/** Cómo va un capítulo según el avance guardado. Un avance fuera de rango se acota a los pasos del capítulo. */
export function resumenDeCapitulo(c: CapituloDef, avance: Readonly<Record<string, AvanceCapitulo>>): ResumenCapitulo {
  const total = c.pasos.length || c.totalPasos
  if (c.pasos.length === 0) return { estado: 'pronto', paso: 0, total, etiqueta: 'Próximamente', accion: null, fraccion: 0 }
  const a = Object.hasOwn(avance, c.id) ? avance[c.id] : undefined
  const paso = Math.max(0, Math.min(a?.paso ?? 0, total))
  if (a?.hecho) return { estado: 'hecho', paso: total, total, etiqueta: 'Hecho', accion: 'Repetir', fraccion: 1 }
  if (paso > 0) return { estado: 'curso', paso, total, etiqueta: `En curso: ${paso} de ${total}`, accion: 'Continuar', fraccion: paso / total }
  return { estado: 'nuevo', paso: 0, total, etiqueta: 'Sin empezar', accion: 'Empezar', fraccion: 0 }
}

/** El avance con el paso (y si ya está hecho) de un capítulo cambiados; no modifica el original. */
export function conAvance(avance: Readonly<Record<string, AvanceCapitulo>>, id: string, parche: Partial<AvanceCapitulo>): Record<string, AvanceCapitulo> {
  const actual = Object.hasOwn(avance, id) ? avance[id] : { paso: 0, hecho: false }
  return { ...avance, [id]: { ...actual, ...parche } }
}

/** Primer capítulo con pasos que todavía no se termina (el que la oferta del primer arranque propone), o undefined. */
export function siguienteCapitulo(capitulos: readonly CapituloDef[], avance: Readonly<Record<string, AvanceCapitulo>>): CapituloDef | undefined {
  return capitulos.find((c) => c.pasos.length > 0 && resumenDeCapitulo(c, avance).estado !== 'hecho')
}

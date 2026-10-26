import { validarAnalisis, MAX_ANALISIS, type AnalisisDoc } from '../../../compartido/analisis/config'
import { limpiarTexto } from './limpiar'
import type { Documento } from './tipos'

/** Análisis de ngspice guardados en el documento. La validación está en `compartido/analisis/config.ts`; aquí se limpia el
 * nombre y se consulta la colección. */
export { MAX_ANALISIS }

const SIN_ANALISIS: Readonly<Record<string, AnalisisDoc>> = Object.freeze({})
export const analisisDe = (doc: Pick<Documento, 'analisis'>): Readonly<Record<string, AnalisisDoc>> => doc.analisis ?? SIN_ANALISIS
export const hayAnalisis = (doc: Pick<Documento, 'analisis'>): boolean => !!doc.analisis && Object.keys(doc.analisis).length > 0

/** Lo que trae un `.kir` para un análisis: el análisis limpio o por qué se descarta. */
export function leerAnalisis(x: unknown): { valor: AnalisisDoc } | { error: string } {
  const r = validarAnalisis(x)
  if (!r.ok) return { error: r.error.replace(/\.$/, '') }
  const nombre = limpiarTexto(r.valor.nombre).trim()
  return { valor: { ...r.valor, nombre: nombre || 'Análisis' } }
}

import type { TipoSeleccion } from './modelo'

/** Lo que el último grupo de Inicio necesita saber de la selección: cuántos elementos hay de cada clase y, de las piezas y etiquetas, cómo se llaman. */
export interface EntradaSeleccion {
  piezas: readonly { ref: string; nombre: string; modelo?: string }[]
  cables: number
  etiquetas: readonly { nombre: string }[]
  notas: number
  figuras: number
  sondas: number
}

/** Qué hay seleccionado y el título del último grupo de Inicio (vacío si nada). */
export function describirSeleccion(s: EntradaSeleccion): { tipo: TipoSeleccion; titulo: string } {
  const total = s.piezas.length + s.cables + s.etiquetas.length + s.notas + s.figuras + s.sondas
  if (total === 0) return { tipo: 'nada', titulo: '' }
  if (total > 1) return { tipo: 'varios', titulo: `${total} elementos` }
  if (s.piezas.length === 1) {
    const p = s.piezas[0]
    if (p.modelo === 'osciloscopio') return { tipo: 'osciloscopio', titulo: `Osciloscopio ${p.ref}` }
    if (p.modelo === 'multimetro') return { tipo: 'multimetro', titulo: `Multímetro ${p.ref}` }
    return { tipo: 'pieza', titulo: `${p.nombre} ${p.ref}` }
  }
  if (s.cables === 1) return { tipo: 'cable', titulo: 'Cable' }
  if (s.etiquetas.length === 1) return { tipo: 'etiqueta', titulo: `Etiqueta ${s.etiquetas[0].nombre}`.trim() }
  if (s.notas === 1) return { tipo: 'nota', titulo: 'Nota' }
  if (s.figuras === 1) return { tipo: 'figura', titulo: 'Figura' }
  return { tipo: 'sonda', titulo: 'Sonda' }
}

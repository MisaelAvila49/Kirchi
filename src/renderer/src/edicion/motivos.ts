import type { Documento, Id } from '../doc/tipos'

/** Por qué se rechazó un cambio, con las mismas frases que el Registro del editor. */
export function motivoDeChoque(doc: Documento, pieza: { con: Id } | null, conflicto: { con: Id; col: 'piezas' | 'cables' } | null): string {
  if (pieza) return `se encimaría con ${doc.piezas[pieza.con]?.ref ?? 'otra pieza'}`
  if (conflicto?.col === 'piezas') return `un cable atravesaría ${doc.piezas[conflicto.con]?.ref ?? 'una pieza'}`
  return 'un cable correría encima de otra red'
}

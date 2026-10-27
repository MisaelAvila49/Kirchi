import type { Documento, Pieza } from '../doc/tipos'
import type { PiezaDef, PropDef } from '../piezas/tipos'
import { leerEnVivo, textoEnVivo } from '../valores/enVivo'
import { piezaPorRef, sinPieza } from './referencias'

export interface PerillaResuelta {
  pieza: Pieza
  def: PiezaDef
  prop: PropDef
}

/** La perilla `prop` de la pieza `ref`; sin `prop`, la única que tenga. Dice por qué no si la pieza no existe, no tiene
 * perillas o hay que elegir entre varias. */
export function resolverPerilla(doc: Documento, lib: Map<string, PiezaDef>, ref: string, prop?: string): PerillaResuelta | { motivo: string } {
  const pieza = piezaPorRef(doc, ref)
  if (!pieza) return { motivo: sinPieza(ref.slice(0, 40)) }
  const def = lib.get(pieza.tipo)
  const perillas = def?.props.filter((p) => p.enVivo) ?? []
  if (!def || perillas.length === 0) return { motivo: `${pieza.ref} no tiene perillas: mira catalogo_piezas, las propiedades con «perilla».` }
  if (prop === undefined) {
    if (perillas.length > 1) return { motivo: `${pieza.ref} tiene varias perillas (${perillas.map((p) => p.id).join(', ')}): indica «prop».` }
    return { pieza, def, prop: perillas[0] }
  }
  const p = perillas.find((x) => x.id === prop)
  if (!p) return { motivo: `«${prop.slice(0, 40)}» no es una perilla de ${pieza.ref}. Perillas: ${perillas.map((x) => x.id).join(', ')}.` }
  return { pieza, def, prop: p }
}

/** El valor pedido (número o texto con unidad) dentro del rango de la perilla, con el texto que se guarda en el documento. */
export function valorDePerilla(prop: PropDef, valor: number | string): { valor: number; texto: string } | { motivo: string } {
  const l = leerEnVivo(prop, typeof valor === 'number' ? (Number.isFinite(valor) ? String(valor) : 'NaN') : valor)
  return 'error' in l ? { motivo: l.error } : { valor: l.valor, texto: textoEnVivo(prop, l.valor) }
}

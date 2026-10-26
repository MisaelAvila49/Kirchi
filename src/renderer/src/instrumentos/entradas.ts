import { clavePin, partirClavePin, type Conexiones } from '../conexiones/conexiones'
import type { Documento, Id } from '../doc/tipos'
import type { PiezaDef } from '../piezas/tipos'
import { ordenRef } from '../ui/redes'

/** De dónde mide la entrada `pin` del instrumento `pieza`: el nombre de su red, «GND» si es tierra o el primer pin de otra
 * pieza en orden natural de referencias. null si no mide nada. */
export function fuenteDeEntrada(doc: Documento, con: Conexiones, pieza: Id, pin: string): string | null {
  const id = con.redDePin.get(clavePin(pieza, pin))
  const r = id === undefined ? undefined : con.redes[id]
  if (!r) return null
  if (r.nombre !== undefined) return r.nombre
  if (r.tierra) return 'GND'
  const ajenos = r.pines
    .map(partirClavePin)
    .filter((q) => q.piezaId !== pieza && doc.piezas[q.piezaId])
    .map((q) => [doc.piezas[q.piezaId].ref, q.pinId] as const)
    .sort((a, b) => ordenRef(a[0], b[0]) || a[1].localeCompare(b[1], 'es', { numeric: true }))
  return ajenos.length ? `${ajenos[0][0]}:${ajenos[0][1]}` : null
}

/** Las entradas que miden de un instrumento: las cuatro del osciloscopio, o «+» y COM del multímetro; ninguna en otra pieza. */
export function entradasDeInstrumento(def: PiezaDef | undefined): readonly string[] {
  const m = def?.modelo
  return m?.tipo === 'osciloscopio' ? m.entradas : m?.tipo === 'multimetro' ? [m.mas, m.com] : []
}

/** La fuente de cada entrada del instrumento (osciloscopio: A a D; multímetro: + y COM). */
export function fuentesDeInstrumento(doc: Documento, lib: Map<string, PiezaDef>, con: Conexiones, pieza: Id): Record<string, string | null> {
  const p = doc.piezas[pieza]
  const pines = entradasDeInstrumento(p ? lib.get(p.tipo) : undefined)
  return Object.fromEntries(pines.map((q) => [q, fuenteDeEntrada(doc, con, pieza, q)]))
}

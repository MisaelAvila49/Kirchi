import { serializarDocumento } from '../archivo/kir'
import { idSecuencial } from '../doc/ids'
import { documentoVacio, type Cable, type Documento, type Pieza, type Rotacion } from '../doc/tipos'
import { violaciones } from '../editor/conflictos'
import { libreriaDePrueba } from './libreria'
import { NucleoEdicion } from '../edicion/nucleo'
import type { Orden } from '../edicion/ordenes'

export const lib = libreriaDePrueba().piezas

export const pieza = (id: string, tipo: string, ref: string, x: number, y: number, rot: Rotacion = 0): Pieza => ({ id, tipo, ref, x, y, rot, espejo: false, props: {} })
export const cable = (id: string, ...pts: [number, number][]): Cable => ({ id, puntos: pts.map(([x, y]) => ({ x, y })) })

export function documento(piezas: Pieza[] = [], cables: Cable[] = []): Documento {
  const d = documentoVacio()
  for (const p of piezas) d.piezas[p.id] = p
  for (const c of cables) d.cables[c.id] = c
  return d
}

export const nuevoNucleo = (doc?: Documento): NucleoEdicion => new NucleoEdicion(lib, doc, idSecuencial())

/** El documento como texto, para comparar dos estados sin depender de la identidad de los objetos. */
export const texto = (n: NucleoEdicion): string => serializarDocumento(n.doc)

export const sinViolaciones = (n: NucleoEdicion): string[] => violaciones(n.doc, lib)

/** Aplica una orden y exige que se haya aceptado. */
export function aplicarOk(n: NucleoEdicion, orden: Orden) {
  const r = n.aplicar(orden)
  if (!r.ok) throw new Error(`Se rechazó ${JSON.stringify(orden)}: ${r.motivo}`)
  return r
}

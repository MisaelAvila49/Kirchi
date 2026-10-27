import type { Coleccion, Documento, Id, Pieza, Punto } from '../doc/tipos'
import { cajaFigura } from '../lienzo/figuras'
import { cajaEtiqueta, cajaNota } from '../lienzo/medidas'
import { colisiona, cuerpoEnMundo } from '../editor/colision'
import type { Indice } from '../editor/indice'
import { pinesEnMundo } from '../piezas/transformar'
import type { Caja, PiezaDef } from '../piezas/tipos'

/** Cómo trata una clase de objeto el resto de la edición. Los bloques y la protoboard futuros se agregan como clases
 * nuevas con sus propias conexiones, sin tocar las órdenes. */
export interface TipoDeObjeto {
  coleccion: Coleccion
  /** Lo que ocupa en el mundo; null si el id no existe. */
  caja(doc: Documento, lib: Map<string, PiezaDef>, id: Id): Caja | null
  /** Puntos donde se conecta (patillas, anclas). */
  puntos(doc: Documento, lib: Map<string, PiezaDef>, id: Id): Punto[]
  /** Con qué otro objeto se encimaría, o null. */
  choque(doc: Documento, lib: Map<string, PiezaDef>, id: Id, ignorar?: Set<Id>, indice?: Indice): Id | null
}

const sinChoque = () => null

const pieza: TipoDeObjeto = {
  coleccion: 'piezas',
  caja: (doc, lib, id) => {
    const p: Pieza | undefined = doc.piezas[id]
    return p ? cuerpoEnMundo(p, lib.get(p.tipo)) : null
  },
  puntos: (doc, lib, id) => {
    const p: Pieza | undefined = doc.piezas[id]
    const def = p ? lib.get(p.tipo) : undefined
    return p && def ? pinesEnMundo(p, def).map(({ x, y }) => ({ x, y })) : []
  },
  choque: (doc, lib, id, ignorar, indice) => (doc.piezas[id] ? colisiona(doc, lib, doc.piezas[id], ignorar, indice) : null)
}

const etiqueta: TipoDeObjeto = {
  coleccion: 'etiquetas',
  caja: (doc, _lib, id) => (doc.etiquetas[id] ? cajaEtiqueta(doc.etiquetas[id]) : null),
  puntos: (doc, _lib, id) => (doc.etiquetas[id] ? [{ x: doc.etiquetas[id].x, y: doc.etiquetas[id].y }] : []),
  choque: sinChoque
}

const nota: TipoDeObjeto = {
  coleccion: 'notas',
  caja: (doc, _lib, id) => (doc.notas[id] ? cajaNota(doc.notas[id]) : null),
  puntos: () => [],
  choque: sinChoque
}

const figura: TipoDeObjeto = {
  coleccion: 'figuras',
  caja: (doc, _lib, id) => (doc.figuras?.[id] ? cajaFigura(doc.figuras[id]) : null),
  puntos: () => [],
  choque: sinChoque
}

export const TIPOS_DE_OBJETO = { pieza, etiqueta, nota, figura } as const satisfies Record<string, TipoDeObjeto>

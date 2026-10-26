import type { Documento, Id, Punto } from '../doc/tipos'
import type { Indice } from './indice'
import { ALCANCE_MAX_NODO, proyectarEnTramo } from './rutas'

/** Radio de atracción al cablear en píxeles de pantalla. Nunca pasa de la mitad de la distancia al siguiente punto de
 * rejilla (`ALCANCE_MAX_NODO`) ni baja de un cuarto de celda (`RADIO_IMAN_MIN`). */
export const RADIO_IMAN_PX = 12
export const RADIO_IMAN_MIN = ALCANCE_MAX_NODO / 2

/** Radio del imán en unidades de mundo para un zoom (píxeles por unidad): 12 px, entre un cuarto de celda y media celda. */
export const radioIman = (zoom: number): number => Math.min(ALCANCE_MAX_NODO, Math.max(RADIO_IMAN_PX / zoom, RADIO_IMAN_MIN))

/** A qué se pega el cable: un pin (su posición exacta) o un punto de rejilla de un tramo de cable (T o esquina). */
export type Iman =
  | { tipo: 'pin'; piezaId: Id; pinId: string; x: number; y: number }
  /** El punto de conexión de una etiqueta puesta a mano: un cable puede terminar ahí. */
  | { tipo: 'etiqueta'; id: Id; x: number; y: number }
  | { tipo: 'cable'; id: Id; tramo: number; x: number; y: number }

/** Lo conectable más cercano al puntero dentro de `radio`: el pin si hay alguno (gana a los cables aunque el cable esté
 * más cerca) y si no el tramo más cercano con su punto de rejilla.
 * `excluir`: el origen del cable, que no se ofrece como destino. */
export function imanEn(indice: Indice, doc: Documento, p: Punto, radio: number, excluir?: Punto): Iman | null {
  const pin = indice.pinMasCercano(p, radio, excluir)
  if (pin) return { tipo: 'pin', piezaId: pin.piezaId, pinId: pin.pinId, x: pin.x, y: pin.y }
  const e = indice.etiquetaMasCercana(p, radio, excluir)
  if (e) return { tipo: 'etiqueta', ...e }
  const cable = indice.cableMasCercano(p, radio)
  if (!cable) return null
  const c = doc.cables[cable.id]
  const q = proyectarEnTramo(p, c.puntos[cable.tramo], c.puntos[cable.tramo + 1])
  if (excluir && q.x === excluir.x && q.y === excluir.y) return null
  return { tipo: 'cable', id: cable.id, tramo: cable.tramo, x: q.x, y: q.y }
}

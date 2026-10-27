import { partirClavePin, type Red } from '../conexiones/conexiones'
import type { Documento, Punto } from '../doc/tipos'
import { pinesEnMundo } from '../piezas/transformar'
import type { PiezaDef } from '../piezas/tipos'
import type { Texto } from './etiquetas'

/** Un lugar candidato para un chip: centro (o borde, según `alinear`) del texto. */
export interface Candidato {
  x: number
  y: number
  alinear: Texto['alinear']
}

/** Distancia del chip al cable y al pin, en unidades (la misma `SEPARACION_CHIP` de `chips.ts`). */
const SEPARACION = 1.6

/** Si la red llega a la entrada de una compuerta, el chip va junto a esa entrada y no a la mitad del cable: sobre el
 * último tramo, pegado al pin (arriba y luego abajo). Con varias entradas en la red manda la de menor llave. Sin entrada
 * de compuerta, o sin un cable que termine en ella, devuelve null y el reparto sigue como siempre. */
export function candidatosEnEntrada(doc: Documento, lib: Map<string, PiezaDef>, r: Pick<Red, 'pines' | 'cables'>): Candidato[] | null {
  let mejor: string | null = null
  for (const clave of r.pines) {
    const { piezaId, pinId } = partirClavePin(clave)
    const m = doc.piezas[piezaId] ? lib.get(doc.piezas[piezaId].tipo)?.modelo : undefined
    if (m?.tipo === 'compuerta' && m.entradas.includes(pinId) && (mejor === null || clave < mejor)) mejor = clave
  }
  if (mejor === null) return null
  const { piezaId, pinId } = partirClavePin(mejor)
  const p = doc.piezas[piezaId]
  const def = lib.get(p.tipo)
  const pin = def ? pinesEnMundo(p, def).find((q) => q.id === pinId) : undefined
  if (!pin) return null
  // El punto del cable que sigue al pin: de dónde llega el último tramo.
  let vecino: Punto | null = null
  for (const id of r.cables) {
    const pts = doc.cables[id]?.puntos
    if (!pts || pts.length < 2) continue
    const a = pts[0], z = pts[pts.length - 1]
    const v = a.x === pin.x && a.y === pin.y ? pts[1] : z.x === pin.x && z.y === pin.y ? pts[pts.length - 2] : null
    if (v && (v.x !== pin.x || v.y !== pin.y) && (vecino === null || Math.abs(v.x - pin.x) + Math.abs(v.y - pin.y) > Math.abs(vecino.x - pin.x) + Math.abs(vecino.y - pin.y))) vecino = v
  }
  if (!vecino) return null
  // Pegado al pin, del lado de donde llega el cable, sin pasar el hueco del pin (`MARGEN_PIN_X`).
  const lado = Math.sign(vecino.x - pin.x)
  if (vecino.y === pin.y && lado !== 0) {
    const al: Texto['alinear'] = lado < 0 ? 'der' : 'izq'
    const x = pin.x + lado * SEPARACION
    return [{ x, y: pin.y - SEPARACION, alinear: al }, { x, y: pin.y + SEPARACION, alinear: al }]
  }
  const arriba = Math.sign(vecino.y - pin.y) || -1
  const y = pin.y + arriba * 2.2
  return [{ x: pin.x + SEPARACION / 2, y, alinear: 'izq' }, { x: pin.x - SEPARACION / 2, y, alinear: 'der' }]
}

import { anclaDeSonda, enTramo } from '../conexiones/anclas'
import type { Documento, Punto, Rotacion } from '../doc/tipos'
import { cajasSeCruzan } from '../lienzo/apartar'
import { cajaEtiqueta } from '../lienzo/medidas'
import type { PiezaDef } from '../piezas/tipos'
import { cuerpoEnMundo } from './colision'
import { conflictoDeTocados } from './conflictos'

/** Largo del tramo que lleva a una etiqueta puesta sobre un cable, en unidades (5 mm). */
export const LARGO_TRAMO_ETIQUETA = 4
const ID_TRAMO = 'tramo-de-etiqueta'

/** Dónde va una etiqueta nueva y, si se puso sobre un cable, el tramo corto que la une a él. */
export interface PlanEtiqueta {
  cable?: Punto[]
  etiqueta: { x: number; y: number; rot: Rotacion }
}

/** Una etiqueta sobre el interior de un tramo va en la punta de un tramo corto perpendicular. Un lado vale si no cruza
 * pieza ni otra red, su punta no toca nada y la etiqueta no pisa cuerpos ni etiquetas; si no, va donde se pidió. */
export function planDeEtiqueta(doc: Documento, lib: Map<string, PiezaDef>, en: Punto, nombre = 'X'): PlanEtiqueta {
  const aqui: PlanEtiqueta = { etiqueta: { x: en.x, y: en.y, rot: 0 } }
  let horizontal: boolean | null = null
  for (const c of Object.values(doc.cables)) {
    // En un vértice o en la punta de un cable ya se le une: la etiqueta va ahí, como siempre.
    if (c.puntos.some((q) => q.x === en.x && q.y === en.y)) return aqui
    for (let i = 1; i < c.puntos.length && horizontal === null; i++) if (enTramo(c.puntos[i - 1], c.puntos[i], en.x, en.y)) horizontal = c.puntos[i - 1].y === c.puntos[i].y
  }
  if (horizontal === null || anclaDeSonda(doc, lib, en.x, en.y)?.tipo === 'pin') return aqui
  const L = LARGO_TRAMO_ETIQUETA
  const lados: [number, number, Rotacion][] = horizontal ? [[0, -L, 0], [0, L, 0]] : [[L, 0, 0], [-L, 0, 180]]
  const cuerpos = Object.values(doc.piezas).map((p) => cuerpoEnMundo(p, lib.get(p.tipo)))
  const otras = Object.values(doc.etiquetas).map(cajaEtiqueta)
  for (const [dx, dy, rot] of lados) {
    const fin = { x: en.x + dx, y: en.y + dy }
    if (anclaDeSonda(doc, lib, fin.x, fin.y)) continue
    const caja = cajaEtiqueta({ id: 'nueva', nombre, x: fin.x, y: fin.y, rot })
    if (cuerpos.some((c) => cajasSeCruzan(c, caja)) || otras.some((c) => cajasSeCruzan(c, caja))) continue
    const con = { ...doc, cables: { ...doc.cables, [ID_TRAMO]: { id: ID_TRAMO, puntos: [en, fin] } } }
    if (conflictoDeTocados(con, lib, { cables: [ID_TRAMO] })) continue
    return { cable: [{ x: en.x, y: en.y }, fin], etiqueta: { ...fin, rot } }
  }
  return aqui
}

import { anclaDeSonda, enTramo } from '../conexiones/anclas'
import type { Cable, Documento, Punto, Rotacion } from '../doc/tipos'
import { cajasSeCruzan, cajaTexto } from '../lienzo/apartar'
import { rotulosDePieza } from '../lienzo/etiquetas'
import { textosNumerosPatilla } from '../lienzo/numerosPatilla'
import { cajaEtiqueta } from '../lienzo/medidas'
import type { PiezaDef } from '../piezas/tipos'
import { cuerpoEnMundo } from './colision'
import { conflictoDeTocados, tramoCruzaCaja } from './conflictos'
import { pinesEnMundo } from '../piezas/transformar'

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
  const aqui: PlanEtiqueta = { etiqueta: { x: en.x, y: en.y, rot: giroDeEtiqueta(doc, lib, en, nombre) } }
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

/** Giros de la etiqueta con el sentido en que crece su bandera desde la punta. */
const SENTIDOS: { rot: Rotacion; x: number; y: number }[] = [
  { rot: 0, x: 1, y: 0 },
  { rot: 180, x: -1, y: 0 },
  { rot: 270, x: 0, y: -1 },
  { rot: 90, x: 0, y: 1 }
]

/** El giro de una etiqueta con punta en `en`: crece hacia un lado libre (sin pisar cuerpos, patillas, rótulos de pieza, cables ni otras etiquetas). Entre
 * los libres gana el del original (`original`, grados antihorarios, como los da KiCad); sin él, el contrario a lo que llega y,
 * a la par, el horizontal. Una etiqueta de KiCad va sobre el cable y la de Kirchi encima: tal cual taparía el cable que sigue.
 * `ignorar`: la propia etiqueta, si ya está en el documento. */
export function giroDeEtiqueta(doc: Documento, lib: Map<string, PiezaDef>, en: Punto, nombre = 'X', original?: number, ignorar?: string, cablesEn?: CablesEn): Rotacion {
  return mejorGiro(doc, lib, en, nombre, original, ignorar, cablesEn).rot
}

/** Cables que pueden tocar una caja; un índice espacial del llamador evita recorrer todos los del documento en cada etiqueta. */
export type CablesEn = (caja: { minX: number; minY: number; maxX: number; maxY: number }) => Iterable<Cable>

/** Como `giroDeEtiqueta`, y dice si el giro elegido queda sin pisar nada. */
export function mejorGiro(doc: Documento, lib: Map<string, PiezaDef>, en: Punto, nombre = 'X', original?: number, ignorar?: string, cablesEn?: CablesEn): { rot: Rotacion; libre: boolean } {
  const a = original !== undefined && Number.isFinite(original) ? (original * Math.PI) / 180 : undefined
  const ox = a === undefined ? 0 : Math.round(Math.cos(a)), oy = a === undefined ? 0 : Math.round(-Math.sin(a))
  // Hacia dónde está lo que llega a la punta: cables que salen de ella y piezas cuyo pin cae ahí.
  let lx = 0, ly = 0
  const CERCA = 40
  // Solo lo cercano: con miles de etiquetas por poner (una importación grande) recorrer todo en cada una sería cuadrático.
  const candidatos = cablesEn ? cablesEn({ minX: en.x - CERCA, minY: en.y - CERCA, maxX: en.x + CERCA, maxY: en.y + CERCA }) : Object.values(doc.cables)
  const cables = [...candidatos].filter((c) => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
    for (const q of c.puntos) (x0 = Math.min(x0, q.x)), (x1 = Math.max(x1, q.x)), (y0 = Math.min(y0, q.y)), (y1 = Math.max(y1, q.y))
    return x1 >= en.x - CERCA && x0 <= en.x + CERCA && y1 >= en.y - CERCA && y0 <= en.y + CERCA
  })
  for (const c of cables)
    for (let i = 1; i < c.puntos.length; i++) {
      const a = c.puntos[i - 1], b = c.puntos[i]
      if (!enTramo(a, b, en.x, en.y) && !(a.x === en.x && a.y === en.y) && !(b.x === en.x && b.y === en.y)) continue
      for (const o of [a, b]) if (o.x !== en.x || o.y !== en.y) (lx += Math.sign(o.x - en.x)), (ly += Math.sign(o.y - en.y))
    }
  const cercanas = Object.values(doc.piezas).flatMap((p) => {
    // Primero por el origen de la pieza, que es barato; ningún cuerpo se aleja tanto de él.
    if (Math.abs(p.x - en.x) > 3 * CERCA || Math.abs(p.y - en.y) > 3 * CERCA) return []
    const c = cuerpoEnMundo(p, lib.get(p.tipo))
    return c.maxX < en.x - CERCA || c.minX > en.x + CERCA || c.maxY < en.y - CERCA || c.minY > en.y + CERCA ? [] : [{ p, c }]
  })
  // El cuerpo de una pieza con sus patillas: una tierra o un capacitor dibujan su conductor fuera del cuerpo.
  const cuerpos = cercanas.map(({ p, c }) => {
    const def = lib.get(p.tipo)
    const k = { ...c }
    if (def)
      for (const q of pinesEnMundo(p, def)) {
        if (q.x === en.x && q.y === en.y) continue
        k.minX = Math.min(k.minX, q.x), k.maxX = Math.max(k.maxX, q.x), k.minY = Math.min(k.minY, q.y), k.maxY = Math.max(k.maxY, q.y)
      }
    return k
  })
  const rotulos = cercanas.flatMap(({ p }) => {
    const def = lib.get(p.tipo)
    return def ? [...rotulosDePieza(p, def), ...textosNumerosPatilla(p, def)].map((t) => cajaTexto(t)) : []
  })
  for (const { p, c } of cercanas) {
    const def = lib.get(p.tipo)
    if (!def || !pinesEnMundo(p, def).some((q) => q.x === en.x && q.y === en.y)) continue
    lx += Math.sign((c.minX + c.maxX) / 2 - en.x)
    ly += Math.sign((c.minY + c.maxY) / 2 - en.y)
  }
  const otras = Object.values(doc.etiquetas)
    .filter((e) => e.id !== ignorar && (e.x !== en.x || e.y !== en.y) && Math.abs(e.x - en.x) <= 2 * CERCA && Math.abs(e.y - en.y) <= 2 * CERCA)
    .map(cajaEtiqueta)
  const puntaje = (s: (typeof SENTIDOS)[number]): number => {
    const caja = cajaEtiqueta({ id: 'nueva', nombre, x: en.x, y: en.y, rot: s.rot })
    // Sin lado libre, el que menos tapa: un cuerpo u otra etiqueta pesan más que un cable.
    const pisa =
      3 * cuerpos.filter((c) => cajasSeCruzan(c, caja)).length +
      3 * otras.filter((c) => cajasSeCruzan(c, caja)).length +
      3 * rotulos.filter((c) => cajasSeCruzan(c, caja)).length +
      cables.filter((c) => c.puntos.some((a, i) => i > 0 && tramoCruzaCaja(c.puntos[i - 1], a, caja))).length
    return (pisa ? -20 * Math.min(pisa, 4) : 100) + (s.x === ox && s.y === oy ? 50 : 0) + (s.y === 0 ? 10 : 0) - 3 * (s.x * Math.sign(lx) + s.y * Math.sign(ly)) + (s.rot === 0 ? 1 : 0)
  }
  const mejor = [...SENTIDOS].sort((p, q) => puntaje(q) - puntaje(p))[0]!
  return { rot: mejor.rot, libre: puntaje(mejor) >= 50 }
}

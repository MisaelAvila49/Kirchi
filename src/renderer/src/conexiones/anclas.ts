import type { Documento, Id } from '../doc/tipos'
import { pinesEnMundo } from '../piezas/transformar'
import type { PiezaDef } from '../piezas/tipos'
import { clavePin, porId } from './conexiones'

/** Lo que una sonda toca en su punto: un pin («pieza:pin»), el ancla de una etiqueta o un cable (vértice o interior). */
export type AnclaSonda = { tipo: 'pin'; clave: string } | { tipo: 'etiqueta'; id: Id } | { tipo: 'cable'; id: Id }

/** El punto (x, y) cae sobre el tramo de `a` a `b` (extremos incluidos); el tramo es horizontal o vertical. */
export function enTramo(a: { x: number; y: number }, b: { x: number; y: number }, x: number, y: number): boolean {
  if (a.x === b.x) return x === a.x && y >= Math.min(a.y, b.y) && y <= Math.max(a.y, b.y)
  if (a.y === b.y) return y === a.y && x >= Math.min(a.x, b.x) && x <= Math.max(a.x, b.x)
  return false
}

/** Lo que toca una sonda en (x, y): un pin, luego el ancla de una etiqueta, luego el cable de menor id. null si nada.
 * Misma regla que `calcularConexiones`. */
export function anclaDeSonda(doc: Documento, lib: Map<string, PiezaDef>, x: number, y: number): AnclaSonda | null {
  for (const p of Object.values(doc.piezas).sort(porId)) {
    const def = lib.get(p.tipo)
    if (!def) continue
    for (const q of pinesEnMundo(p, def)) if (q.x === x && q.y === y) return { tipo: 'pin', clave: clavePin(p.id, q.id) }
  }
  for (const e of Object.values(doc.etiquetas).sort(porId)) if (e.x === x && e.y === y) return { tipo: 'etiqueta', id: e.id }
  // Como en `calcularConexiones`: un cable sin dos puntos distintos no existe.
  const cables = Object.values(doc.cables).filter((c) => c.puntos.some((q, i) => i > 0 && (q.x !== c.puntos[i - 1].x || q.y !== c.puntos[i - 1].y))).sort(porId)
  // Un vértice gana a un interior: en ese punto el cable ya es un nodo (otro que pase por ahí sin unión no se le une).
  for (const c of cables) if (c.puntos.some((q) => q.x === x && q.y === y)) return { tipo: 'cable', id: c.id }
  for (const c of cables) for (let i = 1; i < c.puntos.length; i++) if (enTramo(c.puntos[i - 1], c.puntos[i], x, y)) return { tipo: 'cable', id: c.id }
  return null
}

import type { Documento, Id, Punto } from '../doc/tipos'
import { figuraTocaCaja } from '../lienzo/figuras'
import type { Caja } from '../piezas/tipos'
import type { Indice } from './indice'
import { seleccionVacia, type Seleccion } from './seleccion'

export function seleccionarEnRectangulo(indice: Indice, doc: Documento, a: Punto, b: Punto): Seleccion {
  const cruce = b.x < a.x
  const r: Caja = { minX: Math.min(a.x, b.x), minY: Math.min(a.y, b.y), maxX: Math.max(a.x, b.x), maxY: Math.max(a.y, b.y) }
  const dentro = (c: Caja) => c.minX >= r.minX && c.maxX <= r.maxX && c.minY >= r.minY && c.maxY <= r.maxY
  const sel = seleccionVacia()
  const tramosDentro = new Map<Id, number>()
  for (const it of indice.buscar(r)) {
    if (it.col === 'cables') {
      if (cruce) sel.cables.add(it.id)
      else if (dentro(it)) tramosDentro.set(it.id, (tramosDentro.get(it.id) ?? 0) + 1)
    } else if (it.col === 'figuras') {
      // Cruzando, una figura entra si su trazo pasa por el rectángulo (no basta su caja: un marco de sección la tiene enorme).
      const f = doc.figuras?.[it.id]
      if (f && (cruce ? figuraTocaCaja(f, r) : dentro(it))) sel.figuras.add(it.id)
    } else if (cruce || dentro(it)) sel[it.col].add(it.id)
  }
  for (const [id, n] of tramosDentro) {
    const c = doc.cables[id]
    if (c && n === c.puntos.length - 1) sel.cables.add(id)
  }
  return sel
}

import { enTramo } from '../conexiones/anclas'
import type { Documento, Punto } from '../doc/tipos'
import { pinesEnMundo } from '../piezas/transformar'
import type { PiezaDef } from '../piezas/tipos'

/** Los extremos de cable que no tocan nada: ni una patilla, ni una etiqueta, ni otro cable. Un tramo así no une nada y en el
 * esquema parece una conexión que falta. */
export function extremosSueltos(doc: Documento, lib: Map<string, PiezaDef>): { cable: string; punto: Punto }[] {
  const fijos = new Set<string>()
  const k = (p: Punto) => `${p.x},${p.y}`
  for (const p of Object.values(doc.piezas)) {
    const def = lib.get(p.tipo)
    if (def) for (const q of pinesEnMundo(p, def)) fijos.add(k(q))
  }
  for (const e of Object.values(doc.etiquetas)) fijos.add(k(e))
  const cables = Object.values(doc.cables).filter((c) => c.puntos.length >= 2)
  const salida: { cable: string; punto: Punto }[] = []
  for (const c of cables) {
    for (const extremo of [c.puntos[0], c.puntos[c.puntos.length - 1]]) {
      if (fijos.has(k(extremo))) continue
      const tocaOtro = cables.some((o) => o.id !== c.id && o.puntos.some((q, i) => (i === 0 ? q.x === extremo.x && q.y === extremo.y : enTramo(o.puntos[i - 1], q, extremo.x, extremo.y))))
      if (!tocaOtro) salida.push({ cable: c.id, punto: { x: extremo.x, y: extremo.y } })
    }
  }
  return salida
}

import { borrar, crear, juntar, modificar, type Comando } from '../doc/comandos'
import type { GeneradorId } from '../doc/ids'
import type { Cable, Documento, Id, Pieza, Punto } from '../doc/tipos'
import { pinesEnMundo } from '../piezas/transformar'
import type { PiezaDef } from '../piezas/tipos'
import { iguales, limpiarPolilinea } from './rutas'

/** `t` de `p` a lo largo del tramo a→b (0 en a, 1 en b) si `p` está sobre él; null si no. */
function sobreTramo(p: Punto, a: Punto, b: Punto): number | null {
  if (a.y === b.y && a.x !== b.x && p.y === a.y) {
    const t = (p.x - a.x) / (b.x - a.x)
    return t >= 0 && t <= 1 ? t : null
  }
  if (a.x === b.x && a.y !== b.y && p.x === a.x) {
    const t = (p.y - a.y) / (b.y - a.y)
    return t >= 0 && t <= 1 ? t : null
  }
  return null
}

/** Pieza de dos pines sobre un cable: si ambos caen en el mismo tramo recto, parte el cable en los pines y quita el trozo
 * de en medio para que quede en serie y no en corto. El primer trozo conserva el id.
 * null si no aplica. `ignorar`: cables que no cuentan (los que se arrastran con la pieza). */
export function insertarEnCable(doc: Documento, lib: Map<string, PiezaDef>, pieza: Pieza, gen: GeneradorId, ignorar?: Set<Id>): Comando | null {
  const def = lib.get(pieza.tipo)
  if (!def || def.pines.length !== 2) return null
  const [p1, p2] = pinesEnMundo(pieza, def)
  if (iguales(p1, p2)) return null
  // Todos los cables con un tramo bajo la pieza (dos cables encimados de la misma red se parten los dos).
  const cmds: Comando[] = []
  for (const c of Object.values(doc.cables)) {
    if (ignorar?.has(c.id)) continue
    const pts = c.puntos
    for (let i = 1; i < pts.length; i++) {
      const t1 = sobreTramo(p1, pts[i - 1], pts[i])
      const t2 = t1 === null ? null : sobreTramo(p2, pts[i - 1], pts[i])
      if (t1 === null || t2 === null) continue
      const [cerca, lejos] = t1 <= t2 ? [p1, p2] : [p2, p1]
      const antes = limpiarPolilinea([...pts.slice(0, i), { x: cerca.x, y: cerca.y }])
      const despues = limpiarPolilinea([{ x: lejos.x, y: lejos.y }, ...pts.slice(i)])
      cmds.push(partir(c, antes, despues, gen))
      break
    }
  }
  return cmds.length === 0 ? null : cmds.length === 1 ? cmds[0] : juntar('insertar', cmds)
}

function partir(c: Cable, antes: Punto[], despues: Punto[], gen: GeneradorId): Comando {
  const trozos = [antes, despues].filter((t) => t.length >= 2)
  if (trozos.length === 0) return borrar('insertar', 'cables', c)
  const cmds: Comando[] = [modificar('insertar', 'cables', c, { ...c, puntos: trozos[0] })]
  if (trozos[1]) cmds.push(crear('insertar', 'cables', { id: gen('c'), puntos: trozos[1] }))
  return juntar('insertar', cmds)
}

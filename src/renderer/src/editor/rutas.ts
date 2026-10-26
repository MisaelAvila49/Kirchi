import type { Punto } from '../doc/tipos'

/** Rejilla principal: 2 unidades de rejilla fina = 2.5 mm. */
export const PASO_REJILLA = 2
/** Lo más lejos que se atrae un nodo (pin, punta o tramo): la mitad de la distancia al siguiente punto de la rejilla, nunca hasta él. */
export const ALCANCE_MAX_NODO = PASO_REJILLA / 2

const ajustarEje = (v: number) => Math.round(v / PASO_REJILLA) * PASO_REJILLA + 0
export const ajustar = (p: { x: number; y: number }): Punto => ({ x: ajustarEje(p.x), y: ajustarEje(p.y) })
export const iguales = (a: Punto, b: Punto): boolean => a.x === b.x && a.y === b.y
const colineales = (a: Punto, b: Punto, c: Punto) => (a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y)

/** Sin puntos repetidos seguidos ni puntos intermedios alineados con sus vecinos. */
export function limpiarPolilinea(pts: Punto[]): Punto[] {
  const out: Punto[] = []
  for (const p of pts) {
    if (out.length && iguales(out[out.length - 1], p)) continue
    while (out.length >= 2 && colineales(out[out.length - 2], out[out.length - 1], p)) out.pop()
    if (!out.length || !iguales(out[out.length - 1], p)) out.push(p)
  }
  return out
}

/** Camino ortogonal de dos tramos: primero horizontal si `horizontalPrimero`. */
export function rutaL(desde: Punto, hasta: Punto, horizontalPrimero: boolean): Punto[] {
  const esquina = horizontalPrimero ? { x: hasta.x, y: desde.y } : { x: desde.x, y: hasta.y }
  return limpiarPolilinea([desde, esquina, hasta])
}

const limitar = (v: number, a: number, b: number) => Math.min(Math.max(v, Math.min(a, b)), Math.max(a, b))

/** Como `proyectarEnTramo`, sin ajustar a la rejilla: el punto exacto del tramo más cercano a `p`. */
export function proyectarSinAjustar(p: Punto, a: Punto, b: Punto): Punto {
  if (a.y === b.y) return { x: limitar(p.x, a.x, b.x), y: a.y }
  if (a.x === b.x) return { x: a.x, y: limitar(p.y, a.y, b.y) }
  return Math.hypot(p.x - a.x, p.y - a.y) <= Math.hypot(p.x - b.x, p.y - b.y) ? a : b
}

/** Punto de rejilla del tramo a→b más cercano a `p` (para terminar o derivar sobre un cable). */
export function proyectarEnTramo(p: Punto, a: Punto, b: Punto): Punto {
  const q = ajustar(p)
  if (a.y === b.y) return { x: limitar(q.x, a.x, b.x), y: a.y }
  if (a.x === b.x) return { x: a.x, y: limitar(q.y, a.y, b.y) }
  return Math.hypot(p.x - a.x, p.y - a.y) <= Math.hypot(p.x - b.x, p.y - b.y) ? a : b
}

/** Une dos polilíneas que comparten un extremo; null si no lo comparten. */
export function juntarCables(a: Punto[], b: Punto[]): Punto[] | null {
  const ai = a[0], af = a[a.length - 1], bi = b[0], bf = b[b.length - 1]
  if (iguales(af, bi)) return limpiarPolilinea([...a, ...b.slice(1)])
  if (iguales(af, bf)) return limpiarPolilinea([...a, ...[...b].reverse().slice(1)])
  if (iguales(ai, bf)) return limpiarPolilinea([...b, ...a.slice(1)])
  if (iguales(ai, bi)) return limpiarPolilinea([...[...a].reverse(), ...b.slice(1)])
  return null
}

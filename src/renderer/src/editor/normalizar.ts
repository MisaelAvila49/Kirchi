import { crear, juntar, modificar, type Comando } from '../doc/comandos'
import type { GeneradorId } from '../doc/ids'
import type { Cable, Documento, Id, Punto } from '../doc/tipos'

const clave = (x: number, y: number) => `${x},${y}`

/** Parte cada cable en los puntos interiores donde termina otro (uniones en T) para que toda unión sea extremo, como en
 * KiCad. El primer tramo conserva el id.
 * Solo mira tramos horizontales y verticales, igual que `calcularConexiones`. null si nada que partir. */
export function partirEnUniones(doc: Documento, gen: GeneradorId): Comando | null {
  const cables = Object.values(doc.cables).filter((c) => c.puntos.length >= 2)
  const porPunto = new Map<string, Id[]>()
  const porFila = new Map<number, { x: number; id: Id }[]>()
  const porColumna = new Map<number, { y: number; id: Id }[]>()
  const agregar = <K, V>(m: Map<K, V[]>, k: K, v: V) => {
    const l = m.get(k)
    if (l) l.push(v)
    else m.set(k, [v])
  }
  for (const c of cables)
    for (const p of [c.puntos[0], c.puntos[c.puntos.length - 1]]) {
      const k = clave(p.x, p.y)
      const l = porPunto.get(k)
      if (l) l.push(c.id)
      else porPunto.set(k, [c.id])
      agregar(porFila, p.y, { x: p.x, id: c.id })
      agregar(porColumna, p.x, { y: p.y, id: c.id })
    }

  const cmds: Comando[] = []
  for (const c of cables) {
    const pts = c.puntos
    const nuevos: Punto[] = [pts[0]]
    const cortes: number[] = []
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i]
      const horizontal = a.y === b.y && a.x !== b.x
      const vertical = a.x === b.x && a.y !== b.y
      if (horizontal || vertical) {
        const eje = (p: Punto) => (horizontal ? p.x : p.y)
        const lo = Math.min(eje(a), eje(b)), hi = Math.max(eje(a), eje(b))
        const enLinea = horizontal ? porFila.get(a.y) : porColumna.get(a.x)
        const valores = new Set<number>()
        for (const e of enLinea ?? []) {
          const v = 'x' in e ? e.x : e.y
          if (e.id !== c.id && v > lo && v < hi) valores.add(v)
        }
        const orden = [...valores].sort((u, w) => (eje(b) > eje(a) ? u - w : w - u))
        for (const v of orden) {
          cortes.push(nuevos.length)
          nuevos.push(horizontal ? { x: v, y: a.y } : { x: a.x, y: v })
        }
      }
      if (i < pts.length - 1 && (porPunto.get(clave(b.x, b.y)) ?? []).some((id) => id !== c.id)) cortes.push(nuevos.length)
      nuevos.push(b)
    }
    if (cortes.length === 0) continue
    const trozos: Cable[] = []
    let desde = 0
    for (const k of [...cortes, nuevos.length - 1]) {
      trozos.push({ id: trozos.length === 0 ? c.id : gen('c'), puntos: nuevos.slice(desde, k + 1) })
      desde = k
    }
    cmds.push(modificar('partir', 'cables', c, trozos[0]))
    for (const t of trozos.slice(1)) cmds.push(crear('partir', 'cables', t))
  }
  return cmds.length ? juntar('partir', cmds) : null
}

import type { Cable, Id, Punto } from '../doc/tipos'
import { RADIO_SALTO } from './medidas'

export const claveTramo = (id: Id, i: number): string => `${id}#${i}`

/** Primer índice de `a` (ordenado) con a[i] > v. */
function primeroMayor(a: number[], v: number): number {
  let lo = 0, hi = a.length
  while (lo < hi) {
    const m = (lo + hi) >> 1
    if (a[m] > v) hi = m
    else lo = m + 1
  }
  return lo
}

/** Para cada tramo horizontal («id#i»), las x ordenadas donde lo atraviesa un vertical sin unión. */
export function cruces(cables: Iterable<Cable>, uniones: Punto[]): Map<string, number[]> {
  const verticales: { x: number; y0: number; y1: number }[] = []
  // La clave del tramo («id#i») se arma solo si tiene algún salto.
  const horizontales: { cable: Cable; i: number; y: number; x0: number; x1: number }[] = []
  for (const c of cables) {
    for (let i = 1; i < c.puntos.length; i++) {
      const a = c.puntos[i - 1], b = c.puntos[i]
      if (a.x === b.x && a.y !== b.y) verticales.push({ x: a.x, y0: Math.min(a.y, b.y), y1: Math.max(a.y, b.y) })
      else if (a.y === b.y && a.x !== b.x) horizontales.push({ cable: c, i: i - 1, y: a.y, x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x) })
    }
  }
  const out = new Map<string, number[]>()
  if (verticales.length === 0 || horizontales.length === 0) return out
  verticales.sort((p, q) => p.x - q.x)
  const xs = verticales.map((v) => v.x)
  const enUnion = new Set(uniones.map((u) => `${u.x},${u.y}`))
  for (const h of horizontales) {
    let lista: number[] | undefined
    for (let j = primeroMayor(xs, h.x0); j < xs.length && xs[j] < h.x1; j++) {
      const v = verticales[j]
      if (!(v.y0 < h.y && h.y < v.y1) || enUnion.has(`${v.x},${h.y}`)) continue
      if (!lista) out.set(claveTramo(h.cable.id, h.i), (lista = []))
      if (lista[lista.length - 1] !== v.x) lista.push(v.x)
    }
  }
  return out
}

/** Polilínea plana del tramo horizontal a→b con un semicírculo hacia −y en cada x de `xs` (ascendentes). */
export function tramoConSaltos(a: Punto, b: Punto, xs: number[], radio = RADIO_SALTO, pasos = 8): number[] {
  const dir = b.x > a.x ? 1 : -1
  const lo = Math.min(a.x, b.x), hi = Math.max(a.x, b.x)
  // Radio de cada arco: sin pasar de la mitad del hueco a sus vecinos, para que no se monten.
  const radios = xs.map((x, i) => Math.min(radio, (x - (i > 0 ? xs[i - 1] : lo)) / 2, ((i < xs.length - 1 ? xs[i + 1] : hi) - x) / 2))
  const idx = xs.map((_, i) => i)
  if (dir < 0) idx.reverse()
  const pts = [a.x, a.y]
  for (const i of idx)
    for (let k = 0; k <= pasos; k++) {
      const t = (Math.PI * k) / pasos
      pts.push(xs[i] - dir * radios[i] * Math.cos(t), a.y - radios[i] * Math.sin(t))
    }
  pts.push(b.x, b.y)
  return pts
}

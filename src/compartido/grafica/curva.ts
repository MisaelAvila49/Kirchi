/** Puntos de una curva paramétrica (gráfica X-Y): el más cercano al puntero a lo largo de la curva y la pendiente entre dos. Sin DOM. */

export interface Curva {
  x: ArrayLike<number>
  y: ArrayLike<number>
}

export interface PuntoCurva {
  /** Cuál de las curvas, el vértice anterior y la fracción [0, 1] hacia el siguiente. */
  curva: number
  i: number
  f: number
  x: number
  y: number
  /** Distancia en píxeles al puntero. */
  dist: number
}

const finito = (v: number): boolean => Number.isFinite(v)

/**
 * El punto de las curvas más cercano a (px, py) en distancia de pantalla, proyectado sobre cada segmento: una curva cerrada
 * (Lissajous) no tiene x creciente, así que se mira la distancia y no el orden. `aPx` lleva un punto de datos de la curva `curva` a píxeles.
 */
export function puntoMasCercano(curvas: readonly Curva[], aPx: (x: number, y: number, curva: number) => readonly [number, number], px: number, py: number): PuntoCurva | null {
  let mejor: PuntoCurva | null = null
  curvas.forEach((c, k) => {
    const n = Math.min(c.x.length, c.y.length)
    let [ax, ay] = n > 0 && finito(c.x[0]) && finito(c.y[0]) ? aPx(c.x[0], c.y[0], k) : [Number.NaN, Number.NaN]
    if (n === 1 && finito(ax)) {
      const d = Math.hypot(ax - px, ay - py)
      if (!mejor || d < mejor.dist) mejor = { curva: k, i: 0, f: 0, x: c.x[0], y: c.y[0], dist: d }
    }
    for (let i = 0; i + 1 < n; i++) {
      const [bx, by] = finito(c.x[i + 1]) && finito(c.y[i + 1]) ? aPx(c.x[i + 1], c.y[i + 1], k) : [Number.NaN, Number.NaN]
      if (finito(ax) && finito(ay) && finito(bx) && finito(by)) {
        const dx = bx - ax
        const dy = by - ay
        const l2 = dx * dx + dy * dy
        const f = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2))
        const d = Math.hypot(ax + f * dx - px, ay + f * dy - py)
        if (!mejor || d < mejor.dist) mejor = { curva: k, i, f, x: c.x[i] + f * (c.x[i + 1] - c.x[i]), y: c.y[i] + f * (c.y[i + 1] - c.y[i]), dist: d }
      }
      ax = bx
      ay = by
    }
  })
  return mejor
}

/** El punto de una curva `pasos` vértices adelante (o atrás, si es negativo) del punto dado; salta los vértices sin dato y se queda en el extremo. */
export function avanzarEnCurva(c: Curva, de: PuntoCurva, pasos: number): { x: number; y: number } | null {
  const n = Math.min(c.x.length, c.y.length)
  if (n === 0) return null
  const dir = pasos >= 0 ? 1 : -1
  let i = Math.round(de.i + de.f)
  let resto = Math.abs(pasos)
  while (resto > 0) {
    let j = i + dir
    while (j >= 0 && j < n && !(finito(c.x[j]) && finito(c.y[j]))) j += dir
    if (j < 0 || j >= n) break
    i = j
    resto--
  }
  return finito(c.x[i]) && finito(c.y[i]) ? { x: c.x[i], y: c.y[i] } : null
}

/** ΔY/ΔX entre dos puntos; null si no hay desplazamiento horizontal. */
export function pendiente(a: { x: number; y: number }, b: { x: number; y: number }): number | null {
  const dx = b.x - a.x
  return Math.abs(dx) < 1e-300 || !finito(dx) ? null : (b.y - a.y) / dx
}

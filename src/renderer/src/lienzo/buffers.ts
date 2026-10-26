import type { RGBA } from './paleta'

/** x0, y0, x1, y1, ancho (mundo), r, g, b, a */
export const FLOTANTES_TRAZO = 9
/** x, y (mundo), r, g, b, a */
export const FLOTANTES_VERTICE = 6

export class Crecible {
  datos: Float32Array
  usados = 0

  constructor(inicial: number) {
    this.datos = new Float32Array(inicial)
  }

  reservar(n: number): Float32Array {
    if (this.usados + n > this.datos.length) {
      let cap = Math.max(this.datos.length, 1) * 2
      while (cap < this.usados + n) cap *= 2
      const nuevo = new Float32Array(cap)
      nuevo.set(this.datos.subarray(0, this.usados))
      this.datos = nuevo
    }
    return this.datos
  }
}

export class EscritorTrazos {
  private b = new Crecible(FLOTANTES_TRAZO * 256)

  get cuenta(): number {
    return this.b.usados / FLOTANTES_TRAZO
  }

  segmento(x0: number, y0: number, x1: number, y1: number, ancho: number, c: RGBA): void {
    const d = this.b.reservar(FLOTANTES_TRAZO)
    let o = this.b.usados
    d[o++] = x0
    d[o++] = y0
    d[o++] = x1
    d[o++] = y1
    d[o++] = ancho
    d[o++] = c[0]
    d[o++] = c[1]
    d[o++] = c[2]
    d[o++] = c[3]
    this.b.usados = o
  }

  /** `pts` plano: [x0, y0, x1, y1, …]. */
  polilinea(pts: ArrayLike<number>, ancho: number, c: RGBA): void {
    for (let i = 2; i + 1 < pts.length; i += 2) this.segmento(pts[i - 2], pts[i - 1], pts[i], pts[i + 1], ancho, c)
  }

  resultado(): Float32Array {
    return this.b.datos.subarray(0, this.b.usados)
  }

  vaciar(): void {
    this.b.usados = 0
  }
}

export class EscritorTriangulos {
  private b = new Crecible(FLOTANTES_VERTICE * 3 * 64)

  /** Número de triángulos. */
  get cuenta(): number {
    return this.b.usados / (FLOTANTES_VERTICE * 3)
  }

  triangulo(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, c: RGBA): void {
    const d = this.b.reservar(FLOTANTES_VERTICE * 3)
    let o = this.b.usados
    for (const [x, y] of [[ax, ay], [bx, by], [cx, cy]]) {
      d[o++] = x
      d[o++] = y
      d[o++] = c[0]
      d[o++] = c[1]
      d[o++] = c[2]
      d[o++] = c[3]
    }
    this.b.usados = o
  }

  /** Un triángulo con su color en cada vértice (el resplandor de una luz, que se desvanece hacia afuera). */
  trianguloDegradado(ax: number, ay: number, ca: RGBA, bx: number, by: number, cb: RGBA, cx: number, cy: number, cc: RGBA): void {
    const d = this.b.reservar(FLOTANTES_VERTICE * 3)
    let o = this.b.usados
    for (const [x, y, c] of [[ax, ay, ca], [bx, by, cb], [cx, cy, cc]] as const) {
      d[o++] = x
      d[o++] = y
      d[o++] = c[0]
      d[o++] = c[1]
      d[o++] = c[2]
      d[o++] = c[3]
    }
    this.b.usados = o
  }

  resultado(): Float32Array {
    return this.b.datos.subarray(0, this.b.usados)
  }

  vaciar(): void {
    this.b.usados = 0
  }
}

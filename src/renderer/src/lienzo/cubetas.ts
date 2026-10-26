/** Rejilla de cubetas para preguntar rápido qué cajas tocan a otra; la usan el reparto de textos (`apartar.ts`) y el de
 * chips (`chips.ts`). */
import type { Caja } from '../piezas/tipos'

/** `Math.hypot` de dos distancias no negativas: con una en cero es exactamente la otra, que es el caso de casi todas las
 * cajas que no se cruzan. */
export const hipotenusa = (dx: number, dy: number): number => (dx === 0 ? dy : dy === 0 ? dx : Math.hypot(dx, dy))

/** Máximo de cubetas por caja. Con coordenadas de ±2^20 un cable de punta a punta ocuparía ~10^5 cubetas por eje y
 * congelaría la interfaz: la caja mayor va a `grandes` y la consulta mayor recorre todos los obstáculos, ambos lineales
 * en obstáculos. */
const MAX_CUBETAS = 64
/** Clave entera pequeña de una celda fuera de la rejilla densa. Da la vuelta cada 2,048 celdas: dos lejanas pueden
 * compartir cubeta, lo que solo agrega comparaciones. */
const clave = (cx: number, cy: number) => ((cx & 2047) << 11) | (cy & 2047)
/** La rejilla densa cubre la zona de los obstáculos si no tiene más celdas que esto ni que `CELDAS_POR_OBSTACULO` por
 * obstáculo (8 bytes por celda, a lo más 128 por obstáculo). */
const MIN_CELDAS_DENSAS = 4096
const CELDAS_POR_OBSTACULO = 16

/** Zona de la rejilla densa, en celdas. */
export interface Zona {
  x0: number
  y0: number
  ancho: number
  alto: number
}

/** Sello de la consulta de área en curso: marca qué obstáculos ya se sumaron sin crear un Set por consulta. */
let sello = 0

/** Rejilla de cubetas con los obstáculos (cajas en arreglo plano). `dueño` es la pieza cuyo cuerpo es el obstáculo, o −1.
 * Zona densa en listas enlazadas de arreglos tipados y afuera un Map por `clave`; cada celda conserva el orden de
 * agregado. Sin `indexar`, `agregar` solo guarda cajas para medir la zona. */
export class Cubetas {
  private cajas: Float64Array
  private dueños: Int32Array
  private marcas: Int32Array
  n = 0
  /** Obstáculos que ocupan más de `MAX_CUBETAS` cubetas: no están en las celdas y se revisan siempre. */
  readonly grandes: number[] = []
  private zona: Zona = { x0: 0, y0: 0, ancho: 0, alto: 0 }
  private indexada = false
  /** Por celda (las de la rejilla densa primero, luego las del Map), su primera y su última entrada; −1 si no tiene. */
  private cabeza = new Int32Array(0)
  private cola = new Int32Array(0)
  private nCeldas = 0
  /** Celdas fuera de la rejilla densa: clave → número de celda. */
  private fuera = new Map<number, number>()
  /** Por entrada, el obstáculo y la entrada siguiente de su celda (−1 al final). */
  private item: Int32Array
  private sig: Int32Array
  private nEntradas = 0

  /** `capacidad`: cajas esperadas (crece si llegan más). `lado`: de cada cubeta en unidades. `eps`: cuánto debe entrar una
   * caja en otra para contar como cruce (0: cualquier cruce). `zona`: zona densa ya elegida; sin ella `indexar` la mide. */
  constructor(capacidad: number, private readonly lado: number, private readonly eps: number, zona?: Zona) {
    const n = Math.max(16, capacidad)
    this.cajas = new Float64Array(4 * n)
    this.dueños = new Int32Array(n)
    this.marcas = new Int32Array(n)
    this.item = new Int32Array(2 * n)
    this.sig = new Int32Array(2 * n)
    if (zona) this.zona = zona
  }

  get zonaDensa(): Zona {
    return this.zona
  }

  agregar(minX: number, minY: number, maxX: number, maxY: number, dueño = -1): void {
    if (this.n === this.dueños.length) {
      const c = new Float64Array(this.cajas.length * 2)
      c.set(this.cajas)
      this.cajas = c
      const d = new Int32Array(this.dueños.length * 2)
      d.set(this.dueños)
      this.dueños = d
      const m = new Int32Array(this.marcas.length * 2)
      m.set(this.marcas)
      this.marcas = m
    }
    const i = this.n++
    this.cajas[4 * i] = minX
    this.cajas[4 * i + 1] = minY
    this.cajas[4 * i + 2] = maxX
    this.cajas[4 * i + 3] = maxY
    this.dueños[i] = dueño
    if (this.indexada) this.repartir(i)
  }

  /** Mide la zona densa (si no se dio una) y reparte en sus celdas las cajas guardadas; las siguientes se reparten al agregarlas. */
  indexar(): void {
    if (this.indexada) return
    if (this.zona.ancho === 0) this.zona = this.medirZona()
    const celdas = this.zona.ancho * this.zona.alto
    this.cabeza = new Int32Array(Math.max(16, celdas)).fill(-1)
    this.cola = new Int32Array(this.cabeza.length)
    this.nCeldas = celdas
    this.indexada = true
    for (let i = 0; i < this.n; i++) this.repartir(i)
  }

  /** Celdas que tocan las cajas que no son grandes, con una celda de orilla; vacía si serían demasiadas. */
  private medirZona(): Zona {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    const k = this.cajas
    for (let i = 0; i < this.n; i++) {
      const a = Math.floor(k[4 * i] / this.lado), b = Math.floor(k[4 * i + 1] / this.lado)
      const c = Math.floor(k[4 * i + 2] / this.lado), d = Math.floor(k[4 * i + 3] / this.lado)
      if (!((c - a + 1) * (d - b + 1) <= MAX_CUBETAS)) continue
      if (a < x0) x0 = a
      if (b < y0) y0 = b
      if (c > x1) x1 = c
      if (d > y1) y1 = d
    }
    const ancho = x1 - x0 + 3, alto = y1 - y0 + 3
    if (!(x0 <= x1) || !(ancho * alto <= Math.max(MIN_CELDAS_DENSAS, CELDAS_POR_OBSTACULO * this.n))) return { x0: 0, y0: 0, ancho: 0, alto: 0 }
    return { x0: x0 - 1, y0: y0 - 1, ancho, alto }
  }

  private repartir(i: number): void {
    const k = this.cajas
    const x0 = Math.floor(k[4 * i] / this.lado), y0 = Math.floor(k[4 * i + 1] / this.lado)
    const x1 = Math.floor(k[4 * i + 2] / this.lado), y1 = Math.floor(k[4 * i + 3] / this.lado)
    // `!(… <= MAX)` también manda aquí las cajas con coordenadas no finitas.
    if (!((x1 - x0 + 1) * (y1 - y0 + 1) <= MAX_CUBETAS)) {
      this.grandes.push(i)
      return
    }
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) this.poner(this.crearCelda(cx, cy), i)
  }

  /** Número de la celda (cx, cy), o −1 si nadie la ha usado. */
  private celda(cx: number, cy: number): number {
    const z = this.zona
    const gx = cx - z.x0, gy = cy - z.y0
    if (gx >= 0 && gx < z.ancho && gy >= 0 && gy < z.alto) return gx * z.alto + gy
    return this.fuera.get(clave(cx, cy)) ?? -1
  }

  private crearCelda(cx: number, cy: number): number {
    const z = this.zona
    const gx = cx - z.x0, gy = cy - z.y0
    if (gx >= 0 && gx < z.ancho && gy >= 0 && gy < z.alto) return gx * z.alto + gy
    const k = clave(cx, cy)
    const hecha = this.fuera.get(k)
    if (hecha !== undefined) return hecha
    if (this.nCeldas === this.cabeza.length) {
      const c = new Int32Array(this.cabeza.length * 2).fill(-1)
      c.set(this.cabeza)
      this.cabeza = c
      const t = new Int32Array(c.length)
      t.set(this.cola)
      this.cola = t
    }
    const n = this.nCeldas++
    this.fuera.set(k, n)
    return n
  }

  private poner(celda: number, i: number): void {
    if (this.nEntradas === this.item.length) {
      const a = new Int32Array(this.item.length * 2)
      a.set(this.item)
      this.item = a
      const b = new Int32Array(this.sig.length * 2)
      b.set(this.sig)
      this.sig = b
    }
    const e = this.nEntradas++
    this.item[e] = i
    this.sig[e] = -1
    if (this.cabeza[celda] === -1) this.cabeza[celda] = e
    else this.sig[this.cola[celda]] = e
    this.cola[celda] = e
  }

  private cruza(i: number, c: Caja, propia: number): boolean {
    if (this.dueños[i] === propia) return false
    const k = this.cajas
    return k[4 * i] < c.maxX - this.eps && c.minX < k[4 * i + 2] - this.eps && k[4 * i + 1] < c.maxY - this.eps && c.minY < k[4 * i + 3] - this.eps
  }

  /** Algún obstáculo cruza la caja, sin contar el cuerpo de la pieza número `propia` (por omisión, ninguna). */
  choca(c: Caja, propia = -2): boolean {
    if (this.n === 0) return false
    const x0 = Math.floor(c.minX / this.lado), y0 = Math.floor(c.minY / this.lado)
    const x1 = Math.floor(c.maxX / this.lado), y1 = Math.floor(c.maxY / this.lado)
    if (!((x1 - x0 + 1) * (y1 - y0 + 1) <= MAX_CUBETAS)) {
      for (let i = 0; i < this.n; i++) if (this.cruza(i, c, propia)) return true
      return false
    }
    for (const i of this.grandes) if (this.cruza(i, c, propia)) return true
    for (let cx = x0; cx <= x1; cx++)
      for (let cy = y0; cy <= y1; cy++) {
        const celda = this.celda(cx, cy)
        if (celda < 0) continue
        for (let e = this.cabeza[celda]; e !== -1; e = this.sig[e]) if (this.cruza(this.item[e], c, propia)) return true
      }
    return false
  }

  /** Algún obstáculo de dueño mayor que `rango` cruza la caja (los dueños son, aquí, el lugar de su pieza en el orden de colocación). */
  chocaDeRango(c: Caja, rango: number): boolean {
    if (this.n === 0) return false
    const x0 = Math.floor(c.minX / this.lado), y0 = Math.floor(c.minY / this.lado)
    const x1 = Math.floor(c.maxX / this.lado), y1 = Math.floor(c.maxY / this.lado)
    const cruza = (i: number) => {
      const k = this.cajas
      return this.dueños[i] > rango && k[4 * i] < c.maxX - this.eps && c.minX < k[4 * i + 2] - this.eps && k[4 * i + 1] < c.maxY - this.eps && c.minY < k[4 * i + 3] - this.eps
    }
    if (!((x1 - x0 + 1) * (y1 - y0 + 1) <= MAX_CUBETAS)) {
      for (let i = 0; i < this.n; i++) if (cruza(i)) return true
      return false
    }
    for (const i of this.grandes) if (cruza(i)) return true
    for (let cx = x0; cx <= x1; cx++)
      for (let cy = y0; cy <= y1; cy++) {
        const celda = this.celda(cx, cy)
        if (celda < 0) continue
        for (let e = this.cabeza[celda]; e !== -1; e = this.sig[e]) if (cruza(this.item[e])) return true
      }
    return false
  }

  /** Suma el área encimada del obstáculo `i` si no se sumó ya en esta consulta (`sello`). */
  private sumarArea(i: number, c: Caja, propia: number): number {
    if (this.marcas[i] === sello || this.dueños[i] === propia) return 0
    this.marcas[i] = sello
    const k = this.cajas
    const w = Math.min(k[4 * i + 2], c.maxX) - Math.max(k[4 * i], c.minX)
    const h = Math.min(k[4 * i + 3], c.maxY) - Math.max(k[4 * i + 1], c.minY)
    return w > 0 && h > 0 ? w * h : 0
  }

  /** Área total en que la caja `c` se encima con los obstáculos de `a` y luego de `b`, sin el cuerpo de `propia`. Suma en
   * el orden de una sola rejilla con los de `a` antes que los de `b`: primero los grandes, luego celda por celda. */
  static areaSolapada(a: Cubetas, b: Cubetas, c: Caja, propia: number): number {
    if (++sello === 0x7fffffff) {
      sello = 1
      a.marcas.fill(0)
      b.marcas.fill(0)
    }
    const x0 = Math.floor(c.minX / a.lado), y0 = Math.floor(c.minY / a.lado)
    const x1 = Math.floor(c.maxX / a.lado), y1 = Math.floor(c.maxY / a.lado)
    let total = 0
    if (!((x1 - x0 + 1) * (y1 - y0 + 1) <= MAX_CUBETAS)) {
      for (let i = 0; i < a.n; i++) total += a.sumarArea(i, c, propia)
      for (let i = 0; i < b.n; i++) total += b.sumarArea(i, c, propia)
      return total
    }
    for (const i of a.grandes) total += a.sumarArea(i, c, propia)
    for (const i of b.grandes) total += b.sumarArea(i, c, propia)
    for (let cx = x0; cx <= x1; cx++)
      for (let cy = y0; cy <= y1; cy++)
        for (const r of [a, b]) {
          const celda = r.celda(cx, cy)
          if (celda < 0) continue
          for (let e = r.cabeza[celda]; e !== -1; e = r.sig[e]) total += r.sumarArea(r.item[e], c, propia)
        }
    return total
  }

  /** ¿Algún obstáculo ajeno a `propia` queda a `d` o menos de la caja `c`? Sirve para comprobar que un texto esté más
   * cerca de su pieza que de cualquier otra. */
  masCercaQue(c: Caja, d: number, propia: number): boolean {
    if (this.n === 0) return false
    const r = d + this.eps
    const x0 = Math.floor((c.minX - r) / this.lado), y0 = Math.floor((c.minY - r) / this.lado)
    const x1 = Math.floor((c.maxX + r) / this.lado), y1 = Math.floor((c.maxY + r) / this.lado)
    if (!((x1 - x0 + 1) * (y1 - y0 + 1) <= MAX_CUBETAS)) {
      for (let i = 0; i < this.n; i++) if (this.dueños[i] !== propia && this.distancia(i, c) <= r) return true
      return false
    }
    for (const i of this.grandes) if (this.dueños[i] !== propia && this.distancia(i, c) <= r) return true
    for (let cx = x0; cx <= x1; cx++)
      for (let cy = y0; cy <= y1; cy++) {
        const celda = this.celda(cx, cy)
        if (celda < 0) continue
        for (let e = this.cabeza[celda]; e !== -1; e = this.sig[e]) {
          const i = this.item[e]
          if (this.dueños[i] !== propia && this.distancia(i, c) <= r) return true
        }
      }
    return false
  }

  private distancia(i: number, c: Caja): number {
    const k = this.cajas
    return hipotenusa(Math.max(0, k[4 * i] - c.maxX, c.minX - k[4 * i + 2]), Math.max(0, k[4 * i + 1] - c.maxY, c.minY - k[4 * i + 3]))
  }
}


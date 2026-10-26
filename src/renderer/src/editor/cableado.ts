import type { Punto } from '../doc/tipos'
import { iguales, limpiarPolilinea, rutaL } from './rutas'

/** Ruta de `desde` a `hasta`; `horizontalPrimero` es la L que pide el usuario. */
export type Ruteador = (desde: Punto, hasta: Punto, horizontalPrimero: boolean) => Punto[]

export class CableEnCurso {
  private fijos: Punto[]
  /** Los puntos fijos de antes de cada clic: Retroceso quita un clic completo, no un punto suelto. */
  private antes: Punto[][] = []
  private cursor: Punto
  /** null: la decide el próximo movimiento. */
  private horizontal: boolean | null = null

  /** Última ruta calculada: se recalcula solo si cambian el punto fijo, el cursor o la L pedida. */
  private memo: { clave: string; ruta: Punto[] } | null = null

  constructor(inicio: Punto, private rutear: Ruteador = rutaL) {
    this.fijos = [inicio]
    this.cursor = inicio
  }

  get inicio(): Punto {
    return this.fijos[0]
  }

  private get ultimo(): Punto {
    return this.fijos[this.fijos.length - 1]
  }

  private decidir(): boolean {
    return this.horizontal ?? Math.abs(this.cursor.x - this.ultimo.x) >= Math.abs(this.cursor.y - this.ultimo.y)
  }

  mover(p: Punto): void {
    this.cursor = p
    if (this.horizontal === null && !iguales(p, this.ultimo)) this.horizontal = this.decidir()
  }

  invertir(): void {
    this.horizontal = !this.decidir()
  }

  fijarEsquina(): void {
    if (iguales(this.cursor, this.ultimo)) return
    this.antes.push(this.fijos)
    this.fijos = this.vista()
    this.horizontal = null
  }

  quitarEsquina(): boolean {
    const previos = this.antes.pop()
    if (!previos) return false
    this.fijos = previos
    this.horizontal = null
    return true
  }

  private tramo(): Punto[] {
    const u = this.ultimo, c = this.cursor, h = this.decidir()
    const clave = `${u.x},${u.y}|${c.x},${c.y}|${h}`
    if (this.memo?.clave !== clave) this.memo = { clave, ruta: this.rutear(u, c, h) }
    return this.memo.ruta
  }

  vista(): Punto[] {
    return limpiarPolilinea([...this.fijos, ...this.tramo().slice(1)])
  }

  terminar(en: Punto): Punto[] {
    this.mover(en)
    return this.vista()
  }
}

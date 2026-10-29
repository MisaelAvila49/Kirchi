import type { Id } from '../doc/tipos'
import { teclasPulsadas } from '../lienzo/contactos'

/** Teclas de un teclado matricial que se sostienen ahora, cada una con lo que la aprieta («puntero» o «tecla:5»). Una tecla
 * se cierra con la primera vía que la aprieta y se abre al soltar la última; `enviar` escribe el canal del motor. */
export class TeclasSostenidas {
  private readonly vias = new Map<string, { id: Id; k: number }>()

  constructor(private readonly enviar: (id: Id, k: number, cerrada: boolean) => void) {}

  private cuantas(id: Id, k: number): number {
    let n = 0
    for (const v of this.vias.values()) if (v.id === id && v.k === k) n++
    return n
  }

  private publicar(id: Id): void {
    const k = [...this.vias.values()].filter((v) => v.id === id).map((v) => v.k)
    if (k.length) teclasPulsadas.set(id, new Set(k))
    else teclasPulsadas.delete(id)
  }

  /** Aprieta la tecla `k` de `id` con `via`. false si esa vía ya la sostenía. */
  apretar(via: string, id: Id, k: number): boolean {
    if (this.vias.has(via)) return false
    const primera = this.cuantas(id, k) === 0
    this.vias.set(via, { id, k })
    this.publicar(id)
    if (primera) this.enviar(id, k, true)
    return true
  }

  private sacar(pred: (via: string) => boolean): boolean {
    const afectadas = [...this.vias.entries()].filter(([via]) => pred(via))
    for (const [via] of afectadas) this.vias.delete(via)
    for (const [, v] of afectadas) {
      if (this.cuantas(v.id, v.k) === 0) this.enviar(v.id, v.k, false)
      this.publicar(v.id)
    }
    return afectadas.length > 0
  }

  /** Suelta lo que sostenía `via`; true si había algo. */
  soltarVia(via: string): boolean {
    return this.sacar((v) => v === via)
  }

  /** Suelta todas las vías que empiezan con `prefijo` (las teclas de la computadora). */
  soltarPrefijo(prefijo: string): boolean {
    return this.sacar((v) => v.startsWith(prefijo))
  }

  soltarTodas(): boolean {
    return this.sacar(() => true)
  }

  hay(): boolean {
    return this.vias.size > 0
  }
}

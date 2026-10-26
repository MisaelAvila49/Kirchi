export interface RelojDemora {
  poner(f: () => void, ms: number): unknown
  quitar(t: unknown): void
}

const relojReal: RelojDemora = { poner: (f, ms) => setTimeout(f, ms), quitar: (t) => clearTimeout(t as ReturnType<typeof setTimeout>) }

/** Junta peticiones seguidas: solo la última se hace, `ms` después. */
export class Demora {
  private pendiente: (() => void) | null = null
  private t: unknown = null

  constructor(
    private ms: number,
    private reloj: RelojDemora = relojReal
  ) {}

  pedir(f: () => void): void {
    this.pendiente = f
    if (this.t !== null) this.reloj.quitar(this.t)
    this.t = this.reloj.poner(() => this.vaciar(), this.ms)
  }

  /** Hace ya lo pendiente, si hay. */
  vaciar(): void {
    if (this.t !== null) this.reloj.quitar(this.t)
    this.t = null
    const f = this.pendiente
    this.pendiente = null
    f?.()
  }
}

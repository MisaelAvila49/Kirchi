import type { CapituloDef, CtxTutorial, PasoDef } from './tipos'

/** Lo que la interfaz pinta del motor. Inmutable: cada cambio entrega uno nuevo. */
export interface EstadoMotor {
  capitulo: CapituloDef
  /** Índice del paso actual (desde 0). */
  paso: number
  /** El paso ya se cumplió (queda así aunque la persona deshaga lo hecho: avanza ella). */
  cumplido: boolean
}

/** Evento que el motor suma solo: durante el paso la simulación estuvo arrancando, corriendo o en pausa. */
export const EVENTO_SIM_ACTIVA = 'sim-activa'

export interface OyentesMotor {
  /** Cambió el paso o su estado (la interfaz repinta). */
  alCambiar(): void
  /** Hay que guardar el avance de un capítulo en los ajustes. `terminado` solo se manda en verdadero al acabar: no desmarca un capítulo ya hecho. */
  alAvanzar(id: string, paso: number, terminado: boolean): void
  /** Se llegó al final del último paso. */
  alTerminar(c: CapituloDef): void
}

/**
 * Motor de pasos de «Aprende Kirchi». No sabe de la interfaz ni de Solid. Las condiciones solo observan: nunca simula ni edita.
 */
export class MotorTutorial {
  private cap: CapituloDef | null = null
  private i = 0
  private ok = false
  private ultimo: CtxTutorial | null = null
  /** Lo que la aplicación hizo desde que empezó el paso actual (guardar, exportar, abrir una reciente…). */
  private eventos = new Set<string>()

  constructor(private readonly oyentes: OyentesMotor) {}

  estado(): EstadoMotor | null {
    return this.cap ? { capitulo: this.cap, paso: this.i, cumplido: this.ok } : null
  }

  get activo(): boolean {
    return this.cap !== null
  }

  pasoActual(): PasoDef | null {
    return this.cap ? this.cap.pasos[this.i] : null
  }

  /** Empieza (o retoma) un capítulo en el paso `desde`; uno sin pasos no arranca. */
  iniciar(c: CapituloDef, desde = 0): boolean {
    if (c.pasos.length === 0) return false
    this.cap = c
    this.i = Math.max(0, Math.min(desde, c.pasos.length - 1))
    this.ok = false
    this.eventos = new Set()
    // Lo que se vio en una sesión anterior ya no vale: con ello, salir, deshacer y volver daba por cumplido el paso con el
    // documento de antes. El primer `evaluar` trae el documento de ahora.
    this.ultimo = null
    this.oyentes.alAvanzar(c.id, this.i, false)
    this.revisar()
    this.oyentes.alCambiar()
    return true
  }

  /** Lo que el editor y la simulación muestran ahora. Si cumple el paso actual, lo marca; una vez cumplido ya no se desmarca. */
  evaluar(ctx: CtxTutorial): void {
    this.ultimo = ctx
    if (this.revisar()) this.oyentes.alCambiar()
  }

  private revisar(): boolean {
    if (!this.cap || this.ok || !this.ultimo) return false
    // Que la simulación estuvo en marcha durante el paso: «detenida» solo cuenta si antes se vio otra fase en este paso.
    if (this.ultimo.fase !== 'detenida') this.eventos.add(EVENTO_SIM_ACTIVA)
    if (!this.cap.pasos[this.i].hecho({ ...this.ultimo, eventos: this.eventos })) return false
    this.ok = true
    return true
  }

  /** Algo que la aplicación hizo de verdad (un archivo guardado, una selección exportada…): cuenta solo para el paso en curso. */
  registrar(evento: string): void {
    if (!this.cap) return
    this.eventos.add(evento)
    if (this.revisar()) this.oyentes.alCambiar()
  }

  /** Pasa al paso siguiente; en el último, el capítulo termina. Solo si el paso se cumplió (para saltar sin cumplir, `saltar`). */
  siguiente(): void {
    if (this.cap && this.ok) this.mover(this.i + 1)
  }

  /** Salta el paso sin que se cumpla. */
  saltar(): void {
    if (this.cap) this.mover(this.i + 1)
  }

  atras(): void {
    if (this.cap && this.i > 0) this.mover(this.i - 1)
  }

  private mover(a: number): void {
    const c = this.cap!
    if (a >= c.pasos.length) {
      this.cap = null
      this.ok = false
      this.oyentes.alAvanzar(c.id, c.pasos.length, true)
      this.oyentes.alTerminar(c)
      this.oyentes.alCambiar()
      return
    }
    this.i = a
    this.ok = false
    this.eventos = new Set()
    this.oyentes.alAvanzar(c.id, a, false)
    this.revisar()
    this.oyentes.alCambiar()
  }

  /** Sale del capítulo; el avance ya quedó guardado en el paso en que iba. */
  salir(): void {
    if (!this.cap) return
    this.cap = null
    this.ok = false
    this.oyentes.alCambiar()
  }
}

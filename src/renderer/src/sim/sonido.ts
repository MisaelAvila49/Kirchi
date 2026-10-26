import type { Id } from '../doc/tipos'
import type { CrucesSim } from './client'

/** Lo que suena: tono del zumbador, pitido de continuidad y clic del relé. El tono se programa desde los cruces del motor
 * (la lectura de 10 Hz llega tarde con la ventana en segundo plano). Dos piezas: el plan (puro, probado en Vitest) y el
 * altavoz (WebAudio), que no crea su contexto hasta la primera orden que suena. */

/** Latencia fija con que se programa un cruce: lo que tarda en llegar del worker más un margen. */
export const LATENCIA_MS = 60
/** Rampa de entrada y salida de cada tono, para no hacer chasquidos. */
export const RAMPA_S = 0.005
/** Un zumbador que cambia más veces que esto en un segundo de reloj suena continuo con el volumen por su fracción encendida. */
export const CAMBIOS_CONTINUO = 20
/** Tope de clics de relé por segundo de reloj. */
export const CLICS_POR_SEGUNDO = 20
/** El pitido de continuidad del multímetro. */
export const FRECUENCIA_CONTINUIDAD = 2000
export const ID_CONTINUIDAD = 'continuidad'
/** Duración de un clic de relé. */
export const DURACION_CLIC_S = 0.012
const VENTANA_MS = 1000
/** Un zumbador en modo continuo que lleva esto sin cambiar vuelve a seguir sus cambios. */
const QUIETO_MS = 2 * (VENTANA_MS / CAMBIOS_CONTINUO)

export type FormaOnda = 'triangular' | 'senoidal' | 'cuadrada'

/** Instante de época (`performance.timeOrigin + performance.now()`, como lo manda el worker) pasado al `performance.now()`
 * de esta ventana, el reloj con que el altavoz programa los tonos. */
export const epocaALocal = (epoca: number, origenLocal: number = performance.timeOrigin): number => epoca - origenLocal

/** Lo que el plan manda al altavoz, con el instante de reloj (ms de `performance.now()`) en que debe pasar. */
export type OrdenSonido =
  | { tipo: 'tono'; id: string; en: number; frecuencia: number; onda: FormaOnda; ganancia: number }
  | { tipo: 'calla'; id: string; en: number }
  | { tipo: 'clic'; en: number }

/** Qué es la pieza de un cruce: un zumbador con su tono, un relé, u otra cosa (no suena). */
export type FuenteSonora = { tipo: 'zumbador'; frecuencia: number; onda: FormaOnda } | { tipo: 'rele' } | null

interface Zumbador {
  /** Cambios (instante de reloj y nivel) del último segundo. */
  cambios: { en: number; nivel: number }[]
  suena: boolean
  continuo: boolean
}

export class PlanDeSonido {
  private zumbadores = new Map<Id, Zumbador>()
  private clics: number[] = []
  private continuidad = false
  /** Lo que está sonando (para callarlo todo). */
  private sonando = new Set<string>()

  /** El instante de reloj de un cruce: su tiempo simulado pasado con el ancla y la velocidad, más la latencia fija. */
  static aReloj(t: number, c: Pick<CrucesSim, 'ancla' | 'velocidad'>): number {
    const v = c.velocidad > 0 && Number.isFinite(c.velocidad) ? c.velocidad : 1
    return c.ancla.reloj + ((t - c.ancla.t) / v) * 1000 + LATENCIA_MS
  }

  /** Los cruces de una tanda del worker, en orden, con lo que suena cada pieza. */
  cruces(c: CrucesSim, pieza: (elemento: number) => Id | undefined, fuente: (id: Id) => FuenteSonora): OrdenSonido[] {
    const out: OrdenSonido[] = []
    for (const x of c.cruces) {
      const id = pieza(x.elemento)
      const f = id === undefined ? null : fuente(id)
      if (!f || id === undefined) continue
      const en = PlanDeSonido.aReloj(x.t, c)
      if (f.tipo === 'rele') {
        while (this.clics.length && this.clics[0] < en - VENTANA_MS) this.clics.shift()
        if (this.clics.length >= CLICS_POR_SEGUNDO) continue
        this.clics.push(en)
        out.push({ tipo: 'clic', en })
        continue
      }
      out.push(...this.cambioDeZumbador(id, f, en, x.nivel))
    }
    return out
  }

  private cambioDeZumbador(id: Id, f: Extract<FuenteSonora, { tipo: 'zumbador' }>, en: number, nivel: number): OrdenSonido[] {
    let z = this.zumbadores.get(id)
    if (!z) this.zumbadores.set(id, (z = { cambios: [], suena: false, continuo: false }))
    z.cambios.push({ en, nivel })
    while (z.cambios.length > 1 && z.cambios[0].en < en - VENTANA_MS) z.cambios.shift()
    const continuo = z.cambios.length > CAMBIOS_CONTINUO
    if (continuo) {
      // Suena continuo con el volumen por la fracción del último segundo en que estuvo encendido.
      const fraccion = fraccionEncendida(z.cambios, en)
      z.continuo = true
      z.suena = true
      this.sonando.add(id)
      return [{ tipo: 'tono', id, en, frecuencia: f.frecuencia, onda: f.onda, ganancia: fraccion }]
    }
    const venia = z.continuo
    z.continuo = false
    if (nivel > 0 && (!z.suena || venia)) {
      z.suena = true
      this.sonando.add(id)
      return [{ tipo: 'tono', id, en, frecuencia: f.frecuencia, onda: f.onda, ganancia: 1 }]
    }
    if (nivel === 0 && z.suena) {
      z.suena = false
      this.sonando.delete(id)
      return [{ tipo: 'calla', id, en }]
    }
    return []
  }

  /** En cada lectura: un zumbador que sonaba continuo y dejó de cambiar se queda en su último nivel (callado o a todo
   * volumen). Sin esto, uno que se apaga del todo tras una cuadrada rápida seguiría sonando. */
  revisar(ahora: number): OrdenSonido[] {
    const out: OrdenSonido[] = []
    for (const [id, z] of this.zumbadores) {
      const ultimo = z.cambios[z.cambios.length - 1]
      if (!z.continuo || !ultimo || ahora - ultimo.en < QUIETO_MS) continue
      z.continuo = false
      z.cambios = [ultimo]
      if (ultimo.nivel > 0) continue
      z.suena = false
      this.sonando.delete(id)
      out.push({ tipo: 'calla', id, en: ahora })
    }
    return out
  }

  /** El pitido de continuidad sigue a la lectura del multímetro («hay paso»). */
  continuidadEs(hayPaso: boolean, ahora: number): OrdenSonido[] {
    if (hayPaso === this.continuidad) return []
    this.continuidad = hayPaso
    if (hayPaso) {
      this.sonando.add(ID_CONTINUIDAD)
      return [{ tipo: 'tono', id: ID_CONTINUIDAD, en: ahora, frecuencia: FRECUENCIA_CONTINUIDAD, onda: 'senoidal', ganancia: 1 }]
    }
    this.sonando.delete(ID_CONTINUIDAD)
    return [{ tipo: 'calla', id: ID_CONTINUIDAD, en: ahora }]
  }

  /** Al pausar, al detener, al ocultar la ventana y al silenciar: todo calla ya y el plan olvida lo que sonaba. */
  callarTodo(ahora: number): OrdenSonido[] {
    const out: OrdenSonido[] = [...this.sonando].map((id) => ({ tipo: 'calla' as const, id, en: ahora }))
    this.sonando.clear()
    this.zumbadores.clear()
    this.clics = []
    this.continuidad = false
    return out
  }
}

/** Fracción del tiempo encendido en la ventana de cambios que termina en `fin`. */
function fraccionEncendida(cambios: readonly { en: number; nivel: number }[], fin: number): number {
  const desde = cambios[0].en
  if (fin <= desde) return 1
  let encendido = 0
  for (let k = 0; k < cambios.length; k++) {
    const hasta = k + 1 < cambios.length ? cambios[k + 1].en : fin
    if (cambios[k].nivel > 0) encendido += hasta - cambios[k].en
  }
  return Math.max(0.05, Math.min(1, encendido / (fin - desde)))
}

/** Lo de WebAudio que usa el altavoz (las pruebas lo cambian por uno falso). */
export interface ContextoAudio {
  readonly currentTime: number
  readonly state: string
  readonly destination: unknown
  resume(): Promise<void>
  close(): Promise<void>
  createOscillator(): { type: string; frequency: { value: number }; connect(n: unknown): unknown; start(t?: number): void; stop(t?: number): void }
  createGain(): { gain: { value: number; setValueAtTime(v: number, t: number): unknown; linearRampToValueAtTime(v: number, t: number): unknown; cancelScheduledValues(t: number): unknown }; connect(n: unknown): unknown }
}

const TIPO_ONDA: Record<FormaOnda, string> = { triangular: 'triangle', senoidal: 'sine', cuadrada: 'square' }

/** El altavoz: un contexto de audio creado la primera vez que una orden suena (siempre tras el gesto que inició la
 * simulación), un oscilador por tono y un clic corto por cambio de relé. `bloqueado` dice si el sistema no lo deja sonar
 * (la barra de estado lo dice y un clic lo reanuda). */
export class Altavoz {
  private ctx: ContextoAudio | null = null
  private tonos = new Map<string, { osc: ReturnType<ContextoAudio['createOscillator']>; gan: ReturnType<ContextoAudio['createGain']>; ganancia: number }>()
  private volumen = 0.5
  bloqueado = false

  constructor(
    private crear: () => ContextoAudio | null,
    private reloj: () => number = () => performance.now(),
    private alBloqueo: (si: boolean) => void = () => {}
  ) {}

  /** Si ya existe el contexto de audio (las pruebas comprueban que no se crea antes de tiempo). */
  get creado(): boolean {
    return this.ctx !== null
  }

  ponerVolumen(v: number): void {
    this.volumen = Math.max(0, Math.min(1, v))
    if (!this.ctx) return
    const t = this.ctx.currentTime
    for (const x of this.tonos.values()) x.gan.gain.linearRampToValueAtTime(this.volumen * x.ganancia * GANANCIA_TONO, t + RAMPA_S)
  }

  /** Segundos del contexto para un instante de reloj (ms), nunca en el pasado. */
  private cuando(ctx: ContextoAudio, en: number): number {
    return ctx.currentTime + Math.max(0, (en - this.reloj()) / 1000)
  }

  private contexto(): ContextoAudio | null {
    if (!this.ctx) {
      this.ctx = this.crear()
      if (!this.ctx) return null
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().then(
        () => this.marcarBloqueo(this.ctx?.state === 'suspended'),
        () => this.marcarBloqueo(true)
      )
      this.marcarBloqueo(true)
    }
    return this.ctx
  }

  private marcarBloqueo(si: boolean): void {
    if (si === this.bloqueado) return
    this.bloqueado = si
    this.alBloqueo(si)
  }

  /** Un clic sobre la barra de estado: el sistema deja sonar después de un gesto. */
  reanudar(): void {
    this.ctx?.resume().then(() => this.marcarBloqueo(this.ctx?.state === 'suspended'), () => {})
  }

  aplicar(ordenes: readonly OrdenSonido[]): void {
    if (ordenes.length === 0) return
    const suena = ordenes.some((o) => o.tipo !== 'calla')
    if (!this.ctx && !suena) return
    const ctx = this.contexto()
    if (!ctx) return
    for (const o of ordenes) {
      const t = this.cuando(ctx, o.en)
      if (o.tipo === 'tono') {
        const vivo = this.tonos.get(o.id)
        if (vivo) {
          vivo.ganancia = o.ganancia
          vivo.gan.gain.linearRampToValueAtTime(this.volumen * o.ganancia * GANANCIA_TONO, t + RAMPA_S)
          continue
        }
        const osc = ctx.createOscillator(), gan = ctx.createGain()
        osc.type = TIPO_ONDA[o.onda]
        osc.frequency.value = o.frecuencia
        gan.gain.setValueAtTime(0, t)
        gan.gain.linearRampToValueAtTime(this.volumen * o.ganancia * GANANCIA_TONO, t + RAMPA_S)
        osc.connect(gan)
        gan.connect(ctx.destination)
        osc.start(t)
        this.tonos.set(o.id, { osc, gan, ganancia: o.ganancia })
      } else if (o.tipo === 'calla') {
        const vivo = this.tonos.get(o.id)
        if (!vivo) continue
        this.tonos.delete(o.id)
        vivo.gan.gain.setValueAtTime(vivo.gan.gain.value, t)
        vivo.gan.gain.linearRampToValueAtTime(0, t + RAMPA_S)
        vivo.osc.stop(t + 2 * RAMPA_S)
      } else {
        const osc = ctx.createOscillator(), gan = ctx.createGain()
        osc.type = 'square'
        osc.frequency.value = 900
        gan.gain.setValueAtTime(0, t)
        gan.gain.linearRampToValueAtTime(this.volumen * GANANCIA_CLIC, t + 0.001)
        gan.gain.linearRampToValueAtTime(0, t + DURACION_CLIC_S)
        osc.connect(gan)
        gan.connect(ctx.destination)
        osc.start(t)
        osc.stop(t + DURACION_CLIC_S + RAMPA_S)
      }
    }
  }

  /** Todo calla ya, con su rampa. */
  callar(): void {
    if (!this.ctx) return
    this.aplicar([...this.tonos.keys()].map((id) => ({ tipo: 'calla' as const, id, en: this.reloj() })))
  }

  cerrar(): void {
    this.callar()
    void this.ctx?.close()
    this.ctx = null
  }
}

/** Ganancias de salida a volumen pleno: un tono de zumbador a 2.7 kHz es fuerte; el clic, más suave. */
export const GANANCIA_TONO = 0.25
export const GANANCIA_CLIC = 0.2

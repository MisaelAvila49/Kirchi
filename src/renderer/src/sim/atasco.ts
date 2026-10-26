/** Trabajo perdido (iteraciones de Newton que no convergieron) permitido por llamada al motor, en ms. El rescate de
 * convergencia es reanudable, así que basta un cuarto de segundo: pausa, detener y cambios en caliente esperan a lo sumo
 * eso. */
export const MS_PERDIDOS_POR_LLAMADA = 250
/** Cotas del presupuesto de iteraciones por llamada (el motor usa 20,000 por omisión). */
export const ITER_MIN = 300
export const ITER_MAX = 20_000
/** Segundos de trabajo del motor sin que avance el tiempo simulado tras los que la vista previa se rinde con un mensaje que nombra la pieza. */
export const SEGUNDOS_SIN_PROGRESO = 5

/** Iteraciones perdidas permitidas por `advance_to` para que una llamada atascada devuelva el control en cerca de 0.25 s.
 * Sin medida se escala con el tamaño (0.38 ms por iteración con 1,023 redes y 2,297 elementos). Nunca baja de `ITER_MIN`:
 * un nivel del rescate necesita hasta 100 iteraciones seguidas. */
export class PresupuestoDeIteraciones {
  /** Milisegundos por iteración perdida, suavizados. */
  private msPorIter: number

  /** `tamano`: nodos más elementos del circuito. */
  constructor(tamano: number) {
    this.msPorIter = Math.max(0.0005, 0.0002 * tamano)
  }

  iteraciones(): number {
    return Math.min(ITER_MAX, Math.max(ITER_MIN, Math.floor(MS_PERDIDOS_POR_LLAMADA / this.msPorIter)))
  }

  /** Registra que `perdidas` iteraciones perdidas tardaron `ms`: sube al instante si se encarecen, baja un 30 % hacia lo nuevo. */
  medir(ms: number, perdidas: number): void {
    if (!(perdidas >= 20) || !(ms > 0) || !Number.isFinite(ms)) return
    const m = ms / perdidas
    this.msPorIter = m > this.msPorIter ? m : 0.7 * this.msPorIter + 0.3 * m
  }
}

/** Avance mínimo del tiempo simulado (s) que cuenta como progreso: arrastrarse a pasos de nanosegundos no reinicia la cuenta. */
export const AVANCE_MINIMO = 1e-9

/** Vigila que el tiempo simulado avance: si el motor gasta `limiteMs` sin avanzar al menos `AVANCE_MINIMO`, está atascado.
 * Cuenta solo el tiempo dentro del motor (`gastar`), así una pausa de diez segundos no suma; un cambio de velocidad
 * reinicia la cuenta. */
export class VigilanteDeProgreso {
  private marca = Number.NEGATIVE_INFINITY
  private trabajo = 0

  constructor(private limiteMs = SEGUNDOS_SIN_PROGRESO * 1000) {}

  /** El tiempo simulado `t`: si avanzó al menos `AVANCE_MINIMO` desde la última marca, reinicia la cuenta. */
  observar(t: number): void {
    if (t - this.marca >= AVANCE_MINIMO) {
      this.marca = t
      this.trabajo = 0
    }
  }

  /** Suma `ms` de trabajo del motor que no avanzó el tiempo. */
  gastar(ms: number): void {
    this.trabajo += ms
  }

  /** Vuelve a empezar (la velocidad cambió: pausa, reanudar). */
  reiniciar(): void {
    this.trabajo = 0
  }

  atascado(): boolean {
    return this.trabajo > this.limiteMs
  }
}

/** Lo que `avanzarSinColgarse` necesita del simulador (el `Simulator` del WASM lo cumple). */
export interface MotorAvanzable {
  time(): number
  advance_to(meta: number, maxPasos: number): number
  set_iteration_budget(n: number): void
  lost_iterations(): number
}

/** Llamada a `advance_to` con el presupuesto de iteraciones perdidas. Si lo agota no lanza: devuelve el aviso de no
 * convergencia (`atasco`) para que el worker ceda el turno y la siguiente llamada continúe, y mide cuánto costó cada
 * iteración. Cualquier otro error sí se lanza. */
export function avanzarSinColgarse(sim: MotorAvanzable, meta: number, maxPasos: number, presupuesto: PresupuestoDeIteraciones, ahora: () => number): { pasos: number; atasco: string | null; ms: number } {
  const inicio = ahora()
  sim.set_iteration_budget(presupuesto.iteraciones())
  try {
    const pasos = sim.advance_to(meta, maxPasos)
    return { pasos, atasco: null, ms: ahora() - inicio }
  } catch (err) {
    const atasco = mensajeDeAtasco(err instanceof Error ? err.message : String(err))
    if (atasco === null) throw err
    const ms = ahora() - inicio
    presupuesto.medir(ms, sim.lost_iterations())
    return { pasos: 0, atasco, ms }
  }
}

/** El aviso de presupuesto agotado del motor como el mensaje de no convergencia (con la pieza sospechosa) que ya explica la interfaz. */
export function mensajeDeAtasco(m: string): string | null {
  const r = /se agotó el presupuesto de iteraciones en (t = \S+ s)( \(elemento \d+\))?/.exec(m)
  return r ? `no convergió en ${r[1]}${r[2] ?? ''}` : null
}

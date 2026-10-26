/** Las corridas de análisis de la sesión, en memoria (nunca se guardan en el `.kir`). Quien lo usa se suscribe y vuelve a
 * leer. */
import type { AnalisisDoc } from '../../../compartido/analisis/config'
import type { ResultadoMapeado } from '../../../compartido/analisis/resultados'
import type { ApiNgspice } from '../../../compartido/ngspice'
import type { Id } from '../doc/tipos'
import type { NivelRegistro } from '../ui/registro'
import type { ContextoAnalisis } from './contexto'
import { correrAnalisis, type ClaseError, type ResultadoEjecucion, type SeleccionTrazas, type TablaOperacion } from './ejecucion'
import { tipoDeFicha, type TipoFicha } from './fichas'

export type EstadoCorrida = 'corriendo' | 'listo' | 'error' | 'cancelado'

export interface CorridaGuardada {
  /** Número de corrida, creciente en toda la sesión. */
  n: number
  analisisId: Id
  nombre: string
  tipo: TipoFicha
  /** Copia del análisis como estaba al ejecutarlo (el documento puede cambiar después). */
  analisis: AnalisisDoc
  estado: EstadoCorrida
  inicio: number
  duracionMs?: number
  error?: string
  clase?: ClaseError
  avisos: string[]
  mapeado?: ResultadoMapeado
  tabla?: TablaOperacion | null
}

/** Corridas que se conservan (las más recientes): cada una guarda sus series completas en memoria. */
export const MAX_CORRIDAS_GUARDADAS = 20
/** Si el IPC no contesta en este tiempo (el servicio corta a los 60 s), la corrida se da por perdida. */
export const ESPERA_MAXIMA_MS = 90_000
/** Tras pedir la cancelación, el servicio mata ngspice y contesta casi al instante; si no, la corrida se da por cancelada. */
export const ESPERA_CANCELAR_MS = 3_000

interface Dependencias {
  api(): Pick<ApiNgspice, 'ejecutar' | 'cancelar'> | undefined
  registrar(texto: string, nivel: NivelRegistro): void
  ahora?(): number
  esperaMaximaMs?: number
  /** Lo que se espera a que el servicio conteste a una cancelación antes de darla por hecha. */
  esperaCancelarMs?: number
}

export class AlmacenAnalisis {
  private lista: CorridaGuardada[] = []
  private siguiente = 1
  private enCurso: CorridaGuardada | null = null
  private cancelando = false
  private soltarCancelacion: ((r: ResultadoEjecucion) => void) | null = null
  private relojCancelacion: ReturnType<typeof setTimeout> | undefined
  private opVisible: { n: number; tabla: TablaOperacion } | null = null
  private elegida: number | null = null
  private readonly oyentes = new Set<() => void>()
  /** Cambia con cada modificación: quien lo lee en un efecto se entera. */
  version = 0

  constructor(private readonly dep: Dependencias) {}

  suscribir(fn: () => void): () => void {
    this.oyentes.add(fn)
    return () => this.oyentes.delete(fn)
  }
  private avisar(): void {
    this.version++
    for (const f of [...this.oyentes]) f()
  }

  /** Las corridas, de la más reciente a la más antigua. */
  corridas(): readonly CorridaGuardada[] {
    return this.lista
  }
  get corriendo(): boolean {
    return this.enCurso !== null
  }
  get seleccionada(): CorridaGuardada | null {
    return this.lista.find((c) => c.n === this.elegida) ?? this.lista[0] ?? null
  }
  elegir(n: number): void {
    if (this.elegida === n) return
    this.elegida = n
    this.avisar()
  }

  /** La tabla del último punto de operación que sigue vigente (null si el circuito cambió desde entonces). */
  get opVigente(): TablaOperacion | null {
    return this.opVisible?.tabla ?? null
  }
  /** El circuito cambió: los voltajes de un punto de operación anterior ya no corresponden. */
  descartarOp(): void {
    if (!this.opVisible) return
    this.opVisible = null
    this.avisar()
  }

  /** Corre un análisis. Devuelve la corrida terminada, o null si ya había una en curso. */
  async ejecutar(a: AnalisisDoc, ctx: ContextoAnalisis, sel: SeleccionTrazas): Promise<CorridaGuardada | null> {
    if (this.enCurso) {
      this.dep.registrar('Ya hay un análisis en curso: espera a que termine o detenlo.', 'aviso')
      return null
    }
    const ahora = this.dep.ahora ?? Date.now
    const corrida: CorridaGuardada = { n: this.siguiente++, analisisId: a.id, nombre: a.nombre, tipo: tipoDeFicha(a), analisis: structuredClone(a), estado: 'corriendo', inicio: ahora(), avisos: [] }
    this.enCurso = corrida
    this.cancelando = false
    this.lista = [corrida, ...this.lista].slice(0, MAX_CORRIDAS_GUARDADAS)
    this.elegida = corrida.n
    this.avisar()

    const espera = this.dep.esperaMaximaMs ?? ESPERA_MAXIMA_MS
    let reloj: ReturnType<typeof setTimeout> | undefined
    const perdida = new Promise<ResultadoEjecucion>((resolver) => {
      reloj = setTimeout(() => resolver({ ok: false, error: `ngspice no contestó en ${Math.round(espera / 1000)} s: el análisis se dio por perdido.`, clase: 'tiempo' }), espera)
    })
    const cancelada = new Promise<ResultadoEjecucion>((resolver) => (this.soltarCancelacion = resolver))
    let r: ResultadoEjecucion
    try {
      r = await Promise.race([correrAnalisis(a, ctx, sel, this.dep.api()), perdida, cancelada])
    } catch (e) {
      r = { ok: false, error: e instanceof Error ? e.message : String(e), clase: 'otro' }
    } finally {
      clearTimeout(reloj)
      clearTimeout(this.relojCancelacion)
      this.soltarCancelacion = null
    }
    const fin: CorridaGuardada = { ...corrida, duracionMs: ahora() - corrida.inicio }
    if (r.ok) {
      Object.assign(fin, { estado: 'listo', avisos: r.avisos, mapeado: r.mapeado, tabla: r.tabla, duracionMs: r.duracionMs })
      if (r.tabla) this.opVisible = { n: fin.n, tabla: r.tabla }
      this.dep.registrar(`${a.nombre}: listo en ${r.duracionMs < 1000 ? `${Math.round(r.duracionMs)} ms` : `${(r.duracionMs / 1000).toFixed(1)} s`}.`, 'info')
      for (const aviso of r.avisos) this.dep.registrar(`${a.nombre}: ${aviso}`, 'aviso')
    } else if (r.clase === 'cancelado' || (this.cancelando && r.clase !== 'tiempo')) {
      Object.assign(fin, { estado: 'cancelado', error: 'Análisis cancelado.', clase: 'cancelado' })
      this.dep.registrar('Análisis cancelado.', 'info')
    } else {
      Object.assign(fin, { estado: 'error', error: r.error, clase: r.clase })
      this.dep.registrar(`${a.nombre}: ${r.error}`, 'error')
    }
    this.lista = this.lista.map((c) => (c.n === fin.n ? fin : c))
    this.enCurso = null
    this.cancelando = false
    this.avisar()
    return fin
  }

  /** Cancela el análisis en curso: el servicio mata ngspice y la corrida queda como cancelada. */
  cancelar(): void {
    if (!this.enCurso) return
    this.cancelando = true
    Promise.resolve(this.dep.api()?.cancelar()).catch(() => undefined)
    clearTimeout(this.relojCancelacion)
    this.relojCancelacion = setTimeout(() => this.soltarCancelacion?.({ ok: false, error: 'Análisis cancelado.', clase: 'cancelado' }), this.dep.esperaCancelarMs ?? ESPERA_CANCELAR_MS)
  }

  quitar(n: number): void {
    if (this.enCurso?.n === n) return
    this.lista = this.lista.filter((c) => c.n !== n)
    if (this.opVisible?.n === n) this.opVisible = null
    this.avisar()
  }
  limpiar(): void {
    this.lista = this.lista.filter((c) => c.estado === 'corriendo')
    this.opVisible = null
    this.avisar()
  }
}

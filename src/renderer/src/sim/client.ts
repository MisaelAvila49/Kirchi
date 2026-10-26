import { largoSabTerminales, readSim, SAB_LENGTH, type CambioEnCaliente, type EventoFundido, type FromWorker, type SimReading, type ToWorker } from './protocol'
import type { ConfigInstrumentos } from './instrumentosWorker'
import { bytesSabInstrumentos, crearVistas, leerInstrumentos, versionDePantalla, type PantallaSab, type RegistroFino, type VistasInstrumentos } from './protocoloInstrumentos'
import { epocaALocal } from './sonido'

/** Lo que la interfaz lee de los instrumentos (`leerInstrumentos` de `protocoloInstrumentos.ts`). */
export type LecturaSabInstrumentos = ReturnType<typeof leerInstrumentos>

/** Lo que el motor dice al terminar de cargar: nodos, elementos, redes digitales y el lazo que oscila solo (sus elementos). */
export interface CargaMotor {
  nodes: number
  elements: number
  digitales: number
  lazo: number[]
}

/** Cambios de estado que se oyen (zumbadores y relés) publicados por el worker: elemento, instante simulado y nivel,
 * cuántos no cupieron y el ancla para pasarlos a reloj (mensaje `cruces` de `protocol.ts`). */
export interface CrucesSim {
  cruces: { elemento: number; t: number; nivel: number }[]
  perdidos: number
  ancla: { t: number; reloj: number }
  velocidad: number
}

/** Lo que se pide al cargar además de la netlist. */
export interface OpcionesCarga {
  /** Casillas de corriente por terminal de la netlist (`ResultadoNetlist.puertos`) y si la corriente animada empieza encendida. */
  casillas?: number
  corrientes?: boolean
  /** Elementos cuya potencia media se integra (`ResultadoNetlist.potencias`). */
  potencias?: number[]
  /** La velocidad con que empieza (0 en pausa: no corre nada antes de que llegue la pausa) y si va sin tope. */
  velocidad?: number
  sinTope?: boolean
}

/** Lo que dice el motor al llegar un avance: el instante, lo que avanzó, si se interrumpió y cuántos estados guarda para retroceder. */
export interface LlegadaMotor {
  t: number
  dt: number
  interrumpida: boolean
  guardados?: number
}

/** Lo que la vista previa necesita del motor; las pruebas lo reemplazan por uno falso. */
export interface MotorSimulacion {
  /** Carga la netlist y arranca el reloj; resuelve con lo que el motor dice de ella. `instrumentos`: los de la netlist. */
  load(netlist: object, h: number, instrumentos?: ConfigInstrumentos, opciones?: OpcionesCarga): Promise<CargaMotor>
  /** Desde la pausa, corre lo más rápido posible `dt` segundos simulados (o un paso del motor) y vuelve a la pausa en la
   * meta. Resuelve con el instante alcanzado y lo avanzado; `interrumpida` si `interrumpir` lo detuvo. */
  avanzar(dt: number | 'paso'): Promise<LlegadaMotor>
  /** Lo mismo hasta el instante `t`. */
  avanzarHasta(t: number): Promise<LlegadaMotor>
  /** Retroceder: desde la pausa, el motor vuelve al estado guardado antes del último avance y las sondas se recortan a ese
   * instante. `t` es NaN si no había a qué volver (nada guardado, corriendo o avance en curso). */
  retroceder(): Promise<{ t: number; guardados: number }>
  /** Retroceder: el motor olvidó estados viejos para no pasar de su memoria máxima; devuelve con qué dejar de oír. */
  alEstadosPerdidos(f: (perdidos: number, guardados: number) => void): () => void
  /** El avance en curso queda en pausa donde va. */
  interrumpir(): void
  /** Integra o deja de integrar las corrientes por terminal. */
  activarCorrientes(si: boolean): void
  /** Quema o repone el elemento `indice`; devuelve el número de secuencia (el rechazo lo repite). */
  quemar(indice: number, si: boolean): number
  /** Los cambios de estado que se oyen; devuelve con qué dejar de oír. */
  alCruces(f: (c: CrucesSim) => void): () => void
  /** Ajustes nuevos de los instrumentos sin recargar (base de tiempo, acoplamiento, disparo, modo del multímetro). */
  configurarInstrumentos(config: ConfigInstrumentos): void
  /** Cuántas columnas dibuja la pantalla del osciloscopio `k` (su ancho en píxeles de dispositivo). */
  columnasDePantalla(k: number, n: number): void
  /** «Rearmar» del modo Único del osciloscopio `k`. */
  rearmar(k: number): void
  /** Pide al worker que escriba ya las pantallas con sus muestras (pausar la pantalla del osciloscopio mientras se simula). */
  forzarPantallas(): void
  /** La captura entera del osciloscopio `k` (todo lo que conservan sus sondas, en `n` columnas, hasta `hasta` si se da); null si no hay nada que dar. */
  capturaAmplia(k: number, n: number, hasta?: number): Promise<PantallaSab | null>
  /** Las columnas finas de todo lo que conservan las sondas del osciloscopio `k` (para desplazarse por la captura); null si no hay nada que dar. */
  capturaFina(k: number, hasta?: number): Promise<RegistroFino | null>
  /** Copia de lo último que dejó el worker en la memoria de los instrumentos; null sin instrumentos. */
  leerInstrumentos(o?: { osciloscopio?: number }): LecturaSabInstrumentos | null
  /** El óhmetro `k` cambió de rango (el worker ya cambió su resistencia); devuelve con qué dejar de oír. */
  alRango(f: (k: number, rango: number) => void): () => void
  /** La versión de la pantalla del osciloscopio `k` (0 si no hay), sin copiarla. */
  versionDePantalla(k: number): number
  /** Cambia valores del circuito cargado sin reiniciarlo (el tiempo y la carga de capacitores e inductores siguen). `h` es
   * el nuevo paso máximo si cambió la frecuencia de una fuente. Devuelve el número de secuencia (0 si nada que mandar),
   * que el motor repite en `alRechazo` para saber de qué cambio habla. */
  setValues(cambios: CambioEnCaliente[], h?: number): number
  /** Repone el elemento `indice` de la netlist (un fusible fundido). */
  reponer(indice: number): void
  /** Un solo paso corto del motor, aunque esté en pausa: las lecturas pasan a reflejar un valor recién cambiado. */
  paso(): void
  /** 1 = tiempo real; 0 = en pausa; con `sinTope`, lo más rápido posible. */
  setSpeed(value: number, sinTope?: boolean): void
  read(): SimReading
  /** Error del motor después de cargar (no convergió, matriz singular); devuelve con qué dejar de oír. */
  alError(f: (message: string) => void): () => void
  /** El motor rechazó un cambio en caliente (`indice` -1 es el paso): el elemento conserva su valor; devuelve con qué dejar de oír. */
  alRechazo(f: (indice: number, message: string, seq: number) => void): () => void
  /** Un fusible del circuito cargado se fundió; devuelve con qué dejar de oír. */
  alFundido(f: (e: EventoFundido) => void): () => void
  dispose(): void
}

export class SimClient implements MotorSimulacion {
  private worker: Worker
  private sab: SharedArrayBuffer
  private view: Float64Array
  nodes = 0
  elements = 0
  digitales = 0
  lastError: string | null = null
  private siguienteId = 0
  /** Carga en curso; solo se atiende la respuesta con su id. */
  private pendiente: { id: number; resolve: (v: CargaMotor) => void; reject: (e: Error) => void } | null = null
  /** Id de la carga cuyo simulador está vivo en el worker: sus errores son del motor ya cargado. */
  private idActivo = 0
  private oyentes = new Set<(message: string) => void>()
  private fundidos = new Set<(e: EventoFundido) => void>()
  private rechazos = new Set<(indice: number, message: string, seq: number) => void>()
  private rangos = new Set<(k: number, rango: number) => void>()
  private secuencia = 0
  /** La memoria de los instrumentos de la carga en curso (una por carga, del tamaño de sus instrumentos). */
  private vistasInstrumentos: VistasInstrumentos | null = null
  /** La memoria de las corrientes por terminal de la carga en curso, los avances esperando su llegada y quién oye los cruces. */
  private terminales: { vista: Float64Array; casillas: number } | null = null
  private llegadas = new Map<number, (r: LlegadaMotor) => void>()
  private retrocesos = new Map<number, (r: { t: number; guardados: number }) => void>()
  private perdidosEstados = new Set<(perdidos: number, guardados: number) => void>()
  private cruces = new Set<(c: CrucesSim) => void>()
  private capturas = new Map<number, (p: PantallaSab | null) => void>()
  private finas = new Map<number, (r: RegistroFino | null) => void>()

  constructor() {
    if (!crossOriginIsolated) throw new Error('Sin aislamiento entre orígenes: SharedArrayBuffer no está disponible')
    this.sab = new SharedArrayBuffer(SAB_LENGTH * Float64Array.BYTES_PER_ELEMENT)
    this.view = new Float64Array(this.sab)
    this.worker = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' })
    this.worker.onerror = (e) => this.fail(e.message || 'El motor de simulación no pudo arrancar.')
    this.worker.onmessageerror = () => this.fail('El motor de simulación envió un mensaje ilegible.')
    this.worker.onmessage = (e: MessageEvent<FromWorker>) => this.recibir(e.data)
  }

  private recibir(m: FromWorker): void {
    if (m.type === 'ready') {
      if (this.pendiente?.id !== m.id) return // carga reemplazada
      const { resolve } = this.pendiente
      this.pendiente = null
      this.idActivo = m.id
      this.nodes = m.nodes
      this.elements = m.elements
      this.digitales = m.digitales
      this.lastError = null
      resolve({ nodes: m.nodes, elements: m.elements, digitales: m.digitales, lazo: m.lazo })
    } else if (m.type === 'rechazado') {
      if (!this.pendiente && m.id === this.idActivo) for (const f of this.rechazos) f(m.indice, m.message, m.seq)
    } else if (m.type === 'rango') {
      if (!this.pendiente && m.id === this.idActivo) for (const f of this.rangos) f(m.multimetro, m.rango)
    } else if (m.type === 'fundido') {
      if (!this.pendiente && m.id === this.idActivo) for (const f of this.fundidos) f({ indice: m.indice, t: m.t, amps: m.amps, segundos: m.segundos })
    } else if (m.type === 'llegada') {
      const f = this.llegadas.get(m.seq)
      this.llegadas.delete(m.seq)
      if (m.id === this.idActivo) f?.({ t: m.t, dt: m.dt, interrumpida: m.interrumpida, ...(m.guardados !== undefined ? { guardados: m.guardados } : {}) })
    } else if (m.type === 'retrocedio') {
      const f = this.retrocesos.get(m.seq)
      this.retrocesos.delete(m.seq)
      if (m.id === this.idActivo) f?.({ t: m.t, guardados: m.guardados })
      else f?.({ t: Number.NaN, guardados: 0 })
    } else if (m.type === 'estados-perdidos') {
      if (!this.pendiente && m.id === this.idActivo) for (const f of this.perdidosEstados) f(m.perdidos, m.guardados)
    } else if (m.type === 'captura-amplia') {
      const f = this.capturas.get(m.seq)
      this.capturas.delete(m.seq)
      if (m.id === this.idActivo) f?.(m.pantalla)
      else f?.(null)
    } else if (m.type === 'captura-fina') {
      const f = this.finas.get(m.seq)
      this.finas.delete(m.seq)
      if (m.id === this.idActivo) f?.(m.registro)
      else f?.(null)
    } else if (m.type === 'cruces') {
      if (this.pendiente || m.id !== this.idActivo) return
      const cruces: CrucesSim['cruces'] = []
      for (let k = 0; k + 2 < m.datos.length; k += 3) cruces.push({ elemento: m.datos[k], t: m.datos[k + 1], nivel: m.datos[k + 2] })
      for (const f of this.cruces) f({ cruces, perdidos: m.perdidos, ancla: { t: m.ancla.t, reloj: epocaALocal(m.ancla.reloj) }, velocidad: m.velocidad })
    } else if (this.pendiente?.id === m.id) this.fail(m.message)
    else if (!this.pendiente && m.id === this.idActivo) this.fail(m.message)
  }

  /** Un error sin id (del worker mismo): rechaza la carga pendiente o, si no hay, avisa a los oyentes. */
  private fail(message: string): void {
    this.lastError = message
    // Tras un error del motor ningún avance llega: se resuelven como interrumpidos.
    for (const f of this.llegadas.values()) f({ t: Number.NaN, dt: 0, interrumpida: true })
    this.llegadas.clear()
    for (const f of this.retrocesos.values()) f({ t: Number.NaN, guardados: 0 })
    this.retrocesos.clear()
    for (const f of this.capturas.values()) f(null)
    this.capturas.clear()
    for (const f of this.finas.values()) f(null)
    this.finas.clear()
    if (this.pendiente) {
      const { reject } = this.pendiente
      this.pendiente = null
      reject(new Error(message))
    } else for (const f of this.oyentes) f(message)
  }

  load(netlist: object, h: number, instrumentos?: ConfigInstrumentos, opciones: OpcionesCarga = {}): Promise<CargaMotor> {
    this.pendiente?.reject(new Error('La carga fue reemplazada por otra.'))
    const id = ++this.siguienteId
    const [nOsc, nMm] = [instrumentos?.osciloscopios.length ?? 0, instrumentos?.multimetros.length ?? 0]
    const bytes = bytesSabInstrumentos(nOsc, nMm)
    const sabInst = instrumentos && bytes > 0 ? new SharedArrayBuffer(bytes) : null
    this.vistasInstrumentos = sabInst ? crearVistas(sabInst, nOsc, nMm) : null
    // La memoria de las corrientes por terminal, del tamaño de esta netlist (con 984 resistencias, 47 KB).
    const casillas = opciones.casillas ?? 0
    const sabTerm = casillas > 0 ? new SharedArrayBuffer(largoSabTerminales(casillas) * Float64Array.BYTES_PER_ELEMENT) : null
    this.terminales = sabTerm ? { vista: new Float64Array(sabTerm), casillas } : null
    // Una carga nueva deja sin respuesta los avances de la anterior.
    for (const f of this.llegadas.values()) f({ t: Number.NaN, dt: 0, interrumpida: true })
    this.llegadas.clear()
    for (const f of this.retrocesos.values()) f({ t: Number.NaN, guardados: 0 })
    this.retrocesos.clear()
    for (const f of this.capturas.values()) f(null)
    this.capturas.clear()
    for (const f of this.finas.values()) f(null)
    this.finas.clear()
    return new Promise((resolve, reject) => {
      this.pendiente = { id, resolve, reject }
      this.post({
        type: 'load', id, netlist: JSON.stringify(netlist), h, sab: this.sab,
        ...(sabInst && instrumentos ? { instrumentos: { sab: sabInst, config: instrumentos } } : {}),
        ...(sabTerm ? { terminales: { sab: sabTerm, activa: opciones.corrientes === true } } : {}),
        ...(opciones.potencias?.length ? { potencias: opciones.potencias } : {}),
        ...(opciones.velocidad !== undefined ? { velocidad: opciones.velocidad } : {}),
        ...(opciones.sinTope ? { sinTope: true } : {})
      })
    })
  }

  avanzar(dt: number | 'paso'): Promise<LlegadaMotor> {
    const seq = ++this.secuencia
    return new Promise((resolve) => {
      this.llegadas.set(seq, resolve)
      this.post({ type: 'avanzar', dt, seq })
    })
  }

  avanzarHasta(t: number): Promise<LlegadaMotor> {
    const seq = ++this.secuencia
    return new Promise((resolve) => {
      this.llegadas.set(seq, resolve)
      this.post({ type: 'hasta', t, seq })
    })
  }

  interrumpir(): void {
    this.post({ type: 'interrumpir' })
  }

  retroceder(): Promise<{ t: number; guardados: number }> {
    const seq = ++this.secuencia
    return new Promise((resolve) => {
      this.retrocesos.set(seq, resolve)
      this.post({ type: 'retroceder', seq })
    })
  }

  alEstadosPerdidos(f: (perdidos: number, guardados: number) => void): () => void {
    this.perdidosEstados.add(f)
    return () => this.perdidosEstados.delete(f)
  }

  activarCorrientes(si: boolean): void {
    this.post({ type: 'corrientes', activa: si })
  }

  quemar(indice: number, si: boolean): number {
    const seq = ++this.secuencia
    this.post({ type: 'quemar', indice, si, seq })
    return seq
  }

  alCruces(f: (c: CrucesSim) => void): () => void {
    this.cruces.add(f)
    return () => this.cruces.delete(f)
  }

  configurarInstrumentos(config: ConfigInstrumentos): void {
    this.post({ type: 'instrumentos', config })
  }

  columnasDePantalla(k: number, n: number): void {
    this.post({ type: 'pantalla', osciloscopio: k, columnas: n })
  }

  rearmar(k: number): void {
    this.post({ type: 'rearmar', osciloscopio: k })
  }

  forzarPantallas(): void {
    this.post({ type: 'forzar-pantallas' })
  }

  capturaAmplia(k: number, n: number, hasta?: number): Promise<PantallaSab | null> {
    const seq = ++this.secuencia
    return new Promise((resolve) => {
      this.capturas.set(seq, resolve)
      this.post({ type: 'captura-amplia', osciloscopio: k, columnas: n, ...(hasta !== undefined ? { hasta } : {}), seq })
    })
  }

  capturaFina(k: number, hasta?: number): Promise<RegistroFino | null> {
    const seq = ++this.secuencia
    return new Promise((resolve) => {
      this.finas.set(seq, resolve)
      this.post({ type: 'captura-fina', osciloscopio: k, ...(hasta !== undefined ? { hasta } : {}), seq })
    })
  }

  leerInstrumentos(o: { osciloscopio?: number } = {}): LecturaSabInstrumentos | null {
    return this.vistasInstrumentos ? leerInstrumentos(this.vistasInstrumentos, o) : null
  }

  alRango(f: (k: number, rango: number) => void): () => void {
    this.rangos.add(f)
    return () => this.rangos.delete(f)
  }

  versionDePantalla(k: number): number {
    return this.vistasInstrumentos ? versionDePantalla(this.vistasInstrumentos, k) : 0
  }

  setValues(cambios: CambioEnCaliente[], h?: number): number {
    if (!cambios.length && h === undefined) return 0
    const seq = ++this.secuencia
    this.post({ type: 'valores', cambios, ...(h !== undefined ? { h } : {}), seq })
    return seq
  }

  reponer(indice: number): void {
    this.post({ type: 'reponer', indice })
  }

  paso(): void {
    this.post({ type: 'paso' })
  }

  setSpeed(value: number, sinTope = false): void {
    this.post({ type: 'speed', value, ...(sinTope ? { sinTope } : {}) })
  }

  read(): SimReading {
    return readSim(this.view, this.nodes, this.elements, this.digitales, this.terminales ?? undefined)
  }

  alError(f: (message: string) => void): () => void {
    this.oyentes.add(f)
    return () => this.oyentes.delete(f)
  }

  alRechazo(f: (indice: number, message: string, seq: number) => void): () => void {
    this.rechazos.add(f)
    return () => this.rechazos.delete(f)
  }

  alFundido(f: (e: EventoFundido) => void): () => void {
    this.fundidos.add(f)
    return () => this.fundidos.delete(f)
  }

  dispose(): void {
    this.pendiente?.reject(new Error('La vista previa se detuvo.'))
    this.pendiente = null
    this.post({ type: 'stop' })
    this.worker.terminate()
    this.oyentes.clear()
    this.fundidos.clear()
    this.rechazos.clear()
    this.rangos.clear()
    this.cruces.clear()
    this.perdidosEstados.clear()
    for (const f of this.llegadas.values()) f({ t: Number.NaN, dt: 0, interrumpida: true })
    this.llegadas.clear()
    for (const f of this.retrocesos.values()) f({ t: Number.NaN, guardados: 0 })
    this.retrocesos.clear()
    for (const f of this.capturas.values()) f(null)
    this.capturas.clear()
    for (const f of this.finas.values()) f(null)
    this.finas.clear()
  }

  private post(m: ToWorker): void {
    this.worker.postMessage(m)
  }
}

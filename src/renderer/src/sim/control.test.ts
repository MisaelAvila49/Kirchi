// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { calcularConexiones, clavePin } from '../conexiones/conexiones'
import type { Documento } from '../doc/tipos'
import { conEtiquetas, divisor, ledConBateria } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import { conPiezaSinModelo } from '../prueba/sinModelo'
import type { PiezaDef } from '../piezas/tipos'
import { seleccionVacia } from '../editor/seleccion'
import { pinesEnMundo } from '../piezas/transformar'
import { paraTexto } from './lectura'
import { medicionDeSeleccion } from '../ui/medicion'
import { leerValor } from '../valores/valores'
import type { CrucesSim, MotorSimulacion, OpcionesCarga } from './client'
import { Editor } from '../editor/Editor'
import { idSecuencial } from '../doc/ids'
import { abreMedicionesAlSimular, pestañaAlSimular } from '../ui/franja'
import { sinInstrumentos } from '../netlist/instrumentos'
import { accionDeClic, cambiosEnCaliente, ControlSimulacion, limitesDeInstrumentos, limitesExcedidos, mensajeDelMotor, otraOpcion, type DependenciasSim, type FaseSim } from './control'
import { PASO_VISTA } from './lectura'
import { lecturaDeMedidor } from './medidor'
import type { Sonda } from '../doc/tipos'
import init, { Simulator } from './pkg/kirchi_engine.js'
import type { CambioEnCaliente, EventoFundido, SimReading } from './protocol'
import { InstrumentosEnWorker, type ConfigInstrumentos } from './instrumentosWorker'
import { bytesSabInstrumentos, crearVistas, leerInstrumentos, type VistasInstrumentos } from './protocoloInstrumentos'
import type { Parte } from '../prueba/circuitos'

const lib = libreriaDePrueba().piezas

let memoria: WebAssembly.Memory
beforeAll(async () => {
  memoria = (await init({ module_or_path: readFileSync(join(import.meta.dirname, 'pkg/kirchi_engine_bg.wasm')) })).memory
})

/** Motor de verdad (el WASM) sin worker: cada `read` avanza 1 ms simulado. */
class MotorDePrueba implements MotorSimulacion {
  sim: Simulator | null = null
  cargas: { netlist: unknown; h: number }[] = []
  velocidad = 1
  velocidades: number[] = []
  /** Cuántas veces se pidió un solo paso corto (un cambio en caliente en pausa). */
  pasos = 0
  /** Cada llamada a `setValues`, y los pasos máximos nuevos que trajeron. */
  cambios: CambioEnCaliente[][] = []
  pasosNuevos: number[] = []
  liberado = false
  falla: string | null = null
  /** Si hay una puerta, `load` espera a que se abra: así se prueba lo que pasa mientras carga. */
  puerta: Promise<void> | null = null
  private oyente: ((m: string) => void) | null = null
  async load(netlist: object, h: number, instrumentos?: ConfigInstrumentos, opciones: OpcionesCarga = {}) {
    if (this.falla) throw new Error(this.falla)
    await this.puerta
    this.sim?.free()
    this.cargas.push({ netlist, h })
    this.sim = new Simulator(JSON.stringify(netlist), h)
    // Como el worker, las potencias de los avisos y la corriente animada si empieza encendida.
    this.potencias = opciones.potencias ?? []
    if (this.potencias.length) this.sim.activar_potencias(Uint32Array.from(this.potencias))
    if (opciones.corrientes) this.activarCorrientes(true)
    this.h = h
    this.inst = null
    this.vistas = null
    if (instrumentos) {
      const [nOsc, nMm] = [instrumentos.osciloscopios.length, instrumentos.multimetros.length]
      this.vistas = crearVistas(new SharedArrayBuffer(bytesSabInstrumentos(nOsc, nMm)), nOsc, nMm)
      // Como `postMessage`: el worker recibe una copia.
      this.inst = new InstrumentosEnWorker(this.sim, () => memoria.buffer, this.vistas, structuredClone(instrumentos), this.reloj)
    }
    return { nodes: this.sim.node_count(), elements: this.sim.element_count(), digitales: this.sim.digital_count(), lazo: Array.from(this.sim.lazo_de_arranque()) }
  }
  seq = 0
  setValues(cambios: CambioEnCaliente[], h?: number) {
    this.cambios.push(cambios)
    if (h !== undefined) this.pasosNuevos.push(h)
    // Como el worker: un paso menor antes de los elementos y uno mayor después.
    if (h !== undefined && h < this.h) this.sim!.set_max_step(h)
    for (const c of cambios) this.sim!.set_element(c.indice, JSON.stringify(c.elemento))
    if (h !== undefined && h >= this.h) this.sim!.set_max_step(h)
    if (h !== undefined) this.h = h
    return ++this.seq
  }
  h = 0
  private oyenteRechazo: ((i: number, m: string, seq: number) => void) | null = null
  alRechazo(f: (i: number, m: string, seq: number) => void) {
    this.oyenteRechazo = f
    return () => (this.oyenteRechazo = null)
  }
  /** El motor rechaza el cambio número `seq` (por omisión, el último). */
  rechazar(i: number, m: string, seq = this.seq) {
    this.oyenteRechazo?.(i, m, seq)
  }
  /** Lo que llegó por `perilla` (el WASM de prueba no tiene canales): canal, valor y secuencia. */
  perillas: { canal: number; valor: number; seq: number }[] = []
  perilla(canal: number, valor: number) {
    this.perillas.push({ canal, valor, seq: ++this.seq })
    return this.seq
  }
  reponer(indice: number) {
    this.sim!.reset_element(indice)
  }
  paso() {
    this.pasos++
    this.sim!.advance_to(this.sim!.time() + 1e-6, 1)
  }
  /** Si se pidió «Sin límite de tiempo real» en cada `setSpeed`. */
  sinTopes: boolean[] = []
  setSpeed(v: number, sinTope = false) {
    // Al reanudar el motor da pasos: un milisegundo simulado por cada vez que se reanuda.
    // Como el worker, al reanudar el motor olvida los estados guardados para retroceder.
    if (v > 0 && this.velocidad === 0 && this.sim) {
      this.sim.descartar_estados()
      this.sim.advance_to(this.sim.time() + 1e-3, 1_000_000)
    }
    this.velocidad = v
    this.velocidades.push(v)
    this.sinTopes.push(sinTope)
  }
  /** Con `conPromedio`, cada lectura trae el promedio de su milisegundo (con las potencias), como el worker. */
  conPromedio = false
  potencias: number[] = []
  read(): SimReading {
    const s = this.sim!
    if (this.conPromedio) {
      s.activar_promedios()
      s.reiniciar_promedios()
    }
    if (this.velocidad > 0) s.advance_to(s.time() + 1e-3, 1_000_000)
    const bus = s.take_conflictos()
    if (bus.length > 0) this.oyenteConflictos?.(Array.from(bus))
    const sinNivel = s.take_indefinidos()
    if (sinNivel.length > 0) this.oyenteIndefinidos?.(Array.from(sinNivel))
    // Cada lectura son 250 ms de reloj para el multímetro.
    if (this.inst) for (const c of this.inst.publicar((this.reloj += 250), true)) this.oyenteRango?.(c.multimetro, c.rango)
    const n = s.element_count()
    const leer = (p: number, k = n) => new Float64Array(memoria.buffer, p, k).slice()
    const fundidos = s.take_events()
    for (let k = 0; k + 3 < fundidos.length; k += 4) this.oyenteFundido?.({ indice: fundidos[k], t: fundidos[k + 1], amps: fundidos[k + 2], segundos: fundidos[k + 3] })
    const g = s.digital_count()
    const base = { time: s.time(), ratio: 1, capacity: 10, seq: 1, consistente: true, voltages: s.voltages(), currents: s.currents(), aux: leer(s.aux_ptr()), estado: leer(s.estado_ptr()), niveles: leer(s.niveles_ptr(), g), medidas: leer(s.medidas_ptr(), 3 * g) }
    const casillas = s.casillas_terminales()
    const t = this.corrientes ? leer(s.terminales_ptr(), 1 + 2 * casillas) : null
    const terminales = t && t[0] > 0 ? { duracion: t[0], medias: t.slice(1, 1 + casillas), absolutas: t.slice(1 + casillas) } : null
    if (!this.conPromedio) return { ...base, terminales }
    const nodos = s.node_count()
    const p = leer(s.promedios_ptr(), 1 + nodos + n)
    const w = this.potencias.length ? leer(s.potencias_ptr(), this.potencias.length) : new Float64Array(0)
    const potencias = new Float64Array(n)
    this.potencias.forEach((k, q) => (potencias[k] = w[q]))
    return { ...base, terminales, promedio: { duracion: p[0], voltages: p.slice(1, 1 + nodos), currents: p.slice(1 + nodos), potencias } }
  }
  alError(f: (m: string) => void) {
    this.oyente = f
    return () => (this.oyente = null)
  }
  private oyenteFundido: ((e: EventoFundido) => void) | null = null
  alFundido(f: (e: EventoFundido) => void) {
    this.oyenteFundido = f
    return () => (this.oyenteFundido = null)
  }
  fallar(m: string) {
    this.oyente?.(m)
  }
  inst: InstrumentosEnWorker | null = null
  vistas: VistasInstrumentos | null = null
  reloj = 0
  /** Cada configuración de instrumentos mandada sin recargar. */
  configuraciones: ConfigInstrumentos[] = []
  configurarInstrumentos(c: ConfigInstrumentos) {
    this.configuraciones.push(c)
    this.inst?.configurar(structuredClone(c), this.reloj)
  }
  columnasDePantalla(k: number, n: number) {
    this.inst?.columnas(k, n)
  }
  rearmar(k: number) {
    this.inst?.rearmar(k)
  }
  forzarPantallas() {}
  capturaAmplia(k: number, n: number, hasta?: number) {
    return Promise.resolve(this.inst?.capturaAmplia(k, n, hasta) ?? null)
  }
  capturaFina(k: number, hasta?: number) {
    return Promise.resolve(this.inst?.capturaFina(k, hasta) ?? null)
  }
  leerInstrumentos(o: { osciloscopio?: number } = {}) {
    return this.vistas ? leerInstrumentos(this.vistas, o) : null
  }
  versionDePantalla(k: number) {
    return this.vistas ? (leerInstrumentos(this.vistas, { osciloscopio: k }).pantalla?.version ?? 0) : 0
  }
  private oyenteRango: ((k: number, rango: number) => void) | null = null
  alRango(f: (k: number, rango: number) => void) {
    this.oyenteRango = f
    return () => (this.oyenteRango = null)
  }
  // Avanzar en pausa como el worker (hasta la meta exacta o un paso del motor), las corrientes por terminal, el quemado
  // y los cambios de estado que se oyen.
  avances: (number | 'paso')[] = []
  corrientes = false
  quemados: [number, boolean][] = []
  async avanzar(dt: number | 'paso') {
    const s = this.sim!
    const desde = s.time()
    this.avances.push(dt)
    // Como el worker: el estado de antes del avance queda guardado para retroceder.
    s.guardar_estado()
    if (dt === 'paso') for (let k = 0; k < 100 && s.time() <= desde; k++) s.advance_to(desde + this.h, 1)
    else s.advance_to(desde + dt, 10_000_000)
    return { t: s.time(), dt: s.time() - desde, interrumpida: false, guardados: s.estados_guardados() }
  }
  async avanzarHasta(t: number) {
    const s = this.sim!
    const desde = s.time()
    s.guardar_estado()
    s.advance_to(t, 10_000_000)
    return { t: s.time(), dt: s.time() - desde, interrumpida: false, guardados: s.estados_guardados() }
  }
  /** Como el worker: vuelve al estado guardado y los instrumentos recortan lo capturado; NaN si no hay nada guardado. */
  retrocesos = 0
  async retroceder() {
    const s = this.sim!
    this.retrocesos++
    const t = s.restaurar_estado()
    if (!Number.isNaN(t)) this.inst?.retroceder(t)
    return { t, guardados: s.estados_guardados() }
  }
  private oyentePerdidos: ((perdidos: number, guardados: number) => void) | null = null
  alEstadosPerdidos(f: (perdidos: number, guardados: number) => void) {
    this.oyentePerdidos = f
    return () => (this.oyentePerdidos = null)
  }
  /** El motor avisa que olvidó estados por la memoria máxima. */
  perderEstados(perdidos: number, guardados: number) {
    this.oyentePerdidos?.(perdidos, guardados)
  }
  interrumpir() {}
  activarCorrientes(si: boolean) {
    this.corrientes = si
    this.sim?.activar_terminales(si)
  }
  quemar(indice: number, si: boolean) {
    this.sim!.quemar(indice, si)
    this.quemados.push([indice, si])
    return ++this.seq
  }
  private oyenteConflictos: ((redes: number[]) => void) | null = null
  alConflictos(f: (redes: number[]) => void) {
    this.oyenteConflictos = f
    return () => (this.oyenteConflictos = null)
  }
  private oyenteIndefinidos: ((elementos: number[]) => void) | null = null
  alIndefinidos(f: (elementos: number[]) => void) {
    this.oyenteIndefinidos = f
    return () => (this.oyenteIndefinidos = null)
  }
  private oyenteCruces: ((c: CrucesSim) => void) | null = null
  alCruces(f: (c: CrucesSim) => void) {
    this.oyenteCruces = f
    return () => (this.oyenteCruces = null)
  }
  dispose() {
    this.sim?.free()
    this.sim = null
    this.liberado = true
  }
}

function armar(d: Documento = divisor(), libreria: Map<string, PiezaDef> = lib, extra: Partial<DependenciasSim> = {}) {
  const registro: [string, string][] = []
  const fases: FaseSim[] = []
  const motores: MotorDePrueba[] = []
  const con = calcularConexiones(d, libreria)
  const c = new ControlSimulacion({
    crearMotor: () => {
      const m = new MotorDePrueba()
      motores.push(m)
      return m
    },
    circuito: () => ({ doc: d, lib: libreria, con }),
    registrar: (t, tipo) => registro.push([tipo, t]),
    fase: (f) => fases.push(f),
    ...extra
  })
  const medio = con.redDePin.get(clavePin('p_r1', '2'))!
  return { c, d, con, registro, fases, motores, medio }
}

describe('ControlSimulacion', () => {
  it('el divisor de 1 kΩ y 1 kΩ con 5 V da 2.50 V en el nodo intermedio (criterio 5 de la etapa)', async () => {
    const { c, fases, medio, motores } = armar()
    expect(await c.iniciar()).toBe(true)
    expect(fases).toEqual(['arrancando', 'corriendo'])
    expect(motores).toHaveLength(1)
    const l = c.leer()!
    expect(l.redes.get(medio)).toBeCloseTo(2.5, 9)
    expect(l.piezas.get('p_r1')!.i).toBeCloseTo(2.5e-3, 12)
    // Sin fuentes que cambien, el paso más largo de la vista previa adaptativa.
    expect(motores[0].cargas[0].h).toBe(PASO_VISTA)
  })

  it('el motor se crea al simular y se libera al detener', async () => {
    const { c, motores, fases } = armar()
    expect(motores).toHaveLength(0)
    await c.iniciar()
    c.detener()
    expect(motores[0].liberado).toBe(true)
    expect(c.leer()).toBeNull()
    expect(fases.at(-1)).toBe('detenida')
    await c.iniciar()
    expect(motores).toHaveLength(2)
  })

  it('con piezas sin modelo no arranca y las lista', async () => {
    const d = divisor()
    d.piezas.p_u = { id: 'p_u', tipo: 'sin-modelo', ref: 'U1', x: 60, y: 40, rot: 0, espejo: false, props: {} }
    const { c, registro, motores } = armar(d, conPiezaSinModelo(lib))
    expect(await c.iniciar()).toBe(false)
    expect(registro).toEqual([['error', 'No se puede simular: U1 no tiene modelo eléctrico.']])
    expect(motores).toHaveLength(0)
    expect(c.fase).toBe('detenida')
  })

  it('con una caja sin equivalencia no arranca y el Registro da su motivo', async () => {
    const d = divisor()
    d.piezas.u2 = { id: 'u2', tipo: 'sin-equivalencia', ref: 'U2', x: 60, y: 40, rot: 0, espejo: false, props: { nombre: 'XYZ' } }
    const { c, registro, motores } = armar(d)
    expect(await c.iniciar()).toBe(false)
    expect(registro).toEqual([['error', 'U2 no tiene equivalencia en Kirchi: reemplázala para simular.']])
    expect(motores).toHaveLength(0)
  })

  it('los errores del netlist van al Registro y un circuito vacío solo avisa', async () => {
    const d = divisor()
    delete d.piezas.p_g
    const a = armar(d)
    expect(await a.c.iniciar()).toBe(false)
    expect(a.registro).toEqual([['error', 'Falta una tierra: agrega una con G.']])
    const b = armar({ piezas: {}, cables: {}, etiquetas: {}, notas: {} })
    expect(await b.c.iniciar()).toBe(false)
    expect(b.registro).toEqual([['aviso', 'El circuito está vacío: no hay nada que simular.']])
  })

  it('un LED directo sobre la batería no arranca y el Registro dice qué hacer', async () => {
    const d = ledConBateria()
    delete d.piezas.p_r1
    d.cables.c_a = { id: 'c_a', puntos: [{ x: 0, y: -4 }, { x: 0, y: -8 }, { x: 14, y: -8 }] }
    const { c, registro, motores } = armar(d)
    expect(await c.iniciar()).toBe(false)
    expect(registro).toEqual([['error', 'D1 está conectado directo a B1, sin resistencia: agrega una en serie.']])
    expect(motores).toHaveLength(0)
  })

  it('pausa y reanuda sin volver a cargar', async () => {
    const { c, motores, fases } = armar()
    await c.iniciar()
    c.pausar()
    expect(motores[0].velocidad).toBe(0)
    const t = c.leer()!.t
    expect(c.leer()!.t).toBe(t)
    c.reanudar()
    expect(motores[0].velocidad).toBe(1)
    expect(fases).toEqual(['arrancando', 'corriendo', 'pausada', 'corriendo'])
    expect(motores[0].cargas).toHaveLength(1)
  })

  it('accionar un interruptor lo cambia en caliente, sin volver a t = 0 ni tocar el documento; detener lo olvida', async () => {
    const d = divisor()
    d.piezas.p_r2 = { ...d.piezas.p_r2, tipo: 'interruptor', ref: 'S1', props: { estado: 'abierto' } }
    const { c, medio, motores } = armar(d)
    await c.iniciar()
    expect(c.leer()!.redes.get(medio)).toBeCloseTo(5, 3)
    const t = c.leer()!.t
    expect(await c.accionar('p_r2', 'cerrado')).toBe(true)
    expect(motores[0].cargas).toHaveLength(1)
    expect(motores[0].cambios).toHaveLength(1)
    const l = c.leer()!
    expect(l.t).toBeGreaterThan(t)
    expect(l.redes.get(medio)).toBeCloseTo(0, 3)
    expect(c.opcionDe('p_r2')).toBe('cerrado')
    expect(d.piezas.p_r2.props.estado).toBe('abierto')
    c.detener()
    expect(c.opcionDe('p_r2')).toBe('abierto')
  })

  it('un botón suelto no conduce: la entrada CMOS que solo llega a él no toma los 15 V, y al sostenerlo sí', async () => {
    // 15 V → SW1 → entrada A de una NOT CD4000B a 15 V, sin resistencia a tierra; la salida con 10 kΩ a tierra.
    const d = conEtiquetas(lib, [
      { tipo: 'fuente-dc', ref: 'V1', props: { voltaje: '15' }, pines: { '+': 'vcc', '-': '0' } },
      { tipo: 'boton', ref: 'SW1', pines: { '1': 'vcc', '2': 'a' } },
      { tipo: 'not', ref: 'U1', props: { familia: 'CD4000B', alimentacion: '15 V' }, pines: { A: 'a', Y: 'y' } },
      { tipo: 'resistencia', ref: 'R1', props: { valor: '10k' }, pines: { '1': 'y', '2': '0' } }
    ])
    const { c, con, registro } = armar(d)
    const red = (n: string) => con.redes.find((x) => x.nombre === n)!.id
    expect(await c.iniciar()).toBe(true)
    let l = c.leer()!
    expect(c.opcionDe('p_1')).toBe('no')
    expect(l.redes.get(red('a'))!).toBeLessThan(0.3 * 15)
    expect(l.redes.get(red('y'))!).toBeGreaterThan(14)
    // El Registro explica por qué la entrada no queda en 15 V: sin el botón apretado está al aire.
    expect(registro.some(([, t]) => /SW1/.test(t) && /al aire/.test(t))).toBe(true)
    expect(await c.accionar('p_1', 'sí')).toBe(true)
    l = c.leer()!
    l = c.leer()!
    expect(l.redes.get(red('a'))!).toBeGreaterThan(14.9)
    expect(l.redes.get(red('y'))!).toBeLessThan(0.5)
    expect(await c.accionar('p_1', 'no')).toBe(true)
    l = c.leer()!
    l = c.leer()!
    expect(l.redes.get(red('a'))!).toBeLessThan(0.3 * 15)
    expect(l.redes.get(red('y'))!).toBeGreaterThan(14)
  })

  it('solo se accionan interruptores y botones, y solo con la vista previa activa', async () => {
    const { c } = armar()
    expect(await c.accionar('p_r1', 'cerrado')).toBe(false)
    await c.iniciar()
    expect(await c.accionar('p_r1', 'cerrado')).toBe(false)
  })

  it('un error del motor después de cargar se dice en una oración y detiene', async () => {
    const { c, registro, motores } = armar()
    await c.iniciar()
    motores[0].fallar('no convergió en t = 1.250000e-3 s')
    expect(registro.at(-1)).toEqual(['error', 'La vista previa se detuvo: el motor no convergió en t = 1.25 ms.'])
    expect(c.fase).toBe('detenida')
  })

  it('si el motor nombra el elemento que no convergió, el Registro nombra la pieza y dice qué revisar', async () => {
    const d = conEtiquetas(lib, [
      { tipo: 'fuente-dc', ref: 'V1', props: { voltaje: '12' }, pines: { '+': 'vcc', '-': '0' } },
      { tipo: 'resistencia', ref: 'R1', props: { valor: '1k' }, pines: { '1': 'vcc', '2': 'c' } },
      { tipo: 'npn', ref: 'Q1', pines: { B: 'c', C: 'c', E: '0' } }
    ])
    const { c, registro, motores } = armar(d)
    await c.iniciar()
    motores[0].fallar('no convergió en t = 1.250000e-3 s (elemento 2)')
    expect(registro.at(-1)).toEqual(['error', 'Q1 no encontró un punto de trabajo: revisa la polarización de su base.'])
    expect(c.fase).toBe('detenida')
  })

  it('una unión forzada y una matriz singular también nombran la pieza', async () => {
    const montar = () => {
      const d = conEtiquetas(lib, [
        { tipo: 'fuente-dc', ref: 'V1', props: { voltaje: '12' }, pines: { '+': 'vcc', '-': '0' } },
        { tipo: 'resistencia', ref: 'R1', props: { valor: '1k' }, pines: { '1': 'vcc', '2': 'c' } },
        { tipo: 'npn', ref: 'Q1', pines: { B: 'c', C: 'c', E: '0' } }
      ])
      return armar(d)
    }
    const a = montar()
    await a.c.iniciar()
    a.motores[0].fallar('una unión queda en directo sin nada que limite su corriente, agrega una resistencia en serie (elemento 2)')
    expect(a.registro.at(-1)).toEqual(['error', 'Q1 no encontró un punto de trabajo: revisa la polarización de su base.'])
    const b = montar()
    await b.c.iniciar()
    b.motores[0].fallar('matriz singular: revisa nodos sin camino a tierra o fuentes de voltaje en paralelo (elemento 2)')
    expect(b.registro.at(-1)).toEqual([
      'error',
      'La vista previa se detuvo: el circuito no tiene solución cerca de Q1; revisa que cada red llegue a tierra y que no haya fuentes de voltaje en paralelo.'
    ])
    // Sin elemento (o si la pieza no se encuentra) quedan los mensajes de antes.
    const c = montar()
    await c.c.iniciar()
    c.motores[0].fallar('matriz singular: revisa nodos sin camino a tierra o fuentes de voltaje en paralelo')
    expect(c.registro.at(-1)).toEqual([
      'error',
      'La vista previa se detuvo: el circuito no tiene solución; revisa que cada red llegue a tierra y que no haya fuentes de voltaje en paralelo.'
    ])
  })

  it('un foco que se funde por sobrevoltaje lo explica el Registro y un clic lo repone', async () => {
    // 24 V sobre un foco de 12 V y 5 W: el filamento llegaría a casi tres veces su potencia nominal y se funde al doble
    // (`THETA_FUNDE` del motor).
    const d = conEtiquetas(lib, [
      { tipo: 'fuente-dc', ref: 'V1', props: { voltaje: '24' }, pines: { '+': 'a', '-': '0' } },
      { tipo: 'foco', ref: 'LP1', props: { voltaje: '12', potencia: '5' }, pines: { '1': 'a', '2': '0' } }
    ])
    const { c, registro } = armar(d)
    await c.iniciar()
    for (let k = 0; k < 600; k++) c.leer()
    expect(registro).toContainEqual(['aviso', 'LP1 se fundió: el filamento pasó de su temperatura máxima.'])
    expect(c.reponer('p_1')).toBe(true)
    expect(registro).toContainEqual(['info', 'LP1 repuesto.'])
    expect(c.reponer('p_1')).toBe(false)
    expect(c.leer()!.piezas.get('p_1')).toMatchObject({ extra: { tipo: 'foco', fundido: false } })
  })

  it('el motor dice de qué pieza es un valor que rechaza, y solo nombra como sin punto de trabajo a las no lineales', () => {
    const pieza = (k: number) => (k === 2 ? { ref: 'R1', tipo: 'R' } : k === 3 ? { ref: 'Q1', tipo: 'bjt' } : undefined)
    expect(mensajeDelMotor('elemento 2: un valor está fuera del rango admitido', pieza)).toBe('La vista previa se detuvo: R1 tiene un valor fuera del rango admitido.')
    expect(mensajeDelMotor('elemento 2: el valor debe ser positivo', pieza)).toBe('La vista previa se detuvo: R1 tiene un valor que debe ser positivo.')
    expect(mensajeDelMotor('elemento 9: un valor está fuera del rango admitido', pieza)).toBe('La vista previa se detuvo: elemento 9: un valor está fuera del rango admitido.')
    expect(mensajeDelMotor('no convergió en t = 1.000000e-3 s (elemento 2)', pieza)).toBe('No se encontró un punto de trabajo cerca de R1: revisa sus conexiones.')
    expect(mensajeDelMotor('no convergió en t = 1.000000e-3 s (elemento 3)', pieza)).toBe('Q1 no encontró un punto de trabajo: revisa la polarización de su base.')
  })

  it('un cambio en caliente que el motor rechaza no detiene la vista previa: se dice la pieza y se queda el valor de antes', async () => {
    const d = conEtiquetas(lib, [
      { tipo: 'fuente-dc', ref: 'V1', props: { voltaje: '5' }, pines: { '+': 'a', '-': '0' } },
      { tipo: 'resistencia', ref: 'R1', props: { valor: '1k' }, pines: { '1': 'a', '2': 'b' } },
      { tipo: 'resistencia', ref: 'R2', props: { valor: '1k' }, pines: { '1': 'b', '2': '0' } }
    ])
    const { c, registro, motores } = armar(d)
    await c.iniciar()
    d.piezas.p_2 = { ...d.piezas.p_2, props: { valor: '2k' } }
    await c.actualizar()
    motores[0].rechazar(2, 'elemento 2: un valor está fuera del rango admitido')
    expect(registro.at(-1)).toEqual(['error', 'R2 tiene un valor fuera del rango admitido: la vista previa sigue con el valor de antes.'])
    expect(c.fase).toBe('corriendo')
    expect(c.leer()).not.toBeNull()
  })

  it('con dos cambios en camino, el rechazo del primero no deshace el segundo; el del último vuelve al último que se aceptó', async () => {
    const d = conEtiquetas(lib, [
      { tipo: 'fuente-dc', ref: 'V1', props: { voltaje: '5' }, pines: { '+': 'a', '-': '0' } },
      { tipo: 'resistencia', ref: 'R1', props: { valor: '1k' }, pines: { '1': 'a', '2': 'b' } },
      { tipo: 'resistencia', ref: 'R2', props: { valor: '1k' }, pines: { '1': 'b', '2': '0' } }
    ])
    const { c, registro, motores } = armar(d)
    await c.iniciar()
    const cambiar = async (valor: string) => {
      d.piezas.p_2 = { ...d.piezas.p_2, props: { valor } }
      await c.actualizar()
    }
    await cambiar('2k') // seq 1
    await cambiar('3k') // seq 2
    // El motor rechaza el 1 cuando ya iba el 2 (que es el que reemplazó al elemento): no se deshace nada.
    motores[0].rechazar(2, 'elemento 2: un valor está fuera del rango admitido', 1)
    expect(registro.at(-1)).toEqual(['error', 'R2 tiene un valor fuera del rango admitido: la vista previa sigue con el valor de antes.'])
    const sinCambio = motores[0].cambios.length
    await c.actualizar()
    expect(motores[0].cambios).toHaveLength(sinCambio)
    // Y si rechaza el 2, el motor se quedó con el original (el 1 también se rechazó): el control vuelve a mandar el valor del documento.
    motores[0].rechazar(2, 'elemento 2: un valor está fuera del rango admitido', 2)
    await c.actualizar()
    expect(motores[0].cambios).toHaveLength(sinCambio + 1)
    expect(motores[0].cambios.at(-1)).toEqual([{ indice: 2, elemento: { type: 'R', a: 2, b: 0, ohms: 3000 } }])
  })

  it('un cambio de frecuencia en caliente conserva el tiempo, un fusible fundido y no recarga', async () => {
    const d = conEtiquetas(lib, [
      { tipo: 'fuente-ac', ref: 'V1', props: { amplitud: '5', frecuencia: '50' }, pines: { '+': 'a', '-': '0' } },
      { tipo: 'fusible', ref: 'F1', props: { corriente: '1' }, pines: { '1': 'a', '2': 'b' } },
      { tipo: 'resistencia', ref: 'R1', props: { valor: '1' }, pines: { '1': 'b', '2': '0' } }
    ])
    const { c, motores } = armar(d)
    await c.iniciar()
    for (let k = 0; k < 80; k++) c.leer()
    const antes = c.leer()!
    expect(antes.piezas.get('p_1')).toMatchObject({ extra: { tipo: 'fusible', fundido: true } })
    d.piezas.p_0 = { ...d.piezas.p_0, props: { ...d.piezas.p_0.props, frecuencia: '100k' } }
    await c.actualizar()
    expect(motores).toHaveLength(1)
    expect(motores[0].cargas).toHaveLength(1)
    expect(motores[0].pasosNuevos).toHaveLength(1)
    const despues = c.leer()!
    expect(despues.t).toBeGreaterThan(antes.t)
    expect(despues.piezas.get('p_1')).toMatchObject({ extra: { tipo: 'fusible', fundido: true } })
  })

  it('conmutar un interruptor en caliente conserva la carga de un capacitor, un contacto de relé cerrado y un fusible fundido', async () => {
    const d = conEtiquetas(lib, [
      { tipo: 'fuente-dc', ref: 'V1', props: { voltaje: '5' }, pines: { '+': 'a', '-': '0' } },
      { tipo: 'fusible', ref: 'F1', props: { corriente: '1' }, pines: { '1': 'a', '2': 'b' } },
      { tipo: 'resistencia', ref: 'R1', props: { valor: '1' }, pines: { '1': 'b', '2': '0' } },
      { tipo: 'resistencia', ref: 'R2', props: { valor: '1k' }, pines: { '1': 'a', '2': 'c' } },
      { tipo: 'capacitor', ref: 'C1', props: { valor: '100u' }, pines: { '1': 'c', '2': '0' } },
      { tipo: 'rele', ref: 'K1', props: { voltaje: '5' }, pines: { A1: 'a', A2: '0', COM: 'a', NA: 'd', NC: 'e' } },
      { tipo: 'resistencia', ref: 'R3', props: { valor: '100' }, pines: { '1': 'd', '2': '0' } },
      { tipo: 'resistencia', ref: 'R4', props: { valor: '100' }, pines: { '1': 'e', '2': '0' } },
      { tipo: 'interruptor', ref: 'S1', props: { estado: 'abierto' }, pines: { '1': 'a', '2': 'f' } },
      { tipo: 'resistencia', ref: 'R5', props: { valor: '1k' }, pines: { '1': 'f', '2': '0' } }
    ])
    const { c, motores } = armar(d)
    await c.iniciar()
    for (let k = 0; k < 60; k++) c.leer()
    const antes = c.leer()!
    expect(antes.piezas.get('p_1')).toMatchObject({ extra: { tipo: 'fusible', fundido: true } })
    expect(antes.piezas.get('p_5')).toMatchObject({ extra: { tipo: 'rele', operado: true } })
    const vc = antes.piezas.get('p_4')!.v
    expect(vc).toBeGreaterThan(0.3)
    expect(await c.accionar('p_8', 'cerrado')).toBe(true)
    const despues = c.leer()!
    expect(motores[0].cargas).toHaveLength(1)
    expect(despues.piezas.get('p_1')).toMatchObject({ extra: { tipo: 'fusible', fundido: true } })
    expect(despues.piezas.get('p_5')).toMatchObject({ extra: { tipo: 'rele', operado: true } })
    expect(despues.piezas.get('p_4')!.v).toBeGreaterThan(vc * 0.9)
  })

  it('con un transistor saturado y un MOSFET en la región lineal, la lectura llega a las palabras de la interfaz', async () => {
    const d = conEtiquetas(lib, [
      { tipo: 'fuente-dc', ref: 'V1', props: { voltaje: '12' }, pines: { '+': 'a', '-': '0' } },
      { tipo: 'fuente-dc', ref: 'V2', props: { voltaje: '5' }, pines: { '+': 'g', '-': '0' } },
      { tipo: 'resistencia', ref: 'R1', props: { valor: '1k' }, pines: { '1': 'g', '2': 'b' } },
      { tipo: 'resistencia', ref: 'R2', props: { valor: '1k' }, pines: { '1': 'a', '2': 'c' } },
      { tipo: 'npn', ref: 'Q1', props: { modelo: '2N2222' }, pines: { C: 'c', B: 'b', E: '0' } },
      { tipo: 'resistencia', ref: 'R3', props: { valor: '1k' }, pines: { '1': 'a', '2': 'dr' } },
      { tipo: 'mosfet-n', ref: 'Q2', props: { modelo: '2N7000' }, pines: { D: 'dr', G: 'g', S: '0' } }
    ])
    const { c } = armar(d)
    await c.iniciar()
    for (let k = 0; k < 20; k++) c.leer()
    const l = c.leer()!
    const con = calcularConexiones(d, lib)
    const filas = (id: string) => medicionDeSeleccion({ ...seleccionVacia(), piezas: new Set([id]) }, con, l)
    expect(filas('p_4')![0]).toMatchObject({ nombre: 'Región', valor: 'saturación' })
    expect(filas('p_6')![0]).toMatchObject({ nombre: 'Región', valor: 'lineal' })
  })

  it('cambiar el voltaje de una fuente mientras corre la cambia en caliente', async () => {
    const d = divisor()
    const { c, medio, motores } = armar(d)
    await c.iniciar()
    d.piezas.p_v1 = { ...d.piezas.p_v1, props: { voltaje: '10' } }
    expect(await c.actualizar()).toBe(true)
    expect(motores[0].cargas).toHaveLength(1)
    expect(motores[0].cambios.at(-1)).toEqual([{ indice: expect.any(Number), elemento: { type: 'V', a: 1, b: 0, wave: { kind: 'dc', v: 10 } } }])
    expect(c.leer()!.redes.get(medio)).toBeCloseTo(5, 3)
  })

  it('un fusible fundido se explica en el Registro y un clic lo repone sin detener la vista previa', async () => {
    const d = conEtiquetas(lib, [
      { tipo: 'fuente-dc', ref: 'V1', props: { voltaje: '5' }, pines: { '+': 'a', '-': '0' } },
      { tipo: 'fusible', ref: 'F1', props: { corriente: '1' }, pines: { '1': 'a', '2': 'b' } },
      { tipo: 'resistencia', ref: 'R1', props: { valor: '1' }, pines: { '1': 'b', '2': '0' } }
    ])
    const { c, registro } = armar(d)
    await c.iniciar()
    // Cada lectura avanza 1 ms: 4.55 A lo funden a los 26.9 ms.
    for (let k = 0; k < 40; k++) c.leer()
    expect(registro).toContainEqual(['aviso', 'F1 se fundió: pasaron 4.55 A durante 26.9 ms.'])
    expect(c.leer()!.piezas.get('p_1')).toMatchObject({ extra: { tipo: 'fusible', fundido: true } })
    expect(c.reponer('p_1')).toBe(true)
    expect(registro).toContainEqual(['info', 'F1 repuesto.'])
    // Ya entero, otro intento no hace nada.
    expect(c.reponer('p_1')).toBe(false)
    expect(c.reponer('p_2')).toBe(false)
    const l = c.leer()!.piezas.get('p_1')!
    expect(l.extra).toMatchObject({ tipo: 'fusible', fundido: false })
    expect(l.i).toBeCloseTo(5 / 1.1, 2)
    expect(c.fase).toBe('corriendo')
  })

  it('un circuito más grande que la memoria compartida no llega al motor y se dice en español', async () => {
    const d = divisor()
    const N = 1100
    for (let k = 0; k < N; k++) d.piezas[`p_c${k}`] = { id: `p_c${k}`, tipo: 'resistencia', ref: `R${k + 10}`, x: 10 + 8 * k, y: -40, rot: 0, espejo: false, props: { valor: '1k' } }
    d.piezas.p_ga = { id: 'p_ga', tipo: 'tierra', ref: 'GND2', x: 6, y: -40, rot: 0, espejo: false, props: {} }
    d.piezas.p_gb = { id: 'p_gb', tipo: 'tierra', ref: 'GND3', x: 14 + 8 * (N - 1), y: -40, rot: 0, espejo: false, props: {} }
    const { c, registro, motores, fases } = armar(d)
    expect(await c.iniciar()).toBe(false)
    expect(registro).toHaveLength(1)
    expect(registro[0][0]).toBe('error')
    expect(registro[0][1]).toMatch(/^La vista previa admite hasta 1024 redes y este circuito tiene 1102.$/)
    expect(motores.every((m) => m.cargas.length === 0)).toBe(true)
    expect(c.fase).toBe('detenida')
    expect(fases).toEqual([])
  })

  it('un error al cargar también detiene', async () => {
    const { c, registro } = armar()
    const motor = new MotorDePrueba()
    motor.falla = 'La vista previa admite hasta 1024 redes y este circuito tiene 1100.'
    const c2 = new ControlSimulacion({ crearMotor: () => motor, circuito: () => ({ doc: divisor(), lib, con: calcularConexiones(divisor(), lib) }), registrar: (t, tipo) => registro.push([tipo, t]), fase: () => {} })
    expect(await c2.iniciar()).toBe(false)
    expect(registro).toEqual([['error', 'La vista previa admite hasta 1024 redes y este circuito tiene 1100.']])
    expect(c2.fase).toBe('detenida')
    expect(c.fase).toBe('detenida')
  })

  it('un LED con más de su corriente nominal lo dice una vez en el Registro sin detener la vista previa, y otra al volver a simular', async () => {
    // VCC 5 V, potenciómetro de 10 kΩ al 0 % (el tramo queda en 10 Ω), cursor al LED rojo y cátodo a tierra.
    const d = conEtiquetas(lib, [
      { tipo: 'alimentacion', ref: 'PWR1', props: { nombre: 'VCC' }, pines: { '1': 'vcc' } },
      { tipo: 'potenciometro', ref: 'RV1', props: { valor: '10k', posicion: '0 %' }, pines: { '1': 'vcc', '2': '0', '3': 'cur' } },
      { tipo: 'led', ref: 'D1', props: { color: 'rojo' }, pines: { A: 'cur', K: '0' } }
    ])
    const { c, registro } = armar(d)
    expect(await c.iniciar()).toBe(true)
    for (let k = 0; k < 5; k++) c.leer()
    expect(c.fase).toBe('corriendo')
    const avisos = registro.filter(([, t]) => t.includes('nominales'))
    expect(avisos).toHaveLength(1)
    expect(avisos[0][0]).toBe('aviso')
    expect(avisos[0][1]).toMatch(/^D1 lleva 3\d\d mA, más de sus 20 mA nominales: agrega una resistencia en serie\.$/)
    c.detener()
    expect(await c.iniciar()).toBe(true)
    c.leer()
    expect(registro.filter(([, t]) => t.includes('nominales'))).toHaveLength(2)
    c.detener()
  })
})

describe('cargas que se cruzan', () => {
  const puerta = () => {
    let abrir!: () => void
    const p = new Promise<void>((r) => (abrir = r))
    return { p, abrir }
  }
  const conInterruptores = () => {
    const d = divisor()
    d.piezas.p_r1 = { ...d.piezas.p_r1, tipo: 'interruptor', ref: 'S1', props: { estado: 'abierto' } }
    d.piezas.p_r2 = { ...d.piezas.p_r2, tipo: 'interruptor', ref: 'S2', props: { estado: 'abierto' } }
    return armar(d)
  }

  it('dos accionar seguidos se aplican los dos en caliente, sin recargar', async () => {
    const { c, motores } = conInterruptores()
    await c.iniciar()
    const a1 = c.accionar('p_r1', 'cerrado')
    const a2 = c.accionar('p_r2', 'cerrado')
    expect(await a1).toBe(true)
    expect(await a2).toBe(true)
    expect(c.fase).toBe('corriendo')
    expect(c.opcionDe('p_r1')).toBe('cerrado')
    expect(c.opcionDe('p_r2')).toBe('cerrado')
    expect(motores[0].cargas).toHaveLength(1)
    expect(c.leer()).not.toBeNull()
  })

  it('accionar con la vista previa en pausa la deja en pausa aunque llegue otra acción mientras se aplica', async () => {
    const { c, motores } = conInterruptores()
    await c.iniciar()
    c.pausar()
    const a1 = c.accionar('p_r1', 'cerrado')
    const a2 = c.accionar('p_r2', 'cerrado')
    await a1
    await a2
    expect(c.fase).toBe('pausada')
    expect(motores[0].velocidad).toBe(0)
    expect(c.opcionDe('p_r2')).toBe('cerrado')
    expect(motores[0].cargas).toHaveLength(1)
  })

  it('detener mientras arranca resuelve iniciar con false y deja todo detenido', async () => {
    const { c, motores } = armar()
    const g = puerta()
    const p = c.iniciar() // el motor se crea de inmediato y se queda cargando
    motores[0].puerta = g.p
    expect(c.fase).toBe('arrancando')
    c.detener()
    g.abrir()
    expect(await p).toBe(false)
    expect(c.fase).toBe('detenida')
    expect(c.leer()).toBeNull()
    expect(motores[0].liberado).toBe(true)
  })
})

describe('accionar con el ratón', () => {
  it('el interruptor conmuta, el botón se sostiene, el fusible se repone y lo demás no se acciona', () => {
    expect(accionDeClic(lib.get('interruptor'))).toBe('conmutar')
    expect(accionDeClic(lib.get('boton'))).toBe('sostener')
    expect(accionDeClic(lib.get('fusible'))).toBe('reponer')
    expect(accionDeClic(lib.get('resistencia'))).toBeNull()
    expect(accionDeClic(undefined)).toBeNull()
  })

  it('la otra opción de un interruptor y de un botón', () => {
    expect(otraOpcion(lib.get('interruptor')!, 'abierto')).toBe('cerrado')
    expect(otraOpcion(lib.get('boton')!, 'sí')).toBe('no')
    expect(otraOpcion(lib.get('resistencia')!, '1k')).toBeUndefined()
  })

  it('el estado lógico conmuta entre 0 y 1', () => {
    expect(accionDeClic(lib.get('estado-logico'))).toBe('conmutar')
    expect(otraOpcion(lib.get('estado-logico')!, '0')).toBe('1')
    expect(otraOpcion(lib.get('estado-logico')!, '1')).toBe('0')
  })
})

describe('vista previa con piezas digitales', () => {
  const estado = (ref: string, valor: '0' | '1', red: string) => ({ tipo: 'estado-logico', ref, props: { estado: valor }, pines: { S: red } })
  const nandConLed = () =>
    conEtiquetas(lib, [
      estado('E1', '1', 'a'),
      estado('E2', '1', 'b'),
      { tipo: 'nand', ref: 'U1', pines: { A: 'a', B: 'b', Y: 'y' } },
      { tipo: 'resistencia', ref: 'R1', props: { valor: '330' }, pines: { '1': 'y', '2': 'led' } },
      { tipo: 'led', ref: 'D1', props: { color: 'rojo' }, pines: { A: 'led', K: '0' } }
    ])

  it('conmutar un estado lógico cambia la salida de la NAND en caliente, sin volver a t = 0 ni tocar el documento', async () => {
    const d = nandConLed()
    const { c, con, motores } = armar(d)
    const y = con.redes.find((r) => r.nombre === 'y')!.id
    expect(await c.iniciar()).toBe(true)
    expect(c.leer()!.redes.get(y)).toBeLessThan(0.1)
    expect(c.opcionDe('p_1')).toBe('1')
    expect(await c.accionar('p_1', '0')).toBe(true)
    expect(motores[0].cargas).toHaveLength(1)
    expect(motores[0].cambios.at(-1)).toEqual([{ indice: expect.any(Number), elemento: expect.objectContaining({ type: 'LOGIC', value: 0 }) }])
    const l = c.leer()!
    expect(l.redes.get(y)).toBeGreaterThan(4)
    expect(l.t).toBeGreaterThan(1e-3)
    expect(d.piezas.p_1.props.estado).toBe('1')
    c.detener()
    expect(c.opcionDe('p_1')).toBe('1')
  })

  it('el documento visible lleva el nivel accionado del estado lógico, y al detener vuelve a ser el guardado', async () => {
    const d = nandConLed()
    const { c } = armar(d)
    expect(await c.iniciar()).toBe(true)
    expect(c.documentoVisible()).toBe(d)
    await c.accionar('p_1', '0')
    expect(c.documentoVisible().piezas.p_1.props.estado).toBe('0')
    expect(d.piezas.p_1.props.estado).toBe('1')
    c.detener()
    expect(c.documentoVisible()).toBe(d)
  })

  it('un anillo de tres inversores oscila y el Registro lo dice una vez con su frecuencia', async () => {
    const no = (ref: string, a: string, y: string) => ({ tipo: 'not', ref, pines: { A: a, Y: y } })
    const { c, registro } = armar(conEtiquetas(lib, [no('U1', 'a', 'b'), no('U2', 'b', 'c'), no('U3', 'c', 'a')]))
    expect(await c.iniciar()).toBe(true)
    for (let k = 0; k < 3; k++) c.leer()
    const lazos = registro.filter(([, t]) => /lazo/.test(t))
    expect(lazos).toHaveLength(1)
    expect(lazos[0][0]).toBe('aviso')
    expect(lazos[0][1]).toMatch(/^U1, U2 y U3 forman un lazo que oscila a \d+(\.\d+)? MHz\.$/)
  })

  it('dos búferes de tres estados que manejan un 0 y un 1 a la vez lo dicen en el Registro una sola vez con el nombre de la red', async () => {
    const bufer = (ref: string, a: string) => ({ tipo: 'buffer-3-estados', ref, pines: { A: a, OE: 'habilita', Y: 'bus' } })
    const e = (ref: string, estado: string, red: string) => ({ tipo: 'estado-logico', ref, props: { estado }, pines: { S: red } })
    const { c, registro } = armar(conEtiquetas(lib, [e('E1', '1', 'a'), e('E2', '0', 'b'), e('E3', '0', 'habilita'), bufer('U1', 'a'), bufer('U2', 'b'), { tipo: 'not', ref: 'U3', pines: { A: 'bus', Y: 'y' } }, { tipo: 'resistencia', ref: 'R1', props: { valor: '1k' }, pines: { '1': 'y', '2': '0' } }]))
    expect(await c.iniciar()).toBe(true)
    for (let k = 0; k < 3; k++) c.leer()
    const avisos = registro.filter(([, t]) => /Conflicto en el bus/.test(t))
    expect(avisos).toEqual([['aviso', 'Conflicto en el bus: dos salidas manejan la red bus a niveles distintos.']])
  })

  it('un DAC0808 con una entrada entre los umbrales lo dice en el Registro una vez, con el nombre de la pieza', async () => {
    const bits = ['medio', '0', '0', '0', '0', '0', '0', '0']
    const pines = { ...Object.fromEntries(bits.map((b, k) => [`A${k + 1}`, b])), IO: 'io', GND: '0', VEE: 'vee', VCC: 'vcc', 'VREF+': 'refp', 'VREF-': 'refn', COMP: 'comp' }
    const v = (ref: string, voltaje: string, red: string) => ({ tipo: 'fuente-dc', ref, props: { voltaje }, pines: { '+': red, '-': '0' } })
    const r = (ref: string, valor: string, a: string, b: string) => ({ tipo: 'resistencia', ref, props: { valor }, pines: { '1': a, '2': b } })
    const { c, registro } = armar(conEtiquetas(lib, [v('V1', '5', 'vcc'), v('V2', '-15', 'vee'), v('V3', '10', 'vref'), v('V4', '1.4', 'medio'), r('R14', '5k', 'refp', 'vref'), r('R15', '5k', 'refn', '0'), r('RL', '1k', 'io', '0'), { tipo: 'dac0808', ref: 'U2', pines }]))
    expect(await c.iniciar()).toBe(true)
    for (let k = 0; k < 5; k++) c.leer()
    const avisos = registro.filter(([, t]) => /sin nivel definido/.test(t))
    expect(avisos).toEqual([['aviso', 'U2 tiene una entrada digital sin nivel definido (al aire, en alta impedancia o entre los umbrales): conserva el último código.']])
  })

  it('un DAC0808 con sus entradas bien definidas no avisa nada', async () => {
    const pines = { ...Object.fromEntries(Array.from({ length: 8 }, (_, k) => [`A${k + 1}`, k === 0 ? 'alto' : '0'])), IO: 'io', GND: '0', VEE: 'vee', VCC: 'vcc', 'VREF+': 'refp', 'VREF-': 'refn', COMP: 'comp' }
    const v = (ref: string, voltaje: string, red: string) => ({ tipo: 'fuente-dc', ref, props: { voltaje }, pines: { '+': red, '-': '0' } })
    const r = (ref: string, valor: string, a: string, b: string) => ({ tipo: 'resistencia', ref, props: { valor }, pines: { '1': a, '2': b } })
    const { c, registro } = armar(conEtiquetas(lib, [v('V1', '5', 'vcc'), v('V2', '-15', 'vee'), v('V3', '10', 'vref'), v('V4', '5', 'alto'), r('R14', '5k', 'refp', 'vref'), r('R15', '5k', 'refn', '0'), r('RL', '1k', 'io', '0'), { tipo: 'dac0808', ref: 'U2', pines }]))
    expect(await c.iniciar()).toBe(true)
    for (let k = 0; k < 5; k++) c.leer()
    expect(registro.filter(([, t]) => /sin nivel definido/.test(t))).toEqual([])
  })

  it('una red que conmuta se ve igual leída una vez o en cada cuadro', async () => {
    const no = (ref: string, a: string, y: string) => ({ tipo: 'not', ref, pines: { A: a, Y: y } })
    const { c } = armar(conEtiquetas(lib, [no('U1', 'a', 'b'), no('U2', 'b', 'c'), no('U3', 'c', 'a')]))
    expect(await c.iniciar()).toBe(true)
    const conmutan = () => [...(c.leer()!.digitales ?? new Map()).values()].map((d) => d.conmuta)
    const una = conmutan()
    // Varias lecturas seguidas (un cuadro tras otro, la sonda, reponer) no cambian lo que se dice.
    const seguidas = [conmutan(), conmutan(), conmutan()]
    expect(una.length).toBeGreaterThan(0)
    expect(una.every(Boolean)).toBe(true)
    for (const s of seguidas) expect(s).toEqual(una)
  })

  it('el 555 astable dice que oscila con su frecuencia y su ciclo de trabajo, y el contador que maneja cuenta sus flancos', async () => {
    const R = (ref: string, valor: string, a: string, b: string) => ({ tipo: 'resistencia', ref, props: { valor }, pines: { '1': a, '2': b } })
    const d = conEtiquetas(lib, [
      { tipo: 'fuente-dc', ref: 'V1', props: { voltaje: '5' }, pines: { '+': 'vcc', '-': '0' } },
      R('R1', '1k', 'vcc', 'dis'),
      R('R2', '10k', 'dis', 'thr'),
      { tipo: 'capacitor', ref: 'C1', props: { valor: '100n' }, pines: { '1': 'thr', '2': '0' } },
      { tipo: 'temporizador-555', ref: 'U1', props: { modelo: 'NE555' }, pines: { '1': '0', '2': 'thr', '3': 'out', '4': 'vcc', '5': 'cv', '6': 'thr', '7': 'dis', '8': 'vcc' } },
      { tipo: 'contador', ref: 'U2', pines: { CLK: 'out', RST: '0', Q0: 'q0', Q1: 'q1', Q2: 'q2', Q3: 'q3', CO: 'co' } }
    ])
    const { c, con } = armar(d)
    expect(await c.iniciar()).toBe(true)
    // Cada lectura del motor de prueba avanza 1 ms: diez lecturas son 10 ms simulados.
    let l = c.leer()!
    for (let k = 0; k < 9; k++) l = c.leer()!
    const x = l.piezas.get('p_4')!.extra!
    if (x.tipo !== '555') throw new Error(`se esperaba la lectura del 555 y llegó ${x.tipo}`)
    expect(x.f).toBeGreaterThan(640)
    expect(x.f).toBeLessThan(720)
    expect(x.ciclo).toBeGreaterThan(0.5)
    expect(x.ciclo).toBeLessThan(0.55)
    const out = con.redes.find((r) => r.nombre === 'out')!.id
    expect(l.digitales!.get(out)).toMatchObject({ nominal: null, vcc: null })
    expect(l.digitales!.get(out)!.f).toBeCloseTo(x.f, 6)
    // 686 Hz durante 10 ms: la primera carga del capacitor tarda más, así que van de cuatro a siete cuentas.
    const cuenta = l.piezas.get('p_5')!.extra
    if (cuenta?.tipo !== 'digital') throw new Error('se esperaba la lectura del contador')
    expect(cuenta.cuenta).toBeGreaterThanOrEqual(4)
    expect(cuenta.cuenta).toBeLessThanOrEqual(7)
  })

  it('un documento manipulado con 20,000 compuertas en una red se rechaza antes de compilar, en poco tiempo', async () => {
    const partes = Array.from({ length: 20000 }, (_, k) => ({ tipo: 'not', ref: `U${k + 1}`, pines: { A: 'n', Y: `y${k}` } }))
    const { c, registro } = armar(conEtiquetas(lib, partes))
    const t0 = performance.now()
    expect(await c.iniciar()).toBe(false)
    const dura = performance.now() - t0
    expect(registro.at(-1)).toEqual(['error', 'La vista previa admite hasta 4096 piezas simuladas y este circuito tiene 20000.'])
    expect(dura).toBeLessThan(200)
  }, 60_000)

  it('el tope de redes digitales se dice antes de cargar', () => {
    expect(limitesExcedidos({ nodes: 2, digital_nets: 5000, elements: [] })).toBe('La vista previa admite hasta 4096 redes digitales y este circuito tiene 5000.')
    expect(limitesExcedidos({ nodes: 2, digital_nets: 4096, elements: [] })).toBeNull()
  })
})

describe('mensajeDelMotor', () => {
  it('la matriz singular se explica y lo demás se vuelve oración', () => {
    expect(mensajeDelMotor('matriz singular: revisa nodos sin camino a tierra o fuentes de voltaje en paralelo')).toMatch(/^La vista previa se detuvo: el circuito no tiene solución/)
    expect(mensajeDelMotor('el worker falló')).toBe('La vista previa se detuvo: el worker falló.')
  })

  it('un diodo sin resistencia ya no se explica como falta de tierra', () => {
    expect(mensajeDelMotor('un diodo queda en directo sin nada que limite su corriente, agrega una resistencia en serie')).toBe(
      'La vista previa se detuvo: un diodo queda en directo sin nada que limite su corriente, agrega una resistencia en serie.'
    )
  })
})

/** El divisor con un potenciómetro de 10 kΩ entre 5 V y tierra y el cursor casi sin carga (1 GΩ). */
function circuitoConPot(posicion: string): Documento {
  const d = divisor()
  delete d.piezas.p_r1
  delete d.piezas.p_r2
  d.piezas.p_rv = { id: 'p_rv', tipo: 'potenciometro', ref: 'RV1', x: 10, y: -8, rot: 0, espejo: false, props: { valor: '10k', posicion } }
  d.cables.c_b = { id: 'c_b', puntos: [{ x: 14, y: -8 }, { x: 18, y: -8 }, { x: 18, y: 8 }, { x: 0, y: 8 }, { x: 0, y: 4 }] }
  d.cables.c_c = { id: 'c_c', puntos: [{ x: 10, y: -12 }, { x: 10, y: -16 }, { x: 30, y: -16 }] }
  d.piezas.p_rc = { id: 'p_rc', tipo: 'resistencia', ref: 'R9', x: 34, y: -16, rot: 0, espejo: false, props: { valor: '1G' } }
  d.cables.c_d = { id: 'c_d', puntos: [{ x: 38, y: -16 }, { x: 40, y: -16 }, { x: 40, y: 8 }, { x: 18, y: 8 }] }
  return d
}

describe('actualizar: el documento cambió mientras corre (el cursor de un potenciómetro)', () => {
  function armarPot(inicial = '25 %') {
    let doc = circuitoConPot(inicial)
    const fases: FaseSim[] = []
    const motores: MotorDePrueba[] = []
    const registro: [string, string][] = []
    const c = new ControlSimulacion({
      crearMotor: () => {
        const m = new MotorDePrueba()
        motores.push(m)
        return m
      },
      circuito: () => ({ doc, lib, con: calcularConexiones(doc, lib) }),
      registrar: (t, tipo) => registro.push([tipo, t]),
      fase: (f) => fases.push(f)
    })
    const poner = (posicion: string) => {
      doc = circuitoConPot(posicion)
    }
    return { c, fases, motores, registro, poner }
  }
  const cursor = (c: ControlSimulacion) => c.leer()!.piezas.get('p_rv')!.cursor

  it('cambia las resistencias en caliente: sin recargar, sin cambiar de motor y sin volver a t = 0', async () => {
    const { c, motores, poner, fases } = armarPot('25 %')
    await c.iniciar()
    expect(cursor(c)).toBeCloseTo(3.75, 3)
    const fasesAntes = fases.length
    c.leer()
    c.leer()
    const t = motores[0].sim!.time()
    expect(t).toBeGreaterThan(0)
    poner('75 %')
    expect(await c.actualizar()).toBe(true)
    expect(cursor(c)).toBeCloseTo(1.25, 3)
    expect(motores).toHaveLength(1)
    expect(motores[0].cargas).toHaveLength(1)
    expect(motores[0].cambios).toHaveLength(1)
    expect(motores[0].sim!.time()).toBeGreaterThan(t)
    expect(c.fase).toBe('corriendo')
    expect(fases.slice(fasesAntes)).toEqual([]) // ni 'arrancando' ni 'detenida' tras el arranque
  })

  it('las lecturas nunca caen a cero durante 30 cambios rápidos con el WASM de verdad', async () => {
    const { c, poner } = armarPot('25 %')
    await c.iniciar()
    c.leer()
    for (let k = 0; k < 30; k++) {
      poner(`${(k * 7) % 101} %`)
      const p = c.actualizar()
      // Se lee justo al pedir el cambio y otra vez al terminar: antes de este arreglo la primera lectura valía 0.
      expect(c.leer()).not.toBeNull()
      expect(cursor(c)).toBeGreaterThan(-1e-9)
      await p
      const lectura = c.leer()!
      expect(lectura.piezas.get('p_rv')!.cursor).toBeCloseTo(5 * (1 - ((k * 7) % 101) / 100), 1)
      expect(lectura.t).toBeGreaterThan(0)
    }
  })

  it('en pausa se queda en pausa', async () => {
    const { c, poner, motores } = armarPot('25 %')
    await c.iniciar()
    c.pausar()
    poner('50 %')
    await c.actualizar()
    expect(c.fase).toBe('pausada')
    expect(motores[0].velocidad).toBe(0)
    // Un solo paso corto calcula el voltaje con el valor nuevo: el reloj no salta 60 ms por cada cambio.
    expect(motores[0].velocidades.slice(-1)).toEqual([0])
    expect(motores[0].pasos).toBe(1)
    expect(c.leer()!.t).toBeLessThan(1e-4)
    expect(motores[0].cargas).toHaveLength(1)
    expect(cursor(c)).toBeCloseTo(2.5, 3)
  })

  it('reanudar justo después de un cambio en pausa no deja la vista previa «corriendo» pero congelada', async () => {
    const { c, poner, motores } = armarPot('25 %')
    await c.iniciar()
    c.pausar()
    poner('50 %')
    const a = c.actualizar()
    c.reanudar() // F5 antes de que termine de aplicarse el cambio
    await a
    expect(c.fase).toBe('corriendo')
    expect(motores[0].velocidad).toBe(1)
  })

  it('varios cambios seguidos: todos en caliente, con el último valor', async () => {
    const { c, poner, motores } = armarPot('25 %')
    await c.iniciar()
    poner('30 %')
    const a = c.actualizar()
    poner('40 %')
    const b = c.actualizar()
    poner('90 %')
    const d = c.actualizar()
    await Promise.all([a, b, d])
    expect(motores[0].cargas).toHaveLength(1)
    expect(cursor(c)).toBeCloseTo(0.5, 3)
    expect(c.fase).toBe('corriendo')
  })

  it('sin vista previa no hace nada', async () => {
    const { c, motores } = armarPot()
    expect(await c.actualizar()).toBe(false)
    expect(motores).toHaveLength(0)
  })

  it('un valor que no se puede simular detiene la vista previa y lo dice', async () => {
    const { c, poner, registro } = armarPot()
    await c.iniciar()
    poner('mucho')
    expect(await c.actualizar()).toBe(false)
    expect(c.fase).toBe('detenida')
    expect(registro.some(([tipo, t]) => tipo === 'error' && /posición/.test(t))).toBe(true)
  })
})

describe('cambiosEnCaliente', () => {
  const R = (a: number, b: number, ohms: number) => ({ type: 'R' as const, a, b, ohms })
  const V = (v: number) => ({ type: 'V' as const, a: 1, b: 0, wave: { kind: 'dc' as const, v } })
  it('lista las resistencias y fuentes que cambian de valor', () => {
    const antes = { nodes: 3, elements: [V(5), R(1, 2, 100), R(2, 0, 200)] }
    expect(cambiosEnCaliente(antes, { nodes: 3, elements: [V(5), R(1, 2, 100), R(2, 0, 300)] })).toEqual([{ indice: 2, elemento: R(2, 0, 300) }])
    expect(cambiosEnCaliente(antes, { nodes: 3, elements: [V(9), R(1, 2, 100), R(2, 0, 200)] })).toEqual([{ indice: 0, elemento: V(9) }])
    expect(cambiosEnCaliente(antes, { nodes: 3, elements: [{ type: 'I', a: 0, b: 1, amps: 1 }, antes.elements[1], antes.elements[2]] })).toBeNull()
    expect(cambiosEnCaliente(antes, antes)).toEqual([])
  })
  it('null si cambia la estructura o algo que no es una resistencia ni una fuente', () => {
    const antes = { nodes: 3, elements: [R(1, 2, 100), { type: 'C' as const, a: 2, b: 0, farads: 1e-6 }] }
    expect(cambiosEnCaliente(antes, { nodes: 4, elements: antes.elements })).toBeNull()
    expect(cambiosEnCaliente(antes, { nodes: 3, elements: [antes.elements[0]] })).toBeNull()
    expect(cambiosEnCaliente(antes, { nodes: 3, elements: [R(1, 0, 100), antes.elements[1]] })).toBeNull()
    expect(cambiosEnCaliente(antes, { nodes: 3, elements: [antes.elements[0], { type: 'C', a: 2, b: 0, farads: 2e-6 }] })).toBeNull()
    // Una senoidal que pasa de 50 Hz a 50 kHz pide un paso más corto.
    const sen = (freq: number) => ({ nodes: 2, elements: [{ type: 'V' as const, a: 1, b: 0, wave: { kind: 'sine' as const, offset: 0, amp: 1, freq } }, R(1, 0, 1000)] })
    expect(cambiosEnCaliente(sen(50), sen(60))).toHaveLength(1)
    // Una frecuencia que pide otro paso también es un cambio en caliente: el paso nuevo viaja aparte.
    expect(cambiosEnCaliente(sen(50), sen(50e3))).toHaveLength(1)
  })
  it('un estado lógico que cambia de valor va en caliente; con otra red o con otras redes digitales, no', () => {
    const L = (out: number, value: 0 | 1) => ({ type: 'LOGIC' as const, out, value })
    const antes = { nodes: 1, digital_nets: 2, elements: [L(0, 1), L(1, 0)] }
    expect(cambiosEnCaliente(antes, { ...antes, elements: [L(0, 0), L(1, 0)] })).toEqual([{ indice: 0, elemento: L(0, 0) }])
    expect(cambiosEnCaliente(antes, { ...antes, elements: [L(1, 1), L(1, 0)] })).toBeNull()
    expect(cambiosEnCaliente(antes, { ...antes, digital_nets: 3 })).toBeNull()
  })
})

describe('sobrecorriente con una fuente de pulsos', () => {
  it('un LED que pasa de su nominal en cada pulso deja una sola línea en el Registro por vista previa', async () => {
    // 5 V a 300 Hz por 10 Ω al LED: cada pulso pasa de 20 mA y entre pulsos baja a cero (cada lectura avanza 1 ms).
    const d = conEtiquetas(lib, [
      { tipo: 'fuente-pulso', ref: 'V1', props: { alto: '5', frecuencia: '300', ciclo: '50 %' }, pines: { '+': 'a', '-': '0' } },
      { tipo: 'resistencia', ref: 'R1', props: { valor: '10' }, pines: { '1': 'a', '2': 'b' } },
      { tipo: 'led', ref: 'D1', props: { color: 'rojo' }, pines: { A: 'b', K: '0' } }
    ])
    const { c, registro } = armar(d)
    expect(await c.iniciar()).toBe(true)
    let arriba = 0, abajo = 0
    for (let k = 0; k < 60; k++) {
      const i = c.leer()!.piezas.get('p_2')!.i
      if (i > 0.02) arriba++
      else if (i < 0.018) abajo++
    }
    // La corriente cruzó muchas veces hacia arriba y hacia abajo.
    expect(arriba).toBeGreaterThan(10)
    expect(abajo).toBeGreaterThan(10)
    expect(registro.filter(([, t]) => t.includes('nominales'))).toHaveLength(1)
    c.detener()
  })
})

describe('cambios en caliente que dejarían el circuito sin simular', () => {
  /** Un editor y la vista previa que lee su documento, como en la ventana; el editor prueba cada cambio con la vista previa. */
  async function simulando(d: Documento, rieles: Record<string, string> = {}) {
    if (Object.keys(rieles).length) d.alimentaciones = Object.fromEntries(Object.entries(rieles).map(([nombre, voltaje], i) => [`a_${i}`, { id: `a_${i}`, nombre, voltaje }]))
    const editor = new Editor(lib, undefined, idSecuencial(), { registrar: () => {} })
    editor.cargar(d)
    const registro: [string, string][] = []
    const c = new ControlSimulacion({ crearMotor: () => new MotorDePrueba(), circuito: () => ({ doc: editor.doc, lib, con: editor.con }), registrar: (t, tipo) => registro.push([tipo, t]), fase: () => {} })
    editor.ponerGanchos({ probarEnCaliente: (doc) => c.probarCambio(doc) })
    expect(await c.iniciar()).toBe(true)
    editor.ponerSimulando(true)
    return { editor, c, registro }
  }

  it('un VCC unido a un «+5V» no pasa a 12 V: el campo lo dice, el documento no cambia y la vista previa sigue', async () => {
    const d = conEtiquetas(lib, [
      { tipo: 'alimentacion', ref: 'PWR1', props: { nombre: 'VCC' }, pines: { '1': 'a' } },
      { tipo: 'alimentacion', ref: 'PWR2', props: { nombre: '+5V' }, pines: { '1': 'a' } },
      { tipo: 'resistencia', ref: 'R1', props: { valor: '1k' }, pines: { '1': 'a', '2': '0' } }
    ])
    const { editor, c, registro } = await simulando(d)
    expect(editor.cambiarPropiedad('p_0', 'voltaje', '12')).toMatch(/tiene dos voltajes distintos: 5 V y 12 V\.$/)
    expect(editor.doc.alimentaciones ?? {}).toEqual({})
    expect(await c.actualizar()).toBe(true)
    expect(c.fase).toBe('corriendo')
    expect(registro.filter(([tipo]) => tipo === 'error')).toEqual([])
    c.detener()
  })

  it('un riel de 0 V con un LED directo a tierra no pasa a 5 V (el error no nombra al riel en el campo de otra pieza)', async () => {
    const d = conEtiquetas(lib, [
      { tipo: 'alimentacion', ref: 'PWR1', props: { nombre: 'X' }, pines: { '1': 'a' } },
      { tipo: 'led', ref: 'D1', props: { color: 'rojo' }, pines: { A: 'a', K: '0' } }
    ])
    const { editor, c } = await simulando(d, { X: '0' })
    expect(editor.cambiarRiel('X', '5')).toBe('D1 está conectado directo a X, sin resistencia: agrega una en serie.')
    expect(Object.values(editor.doc.alimentaciones!).map((a) => a.voltaje)).toEqual(['0'])
    expect(c.fase).toBe('corriendo')
    c.detener()
  })

  it('el valor de una fuente que dejaría un LED directo se rechaza aunque el error nombre al LED', async () => {
    const d = conEtiquetas(lib, [
      { tipo: 'fuente-dc', ref: 'V1', props: { voltaje: '0.3' }, pines: { '+': 'a', '-': '0' } },
      { tipo: 'led', ref: 'D1', props: { color: 'rojo' }, pines: { A: 'a', K: '0' } }
    ])
    const { editor, c } = await simulando(d)
    expect(editor.cambiarPropiedad('p_0', 'voltaje', '5')).toMatch(/^D1 está conectado directo/)
    expect(editor.doc.piezas.p_0.props.voltaje).toBe('0.3')
    expect(c.fase).toBe('corriendo')
    c.detener()
  })
})

describe('ControlSimulacion con instrumentos', () => {
  const seno = (extra: Parte[] = []): Parte[] => [
    { tipo: 'generador', ref: 'XFG1', props: {}, pines: { '+': 's', COM: '0' } },
    { tipo: 'resistencia', ref: 'R1', props: { valor: '1k' }, pines: { '1': 's', '2': '0' } },
    { tipo: 'osciloscopio', ref: 'XSC1', props: { disp_modo: 'Automático' }, pines: { A: 's', B: '0', C: '0', D: '0' } },
    ...extra
  ]

  it('el arranque deja lo armado para que la franja elija pestaña (osciloscopio conectado) y el panel derecho abra Mediciones (multímetro)', async () => {
    const a = armar(conEtiquetas(lib, seno([{ tipo: 'multimetro', ref: 'XMM1', props: { modo: 'V AC' }, pines: { '+': 's', COM: '0' } }])))
    expect(a.c.arranque).toBeNull()
    await a.c.iniciar()
    expect(pestañaAlSimular(a.c.arranque?.instrumentos, a.c.arranque?.problemas ?? 0)).toBe('osciloscopio')
    a.c.detener()
    const solo = armar(conEtiquetas(lib, [
      { tipo: 'resistencia', ref: 'R1', props: { valor: '1k' }, pines: { '1': 's', '2': '0' } },
      { tipo: 'alimentacion', ref: 'PWR1', props: { nombre: 'VCC' }, pines: { '1': 's' } },
      { tipo: 'multimetro', ref: 'XMM1', props: { modo: 'V DC' }, pines: { '+': 's', COM: '0' } }
    ]))
    await solo.c.iniciar()
    expect(pestañaAlSimular(solo.c.arranque?.instrumentos, solo.c.arranque?.problemas ?? 0)).toBeNull()
    expect(abreMedicionesAlSimular(solo.c.arranque?.instrumentos)).toBe(true)
    const nada = armar()
    await nada.c.iniciar()
    expect(pestañaAlSimular(nada.c.arranque?.instrumentos, nada.c.arranque?.problemas ?? 0)).toBeNull()
    expect(abreMedicionesAlSimular(nada.c.arranque?.instrumentos)).toBe(false)
  })

  it('el multímetro da su cifra con cuatro cifras y el osciloscopio su pantalla', async () => {
    const { c } = armar(conEtiquetas(lib, seno([{ tipo: 'multimetro', ref: 'XMM1', props: { modo: 'V AC' }, pines: { '+': 's', COM: '0' } }])))
    expect(await c.iniciar()).toBe(true)
    for (let k = 0; k < 40; k++) c.leer()
    const l = c.leerInstrumentos('p_2')!
    expect(l.capturada).toBe(false)
    expect(l.multimetros.get('p_3')!.texto).toMatch(/^67\d\.\d mV$/)
    expect(l.pantalla!.estado).toBe('disparado')
  })

  it('Retroceder recorta lo que capturaron el osciloscopio y el multímetro hasta el instante al que vuelve', async () => {
    const { c } = armar(conEtiquetas(lib, seno([{ tipo: 'multimetro', ref: 'XMM1', props: { modo: 'V AC' }, pines: { '+': 's', COM: '0' } }])))
    await c.avanzar(2e-3)
    await c.avanzar(5e-3)
    c.leer()
    const antes = (await c.registroFino('p_2'))!
    expect(antes.tCaptura).toBeCloseTo(7e-3, 9)
    const mmAntes = c.leerInstrumentos()!.multimetros.get('p_3')!
    expect(mmAntes.t).toBeCloseTo(7e-3, 9)
    expect((await c.retroceder())!.t).toBeCloseTo(2e-3, 9)
    const despues = (await c.registroFino('p_2'))!
    // Las sondas del motor ya no tienen lo posterior: la captura termina donde volvió.
    expect(despues.tCaptura).toBeCloseTo(2e-3, 9)
    expect(despues.t0 + despues.n * despues.dt).toBeLessThan(2.1e-3)
    // El multímetro vuelve a leer la ventana que termina ahí (no la de los 7 ms deshechos); el motor falso publica al leer.
    c.leer()
    const mm = c.leerInstrumentos()!.multimetros.get('p_3')!
    expect(mm.t).toBeCloseTo(2e-3, 9)
    // Y al avanzar de nuevo vuelve a registrar lo mismo que la primera vez.
    await c.avanzar(5e-3)
    const otra = (await c.registroFino('p_2'))!
    expect(otra.tCaptura).toBeCloseTo(7e-3, 9)
    expect(otra.n).toBe(antes.n)
    expect(otra.columnas).toEqual(antes.columnas)
  })

  it('el rango del óhmetro se queda en la sesión: un cambio en caliente no lo devuelve al inicial', async () => {
    const d = conEtiquetas(lib, [
      { tipo: 'resistencia', ref: 'R1', props: { valor: '4.7M' }, pines: { '1': 'x', '2': '0' } },
      { tipo: 'multimetro', ref: 'XMM1', props: { modo: 'Ω' }, pines: { '+': 'x', COM: '0' } }
    ])
    const { c, motores } = armar(d)
    expect(await c.iniciar()).toBe(true)
    for (let k = 0; k < 6; k++) c.leer()
    expect(c.leerInstrumentos()!.multimetros.get('p_1')!.texto).toMatch(/^4\.\d{3} MΩ$/)
    d.piezas.p_0.props.valor = '4.8M'
    expect(await c.actualizar()).toBe(true)
    expect(motores[0].cargas).toHaveLength(1)
    const ultimo = motores[0].cambios.at(-1)!
    expect(ultimo).toHaveLength(1)
    expect(ultimo[0].elemento).toMatchObject({ type: 'R', ohms: 4.8e6 })
  })

  it('el fusible del multímetro en modo de corriente sobre una batería: el Registro explica por qué y se repone', async () => {
    const { c, registro } = armar(
      conEtiquetas(lib, [
        { tipo: 'bateria', ref: 'B1', props: { voltaje: '9' }, pines: { '+': 'x', '-': '0' } },
        { tipo: 'multimetro', ref: 'XMM1', props: { modo: 'A DC' }, pines: { '+': 'x', COM: '0' } }
      ])
    )
    expect(await c.iniciar()).toBe(true)
    for (let k = 0; k < 300; k++) c.leer()
    expect(registro).toContainEqual(['aviso', 'XMM1 fundió su fusible: en modo de corriente va en serie, no en paralelo.'])
    expect(c.leerInstrumentos()!.multimetros.get('p_1')!.fundido).toBe(true)
    expect(c.reponer('p_1')).toBe(true)
    expect(registro).toContainEqual(['info', 'XMM1 repuesto.'])
  })

  it('más de cuatro osciloscopios no simulan', async () => {
    const osc = (k: number): Parte => ({ tipo: 'osciloscopio', ref: `XSC${k}`, props: {}, pines: { A: 's', B: '0', C: '0', D: '0' } })
    const { c, registro } = armar(conEtiquetas(lib, [...seno().slice(0, 2), ...[1, 2, 3, 4, 5].map(osc)]))
    expect(await c.iniciar()).toBe(false)
    expect(registro).toContainEqual(['error', 'La vista previa admite hasta 4 osciloscopios y este circuito tiene 5.'])
  })

  it('al detener queda la última pantalla hasta la vista previa siguiente (decisión P6)', async () => {
    const { c } = armar(conEtiquetas(lib, seno()))
    expect(await c.iniciar()).toBe(true)
    for (let k = 0; k < 40; k++) c.leer()
    const v = c.leerInstrumentos('p_2')!.pantalla!.version
    c.detener()
    const l = c.leerInstrumentos('p_2')!
    expect(l.capturada).toBe(true)
    expect(l.pantalla!.version).toBe(v)
    expect(await c.iniciar()).toBe(true)
    expect(c.leerInstrumentos('p_2')?.capturada ?? false).toBe(false)
  })

  it('al detener se guarda la captura entera: exportar sigue dando todo lo registrado hasta la vista previa siguiente', async () => {
    const { c, motores } = armar(conEtiquetas(lib, seno()))
    expect(await c.iniciar()).toBe(true)
    for (let k = 0; k < 60; k++) c.leer()
    const enVivo = await c.capturaAmplia('p_2')
    expect(enVivo).not.toBeNull()
    c.detener()
    const guardada = await c.capturaAmplia('p_2')
    expect(guardada).not.toBeNull()
    expect(guardada!.ncol).toBe(2000)
    // Es toda la captura y no la última pantalla: abarca más tiempo que la base de tiempo (10 divisiones de 1 ms).
    expect(guardada!.tCaptura - guardada!.t0).toBeGreaterThan(10e-3)
    expect(guardada!.tCaptura).toBeGreaterThanOrEqual(enVivo!.tCaptura)
    // El worker se suelta después de contestar, y la captura sigue ahí.
    expect(motores[0].liberado).toBe(true)
    expect(await c.capturaAmplia('p_2')).toBe(guardada)
    expect(await c.capturaAmplia('otro')).toBeNull()
    // También quedan las columnas finas, para desplazarse por todo lo capturado.
    const fino = await c.registroFino('p_2')
    expect(fino).not.toBeNull()
    expect(fino!.t0).toBeLessThan(guardada!.t0 + 1e-9)
    expect(fino!.n * fino!.dt).toBeGreaterThan(10e-3)
    // Una vista previa nueva la reemplaza.
    expect(await c.iniciar()).toBe(true)
    for (let k = 0; k < 5; k++) c.leer()
    expect(await c.capturaAmplia('p_2')).not.toBe(guardada)
  })

  it('otra base de tiempo simulando se manda sin recargar', async () => {
    const d = conEtiquetas(lib, seno())
    const { c, motores } = armar(d)
    expect(await c.iniciar()).toBe(true)
    for (let k = 0; k < 5; k++) c.leer()
    d.piezas.p_2.props.base = '2m'
    expect(await c.actualizar()).toBe(true)
    expect(motores[0].cargas).toHaveLength(1)
    expect(motores[0].configuraciones).toHaveLength(1)
    expect(motores[0].configuraciones[0].osciloscopios[0].ajustes.base).toBe(2e-3)
  })
})

describe('ControlSimulacion: el tiempo, la corriente animada, los avisos y el quemado', () => {
  it('la velocidad no reinicia: se manda al motor corriendo, se conserva al pausar y al detener, y «Sin límite de tiempo real» va sin tope', async () => {
    const { c, motores } = armar()
    c.ponerVelocidad(0.01)
    expect(await c.iniciar()).toBe(true)
    expect(motores[0].velocidades.at(-1)).toBe(0.01)
    c.pausar()
    c.reanudar()
    expect(motores[0].velocidades.slice(-2)).toEqual([0, 0.01])
    c.ponerVelocidad(Number.POSITIVE_INFINITY)
    expect(c.velocidadVigente).toBe(Number.POSITIVE_INFINITY)
    expect(motores[0].sinTopes.at(-1)).toBe(true)
    expect(motores[0].cargas).toHaveLength(1)
    c.ponerVelocidad(0.001)
    c.detener()
    expect(await c.iniciar()).toBe(true)
    expect(motores[1].velocidades.at(-1)).toBe(0.001)
  })

  it('F6 detenida arranca en pausa y avanza Δ desde t = 0; corriendo pausa; en pausa avanza Δ o un paso del motor', async () => {
    const avances: unknown[] = []
    const { c, motores } = armar(divisor(), lib, { avance: (a) => avances.push(a) })
    const r = await c.avanzar(2e-3)
    expect(c.fase).toBe('pausada')
    expect(r!.t).toBeCloseTo(2e-3, 12)
    expect(avances).toEqual([{ tipo: 'avanzar', desde: 0, meta: 2e-3 }, null])
    const paso = await c.avanzar('paso')
    expect(paso!.dt).toBeGreaterThan(0)
    // Un paso del motor: a lo más el paso máximo de la vista previa.
    expect(paso!.dt).toBeLessThanOrEqual(PASO_VISTA * (1 + 1e-9))
    c.reanudar()
    expect(await c.avanzar(1e-3)).toBeNull()
    expect(c.fase).toBe('pausada')
    expect(motores[0].avances).toEqual([2e-3, 'paso'])
  })

  it('un avance desde detenida y otro desde la pausa avanzan justo lo elegido, y el tiempo leído es la suma', async () => {
    const { c, motores } = armar(divisor(), lib)
    // Una división de 1 ms, un tiempo fijo de 300 µs y un paso de cálculo, tras detener y volver a empezar.
    for (const dt of [1e-3, 3e-4]) {
      const r = (await c.avanzar(dt))!
      expect(c.fase).toBe('pausada')
      expect(r.dt).toBeCloseTo(dt, 12)
      expect(r.t).toBeCloseTo(dt, 12)
      const r2 = (await c.avanzar(dt))!
      expect(r2.dt).toBeCloseTo(dt, 12)
      expect(r2.t).toBeCloseTo(2 * dt, 12)
      const p = (await c.avanzar('paso'))!
      expect(p.dt).toBeGreaterThan(0)
      expect(p.t).toBeCloseTo(2 * dt + p.dt, 12)
      c.detener()
      expect(c.fase).toBe('detenida')
    }
    expect(motores.length).toBe(2)
  })

  it('Retroceder vuelve al instante de antes del último avance, uno tras otro, y solo se puede desde la pausa', async () => {
    const cuentas: number[] = []
    const { c, motores } = armar(divisor(), lib, { retrocesos: (n) => cuentas.push(n) })
    expect(c.puedeRetroceder).toBe(false)
    expect(await c.retroceder()).toBeNull()
    await c.avanzar(2e-3)
    await c.avanzar(3e-3)
    expect(c.retrocesos).toBe(2)
    expect(c.puedeRetroceder).toBe(true)
    expect(cuentas).toEqual([1, 2])
    expect(motores[0].sim!.time()).toBeCloseTo(5e-3, 12)
    expect((await c.retroceder())!.t).toBeCloseTo(2e-3, 12)
    expect(motores[0].sim!.time()).toBeCloseTo(2e-3, 12)
    expect((await c.retroceder())!.t).toBeCloseTo(0, 12)
    expect(c.retrocesos).toBe(0)
    expect(c.puedeRetroceder).toBe(false)
    expect(await c.retroceder()).toBeNull()
    expect(motores[0].retrocesos).toBe(2)
    // Avanzar otra vez desde el punto al que se volvió da lo mismo que la primera vez.
    const r = await c.avanzar(2e-3)
    expect(r!.t).toBeCloseTo(2e-3, 12)
  })

  it('Retroceder reinicia los vigilantes de avisos: el LED que pasaba su corriente nominal vuelve a avisar', async () => {
    const d = conEtiquetas(lib, [
      { tipo: 'alimentacion', ref: 'PWR1', props: { nombre: 'VCC' }, pines: { '1': 'vcc' } },
      { tipo: 'potenciometro', ref: 'RV1', props: { valor: '10k', posicion: '0 %' }, pines: { '1': 'vcc', '2': '0', '3': 'cur' } },
      { tipo: 'led', ref: 'D1', props: { color: 'rojo' }, pines: { A: 'cur', K: '0' } }
    ])
    const { c, registro } = armar(d)
    const avisos = () => registro.filter(([, t]) => t.includes('nominales')).length
    await c.avanzar(2e-3)
    for (let k = 0; k < 3; k++) c.leer()
    expect(avisos()).toBe(1)
    await c.avanzar(2e-3)
    c.leer()
    expect(avisos()).toBe(1)
    expect(await c.retroceder()).not.toBeNull()
    c.leer()
    expect(avisos()).toBe(2)
  })

  it('un avance rechazado o con error (t = NaN, sin dato del motor) no cuenta como un avance al que volver', async () => {
    const { c, motores } = armar(divisor(), lib)
    await c.avanzar(2e-3)
    expect(c.retrocesos).toBe(1)
    motores[0].avanzar = (async () => ({ t: Number.NaN, dt: 0, interrumpida: true })) as unknown as (typeof motores)[0]['avanzar']
    await c.avanzar(1e-3)
    expect(c.retrocesos).toBe(1)
  })

  it('Retroceder no actúa corriendo ni durante un avance, y reanudar, editar en caliente o reponer olvidan lo guardado', async () => {
    const { c, motores } = armar()
    await c.avanzar(1e-3)
    expect(c.puedeRetroceder).toBe(true)
    c.reanudar()
    expect(c.fase).toBe('corriendo')
    expect(c.retrocesos).toBe(0)
    expect(c.puedeRetroceder).toBe(false)
    expect(await c.retroceder()).toBeNull()
    expect(motores[0].retrocesos).toBe(0)
    c.pausar()
    await c.avanzar(1e-3)
    expect(c.retrocesos).toBe(1)
    // Un avance en curso: no se retrocede.
    const p = c.avanzar(1e-3)
    expect(c.puedeRetroceder).toBe(false)
    await p
    expect(c.retrocesos).toBe(2)
    // Detener lo olvida todo.
    c.detener()
    expect(c.retrocesos).toBe(0)
    expect(c.puedeRetroceder).toBe(false)
  })

  it('cambiar un valor en caliente descarta lo guardado y Retroceder ya no tiene a qué volver', async () => {
    const d = conEtiquetas(lib, [
      { tipo: 'fuente-dc', ref: 'V1', props: { voltaje: '5' }, pines: { '+': 'a', '-': '0' } },
      { tipo: 'resistencia', ref: 'R1', props: { valor: '1k' }, pines: { '1': 'a', '2': 'b' } },
      { tipo: 'resistencia', ref: 'R2', props: { valor: '1k' }, pines: { '1': 'b', '2': '0' } }
    ])
    const { c, motores } = armar(d)
    await c.iniciar()
    c.pausar()
    await c.avanzar(1e-3)
    expect(c.retrocesos).toBe(1)
    d.piezas.p_2 = { ...d.piezas.p_2, props: { valor: '2k' } }
    await c.actualizar()
    expect(motores[0].cambios.length).toBeGreaterThan(0)
    expect(c.retrocesos).toBe(0)
    expect(await c.retroceder()).toBeNull()
  })

  it('si el motor olvida avances por su tope de memoria, el Registro lo dice una sola vez y la cuenta baja', async () => {
    const { c, motores, registro } = armar()
    await c.avanzar(1e-3)
    motores[0].perderEstados(3, 150)
    motores[0].perderEstados(1, 149)
    const dichos = registro.filter(([, t]) => t.includes('tope de memoria'))
    expect(dichos).toHaveLength(1)
    expect(dichos[0][1]).toContain('150 avances')
    expect(c.retrocesos).toBe(149)
  })

  it('«Avanzar hasta t» llega a t; un instante pasado se dice y «Reiniciar y avanzar hasta t» vuelve a empezar', async () => {
    const { c, motores } = armar()
    const r = await c.avanzarHasta(5e-3)
    expect(r !== 'pasado' && r!.t).toBeCloseTo(5e-3, 12)
    expect(await c.avanzarHasta(1e-3)).toBe('pasado')
    const otra = await c.avanzarHasta(1e-3, true)
    expect(otra !== 'pasado' && otra!.t).toBeCloseTo(1e-3, 12)
    expect(motores).toHaveLength(2)
  })

  it('con la corriente animada cada tramo del divisor lleva sus 2.5 mA', async () => {
    const { c } = armar()
    c.ponerCorrientes(true)
    expect(await c.iniciar()).toBe(true)
    c.leer()
    const l = c.leer()!
    expect(l.corrientes!.tramos.length).toBeGreaterThan(0)
    // La media desde que arrancó: el primer paso parte de cero.
    for (const x of l.corrientes!.media) expect(Math.abs(x)).toBeCloseTo(2.5e-3, 6)
    c.ponerCorrientes(false)
    expect(c.leer()!.corrientes).toBeUndefined()
  })

  it('una resistencia de 100 Ω con 7 V (0.49 W) avisa contra 0.25 W y no contra 0.5 W, y el aviso se queda 1 s', async () => {
    let reloj = 0
    const partes = (potencia?: string): Parte[] => [
      { tipo: 'fuente-dc', ref: 'V1', props: { voltaje: '7' }, pines: { '+': 'a', '-': '0' } },
      { tipo: 'resistencia', ref: 'R1', props: { valor: '100', ...(potencia ? { potencia } : {}) }, pines: { '1': 'a', '2': '0' } }
    ]
    const d = conEtiquetas(lib, partes())
    const { c, registro, motores } = armar(d, lib, { reloj: () => reloj })
    expect(await c.iniciar()).toBe(true)
    motores[0].conPromedio = true
    expect(c.leer()!.avisos!.get('p_1')).toMatchObject({ texto: '0.49 W, máximo 0.25 W', excedido: true })
    expect(registro.filter(([, t]) => /R1 disipa 0.49 W/.test(t))).toHaveLength(1)
    c.leer()
    expect(registro.filter(([, t]) => /R1 disipa/.test(t))).toHaveLength(1)
    // A 3.5 V la resistencia disipa 0.12 W: el aviso se queda un segundo más de reloj y se va.
    d.piezas.p_0.props.voltaje = '3.5'
    expect(await c.actualizar()).toBe(true)
    c.leer()
    reloj = 500
    expect(c.leer()!.avisos!.get('p_1')).toMatchObject({ excedido: false })
    reloj = 1500
    expect(c.leer()!.avisos!.has('p_1')).toBe(false)
    const otro = armar(conEtiquetas(lib, partes('0.5 W')))
    expect(await otro.c.iniciar()).toBe(true)
    otro.motores[0].conPromedio = true
    expect(otro.c.leer()!.avisos!.size).toBe(0)
  })

  it('con «Las piezas se queman», un LED a 50 mA queda abierto tras 0.5 s simulados, el Registro lo dice y un clic lo repone', async () => {
    const partes: Parte[] = [
      { tipo: 'fuente-dc', ref: 'V1', props: { voltaje: '5' }, pines: { '+': 'a', '-': '0' } },
      { tipo: 'resistencia', ref: 'R1', props: { valor: '62' }, pines: { '1': 'a', '2': 'k' } },
      { tipo: 'led', ref: 'D1', props: { color: 'rojo' }, pines: { A: 'k', K: '0' } }
    ]
    let quemar = true
    const { c, registro, motores } = armar(conEtiquetas(lib, partes), lib, { quemar: () => quemar })
    expect(await c.iniciar()).toBe(true)
    motores[0].conPromedio = true
    expect(c.leer()!.piezas.get('p_2')!.i).toBeGreaterThan(0.045)
    let lecturas = 1
    for (; lecturas < 600 && !c.quemada('p_2'); lecturas++) c.leer()
    expect(c.quemada('p_2')).toBe(true)
    // 1 ms por lectura: medio segundo simulado, con la lectura en que se pasa.
    expect(lecturas).toBeGreaterThanOrEqual(500)
    expect(lecturas).toBeLessThanOrEqual(502)
    expect(registro.some(([tipo, t]) => tipo === 'error' && /D1 se quemó/.test(t))).toBe(true)
    c.leer()
    expect(Math.abs(c.leer()!.piezas.get('p_2')!.i)).toBeLessThan(1e-7)
    expect(c.reponerQuemada('p_2')).toBe(true)
    c.leer()
    expect(c.leer()!.piezas.get('p_2')!.i).toBeGreaterThan(0.045)
    // Sin la opción nada se quema.
    quemar = false
    c.detener()
    expect(await c.iniciar()).toBe(true)
    motores[1].conPromedio = true
    for (let k = 0; k < 600; k++) c.leer()
    expect(c.quemada('p_2')).toBe(false)
  })

  it('una recarga completa (otro color del LED) deja quemada la pieza que estaba quemada', async () => {
    const partes: Parte[] = [
      { tipo: 'fuente-dc', ref: 'V1', props: { voltaje: '5' }, pines: { '+': 'a', '-': '0' } },
      { tipo: 'resistencia', ref: 'R1', props: { valor: '62' }, pines: { '1': 'a', '2': 'k' } },
      { tipo: 'led', ref: 'D1', props: { color: 'rojo' }, pines: { A: 'k', K: '0' } }
    ]
    const doc = conEtiquetas(lib, partes)
    const { c, motores } = armar(doc, lib, { quemar: () => true })
    expect(await c.iniciar()).toBe(true)
    motores[0].conPromedio = true
    for (let k = 0; k < 600 && !c.quemada('p_2'); k++) c.leer()
    expect(c.quemada('p_2')).toBe(true)
    // Otro color cambia el modelo del diodo: no es un cambio en caliente y la netlist se carga de nuevo desde t = 0.
    doc.piezas.p_2.props.color = 'verde'
    expect(await c.actualizar()).toBe(true)
    expect(motores.at(-1)!.cargas.length).toBeGreaterThan(1)
    expect(c.quemada('p_2')).toBe(true)
    expect(motores.at(-1)!.quemados.at(-1)).toEqual([2, true])
    c.leer()
    expect(Math.abs(c.leer()!.piezas.get('p_2')!.i)).toBeLessThan(1e-7)
  })

  it('el fusible dice cuánto le falta para fundirse dentro de 10 % del instante en que el motor lo funde', async () => {
    // 5 V sobre el fusible de 1 A (0.1 Ω) y 1.567 Ω: 3 A, que lo funden en τ ln(9/5) = 73.5 ms desde frío.
    const partes: Parte[] = [
      { tipo: 'fuente-dc', ref: 'V1', props: { voltaje: '5' }, pines: { '+': 'a', '-': '0' } },
      { tipo: 'fusible', ref: 'F1', props: { corriente: '1' }, pines: { '1': 'a', '2': 'b' } },
      { tipo: 'resistencia', ref: 'R1', props: { valor: '1.5667' }, pines: { '1': 'b', '2': '0' } }
    ]
    const { c, motores } = armar(conEtiquetas(lib, partes))
    expect(await c.iniciar()).toBe(true)
    motores[0].conPromedio = true
    let previsto: number | null = null
    let fundido: number | null = null
    for (let k = 0; k < 200 && fundido === null; k++) {
      const l = c.leer()!
      const a = l.avisos?.get('p_1')
      const m = a ? /se funde en (.+) simulados$/.exec(a.texto) : null
      if (m && previsto === null) previsto = l.t + leerValor(m[1])!.valor
      const x = l.piezas.get('p_1')?.extra
      if (x?.tipo === 'fusible' && x.fundido) fundido = l.t
    }
    expect(previsto).not.toBeNull()
    expect(fundido).not.toBeNull()
    expect(Math.abs(previsto! - fundido!) / fundido!).toBeLessThan(0.1)
  })
})

describe('óhmetro con la simulación detenida: topes de la vista previa', () => {
  const ohmetro = (k: number): Parte => ({ tipo: 'multimetro', ref: `XMM${k}`, props: { modo: 'Ω' }, pines: { '+': 'x', COM: '0' } })
  const resistencia = (k: number, a: string, b: string): Parte => ({ tipo: 'resistencia', ref: `R${k}`, props: { valor: '1k' }, pines: { '1': a, '2': b } })

  it('una netlist que no cabe no se resuelve y se dice una sola vez', async () => {
    // Una cadena de 1,100 resistencias: más redes que MAX_NODES.
    const partes: Parte[] = [ohmetro(1)]
    for (let k = 0; k < 1100; k++) partes.push(resistencia(k, k === 0 ? 'x' : `n${k}`, k === 1099 ? '0' : `n${k + 1}`))
    const { c, registro } = armar(conEtiquetas(libreriaDePrueba().piezas, partes), libreriaDePrueba().piezas)
    let llamadas = 0
    const medir = async () => {
      llamadas++
      return new Map()
    }
    expect((await c.ohmiosDetenido(medir)).size).toBe(0)
    await c.ohmiosDetenido(medir)
    expect(llamadas).toBe(0)
    expect(registro.filter(([, t]) => t.startsWith('La vista previa admite hasta')).length).toBe(1)
  })

  it('un multímetro en continuidad también se pide, con su modo, y uno de voltaje no', async () => {
    const continuidad: Parte = { tipo: 'multimetro', ref: 'XMM2', props: { modo: 'Continuidad' }, pines: { '+': 'x', COM: '0' } }
    const voltaje: Parte = { tipo: 'multimetro', ref: 'XMM3', props: { modo: 'V DC' }, pines: { '+': 'x', COM: '0' } }
    const { c } = armar(conEtiquetas(libreriaDePrueba().piezas, [resistencia(1, 'x', '0'), ohmetro(1), continuidad, voltaje]), libreriaDePrueba().piezas)
    let pedido: { id: string; continuidad?: boolean }[] = []
    await c.ohmiosDetenido(async (p) => {
      pedido = p.multimetros
      return new Map()
    })
    expect(pedido.map((m) => !!m.continuidad)).toEqual([false, true])
  })

  it('pasa la señal de cancelación a la medición', async () => {
    const { c } = armar(conEtiquetas(libreriaDePrueba().piezas, [resistencia(1, 'x', '0'), ohmetro(1)]), libreriaDePrueba().piezas)
    const ac = new AbortController()
    let recibida: AbortSignal | undefined
    await c.ohmiosDetenido(async (_p, senal) => {
      recibida = senal
      return new Map()
    }, ac.signal)
    expect(recibida).toBe(ac.signal)
  })

  it('con más multímetros que MAX_MULTIMETROS solo mide los primeros', async () => {
    const partes: Parte[] = [resistencia(1, 'x', '0')]
    for (let k = 0; k < 20; k++) partes.push(ohmetro(k + 1))
    const { c } = armar(conEtiquetas(libreriaDePrueba().piezas, partes), libreriaDePrueba().piezas)
    let pedidos = 0
    await c.ohmiosDetenido(async (p) => {
      pedidos = p.multimetros.length
      return new Map()
    })
    expect(pedidos).toBe(16)
  })
})

describe('topes de instrumentos', () => {
  it('los medidores rápidos en AC tienen su propio tope y no restan a los multímetros', () => {
    const inst = sinInstrumentos()
    for (let k = 0; k < 16; k++) inst.multimetros.set(`m${k}`, {} as never)
    for (let k = 0; k < 8; k++) inst.medidores.set(`a${k}`, { sonda: k })
    expect(limitesDeInstrumentos(inst)).toBeNull()
    inst.medidores.set('a8', { sonda: 8 })
    expect(limitesDeInstrumentos(inst)).toBe('La vista previa admite hasta 8 medidores rápidos en AC y este circuito tiene 9.')
    inst.medidores.clear()
    inst.multimetros.set('m16', {} as never)
    expect(limitesDeInstrumentos(inst)).toMatch(/hasta 16 multímetros y este circuito tiene 17/)
  })
})

describe('lectura del medidor rápido', () => {
  const medidor = (id: string, x: number, y: number, magnitud: 'voltaje' | 'corriente', modo: 'dc' | 'ac' = 'dc'): Sonda => ({ id, tipo: 'medidor', x, y, magnitud, modo, pantalla: { dx: 2, dy: -2 }, ref: 'M1' })
  /** El divisor con un medidor de voltaje en el pin 2 de R1, uno de corriente en el cable c_a, otro de voltaje sobre un cable suelto y uno de corriente AC. */
  function conMedidores() {
    const d = divisor()
    const pin = pinesEnMundo(d.piezas.p_r1, lib.get('resistencia')!).find((q) => q.id === '2')!
    d.cables.c_suelto = { id: 'c_suelto', puntos: [{ x: 100, y: 100 }, { x: 110, y: 100 }] }
    d.sondas = {
      mv: medidor('mv', pin.x, pin.y, 'voltaje'),
      mi: medidor('mi', 0, -6, 'corriente'),
      mf: medidor('mf', 105, 100, 'voltaje'),
      ma: medidor('ma', pin.x, pin.y, 'voltaje', 'ac')
    }
    return armar(d)
  }

  it('el voltaje DC es el de la red en Mediciones y la corriente DC la del cable de R1', async () => {
    const { c, con, d } = conMedidores()
    c.ponerCorrientes(true)
    expect(await c.iniciar()).toBe(true)
    c.leer()
    const l = c.leer()!
    const v = lecturaDeMedidor(d.sondas!.mv, con, l)
    expect(v).toMatchObject({ estado: 'ok', unidad: 'V' })
    expect(v.estado === 'ok' && v.valor).toBeCloseTo(paraTexto(l).redes.get(con.redDePin.get(clavePin('p_r1', '2'))!)!, 12)
    expect(v.estado === 'ok' && v.valor).toBeCloseTo(2.5, 6)
    const i = lecturaDeMedidor(d.sondas!.mi, con, l)
    expect(i).toMatchObject({ estado: 'ok', unidad: 'A' })
    // Mide la magnitud de la corriente de R1; el signo depende del sentido del tramo.
    expect(i.estado === 'ok' && Math.abs(i.valor)).toBeCloseTo(l.piezas.get('p_r1')!.i, 6)
  })

  it('un medidor de voltaje sobre la tierra marca 0 V en DC y en AC, aunque no tenga ventana', async () => {
    const d = divisor()
    const tierra = Object.values(d.piezas).find((p) => p.tipo === 'tierra')!
    const pin = pinesEnMundo(tierra, lib.get('tierra')!)[0]
    d.sondas = { tdc: medidor('tdc', pin.x, pin.y, 'voltaje'), tac: medidor('tac', pin.x, pin.y, 'voltaje', 'ac') }
    const { c, con } = armar(d)
    expect(await c.iniciar()).toBe(true)
    c.leer()
    const l = c.leer()!
    expect(lecturaDeMedidor(d.sondas.tdc, con, l)).toEqual({ estado: 'ok', valor: 0, unidad: 'V' })
    expect(lecturaDeMedidor(d.sondas.tac, con, l)).toEqual({ estado: 'ok', valor: 0, unidad: 'V' })
    c.detener()
  })

  it('en una red sin simular dice sin dato y sin la corriente animada espera', async () => {
    const { c, con, d } = conMedidores()
    await c.iniciar()
    c.leer()
    const l = c.leer()!
    expect(lecturaDeMedidor(d.sondas!.mf, con, l)).toEqual({ estado: 'sin-dato', motivo: 'flotante' })
    expect(lecturaDeMedidor(d.sondas!.mi, con, l)).toEqual({ estado: 'sin-dato', motivo: 'esperando' })
  })

  it('en vivo, un medidor AC de voltaje lee el eficaz de su propia ventana del motor, igual que un multímetro en V AC', async () => {
    const d = conEtiquetas(lib, [
      { tipo: 'generador', ref: 'XFG1', props: {}, pines: { '+': 's', COM: '0' } },
      { tipo: 'resistencia', ref: 'R1', props: { valor: '1k' }, pines: { '1': 's', '2': '0' } },
      { tipo: 'multimetro', ref: 'XMM1', props: { modo: 'V AC' }, pines: { '+': 's', COM: '0' } }
    ])
    const r1 = Object.values(d.piezas).find((p) => p.ref === 'R1')!
    const pin = pinesEnMundo(r1, lib.get('resistencia')!).find((q) => q.id === '1')!
    const m = medidor('mac', pin.x, pin.y, 'voltaje', 'ac')
    d.sondas = { mac: m, mdc: medidor('mdc', pin.x, pin.y, 'voltaje', 'dc') }
    const { c, con } = armar(d)
    expect(await c.iniciar()).toBe(true)
    for (let k = 0; k < 40; k++) c.leer()
    const inst = c.leerInstrumentos()!
    // Solo el AC pide ventana: el DC no registra nada en el motor.
    expect(inst.multimetros.has('mdc')).toBe(false)
    const vivo = inst.multimetros.get('mac')!
    const mm = inst.multimetros.get(Object.values(d.piezas).find((p) => p.ref === 'XMM1')!.id)!
    const r = lecturaDeMedidor(m, con, c.leer()!, { valor: vivo.valor, frecuencia: vivo.frecuencia })
    expect(r.estado).toBe('ok')
    if (r.estado !== 'ok') return
    expect(r.valor).toBeGreaterThan(0.6)
    expect(Math.abs(r.valor - mm.valor) / mm.valor).toBeLessThan(0.02)
    expect(r.frecuencia).toBeGreaterThan(0)
    c.detener()
  })

  it('en AC lee el eficaz de la ventana de su punto, la misma cuenta del multímetro, y sin ventana no hay dato', async () => {
    const { c, con, d } = conMedidores()
    await c.iniciar()
    c.leer()
    const l = c.leer()!
    // Un periodo de 1 ms de una senoidal de 1 V de amplitud: ∫v = 0 y ∫v² = 0.5 ms.
    const ventana = [0, 1e-3, 0, 0.5e-3, 0, 0, 1, 0, 1e-3, 0, 0.5e-3]
    const r = lecturaDeMedidor(d.sondas!.ma, con, l, ventana)
    expect(r.estado === 'ok' && r.valor).toBeCloseTo(Math.SQRT1_2, 9)
    expect(lecturaDeMedidor(d.sondas!.ma, con, l)).toEqual({ estado: 'sin-dato', motivo: 'sin-ventana' })
  })
})


describe('perilla en vivo hacia el motor', () => {
  afterEach(() => vi.useRealTimers())
  const sensor: PiezaDef = {
    ...lib.get('resistencia')!,
    id: 'sensor-de-prueba',
    props: [...lib.get('resistencia')!.props, { id: 'temperatura', nombre: 'Temperatura', unidad: '°C', defecto: '25 °C', enVivo: { magnitud: 'temperatura', min: -40, max: 150, paso: 1, pasoFino: 0.1 } }]
  }
  const libSensor = new Map(lib).set(sensor.id, sensor)
  const montar = () => {
    const d = conEtiquetas(libSensor, [
      { tipo: 'fuente-dc', ref: 'V1', props: { voltaje: '5' }, pines: { '+': 'a', '-': '0' } },
      { tipo: 'sensor-de-prueba', ref: 'RT1', props: { valor: '1k' }, pines: { '1': 'a', '2': '0' } }
    ])
    const revertidas: [string, string, string][] = []
    const x = armar(d, libSensor, { revertirPerilla: (id, prop, texto) => revertidas.push([id, prop, texto]) })
    const id = Object.keys(d.piezas).find((k) => d.piezas[k].ref === 'RT1')!
    return { ...x, id, revertidas }
  }

  it('el valor llega al canal de la perilla sin pasar por los cambios en caliente', async () => {
    const { c, motores, id } = montar()
    await c.iniciar()
    expect(c.moverPerilla(id, 'temperatura', 85)).toBe(true)
    expect(motores[0].perillas).toEqual([{ canal: 0, valor: 85, seq: 1 }])
    expect(motores[0].cambios).toHaveLength(0)
    expect(c.moverPerilla(id, 'valor', 5)).toBe(false)
  })

  it('200 cambios en un segundo mandan a lo más 60 y el último valor llega', async () => {
    vi.useFakeTimers()
    const { c, motores, id } = montar()
    await c.iniciar()
    for (let k = 1; k <= 200; k++) {
      c.moverPerilla(id, 'temperatura', k)
      vi.advanceTimersByTime(5)
    }
    vi.advanceTimersByTime(20)
    const m = motores[0].perillas
    expect(m.length).toBeLessThanOrEqual(60)
    expect(m.length).toBeGreaterThan(30)
    expect(m.at(-1)!.valor).toBe(200)
  })

  it('el rechazo registra la pieza, vuelve al último aceptado y no detiene la vista previa', async () => {
    const { c, motores, id, registro, revertidas } = montar()
    await c.iniciar()
    c.moverPerilla(id, 'temperatura', 85)
    motores[0].rechazar(-1, 'canal 0: el tiempo y el valor deben ser finitos', 1)
    expect(registro.at(-1)).toEqual(['error', 'RT1 tiene un valor que no es un número: volvió a 25 °C.'])
    expect(revertidas).toEqual([[id, 'temperatura', '25 °C']])
    expect(c.fase).toBe('corriendo')
  })

  it('un rechazo del paso (indice -1 con otra secuencia) no se toma por una perilla', async () => {
    const { c, motores, id, revertidas } = montar()
    await c.iniciar()
    c.moverPerilla(id, 'temperatura', 85)
    motores[0].rechazar(-1, 'el paso máximo no es válido', 99)
    expect(revertidas).toEqual([])
  })

  it('la matriz singular de una fuente controlada nombra la pieza y propone cambiar la ganancia', () => {
    const pieza = (k: number) => (k === 4 ? { ref: 'E1', tipo: 'controlada' } : undefined)
    expect(mensajeDelMotor('matriz singular: revisa nodos sin camino a tierra o fuentes de voltaje en paralelo (elemento 4)', pieza)).toBe(
      'La vista previa se detuvo: el circuito no tiene solución cerca de E1; cambia su ganancia o agrega una resistencia en el lazo.'
    )
  })
})

describe('DIP y teclado hacia el motor', () => {
  const montar = (tipo: string, pines: Record<string, string>, props: Record<string, string> = {}) => {
    const d = conEtiquetas(lib, [
      { tipo: 'fuente-dc', ref: 'V1', props: { voltaje: '5' }, pines: { '+': 'a', '-': '0' } },
      { tipo, ref: 'X1', props, pines }
    ])
    const x = armar(d, lib)
    return { ...x, id: Object.keys(d.piezas).find((k) => d.piezas[k].ref === 'X1')! }
  }
  const dip = (n: number) => Object.fromEntries(Array.from({ length: 2 * n }, (_, k) => [String(k + 1), k === 0 ? 'a' : `n${k}`]))
  const teclado = Object.fromEntries([...['F1', 'F2', 'F3', 'F4'].map((p) => [p, 'a']), ...['C1', 'C2', 'C3', 'C4'].map((p) => [p, `c${p}`])])

  it('la palanca de un DIP escribe su canal y no rearma la netlist', async () => {
    const { c, motores, id } = montar('interruptor-dip-8', dip(8), { estado: '00100000' })
    await c.iniciar()
    expect(c.moverPerilla(id, 'estado:4', 1)).toBe(true)
    expect(c.moverPerilla(id, 'estado:2', 0)).toBe(true)
    expect(motores[0].perillas.map((p) => [p.canal, p.valor])).toEqual([[4, 1], [2, 0]])
    expect(motores[0].cambios).toHaveLength(0)
    expect(c.moverPerilla(id, 'estado:8', 1)).toBe(false)
  })

  it('la tecla de un teclado escribe su canal por fila y columna', async () => {
    const { c, motores, id } = montar('teclado-4x4', teclado)
    await c.iniciar()
    expect(c.moverPerilla(id, 'tecla:14', 1)).toBe(true)
    expect(motores[0].perillas.map((p) => [p.canal, p.valor])).toEqual([[14, 1]])
    expect(motores[0].cambios).toHaveLength(0)
  })
})

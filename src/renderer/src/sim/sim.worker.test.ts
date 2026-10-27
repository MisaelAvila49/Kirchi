import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readSim, SAB_LENGTH, type ToWorker } from './protocol'
import { bytesSabInstrumentos, crearVistas, leerInstrumentos } from './protocoloInstrumentos'

/** Worker de la vista previa con un motor de mentira: importa cuándo calcula y publica, no el circuito. El falso avanza al
 * instante hasta la meta pedida y cuenta las llamadas. */
const motor = vi.hoisted(() => ({ avances: 0, cambios: [] as string[], t: 0, atascado: false, falla: false, valores: [] as [number, number, number][], rechazaValor: false, ultimaMeta: 0, pila: [] as number[], perdidos: 0, descartes: 0 }))

vi.mock('./pkg/kirchi_engine.js', () => {
  const memory = new WebAssembly.Memory({ initial: 1 })
  class Simulator {
    constructor() {
      motor.t = 0
    }
    node_count = () => 1
    element_count = () => 1
    digital_count = () => 0
    lazo_de_arranque = () => new Uint32Array(0)
    time = () => motor.t
    set_iteration_budget = () => {}
    lost_iterations = () => 0
    advance_to = (meta: number) => {
      motor.avances++
      motor.ultimaMeta = meta
      if (motor.falla) throw new Error('no convergió')
      // Un motor atascado no avanza (el avance en curso queda esperando su ciclo siguiente).
      if (motor.atascado) return 0
      motor.t = Math.max(motor.t, meta)
      return 1
    }
    set_element = (_i: number, e: string) => void motor.cambios.push(e)
    set_max_step = () => {}
    poner_valor = (canal: number, t: number, v: number) => {
      if (motor.rechazaValor) throw new Error('canal 0: el tiempo y el valor deben ser finitos')
      motor.valores.push([canal, t, v])
    }
    reset_element = () => {}
    voltages_ptr = () => 0
    currents_ptr = () => 64
    aux_ptr = () => 128
    estado_ptr = () => 192
    niveles_ptr = () => 256
    medidas_ptr = () => 320
    take_events = () => new Float64Array(0)
    activar_promedios = () => {}
    promedios_ptr = () => 384
    reiniciar_promedios = () => {}
    sonda_tiempo = () => motor.t
    sonda_ventana = () => 448
    sonda_columnas = () => 448
    sonda_columnas_pantalla = () => 448
    sonda_resta = () => 448
    sonda_muestras = () => 448
    sonda_disparo = () => Number.NaN
    configurar_sonda = () => {}
    sonda_activar = () => {}
    set_resistance = () => {}
    // .
    take_cruces = () => new Float64Array([0])
    take_conflictos = () => new Uint32Array(0)
    hmin = () => 1e-14
    activar_terminales = () => {}
    activar_potencias = () => {}
    terminales_ptr = () => 448
    potencias_ptr = () => 448
    quemar = () => {}
    free = () => {}
    // Retroceder: el motor guarda el instante de antes de cada avance.
    guardar_estado = () => void motor.pila.push(motor.t)
    restaurar_estado = () => {
      const t = motor.pila.pop()
      if (t === undefined) return Number.NaN
      motor.t = t
      return t
    }
    estados_guardados = () => motor.pila.length
    estados_perdidos = () => {
      const p = motor.perdidos
      motor.perdidos = 0
      return p
    }
    descartar_estados = () => {
      motor.pila = []
      motor.descartes++
    }
  }
  return { default: async () => ({ memory }), Simulator }
})

describe('worker de la vista previa', () => {
  let enviar: (m: ToWorker) => Promise<void> | void
  let recibidos: { type: string }[]

  beforeEach(async () => {
    vi.useFakeTimers()
    vi.resetModules()
    motor.avances = 0
    motor.cambios = []
    motor.atascado = false
    motor.falla = false
    motor.valores = []
    motor.rechazaValor = false
    motor.ultimaMeta = 0
    motor.pila = []
    motor.perdidos = 0
    motor.descartes = 0
    recibidos = []
    const falso: { postMessage: (m: { type: string }) => void; onmessage: ((e: { data: ToWorker }) => unknown) | null } = {
      postMessage: (m) => void recibidos.push(m),
      onmessage: null
    }
    vi.stubGlobal('self', falso)
    await import('./sim.worker')
    enviar = (m) => falso.onmessage!({ data: m }) as Promise<void> | void
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('un cambio en caliente se calcula y se publica en cuanto llega, sin esperar al temporizador del ciclo', async () => {
    const sab = new SharedArrayBuffer(SAB_LENGTH * Float64Array.BYTES_PER_ELEMENT)
    await enviar({ type: 'load', id: 1, netlist: '{}', h: 1e-5, sab })
    expect(recibidos.some((m) => m.type === 'ready')).toBe(true)
    const vista = new Float64Array(sab)
    // El reloj de pared avanza 3 ms sin que venza el temporizador de 4 ms del ciclo.
    vi.advanceTimersByTime(3)
    const antes = motor.avances
    const tAntes = readSim(vista, 1).time
    enviar({ type: 'valores', cambios: [{ indice: 0, elemento: { type: 'LOGIC' } as never }], seq: 1 })
    expect(motor.cambios).toHaveLength(1)
    expect(motor.avances).toBeGreaterThan(antes)
    expect(readSim(vista, 1).time).toBeGreaterThan(tAntes)
  })

  it('una perilla escribe su valor en el canal a la hora de la isla, sin pasar por set_element', async () => {
    const sab = new SharedArrayBuffer(SAB_LENGTH * Float64Array.BYTES_PER_ELEMENT)
    await enviar({ type: 'load', id: 1, netlist: '{}', h: 1e-5, sab })
    vi.advanceTimersByTime(8)
    const t = motor.t
    enviar({ type: 'perilla', canal: 2, valor: 85, seq: 1 })
    expect(motor.valores).toEqual([[2, t, 85]])
    expect(motor.cambios).toHaveLength(0)
  })

  it('el rechazo de una perilla vuelve como rechazado con indice -1 - canal y no detiene el motor', async () => {
    const sab = new SharedArrayBuffer(SAB_LENGTH * Float64Array.BYTES_PER_ELEMENT)
    await enviar({ type: 'load', id: 1, netlist: '{}', h: 1e-5, sab })
    motor.rechazaValor = true
    enviar({ type: 'perilla', canal: 3, valor: Number.NaN, seq: 7 })
    expect(recibidos).toContainEqual({ type: 'rechazado', id: 1, indice: -4, message: expect.stringContaining('finitos'), seq: 7 })
    expect(recibidos.some((m) => m.type === 'error')).toBe(false)
  })

  it('con un multímetro, lo lee cuatro veces por segundo de reloj', async () => {
    const sab = new SharedArrayBuffer(SAB_LENGTH * Float64Array.BYTES_PER_ELEMENT)
    const sabInst = new SharedArrayBuffer(bytesSabInstrumentos(0, 1))
    const config = { multimetros: [{ modo: 'V DC' as const, ideal: false, sondaV: 0, sondaI: 1, elemento: 0, rango: 1e4 }], osciloscopios: [] }
    await enviar({ type: 'load', id: 1, netlist: '{}', h: 1e-5, sab, instrumentos: { sab: sabInst, config } })
    vi.advanceTimersByTime(1000)
    const n = leerInstrumentos(crearVistas(sabInst, 0, 1)).multimetros[0].lecturas
    expect(n).toBeGreaterThanOrEqual(3)
    expect(n).toBeLessThanOrEqual(5)
  })

  it('en pausa un cambio en caliente no hace correr el tiempo', async () => {
    const sab = new SharedArrayBuffer(SAB_LENGTH * Float64Array.BYTES_PER_ELEMENT)
    await enviar({ type: 'load', id: 1, netlist: '{}', h: 1e-5, sab })
    enviar({ type: 'speed', value: 0 })
    vi.advanceTimersByTime(20)
    const t = motor.t
    enviar({ type: 'valores', cambios: [{ indice: 0, elemento: { type: 'LOGIC' } as never }], seq: 1 })
    vi.advanceTimersByTime(20)
    expect(motor.t).toBe(t)
  })

  it('con «Sin límite de tiempo real» cada ciclo corre sin esperar y pide lo que cabe en su presupuesto, no una hora', async () => {
    const sab = new SharedArrayBuffer(SAB_LENGTH * Float64Array.BYTES_PER_ELEMENT)
    await enviar({ type: 'load', id: 1, netlist: '{}', h: 1e-5, sab })
    enviar({ type: 'speed', value: 1, sinTope: true })
    // El ciclo siguiente (a lo más 4 ms) ya va sin tope.
    vi.advanceTimersByTime(5)
    expect(motor.t).toBeGreaterThan(0)
    // La meta sale de la capacidad medida (el doble de lo que cabe en el presupuesto de un ciclo): una meta lejana dejaba a
    // una isla con todos los pasos y a otra saltar hasta ella.
    expect(motor.ultimaMeta).toBeLessThan(3600)
    expect(readSim(new Float64Array(sab), 1).ratio).toBe(1)
  })

  it('un segundo avance durante uno, o sin circuito cargado, responde enseguida como interrumpido', async () => {
    enviar({ type: 'avanzar', dt: 1e-3, seq: 1 })
    expect(recibidos.filter((m) => m.type === 'llegada')).toMatchObject([{ seq: 1, interrumpida: true, guardados: 0 }])
    const sab = new SharedArrayBuffer(SAB_LENGTH * Float64Array.BYTES_PER_ELEMENT)
    await enviar({ type: 'load', id: 1, netlist: '{}', h: 1e-5, sab })
    enviar({ type: 'speed', value: 0 })
    motor.atascado = true
    const t = motor.t
    enviar({ type: 'hasta', t: t + 10, seq: 2 })
    enviar({ type: 'avanzar', dt: 1e-3, seq: 3 })
    expect(recibidos.filter((m) => m.type === 'llegada').at(-1)).toEqual({ type: 'llegada', id: 1, seq: 3, t, dt: 0, interrumpida: true, guardados: 1 })
  })

  it('un error del motor durante un avance lo responde como interrumpido', async () => {
    const sab = new SharedArrayBuffer(SAB_LENGTH * Float64Array.BYTES_PER_ELEMENT)
    await enviar({ type: 'load', id: 1, netlist: '{}', h: 1e-5, sab })
    enviar({ type: 'speed', value: 0 })
    motor.falla = true
    enviar({ type: 'hasta', t: 1, seq: 5 })
    expect(recibidos.some((m) => m.type === 'error')).toBe(true)
    expect(recibidos.filter((m) => m.type === 'llegada')).toMatchObject([{ seq: 5, interrumpida: true }])
  })

  it('una velocidad pedida durante un avance se conserva al terminarlo', async () => {
    const sab = new SharedArrayBuffer(SAB_LENGTH * Float64Array.BYTES_PER_ELEMENT)
    await enviar({ type: 'load', id: 1, netlist: '{}', h: 1e-5, sab })
    enviar({ type: 'speed', value: 0 })
    motor.atascado = true
    enviar({ type: 'hasta', t: 10, seq: 6 })
    enviar({ type: 'speed', value: 1 })
    enviar({ type: 'interrumpir' })
    motor.atascado = false
    const t = motor.t
    vi.advanceTimersByTime(50)
    expect(motor.t).toBeGreaterThan(t)
  })

  it('una carga nueva vuelve a 1× aunque antes fuera «Sin límite de tiempo real»', async () => {
    const sab = new SharedArrayBuffer(SAB_LENGTH * Float64Array.BYTES_PER_ELEMENT)
    await enviar({ type: 'load', id: 1, netlist: '{}', h: 1e-5, sab })
    enviar({ type: 'speed', value: 1, sinTope: true })
    vi.advanceTimersByTime(5)
    await enviar({ type: 'load', id: 2, netlist: '{}', h: 1e-5, sab })
    const t = motor.t
    vi.advanceTimersByTime(5)
    // A 1×, un ciclo pide lo del reloj (a lo más 0.1 s), no lo de «Sin límite de tiempo real».
    expect(motor.ultimaMeta - t).toBeLessThanOrEqual(0.1)
  })

  it('«interrumpir» deja en pausa el avance en curso donde va y responde con su llegada', async () => {
    const sab = new SharedArrayBuffer(SAB_LENGTH * Float64Array.BYTES_PER_ELEMENT)
    await enviar({ type: 'load', id: 1, netlist: '{}', h: 1e-5, sab })
    enviar({ type: 'speed', value: 0 })
    const t = motor.t
    motor.atascado = true
    enviar({ type: 'hasta', t: t + 10, seq: 3 })
    expect(recibidos.some((m) => m.type === 'llegada')).toBe(false)
    enviar({ type: 'interrumpir' })
    expect(recibidos.filter((m) => m.type === 'llegada')).toEqual([{ type: 'llegada', id: 1, seq: 3, t, dt: 0, interrumpida: true, guardados: 1 }])
    // Ya en pausa: el tiempo no corre.
    motor.atascado = false
    vi.advanceTimersByTime(50)
    expect(motor.t).toBe(t)
  })
  it('Retroceder: cada avance guarda el estado de antes, y retroceder vuelve a él, lo publica y responde con lo que queda', async () => {
    const sab = new SharedArrayBuffer(SAB_LENGTH * Float64Array.BYTES_PER_ELEMENT)
    await enviar({ type: 'load', id: 1, netlist: '{}', h: 1e-5, sab })
    enviar({ type: 'speed', value: 0 })
    const t0 = motor.t
    enviar({ type: 'avanzar', dt: 1e-3, seq: 1 })
    const t1 = motor.t
    expect(t1).toBeGreaterThan(t0)
    enviar({ type: 'avanzar', dt: 2e-3, seq: 2 })
    const t2 = motor.t
    expect(t2).toBeGreaterThan(t1)
    expect(motor.pila).toEqual([t0, t1])
    expect(recibidos.filter((m) => m.type === 'llegada')).toMatchObject([{ seq: 1, guardados: 1 }, { seq: 2, guardados: 2 }])
    enviar({ type: 'retroceder', seq: 3 })
    expect(motor.t).toBe(t1)
    expect(readSim(new Float64Array(sab), 1).time).toBe(t1)
    expect(recibidos.at(-1)).toEqual({ type: 'retrocedio', id: 1, seq: 3, t: t1, guardados: 1 })
    enviar({ type: 'retroceder', seq: 4 })
    expect(motor.t).toBe(t0)
    expect(recibidos.at(-1)).toEqual({ type: 'retrocedio', id: 1, seq: 4, t: t0, guardados: 0 })
    // Sin nada guardado responde NaN y no toca nada.
    enviar({ type: 'retroceder', seq: 5 })
    expect(recibidos.at(-1)).toMatchObject({ type: 'retrocedio', seq: 5, guardados: 0 })
    expect(Number.isNaN((recibidos.at(-1) as unknown as { t: number }).t)).toBe(true)
    expect(motor.t).toBe(t0)
  })

  it('Retroceder no actúa corriendo ni durante un avance, y reanudar olvida lo guardado', async () => {
    const sab = new SharedArrayBuffer(SAB_LENGTH * Float64Array.BYTES_PER_ELEMENT)
    await enviar({ type: 'load', id: 1, netlist: '{}', h: 1e-5, sab })
    enviar({ type: 'speed', value: 0 })
    enviar({ type: 'avanzar', dt: 1e-3, seq: 1 })
    const t = motor.t
    // Un avance atascado sigue en curso: no se retrocede.
    motor.atascado = true
    enviar({ type: 'avanzar', dt: 1e-3, seq: 2 })
    enviar({ type: 'retroceder', seq: 3 })
    expect(Number.isNaN((recibidos.at(-1) as unknown as { t: number }).t)).toBe(true)
    expect(motor.t).toBe(t)
    enviar({ type: 'interrumpir' })
    motor.atascado = false
    // Reanudar el reloj olvida lo guardado: ya no hay un avance al que volver.
    const antes = motor.descartes
    enviar({ type: 'speed', value: 1 })
    expect(motor.descartes).toBe(antes + 1)
    expect(motor.pila).toEqual([])
    enviar({ type: 'retroceder', seq: 4 })
    expect(Number.isNaN((recibidos.at(-1) as unknown as { t: number }).t)).toBe(true)
  })

  it('Retroceder: si el motor olvidó avances por su tope de memoria, el worker lo avisa con lo que queda', async () => {
    const sab = new SharedArrayBuffer(SAB_LENGTH * Float64Array.BYTES_PER_ELEMENT)
    await enviar({ type: 'load', id: 1, netlist: '{}', h: 1e-5, sab })
    enviar({ type: 'speed', value: 0 })
    motor.perdidos = 4
    enviar({ type: 'avanzar', dt: 1e-3, seq: 1 })
    expect(recibidos.find((m) => m.type === 'estados-perdidos')).toEqual({ type: 'estados-perdidos', id: 1, perdidos: 4, guardados: 1 })
  })
})

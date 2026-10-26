import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { largoSabTerminales, readSim, SAB_LENGTH, type FromWorker, type ToWorker } from './protocol'

/** Worker con el motor real para avanzar a una meta exacta, cambios de estado que se oyen y corrientes por terminal. Con
 * temporizadores falsos el reloj de `performance` no avanza dentro de un ciclo, así que «Sin límite de tiempo real» no se
 * prueba aquí (iría hasta su tope de una hora simulada en un ciclo). */
vi.mock('./pkg/kirchi_engine.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('./pkg/kirchi_engine.js')>()
  const { readFileSync } = await import('node:fs')
  const { join } = await import('node:path')
  const bytes = readFileSync(join(import.meta.dirname, 'pkg/kirchi_engine_bg.wasm'))
  return { ...real, default: () => real.default({ module_or_path: bytes }) }
})

/** Una cuadrada de 1 kHz por un inversor 74HC hasta un LED: dos islas y la lógica. */
const INVERSOR = {
  nodes: 4,
  digital_nets: 2,
  elements: [
    { type: 'V', a: 1, b: 0, wave: { kind: 'square', low: 0, high: 5, freq: 1000, duty: 0.5 } },
    { type: 'ADC', p: 1, n: 0, out: 0, in_low: 1.5, in_high: 3.5 },
    { type: 'GATE', fn: 'not', inputs: [0], output: 1, rise_delay: 8e-9, fall_delay: 8e-9 },
    { type: 'DAC', input: 1, out: 2, v_lo: 0, v_hi: 5, r_lo: 50, r_hi: 50, t_rise: 6e-9, t_fall: 6e-9 },
    { type: 'R', a: 2, b: 3, ohms: 330 },
    { type: 'D', a: 3, b: 0, is: 1.5e-17, n: 2 }
  ]
}
/** Un zumbador de 5 V con una cuadrada de 10 Hz: suena la mitad de cada periodo. */
const ZUMBADOR = {
  nodes: 2,
  elements: [
    { type: 'V', a: 1, b: 0, wave: { kind: 'square', low: 0, high: 5, freq: 10, duty: 0.5 } },
    { type: 'BUZZER', a: 1, b: 0, ohms: 166.7, umbral: 3 }
  ]
}

describe('worker de la vista previa: avanzar, los cruces y las corrientes por terminal', () => {
  let enviar: (m: ToWorker) => Promise<void> | void
  let recibidos: FromWorker[]

  beforeEach(async () => {
    vi.useFakeTimers()
    vi.resetModules()
    recibidos = []
    const falso: { postMessage: (m: FromWorker) => void; onmessage: ((e: { data: ToWorker }) => unknown) | null } = {
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

  const llegadas = () => recibidos.filter((m): m is Extract<FromWorker, { type: 'llegada' }> => m.type === 'llegada')

  it('desde la pausa, cada avance termina exacto en su meta con las islas juntas y la lectura de ese instante', async () => {
    const sab = new SharedArrayBuffer(SAB_LENGTH * Float64Array.BYTES_PER_ELEMENT)
    await enviar({ type: 'load', id: 1, netlist: JSON.stringify(INVERSOR), h: 1e-5, sab })
    enviar({ type: 'speed', value: 0 })
    let meta = 0
    for (let k = 1; k <= 10; k++) {
      meta += 0.37e-3
      enviar({ type: 'avanzar', dt: 0.37e-3, seq: k })
      vi.advanceTimersByTime(20)
      const l = llegadas().at(-1)!
      expect(l.seq).toBe(k)
      expect(Math.abs(l.t - meta)).toBeLessThan(1e-12)
      expect(readSim(new Float64Array(sab), 4, 6, 2).time).toBe(l.t)
    }
    // Un paso del motor: avanza lo de un paso aceptado.
    enviar({ type: 'avanzar', dt: 'paso', seq: 11 })
    const p = llegadas().at(-1)!
    expect(p.seq).toBe(11)
    expect(p.dt).toBeGreaterThan(0)
    expect(p.dt).toBeLessThanOrEqual(1e-5 * (1 + 1e-9))
    // «Avanzar hasta t» llega a su instante y se queda en pausa: el tiempo no corre después.
    enviar({ type: 'hasta', t: 10e-3, seq: 12 })
    vi.advanceTimersByTime(200)
    expect(llegadas().at(-1)).toMatchObject({ seq: 12, interrumpida: false })
    expect(Math.abs(llegadas().at(-1)!.t - 10e-3)).toBeLessThan(1e-12)
    vi.advanceTimersByTime(200)
    expect(readSim(new Float64Array(sab), 4, 6, 2).time).toBe(llegadas().at(-1)!.t)
  })

  it('una carga que empieza en pausa no corre nada antes de la pausa: F6 desde detenida llega a desde + Δ con desde = 0', async () => {
    const sab = new SharedArrayBuffer(SAB_LENGTH * Float64Array.BYTES_PER_ELEMENT)
    await enviar({ type: 'load', id: 1, netlist: JSON.stringify(INVERSOR), h: 1e-5, sab, velocidad: 0 })
    vi.advanceTimersByTime(50)
    expect(readSim(new Float64Array(sab), 4, 6, 2).time).toBe(0)
    enviar({ type: 'avanzar', dt: 0.37e-3, seq: 1 })
    vi.advanceTimersByTime(20)
    const l = llegadas().at(-1)!
    expect(l.dt).toBe(l.t)
    expect(Math.abs(l.t - 0.37e-3)).toBeLessThan(1e-12)
  })

  it('los cambios de estado del zumbador llegan con su instante, su ancla en reloj y la velocidad', async () => {
    const sab = new SharedArrayBuffer(SAB_LENGTH * Float64Array.BYTES_PER_ELEMENT)
    await enviar({ type: 'load', id: 1, netlist: JSON.stringify(ZUMBADOR), h: 1e-4, sab })
    vi.advanceTimersByTime(260)
    const cruces = recibidos.filter((m): m is Extract<FromWorker, { type: 'cruces' }> => m.type === 'cruces')
    const datos = cruces.flatMap((c) => c.datos)
    // Suena en t ≈ 0, calla en 50 ms, suena en 100 ms, calla en 150 ms, suena en 200 ms y calla en 250 ms (lo que alcance).
    const niveles = Array.from({ length: datos.length / 3 }, (_, k) => datos[3 * k + 2])
    expect(niveles.slice(0, 4)).toEqual([1, 0, 1, 0])
    expect(datos[3 * 1 + 1]).toBeCloseTo(0.05, 3)
    for (const c of cruces) {
      expect(c.velocidad).toBe(1)
      expect(c.perdidos).toBe(0)
      expect(c.ancla.t).toBeGreaterThan(0)
      expect(c.ancla.reloj).toBeGreaterThan(0)
    }
  })

  it('con la corriente animada encendida publica las corrientes por terminal del intervalo; apagada, no', async () => {
    const sab = new SharedArrayBuffer(SAB_LENGTH * Float64Array.BYTES_PER_ELEMENT)
    const DIVISOR = { nodes: 3, elements: [{ type: 'V', a: 1, b: 0, wave: { kind: 'dc', v: 5 } }, { type: 'R', a: 1, b: 2, ohms: 1000 }, { type: 'R', a: 2, b: 0, ohms: 1000 }] }
    // Tres elementos de dos terminales: nueve casillas.
    const sabT = new SharedArrayBuffer(largoSabTerminales(9) * Float64Array.BYTES_PER_ELEMENT)
    const leer = () => readSim(new Float64Array(sab), 3, 3, 0, { vista: new Float64Array(sabT), casillas: 9 }).terminales
    await enviar({ type: 'load', id: 1, netlist: JSON.stringify(DIVISOR), h: 1e-5, sab, terminales: { sab: sabT, activa: true } })
    vi.advanceTimersByTime(350)
    const t = leer()!
    expect(t.duracion).toBeGreaterThan(0.05)
    // 2.5 mA entran por su nodo 1 y salen por el 2.
    expect(t.medias[3]).toBeCloseTo(2.5e-3, 9)
    expect(t.medias[4]).toBeCloseTo(-2.5e-3, 9)
    expect(t.absolutas[3]).toBeCloseTo(2.5e-3, 9)
    enviar({ type: 'corrientes', activa: false })
    vi.advanceTimersByTime(20)
    expect(leer()).toBeNull()
  })

  it('una memoria de corrientes por terminal que no es del tamaño de la netlist se rechaza al cargar con su motivo', async () => {
    const sab = new SharedArrayBuffer(SAB_LENGTH * Float64Array.BYTES_PER_ELEMENT)
    const DIVISOR = { nodes: 3, elements: [{ type: 'V', a: 1, b: 0, wave: { kind: 'dc', v: 5 } }, { type: 'R', a: 1, b: 2, ohms: 1000 }, { type: 'R', a: 2, b: 0, ohms: 1000 }] }
    // Nueve casillas en el motor y ocho en la memoria.
    const sabT = new SharedArrayBuffer(largoSabTerminales(8) * Float64Array.BYTES_PER_ELEMENT)
    await enviar({ type: 'load', id: 1, netlist: JSON.stringify(DIVISOR), h: 1e-5, sab, terminales: { sab: sabT, activa: true } })
    const e = recibidos.find((m): m is Extract<FromWorker, { type: 'error' }> => m.type === 'error')
    expect(e?.message).toMatch(/corrientes por terminal/)
    expect(recibidos.some((m) => m.type === 'ready')).toBe(false)
  })

  it('las potencias de una carga anterior no quedan en la memoria de la siguiente', async () => {
    const sab = new SharedArrayBuffer(SAB_LENGTH * Float64Array.BYTES_PER_ELEMENT)
    const DIVISOR = { nodes: 3, elements: [{ type: 'V', a: 1, b: 0, wave: { kind: 'dc', v: 5 } }, { type: 'R', a: 1, b: 2, ohms: 1000 }, { type: 'R', a: 2, b: 0, ohms: 1000 }] }
    await enviar({ type: 'load', id: 1, netlist: JSON.stringify(DIVISOR), h: 1e-5, sab, potencias: [1, 2] })
    vi.advanceTimersByTime(350)
    expect(readSim(new Float64Array(sab), 3, 3).promedio!.potencias![1]).toBeCloseTo(6.25e-3, 6)
    // La misma netlist sin potencias: lo publicado no trae las de antes.
    await enviar({ type: 'load', id: 2, netlist: JSON.stringify(DIVISOR), h: 1e-5, sab })
    vi.advanceTimersByTime(350)
    expect(Array.from(readSim(new Float64Array(sab), 3, 3).promedio!.potencias!)).toEqual([0, 0, 0])
  })
})

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SimClient } from './client'
import type { FromWorker, ToWorker } from './protocol'

/** Worker falso: guarda lo que se le manda y deja contestar a mano. */
class FalsoWorker {
  static ultimo: FalsoWorker
  enviados: ToWorker[] = []
  terminado = false
  onerror: ((e: { message: string }) => void) | null = null
  onmessageerror: (() => void) | null = null
  onmessage: ((e: { data: FromWorker }) => void) | null = null
  constructor() {
    FalsoWorker.ultimo = this
  }
  postMessage(m: ToWorker) {
    this.enviados.push(m)
  }
  terminate() {
    this.terminado = true
  }
  contestar(m: FromWorker) {
    this.onmessage?.({ data: m })
  }
  cargas() {
    return this.enviados.filter((m): m is Extract<ToWorker, { type: 'load' }> => m.type === 'load')
  }
}

const g = globalThis as unknown as Record<string, unknown>
let previos: Record<string, unknown>

beforeEach(() => {
  previos = { Worker: g.Worker, crossOriginIsolated: g.crossOriginIsolated }
  g.Worker = FalsoWorker
  g.crossOriginIsolated = true
})
afterEach(() => {
  g.Worker = previos.Worker
  g.crossOriginIsolated = previos.crossOriginIsolated
})

describe('SimClient: cargas concurrentes', () => {
  it('cada carga lleva un id, la respuesta vieja se descarta y la carga reemplazada se resuelve rechazada', async () => {
    const c = new SimClient()
    const w = FalsoWorker.ultimo
    const a = c.load({}, 1e-5)
    const b = c.load({}, 1e-5)
    const [ia, ib] = w.cargas().map((m) => m.id)
    expect(ia).not.toBe(ib)
    await expect(a).rejects.toThrow(/reemplazada/)
    w.contestar({ type: 'ready', id: ia, nodes: 9, elements: 9, digitales: 0, lazo: [] })
    w.contestar({ type: 'ready', id: ib, nodes: 3, elements: 2, digitales: 4, lazo: [1] })
    expect(await b).toEqual({ nodes: 3, elements: 2, digitales: 4, lazo: [1] })
    expect(c.nodes).toBe(3)
    expect(c.digitales).toBe(4)
  })

  it('un error de una carga vieja no rechaza la nueva ni avisa a los oyentes', async () => {
    const c = new SimClient()
    const w = FalsoWorker.ultimo
    const avisos: string[] = []
    c.alError((m) => avisos.push(m))
    const a = c.load({}, 1e-5)
    a.catch(() => {})
    const b = c.load({}, 1e-5)
    const [ia, ib] = w.cargas().map((m) => m.id)
    w.contestar({ type: 'error', id: ia, message: 'vieja' })
    w.contestar({ type: 'ready', id: ib, nodes: 3, elements: 2, digitales: 0, lazo: [] })
    await expect(b).resolves.toBeDefined()
    expect(avisos).toEqual([])
  })

  it('un error del motor ya cargado llega a los oyentes y uno de otro id se descarta', async () => {
    const c = new SimClient()
    const w = FalsoWorker.ultimo
    const avisos: string[] = []
    c.alError((m) => avisos.push(m))
    const p = c.load({}, 1e-5)
    const id = w.cargas()[0].id
    w.contestar({ type: 'ready', id, nodes: 3, elements: 2, digitales: 0, lazo: [] })
    await p
    w.contestar({ type: 'error', id: id + 99, message: 'ajeno' })
    w.contestar({ type: 'error', id, message: 'no convergió' })
    expect(avisos).toEqual(['no convergió'])
  })

  it('los cambios en caliente y los fusibles por reponer van al worker; un fusible fundido llega a sus oyentes', async () => {
    const c = new SimClient()
    const w = FalsoWorker.ultimo
    const fundidos: unknown[] = []
    c.alFundido((e) => fundidos.push(e))
    const p = c.load({}, 1e-5)
    const id = w.cargas()[0].id
    w.contestar({ type: 'ready', id, nodes: 3, elements: 2, digitales: 0, lazo: [] })
    await p
    expect(c.setValues([])).toBe(0)
    expect(c.setValues([{ indice: 1, elemento: { type: 'R', a: 1, b: 2, ohms: 470 } }])).toBe(1)
    c.reponer(0)
    expect(w.enviados.filter((m) => m.type !== 'load')).toEqual([
      { type: 'valores', cambios: [{ indice: 1, elemento: { type: 'R', a: 1, b: 2, ohms: 470 } }], seq: 1 },
      { type: 'reponer', indice: 0 }
    ])
    w.contestar({ type: 'fundido', id: id + 99, indice: 0, t: 1, amps: 2, segundos: 0.1 })
    w.contestar({ type: 'fundido', id, indice: 0, t: 0.027, amps: 4.5, segundos: 0.027 })
    expect(fundidos).toEqual([{ indice: 0, t: 0.027, amps: 4.5, segundos: 0.027 }])
  })

  it('dispose rechaza la carga pendiente', async () => {
    const c = new SimClient()
    const p = c.load({}, 1e-5)
    c.dispose()
    await expect(p).rejects.toThrow(/detuvo/)
    expect(FalsoWorker.ultimo.terminado).toBe(true)
  })
})

describe('SimClient: avances', () => {
  it('un error del motor durante un avance lo resuelve como interrumpido, sin dejarlo esperando', async () => {
    const c = new SimClient()
    const w = FalsoWorker.ultimo
    const carga = c.load({}, 1e-5)
    w.contestar({ type: 'ready', id: w.cargas()[0].id, nodes: 2, elements: 1, digitales: 0, lazo: [] })
    await carga
    const a = c.avanzarHasta(5)
    w.contestar({ type: 'error', id: w.cargas()[0].id, message: 'no convergió' })
    const r = await a
    expect(r.interrumpida).toBe(true)
    expect(Number.isNaN(r.t)).toBe(true)
  })
  it('detener (liberar el cliente) durante un avance lo resuelve como interrumpido', async () => {
    const c = new SimClient()
    const w = FalsoWorker.ultimo
    const carga = c.load({}, 1e-5)
    w.contestar({ type: 'ready', id: w.cargas()[0].id, nodes: 2, elements: 1, digitales: 0, lazo: [] })
    await carga
    const a = c.avanzar(1)
    c.dispose()
    expect((await a).interrumpida).toBe(true)
    expect(w.terminado).toBe(true)
  })

  it('la llegada de un avance resuelve el suyo con su instante', async () => {
    const c = new SimClient()
    const w = FalsoWorker.ultimo
    const carga = c.load({}, 1e-5)
    const id = w.cargas()[0].id
    w.contestar({ type: 'ready', id, nodes: 2, elements: 1, digitales: 0, lazo: [] })
    await carga
    const a = c.avanzarHasta(2e-3)
    const m = w.enviados.at(-1) as Extract<ToWorker, { type: 'hasta' }>
    expect(m).toMatchObject({ type: 'hasta', t: 2e-3 })
    w.contestar({ type: 'llegada', id, seq: m.seq, t: 2e-3, dt: 2e-3, interrumpida: false })
    expect(await a).toEqual({ t: 2e-3, dt: 2e-3, interrumpida: false })
  })

  it('la captura amplia manda su petición y resuelve con la pantalla que contesta el worker', async () => {
    const c = new SimClient()
    const w = FalsoWorker.ultimo
    const carga = c.load({}, 1e-5)
    const id = w.cargas()[0].id
    w.contestar({ type: 'ready', id, nodes: 2, elements: 1, digitales: 0, lazo: [] })
    await carga
    const a = c.capturaAmplia(0, 2000, 0.5)
    const m = w.enviados.at(-1) as Extract<ToWorker, { type: 'captura-amplia' }>
    expect(m).toMatchObject({ type: 'captura-amplia', osciloscopio: 0, columnas: 2000, hasta: 0.5 })
    w.contestar({ type: 'captura-amplia', id, seq: m.seq, pantalla: null })
    expect(await a).toBeNull()
  })

  it('un error o liberar el cliente deja sin respuesta a la captura amplia como null', async () => {
    const c = new SimClient()
    const w = FalsoWorker.ultimo
    const carga = c.load({}, 1e-5)
    w.contestar({ type: 'ready', id: w.cargas()[0].id, nodes: 2, elements: 1, digitales: 0, lazo: [] })
    await carga
    const a = c.capturaAmplia(0, 2000)
    c.dispose()
    expect(await a).toBeNull()
  })

  it('las columnas finas mandan su petición, resuelven con el registro del worker y quedan en null si se libera el cliente', async () => {
    const c = new SimClient()
    const w = FalsoWorker.ultimo
    const carga = c.load({}, 1e-5)
    const id = w.cargas()[0].id
    w.contestar({ type: 'ready', id, nodes: 2, elements: 1, digitales: 0, lazo: [] })
    await carga
    const a = c.capturaFina(1, 0.25)
    const m = w.enviados.at(-1) as Extract<ToWorker, { type: 'captura-fina' }>
    expect(m).toMatchObject({ type: 'captura-fina', osciloscopio: 1, hasta: 0.25 })
    const registro = { t0: 0, dt: 1e-3, n: 2, tCaptura: 0.002, columnas: new Float32Array(50) }
    w.contestar({ type: 'captura-fina', id, seq: m.seq, registro })
    expect(await a).toBe(registro)
    const b = c.capturaFina(0)
    c.dispose()
    expect(await b).toBeNull()
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readSim, SAB_LENGTH, VENTANA_PROMEDIO_MS, type ToWorker } from './protocol'

/** Worker de la vista previa con el motor real (WASM construido). Lee `promedios_ptr` como [duración, un promedio por
 * nodo…, uno por elemento…]: si esa distribución y la de `protocol.ts` dejaran de coincidir, chips y Multímetro
 * mostrarían cifras corridas sin que nada fallara. */
vi.mock('./pkg/kirchi_engine.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('./pkg/kirchi_engine.js')>()
  const { readFileSync } = await import('node:fs')
  const { join } = await import('node:path')
  const bytes = readFileSync(join(import.meta.dirname, 'pkg/kirchi_engine_bg.wasm'))
  // `init()` sin argumentos pide el .wasm por `fetch`, que en Node no lee archivos: se le dan los bytes.
  return { ...real, default: () => real.default({ module_or_path: bytes }) }
})

/** 0.5 V + 1 V de pico a 1 kHz en el nodo 1 sobre dos resistencias de 1 kΩ en serie (el nodo 2 es la mitad). */
const DIVISOR = {
  nodes: 3,
  elements: [
    { type: 'V', a: 1, b: 0, wave: { kind: 'sine', offset: 0.5, amp: 1, freq: 1000 } },
    { type: 'R', a: 1, b: 2, ohms: 1000 },
    { type: 'R', a: 2, b: 0, ohms: 1000 }
  ]
}

describe('worker de la vista previa con el motor de verdad: promedios de 100 ms', () => {
  let enviar: (m: ToWorker) => Promise<void> | void
  let recibidos: { type: string }[]

  beforeEach(async () => {
    vi.useFakeTimers()
    vi.resetModules()
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

  it('publica la duración y el promedio de cada nodo y de cada corriente en su lugar', async () => {
    const sab = new SharedArrayBuffer(SAB_LENGTH * Float64Array.BYTES_PER_ELEMENT)
    await enviar({ type: 'load', id: 1, netlist: JSON.stringify(DIVISOR), h: 1e-5, sab })
    expect(recibidos.map((m) => m.type)).toEqual(['ready'])
    const vista = new Float64Array(sab)
    // Recién cargado no hay intervalo completo: la lectura es el último paso.
    expect(readSim(vista, 3, 3).promedio).toBeNull()
    vi.advanceTimersByTime(3 * VENTANA_PROMEDIO_MS + 50)
    const s = readSim(vista, 3, 3)
    expect(s.consistente).toBe(true)
    const p = s.promedio!
    expect(p).not.toBeNull()
    // Un intervalo de unos 100 ms de reloj a velocidad 1: unos 100 ms simulados.
    expect(p.duracion).toBeGreaterThan(0.05)
    expect(p.duracion).toBeLessThan(0.15)
    expect(p.voltages).toHaveLength(3)
    expect(p.currents).toHaveLength(3)
    expect(p.voltages[0]).toBe(0)
    // Cerca de cien periodos: el promedio es la continua (lo que quede de un periodo, a lo más 1 V · 1 % de 100).
    expect(Math.abs(p.voltages[1] - 0.5)).toBeLessThan(0.02)
    expect(Math.abs(p.voltages[2] - 0.25)).toBeLessThan(0.01)
    // La resistencia de arriba lleva (V1 − V2)/1 kΩ = 0.25 mA en promedio, la de abajo lo mismo; la fuente entrega esa corriente.
    expect(Math.abs(p.currents[1] - 0.25e-3)).toBeLessThan(1e-5)
    expect(Math.abs(p.currents[2] - 0.25e-3)).toBeLessThan(1e-5)
    expect(Math.abs(p.currents[0] + 0.25e-3)).toBeLessThan(1e-5)
    // El promedio y el último paso son cosas distintas: el último paso sigue a la senoidal.
    expect(s.voltages[2]).toBeCloseTo(s.voltages[1] / 2, 9)
    // Y cada nodo con su promedio, no corridos: el nodo 2 es la mitad del 1 también en promedio.
    expect(p.voltages[2]).toBeCloseTo(p.voltages[1] / 2, 6)
  })

  it('un cambio en caliente anula el promedio en curso hasta el intervalo siguiente', async () => {
    const sab = new SharedArrayBuffer(SAB_LENGTH * Float64Array.BYTES_PER_ELEMENT)
    await enviar({ type: 'load', id: 1, netlist: JSON.stringify(DIVISOR), h: 1e-5, sab })
    const vista = new Float64Array(sab)
    vi.advanceTimersByTime(3 * VENTANA_PROMEDIO_MS + 50)
    expect(readSim(vista, 3, 3).promedio).not.toBeNull()
    enviar({ type: 'valores', cambios: [{ indice: 2, elemento: { type: 'R', a: 2, b: 0, ohms: 3000 } }], seq: 1 })
    expect(readSim(vista, 3, 3).promedio).toBeNull()
    vi.advanceTimersByTime(2 * VENTANA_PROMEDIO_MS + 50)
    const p = readSim(vista, 3, 3).promedio!
    // Con 3 kΩ abajo el nodo 2 es tres cuartos del 1.
    expect(Math.abs(p.voltages[2] - 0.375)).toBeLessThan(0.015)
    expect(p.voltages[2]).toBeCloseTo(0.75 * p.voltages[1], 6)
  })
})

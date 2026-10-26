import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import init, { Simulator } from '../sim/pkg/kirchi_engine.js'
import type { AjustesOsciloscopio } from './ajustes'
import { Barrido } from './barrido'
import { CIFRAS_COLUMNA_MOTOR, CIFRAS_VENTANA, medidasDeCanal } from './medidas'

let memoria: WebAssembly.Memory
beforeAll(async () => {
  memoria = (await init({ module_or_path: readFileSync(join(import.meta.dirname, '../sim/pkg/kirchi_engine_bg.wasm')) })).memory
})

/** Una fuente sobre 1 kΩ con una sonda de canal en su nodo. */
function fuente(onda: object, columna: number): Simulator {
  const net = { nodes: 2, elements: [{ type: 'V', a: 1, b: 0, wave: onda }, { type: 'R', a: 1, b: 0, ohms: 1000 }], sondas: [{ kind: 'v', p: 1, n: 0, muestras: 262144, columna }] }
  return new Simulator(JSON.stringify(net), 1e-5)
}

function medir(sim: Simulator, t0: number, span: number) {
  const n = 1000
  const cols = new Float64Array(memoria.buffer, sim.sonda_columnas(0, t0, span / n, 0, n), n * CIFRAS_COLUMNA_MOTOR).slice()
  const w = new Float64Array(memoria.buffer, sim.sonda_ventana(0, t0, t0 + span), CIFRAS_VENTANA).slice()
  return medidasDeCanal(cols, w)
}
const cerca = (x: number, y: number, rel: number) => Math.abs(x - y) <= rel * Math.abs(y)

describe('fidelidad del osciloscopio (criterio 3)', () => {
  it('la senoidal del generador: Vpp, eficaz y frecuencia dentro de 0.5 %', () => {
    const sim = fuente({ kind: 'sine', offset: 0, amp: 1, freq: 1000, continua: true }, 5e-3 / 2048)
    sim.advance_to(0.02, 1e9)
    const m = medir(sim, 0.01, 5e-3)
    expect(cerca(m[0].valor, 2, 5e-3)).toBe(true)
    expect(cerca(m[4].valor, Math.SQRT1_2, 5e-3)).toBe(true)
    expect(cerca(m[5].valor, 1000, 5e-3)).toBe(true)
    sim.free()
  })

  it('la cuadrada al 25 %: Vpp, frecuencia y ciclo dentro de 0.5 %', () => {
    const sim = fuente({ kind: 'pulse', low: 0, high: 2, freq: 1000, rise: 0, fall: 0, width: 0.25e-3, continua: true }, 5e-3 / 2048)
    sim.advance_to(0.02, 1e9)
    const m = medir(sim, 0.01, 5e-3)
    expect(cerca(m[0].valor, 2, 5e-3)).toBe(true)
    expect(cerca(m[5].valor, 1000, 5e-3)).toBe(true)
    expect(cerca(m[7].valor, 0.25, 5e-3)).toBe(true)
    sim.free()
  })

  it('con una señal estable el disparo se mueve menos de media columna en 100 barridos', () => {
    const span = 2e-3
    const sim = fuente({ kind: 'sine', offset: 0, amp: 1, freq: 1000 }, span / 2048)
    sim.configurar_sonda(0, JSON.stringify({ columna: span / 2048, acople: 'dc', disparo: { nivel: 0.3, subida: true, histeresis: 0.02 } }))
    const a: AjustesOsciloscopio = {
      canales: (['A', 'B', 'C', 'D'] as const).map((canal) => ({ canal, on: canal === 'A', vdiv: 0.5, pos: 0, acople: 'DC' as const })),
      matematico: false, base: span / 10, disparoCentro: false, disparo: { fuente: 'A', subida: true, nivel: 0.3, modo: 'auto' }, medidas: [], ideal: false
    }
    const b = new Barrido(a)
    const fases: number[] = []
    while (fases.length < 100) {
      sim.advance_to(sim.time() + 0.37e-3, 1e9)
      const p = b.siguiente({ hasta: sim.sonda_tiempo(0), disparo: (t) => sim.sonda_disparo(0, t) }, span / 1000)
      if (p?.estado === 'disparado') fases.push((p.tDisparo * 1000) % 1)
    }
    const dispersion = Math.max(...fases) - Math.min(...fases)
    // Media columna de una pantalla de 2 ms en 1,000 columnas: 1 µs, o 1e-3 periodos.
    expect(dispersion).toBeLessThan(1e-3)
    sim.free()
  })
})

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { BUDGET_MS, PresupuestoDeLote } from './lote'
import init, { Simulator } from './pkg/kirchi_engine.js'

beforeAll(async () => {
  await init({ module_or_path: readFileSync(join(import.meta.dirname, 'pkg/kirchi_engine_bg.wasm')) })
})

/** Peor caso del protocolo: 256 nodos, 1,024 elementos, la mitad de lo añadido diodos. */
function peorCaso(): string {
  let seed = 1
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
  const N = 256
  const el: object[] = [{ type: 'V', a: 1, b: 0, wave: { kind: 'square', low: 0, high: 9, freq: 1000, duty: 0.5 } }]
  for (let k = 2; k < N; k++) el.push({ type: 'R', a: k - 1, b: k, ohms: 330 })
  while (el.length < 1024) {
    const a = 1 + Math.floor(rnd() * (N - 1))
    const b = Math.floor(rnd() * N)
    if (a === b) continue
    el.push(rnd() < 0.5 ? { type: 'D', a, b, is: 1.5e-17, n: 2 } : { type: 'R', a, b, ohms: 1000 })
  }
  return JSON.stringify({ nodes: N, elements: el })
}

describe('un tick de la vista previa en el peor caso', () => {
  it('con el lote adaptable dura a lo sumo el doble del presupuesto', () => {
    const sim = new Simulator(peorCaso(), 5e-6)
    const p = new PresupuestoDeLote()
    const duraciones: number[] = []
    for (let tick = 0; tick < 25; tick++) {
      const goal = sim.time() + 0.1
      const inicio = performance.now()
      while (sim.time() < goal - 1e-12 && performance.now() - inicio < BUDGET_MS) {
        const t0 = performance.now()
        const pasos = sim.advance_to(goal, p.tamano(BUDGET_MS - (t0 - inicio)))
        p.medir(performance.now() - t0, pasos)
        if (pasos === 0) break
      }
      duraciones.push(performance.now() - inicio)
    }
    sim.free()
    // El primer paso cuesta ~60 ms (Newton desde cero, una sola vez por carga): no se puede partir. Los demás ticks sí.
    const peor = Math.max(...duraciones.slice(1))
    expect(duraciones[0]).toBeLessThan(250)
    expect(peor).toBeLessThanOrEqual(2 * BUDGET_MS)
  })
})

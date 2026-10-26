import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { etapas } from '../prueba/etapas'
import { avanzarSinColgarse, PresupuestoDeIteraciones } from './atasco'
import { pasoDeSimulacion } from './lectura'
import init, { Simulator } from './pkg/kirchi_engine.js'

beforeAll(async () => {
  await init({ module_or_path: readFileSync(join(import.meta.dirname, 'pkg/kirchi_engine_bg.wasm')) })
})

describe('un paso difícil en un circuito del tamaño del límite', () => {
  it('converge a través de llamadas repetidas con el presupuesto que calcula la interfaz, sin que ninguna se cuelgue', () => {
    // 255 etapas de transistor (1,023 redes) con 2 iteraciones por intento: casi todos los pasos necesitan el rescate de
    // convergencia, que cuesta más que el presupuesto de una llamada. El rescate guarda su nivel y las llamadas siguen.
    const net = etapas(255)
    const sim = new Simulator(JSON.stringify(net), pasoDeSimulacion(net))
    sim.set_max_newton_iterations(2)
    const presupuesto = new PresupuestoDeIteraciones(net.nodes + net.elements.length)
    let reloj = 0
    const ahora = () => (reloj += 0.001) // reloj de mentira: lo que se mide es el número de llamadas, no el tiempo de pared
    let llamadas = 0
    let atascos = 0
    while (sim.time() < 5e-9 && llamadas < 3000) {
      const r = avanzarSinColgarse(sim, 5e-9, 1, presupuesto, ahora)
      if (r.atasco !== null) atascos++
      llamadas++
    }
    const t = sim.time()
    sim.free()
    console.log(`rescate en el límite: t = ${t.toExponential(2)} s en ${llamadas} llamadas, ${atascos} con presupuesto agotado`)
    expect(t).toBeGreaterThanOrEqual(5e-9)
  }, 120000)
})

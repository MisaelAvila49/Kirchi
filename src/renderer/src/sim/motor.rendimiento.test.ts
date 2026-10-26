import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import type { NetlistMotor } from '../netlist/netlist'
import { MS_PERDIDOS_POR_LLAMADA, PresupuestoDeIteraciones } from './atasco'
import { AMPLIFICADOR, etapas } from '../prueba/etapas'
import { pasoDeSimulacion } from './lectura'
import { BUDGET_MS, PresupuestoDeLote } from './lote'
import init, { Simulator } from './pkg/kirchi_engine.js'
import { MAX_NODES } from './protocol'

beforeAll(async () => {
  await init({ module_or_path: readFileSync(join(import.meta.dirname, 'pkg/kirchi_engine_bg.wasm')) })
})

/** Ticks como los del worker: cada uno pide 12 ms de tiempo simulado y calcula a lo sumo BUDGET_MS. */
function correr(sim: Simulator, ticks: number) {
  const p = new PresupuestoDeLote()
  const duraciones: number[] = []
  let calculo = 0
  let pasos = 0
  const t0 = sim.time()
  for (let tick = 0; tick < ticks; tick++) {
    const goal = sim.time() + 0.012
    const inicio = performance.now()
    while (sim.time() < goal - 1e-12 && performance.now() - inicio < BUDGET_MS) {
      const a = performance.now()
      const n = sim.advance_to(goal, p.tamano(BUDGET_MS - (a - inicio)))
      p.medir(performance.now() - a, n)
      pasos += n
      if (n === 0) break
    }
    duraciones.push(performance.now() - inicio)
    calculo += duraciones[tick]
  }
  return { duraciones, pasos, capacidad: (sim.time() - t0) / (calculo / 1000), msPorPaso: calculo / pasos }
}

describe('el motor de la 2A en la vista previa', () => {
  it('un amplificador de un transistor con señal de 1 kHz corre a más del doble del tiempo real', () => {
    const sim = new Simulator(JSON.stringify(AMPLIFICADOR), pasoDeSimulacion(AMPLIFICADOR))
    sim.advance_to(1e-9, 1)
    const r = correr(sim, 120)
    sim.free()
    // Medido: 2.8 veces con 100 pasos por periodo. El ciclo del worker (8 ms de cálculo cada 12 ms) necesita 1.5 para el 100 %.
    expect(r.capacidad).toBeGreaterThan(2)
    expect(Math.max(...r.duraciones)).toBeLessThanOrEqual(2 * BUDGET_MS)
  })

  it('curva de tiempo real de cadenas de amplificadores con LED (1, 2, 5, 10 y 20 etapas)', () => {
    const curva: string[] = []
    const capacidades: Record<number, number> = {}
    // Con el paso máximo de la vista previa y, solo para registrar, con los 100 de antes.
    for (const [nombre, factor] of [['50 pasos por periodo', 1], ['100 pasos por periodo', 0.5]] as const) {
      const fila: string[] = []
      for (const k of [1, 2, 5, 10, 20]) {
        const net = etapas(k, true)
        const sim = new Simulator(JSON.stringify(net), pasoDeSimulacion(net) * factor)
        sim.advance_to(1e-9, 1)
        correr(sim, 10) // calienta
        const r = correr(sim, 60)
        sim.free()
        if (factor === 1) capacidades[k] = r.capacidad
        fila.push(`${k}: ${(100 * r.capacidad).toFixed(0)} % (${(1000 * r.msPorPaso).toFixed(1)} µs por paso)`)
      }
      curva.push(`${nombre}, capacidad por etapas ${fila.join('; ')}`)
    }
    console.log(`en WASM, ${curva.join(' | ')}`)
    // Una o dos etapas alcanzan el tiempo real con holgura (capacidad mayor que 1: la fracción del reloj que el cálculo deja libre).
    expect(capacidades[1]).toBeGreaterThan(2)
    expect(capacidades[2]).toBeGreaterThan(1.1)
    // Más etapas cuestan más: la curva baja.
    expect(capacidades[5]).toBeLessThan(capacidades[2])
  })

  it('un circuito de 255 transistores en el límite de redes no congela el tick', () => {
    const net = etapas(255)
    expect(net.nodes).toBe(1023)
    expect(net.nodes).toBeLessThanOrEqual(MAX_NODES)
    const sim = new Simulator(JSON.stringify(net), pasoDeSimulacion(net))
    const inicio = performance.now()
    sim.advance_to(1e-9, 1)
    const primero = performance.now() - inicio
    const r = correr(sim, 30)
    sim.free()
    // Medido: 0.7 ms por paso con la LU simplicial. La supernodal que faer elegía por omisión tardaba 21 ms con 907 redes.
    expect(primero).toBeLessThan(250)
    expect(r.msPorPaso).toBeLessThan(2)
    expect(Math.max(...r.duraciones)).toBeLessThanOrEqual(2 * BUDGET_MS)
  })

  it('en el límite de redes el presupuesto de iteraciones perdidas por llamada sigue cerca de un cuarto de segundo de trabajo', () => {
    // Un paso cuesta al menos dos iteraciones de Newton, así que ms/paso entre 2 acota por arriba lo que cuesta una iteración.
    const net = etapas(255)
    const sim = new Simulator(JSON.stringify(net), pasoDeSimulacion(net))
    sim.advance_to(1e-9, 1)
    const r = correr(sim, 20)
    sim.free()
    const msPorIteracion = r.msPorPaso / 2
    const presupuesto = new PresupuestoDeIteraciones(net.nodes + net.elements.length)
    const sinMedida = presupuesto.iteraciones() * msPorIteracion
    // Sin medida (la primera llamada) y con la medida real, ninguna llamada atascada retiene al worker más de ~1.5 veces el cuarto de segundo.
    presupuesto.medir(msPorIteracion * 500, 500)
    const conMedida = presupuesto.iteraciones() * msPorIteracion
    console.log(`presupuesto en el límite: ${msPorIteracion.toFixed(2)} ms por iteración, ${sinMedida.toFixed(0)} ms sin medida y ${conMedida.toFixed(0)} ms con ella`)
    expect(sinMedida).toBeLessThan(1.5 * MS_PERDIDOS_POR_LLAMADA)
    expect(conMedida).toBeLessThan(1.5 * MS_PERDIDOS_POR_LLAMADA)
  })
})

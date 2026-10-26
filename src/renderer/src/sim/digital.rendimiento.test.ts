// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { calcularConexiones } from '../conexiones/conexiones'
import { compilarNetlist, type ElementoMotor, type NetlistMotor } from '../netlist/netlist'
import { conEtiquetas, relojConDisplay, type Parte } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import { medir } from '../prueba/medir'
import { avisosDelCircuito } from '../ui/proyecto'
import { pasoDeSimulacion } from './lectura'
import { BUDGET_MS, PresupuestoDeLote } from './lote'
import init, { Simulator } from './pkg/kirchi_engine.js'
import { MAX_REDES_DIGITALES } from './protocol'

// Eventos por segundo con 1,000 compuertas en redes digitales puras, costo de un flanco sobre una red
// analógica y el 555 con contador, decodificador y display, en el WASM de la vista previa y con los ticks
// del worker. Los límites salen de lo medido en el ensayo (Ryzen 7 5700X, Node), con margen de dos o más veces.

/** Medido en el ensayo: 12.9 millones de eventos por segundo (23 nativos). */
const LIMITE_EVENTOS_POR_SEGUNDO = 5e6
/** Medido en el ensayo: avisos 3.0 ms y netlist 4.2 ms con mil compuertas. */
const LIMITE_NETLIST_MIL_COMPUERTAS_MS = 10
/** Medido en el ensayo: 31 µs por flanco (23 nativos). */
const LIMITE_US_POR_FLANCO = 80
/** Medido en el ensayo: capacidad de 3.1 veces el tiempo real a 986 Hz. El ciclo del worker (8 ms de cálculo cada 12 ms) pide 1.5. */
const LIMITE_CAPACIDAD_1KHZ = 2

const lib = libreriaDePrueba().piezas
let memoria: WebAssembly.Memory
beforeAll(async () => {
  memoria = (await init({ module_or_path: readFileSync(join(import.meta.dirname, 'pkg/kirchi_engine_bg.wasm')) })).memory
})

/** Ticks como los del worker: cada uno pide 12 ms de tiempo simulado y calcula a lo sumo BUDGET_MS. */
function correr(sim: Simulator, ticks: number) {
  const p = new PresupuestoDeLote()
  const duraciones: number[] = []
  let calculo = 0
  const t0 = sim.time()
  for (let tick = 0; tick < ticks; tick++) {
    const goal = sim.time() + 0.012
    const inicio = performance.now()
    while (sim.time() < goal - 1e-12 && performance.now() - inicio < BUDGET_MS) {
      const a = performance.now()
      const n = sim.advance_to(goal, p.tamano(BUDGET_MS - (a - inicio)))
      p.medir(performance.now() - a, n)
      if (n === 0) break
    }
    duraciones.push(performance.now() - inicio)
    calculo += duraciones[tick]
  }
  return { duraciones, calculoMs: calculo, simulado: sim.time() - t0, capacidad: (sim.time() - t0) / (calculo / 1000) }
}

/** Cambios de nivel de todas las redes digitales desde el arranque (la tercera medida de cada una). */
function cambios(sim: Simulator): number {
  const n = sim.digital_count()
  const m = new Float64Array(memoria.buffer, sim.medidas_ptr(), 3 * n)
  let total = 0
  for (let k = 0; k < n; k++) total += m[3 * k + 2]
  return total
}

const NOT = (entrada: number, salida: number): ElementoMotor => ({ type: 'GATE', fn: 'not', inputs: [entrada], output: salida, rise_delay: 5e-9, fall_delay: 5e-9, z_como: 'x' })

/** Un anillo de tres inversores (que oscila solo) y una cadena de `n` inversores colgada de él: todo en redes digitales puras. */
function anilloConCadena(n: number): NetlistMotor {
  const el: ElementoMotor[] = [NOT(0, 1), NOT(1, 2), NOT(2, 0)]
  for (let k = 0; k < n; k++) el.push(NOT(k === 0 ? 0 : k + 2, k + 3))
  return { nodes: 1, digital_nets: n + 3, elements: el }
}

function desdePiezas(partes: Parte[]): NetlistMotor {
  const d = conEtiquetas(lib, partes)
  const r = compilarNetlist(d, lib, calcularConexiones(d, lib))
  expect(r.errores).toEqual([])
  return r.netlist!
}

const R = (ref: string, valor: string, a: string, b: string): Parte => ({ tipo: 'resistencia', ref, props: { valor }, pines: { '1': a, '2': b } })
const C = (ref: string, valor: string, a: string, b: string): Parte => ({ tipo: 'capacitor', ref, props: { valor }, pines: { '1': a, '2': b } })

// El circuito `relojConDisplay` vive en `prueba/circuitos.ts`: lo usan también las pruebas de
// tiempo de los instrumentos.

describe('el motor digital en la vista previa (criterio 4 de la 2B)', () => {
  it('mil compuertas en redes digitales puras: eventos por segundo de cálculo, y ninguna llamada pasa del presupuesto del tick', () => {
    const net = anilloConCadena(1000)
    const sim = new Simulator(JSON.stringify(net), pasoDeSimulacion(net))
    correr(sim, 5) // calienta
    const antes = cambios(sim)
    const r = correr(sim, 30)
    const porSegundo = (cambios(sim) - antes) / (r.calculoMs / 1000)
    sim.free()
    console.log(`1,000 compuertas: ${(porSegundo / 1e6).toFixed(1)} millones de eventos por segundo de cálculo, tick más largo ${Math.max(...r.duraciones).toFixed(1)} ms`)
    expect(porSegundo).toBeGreaterThan(LIMITE_EVENTOS_POR_SEGUNDO)
    expect(Math.max(...r.duraciones)).toBeLessThanOrEqual(2 * BUDGET_MS)
  })

  it(`en el tope de ${MAX_REDES_DIGITALES} redes digitales carga rápido y el tick no se congela`, () => {
    const net = anilloConCadena(MAX_REDES_DIGITALES - 3)
    const inicio = performance.now()
    const sim = new Simulator(JSON.stringify(net), pasoDeSimulacion(net))
    sim.advance_to(1e-9, 1)
    const carga = performance.now() - inicio
    const r = correr(sim, 10)
    sim.free()
    console.log(`${MAX_REDES_DIGITALES} redes digitales: carga ${carga.toFixed(0)} ms, tick más largo ${Math.max(...r.duraciones).toFixed(1)} ms`)
    expect(carga).toBeLessThan(250)
    expect(Math.max(...r.duraciones)).toBeLessThanOrEqual(2 * BUDGET_MS)
  })

  it('los avisos y la netlist de mil compuertas en cadena caben en el presupuesto de la 2A (10 ms los avisos)', () => {
    const partes: Parte[] = [{ tipo: 'estado-logico', ref: 'E1', props: { estado: '1' }, pines: { S: 'n0' } }]
    for (let k = 1; k <= 1000; k++) partes.push({ tipo: 'not', ref: `U${k}`, pines: { A: `n${k - 1}`, Y: `n${k}` } })
    const d = conEtiquetas(lib, partes)
    const con = calcularConexiones(d, lib)
    const avisos = medir(() => avisosDelCircuito(d, con, lib))
    const netlist = medir(() => compilarNetlist(d, lib, con))
    console.log(`1,000 compuertas: avisos ${avisos.minimo.toFixed(1)} ms, netlist ${netlist.minimo.toFixed(1)} ms (mínimos)`)
    expect(avisos.minimo).toBeLessThan(10)
    expect(netlist.minimo).toBeLessThan(LIMITE_NETLIST_MIL_COMPUERTAS_MS)
  })

  it('el costo de un flanco sobre una red analógica (inversor 74HC con carga RC a 1 MHz)', () => {
    const net = desdePiezas([
      { tipo: 'fuente-pulso', ref: 'V1', props: { alto: '5', frecuencia: '1M', ciclo: '50 %' }, pines: { '+': 'in', '-': '0' } },
      { tipo: 'not', ref: 'U1', pines: { A: 'in', Y: 'out' } },
      R('R1', '1k', 'out', 'c'),
      C('C1', '100p', 'c', '0')
    ])
    const sim = new Simulator(JSON.stringify(net), pasoDeSimulacion(net))
    correr(sim, 3)
    // El mínimo de cinco tandas, como las demás pruebas de tiempo (`prueba/medir.ts`): una tanda sola tomó una vez 90 µs
    // al correr después de la del tope de redes, por el recolector, y 34 a 45 en las demás.
    let usPorFlanco = Infinity
    for (let tanda = 0; tanda < 5; tanda++) {
      const t0 = sim.time()
      const r = correr(sim, 20)
      // Dos flancos de salida por periodo de 1 µs.
      const flancos = (2 * (sim.time() - t0)) / 1e-6
      usPorFlanco = Math.min(usPorFlanco, (r.calculoMs * 1000) / flancos)
    }
    sim.free()
    console.log(`un flanco sobre una red analógica: ${usPorFlanco.toFixed(1)} µs de cálculo`)
    expect(usPorFlanco).toBeLessThan(LIMITE_US_POR_FLANCO)
  })

  it('el 555 a 1 kHz con contador, decodificador y display corre al tiempo real (criterio 2, sin la ventana)', () => {
    // Con 1 kΩ, 6.8 kΩ y 100 nF: f = 1.44 / ((R1 + 2 R2) C) = 986 Hz.
    const net = desdePiezas(relojConDisplay('6.8k', '100n'))
    const sim = new Simulator(JSON.stringify(net), pasoDeSimulacion(net))
    correr(sim, 5)
    // La mejor de cinco tandas de 60 ticks, como las demás pruebas de tiempo (el mínimo del tiempo de cálculo): una tanda
    // sola varía con la carga del equipo.
    let mejor = { capacidad: 0, tick: 0 }
    for (let tanda = 0; tanda < 5; tanda++) {
      const r = correr(sim, 60)
      if (r.capacidad > mejor.capacidad) mejor = { capacidad: r.capacidad, tick: Math.max(...r.duraciones) }
    }
    sim.free()
    console.log(`555 a 986 Hz con contador y display: capacidad ${(100 * mejor.capacidad).toFixed(0)} % (la mejor de cinco tandas), tick más largo ${mejor.tick.toFixed(1)} ms`)
    expect(mejor.capacidad).toBeGreaterThan(LIMITE_CAPACIDAD_1KHZ)
  })
})

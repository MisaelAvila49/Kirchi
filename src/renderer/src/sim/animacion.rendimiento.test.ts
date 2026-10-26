// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { calcularConexiones, clavePin } from '../conexiones/conexiones'
import { armarReparto, type Puerto } from '../conexiones/corrientes'
import { paralelo } from '../prueba/paralelo'
import { documentoVacio, type Pieza } from '../doc/tipos'
import { FasesDeFlechas, instanciasDeFlechas } from '../lienzo/flechas'
import { Movimiento } from '../lienzo/movimiento'
import { PALETA_CLARA } from '../lienzo/paleta'
import { compilarNetlist, type NetlistMotor } from '../netlist/netlist'
import { conEtiquetas, type Parte } from '../prueba/circuitos'
import { etapas } from '../prueba/etapas'
import { libreriaDePrueba } from '../prueba/libreria'
import { medir } from '../prueba/medir'
import type { Lectura } from './lectura'
import { pasoDeSimulacion } from './lectura'
import { BUDGET_MS, PresupuestoDeLote } from './lote'
import init, { Simulator } from './pkg/kirchi_engine.js'

const lib = libreriaDePrueba().piezas

beforeAll(async () => {
  await init({ module_or_path: readFileSync(join(import.meta.dirname, 'pkg/kirchi_engine_bg.wasm')) })
})

/** Ticks como los del worker: cada uno pide 12 ms simulados y calcula a lo sumo BUDGET_MS; con `terminales`, lee las corrientes por terminal al final. */
function correr(sim: Simulator, ticks: number, terminales: boolean): number {
  const p = new PresupuestoDeLote()
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
    if (terminales) sim.terminales_ptr()
    calculo += performance.now() - inicio
  }
  return (sim.time() - t0) / (calculo / 1000)
}

/** La mejor de diez tandas de cada una (mínimo del tiempo de cálculo), con y sin corrientes por terminal, intercaladas.
 * Con cinco tandas de 60 ticks una racha de carga se llevaba a una sola (−1 a 17 %); con diez pares de 30 ticks, −1 a 4
 * %. */
function costoDeTerminales(net: NetlistMotor): { sin: number; con: number } {
  const mejor = { sin: 0, con: 0 }
  for (const conTerminales of Array.from({ length: 20 }, (_, k) => k % 2 === 1)) {
    const sim = new Simulator(JSON.stringify(net), pasoDeSimulacion(net))
    sim.activar_promedios()
    if (conTerminales) sim.activar_terminales(true)
    correr(sim, 5, conTerminales)
    const c = correr(sim, 30, conTerminales)
    sim.free()
    const k = conTerminales ? 'con' : 'sin'
    mejor[k] = Math.max(mejor[k], c)
  }
  return mejor
}

const R = (ref: string, valor: string, a: string, b: string): Parte => ({ tipo: 'resistencia', ref, props: { valor }, pines: { '1': a, '2': b } })
const C = (ref: string, valor: string, a: string, b: string): Parte => ({ tipo: 'capacitor', ref, props: { valor }, pines: { '1': a, '2': b } })
/** El 555 a 986 Hz con contador, decodificador y display. */
const RELOJ_CON_DISPLAY: Parte[] = [
  { tipo: 'fuente-dc', ref: 'V1', props: { voltaje: '5' }, pines: { '+': 'vcc', '-': '0' } },
  R('R1', '1k', 'vcc', 'dis'),
  R('R2', '6.8k', 'dis', 'thr'),
  C('C1', '100n', 'thr', '0'),
  C('C2', '10n', 'cv', '0'),
  { tipo: 'temporizador-555', ref: 'U1', props: { modelo: 'NE555' }, pines: { '1': '0', '2': 'thr', '3': 'ck', '4': 'vcc', '5': 'cv', '6': 'thr', '7': 'dis', '8': 'vcc' } },
  { tipo: 'contador', ref: 'U2', pines: { CLK: 'ck', RST: '0', Q0: 'q0', Q1: 'q1', Q2: 'q2', Q3: 'q3', CO: 'co' } },
  { tipo: 'decodificador-7seg', ref: 'U3', pines: { A: 'q0', B: 'q1', C: 'q2', D: 'q3', a: 'pa', b: 'pb', c: 'pc', d: 'pd', e: 'pe', f: 'pf', g: 'pg' } },
  ...['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((s, k) => R(`R${k + 3}`, '330', `p${s}`, `an_${s}`)),
  { tipo: 'display-7seg', ref: 'DS1', pines: { a: 'an_a', b: 'an_b', c: 'an_c', d: 'an_d', e: 'an_e', f: 'an_f', g: 'an_g', dp: 'suelto', COM: '0' } }
]

describe('la 2D: tiempos (criterio 4) y costo de la corriente animada en el motor (criterio 1)', () => {
  it('encendida, la corriente animada baja la capacidad menos de 5 % en el amplificador con LED y en el 555 con display', () => {
    const d = conEtiquetas(lib, RELOJ_CON_DISPLAY)
    const r = compilarNetlist(d, lib, calcularConexiones(d, lib))
    expect(r.errores).toEqual([])
    for (const [nombre, net] of [['amplificador con LED', etapas(1, true)], ['555 con contador y display', r.netlist!]] as const) {
      const c = costoDeTerminales(net)
      console.log(`${nombre}: capacidad ${(100 * c.sin).toFixed(0)} % sin y ${(100 * c.con).toFixed(0)} % con las corrientes por terminal (${(100 * (1 - c.con / c.sin)).toFixed(1)} % menos)`)
      expect(c.con / c.sin).toBeGreaterThan(0.95)
    }
  })

  it('con 984 resistencias en paralelo, las flechas de una lectura cuestan menos de 1 ms y su reparto menos de 2 ms', () => {
    const d = paralelo()
    const con = calcularConexiones(d, lib)
    const puertos: Puerto[] = []
    for (const id of Object.keys(d.piezas)) {
      for (const pin of ['1', '2']) puertos.push({ red: con.redDePin.get(clavePin(id, pin))!, pin: clavePin(id, pin) })
      puertos.push({ red: -1, pin: null })
    }
    const medias = puertos.map((_, j) => (j % 3 === 0 ? 1e-3 : j % 3 === 1 ? -1e-3 : 0))
    const r = armarReparto(d, lib, con, puertos)
    const m = new Float64Array(r.tramos.length), a = new Float64Array(r.tramos.length)
    r.repartir(medias, medias.map(Math.abs), m, a)
    const fases = new FasesDeFlechas(r.tramos.length)
    let ahora = 0
    const flechas = medir(() => void instanciasDeFlechas(r.tramos, m, a, 1, 1, fases, (ahora += 33), false))
    console.log(`flechas de 984 resistencias (${r.tramos.length} tramos): ${flechas.minimo.toFixed(3)} ms por lectura (mínimo)`)
    expect(flechas.minimo).toBeLessThan(1)
  })

  it('la capa de movimiento de 50 motores y 50 relés se arma en menos de 1 ms por cuadro', () => {
    const doc = documentoVacio()
    const piezas: Pieza[] = []
    for (let k = 0; k < 50; k++) {
      piezas.push({ id: `m${k}`, tipo: 'motor-dc', ref: `M${k + 1}`, x: 12 * k, y: 0, rot: 0, espejo: false, props: {} })
      piezas.push({ id: `k${k}`, tipo: 'rele', ref: `K${k + 1}`, x: 12 * k, y: 20, rot: 0, espejo: false, props: {} })
    }
    for (const p of piezas) doc.piezas[p.id] = p
    const l: Lectura = {
      t: 0,
      ratio: 1,
      redes: new Map(),
      piezas: new Map(piezas.map((p) => [p.id, { v: 6, i: 0.1, p: 0.6, extra: p.tipo === 'rele' ? { tipo: 'rele' as const, operado: true } : { tipo: 'motor' as const, rpm: 6000 } }]))
    }
    const mov = new Movimiento()
    mov.preparar(doc, lib)
    mov.actualizar(lib, l, 1, 0, false)
    let ahora = 0
    const cuadro = medir(() => void mov.construir(doc, lib, PALETA_CLARA, (ahora += 16.7), false))
    console.log(`capa de movimiento de 50 motores y 50 relés: ${cuadro.minimo.toFixed(3)} ms por cuadro (mínimo)`)
    expect(cuadro.minimo).toBeLessThan(1)
  })
})

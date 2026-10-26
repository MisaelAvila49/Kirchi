// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { calcularConexiones } from '../conexiones/conexiones'
import { CANALES, DIVISIONES_H, type AjustesOsciloscopio } from '../instrumentos/ajustes'
import { COLUMNAS_SONDA, repartirMemoria } from '../instrumentos/memoria'
import { COLUMNA_MULTIMETRO, type SondaMotor } from '../netlist/instrumentos'
import { compilarNetlist, type NetlistMotor } from '../netlist/netlist'
import { conEtiquetas, relojConDisplay, type Parte } from '../prueba/circuitos'
import { etapas } from '../prueba/etapas'
import { libreriaDePrueba } from '../prueba/libreria'
import { minimoDe } from '../prueba/medir'
import { ajustesSinteticos, pantallaSintetica } from '../ui/osciloscopio/medirPantalla'
import { coloresPantalla, dibujarPantalla, type Lienzo2D } from '../ui/osciloscopio/dibujar'
import { configDeInstrumentos, InstrumentosEnWorker, type ConfigInstrumentos } from './instrumentosWorker'
import { basesDeTiempo, pasoDeSimulacion } from './lectura'
import { BUDGET_MS, PresupuestoDeLote } from './lote'
import init, { Simulator } from './pkg/kirchi_engine.js'
import { bytesSabInstrumentos, crearVistas } from './protocoloInstrumentos'

/** Se aceptó el costo de los instrumentos mientras los dos circuitos de referencia corran al 100 % del tiempo real en
 * Electron (lo comprueba e2e/instrumentos.spec.ts). Aquí, sin Electron, se imprime la pérdida medida y se exige que la
 * simulación siga sobre el tiempo real. */
const CAPACIDAD_MINIMA = 1
/** El JavaScript de dibujar cuatro canales y A − B a 2,560 columnas. */
const LIMITE_DIBUJO_MS = 2
/** Una pantalla de 2,560 columnas armada en el worker, dentro de su ciclo de 4 ms. */
const LIMITE_PUBLICAR_MS = 3

const lib = libreriaDePrueba().piezas
let memoria: WebAssembly.Memory
beforeAll(async () => {
  memoria = (await init({ module_or_path: readFileSync(join(import.meta.dirname, 'pkg/kirchi_engine_bg.wasm')) })).memory
})

/** Ticks como los del worker (12 ms simulados, a lo sumo BUDGET_MS de cálculo), con el trabajo de los instrumentos dentro. */
function correr(sim: Simulator, ticks: number, inst: InstrumentosEnWorker | null, reloj: { t: number }) {
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
    reloj.t += 12
    inst?.publicar(reloj.t)
    calculo += performance.now() - inicio
  }
  return (sim.time() - t0) / (calculo / 1000)
}

interface Caso {
  net: NetlistMotor
  h: number
  config: ConfigInstrumentos | null
}

/** La mejor capacidad de cinco tandas de 60 ticks (con su calentamiento). */
function capacidad(c: Caso): number {
  const sim = new Simulator(JSON.stringify(c.net), c.h)
  sim.activar_promedios()
  let inst: InstrumentosEnWorker | null = null
  const reloj = { t: 0 }
  if (c.config) {
    const [nOsc, nMm] = [c.config.osciloscopios.length, c.config.multimetros.length]
    inst = new InstrumentosEnWorker(sim, () => memoria.buffer, crearVistas(new SharedArrayBuffer(bytesSabInstrumentos(nOsc, nMm)), nOsc, nMm), structuredClone(c.config), 0)
    inst.columnas(0, 1000)
  }
  correr(sim, 10, inst, reloj)
  let mejor = 0
  for (let tanda = 0; tanda < 5; tanda++) mejor = Math.max(mejor, correr(sim, 60, inst, reloj))
  sim.free()
  return mejor
}

/** El amplificador con LED con cuatro sondas de canal sobre `nodos` y las dos de un multímetro, como las arma la netlist. */
function amplificadorConSondas(): { sin: Caso; con: Caso } {
  const net = etapas(1, true)
  const base = 1e-3
  const nodos = [2, 3, 4, 6]
  const muestras = repartirMemoria([...nodos.map(() => 'canal' as const), 'multimetro', 'multimetro']) as number[]
  const columna = (DIVISIONES_H * base) / (COLUMNAS_SONDA / 2)
  const sondas: SondaMotor[] = nodos.map((p, k) => ({ kind: 'v', p, n: 0, muestras: muestras[k], columna }))
  sondas.push(
    { kind: 'v', p: 4, n: 0, muestras: muestras[4], columna: COLUMNA_MULTIMETRO, sin_rejilla: true },
    { kind: 'i', element: 0, signo: 1, muestras: muestras[5], columna: COLUMNA_MULTIMETRO, sin_rejilla: true }
  )
  const ajustes: AjustesOsciloscopio = { ...ajustesSinteticos(), matematico: false, base }
  const config: ConfigInstrumentos = {
    osciloscopios: [{ ajustes, sondas: [0, 1, 2, 3] }],
    multimetros: [{ modo: 'V DC', ideal: false, sondaV: 4, sondaI: 5, elemento: 0, rango: 1e4 }]
  }
  const h = pasoDeSimulacion(net, [base])
  return { sin: { net, h: pasoDeSimulacion(net), config: null }, con: { net: { ...net, sondas }, h, config } }
}

/** El 555 con display sin instrumentos y con un osciloscopio de cuatro canales y un multímetro, armados por la netlist. */
function relojConSondas(): { sin: Caso; con: Caso } {
  const compilar = (extra: Parte[]) => {
    const d = conEtiquetas(lib, [...relojConDisplay('6.8k', '100n'), ...extra])
    const r = compilarNetlist(d, lib, calcularConexiones(d, lib))
    expect(r.errores).toEqual([])
    return r
  }
  const sin = compilar([])
  const con = compilar([
    { tipo: 'osciloscopio', ref: 'XSC1', props: { c_on: 'encendido', d_on: 'encendido' }, pines: { A: 'ck', B: 'thr', C: 'q0', D: 'an_a' } },
    { tipo: 'multimetro', ref: 'XMM1', props: { modo: 'V DC' }, pines: { '+': 'thr', COM: '0' } }
  ])
  return {
    sin: { net: sin.netlist!, h: pasoDeSimulacion(sin.netlist!), config: null },
    con: { net: con.netlist!, h: pasoDeSimulacion(con.netlist!, basesDeTiempo(con)), config: configDeInstrumentos(con.instrumentos).config }
  }
}

describe('el costo de los instrumentos (criterios 4 y 5 de la 2C)', () => {
  it.each([
    ['el amplificador con LED', amplificadorConSondas],
    ['el 555 con contador y display', relojConSondas]
  ] as const)('%s con cuatro canales y un multímetro sigue por encima del tiempo real', { timeout: 60_000 }, (_n, caso) => {
    const { sin, con } = caso()
    // Alternadas, para que la carga del equipo pese igual en las dos. Las cuatro tardan unos 4 s, más con el equipo ocupado:
    // el límite de 5 s de Vitest cortaba la prueba antes de medir.
    const [a1, b1, a2, b2] = [capacidad(sin), capacidad(con), capacidad(sin), capacidad(con)]
    const [base, conInst] = [Math.max(a1, a2), Math.max(b1, b2)]
    const costo = 1 - conInst / base
    console.log(`${_n}: capacidad ${base.toFixed(2)} sin instrumentos y ${conInst.toFixed(2)} con ellos (${(100 * costo).toFixed(1)} %)`)
    expect(conInst).toBeGreaterThan(CAPACIDAD_MINIMA)
  })

  it('el JavaScript de dibujar cuatro canales y A − B a 2,560 columnas cabe en 2 ms', () => {
    // Un contexto que no dibuja: mide solo el JavaScript (un Proxy agregaría su propio costo en cada llamada).
    const nada = () => {}
    const ctx = {
      fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: 'left', textBaseline: 'alphabetic',
      fillRect: nada, beginPath: nada, moveTo: nada, lineTo: nada, stroke: nada, fill: nada, closePath: nada, rect: nada, clip: nada,
      save: nada, restore: nada, setLineDash: nada, fillText: nada
    } as unknown as Lienzo2D
    const p = pantallaSintetica(2560)
    const a = ajustesSinteticos()
    const c = coloresPantalla('claro')
    const ms = minimoDe(() => dibujarPantalla(ctx, p, a, 2560, 2048, c, { dpr: 2 }))
    console.log(`dibujar 4 canales y A − B a 2,560 columnas (sin canvas): ${ms.toFixed(2)} ms`)
    expect(ms).toBeLessThan(LIMITE_DIBUJO_MS)
  })

  it('el worker arma una pantalla de 2,560 columnas en menos de 3 ms', () => {
    const { con } = amplificadorConSondas()
    const sim = new Simulator(JSON.stringify(con.net), con.h)
    sim.advance_to(0.05, 1e9)
    const inst = new InstrumentosEnWorker(sim, () => memoria.buffer, crearVistas(new SharedArrayBuffer(bytesSabInstrumentos(1, 1)), 1, 1), structuredClone(con.config!), 0)
    inst.columnas(0, 2560)
    // Cada vuelta, otro ancho (2,560 o 2,559): la misma pantalla se arma de nuevo con sus muestras, como al pausar.
    let reloj = 0
    let ancho = 2560
    const ms = minimoDe(() => {
      inst.columnas(0, (ancho = ancho === 2560 ? 2559 : 2560))
      inst.publicar((reloj += 40), true)
    })
    sim.free()
    console.log(`una pantalla de 2,560 columnas en el worker: ${ms.toFixed(2)} ms`)
    expect(ms).toBeLessThan(LIMITE_PUBLICAR_MS)
  })
})

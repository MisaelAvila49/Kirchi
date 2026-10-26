// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { calcularConexiones } from '../conexiones/conexiones'
import { ajusteAutomatico, canalDeReferencia } from '../instrumentos/ajusteAutomatico'
import { MODOS_MULTIMETRO } from '../instrumentos/ajustes'
import { compilarNetlist } from '../netlist/netlist'
import { conEtiquetas, type Parte } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import { COLUMNAS_INICIALES, configDeInstrumentos, InstrumentosEnWorker, type CambioDeRango } from './instrumentosWorker'
import { basesDeTiempo, pasoDeSimulacion } from './lectura'
import init, { Simulator } from './pkg/kirchi_engine.js'
import { bytesSabInstrumentos, CIFRAS_COLUMNA, crearVistas, leerInstrumentos, MUESTRAS_CSV } from './protocoloInstrumentos'

const lib = libreriaDePrueba().piezas
let memoria: WebAssembly.Memory
beforeAll(async () => {
  memoria = (await init({ module_or_path: readFileSync(join(import.meta.dirname, 'pkg/kirchi_engine_bg.wasm')) })).memory
})

/** El circuito con su `Simulator`, la memoria de los instrumentos y `correr`: `n` vueltas del ciclo del worker. */
function armar(partes: Parte[]) {
  const d = conEtiquetas(lib, partes)
  const r = compilarNetlist(d, lib, calcularConexiones(d, lib))
  if (!r.netlist) throw new Error(r.errores.join(' '))
  const sim = new Simulator(JSON.stringify(r.netlist), pasoDeSimulacion(r.netlist, basesDeTiempo(r)))
  const ci = configDeInstrumentos(r.instrumentos)
  const [nOsc, nMm] = [ci.config.osciloscopios.length, ci.config.multimetros.length]
  const vistas = crearVistas(new SharedArrayBuffer(bytesSabInstrumentos(nOsc, nMm)), nOsc, nMm)
  let reloj = 0
  const inst = new InstrumentosEnWorker(sim, () => memoria.buffer, vistas, structuredClone(ci.config), reloj)
  /** Cada vuelta simula `dt` y pasan `ms` de reloj. */
  const correr = (n: number, dt: number, ms: number): CambioDeRango[] => {
    const cambios: CambioDeRango[] = []
    for (let k = 0; k < n; k++) {
      sim.advance_to(sim.time() + dt, 1e9)
      reloj += ms
      cambios.push(...inst.publicar(reloj))
    }
    return cambios
  }
  return { sim, ci, inst, vistas, correr, reloj: () => reloj }
}

const senoConOsciloscopio = (modo = 'V AC'): Parte[] => [
  { tipo: 'generador', ref: 'XFG1', props: {}, pines: { '+': 's', COM: '0' } },
  { tipo: 'resistencia', ref: 'R1', props: { valor: '1k' }, pines: { '1': 's', '2': '0' } },
  { tipo: 'osciloscopio', ref: 'XSC1', props: { disp_modo: 'Automático' }, pines: { A: 's', B: '0', C: '0', D: '0' } },
  { tipo: 'multimetro', ref: 'XMM1', props: { modo }, pines: { '+': 's', COM: '0' } }
]
// El generador (2 Vpp a 1 kHz, 50 Ω) sobre 1 kΩ, el osciloscopio (1 MΩ) y el voltímetro (10 MΩ) en paralelo.
const CARGA = 1 / (1 / 1000 + 1 / 1e6 + 1 / 10e6)
const VPP = (2 * CARGA) / (CARGA + 50)
const cerca = (x: number, y: number, rel: number) => Math.abs(x - y) <= rel * Math.abs(y)

describe('instrumentos en el worker', () => {
  it('el osciloscopio dispara y da sus columnas, sus muestras y sus medidas; el multímetro, su eficaz', () => {
    const { correr, vistas, sim, inst, reloj } = armar(senoConOsciloscopio())
    correr(40, 1e-3, 25)
    // Forzada (como al pausar): la misma pantalla con sus muestras de exportación.
    inst.publicar(reloj() + 1, true)
    const l = leerInstrumentos(vistas, { osciloscopio: 0 })
    const p = l.pantalla!
    expect(p.estado).toBe('disparado')
    expect(p.ncol).toBe(COLUMNAS_INICIALES)
    expect(p.dt).toBeCloseTo(1e-5, 12)
    expect(cerca(p.medidas[0][0].valor, VPP, 5e-3)).toBe(true)
    expect(cerca(p.medidas[0][5].valor, 1000, 5e-3)).toBe(true)
    // B tiene la entrada en tierra: 0 V. C está apagado: columnas vacías y medidas con su razón.
    const n = p.ncol
    expect(p.columnas[n * CIFRAS_COLUMNA]).toBe(0)
    expect(p.medidas[1][0].valor).toBe(0)
    expect(p.columnas[2 * n * CIFRAS_COLUMNA + 4]).toBe(8)
    expect(p.medidas[2][0].razon).toBe('apagado')
    // Las muestras de la exportación: el disparo a una división del borde cae en la muestra 200, en el nivel (0 V).
    expect(p.csv.n).toBe(MUESTRAS_CSV)
    expect(Math.abs(p.muestras[200])).toBeLessThan(0.01)
    expect(cerca(Math.max(...p.muestras.subarray(0, MUESTRAS_CSV)), VPP / 2, 1e-2)).toBe(true)
    const mm = l.multimetros[0]
    expect(mm.lecturas).toBeGreaterThanOrEqual(3)
    expect(MODOS_MULTIMETRO[mm.modo]).toBe('V AC')
    expect(cerca(mm.valor, VPP / 2 / Math.SQRT2, 5e-3)).toBe(true)
    expect(mm.fundido).toBe(false)
    sim.free()
  })

  it('el óhmetro sube de rango solo y mide 4.7 MΩ dentro de 1 %', () => {
    const { correr, vistas, sim } = armar([
      { tipo: 'resistencia', ref: 'R1', props: { valor: '4.7M' }, pines: { '1': 'x', '2': '0' } },
      { tipo: 'multimetro', ref: 'XMM1', props: { modo: 'Ω' }, pines: { '+': 'x', COM: '0' } }
    ])
    const cambios = correr(8, 1e-3, 250)
    expect(cambios).toEqual([{ multimetro: 0, rango: 1e5 }, { multimetro: 0, rango: 1e6 }])
    const mm = leerInstrumentos(vistas).multimetros[0]
    expect(mm.rango).toBe(1e6)
    expect(cerca(mm.valor, 4.7e6, 1e-2)).toBe(true)
    sim.free()
  })

  it('otra base de tiempo vacía la pantalla, la traza entra por la derecha y luego vuelve el disparo', () => {
    const { correr, vistas, inst, ci, reloj, sim } = armar(senoConOsciloscopio())
    correr(40, 1e-3, 25)
    const cfg = structuredClone(ci.config)
    cfg.osciloscopios[0].ajustes.base = 2e-3
    inst.configurar(cfg, reloj())
    correr(1, 1e-4, 25)
    const entra = leerInstrumentos(vistas, { osciloscopio: 0 }).pantalla!
    expect(entra.estado).toBe('rodillo')
    // Pasadas las dos pantallas siguientes (20 ms cada una) ya hay disparo con datos posteriores al cambio.
    correr(60, 1e-3, 25)
    const p = leerInstrumentos(vistas, { osciloscopio: 0 }).pantalla!
    expect(p.estado).toBe('disparado')
    expect(p.dt).toBeCloseTo(2e-5, 12)
    expect(cerca(p.medidas[0][0].valor, VPP, 5e-3)).toBe(true)
    sim.free()
  })

  it('el ancho nuevo de la pantalla se aplica aunque el tiempo no avance (en pausa)', () => {
    const { correr, vistas, inst, reloj, sim } = armar(senoConOsciloscopio())
    correr(40, 1e-3, 25)
    // Al día primero (la pantalla se rehace a lo más 30 veces por segundo): como al pausar.
    inst.publicar(reloj() + 1, true)
    const antes = leerInstrumentos(vistas, { osciloscopio: 0 }).pantalla!
    inst.columnas(0, 500)
    inst.publicar(reloj() + 2, true)
    const p = leerInstrumentos(vistas, { osciloscopio: 0 }).pantalla!
    expect(p.ncol).toBe(500)
    expect(p.t0).toBe(antes.t0)
    expect(p.version).toBe(antes.version + 1)
    // Sin nada nuevo no se vuelve a escribir.
    inst.publicar(reloj() + 100)
    expect(leerInstrumentos(vistas, { osciloscopio: 0 }).pantalla!.version).toBe(p.version)
    sim.free()
  })

  it('una pantalla oculta (0 columnas, su pestaña cerrada) no se arma; al volver a verse se arma en la siguiente vuelta', () => {
    const { correr, vistas, inst, sim } = armar(senoConOsciloscopio())
    correr(40, 1e-3, 25)
    const antes = leerInstrumentos(vistas, { osciloscopio: 0 }).pantalla!
    inst.columnas(0, 0)
    correr(20, 1e-3, 40)
    expect(leerInstrumentos(vistas, { osciloscopio: 0 }).pantalla!.version).toBe(antes.version)
    // El multímetro sigue leyendo con la pantalla oculta.
    expect(leerInstrumentos(vistas).multimetros[0].lecturas).toBeGreaterThan(0)
    inst.columnas(0, 800)
    correr(1, 1e-4, 1)
    const p = leerInstrumentos(vistas, { osciloscopio: 0 }).pantalla!
    expect(p.version).toBe(antes.version + 1)
    expect(p.ncol).toBe(800)
    expect(p.estado).toBe('disparado')
    sim.free()
  })

  it('las muestras de exportación se arman a lo más cuatro veces por segundo, y siempre que se fuerza', () => {
    const { correr, vistas, inst, reloj, sim } = armar(senoConOsciloscopio())
    correr(40, 1e-3, 40)
    const sinForzar = leerInstrumentos(vistas, { osciloscopio: 0 }).pantalla!
    inst.publicar(reloj() + 1, true)
    const forzada = leerInstrumentos(vistas, { osciloscopio: 0 }).pantalla!
    expect(forzada.csv.n).toBe(MUESTRAS_CSV)
    expect(forzada.t0).toBe(sinForzar.t0)
    // Ya al día: forzar otra vez no reescribe nada.
    inst.publicar(reloj() + 2, true)
    expect(leerInstrumentos(vistas, { osciloscopio: 0 }).pantalla!.version).toBe(forzada.version)
    sim.free()
  })

  it('en Único congela el primer barrido hasta rearmar', () => {
    const { correr, vistas, inst, ci, reloj, sim } = armar(senoConOsciloscopio())
    const cfg = structuredClone(ci.config)
    cfg.osciloscopios[0].ajustes.disparo.modo = 'unico'
    inst.configurar(cfg, reloj())
    correr(20, 1e-3, 25)
    const p = leerInstrumentos(vistas, { osciloscopio: 0 }).pantalla!
    expect(p.estado).toBe('congelado')
    correr(20, 1e-3, 25)
    expect(leerInstrumentos(vistas, { osciloscopio: 0 }).pantalla!.version).toBe(p.version)
    inst.rearmar(0)
    correr(20, 1e-3, 25)
    const q = leerInstrumentos(vistas, { osciloscopio: 0 }).pantalla!
    expect(q.version).toBeGreaterThan(p.version)
    expect(q.tDisparo).toBeGreaterThan(p.tDisparo)
    sim.free()
  })

  it('las medidas de la pantalla se calculan a lo más cuatro veces por segundo de reloj (como el multímetro)', () => {
    // Cada medida pide la ventana del motor sobre la pantalla (cuatro recorridos del búfer por canal): a 30 pantallas por
    // segundo eran la mitad del costo de armarlas. La traza sigue a 30 por segundo.
    const { sim, ci, vistas } = armar(senoConOsciloscopio('V DC'))
    let ventanas = 0
    const contado = new Proxy(sim, {
      get(o, k) {
        const v = (o as unknown as Record<string | symbol, unknown>)[k]
        if (k === 'sonda_ventana') ventanas++
        return typeof v === 'function' ? (v as (...x: unknown[]) => unknown).bind(o) : v
      }
    })
    const inst = new InstrumentosEnWorker(contado as unknown as Simulator, () => memoria.buffer, vistas, structuredClone(ci.config), 0)
    let reloj = 0
    let versiones = 0
    for (let k = 0; k < 40; k++) {
      // Tiempo real a 1×: 25 ms de circuito por vuelta de 25 ms de reloj (las pantallas se renuevan al terminar cada barrido de 10 ms).
      sim.advance_to(sim.time() + 25e-3, 1e9)
      inst.publicar((reloj += 25))
      versiones = leerInstrumentos(vistas, { osciloscopio: 0 }).pantalla!.version
    }
    // 1 s de reloj: unas 20 pantallas (una cada 33 ms con vueltas de 25 ms), y las medidas de los dos canales encendidos con
    // ventana (A; B está en tierra) a lo más cinco veces, más las cuatro lecturas del multímetro con sus dos sondas.
    expect(versiones).toBeGreaterThan(15)
    expect(ventanas).toBeLessThanOrEqual(5 + 2 * 5)
    // Entre una medida y otra, las columnas llegan en f32 directo del motor: las mismas cinco cifras que las de siete.
    const p = leerInstrumentos(vistas, { osciloscopio: 0 }).pantalla!
    // La dirección primero: la llamada puede hacer crecer la memoria del WASM y dejar desconectado el búfer de antes.
    const ptr = sim.sonda_columnas(ci.config.osciloscopios[0].sondas[0]!, p.t0, p.dt, 0, p.ncol)
    const siete = new Float64Array(memoria.buffer, ptr, p.ncol * 7).slice()
    for (let j = 0; j < p.ncol; j++) {
      const de = [0, 1, 2, 3, 6].map((x) => Math.fround(siete[j * 7 + x]))
      expect(Array.from(p.columnas.subarray(j * CIFRAS_COLUMNA, (j + 1) * CIFRAS_COLUMNA)), `columna ${j}`).toEqual(de)
    }
    sim.free()
  })

  it('cada lectura del multímetro pide la ventana de una sola de sus sondas: la del voltaje, o la de la corriente en A', () => {
    for (const [modo, esperada] of [['V DC', 0], ['A AC', 1], ['Ω', 0]] as const) {
      const { sim, ci, vistas } = armar([
        { tipo: 'fuente-dc', ref: 'V1', props: { voltaje: '1' }, pines: { '+': 'x', '-': '0' } },
        { tipo: 'resistencia', ref: 'R1', props: { valor: '1k' }, pines: { '1': 'x', '2': 'y' } },
        { tipo: 'multimetro', ref: 'XMM1', props: { modo }, pines: { '+': 'y', COM: '0' } }
      ])
      const pedidas: number[] = []
      const contado = new Proxy(sim, {
        get(o, k) {
          const v = (o as unknown as Record<string | symbol, unknown>)[k]
          if (k === 'sonda_ventana') return (s: number, a: number, b: number) => (pedidas.push(s), sim.sonda_ventana(s, a, b))
          return typeof v === 'function' ? (v as (...x: unknown[]) => unknown).bind(o) : v
        }
      })
      const inst = new InstrumentosEnWorker(contado as unknown as Simulator, () => memoria.buffer, vistas, structuredClone(ci.config), 0)
      let reloj = 0
      for (let k = 0; k < 4; k++) {
        sim.advance_to(sim.time() + 1e-3, 1e9)
        inst.publicar((reloj += 250))
      }
      const mm = ci.config.multimetros[0]
      expect(pedidas, modo).toEqual(Array(4).fill(esperada === 0 ? mm.sondaV : mm.sondaI))
      expect(leerInstrumentos(vistas).multimetros[0].lecturas).toBe(4)
      sim.free()
    }
  })

  it('la sonda que el modo del multímetro no lee queda en pausa, y al cambiar de modo la lectura sigue con la otra', () => {
    // 1 V sobre 1 kΩ y el multímetro (10 MΩ en V y en A, sin cambiar su elemento): en A DC lee la corriente de su resistencia.
    const { sim, ci, inst, vistas, correr, reloj } = armar([
      { tipo: 'fuente-dc', ref: 'V1', props: { voltaje: '1' }, pines: { '+': 'x', '-': '0' } },
      { tipo: 'resistencia', ref: 'R1', props: { valor: '1k' }, pines: { '1': 'x', '2': 'y' } },
      { tipo: 'multimetro', ref: 'XMM1', props: { modo: 'V DC' }, pines: { '+': 'y', COM: '0' } }
    ])
    const mm = ci.config.multimetros[0]
    correr(4, 1e-3, 250)
    expect(sim.sonda_tiempo(mm.sondaV)).toBe(sim.time())
    expect(sim.sonda_tiempo(mm.sondaI)).toBe(Number.NEGATIVE_INFINITY)
    expect(leerInstrumentos(vistas).multimetros[0].lecturas).toBe(4)
    const cfg = structuredClone(ci.config)
    cfg.multimetros[0].modo = 'A DC'
    inst.configurar(cfg, reloj())
    const tCambio = sim.time()
    correr(4, 1e-3, 250)
    const l = leerInstrumentos(vistas).multimetros[0]
    expect(l.lecturas).toBe(8)
    expect(MODOS_MULTIMETRO[l.modo]).toBe('A DC')
    expect(cerca(l.valor, 1 / (1e3 + 10e6), 1e-3)).toBe(true)
    expect(sim.sonda_tiempo(mm.sondaI)).toBe(sim.time())
    expect(sim.sonda_cubre(mm.sondaI)).toBeGreaterThan(tCambio)
    // La de voltaje quedó en pausa: no pasó del cambio.
    expect(sim.sonda_tiempo(mm.sondaV)).toBe(tCambio)
    sim.free()
  })

  it('en modo de corriente sobre una batería el fusible se funde y la lectura lo dice', () => {
    const { correr, vistas, sim } = armar([
      { tipo: 'bateria', ref: 'B1', props: { voltaje: '9' }, pines: { '+': 'x', '-': '0' } },
      { tipo: 'multimetro', ref: 'XMM1', props: { modo: 'A DC' }, pines: { '+': 'x', COM: '0' } }
    ])
    correr(30, 1e-2, 250)
    expect(leerInstrumentos(vistas).multimetros[0].fundido).toBe(true)
    sim.free()
  })
})

describe('ajuste automático con un canal sin conexión', () => {
  const conAEnElAire = (): Parte[] => [
    { tipo: 'generador', ref: 'XFG1', props: { frecuencia: '1k' }, pines: { '+': 's', COM: '0' } },
    { tipo: 'resistencia', ref: 'R1', props: { valor: '1k' }, pines: { '1': 's', '2': '0' } },
    // A sin cable (alAire) y la señal en B: el ajuste solo miraba A.
    { tipo: 'osciloscopio', ref: 'XSC1', props: { b_on: 'sí' }, pines: { A: 'x1', B: 's', C: 'x3', D: 'x4' } }
  ]

  it('causa raíz: A sin conexión no tiene medidas y el ajuste con A no cambia ni la base ni la escala', () => {
    const { correr, vistas, inst, reloj, sim } = armar(conAEnElAire())
    // Sin disparo (A está al aire), Automático barre libre pasados 100 ms simulados (`ESPERA_AUTO_MINIMA`).
    correr(150, 1e-3, 25)
    inst.publicar(reloj() + 1, true)
    const p = leerInstrumentos(vistas, { osciloscopio: 0 }).pantalla!
    expect(p.medidas[0].every((m) => m.razon === 'sin-datos')).toBe(true)
    expect(p.medidas[1][0].razon).toBe('')
    const conA = ajusteAutomatico({ vmax: 0, vmin: 0, frecuencia: null, acople: 'DC', base: 1e-3 })
    expect(conA).toMatchObject({ base: 1e-3, vdiv: 1 })
    sim.free()
  })

  it('con el ajuste nuevo el canal de referencia es B: 2 periodos a la vista y la señal a unas seis divisiones', () => {
    const { correr, vistas, inst, ci, reloj, sim } = armar(conAEnElAire())
    const cfg = structuredClone(ci.config)
    cfg.osciloscopios[0].ajustes.base = 1e-3
    cfg.osciloscopios[0].ajustes.canales[1].on = true
    inst.configurar(cfg, reloj())
    correr(150, 1e-3, 25)
    inst.publicar(reloj() + 1, true)
    const p = leerInstrumentos(vistas, { osciloscopio: 0 }).pantalla!
    const a = cfg.osciloscopios[0].ajustes
    const i = canalDeReferencia(a.canales.map((c, k) => ({ on: c.on, acople: c.acople, medidas: p.medidas[k] })))
    expect(i).toBe(1)
    const m = p.medidas[i]
    const r = ajusteAutomatico({ vmax: m[1].valor, vmin: m[2].valor, frecuencia: m[5].valor, acople: a.canales[i].acople, base: a.base, canal: 'B' })
    expect(r.base).toBe(0.2e-3)
    expect(r.vdiv).toBe(0.5)
    sim.free()
  })
})

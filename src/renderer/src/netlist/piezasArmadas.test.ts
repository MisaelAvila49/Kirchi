// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { calcularConexiones } from '../conexiones/conexiones'
import { documentoVacio, type Documento } from '../doc/tipos'
import { conEtiquetas, type Parte } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import { resolverAbsolutos, medirAbsoluto } from '../sim/absolutos'
import { excesoDe, limitesDelCircuito } from '../sim/avisos'
import { leerResultados, type Lectura as LecturaCruda } from '../sim/lectura'
import init, { Simulator } from '../sim/pkg/kirchi_engine.js'
import { avisosDelCircuito } from '../ui/proyecto'
import { compilarNetlist } from './netlist'

// Piezas armadas con lo que el motor ya simula (reguladores, puente, SCR, diac, ULN2003, reóstato, cristal, trifásica) y
// opciones nuevas, cada una contra los puntos clave de su hoja de datos con la tolerancia que publica. La comparación con
// ngspice está en `referencias.test.ts`.

const lib = libreriaDePrueba().piezas
let memoria: WebAssembly.Memory
beforeAll(async () => {
  memoria = (await init({ module_or_path: readFileSync(join(import.meta.dirname, '../sim/pkg/kirchi_engine_bg.wasm')) })).memory
})

const R = (ref: string, valor: string, a: string, b: string): Parte => ({ tipo: 'resistencia', ref, props: { valor }, pines: { '1': a, '2': b } })
const C = (ref: string, valor: string, a: string, b: string): Parte => ({ tipo: 'capacitor', ref, props: { valor }, pines: { '1': a, '2': b } })
const DC = (ref: string, voltaje: string, mas: string, menos = '0'): Parte => ({ tipo: 'fuente-dc', ref, props: { voltaje }, pines: { '+': mas, '-': menos } })

type Medicion = { v: number; i: number; p: number }
interface Lectura {
  v: (red: string) => number
  m: (ref: string) => Medicion
  /** Los avisos de límites de cada pieza (`sim/avisos.ts`) con esta lectura: referencia y texto del chip. */
  avisos: () => Record<string, string>
}

/** Simula `partes` hasta `fin` con paso máximo `h` y llama a `ver` en cada instante de `cada` (o solo al final). */
function correr(partes: Parte[], fin: number, h: number, cada: number, ver: (t: number, l: Lectura) => void): void {
  correrDocumento(conEtiquetas(lib, partes), fin, h, cada, ver)
}

/** Lo mismo con un documento ya armado (con cables y giros, como lo dibuja el usuario). */
function correrDocumento(d: Documento, fin: number, h: number, cada: number, ver: (t: number, l: Lectura) => void): void {
  const con = calcularConexiones(d, lib)
  const r = compilarNetlist(d, lib, con)
  expect(r.errores).toEqual([])
  const sim = new Simulator(JSON.stringify(r.netlist), h)
  const idDe = (ref: string) => Object.values(d.piezas).find((p) => p.ref === ref)!.id
  const n = sim.element_count()
  const f64 = (p: number, k = n) => new Float64Array(memoria.buffer, p, k).slice()
  const g = sim.digital_count()
  const pasos = Math.max(1, Math.round(fin / cada))
  // Los instantes salen de `k * cada` y no de sumar: un paso de 1e-17 s para llegar a la marca ahoga al motor.
  for (let k = 1; k <= pasos; k++) {
    sim.advance_to(k * cada, 10_000_000)
    const l = leerResultados(r, { time: sim.time(), ratio: 1, capacity: 1, seq: 0, consistente: true, voltages: sim.voltages(), currents: f64(sim.currents_ptr()), aux: f64(sim.aux_ptr()), estado: f64(sim.estado_ptr()), niveles: f64(sim.niveles_ptr(), g), medidas: f64(sim.medidas_ptr(), 3 * g) } as never)
    const avisos = () => {
      const out: Record<string, string> = {}
      for (const [id, lim] of limitesDelCircuito(d, lib, r)) {
        const e = excesoDe(l as LecturaCruda, id, lim, undefined)
        if (e) out[d.piezas[id].ref] = e.texto
      }
      return out
    }
    ver(sim.time(), { v: (red) => l.redes.get(con.redes.findIndex((x) => x.nombre === red))!, m: (ref) => l.piezas.get(idDe(ref))!, avisos })
  }
  sim.free()
}

/** Punto de operación: el estado a los `fin` segundos. */
function punto(partes: Parte[], fin = 0.08, h = 2e-5): Lectura {
  let ultimo!: Lectura
  correr(partes, fin, h, fin, (_t, l) => (ultimo = l))
  return ultimo
}

const regulador = (tipo: string, modelo: string, entrada: string, salida: string, tercero: string, idTercero = 'GND'): Parte => ({ tipo, ref: 'U1', props: { modelo }, pines: { IN: entrada, OUT: salida, [idTercero]: tercero } })

describe('reguladores 7805, 7812, 7905 y LM317 contra su hoja de datos', () => {
  const fijo = (tipo: string, modelo: string, vin: number, carga: string) => punto([DC('V1', String(vin), 'in'), R('RL', carga, 'out', '0'), regulador(tipo, modelo, 'in', 'out', '0')])

  it('7805: 5.0 V de salida (4.8 a 5.2 V), regulación de carga de 5 mA a 1 A bajo los 25 mV de la hoja y de línea de 8 a 25 V', () => {
    const ligera = fijo('regulador-positivo', '7805', 10, '1k')
    const plena = fijo('regulador-positivo', '7805', 10, '5')
    expect(ligera.v('out')).toBeGreaterThan(4.95)
    expect(ligera.v('out')).toBeLessThan(5.05)
    expect(Math.abs(ligera.v('out') - plena.v('out'))).toBeLessThan(0.025)
    expect(plena.m('U1').i).toBeCloseTo(1, 1)
    expect(Math.abs(fijo('regulador-positivo', '7805', 8, '50').v('out') - fijo('regulador-positivo', '7805', 25, '50').v('out'))).toBeLessThan(0.025)
  })

  it('7805: corriente en reposo de 3.2 mA típica (8 mA máx) con 10 V y caída de 2.0 V a 1 A', () => {
    const iq = Math.abs(fijo('regulador-positivo', '7805', 10, '1G').m('V1').i)
    expect(iq).toBeGreaterThan(2.7e-3)
    expect(iq).toBeLessThan(3.7e-3)
    // La salida mantiene los 4.9 V (100 mV debajo) con 2.1 V de caída y los pierde con 1.8 V.
    expect(fijo('regulador-positivo', '7805', 7.0, '4.9').v('out')).toBeGreaterThan(4.9)
    expect(fijo('regulador-positivo', '7805', 6.7, '4.9').v('out')).toBeLessThan(4.9)
  })

  it('7805: limita su corriente a unos 2.2 A (pico típico de la hoja) en un corto', () => {
    const corto = fijo('regulador-positivo', '7805', 10, '0.1')
    expect(corto.m('U1').i).toBeGreaterThan(1.8)
    expect(corto.m('U1').i).toBeLessThan(2.6)
  })

  it('7812: 12.0 V (11.5 a 12.5 V), reposo de 3.4 mA con 19 V y caída de 2.0 V', () => {
    const r = fijo('regulador-positivo', '7812', 19, '24')
    expect(r.v('out')).toBeGreaterThan(11.9)
    expect(r.v('out')).toBeLessThan(12.1)
    const iq = Math.abs(fijo('regulador-positivo', '7812', 19, '1G').m('V1').i)
    expect(iq).toBeGreaterThan(2.9e-3)
    expect(iq).toBeLessThan(3.9e-3)
    expect(fijo('regulador-positivo', '7812', 14.1, '11.9').v('out')).toBeGreaterThan(11.9)
    expect(fijo('regulador-positivo', '7812', 13.7, '11.9').v('out')).toBeLessThan(11.9)
  })

  it('7905: -5.0 V (-4.8 a -5.2 V), corriente de polarización de 4.3 mA con -10 V y caída de 1.3 V a 1 A', () => {
    const r = fijo('regulador-negativo', '7905', -10, '10')
    expect(r.v('out')).toBeLessThan(-4.95)
    expect(r.v('out')).toBeGreaterThan(-5.05)
    expect(r.m('U1').i).toBeCloseTo(-0.5, 1)
    const iq = Math.abs(fijo('regulador-negativo', '7905', -10, '1G').m('V1').i)
    expect(iq).toBeGreaterThan(3.8e-3)
    expect(iq).toBeLessThan(4.8e-3)
    expect(fijo('regulador-negativo', '7905', -6.4, '4.9').v('out')).toBeLessThan(-4.9)
    expect(fijo('regulador-negativo', '7905', -6.0, '4.9').v('out')).toBeGreaterThan(-4.9)
  })

  const lm317 = (vin: number, r1: string, r2: string, carga: string): Lectura =>
    punto([DC('V1', String(vin), 'in'), R('R1', r1, 'out', 'adj'), r2 === '0' ? R('R2', '1m', 'adj', '0') : R('R2', r2, 'adj', '0'), R('RL', carga, 'out', '0'), regulador('regulador-ajustable', 'LM317', 'in', 'out', 'adj', 'ADJ')])

  it('LM317: referencia de 1.25 V (1.2 a 1.3 V) entre salida y ajuste y Vout = 1.25 V · (1 + R2/R1) + 50 µA · R2', () => {
    const r = lm317(12, '240', '720', '100')
    expect(r.m('U1').v).toBeGreaterThan(1.2)
    expect(r.m('U1').v).toBeLessThan(1.3)
    // 5 V de la fórmula y los 36 mV de la corriente de ajuste de 50 µA sobre 720 Ω (la hoja da 50 µA típica y 100 µA máx).
    expect(r.v('out')).toBeCloseTo(1.25 * 4 + 50e-6 * 720, 1)
    const alto = lm317(40, '240', '6.8k', '100')
    expect(alto.v('out')).toBeCloseTo(1.25 * (1 + 6800 / 240) + 50e-6 * 6800, 0)
  })

  it('LM317: regulación de carga bajo el 0.5 % máximo de la hoja y de línea de 8 a 40 V bajo 0.04 %/V', () => {
    const ligera = lm317(15, '240', '720', '500')
    const plena = lm317(15, '240', '720', '5')
    expect(Math.abs(ligera.v('out') - plena.v('out')) / ligera.v('out')).toBeLessThan(0.005)
    const a = lm317(10, '240', '720', '100').v('out'), b = lm317(40, '240', '720', '100').v('out')
    expect(Math.abs(a - b) / a / 30).toBeLessThan(0.0004)
  })

  it('LM317: pide una carga mínima (3.5 mA típica, 10 mA máx): sin ella la salida sube, con 10 mA queda en 1.25 V', () => {
    expect(lm317(20, '240', '0', '1G').v('out')).toBeGreaterThan(1.4)
    expect(lm317(20, '120', '0', '1G').v('out')).toBeCloseTo(1.25, 1)
  })

  it('LM317: limita su corriente en un corto a unos 2.2 A (1.5 A mín de la hoja)', () => {
    const corto = lm317(15, '240', '720', '0.1')
    expect(corto.m('U1').i).toBeGreaterThan(1.5)
    expect(corto.m('U1').i).toBeLessThan(2.6)
  })

  it('la medición de un regulador es su salida, la corriente de carga y lo que disipa', () => {
    const r = fijo('regulador-positivo', '7805', 12, '10')
    const m = r.m('U1')
    expect(m.v).toBeCloseTo(5, 1)
    expect(m.i).toBeCloseTo(0.5, 1)
    // (12 - 5) V por 0.5 A y los 3.2 mA de reposo.
    expect(m.p).toBeCloseTo(7 * 0.5 + 0.0038 * 12, 0)
  })

  it('con un capacitor ideal de 10 µF y una carga de 5 Ω la salida no oscila', () => {
    let mn = 1e9, mx = -1e9
    correr([DC('V1', '10', 'in'), R('RL', '5', 'out', '0'), C('C1', '10u', 'out', '0'), regulador('regulador-positivo', '7805', 'in', 'out', '0')], 0.06, 5e-6, 1e-3, (t, l) => {
      if (t > 0.05) {
        mn = Math.min(mn, l.v('out'))
        mx = Math.max(mx, l.v('out'))
      }
    })
    expect(mx - mn).toBeLessThan(0.003)
    expect(mx).toBeCloseTo(5, 1)
  })
})

const AC = (ref: string, amplitud: string, frecuencia: string, mas: string, menos = '0'): Parte => ({ tipo: 'fuente-ac', ref, props: { amplitud, frecuencia }, pines: { '+': mas, '-': menos } })

describe('puente rectificador', () => {
  /** Pico y mínimo de la salida del puente con una fuente flotante de 10 V de pico a 60 Hz y 1 kΩ, con o sin filtro de 100 µF. */
  const salida = (modelo: string, filtro: boolean) => {
    let pico = -1e9, minimo = 1e9
    const partes = [AC('V1', '10', '60', '1', '2'), { tipo: 'puente-rectificador', ref: 'BR1', props: { modelo }, pines: { AC1: '1', AC2: '2', '+': 'out', '-': '0' } }, R('RL', '1k', 'out', '0'), ...(filtro ? [C('C1', '100u', 'out', '0')] : [])]
    correr(partes, 0.1, 2e-5, 5e-5, (t, l) => {
      if (t > 0.05) {
        pico = Math.max(pico, l.v('out'))
        minimo = Math.min(minimo, l.v('out'))
      }
    })
    return { pico, minimo }
  }

  it('rectifica la onda completa: el pico es el de la fuente menos dos caídas de diodo y sin filtro baja a casi cero', () => {
    const r = salida('1N4007', false)
    // Cada diodo cae entre 0.5 y 0.9 V a unos 9 mA (la hoja da 1.0 V máx a 1 A).
    expect(r.pico).toBeGreaterThan(10 - 2 * 0.9)
    expect(r.pico).toBeLessThan(10 - 2 * 0.5)
    expect(r.minimo).toBeLessThan(0.2)
    expect(r.minimo).toBeGreaterThan(-0.05)
  })

  it('con Schottky 1N5819 el pico es mayor que con 1N4007, y con el filtro de 100 µF el rizo es de menos de 1.5 V', () => {
    expect(salida('1N5819', false).pico).toBeGreaterThan(salida('1N4007', false).pico + 0.2)
    const f = salida('1N4007', true)
    expect(f.pico - f.minimo).toBeLessThan(1.5)
    expect(f.minimo).toBeGreaterThan(7)
  })

  it('la lectura del puente es la tensión entre su + y su −', () => {
    let m: Medicion | undefined
    correr([DC('V1', '10', 'a', 'b'), { tipo: 'puente-rectificador', ref: 'BR1', props: { modelo: '1N4007' }, pines: { AC1: 'a', AC2: 'b', '+': 'out', '-': '0' } }, R('RL', '1k', 'out', '0'), R('R0', '1M', 'b', '0')], 0.01, 2e-5, 0.01, (_t, l) => (m = l.m('BR1')))
    expect(m!.v).toBeGreaterThan(8)
    expect(m!.v).toBeLessThan(9.5)
  })
})

describe('puente rectificador dibujado y girado 90°', () => {
  // La disposición del usuario: fuente flotante de 20 V a 60 Hz entre las patas de arriba y abajo (AC, tras girar 90°), la pata de la
  // izquierda (−) a tierra y la de la derecha (+) a la carga. Conducía bien: el puente y su símbolo no tenían falla.
  const pieza = (id: string, tipo: string, ref: string, x: number, y: number, rot: 0 | 90, props: Record<string, string> = {}) => ({ id, tipo, ref, x, y, rot, espejo: false, props })
  const cable = (id: string, ...p: [number, number][]) => ({ id, puntos: p.map(([x, y]) => ({ x, y })) })
  const documento = (): Documento => ({
    ...documentoVacio(),
    piezas: {
      v: pieza('v', 'fuente-ac', 'V1', 2392, -1394, 0, { amplitud: '20', frecuencia: '60' }),
      br: pieza('br', 'puente-rectificador', 'BR1', 2406, -1394, 90, { modelo: '1N4007' }),
      r: pieza('r', 'resistencia', 'R1', 2414, -1388, 90, { valor: '1k' }),
      g: pieza('g', 'tierra', 'GND1', 2414, -1380, 0)
    },
    cables: {
      a: cable('a', [2392, -1398], [2392, -1402], [2406, -1402], [2406, -1400]),
      b: cable('b', [2392, -1390], [2392, -1386], [2406, -1386], [2406, -1388]),
      c: cable('c', [2400, -1394], [2398, -1394], [2398, -1382], [2414, -1382]),
      d: cable('d', [2412, -1394], [2414, -1394], [2414, -1392]),
      e: cable('e', [2414, -1384], [2414, -1382]),
      f: cable('f', [2414, -1382], [2414, -1380])
    }
  })

  it('conduce: la carga llega a casi el pico de la fuente menos dos caídas de diodo', () => {
    let pico = -1e9
    correrDocumento(documento(), 0.05, 2e-5, 5e-4, (t, l) => {
      if (t > 0.02) pico = Math.max(pico, l.m('R1').v)
    })
    expect(pico).toBeGreaterThan(20 - 2 * 0.9)
    expect(pico).toBeLessThan(20 - 2 * 0.5)
  })
})

const SCR = (anodo: string, catodo: string, compuerta: string): Parte => ({ tipo: 'scr', ref: 'Q1', props: { modelo: '2N5060' }, pines: { A: anodo, K: catodo, G: compuerta } })
const PULSO = (ref: string, alto: string, frecuencia: string, ciclo: string, mas: string): Parte => ({ tipo: 'fuente-pulso', ref, props: { alto, frecuencia, ciclo }, pines: { '+': mas, '-': '0' } })

describe('SCR 2N5060 contra su hoja de datos', () => {
  /** El SCR con 7 V y una carga, y un pulso de compuerta de 2.5 ms por 10 kΩ: voltaje y corriente de ánodo con el pulso (a 2 ms) y sin él (a 8 ms). */
  const ciclo = (vs: string, carga: string, vpulso: string, rd = '10k') => {
    const dato: { v?: number; v2?: number; i2?: number } = {}
    correr([DC('VS', vs, 'vs'), R('RL', carga, 'vs', 'a'), SCR('a', '0', 'g'), PULSO('VP', vpulso, '100', '25 %', 'p'), R('RD', rd, 'p', 'g')], 8e-3, 5e-6, 2e-3, (t, l) => {
      if (Math.abs(t - 2e-3) < 1e-9) dato.v = l.v('a')
      if (Math.abs(t - 8e-3) < 1e-9) {
        dato.v2 = l.v('a')
        dato.i2 = l.m('Q1').i
      }
    })
    return dato
  }

  it('dispara con menos de los 200 µA de la hoja (VAK = 7 V, RL = 100 Ω) y no con 30 µA', () => {
    // La corriente de compuerta es (V - 0.65 V) / 10 kΩ.
    expect(ciclo('7', '100', '3.65').v!).toBeLessThan(2)
    expect(ciclo('7', '100', '0.95').v!).toBeGreaterThan(6.5)
  })

  it('con la compuerta en 0.8 V o menos de la hoja, y se queda encendido sin ella si la corriente pasa de los 5 mA de mantenimiento', () => {
    let vg = 0
    correr([DC('VS', '7', 'vs'), R('RL', '100', 'vs', 'a'), SCR('a', '0', 'g'), DC('VG', '2.1', 'p'), R('RD', '10k', 'p', 'g')], 2e-3, 5e-6, 2e-3, (_t, l) => (vg = l.v('g')))
    expect(vg).toBeLessThan(0.8)
    // 7 V con 1 kΩ dan unos 6 mA: más que los 5 mA máximos de IH de la hoja (con 1 kΩ de compuerta a cátodo), así que debe quedarse encendido.
    expect(ciclo('7', '1k', '5', '1k').v2!).toBeLessThan(2)
    expect(ciclo('7', '100', '5', '1k').v2!).toBeLessThan(2)
  })

  it('se apaga si la corriente baja de su mantenimiento al quitar la compuerta (1.2 mA con 5 kΩ)', () => {
    const r = ciclo('7', '5k', '5', '1k')
    expect(r.v!).toBeLessThan(2)
    expect(r.v2!).toBeGreaterThan(6.5)
  })

  it('cae menos de 1.7 V (VTM de la hoja) a 1.2 A y bloquea con 30 V y 1 kΩ de compuerta a cátodo con menos de 10 µA', () => {
    const r = ciclo('3.2', '1.5', '3.65')
    expect(r.v2!).toBeLessThan(1.7)
    expect(r.i2!).toBeGreaterThan(1.1)
    const b = punto([DC('VS', '30', 'vs'), R('RL', '1k', 'vs', 'a'), SCR('a', '0', 'g'), R('RGK', '1k', 'g', '0')], 4e-3, 5e-6)
    expect(Math.abs(b.m('Q1').i)).toBeLessThan(10e-6)
  })
})

describe('triac BT136 y BT137', () => {
  const TRIAC = (mt2: string, g: string, modelo = 'BT136'): Parte => ({ tipo: 'triac', ref: 'Q1', props: { modelo }, pines: { MT2: mt2, MT1: '0', G: g } })
  /** El triac con `vs` y una carga, y un pulso de compuerta de 2.5 ms (`vpulso` por `rd`): voltaje de MT2 con el pulso (a 2 ms) y sin él (a 8 ms). */
  const ciclo = (vs: string, carga: string, vpulso: string, rd: string, modelo = 'BT136') => {
    const dato: { v?: number; v2?: number; i2?: number } = {}
    correr([DC('VS', vs, 'vs'), R('RL', carga, 'vs', 'a'), TRIAC('a', 'g', modelo), PULSO('VP', vpulso, '100', '25 %', 'p'), R('RD', rd, 'p', 'g')], 8e-3, 5e-6, 2e-3, (t, l) => {
      if (Math.abs(t - 2e-3) < 1e-9) dato.v = l.v('a')
      if (Math.abs(t - 8e-3) < 1e-9) {
        dato.v2 = l.v('a')
        dato.i2 = l.m('Q1').i
      }
    })
    return dato
  }
  /** Resistencia de compuerta que da `mA` con un pulso de ±30 V (la compuerta cae cerca de 1 V). */
  const rd = (mA: number) => String(29 / (mA / 1000))

  it('dispara en los tres cuadrantes con menos de los 5 mA máximos de la hoja (T2+ G+, T2+ G−, T2− G−) y no con 0.5 mA', () => {
    for (const [vs, vp] of [['12', '30'], ['12', '-30'], ['-12', '-30']] as const) {
      expect(Math.abs(ciclo(vs, '100', vp, rd(5)).v!), `${vs} ${vp} con 5 mA`).toBeLessThan(2)
      expect(Math.abs(ciclo(vs, '100', vp, rd(0.5)).v!), `${vs} ${vp} con 0.5 mA`).toBeGreaterThan(11)
    }
  })

  it('con T2+ G+ dispara desde unos 1.5 mA (2 mA típica) y con T2− G+ la compuerta no dispara (cuadrante no modelado)', () => {
    expect(ciclo('12', '100', '30', rd(2)).v!).toBeLessThan(2)
    expect(Math.abs(ciclo('-12', '100', '30', rd(10)).v!)).toBeGreaterThan(11)
  })

  it('sigue encendido sin compuerta con 17 mA y se apaga con 1.7 mA (mantenimiento de unos 3.4 mA, 10 mA máx en la hoja)', () => {
    for (const [vs, vp] of [['12', '30'], ['-12', '-30']] as const) {
      expect(Math.abs(ciclo(vs, '600', vp, rd(10)).v2!), `${vs} con 17 mA`).toBeLessThan(2)
      expect(Math.abs(ciclo(vs, '6k', vp, rd(10)).v2!), `${vs} con 1.7 mA`).toBeGreaterThan(11)
    }
  })

  it('cae menos de 1.7 V a 5 A (BT136) y el BT137 cae menos que el BT136 con 8 A', () => {
    const a5 = ciclo('9', '1.47', '30', rd(20))
    expect(a5.v2!).toBeGreaterThan(0.8)
    expect(a5.v2!).toBeLessThan(1.7)
    expect(a5.i2!).toBeGreaterThan(4.8)
    const b136 = ciclo('9', '0.92', '30', rd(20), 'BT136').v2!
    const b137 = ciclo('9', '0.92', '30', rd(20), 'BT137').v2!
    expect(b137).toBeLessThan(b136)
    expect(b137).toBeLessThan(2)
  })

  it('bloquea ±400 V con la compuerta al aire o unida a MT1, con menos de 1 µA, sin dispararse sola', () => {
    for (const vs of ['400', '-400']) {
      for (const g of ['1G', '1']) {
        const b = punto([DC('VS', vs, 'a'), TRIAC('a', 'g'), R('RG', g, 'g', '0')], 4e-3, 5e-6)
        expect(Math.abs(b.m('Q1').i), `${vs} con ${g} Ω`).toBeLessThan(1e-6)
      }
    }
  })

  it('con 12 V alterna de 60 Hz y un pulso de compuerta por semiciclo conduce en los dos sentidos, y sin pulso no conduce', () => {
    let pico = -1e9, valle = 1e9
    correr([AC('V1', '12', '60', 'vs'), R('RL', '100', 'vs', 'a'), TRIAC('a', 'g'), PULSO('VP', '30', '60', '4 %', 'p'), R('RD', rd(10), 'p', 'g')], 0.05, 1e-5, 1e-4, (t, l) => {
      if (t > 0.02) {
        pico = Math.max(pico, l.m('Q1').i)
        valle = Math.min(valle, l.m('Q1').i)
      }
    })
    // El pulso de +30 V solo dispara en el semiciclo positivo (T2+ G+): con el negativo no hay disparo (T2− G+ no se modela).
    expect(pico).toBeGreaterThan(0.08)
    expect(valle).toBeGreaterThan(-0.002)
  })
})

describe('transformador', () => {
  const T = (props: Record<string, string>, p2 = '0', s1 = 's', s2 = '0'): Parte => ({ tipo: 'transformador', ref: 'T1', props, pines: { P1: 'p', P2: p2, S1: s1, S2: s2 } })
  /** Pico del voltaje de `red` (por defecto el secundario) tras asentarse, con la fuente de `pico` V a 60 Hz y `carga`. */
  const pico = (props: Record<string, string>, fuente: string, carga: string, s1 = 's', s2 = '0') => {
    let max = -1e9, min = 1e9
    correr([AC('V1', fuente, '60', 'p'), T(props, '0', s1, s2), R('RL', carga, 's', '0')], 0.1, 2e-5, 1e-4, (t, l) => {
      if (t > 0.05) {
        max = Math.max(max, l.v('s'))
        min = Math.min(min, l.v('s'))
      }
    })
    return { max, min }
  }

  it('10:1 con la red de 170 V de pico: da cerca de 17 V de pico en el secundario (un poco menos con k = 0.98 y carga)', () => {
    const r = pico({ relacion: '10:1', l1: '10', k: '0.98' }, '170', '100')
    expect(r.max).toBeGreaterThan(15)
    expect(r.max).toBeLessThan(17)
    expect(r.min).toBeGreaterThan(-17)
    expect(r.min).toBeLessThan(-15)
  })

  it('1:5 eleva: 10 V de pico dan unos 49 V con poca carga, y 1:1 con k = 0.999 sigue al primario', () => {
    const e = pico({ relacion: '1:5', l1: '5', k: '0.999' }, '10', '100k')
    expect(e.max).toBeGreaterThan(48)
    expect(e.max).toBeLessThan(50.5)
    const u = pico({ relacion: '1:1', l1: '10', k: '0.999' }, '10', '10k')
    expect(u.max).toBeGreaterThan(9.7)
    expect(u.max).toBeLessThan(10.01)
  })

  it('el punto marca la polaridad: con S1 y S2 intercambiados el secundario sale invertido', () => {
    let a = 0, b = 0
    correr([AC('V1', '10', '60', 'p'), T({ relacion: '1:1', l1: '10', k: '0.99' }), R('RL', '10k', 's', '0')], 0.0042, 1e-5, 0.0042, (_t, l) => (a = l.v('s')))
    correr([AC('V1', '10', '60', 'p'), T({ relacion: '1:1', l1: '10', k: '0.99' }, '0', '0', 's'), R('RL', '10k', 's', '0')], 0.0042, 1e-5, 0.0042, (_t, l) => (b = l.v('s')))
    // A un cuarto de periodo la fuente está en su pico.
    expect(a).toBeGreaterThan(9)
    expect(b).toBeLessThan(-9)
  })

  it('con un puente y 100 µF rectifica el secundario: la salida queda cerca del pico menos dos diodos', () => {
    let salida = 0, minimo = 1e9
    correr([AC('V1', '170', '60', 'p'), T({ relacion: '10:1', l1: '10', k: '0.98' }, '0', 'a', 'b'), { tipo: 'puente-rectificador', ref: 'BR1', props: { modelo: '1N4007' }, pines: { AC1: 'a', AC2: 'b', '+': 'out', '-': '0' } }, C('C1', '1000u', 'out', '0'), R('RL', '1k', 'out', '0')], 0.25, 5e-5, 1e-3, (t, l) => {
      if (t > 0.15) {
        salida = Math.max(salida, l.v('out'))
        minimo = Math.min(minimo, l.v('out'))
      }
    })
    expect(salida).toBeGreaterThan(12)
    expect(salida).toBeLessThan(15.5)
    expect(salida - minimo).toBeLessThan(2.5)
  }, 30_000)

  it('el aviso de una isla sin tierra sigue funcionando: un secundario sin referencia a tierra se dice', () => {
    const d = conEtiquetas(lib, [AC('V1', '10', '60', 'p'), T({ relacion: '1:1' }, '0', 's1', 's2'), R('RL', '1k', 's1', 's2')])
    const con = calcularConexiones(d, lib)
    const aviso = avisosDelCircuito(d, con, lib).map((a) => a.texto).join(' | ')
    expect(aviso).toMatch(/no tienen camino a tierra/)
    // Y dice el remedio: unir S2 a tierra (o el extremo común de la carga), no solo que falta.
    expect(aviso).toContain('une a tierra el extremo común de la carga (S2 en el secundario, P2 en el primario)')
    // El error de la netlist lleva el mismo remedio; con S2 a tierra ya no hay ninguno.
    expect(compilarNetlist(d, lib, con).errores.join(' | ')).toContain('S2 en el secundario')
    const unido = conEtiquetas(lib, [AC('V1', '10', '60', 'p'), T({ relacion: '1:1' }, '0', 's1', '0'), R('RL', '1k', 's1', '0')])
    expect(compilarNetlist(unido, lib, calcularConexiones(unido, lib)).errores).toEqual([])
  })
})

describe('diac DB3 y DB4 contra su hoja de datos', () => {
  const DIAC = (modelo: string): Parte => ({ tipo: 'diac', ref: 'D1', props: { modelo }, pines: { A1: 'a', A2: '0' } })
  const con = (modelo: string, v: number) => punto([DC('VS', String(v), 'vs'), R('RL', '1k', 'vs', 'a'), DIAC(modelo)], 4e-3, 5e-6)

  it('DB3: no conduce con 25 V (IBO bajo 50 µA), conduce con 38 V y cae al menos 5 V respecto de su ruptura', () => {
    const bajo = con('DB3', 25)
    expect(Math.abs(bajo.m('D1').i)).toBeLessThan(50e-6)
    const alto = con('DB3', 38)
    // VBO máx de 36 V y ΔV mín de 5 V: queda bajo 31 V, y de verdad conduce unos mA.
    expect(alto.v('a')).toBeLessThan(31)
    expect(Math.abs(alto.m('D1').i)).toBeGreaterThan(5e-3)
  })

  it('DB3: ruptura simétrica entre 28 y 36 V y diferencia de polaridades de menos de 3 V', () => {
    const rompe = (v: number) => Math.abs(con('DB3', v).m('D1').i) > 2e-3
    expect(rompe(27)).toBe(false)
    expect(rompe(36)).toBe(true)
    expect(rompe(-27)).toBe(false)
    expect(rompe(-36)).toBe(true)
    let positivo = 0, negativo = 0
    for (let v = 28; v <= 36; v += 0.5) {
      if (!positivo && rompe(v)) positivo = v
      if (!negativo && rompe(-v)) negativo = v
    }
    expect(Math.abs(positivo - negativo)).toBeLessThan(3)
    expect(positivo).toBeGreaterThan(28)
  })

  it('DB4: ruptura entre 35 y 45 V', () => {
    expect(Math.abs(con('DB4', 34).m('D1').i)).toBeLessThan(50e-6)
    expect(Math.abs(con('DB4', 46).m('D1').i)).toBeGreaterThan(5e-3)
    expect(con('DB4', 46).v('a')).toBeLessThan(40)
  })
})

describe('ULN2003A contra su hoja de datos', () => {
  const CANALES = ['1B', '2B', '3B', '4B', '5B', '6B', '7B', '1C', '2C', '3C', '4C', '5C', '6C', '7C', 'COM']
  /** El ULN2003A con E en tierra; lo que no se nombra queda en una red propia (al aire). */
  const uln = (pines: Record<string, string>): Parte => ({ tipo: 'uln2003', ref: 'U1', props: { modelo: 'ULN2003A' }, pines: { E: '0', ...Object.fromEntries(CANALES.map((p) => [p, `aire_${p}`])), ...pines } })
  const corriente = (ref: string, amperes: string, nodo: string): Parte => ({ tipo: 'fuente-corriente', ref, props: { corriente: amperes }, pines: { entrada: '0', salida: nodo } })
  /** VCE con la corriente de entrada de la hoja y una carga que da la de colector (desde 12 V). */
  const vce = (ii: string, ic: number) => punto([DC('VS', '12', 'vs'), R('RL', String((12 - 1) / ic), 'vs', 'c'), corriente('I1', ii, 'b'), uln({ '1B': 'b', '1C': 'c' })], 2e-3, 1e-5).v('c')

  it('VCE(sat) bajo los máximos de la hoja: 1.1 V (250 µA, 100 mA), 1.3 V (350 µA, 200 mA) y 1.6 V (500 µA, 350 mA)', () => {
    const a = vce('250u', 0.1), b = vce('350u', 0.2), c = vce('500u', 0.35)
    expect(a).toBeLessThan(1.1)
    expect(b).toBeLessThan(1.3)
    expect(c).toBeLessThan(1.6)
    // Y cerca de los 0.9, 1.0 y 1.2 V típicos a los que se ajustó.
    expect(Math.abs(a - 0.9)).toBeLessThan(0.1)
    expect(Math.abs(b - 1.0)).toBeLessThan(0.1)
    expect(Math.abs(c - 1.2)).toBeLessThan(0.1)
  })

  it('corriente de entrada con 3.85 V entre 0.5 y los 1.35 mA máximos de la hoja (0.93 mA típica), y enciende con los 2.4 V de VI(on) a 200 mA', () => {
    const r = punto([DC('VI', '3.85', 'b'), DC('VS', '12', 'vs'), R('RL', '100', 'vs', 'c'), uln({ '1B': 'b', '1C': 'c' })], 2e-3, 1e-5)
    expect(-r.m('VI').i).toBeGreaterThan(0.5e-3)
    expect(-r.m('VI').i).toBeLessThan(1.35e-3)
    const on = punto([DC('VI', '2.4', 'b'), DC('VS', '12', 'vs'), R('RL', '50', 'vs', 'c'), uln({ '1B': 'b', '1C': 'c' })], 2e-3, 1e-5)
    expect(on.v('c')).toBeLessThan(2)
  })

  it('apagado fuga menos de los 50 µA de ICEX con 50 V, y con la entrada al aire queda apagado', () => {
    const r = punto([DC('VS', '50', 'vs'), R('RL', '1k', 'vs', 'c'), uln({ '1C': 'c' })], 2e-3, 1e-5)
    expect(Math.abs(r.m('VS').i)).toBeLessThan(50e-6)
    expect(r.v('c')).toBeGreaterThan(49.9)
  })

  it('el diodo de bloqueo al común cae 1.7 V típico (2.0 V máx) a 350 mA', () => {
    // 1C es el ánodo y COM, el cátodo: la corriente sale por 1C hacia COM.
    const r = punto([DC('VS', '12', 'vs'), R('RL', String((12 - 1.7) / 0.35), 'vs', 'c'), uln({ '1C': 'c', COM: '0' })], 2e-3, 1e-5)
    expect(r.v('c')).toBeGreaterThan(1.4)
    expect(r.v('c')).toBeLessThan(2.0)
  })

  it('los siete canales son independientes: con 3B y 7B en alto solo 3C y 7C bajan', () => {
    const r = punto([DC('VS', '12', 'vs'), DC('VI', '5', 'in'), R('R2', '1k', 'vs', 'c2'), R('R3', '1k', 'vs', 'c3'), R('R7', '1k', 'vs', 'c7'), uln({ '3B': 'in', '7B': 'in', '2C': 'c2', '3C': 'c3', '7C': 'c7' })], 2e-3, 1e-5)
    expect(r.v('c3')).toBeLessThan(1.2)
    expect(r.v('c7')).toBeLessThan(1.2)
    expect(r.v('c2')).toBeGreaterThan(11.9)
  })

  it('un canal con su entrada y su salida al aire no entra a la netlist; con una de las dos conectada, sí', () => {
    const elementos = (pines: Record<string, string>) => {
      const d = conEtiquetas(lib, [DC('VS', '12', 'vs'), R('RL', '1k', 'vs', 'c'), uln({ COM: 'vs', ...pines })])
      const r = compilarNetlist(d, lib, calcularConexiones(d, lib))
      expect(r.errores).toEqual([])
      return r.netlist!.elements.length
    }
    // Un canal son cinco elementos (la resistencia de entrada, los dos transistores, la de base a emisor y el diodo); el primero lleva además la de su colector.
    expect(elementos({ '1C': 'c' })).toBe(2 + 6)
    expect(elementos({ '1C': 'c', '2B': 'vs' })).toBe(2 + 6 + 5)
    expect(elementos({ '1C': 'c', '2B': 'vs', '2C': 'c' })).toBe(2 + 6 + 5)
  })
})

describe('potenciómetro con ley y reóstato', () => {
  const pot = (posicion: string, ley: string): Parte => ({ tipo: 'potenciometro', ref: 'RV1', props: { valor: '10k', posicion, ley }, pines: { '1': 'a', '2': '0', '3': 'cur' } })
  /** Voltaje del cursor con 10 V en el pin 1 y el pin 2 a tierra, sin carga: 10 V · (1 - fracción del valor entre el pin 1 y el cursor). */
  const cursor = (posicion: string, ley: string) => punto([DC('V1', '10', 'a'), pot(posicion, ley), R('RC', '1G', 'cur', '0')], 2e-3, 1e-5).v('cur')

  it('la ley lineal es la de siempre y la logarítmica deja el 15 % del valor a mitad del giro', () => {
    expect(cursor('50 %', 'lineal')).toBeCloseTo(5, 2)
    expect(cursor('50 %', 'logarítmica')).toBeCloseTo(8.5, 2)
    // 10 % del giro: 3 % del valor; 90 %: 15 % + 1.7 · 40 % = 83 %.
    expect(cursor('10 %', 'logarítmica')).toBeCloseTo(9.7, 2)
    expect(cursor('90 %', 'logarítmica')).toBeCloseTo(1.7, 2)
  })

  it('la antilogarítmica es su espejo: 85 % del valor a mitad del giro', () => {
    expect(cursor('50 %', 'antilogarítmica')).toBeCloseTo(1.5, 2)
    // 10 % del giro: 1 - log(0.9) = 1 - (0.15 + 1.7 · 0.4) = 17 % del valor, que deja 8.3 V.
    expect(cursor('10 %', 'antilogarítmica')).toBeCloseTo(8.3, 2)
  })

  const reostato = (posicion: string, ley = 'lineal'): Parte => ({ tipo: 'reostato', ref: 'RV1', props: { valor: '10k', posicion, ley }, pines: { '1': 'a', '2': 'b' } })
  const corriente = (posicion: string, ley?: string) => Math.abs(punto([DC('V1', '10', 'a'), reostato(posicion, ley), R('R1', '5k', 'b', '0')], 2e-3, 1e-5).m('RV1').i)

  it('el reóstato vale el total por la fracción de la posición, con el mínimo de un tramo en el extremo', () => {
    expect(corriente('50 %')).toBeCloseTo(10 / 10e3, 6)
    expect(corriente('100 %')).toBeCloseTo(10 / 15e3, 6)
    expect(corriente('0 %')).toBeCloseTo(10 / (5e3 + 10), 6)
    expect(corriente('50 %', 'logarítmica')).toBeCloseTo(10 / (5e3 + 1.5e3), 6)
  })
})

describe('cristal de cuarzo (Butterworth-Van Dyke)', () => {
  const modelos = (lib.get('cristal')!.modelo as unknown as { modelos: Record<string, { l1: number; c1: number; r1: number; c0: number }> }).modelos
  const nominal: Record<string, number> = { '32.768 kHz': 32768, '4 MHz': 4e6, '8 MHz': 8e6, '16 MHz': 16e6 }

  it('la resonancia serie de L1 y C1 cae en la frecuencia nominal de cada opción (0.01 %)', () => {
    for (const [nombre, f] of Object.entries(nominal)) {
      const m = modelos[nombre]
      const fs = 1 / (2 * Math.PI * Math.sqrt(m.l1 * m.c1))
      expect(Math.abs(fs - f) / f, nombre).toBeLessThan(1e-4)
    }
  })

  it('las cifras de la hoja: C0 de 1 pF y C1 de 3.4 fF del 32.768 kHz (ESR 55 kΩ, 70 kΩ máx) y C0 bajo los 7 pF y ESR bajo los 80 Ω del HC-49/US de 8 MHz', () => {
    expect(modelos['32.768 kHz'].c1).toBeCloseTo(3.4e-15, 18)
    expect(modelos['32.768 kHz'].c0).toBeCloseTo(1e-12, 15)
    expect(modelos['32.768 kHz'].r1).toBeLessThanOrEqual(70e3)
    expect(modelos['8 MHz'].c0).toBeLessThanOrEqual(7e-12)
    expect(modelos['8 MHz'].r1).toBeLessThanOrEqual(80)
  })

  it('con un escalón la rama motional suena a los 8 MHz de su resonancia serie', () => {
    const cruces: number[] = []
    let antes = 0
    correr([DC('V1', '1', 's'), R('R1', '50', 's', 'a'), { tipo: 'cristal', ref: 'Y1', props: { modelo: '8 MHz' }, pines: { '1': 'a', '2': '0' } }], 2e-6, 2e-9, 2e-9, (t, l) => {
      const i = l.m('Y1').i
      if (antes < 0 && i >= 0) cruces.push(t)
      antes = i
    })
    // De la primera a la última subida por cero hay (n - 1) periodos.
    const f = (cruces.length - 1) / (cruces[cruces.length - 1] - cruces[0])
    expect(cruces.length).toBeGreaterThan(10)
    expect(Math.abs(f - 8e6) / 8e6).toBeLessThan(0.005)
  })
})

describe('resistencia serie de un capacitor, una bobina y una batería', () => {
  it('el ESR limita la corriente inicial de un capacitor: 10 V por 10 Ω y 10 Ω de ESR dan 0.5 A y no 1 A', () => {
    const corriente = (esr: string) => {
      let i = 0
      correr([DC('V1', '10', 'a'), R('R1', '10', 'a', 'b'), { tipo: 'capacitor', ref: 'C1', props: { valor: '100u', esr }, pines: { '1': 'b', '2': '0' } }], 1e-6, 1e-7, 1e-6, (_t, l) => (i = Math.abs(l.m('C1').i)))
      return i
    }
    expect(corriente('0')).toBeCloseTo(1, 1)
    expect(corriente('10')).toBeCloseTo(0.5, 1)
  })

  it('la lectura del capacitor es la de sus dos terminales, con el ESR dentro', () => {
    let v = 0
    correr([DC('V1', '10', 'a'), R('R1', '10', 'a', 'b'), { tipo: 'capacitor-electrolitico', ref: 'C1', props: { valor: '100u', voltaje: '25 V', esr: '10' }, pines: { '+': 'b', '-': '0' } }], 1e-6, 1e-7, 1e-6, (_t, l) => (v = l.m('C1').v))
    // 10 V repartidos en 10 Ω y 10 Ω de ESR con el capacitor aún vacío: 5 V en los terminales.
    expect(v).toBeCloseTo(5, 1)
  })

  it('la resistencia del alambre de una bobina de 10 mH baja la corriente continua: 10 V, 5 Ω y 5 Ω dan 1 A', () => {
    const r = punto([DC('V1', '10', 'a'), R('R1', '5', 'a', 'b'), { tipo: 'inductor', ref: 'L1', props: { valor: '10m', dcr: '5' }, pines: { '1': 'b', '2': '0' } }], 0.02, 1e-5)
    expect(Math.abs(r.m('L1').i)).toBeCloseTo(1, 2)
  })

  it('la resistencia interna de una batería de 9 V con 2 Ω y una carga de 18 Ω da 8.1 V en sus terminales', () => {
    const r = punto([{ tipo: 'bateria', ref: 'B1', props: { voltaje: '9', rint: '2' }, pines: { '+': 'a', '-': '0' } }, R('RL', '18', 'a', '0')])
    expect(r.v('a')).toBeCloseTo(8.1, 2)
    expect(r.m('B1').v).toBeCloseTo(8.1, 2)
    expect(Math.abs(r.m('B1').i)).toBeCloseTo(0.45, 2)
  })

  it('sin resistencia en serie (por omisión) las tres piezas son las de siempre', () => {
    const r = punto([{ tipo: 'bateria', ref: 'B1', props: { voltaje: '9' }, pines: { '+': 'a', '-': '0' } }, R('RL', '18', 'a', '0')])
    expect(r.v('a')).toBeCloseTo(9, 4)
  })
})

describe('fuente trifásica', () => {
  const trifasica = (a: Parte[] = []): Parte[] => [
    { tipo: 'fuente-trifasica', ref: 'VT1', props: { amplitud: '180', frecuencia: '60' }, pines: { A: 'a', B: 'b', C: 'c', N: '0' } },
    R('RA', '1k', 'a', '0'), R('RB', '1k', 'b', '0'), R('RC', '1k', 'c', '0'), ...a
  ]

  it('tres senoidales de 180 V de pico con 120° de diferencia: a un cuarto de ciclo A está en el pico y B y C en menos medio pico', () => {
    let l!: Lectura
    correr(trifasica(), 1 / 240, 1e-5, 1 / 240, (_t, x) => (l = x))
    expect(l.v('a')).toBeCloseTo(180, 0)
    expect(l.v('b')).toBeCloseTo(-90, 0)
    expect(l.v('c')).toBeCloseTo(-90, 0)
  })

  it('las tres suman cero siempre y entre fases hay raíz de tres veces el voltaje de fase (311.8 V de pico: 220 V eficaces)', () => {
    let suma = 0, ab = 0
    correr(trifasica(), 1 / 60, 1e-5, 1e-4, (_t, l) => {
      suma = Math.max(suma, Math.abs(l.v('a') + l.v('b') + l.v('c')))
      ab = Math.max(ab, Math.abs(l.v('a') - l.v('b')))
    })
    expect(suma).toBeLessThan(1e-3)
    expect(ab).toBeCloseTo(180 * Math.sqrt(3), 0)
  })

  const armar = (frecuencia: string) => {
    const d = conEtiquetas(lib, trifasica().map((x) => (x.tipo === 'fuente-trifasica' ? { ...x, props: { ...x.props, frecuencia } } : x)))
    return compilarNetlist(d, lib, calcularConexiones(d, lib))
  }

  it('pide una frecuencia mayor que cero como la fuente senoidal: 0 y los negativos son error', () => {
    for (const f of ['0', '-60']) {
      const r = armar(f)
      expect(r.errores, f).toEqual(['La frecuencia de VT1 debe ser mayor que cero.'])
      expect(r.netlist, f).toBeNull()
    }
    expect(armar('60').errores).toEqual([])
  })

  it('avisa una sola vez si la frecuencia es más rápida de lo que la vista previa puede seguir, y la netlist se arma igual', () => {
    const r = armar('50M')
    expect(r.errores).toEqual([])
    expect(r.netlist).not.toBeNull()
    expect(r.avisos).toEqual(['La fuente VT1 de 50 MHz es más rápida de lo que la vista previa puede seguir.'])
    expect(armar('1k').avisos).toEqual([])
  })

  it('el orden de fases es A, B, C: B pasa por su pico un tercio de ciclo después que A', () => {
    let tB = 0, pico = 0
    correr(trifasica(), 1 / 60, 1e-5, 1e-4, (t, l) => {
      if (l.v('b') > pico) {
        pico = l.v('b')
        tB = t
      }
    })
    // A tiene su pico a 1/240 s; B, a 1/240 + 1/180 s.
    expect(tB).toBeCloseTo(1 / 240 + 1 / 180, 3)
  })
})

describe('límites de las piezas compuestas (ULN2003 y reguladores)', () => {
  const ULN = (extra: Parte[]): Parte[] => [
    DC('V1', '5', 'vi'), DC('V2', '24', 'vs'),
    { tipo: 'uln2003', ref: 'U1', props: {}, pines: { '1B': 'b1', '1C': 'c1', '2B': 'b2', '2C': 'c2', ...Object.fromEntries([3, 4, 5, 6, 7].flatMap((k) => [[`${k}B`, `x${k}b`], [`${k}C`, `x${k}c`]])), E: '0', COM: 'vs' } },
    R('RB1', '1k', 'vi', 'b1'), R('RB2', '1k', 'vi', 'b2'), ...extra
  ]

  it('ULN2003: avisa con más de 500 mA en un canal y dice cuál; el otro canal no avisa', () => {
    // Canal 1 con 24 V sobre 20 Ω (cerca de 1 A); canal 2 con 24 V sobre 240 Ω (cerca de 100 mA).
    const l = punto(ULN([R('RL1', '20', 'vs', 'c1'), R('RL2', '240', 'vs', 'c2')]), 0.02, 1e-4)
    const a = l.avisos()
    expect(a.U1).toMatch(/^canal 1: \d+(\.\d+)? m?A, máximo 500 mA$/)
  })

  it('ULN2003: con 100 mA por canal no avisa', () => {
    expect(punto(ULN([R('RL1', '240', 'vs', 'c1'), R('RL2', '240', 'vs', 'c2')]), 0.02, 1e-4).avisos().U1).toBeUndefined()
  })

  it('regulador 7805: normal no avisa; con la entrada en corto y la salida a 5 V avisa la salida sobre la entrada', () => {
    const reg = (vin: string, vout: string) => [DC('V1', vin, 'in'), DC('V2', vout, 'ext'), R('RS', '10', 'ext', 'out'), { tipo: 'regulador-positivo', ref: 'U1', props: { modelo: '7805' }, pines: { IN: 'in', OUT: 'out', GND: '0' } } as Parte]
    expect(punto(reg('10', '0'), 0.02, 1e-5).avisos().U1).toBeUndefined()
    const a = punto(reg('0', '5'), 0.02, 1e-5).avisos()
    expect(a.U1).toMatch(/^salida sobre la entrada: \d(\.\d+)? V, máximo 600 mV$/)
  })

  it('regulador 7905: lo mismo con voltajes negativos', () => {
    const reg = (vin: string, vout: string) => [DC('V1', vin, 'in'), DC('V2', vout, 'ext'), R('RS', '10', 'ext', 'out'), { tipo: 'regulador-negativo', ref: 'U1', props: { modelo: '7905' }, pines: { IN: 'in', OUT: 'out', GND: '0' } } as Parte]
    expect(punto(reg('-10', '0'), 0.02, 1e-5).avisos().U1).toBeUndefined()
    expect(punto(reg('0', '-5'), 0.02, 1e-5).avisos().U1).toMatch(/^salida sobre la entrada/)
  })
})

describe('referencia TL431 contra su hoja de datos', () => {
  const tl431 = (k: string, ref: string, a = '0'): Parte => ({ tipo: 'tl431', ref: 'U1', props: { modelo: 'TL431' }, pines: { K: k, A: a, REF: ref } })
  /** K unido a REF y alimentado desde 12 V por `r`: la prueba de la hoja (Figura 7-1). */
  const vka = (r: string) => punto([DC('V1', '12', 'vcc'), R('R1', r, 'vcc', 'k'), tl431('k', 'k')], 0.2, 1e-4)

  it('VKA = Vref con 10 mA: 2.495 V típicos dentro de los 2.44 a 2.55 V de la hoja, y con 1 mA, la corriente mínima de regulación, sigue dentro', () => {
    const a = vka('950').v('k'), b = vka('9.5k').v('k')
    expect(Math.abs(a - 2.495)).toBeLessThan(0.005)
    for (const v of [a, b]) {
      expect(v).toBeGreaterThan(2.44)
      expect(v).toBeLessThan(2.55)
    }
  })

  it('la corriente de REF con 10 kΩ de K a REF es de 2 µA típica, bajo los 4 µA máximos', () => {
    const r = punto([DC('V1', '12', 'vcc'), R('R1', '950', 'vcc', 'k'), R('R2', '10k', 'k', 'ref'), tl431('k', 'ref')], 0.2, 1e-4)
    const iref = (r.v('k') - r.v('ref')) / 10e3
    expect(iref).toBeGreaterThan(1e-6)
    expect(iref).toBeLessThan(4e-6)
  })

  it('la impedancia dinámica de 1 mA a 100 mA es de 0.2 Ω típica, bajo los 0.5 Ω máximos', () => {
    const baja = vka('9.5k'), alta = vka('95')
    const z = (alta.v('k') - baja.v('k')) / (-alta.m('V1').i + baja.m('V1').i)
    expect(z).toBeGreaterThan(0.1)
    expect(z).toBeLessThan(0.5)
  })

  it('como regulador de 5 V con un divisor de 10 kΩ y 10 kΩ da 2 × Vref y la regulación de línea de 12 a 20 V es de menos de 11 mV (1.4 mV/V típicos de la hoja)', () => {
    const reg = (vin: string) => punto([DC('V1', vin, 'vcc'), R('R1', '470', 'vcc', 'k'), R('R2', '10k', 'k', 'ref'), R('R3', '10k', 'ref', '0'), R('RL', '1k', 'k', '0'), tl431('k', 'ref')], 0.2, 1e-4).v('k')
    const a = reg('12'), b = reg('20')
    expect(Math.abs(a - 5.0)).toBeLessThan(0.03)
    expect(Math.abs(b - a)).toBeLessThan(0.011)
  })

  it('apagado (REF en tierra) con 36 V deja pasar menos del 1 µA de la corriente de apagado', () => {
    const r = punto([DC('V1', '36', 'vcc'), R('R1', '1k', 'vcc', 'k'), tl431('k', '0')], 0.05, 1e-4)
    expect((36 - r.v('k')) / 1e3).toBeLessThan(1e-6)
  })

  it('con un capacitor de 100 nF en K y la salida de 5 V no oscila, y con 10 µF se asienta en menos de 50 ms', () => {
    const con = (c: string, fin: number) => punto([DC('V1', '12', 'vcc'), R('R1', '470', 'vcc', 'k'), R('R2', '10k', 'k', 'ref'), R('R3', '10k', 'ref', '0'), C('CK', c, 'k', '0'), tl431('k', 'ref')], fin, 1e-5).v('k')
    expect(Math.abs(con('100n', 0.01) - 5.0)).toBeLessThan(0.03)
    expect(Math.abs(con('10u', 0.05) - 5.0)).toBeLessThan(0.03)
  })

  it('avisa con más de los 150 mA de cátodo, y su máximo de voltaje es de 37 V de K a A', () => {
    expect(punto([DC('V1', '12', 'vcc'), R('R1', '47', 'vcc', 'k'), tl431('k', 'k')], 0.05, 1e-4).avisos().U1).toMatch(/corriente de cátodo/)
    const d = conEtiquetas(lib, [DC('V1', '40', 'vcc'), R('R1', '10k', 'vcc', 'k'), tl431('k', '0')])
    const con = calcularConexiones(d, lib)
    const u = Object.values(d.piezas).find((p) => p.ref === 'U1')!
    const [maximo] = resolverAbsolutos(u, lib.get('tl431')!, con)!.lista
    expect(maximo).toMatchObject({ nombre: 'cátodo contra ánodo', max: 37 })
    const redK = con.redes.findIndex((x) => x.nombre === 'k')
    expect(medirAbsoluto(maximo, new Map([[redK, 40]]), undefined, undefined)).toMatchObject({ arriba: true, limite: 37 })
    expect(medirAbsoluto(maximo, new Map([[redK, 36]]), undefined, undefined)).toBeUndefined()
  })
})

describe('referencia LM4040 contra su hoja de datos', () => {
  const lm4040 = (modelo: string, k: string): Parte => ({ tipo: 'lm4040', ref: 'U1', props: { modelo }, pines: { K: k, A: '0' } })
  const enCorriente = (modelo: string, vin: number, ir: number) => punto([DC('V1', String(vin), 'vcc'), R('R1', String((vin - Number(modelo.split(' ')[0])) / ir), 'vcc', 'k'), lm4040(modelo, 'k')], 0.2, 1e-4)

  it.each([
    ['2.048 V', 2.048, 100e-6], ['2.5 V', 2.5, 100e-6], ['3 V', 3, 100e-6], ['4.096 V', 4.096, 100e-6], ['5 V', 5, 100e-6], ['10 V', 10, 150e-6]
  ] as const)('%s: voltaje inverso de la hoja con la corriente de prueba, dentro de la tolerancia de ±0.1 % del grado A', (modelo, vz, ir) => {
    expect(Math.abs(enCorriente(modelo, 15, ir).v('k') - vz)).toBeLessThan(vz * 1e-3)
  })

  it.each([
    ['2.048 V', 0.3, 0.8], ['2.5 V', 0.3, 0.8], ['3 V', 0.4, 0.9], ['4.096 V', 0.5, 1], ['5 V', 0.5, 1.1], ['10 V', 0.7, 1.7]
  ] as const)('%s: impedancia dinámica a 1 mA de %s Ω típica, bajo los %s Ω máximos de la hoja', (modelo, tipica, maxima) => {
    const vz = Number(modelo.split(' ')[0])
    const a = enCorriente(modelo, 15, 0.9e-3), b = enCorriente(modelo, 15, 1.1e-3)
    const z = (b.v('k') - a.v('k')) / (-b.m('V1').i + a.m('V1').i)
    expect(vz).toBeGreaterThan(0)
    expect(Math.abs(z - tipica)).toBeLessThan(0.1)
    expect(z).toBeLessThan(maxima)
  })

  it('el cambio de voltaje de 1 mA a 15 mA es de unos 4.5 mV (2.5 V: 2.5 mV típicos y 8 mV máximos en la hoja)', () => {
    const dv = enCorriente('2.5 V', 15, 15e-3).v('k') - enCorriente('2.5 V', 15, 1e-3).v('k')
    expect(dv).toBeGreaterThan(0)
    expect(dv).toBeLessThan(8e-3)
  })

  it('avisa con más de los 20 mA inversos y con 10 mA directos', () => {
    expect(punto([DC('V1', '12', 'vcc'), R('R1', '300', 'vcc', 'k'), lm4040('2.5 V', 'k')], 0.05, 1e-4).avisos().U1).toMatch(/corriente inversa/)
    expect(punto([DC('V1', '-12', 'vcc'), R('R1', '300', 'vcc', 'k'), lm4040('2.5 V', 'k')], 0.05, 1e-4).avisos().U1).toMatch(/corriente directa/)
  })
})

describe('amplificador de instrumentación INA128 contra su hoja de datos', () => {
  const ina = (rg: string | null): Parte => ({ tipo: 'ina128', ref: 'U1', props: { modelo: 'INA128' }, pines: { 'IN-': 'inm', 'IN+': 'inp', RG1: rg ? 'rg1' : 'aire1', RG2: rg ? 'rg2' : 'aire2', REF: '0', OUT: 'out', 'V+': 'vp', 'V-': 'vm' } })
  const base = (carga = '10k'): Parte[] => [DC('V1', '15', 'vp'), DC('V2', '-15', 'vm'), R('RL', carga, 'out', '0')]
  const salida = (rg: string | null, vinm: string, vinp: string) => punto([...base(), DC('V3', vinm, 'inm'), DC('V4', vinp, 'inp'), ...(rg ? [R('RG', rg, 'rg1', 'rg2')] : []), ina(rg)], 0.2, 1e-4).v('out')
  const ganancia = (rg: number | null) => (rg === null ? 1 : 1 + 50e3 / rg)

  it.each([
    [null, 0.024, 1], [5.556e3, 0.4, 0.5], [505.1, 0.5, 0.05], [50.05, 1, 0.005]
  ] as const)('G = 1 + 50 kΩ/RG con RG = %s Ω: el error de ganancia queda bajo el máximo de la hoja (%s %)', (rg, maxPorCiento, vdif) => {
    const g = ganancia(rg)
    const v = salida(rg === null ? null : String(rg), String(1 - vdif / 2), String(1 + vdif / 2))
    expect(Math.abs((v / (vdif * g) - 1) * 100)).toBeLessThan(maxPorCiento)
  })

  it.each([
    [null, 80], [5.556e3, 100], [505.1, 120], [50.05, 120]
  ] as const)('rechazo de modo común con RG = %s Ω: pasa los %s dB mínimos de la hoja (10 V de modo común)', (rg, minimoDb) => {
    const g = ganancia(rg)
    const v = salida(rg === null ? null : String(rg), '10', '10')
    expect(20 * Math.log10((g * 10) / Math.abs(v))).toBeGreaterThan(minimoDb)
  })

  it('la salida llega a 1.4 V de cada alimentación con 10 kΩ y no pasa de ahí', () => {
    const alto = salida('5.556k', '0', '3'), bajo = salida('5.556k', '3', '0')
    expect(alto).toBeGreaterThan(13.4)
    expect(alto).toBeLessThan(13.7)
    expect(bajo).toBeLessThan(-13.4)
    expect(bajo).toBeGreaterThan(-13.7)
  })

  it('REF desplaza la salida: con 2 V en REF y entradas iguales la salida queda en 2 V', () => {
    const r = punto([...base(), DC('V3', '1', 'inm'), DC('V4', '1', 'inp'), DC('VR', '2', 'ref'), { ...ina(null), pines: { ...ina(null).pines, REF: 'ref' } }], 0.2, 1e-4)
    expect(Math.abs(r.v('out') - 2)).toBeLessThan(0.01)
  })

  it('consume unos 700 µA en reposo con ±15 V (750 µA máx)', () => {
    const r = punto([...base('1G'), DC('V3', '0', 'inm'), DC('V4', '0', 'inp'), ina(null)], 0.2, 1e-4)
    expect(-r.m('V1').i).toBeGreaterThan(0.6e-3)
    expect(-r.m('V1').i).toBeLessThan(0.75e-3)
  })

  /** Amplitud de la salida (el pico de las últimas dos vueltas) con una senoidal de `pico` volts. */
  function amplitud(rg: string | null, pico: string, hz: number, h: number): number {
    const fin = 12 / hz
    let maximo = 0
    correr([...base(), DC('V3', '0', 'inm'), AC('V4', pico, String(hz), 'inp'), ...(rg ? [R('RG', rg, 'rg1', 'rg2')] : []), ina(rg)], fin, h, h, (t, l) => {
      if (t > fin - 2 / hz) maximo = Math.max(maximo, Math.abs(l.v('out')))
    })
    return maximo
  }

  it('el ancho de banda de −3 dB es de 200 kHz con G = 100 y de 1.3 MHz con G = 1 (±25 %)', () => {
    const cien = amplitud('505.1', '10m', 200e3, 25e-9) / (0.01 * 100)
    expect(cien).toBeGreaterThan(0.707 * 0.75)
    expect(cien).toBeLessThan(0.707 * 1.25)
    const uno = amplitud(null, '0.2', 1.3e6, 5e-9) / 0.2
    expect(uno).toBeGreaterThan(0.707 * 0.75)
    expect(uno).toBeLessThan(0.707 * 1.25)
  })

  it('la velocidad de subida es de 4 V/µs (±20 %)', () => {
    let previo = 0, maxima = 0
    correr([...base(), DC('V3', '0', 'inm'), { tipo: 'fuente-pulso', ref: 'V4', props: { alto: '1', frecuencia: '20k', ciclo: '50 %', retardo: '1u' }, pines: { '+': 'inp', '-': '0' } }, R('RG', '5.556k', 'rg1', 'rg2'), ina('rg')], 8e-6, 10e-9, 10e-9, (_t, l) => {
      const v = l.v('out')
      maxima = Math.max(maxima, (v - previo) / 10e-9)
      previo = v
    })
    expect(maxima).toBeGreaterThan(3.2e6)
    expect(maxima).toBeLessThan(4.8e6)
  })

  it('RG1 y RG2 al aire (G = 1) y con una RG muy chica compilan sin error', () => {
    for (const rg of [null, '0.001']) {
      const d = conEtiquetas(lib, [...base(), DC('V3', '0', 'inm'), DC('V4', '0', 'inp'), ...(rg ? [R('RG', rg, 'rg1', 'rg2')] : []), ina(rg)])
      expect(compilarNetlist(d, lib, calcularConexiones(d, lib)).errores).toEqual([])
    }
  })
})

describe('amplificador de audio LM386 contra su hoja de datos', () => {
  const lm386 = (entrada: string, ganancia200 = false): Parte => ({ tipo: 'lm386', ref: 'U1', props: { modelo: 'LM386' }, pines: { 'IN-': '0', 'IN+': entrada, GAIN1: ganancia200 ? 'g1' : 'aire1', GAIN8: ganancia200 ? 'g8' : 'aire8', BYP: 'byp', OUT: 'out', VS: 'vs', GND: '0' } })
  const bocina: Parte[] = [C('CO', '250u', 'out', 'rl'), R('RL', '8', 'rl', '0')]

  /** Pico (la mitad del pico a pico) de `red` en las últimas dos vueltas de una senoidal en IN+. */
  function pico(red: string, entrada: string, hz: number, fin: number, h: number, ganancia200 = false): number {
    let maximo = -Infinity, minimo = Infinity
    correr([DC('V1', '6', 'vs'), AC('V3', entrada, String(hz), 'inp'), ...(ganancia200 ? [C('CG', '10u', 'g1', 'g8')] : []), ...bocina, lm386('inp', ganancia200)], fin, h, h * 4, (t, l) => {
      if (t <= fin - 2 / hz) return
      maximo = Math.max(maximo, l.v(red))
      minimo = Math.min(minimo, l.v(red))
    })
    return (maximo - minimo) / 2
  }

  it('en reposo la salida queda en la mitad de la alimentación y consume 4 mA típicos (8 mA máx) con 6 V', () => {
    const r = punto([DC('V1', '6', 'vs'), R('RX', '1G', 'out', '0'), lm386('0')], 0.1, 1e-4)
    expect(Math.abs(r.v('out') - 3)).toBeLessThan(0.1)
    expect(-r.m('V1').i).toBeGreaterThan(3e-3)
    expect(-r.m('V1').i).toBeLessThan(8e-3)
  })

  it('sin nada entre las patillas 1 y 8 la ganancia es de 26 dB (±0.5 dB)', () => {
    const g = pico('out', '10m', 1e3, 6e-3, 2e-6) / 0.01
    expect(20 * Math.log10(g)).toBeGreaterThan(25.5)
    expect(20 * Math.log10(g)).toBeLessThan(26.5)
  })

  it('con 10 µF entre las patillas 1 y 8 la ganancia es de 46 dB (±1 dB)', () => {
    const g = pico('out', '1m', 1e3, 0.1, 5e-6, true) / 0.001
    expect(20 * Math.log10(g)).toBeGreaterThan(45)
    expect(20 * Math.log10(g)).toBeLessThan(47)
  })

  it('la resistencia de entrada es de 50 kΩ', () => {
    const r = punto([DC('V1', '6', 'vs'), DC('V3', '0.1', 'inp'), R('RX', '1G', 'out', '0'), lm386('inp')], 0.05, 1e-4)
    expect(Math.abs(-r.m('V3').i - 0.1 / 50e3) / (0.1 / 50e3)).toBeLessThan(0.05)
  })

  it('sobreexcitado entrega entre 250 mW (mínimo) y 500 mW a una bocina de 8 Ω con 6 V', () => {
    const vpk = pico('rl', '0.3', 1e3, 6e-3, 2e-6)
    const p = (vpk * vpk) / (2 * 8)
    expect(p).toBeGreaterThan(0.25)
    expect(p).toBeLessThan(0.5)
  })

  it('el ancho de banda con ganancia 20 es de 300 kHz (±25 %)', () => {
    const g = pico('out', '5m', 300e3, 40e-6, 20e-9) / 0.005
    expect(g / 20).toBeGreaterThan(0.707 * 0.75)
    expect(g / 20).toBeLessThan(0.707 * 1.25)
  })

  it('sus máximos son 15 V de alimentación y ±0.4 V de entrada', () => {
    const d = conEtiquetas(lib, [DC('V1', '6', 'vs'), DC('V3', '0.1', 'inp'), lm386('inp')])
    const con = calcularConexiones(d, lib)
    const u = Object.values(d.piezas).find((p) => p.ref === 'U1')!
    const [alimentacion, entrada] = resolverAbsolutos(u, lib.get('lm386')!, con)!.lista
    expect(alimentacion).toMatchObject({ max: 15 })
    expect(entrada).toMatchObject({ min: -0.4, max: 0.4, sinQuema: true })
    const vs = con.redes.findIndex((x) => x.nombre === 'vs'), inp = con.redes.findIndex((x) => x.nombre === 'inp')
    expect(medirAbsoluto(alimentacion, new Map([[vs, 16]]), undefined, undefined)).toMatchObject({ arriba: true })
    expect(medirAbsoluto(entrada, new Map([[inp, 0.5]]), undefined, undefined)).toMatchObject({ arriba: true })
    expect(medirAbsoluto(entrada, new Map([[inp, -0.3]]), undefined, undefined)).toBeUndefined()
  })

  it('con IN− en tierra y las patillas 1 y 8 unidas por un alambre compila sin error', () => {
    const d = conEtiquetas(lib, [DC('V1', '6', 'vs'), R('RX', '1G', 'out', '0'), { ...lm386('0', true), pines: { ...lm386('0', true).pines, GAIN8: 'g1' } }])
    expect(compilarNetlist(d, lib, calcularConexiones(d, lib)).errores).toEqual([])
  })
})

describe('punta lógica', () => {
  const punta = (familia: string, red: string): Parte => ({ tipo: 'punta-logica', ref: 'LP1', props: { familia }, pines: { PUNTA: red, '+': 'vcc', '-': '0' } })
  /** Corriente (A) de la luz roja (alto) y de la verde (bajo): los diodos 9 y 11 de la pieza. */
  const luces = (l: Medicion): [number, number] => {
    const x = (l as unknown as { extra: { corrientes: number[] } }).extra.corrientes
    return [x[9], x[11]]
  }
  /** Una compuerta NOT de la familia, con su entrada en 0 o 5 V, maneja la punta. */
  const conCompuerta = (familia: string, entrada: string, modelo: string) => punto([DC('V1', '5', 'vcc'), DC('VI', entrada, 'a'), { tipo: 'not', ref: 'U2', props: { familia }, pines: { A: 'a', Y: 'y' } }, punta(modelo, 'y')], 5e-3, 1e-5)

  it('CMOS con un 74HC a 5 V: alto enciende la roja, bajo la verde', () => {
    const [rAlto, vAlto] = luces(conCompuerta('74HC', '0', 'CMOS').m('LP1'))
    const [rBajo, vBajo] = luces(conCompuerta('74HC', '5', 'CMOS').m('LP1'))
    expect(rAlto).toBeGreaterThan(3e-3)
    expect(vAlto).toBeLessThan(1e-4)
    expect(vBajo).toBeGreaterThan(3e-3)
    expect(rBajo).toBeLessThan(1e-4)
  })

  it('TTL con un 74LS a 5 V: alto enciende la roja, bajo la verde', () => {
    const [rAlto, vAlto] = luces(conCompuerta('74LS', '0', 'TTL').m('LP1'))
    const [rBajo, vBajo] = luces(conCompuerta('74LS', '5', 'TTL').m('LP1'))
    expect(rAlto).toBeGreaterThan(3e-3)
    expect(vAlto).toBeLessThan(1e-4)
    expect(vBajo).toBeGreaterThan(3e-3)
    expect(rBajo).toBeLessThan(1e-4)
  })

  it.each([['CMOS', 2.5], ['TTL', 1.4]] as const)('%s con la punta al aire: ninguna luz enciende y la punta queda en %s V, entre sus dos umbrales', (familia, v) => {
    const r = punto([DC('V1', '5', 'vcc'), punta(familia, 'p')], 0.05, 1e-4)
    const [roja, verde] = luces(r.m('LP1'))
    expect(roja).toBeLessThan(1e-4)
    expect(verde).toBeLessThan(1e-4)
    expect(Math.abs(r.v('p') - v)).toBeLessThan(0.02)
  })

  it('los umbrales son el 70 % y el 30 % de la alimentación en CMOS, y 2.0 V y 0.8 V con 5 V en TTL', () => {
    const luz = (familia: string, v: number) => luces(punto([DC('V1', '5', 'vcc'), DC('VP', String(v), 'p'), punta(familia, 'p')], 0.05, 1e-4).m('LP1'))
    expect(luz('CMOS', 3.45)[0]).toBeLessThan(1e-4)
    expect(luz('CMOS', 3.55)[0]).toBeGreaterThan(3e-3)
    expect(luz('CMOS', 1.55)[1]).toBeLessThan(1e-4)
    expect(luz('CMOS', 1.45)[1]).toBeGreaterThan(3e-3)
    expect(luz('TTL', 1.95)[0]).toBeLessThan(1e-4)
    expect(luz('TTL', 2.05)[0]).toBeGreaterThan(3e-3)
    expect(luz('TTL', 0.85)[1]).toBeLessThan(1e-4)
    expect(luz('TTL', 0.75)[1]).toBeGreaterThan(3e-3)
  })

  it('con pulsos de 1 kHz las dos luces encienden a medias', () => {
    const medias = [0, 0]
    let n = 0
    correr([DC('V1', '5', 'vcc'), { tipo: 'fuente-pulso', ref: 'VI', props: { alto: '5', frecuencia: '1k', ciclo: '50 %' }, pines: { '+': 'a', '-': '0' } }, { tipo: 'not', ref: 'U2', props: { familia: '74HC' }, pines: { A: 'a', Y: 'y' } }, punta('CMOS', 'y')], 8e-3, 2e-6, 20e-6, (t, l) => {
      if (t < 4e-3) return
      const [r, v] = luces(l.m('LP1'))
      medias[0] += r
      medias[1] += v
      n++
    })
    for (const m of medias) {
      expect(m / n).toBeGreaterThan(1.5e-3)
      expect(m / n).toBeLessThan(5e-3)
    }
  })

  it('con la punta en la pinza + o en tierra compila sin error (el divisor de polarización queda en corto)', () => {
    for (const red of ['vcc', '0']) {
      const d = conEtiquetas(lib, [DC('V1', '5', 'vcc'), punta('CMOS', red)])
      expect(compilarNetlist(d, lib, calcularConexiones(d, lib)).errores).toEqual([])
    }
  })
})

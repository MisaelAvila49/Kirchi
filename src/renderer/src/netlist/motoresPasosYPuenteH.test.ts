// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { calcularConexiones } from '../conexiones/conexiones'
import type { Documento } from '../doc/tipos'
import { conEtiquetas, type Parte } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import { Movimiento } from '../lienzo/movimiento'
import { excesoDe, limitesDelCircuito } from '../sim/avisos'
import { leerResultados, type Lectura, type MedicionPieza } from '../sim/lectura'
import init, { Simulator } from '../sim/pkg/kirchi_engine.js'
import { compilarNetlist } from './netlist'

// Los motores a pasos y el L298 contra los puntos clave de su hoja, con la tolerancia que la hoja publica. La comparación con
// ngspice con los mismos parámetros está en `referencias.test.ts`.

const lib = libreriaDePrueba().piezas
let memoria: WebAssembly.Memory
beforeAll(async () => {
  memoria = (await init({ module_or_path: readFileSync(join(import.meta.dirname, '../sim/pkg/kirchi_engine_bg.wasm')) })).memory
})

const R = (ref: string, valor: string, a: string, b: string): Parte => ({ tipo: 'resistencia', ref, props: { valor }, pines: { '1': a, '2': b } })
const PWL = (ref: string, puntos: string, mas: string): Parte => ({ tipo: 'fuente-pwl', ref, props: { puntos }, pines: { '+': mas, '-': '0' } })

/** Lecturas del circuito en los instantes `tiempos` (s), el voltaje de cada red por nombre y la lectura de cada pieza por referencia. */
function lecturasEn(partes: Parte[], tiempos: number[], hmax = 2e-5) {
  return lecturasDe(conEtiquetas(lib, partes), tiempos, hmax)
}

function lecturasDe(d: Documento, tiempos: number[], hmax = 2e-5): { v: (red: string, k: number) => number; pieza: (ref: string, k: number) => MedicionPieza; lectura: (k: number) => Lectura; doc: Documento; id: (ref: string) => string; limites: ReturnType<typeof limitesDelCircuito> } {
  const con = calcularConexiones(d, lib)
  const r = compilarNetlist(d, lib, con)
  expect(r.errores).toEqual([])
  const sim = new Simulator(JSON.stringify(r.netlist), hmax)
  sim.set_tolerances(1e-4, 1e-12, 1e-7)
  const n = sim.element_count()
  const f64 = (p: number, k = n) => new Float64Array(memoria.buffer, p, k).slice()
  const lecturas = tiempos.map((t) => {
    sim.advance_to(t, 10_000_000)
    const g = sim.digital_count()
    return leerResultados(r, { time: sim.time(), ratio: 1, capacity: 1, seq: 0, consistente: true, voltages: sim.voltages(), currents: f64(sim.currents_ptr()), aux: f64(sim.aux_ptr()), estado: f64(sim.estado_ptr()), niveles: f64(sim.niveles_ptr(), g), medidas: f64(sim.medidas_ptr(), 3 * g) })
  })
  sim.free()
  const idDe = (ref: string) => Object.values(d.piezas).find((p) => p.ref === ref)!.id
  return { lectura: (k) => lecturas[k], doc: d, id: idDe, limites: limitesDelCircuito(d, lib, r, con), v: (red, k) => lecturas[k].redes.get(con.redes.findIndex((x) => x.nombre === red))!, pieza: (ref, k) => lecturas[k].piezas.get(idDe(ref))! }
}

/** El 17HS4401 con cada fase detrás de 6 Ω y una fuente por tramos de 12 V. */
const bipolar = (a: string, b: string, carga = '0'): Parte[] => [
  PWL('V1', a, 'na'), R('R1', '6', 'na', 'ma'), PWL('V2', b, 'nb'), R('R2', '6', 'nb', 'mb'),
  { tipo: 'motor-pasos-bipolar', ref: 'M1', props: { modelo: '17HS4401', carga }, pines: { 'A+': 'ma', 'A-': '0', 'B+': 'mb', 'B-': '0' } }
]
const motor = (m: { extra?: unknown }) => m.extra as { tipo: 'motor'; rpm: number; angulo: number; pasos: number }

describe('motor a pasos 17HS4401 contra su hoja de datos', () => {
  const parametros = (lib.get('motor-pasos-bipolar')!.modelo as unknown as { modelos: Record<string, Record<string, number>> }).modelos['17HS4401']

  it('resistencia de 1.5 Ω ±10 % por fase (MotionKing MK1106 y datasheetcafe)', () => {
    const l = lecturasEn(bipolar('0 12, 0.05 12', '0 0, 0.05 0'), [0.03])
    const r = 12 / Math.abs(l.pieza('V1', 0).i) - 6
    expect(Math.abs(r / 1.5 - 1)).toBeLessThan(0.1)
  })

  it('un paso completo mueve el eje 1.8 ° (200 pasos por vuelta) y la lectura lo cuenta', () => {
    const l = lecturasEn(bipolar('0 12, 0.03 12, 0.03001 0, 0.08 0', '0 0, 0.03 0, 0.03001 12, 0.08 12'), [0.025, 0.075])
    const grados = ((motor(l.pieza('M1', 1)).angulo - motor(l.pieza('M1', 0)).angulo) * 180) / Math.PI
    expect(Math.abs(grados / 1.8 - 1)).toBeLessThan(0.01)
    expect(Math.round(motor(l.pieza('M1', 1)).pasos - motor(l.pieza('M1', 0)).pasos)).toBe(1)
  })

  it('par de retención de 40 N·cm como mínimo con las dos fases a 1.7 A y detente bajo los 2.2 N·cm', () => {
    const par = Math.SQRT2 * parametros.km * 1.7
    expect(par).toBeGreaterThanOrEqual(0.4 - 1e-9)
    expect(par).toBeLessThan(0.41)
    expect(parametros.td).toBeLessThanOrEqual(0.022)
  })

  it('inercia de 54 g·cm² y 200 pasos por vuelta (50 pares de polos) de la hoja', () => {
    expect(parametros.j).toBeCloseTo(54e-7, 12)
    expect(parametros.dientes).toBe(50)
  })

  it('el símbolo gira a la velocidad del eje mientras llegan los pasos y queda quieto sin ellos', () => {
    const e = [[12, 0], [12, 12], [0, 12], [-12, 12], [-12, 0], [-12, -12], [0, -12], [12, -12], [12, 0]]
    const tramos = (c: number) => '0 ' + e[0][c] + ', ' + e.slice(1).map((x, k) => `${0.01 + k * 0.0025} ${e[k][c]}, ${0.01 + k * 0.0025 + 1e-5} ${x[c]}`).join(', ') + ', 0.3 ' + e.at(-1)![c]
    const l = lecturasEn(bipolar(tramos(0), tramos(1)), [0.02, 0.2])
    const mov = new Movimiento()
    mov.preparar(l.doc, lib)
    mov.actualizar(lib, l.lectura(0), 1, 0, false)
    expect(Math.abs(mov.vps(l.id('M1')))).toBeGreaterThan(0.1)
    mov.actualizar(lib, l.lectura(1), 1, 1000, false)
    expect(mov.vps(l.id('M1'))).toBe(0)
  })

  it('con una carga alta el eje gira menos que sin carga con los mismos medios pasos', () => {
    const t = (k: number) => 0.01 + k * 0.0025
    const e = [[12, 0], [12, 12], [0, 12], [-12, 12], [-12, 0], [-12, -12], [0, -12], [12, -12], [12, 0]]
    const tramos = (c: number) => '0 ' + e[0][c] + ', ' + e.slice(1).map((x, k) => `${t(k)} ${e[k][c]}, ${t(k) + 1e-5} ${x[c]}`).join(', ') + ', 0.06 ' + e.at(-1)![c]
    const gira = (carga: string) => motor(lecturasEn(bipolar(tramos(0), tramos(1), carga), [0.06]).pieza('M1', 0)).angulo
    // Ocho medios pasos son un ciclo eléctrico: 2π / 50 rad.
    expect(Math.abs(gira('0') / ((2 * Math.PI) / 50) - 1)).toBeLessThan(0.02)
    expect(gira('0.4')).toBeLessThan(0.8 * gira('0'))
  })
})

/** Un nivel por entrada del ULN2003 (1B a 4B) como fuente por tramos: la secuencia de `activas` (1 a 4) cambia cada `dt` desde `t0`. */
function secuenciaDeEntradas(activas: number[], t0: number, dt: number, fin: number): string[] {
  return [1, 2, 3, 4].map((e) => {
    const nivel = (k: number) => (activas[k] === e ? 5 : 0)
    const p = [`0 ${nivel(0)}`]
    activas.slice(1).forEach((_, k) => p.push(`${t0 + k * dt} ${nivel(k)}`, `${t0 + k * dt + 1e-5} ${nivel(k + 1)}`))
    p.push(`${fin} ${nivel(activas.length - 1)}`)
    return p.join(', ')
  })
}

const uln = (pines: Record<string, string>): Parte => ({
  tipo: 'uln2003', ref: 'U1', props: { modelo: 'ULN2003A' },
  pines: { E: '0', ...Object.fromEntries(['1B', '2B', '3B', '4B', '5B', '6B', '7B', '1C', '2C', '3C', '4C', '5C', '6C', '7C', 'COM'].map((p) => [p, `aire_${p}`])), ...pines }
})

describe('motor a pasos 28BYJ-48 contra su hoja de datos', () => {
  const parametros = (lib.get('motor-pasos-unipolar')!.modelo as unknown as { modelos: Record<string, Record<string, number>> }).modelos['28BYJ-48']
  /** El 28BYJ-48 con cada mitad detrás de una fuente por tramos de 5 V (0 V: mitad energizada), con la toma a 5 V. */
  const unipolar = (e: string[], carga = '0'): Parte[] => [
    { tipo: 'fuente-dc', ref: 'V5', props: { voltaje: '5' }, pines: { '+': 'com', '-': '0' } },
    ...e.map((puntos, k): Parte => PWL(`V${k + 1}`, puntos, `e${k + 1}`)),
    { tipo: 'motor-pasos-unipolar', ref: 'M1', props: { modelo: '28BYJ-48', carga }, pines: { A: 'e1', A2: 'e2', B: 'e3', B2: 'e4', COM: 'com' } }
  ]
  /** Medios pasos desde A' a `hz` pasos por segundo, `n` en total: devuelve los pasos completos que lleva el eje al final. */
  const pasosCon = (hz: number, n: number): number => {
    const sec = [[0, 1, 0, 0], [0, 1, 0, 1], [0, 0, 0, 1], [1, 0, 0, 1], [1, 0, 0, 0], [1, 0, 1, 0], [0, 0, 1, 0], [0, 1, 1, 0]]
    const dt = 1 / hz
    const e = Array.from({ length: n + 1 }, (_, k) => sec[k % 8])
    const tramos = (c: number) => `0 ${e[0][c] ? 0 : 5}, ` + e.slice(1).map((x, k) => `${0.01 + k * dt} ${e[k][c] ? 0 : 5}, ${0.01 + k * dt + 1e-5} ${x[c] ? 0 : 5}`).join(', ') + `, ${0.3} ${e.at(-1)![c] ? 0 : 5}`
    const l = lecturasEn(unipolar([0, 1, 2, 3].map(tramos)), [0.2])
    return motor(l.pieza('M1', 0)).pasos
  }

  it('resistencia de 50 Ω ±7 % por devanado a 25 °C (Kiatronics)', () => {
    const l = lecturasEn([{ tipo: 'fuente-dc', ref: 'V1', props: { voltaje: '5' }, pines: { '+': 'com', '-': '0' } }, { tipo: 'motor-pasos-unipolar', ref: 'M1', props: { modelo: '28BYJ-48' }, pines: { A: '0', A2: 'com', B: 'com', B2: 'com', COM: 'com' } }], [0.05])
    const r = 5 / Math.abs(l.pieza('V1', 0).i)
    expect(Math.abs(r / 50 - 1)).toBeLessThan(0.07)
  })

  it('un paso completo del rotor son 11.25 ° (5.625 ° por medio paso) entre la reducción medida de 63.68', () => {
    const l = lecturasEn(unipolar(['0 5, 0.04 5', '0 0, 0.01 0, 0.01001 5, 0.04 5', '0 5, 0.04 5', '0 5, 0.01 5, 0.01001 0, 0.04 0']), [0.009, 0.039])
    const grados = ((motor(l.pieza('M1', 1)).angulo - motor(l.pieza('M1', 0)).angulo) * 180) / Math.PI
    expect(Math.abs(grados / (11.25 / 63.68395) - 1)).toBeLessThan(0.01)
    expect(parametros.reduccion).toBeCloseTo((22 * 26 * 31 * 32) / (9 * 9 * 10 * 11), 5)
  })

  it('arranca sin carga a 580 pasos por segundo (la hoja pide más de 600) y a 1,500 pierde pasos', () => {
    expect(Math.abs(pasosCon(580, 24) - 12)).toBeLessThan(0.2)
    expect(Math.abs(pasosCon(1500, 24) - 12)).toBeGreaterThan(1)
  })

  it('par de arrastre de 34.3 mN·m en el eje con dos mitades a 5 V sobre 50 Ω, calculado con la reducción', () => {
    const par = Math.SQRT2 * parametros.km * (5 / parametros.r) * parametros.reduccion
    expect(par).toBeGreaterThanOrEqual(0.0343 * 0.999)
    expect(par).toBeLessThan(0.0343 * 1.01)
  })

  it('con un ULN2003 gira cuatro pasos completos en la secuencia de una mitad por vez', () => {
    const e = secuenciaDeEntradas([2, 4, 1, 3, 2], 0.02, 0.02, 0.2)
    const partes = [
      { tipo: 'fuente-dc', ref: 'V5', props: { voltaje: '5' }, pines: { '+': 'com', '-': '0' } } as Parte,
      ...e.map((puntos, k): Parte => PWL(`V${k + 1}`, puntos, `in${k + 1}`)),
      uln({ '1B': 'in1', '2B': 'in2', '3B': 'in3', '4B': 'in4', '1C': 'e1', '2C': 'e2', '3C': 'e3', '4C': 'e4', COM: 'com' }),
      { tipo: 'motor-pasos-unipolar', ref: 'M1', props: { modelo: '28BYJ-48' }, pines: { A: 'e1', A2: 'e2', B: 'e3', B2: 'e4', COM: 'com' } }
    ]
    const l = lecturasEn(partes, [0.015, 0.15])
    const m = motor(l.pieza('M1', 1))
    expect(Math.abs(m.pasos - motor(l.pieza('M1', 0)).pasos)).toBeGreaterThan(3.8)
    expect(Math.abs(m.pasos - motor(l.pieza('M1', 0)).pasos)).toBeLessThan(4.2)
  })
})

const DCV = (ref: string, voltaje: string, mas: string): Parte => ({ tipo: 'fuente-dc', ref, props: { voltaje }, pines: { '+': mas, '-': '0' } })
const l298 = (pines: Record<string, string>): Parte => ({
  tipo: 'l298', ref: 'U1', props: { modelo: 'L298N' },
  pines: { IN3: '0', IN4: '0', ENB: '0', OUT3: 'o3', OUT4: 'o4', SENSA: '0', SENSB: '0', VS: 'vs', VSS: 'vss', GND: '0', ...pines }
})

describe('L298 contra su hoja de datos', () => {
  /** Puente A con VS = 12 V, un nivel en IN1 e IN2 y una carga entre OUT1 y OUT2; las salidas B quedan unidas por una resistencia. */
  const puente = (in1: string, in2: string, carga: string, ena = '5') => lecturasEn([
    DCV('V1', '12', 'vs'), DCV('V2', '5', 'vss'), DCV('V3', ena, 'ena'), DCV('V4', in1, 'in1'), DCV('V5', in2, 'in2'),
    l298({ IN1: 'in1', IN2: 'in2', ENA: 'ena', OUT1: 'o1', OUT2: 'o2' }), R('RL', carga, 'o1', 'o2'), R('R3', '1k', 'o3', 'o4')
  ], [3e-3], 1e-6)

  it('la caída total de VS a la carga cae dentro de lo que publica la hoja a 1 A y a 2 A', () => {
    for (const [carga, minimo, maximo] of [['9', 1.8, 3.2], ['4.4', 0, 4.9]] as const) {
      const p = puente('5', '0', carga)
      const i = Math.abs(p.pieza('RL', 0).i)
      expect(i, carga).toBeGreaterThan(carga === '9' ? 0.95 : 1.9)
      const caida = 12 - (p.v('o1', 0) - p.v('o2', 0))
      expect(caida).toBeGreaterThanOrEqual(minimo)
      expect(caida).toBeLessThanOrEqual(maximo)
      // Los dos puntos típicos de la hoja: 2.55 V a 1 A y 3.70 V a 2 A.
      expect(Math.abs(caida - (1.4 + 1.15 * i))).toBeLessThan(0.03)
    }
  })

  it('los umbrales de entrada son los de la hoja: 1.4 V se lee bajo y 2.4 V se lee alto', () => {
    expect(puente('1.4', '0', '9').v('o1', 0)).toBeLessThan(1)
    expect(puente('2.4', '0', '9').v('o1', 0)).toBeGreaterThan(8)
  })

  it('IN1 en alto sube OUT1 y IN2 en alto sube OUT2, para girar el motor en los dos sentidos', () => {
    const uno = puente('5', '0', '9')
    expect(uno.v('o1', 0)).toBeGreaterThan(uno.v('o2', 0) + 5)
    const dos = puente('0', '5', '9')
    expect(dos.v('o2', 0)).toBeGreaterThan(dos.v('o1', 0) + 5)
    const igual = puente('5', '5', '9')
    expect(Math.abs(igual.v('o1', 0) - igual.v('o2', 0))).toBeLessThan(0.01)
  })

  it('con ENA en bajo las salidas quedan al aire y las lleva un divisor externo', () => {
    const p = lecturasEn([
      DCV('V1', '12', 'vs'), DCV('V2', '5', 'vss'), DCV('V4', '5', 'in1'), DCV('V6', '6', 'alto'),
      l298({ IN1: 'in1', IN2: '0', ENA: '0', OUT1: 'o1', OUT2: 'o2' }), R('RA', '1k', 'alto', 'o1'), R('RB', '1k', 'o1', '0'), R('RC', '1k', 'o2', '0'), R('R3', '1k', 'o3', 'o4')
    ], [3e-3], 1e-6)
    expect(p.v('o1', 0)).toBeCloseTo(3, 1)
  })

  it('la lógica consume cerca de 24 mA de VSS con las entradas en bajo (máximo 36 mA)', () => {
    const p = puente('0', '0', '9')
    const i = Math.abs(p.pieza('V2', 0).i)
    expect(i).toBeGreaterThan(0.02)
    expect(i).toBeLessThan(0.036)
  })

  it('avisa con un VS de 60 V (máximo de 50 V) y no con 12 V', () => {
    const aviso = (vs: string) => {
      const l = lecturasEn([
        DCV('V1', vs, 'vs'), DCV('V2', '5', 'vss'), DCV('V3', '5', 'ena'), DCV('V4', '5', 'in1'),
        l298({ IN1: 'in1', IN2: '0', ENA: 'ena', OUT1: 'o1', OUT2: 'o2' }), R('RL', '100', 'o1', 'o2'), R('R3', '1k', 'o3', 'o4')
      ], [3e-3], 1e-6)
      return excesoDe(l.lectura(0), l.id('U1'), l.limites.get(l.id('U1'))!, undefined, l.lectura(0))
    }
    expect(aviso('12')).toBeNull()
    expect(aviso('60')?.texto).toMatch(/VS/)
  })

  it('no lleva diodos internos y las salidas avisan que se pongan afuera', () => {
    const def = lib.get('l298')!
    for (const id of ['OUT1', 'OUT2', 'OUT3', 'OUT4']) expect(def.pines.find((p) => p.id === id)!.ayuda).toMatch(/diodo/)
  })
})

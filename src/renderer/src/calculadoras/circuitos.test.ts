// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { calcularConexiones } from '../conexiones/conexiones'
import type { Documento } from '../doc/tipos'
import { colisiona, cuerpoEnMundo } from '../editor/colision'
import { conflictoDeTocados, tramoCruzaCaja } from '../editor/conflictos'
import { cajaNota } from '../lienzo/medidas'
import { compilarNetlist } from '../netlist/netlist'
import { libreriaDePrueba } from '../prueba/libreria'
import { armar } from '../plantillas/armar'
import init, { Simulator } from '../sim/pkg/kirchi_engine.js'
import { avisosDelCircuito } from '../ui/proyecto'
import { circuitoAmplificador, circuitoAstable, circuitoDivisor, circuitoFiltro, circuitoLed, circuitoMonoestable, circuitoNotch, circuitoPasaBanda, circuitoRechazaBanda, type Armado } from './circuitos'
import { notchDobleT, pasaBanda, rechazaBanda, respuestaPasaBanda, respuestaRechazaBanda } from './filtros'
import { amplificador, astable555, divisor, filtroRC, led, monoestable555, type Calculo } from './formulas'
import { modeloAmpOp, modeloLed } from './modelosPieza'
import { redondeoDe } from './redondeo'

const lib = libreriaDePrueba().piezas
const E12 = redondeoDe('E12')

beforeAll(async () => {
  await init({ module_or_path: readFileSync(join(import.meta.dirname, '../sim/pkg/kirchi_engine_bg.wasm')) })
})

function ok<T extends object>(r: Calculo<T>): { ok: true } & T {
  if (!r.ok) throw new Error(r.error)
  return r
}

/** Simula y devuelve el voltaje de la red de cada pin pedido (`clave.pin`) tras `t` segundos. */
function voltajes(doc: Documento, pines: string[], t: number, paso = 1e-6): Record<string, number> {
  const con = calcularConexiones(doc, lib)
  const r = compilarNetlist(doc, lib, con)
  expect(r.errores).toEqual([])
  const sim = new Simulator(JSON.stringify(r.netlist), paso)
  sim.advance_to(t, 200000)
  const v = sim.voltages()
  sim.free()
  const out: Record<string, number> = {}
  for (const clave of pines) {
    const [pieza, pin] = clave.split('.')
    const red = con.redDePin.get(`p_${pieza}:${pin}`)
    if (red === undefined) throw new Error(`${clave}: sin red`)
    out[clave] = v[r.nodoDeRed.get(red)!]
  }
  return out
}

/** Voltaje de un pin cada `cada` segundos entre `desde` y `hasta`. */
function traza(doc: Documento, pin: string, desde: number, hasta: number, cada: number, paso = 1e-6): { t: number; v: number }[] {
  const con = calcularConexiones(doc, lib)
  const r = compilarNetlist(doc, lib, con)
  expect(r.errores).toEqual([])
  const [pieza, id] = pin.split('.')
  const nodo = r.nodoDeRed.get(con.redDePin.get(`p_${pieza}:${id}`)!)!
  const sim = new Simulator(JSON.stringify(r.netlist), paso)
  const out: { t: number; v: number }[] = []
  for (let t = desde; t <= hasta + 1e-12; t += cada) {
    sim.advance_to(t, 400000)
    out.push({ t, v: sim.voltages()[nodo] })
  }
  sim.free()
  return out
}

/** Las reglas del editor que cumple cualquier circuito generado: nada encimado, cables limpios, sin avisos y la nota aparte. */
function reglasDelEditor(a: Armado): Documento {
  const d = armar(a.def, lib, a.nombre)
  for (const p of Object.values(d.piezas)) expect(colisiona(d, lib, p), p.ref).toBeNull()
  expect(conflictoDeTocados(d, lib, { piezas: Object.keys(d.piezas), cables: Object.keys(d.cables) })).toBeNull()
  const con = calcularConexiones(d, lib)
  expect(avisosDelCircuito(d, con, lib)).toEqual([])
  for (const [x, y] of a.def.conexiones) {
    const red = (c: string) => con.redDePin.get(`p_${c.split('.')[0]}:${c.split('.')[1]}`)
    expect(red(x), `${x} - ${y}`).toBeDefined()
    expect(red(x), `${x} - ${y}`).toBe(red(y))
  }
  for (const n of Object.values(d.notas)) {
    const c = cajaNota(n)
    for (const p of Object.values(d.piezas)) {
      const q = cuerpoEnMundo(p, lib.get(p.tipo), 1)
      expect(c.minX < q.maxX && q.minX < c.maxX && c.minY < q.maxY && q.minY < c.maxY, `la nota cubre ${p.ref}`).toBe(false)
    }
    for (const k of Object.values(d.cables))
      for (let i = 1; i < k.puntos.length; i++) expect(tramoCruzaCaja(k.puntos[i - 1], k.puntos[i], c), 'la nota cruza un cable').toBe(false)
  }
  expect(a.nombre).not.toMatch(/[—:*?"<>|/\\]/)
  expect(a.descripcion.length).toBeLessThanOrEqual(300)
  expect(`${a.nombre}${a.descripcion}`).not.toMatch(/—/)
  return d
}

/** Las referencias del circuito por tipo, para comprobar que R1 y C1 son las piezas de la calculadora y no las auxiliares. */
const refDe = (d: Documento, clave: string) => d.piezas[`p_${clave}`].ref

describe('divisor generado', () => {
  const e = { vin: 9, vout: 5, modo: 'resistencia', valor: 10e3 } as const
  const r = ok(divisor(e, E12))
  const a = circuitoDivisor(e, r)

  it('cumple las reglas del editor y R1 y R2 son las primeras resistencias', () => {
    const d = reglasDelEditor(a)
    expect([refDe(d, 'r1'), refDe(d, 'r2')]).toEqual(['R1', 'R2'])
  })
  it('simulado da el Vout real de la ficha, y está a menos de 10 % del pedido', () => {
    const v = voltajes(armar(a.def, lib), ['r1.2'], 1e-3)
    expect(v['r1.2']).toBeCloseTo(r.voutReal, 3)
    expect(Math.abs(v['r1.2'] - e.vout) / e.vout).toBeLessThan(0.1)
  })
  it('una resistencia que pasa de 1/4 W sale con su potencia nominal', () => {
    const fuerte = ok(divisor({ vin: 12, vout: 6, modo: 'resistencia', valor: 100 }, E12))
    const d = armar(circuitoDivisor({ vin: 12, vout: 6, modo: 'resistencia', valor: 100 }, fuerte).def, lib)
    expect(d.piezas.p_r1.props.potencia).toBe('1 W')
  })
})

describe('LED generado', () => {
  for (const [color, vs] of [['rojo', 5], ['verde', 5], ['azul', 9], ['blanco', 12], ['amarillo', 3.3]] as const) {
    it(`${color} a ${vs} V: la corriente simulada es la de la ficha y está a menos de 12 % de los 10 mA pedidos`, () => {
      const m = modeloLed(lib, color)!
      const e = { vs, i: 0.01, modelo: m }
      const r = ok(led(e, E12))
      const a = circuitoLed(e, r, color)
      const d = reglasDelEditor(a)
      const v = voltajes(d, ['r1.2'], 5e-3)
      const i = (vs - v['r1.2']) / r.rc
      expect(Math.abs(i / r.iReal - 1)).toBeLessThan(0.02)
      expect(Math.abs(i / 0.01 - 1)).toBeLessThan(0.12)
      expect(v['r1.2']).toBeCloseTo(r.vfReal, 1)
    })
  }
})

describe('filtro RC generado', () => {
  for (const tipo of ['bajas', 'altas'] as const) {
    it(`paso ${tipo}: en la frecuencia de corte real la señal baja a 70.7 %, y fc real a menos de 10 % de la pedida`, () => {
      const e = { tipo, fc: 1000, dado: 'C', valor: 100e-9 } as const
      const r = ok(filtroRC(e, E12))
      const a = circuitoFiltro(e, r)
      const d = reglasDelEditor(a)
      // La salida es el capacitor (bajas) o la resistencia (altas): el nodo común de los dos.
      const pin = tipo === 'bajas' ? 'c1.1' : 'r1.1'
      const T = 1 / r.fcReal
      const m = traza(d, pin, 8 * T, 10 * T, T / 200, 1e-6)
      const v = m.map((x) => x.v)
      expect((Math.max(...v) - Math.min(...v)) / 2).toBeCloseTo(0.707, 1)
      expect(Math.abs((Math.max(...v) - Math.min(...v)) / 2 / 0.7071 - 1)).toBeLessThan(0.04)
      expect(Math.abs(r.fcReal / e.fc - 1)).toBeLessThan(0.1)
    })
  }
})

describe('555 astable generado', () => {
  const casos = [
    { f: 1000, d: 0.6, c: 100e-9, tolF: 0.1 },
    { f: 100, d: 0.75, c: 1e-6, tolF: 0.1 }
  ]
  for (const k of casos) {
    it(`${k.f} Hz al ${k.d * 100} % con ${k.c * 1e6} µF: la frecuencia y el ciclo simulados son los de la ficha`, () => {
      const e = { f: k.f, d: k.d, c: k.c }
      const r = ok(astable555(e, E12))
      const a = circuitoAstable(e, r)
      const d = reglasDelEditor(a)
      expect([refDe(d, 'r1'), refDe(d, 'r2'), refDe(d, 'c1')]).toEqual(['R1', 'R2', 'C1'])
      const T = 1 / r.fReal
      const m = traza(d, 'u1.3', 2 * T, 14 * T, T / 400, 2e-6)
      const subidas = m.filter((x, i) => i > 0 && x.v >= 2.5 && m[i - 1].v < 2.5).map((x) => x.t)
      const bajadas = m.filter((x, i) => i > 0 && x.v < 2.5 && m[i - 1].v >= 2.5).map((x) => x.t)
      expect(subidas.length).toBeGreaterThan(8)
      const f = (subidas.length - 1) / (subidas.at(-1)! - subidas[0])
      // El 555 simulado tiene retardos y la salida no llega a Vcc: unos pocos por ciento de diferencia con la fórmula.
      expect(Math.abs(f / r.fReal - 1)).toBeLessThan(0.05)
      const altos = subidas.slice(0, -1).map((s, i) => bajadas.find((b) => b > s)! - s).filter(Number.isFinite)
      const ciclo = altos.reduce((x, y) => x + y, 0) / altos.length / (1 / f)
      expect(Math.abs(ciclo - r.dReal)).toBeLessThan(0.04)
      // Y dentro del error de los valores comerciales respecto de lo pedido.
      expect(Math.abs(f / k.f - 1)).toBeLessThan(k.tolF)
      expect(Math.abs(ciclo - k.d)).toBeLessThan(0.1)
    })
  }
})

describe('555 monoestable generado', () => {
  for (const k of [{ t: 0.1, c: 10e-6 }, { t: 0.01, c: 100e-9 }]) {
    it(`${k.t} s con ${k.c * 1e6} µF: el pulso simulado dura lo que dice la ficha`, () => {
      const e = { t: k.t, c: k.c }
      const r = ok(monoestable555(e, E12))
      const a = circuitoMonoestable(e, r)
      const d = reglasDelEditor(a)
      expect([refDe(d, 'r1'), refDe(d, 'c1')]).toEqual(['R1', 'C1'])
      const horizonte = 6 * r.tReal
      const m = traza(d, 'u1.3', 0, horizonte, r.tReal / 400, Math.min(2e-6, r.tReal / 2000))
      const dur: number[] = []
      let ini: number | null = null
      for (const x of m) {
        if (x.v > 2.5 && ini === null) ini = x.t
        if (x.v <= 2.5 && ini !== null) {
          dur.push(x.t - ini)
          ini = null
        }
      }
      expect(dur.length).toBeGreaterThan(0)
      for (const x of dur) expect(Math.abs(x / r.tReal - 1)).toBeLessThan(0.06)
      // Dentro del error de los valores comerciales respecto de lo pedido.
      for (const x of dur) expect(Math.abs(x / k.t - 1)).toBeLessThan(0.2)
    })
  }
})

describe('amplificador generado', () => {
  const modelo = modeloAmpOp(lib, 'LM741')!
  it('inversor de ganancia 10: la salida simulada es la de la ficha', () => {
    const e = { tipo: 'inversor', g: 10, rin: 1000, vs: 15, vin: 0.5, modelo } as const
    const r = ok(amplificador(e, E12))
    const d = reglasDelEditor(circuitoAmplificador(e, r, 'LM741'))
    expect([refDe(d, 'r1'), refDe(d, 'r2')]).toEqual(['R1', 'R2'])
    const v = voltajes(d, ['u1.OUT'], 5e-3)
    expect(v['u1.OUT']).toBeCloseTo(r.vout, 1)
    expect(v['u1.OUT']).toBeCloseTo(-5, 1)
  })
  it('no inversor de ganancia 5 con E12: da 4.9 y no 5, que es el error del valor comercial', () => {
    const e = { tipo: 'no-inversor', g: 5, rin: 1000, vs: 12, vin: 0.5, modelo } as const
    const r = ok(amplificador(e, E12))
    const d = reglasDelEditor(circuitoAmplificador(e, r, 'LM741'))
    const v = voltajes(d, ['u1.OUT'], 5e-3)
    expect(r.gReal).toBeCloseTo(4.9, 9)
    expect(v['u1.OUT']).toBeCloseTo(0.5 * 4.9, 1)
    expect(Math.abs(v['u1.OUT'] / (0.5 * 5) - 1)).toBeLessThan(0.05)
  })
  it('con una fuente corta la salida satura donde dice la ficha (modelo del LM741 y del LM358)', () => {
    for (const nombre of ['LM741', 'LM358']) {
      const m = modeloAmpOp(lib, nombre)!
      const e = { tipo: 'inversor', g: 10, rin: 1000, vs: 5, vin: 1, modelo: m } as const
      const r = ok(amplificador(e, E12))
      expect(r.satura).toBe(true)
      const d = reglasDelEditor(circuitoAmplificador(e, r, nombre))
      const v = voltajes(d, ['u1.OUT'], 5e-3)
      // Pide −10 V: se queda en el límite de abajo del modelo.
      expect(v['u1.OUT']).toBeLessThan(0)
      expect(Math.abs(Math.abs(v['u1.OUT']) - r.vsatMenos)).toBeLessThan(0.35)
    }
  })
  it('el nombre de los terminales de riel no arrastra coma flotante y el de la ganancia lleva el menos tipográfico', () => {
    const e = { tipo: 'inversor', g: 100, rin: 1000, vs: 0.1 + 0.2, vin: 0.001, modelo } as const
    const r = ok(amplificador(e, E12))
    const a = circuitoAmplificador(e, r, 'LM741')
    const nombres = a.def.partes.filter((p) => p[1] === 'alimentacion').map((p) => p[5]?.nombre)
    expect(nombres).toEqual(['+0.3V', '-0.3V'])
    expect(a.nombre).toBe('Amplificador inversor de ganancia −100')
    const b = circuitoAmplificador({ ...e, tipo: 'no-inversor', g: 5, vs: 12 }, ok(amplificador({ ...e, tipo: 'no-inversor', g: 5, vs: 12 }, E12)), 'LM741')
    expect(b.nombre).toBe('Amplificador no inversor de ganancia 4.9')
  })
})

/** Amplitud (pico) de la señal en un pin con el generador a la frecuencia `f`, tras asentarse el transitorio. */
function amplitud(doc: Documento, pin: string, f: number, periodosAsentar = 25): number {
  const d: Documento = JSON.parse(JSON.stringify(doc))
  d.piezas.p_g1.props.frecuencia = String(f)
  const T = 1 / f
  const m = traza(d, pin, periodosAsentar * T, (periodosAsentar + 2) * T, T / 100, Math.min(1e-5, T / 200))
  const v = m.map((x) => x.v)
  return (Math.max(...v) - Math.min(...v)) / 2
}

describe('textos de las piezas de las calculadoras', () => {
  it('el astable lleva la posición a mano de la referencia y el valor del 555, y ningún circuito trae notas', () => {
    const e = { f: 1000, d: 0.6, c: 100e-9 }
    const a = circuitoAstable(e, ok(astable555(e, E12)))
    const d = armar(a.def, lib)
    expect(d.piezas.p_u1.textos).toEqual({ ref: { lugar: 'arriba-derecha' }, valor: { x: -3.13, y: 7.61 } })
    expect(d.piezas.p_r1.textos).toEqual({ ref: { lugar: 'abajo' }, valor: { lugar: 'abajo' } })
    expect(Object.keys(d.notas)).toEqual([])
    const f = armar(circuitoFiltro({ tipo: 'bajas', fc: 1000, dado: 'C', valor: 100e-9 }, ok(filtroRC({ tipo: 'bajas', fc: 1000, dado: 'C', valor: 100e-9 }, E12))).def, lib)
    expect(f.piezas.p_r1.textos).toEqual({ ref: { x: 0, y: -5 }, valor: { lugar: 'arriba' } })
    expect(f.piezas.p_c1.textos).toEqual({ ref: { lugar: 'arriba-izquierda' }, valor: { lugar: 'arriba' } })
  })
})

describe('pasa banda generado', () => {
  const e = { fl: 100, fh: 10e3, c: 100e-9 }
  const r = ok(pasaBanda(e, E12))
  const a = circuitoPasaBanda(r)
  it('cumple las reglas del editor, sin notas, y R1 y C1 son las primeras piezas de su tipo', () => {
    const d = reglasDelEditor(a)
    expect([refDe(d, 'r1'), refDe(d, 'c1')]).toEqual(['R1', 'C1'])
    expect(Object.keys(d.notas)).toEqual([])
  })
  it('simulado: la amplitud en el centro, en los cortes de −3 dB y fuera de banda es la de la ficha', () => {
    const d = armar(a.def, lib)
    const salida = 'c2.1'
    expect(amplitud(d, salida, r.f0)).toBeCloseTo(r.gCentro, 1)
    expect(Math.abs(amplitud(d, salida, r.f0) / r.gCentro - 1)).toBeLessThan(0.03)
    for (const f of [r.fl3, r.fh3]) expect(Math.abs(amplitud(d, salida, f) / (r.gPico / Math.SQRT2) - 1)).toBeLessThan(0.04)
    const H = (f: number) => Math.hypot(respuestaPasaBanda(f, r.r1c, r.c1c, r.r2c, r.c2c).re, respuestaPasaBanda(f, r.r1c, r.c1c, r.r2c, r.c2c).im)
    for (const f of [10, 1e5]) expect(Math.abs(amplitud(d, salida, f, f < 100 ? 4 : 25) / H(f) - 1)).toBeLessThan(0.05)
  })
})

describe('rechaza banda generado', () => {
  const e = { fl: 100, fh: 10e3, c: 100e-9 }
  const r = ok(rechazaBanda(e, E12))
  const a = circuitoRechazaBanda(r)
  it('cumple las reglas del editor y sin notas', () => {
    const d = reglasDelEditor(a)
    expect(Object.keys(d.notas)).toEqual([])
  })
  it('simulado: la muesca en el centro, la banda baja y la banda alta son las de la ficha', () => {
    const d = armar(a.def, lib)
    const salida = 'u1.OUT'
    const H = (f: number) => Math.hypot(respuestaRechazaBanda(f, r.r1c, r.r2c, r.cc, r.rs).re, respuestaRechazaBanda(f, r.r1c, r.r2c, r.cc, r.rs).im)
    expect(Math.abs(amplitud(d, salida, r.f0) - H(r.f0))).toBeLessThan(0.01)
    expect(amplitud(d, salida, r.f0)).toBeLessThan(0.1)
    expect(Math.abs(amplitud(d, salida, 10, 3) / r.gBaja - 1)).toBeLessThan(0.03)
    expect(Math.abs(amplitud(d, salida, 30e3) / H(30e3) - 1)).toBeLessThan(0.03)
    expect(r.gAlta).toBeCloseTo(1, 2)
  })
})

describe('notch generado', () => {
  const e = { f0: 1000, c: 100e-9 }
  const r = ok(notchDobleT(e, E12))
  const a = circuitoNotch(r)
  it('cumple las reglas del editor, sin notas', () => {
    const d = reglasDelEditor(a)
    expect(Object.keys(d.notas)).toEqual([])
  })
  it('simulado: casi nada pasa en f0 real y 0.927 una década antes y después', () => {
    const d = armar(a.def, lib)
    expect(amplitud(d, 'c2.2', r.f0Real, 40)).toBeLessThan(0.02)
    for (const f of [r.f0Real / 10, r.f0Real * 10]) expect(Math.abs(amplitud(d, 'c2.2', f, f < 500 ? 5 : 40) / r.gDecada - 1)).toBeLessThan(0.03)
  })
})

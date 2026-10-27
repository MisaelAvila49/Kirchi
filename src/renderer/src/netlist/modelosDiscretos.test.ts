// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { calcularConexiones } from '../conexiones/conexiones'
import { conEtiquetas, type Parte } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import { leerResultados } from '../sim/lectura'
import init, { Simulator } from '../sim/pkg/kirchi_engine.js'
import { compilarNetlist } from './netlist'
import { errorDeRango } from './rangos'

// Bloque 2 de la serie: cada modelo discreto contra los puntos clave de su hoja de datos, con la tolerancia que la
// hoja publica. La comparación con ngspice con los mismos parámetros está en `referencias.test.ts`. Donde la hoja solo da un
// máximo o un mínimo, la prueba exige estar dentro y, además, la cifra típica a la que se ajustó el modelo.

const lib = libreriaDePrueba().piezas
let memoria: WebAssembly.Memory
beforeAll(async () => {
  memoria = (await init({ module_or_path: readFileSync(join(import.meta.dirname, '../sim/pkg/kirchi_engine_bg.wasm')) })).memory
})

export const R = (ref: string, valor: string, a: string, b: string): Parte => ({ tipo: 'resistencia', ref, props: { valor }, pines: { '1': a, '2': b } })
export const DC = (ref: string, voltaje: string, mas: string, menos = '0'): Parte => ({ tipo: 'fuente-dc', ref, props: { voltaje }, pines: { '+': mas, '-': menos } })

/** Punto de operación: el voltaje de cada red por nombre y la corriente (A, positiva entrando por el primer terminal) de cada pieza por referencia. */
function punto(partes: Parte[], fin = 2e-3, fino = false, hmax = 1e-5): { v: (red: string) => number; i: (ref: string) => number } {
  const d = conEtiquetas(lib, partes)
  const con = calcularConexiones(d, lib)
  const r = compilarNetlist(d, lib, con)
  expect(r.errores).toEqual([])
  const sim = new Simulator(JSON.stringify(r.netlist), hmax)
  // `fino`: tolerancias muy cortas para medir una pendiente (la impedancia dinámica de un Zener) sin el ruido de reltol 1e-4.
  if (fino) sim.set_tolerances(1e-9, 1e-14, 1e-10)
  else sim.set_tolerances(1e-4, 1e-12, 1e-7)
  sim.advance_to(fin, 10_000_000)
  const n = sim.element_count()
  const f64 = (p: number, k = n) => new Float64Array(memoria.buffer, p, k).slice()
  const g = sim.digital_count()
  const l = leerResultados(r, { time: sim.time(), ratio: 1, capacity: 1, seq: 0, consistente: true, voltages: sim.voltages(), currents: f64(sim.currents_ptr()), aux: f64(sim.aux_ptr()), estado: f64(sim.estado_ptr()), niveles: f64(sim.niveles_ptr(), g), medidas: f64(sim.medidas_ptr(), 3 * g) })
  sim.free()
  const idDe = (ref: string) => Object.values(d.piezas).find((p) => p.ref === ref)!.id
  return {
    v: (red) => l.redes.get(con.redes.findIndex((x) => x.nombre === red))!,
    i: (ref) => l.piezas.get(idDe(ref))!.i
  }
}

const diodo = (modelo: string, a: string, k: string): Parte => ({ tipo: 'diodo', ref: 'D1', props: { modelo }, pines: { A: a, K: k } })

describe('diodos contra su hoja de datos', () => {
  // Corriente de prueba por la resistencia: la caída del diodo es V1 - R·I.
  const vf = (modelo: string, r: string) => punto([DC('V1', '5', '1'), R('R1', r, '1', '2'), diodo(modelo, '2', '0')]).v('2')

  it('1N4148: VF a 10 mA bajo el máximo de 1 V de Vishay 81857 y en los 0.72 V a los que se ajustó', () => {
    const v = vf('1N4148', '430')
    expect(v).toBeLessThanOrEqual(1)
    expect(v).toBeCloseTo(0.72, 1)
    expect(Math.abs(v - 0.72)).toBeLessThan(0.02)
  })

  it('1N4007: VFM a 1 A bajo el máximo de 1.0 V de Diodes ds28002 y en los 0.90 V a los que se ajustó', () => {
    const v = vf('1N4007', '4.1')
    expect(v).toBeLessThanOrEqual(1.0)
    expect(Math.abs(v - 0.9)).toBeLessThan(0.02)
  })

  it('1N5819: VF bajo los máximos de Vishay 88525 (0.60 V a 1 A, 0.90 V a 3.1 A) y en los 0.45 y 0.69 V a los que se ajustó', () => {
    const a = punto([DC('V1', '5', '1'), R('R1', '4.3', '1', '2'), diodo('1N5819', '2', '0')])
    expect(a.v('2')).toBeLessThanOrEqual(0.6)
    expect(Math.abs(a.v('2') - 0.45)).toBeLessThan(0.02)
    // 3.1 A: (5 - 0.69) / 3.1 = 1.39 ohm.
    const b = punto([DC('V1', '5', '1'), R('R1', '1.39', '1', '2'), diodo('1N5819', '2', '0')])
    expect(b.v('2')).toBeLessThanOrEqual(0.9)
    expect(Math.abs(b.v('2') - 0.69)).toBeLessThan(0.03)
  })

  it('en inversa, la corriente de fuga queda bajo el máximo de la hoja (1N4148: 25 nA a 20 V; 1N4007: 5 µA; 1N5819: 1 mA)', () => {
    const fuga = (modelo: string, vr: string) => Math.abs(punto([DC('V1', vr, '1'), R('R1', '100k', '1', '2'), diodo(modelo, '0', '2')]).i('R1'))
    expect(fuga('1N4148', '20')).toBeLessThanOrEqual(25e-9)
    expect(fuga('1N4007', '1000')).toBeLessThanOrEqual(5e-6)
    expect(fuga('1N5819', '40')).toBeLessThanOrEqual(1e-3)
  })

  it('1N4001: VF a 1 A bajo el máximo de 1.1 V de Vishay 88503 y en los 0.90 V a los que se ajustó, y fuga bajo 5 µA a 50 V', () => {
    const v = vf('1N4001', '4.1')
    expect(v).toBeLessThanOrEqual(1.1)
    expect(Math.abs(v - 0.9)).toBeLessThan(0.02)
    expect(Math.abs(punto([DC('V1', '50', '1'), R('R1', '100k', '1', '2'), diodo('1N4001', '0', '2')]).i('R1'))).toBeLessThanOrEqual(5e-6)
  })

  it('1N4001: en inversa conduce a partir de sus 50 V y el 1N4007 no', () => {
    const inversa = (modelo: string) => Math.abs(punto([DC('V1', '60', '1'), R('R1', '1k', '1', '2'), diodo(modelo, '0', '2')]).i('R1'))
    expect(inversa('1N4001')).toBeGreaterThan(5e-3)
    expect(inversa('1N4007')).toBeLessThan(1e-6)
  })

  it('el diodo Genérico sigue siendo el de antes (los .kir anteriores no cambian)', () => {
    const sin = punto([DC('V1', '5', '1'), R('R1', '430', '1', '2'), { tipo: 'diodo', ref: 'D1', pines: { A: '2', K: '0' } }]).v('2')
    expect(vf('Genérico', '430')).toBe(sin)
  })
})

describe('Zener 1N4728A a 1N4761A y BZX55C contra su hoja de datos', () => {
  const def = lib.get('zener')!.modelo as unknown as { serie: Record<string, { izt: number; zzt: number }>; por: { valores: Record<string, Record<string, { izt: number; zzt: number }>> } }
  const familias: Record<string, Record<string, { izt: number; zzt: number }>> = { '1N47xxA': def.serie, BZX55C: def.por.valores.BZX55C }
  // Una fuente de corriente empuja Izt por el Zener en inversa: ánodo a tierra, cátodo en la red k.
  const vz = (familia: string, voltaje: string, corriente: number) =>
    punto([{ tipo: 'fuente-corriente', ref: 'I1', props: { corriente: String(corriente) }, pines: { entrada: '0', salida: 'k' } }, { tipo: 'zener', ref: 'D1', props: { familia, voltaje }, pines: { A: '0', K: 'k' } }, R('R1', '1G', 'k', '0')], 2e-3, true).v('k')

  it.each(Object.keys(familias))('%s: con Izt hay el voltaje Zener nominal, dentro de la tolerancia de la hoja (±5 % en 1N47xxA, −5 % a +7 % en BZX55C)', (familia) => {
    const tabla = familias[familia]
    expect(Object.keys(tabla).length).toBeGreaterThan(30)
    for (const [v, { izt }] of Object.entries(tabla)) {
      const medido = vz(familia, v, izt)
      const nominal = Number(v)
      expect(Math.abs(medido - nominal) / nominal, `${familia} ${v} V: ${medido}`).toBeLessThan(0.01)
    }
  })

  it.each(Object.keys(familias))('%s: la impedancia dinámica a Izt es la ZZT de la hoja (10 %%)', (familia) => {
    for (const [v, { izt, zzt }] of Object.entries(familias[familia])) {
      const z = (vz(familia, v, izt * 1.1) - vz(familia, v, izt * 0.9)) / (izt * 0.2)
      expect(Math.abs(z - zzt) / zzt, `${familia} ${v} V: ${z} Ω contra ${zzt} Ω`).toBeLessThan(0.1)
    }
  })
})

describe('Zener de 27 a 75 V en archivos de antes de la propiedad Familia', () => {
  // Antes de la serie (rama `main`) la tabla llegaba a 24 V y un Zener de más voltaje tomaba la fila de 24 V (10.5 mA y 25 Ω).
  // Un .kir de entonces no trae `familia`: debe seguir saliendo igual. Uno nuevo la trae y usa la fila de su voltaje.
  const diodoDe = (props: Record<string, string>) => {
    const r = compilar([DC('V1', '5', '1'), R('R1', '1k', '1', '2'), { tipo: 'zener', ref: 'D1', props, pines: { A: '0', K: '2' } }])
    expect(r.errores).toEqual([])
    const d = r.netlist!.elements.find((e) => e.type === 'D')!
    return d as unknown as { rs: number; bv: number; ibv: number }
  }
  const antes = (voltaje: number) => {
    const rs = 25 - 0.0259 / 0.0105
    return { rs, bv: voltaje - 0.0105 * rs, ibv: 0.0105 }
  }

  it.each(['27', '33', '47', '56', '68', '75'])('%s V sin familia: la fila de 24 V, como en main', (v) => {
    const d = diodoDe({ voltaje: v })
    const e = antes(Number(v))
    expect(d.rs).toBeCloseTo(e.rs, 1)
    expect(d.bv).toBeCloseTo(e.bv, 2)
    expect(d.ibv).toBe(0.0105)
  })

  it.each(['27', '33', '47', '56', '68', '75'])('%s V con familia 1N47xxA: su propia fila de la hoja', (v) => {
    const def = lib.get('zener')!.modelo as unknown as { serie: Record<string, { izt: number; zzt: number }> }
    const fila = def.serie[v]
    expect(diodoDe({ familia: '1N47xxA', voltaje: v }).ibv).toBe(fila.izt)
  })

  it('hasta 24 V, con o sin familia, sale lo mismo que antes', () => {
    for (const v of ['3.3', '5.1', '12', '24']) expect(diodoDe({ voltaje: v })).toEqual(diodoDe({ familia: '1N47xxA', voltaje: v }))
  })
})

// ---- Transistores bipolares de potencia ----
type Bjt = 'npn' | 'pnp'
const fuenteI = (ref: string, corriente: number, entrada: string, salida: string): Parte => ({ tipo: 'fuente-corriente', ref, props: { corriente: String(corriente) }, pines: { entrada, salida } })
const qBjt = (tipo: Bjt, modelo: string, c: string, b: string, e: string): Parte => ({ tipo, ref: 'Q1', props: { modelo }, pines: { C: c, B: b, E: e } })

/** Con VCE fijo y la base manejada por una fuente de corriente: la ganancia hFE = Ic / Ib en el Ic dado (bisección de Ib) y el |VBE|. */
function hfeEn(tipo: Bjt, modelo: string, ic: number, vce: number): { hfe: number; vbe: number } {
  const pnp = tipo === 'pnp'
  const correr = (ib: number) =>
    punto([DC('V1', String(pnp ? -vce : vce), 'c'), pnp ? fuenteI('I1', ib, 'b', '0') : fuenteI('I1', ib, '0', 'b'), qBjt(tipo, modelo, 'c', 'b', '0')])
  let lo = ic / 1e5
  let hi = ic / 0.5
  for (let k = 0; k < 45; k++) {
    const mid = Math.sqrt(lo * hi)
    if (Math.abs(correr(mid).i('V1')) < ic) lo = mid
    else hi = mid
  }
  const ib = Math.sqrt(lo * hi)
  return { hfe: ic / ib, vbe: Math.abs(correr(ib).v('b')) }
}
/** VCE con Ic e Ib forzados (saturación). */
function vceSat(tipo: Bjt, modelo: string, ic: number, ib: number): number {
  const pnp = tipo === 'pnp'
  const p = punto([pnp ? fuenteI('I2', ic, 'c', '0') : fuenteI('I2', ic, '0', 'c'), pnp ? fuenteI('I1', ib, 'b', '0') : fuenteI('I1', ib, '0', 'b'), qBjt(tipo, modelo, 'c', 'b', '0'), R('R1', '1G', 'c', '0')])
  return Math.abs(p.v('c'))
}
/** VBE con el transistor saturado por las corrientes de colector y de base dadas (la VBE(sat) de la hoja). */
function vbeSat(tipo: Bjt, modelo: string, ic: number, ib: number): number {
  const pnp = tipo === 'pnp'
  const p = punto([pnp ? fuenteI('I2', ic, 'c', '0') : fuenteI('I2', ic, '0', 'c'), pnp ? fuenteI('I1', ib, 'b', '0') : fuenteI('I1', ib, '0', 'b'), qBjt(tipo, modelo, 'c', 'b', '0'), R('R1', '1G', 'c', '0')])
  return Math.abs(p.v('b'))
}
const fT = (tipo: Bjt, modelo: string) => 1 / (2 * Math.PI * modeloBjt(tipo, modelo).tf)
const modeloBjt = (tipo: Bjt, modelo: string) => (lib.get(tipo)!.modelo as unknown as { modelos: Record<string, Record<string, number>> }).modelos[modelo]
/** Capacitancia de colector a 10 V de la unión del modelo (la Cob de la hoja de datos). */
const cob10 = (tipo: Bjt, modelo: string) => {
  const m = modeloBjt(tipo, modelo)
  return m.cjc / (1 + 10 / m.vjc) ** m.mjc
}

describe('TIP31 y TIP32 contra la hoja de onsemi TIP31/D', () => {
  it.each(['npn', 'pnp'] as const)('%s: hFE, VBE(on) y VCE(sat) dentro de la hoja y en lo que se ajustó', (tipo) => {
    const m = tipo === 'npn' ? 'TIP31' : 'TIP32'
    const a = hfeEn(tipo, m, 1, 4)
    const b = hfeEn(tipo, m, 3, 4)
    expect(a.hfe).toBeGreaterThanOrEqual(25)
    expect(b.hfe).toBeGreaterThanOrEqual(10)
    expect(b.hfe).toBeLessThanOrEqual(50)
    expect(Math.abs(a.hfe - 50) / 50).toBeLessThan(0.05)
    expect(Math.abs(b.hfe - 25) / 25).toBeLessThan(0.05)
    expect(b.vbe).toBeLessThanOrEqual(1.8)
    expect(Math.abs(b.vbe - 1.3)).toBeLessThan(0.05)
    const sat = vceSat(tipo, m, 3, 0.375)
    expect(sat).toBeLessThanOrEqual(1.2)
    expect(Math.abs(sat - 0.6)).toBeLessThan(0.06)
  })
  it('fT: el tiempo de tránsito deja fT sobre los 3 MHz mínimos de la hoja', () => {
    expect(1 / (2 * Math.PI * modeloBjt('npn', 'TIP31').tf)).toBeGreaterThanOrEqual(3e6)
  })
})

describe('TIP120 y TIP125 contra la hoja de onsemi TIP120/D', () => {
  it.each(['npn', 'pnp'] as const)('%s: hFE de 1000 mín a 0.5 y 3 A, 2500 típico a 4 A, VBE(on), VCE(sat) y Cob', (tipo) => {
    const m = tipo === 'npn' ? 'TIP120' : 'TIP125'
    expect(hfeEn(tipo, m, 0.5, 3).hfe).toBeGreaterThanOrEqual(1000)
    const tres = hfeEn(tipo, m, 3, 3)
    expect(tres.hfe).toBeGreaterThanOrEqual(1000)
    expect(tres.vbe).toBeLessThanOrEqual(2.5)
    expect(Math.abs(hfeEn(tipo, m, 4, 3).hfe - 2500) / 2500).toBeLessThan(0.1)
    expect(vceSat(tipo, m, 3, 0.012)).toBeLessThanOrEqual(2.0)
    expect(vceSat(tipo, m, 5, 0.02)).toBeLessThanOrEqual(4.0)
    expect(cob10(tipo, m)).toBeLessThanOrEqual(tipo === 'npn' ? 200e-12 : 300e-12)
  })
})

describe('BD139 y BD140 contra la hoja de onsemi', () => {
  it.each(['npn', 'pnp'] as const)('%s: hFE de 40 a 250 a 150 mA, 25 mín a 5 mA y 0.5 A, VBE(on) y VCE(sat)', (tipo) => {
    const m = tipo === 'npn' ? 'BD139' : 'BD140'
    const medio = hfeEn(tipo, m, 0.15, 2)
    expect(medio.hfe).toBeGreaterThanOrEqual(40)
    expect(medio.hfe).toBeLessThanOrEqual(250)
    expect(Math.abs(medio.hfe - 100) / 100).toBeLessThan(0.05)
    expect(hfeEn(tipo, m, 0.005, 2).hfe).toBeGreaterThanOrEqual(25)
    const alto = hfeEn(tipo, m, 0.5, 2)
    expect(alto.hfe).toBeGreaterThanOrEqual(25)
    expect(alto.vbe).toBeLessThanOrEqual(1)
    expect(vceSat(tipo, m, 0.5, 0.05)).toBeLessThanOrEqual(0.5)
  })
})

describe('BC337 y BC327 contra las hojas de Diotec y de Rapid', () => {
  it.each(['npn', 'pnp'] as const)('%s: hFE de 100 a 630 a 100 mA y 60 mín a 300 mA, VBE(on) y VCE(sat) dentro de la hoja y en lo que se ajustó', (tipo) => {
    const m = tipo === 'npn' ? 'BC337' : 'BC327'
    const a = hfeEn(tipo, m, 0.1, 1)
    expect(a.hfe).toBeGreaterThanOrEqual(100)
    expect(a.hfe).toBeLessThanOrEqual(630)
    expect(Math.abs(a.hfe - 250) / 250).toBeLessThan(0.08)
    const b = hfeEn(tipo, m, 0.3, 1)
    expect(b.hfe).toBeGreaterThanOrEqual(60)
    expect(Math.abs(b.hfe - 110) / 110).toBeLessThan(0.08)
    expect(b.vbe).toBeLessThanOrEqual(1.2)
    expect(Math.abs(b.vbe - 0.9)).toBeLessThan(0.05)
    const sat = vceSat(tipo, m, 0.5, 0.05)
    expect(sat).toBeLessThanOrEqual(0.7)
    expect(Math.abs(sat - 0.28)).toBeLessThan(0.03)
  })
})

describe('2N5551 y 2N5401 contra las hojas de Diotec, de MCC y de onsemi', () => {
  it('2N5551: hFE de 80 mín a 1 mA, 80 a 250 a 10 mA y 30 mín a 50 mA, VCE(sat) bajo 0.15 y 0.20 V, VBE(sat) bajo 1 V, fT de 100 a 300 MHz y Cob', () => {
    expect(hfeEn('npn', '2N5551', 0.001, 5).hfe).toBeGreaterThanOrEqual(80)
    const medio = hfeEn('npn', '2N5551', 0.01, 5).hfe
    expect(medio).toBeGreaterThanOrEqual(80)
    expect(medio).toBeLessThanOrEqual(250)
    expect(hfeEn('npn', '2N5551', 0.05, 5).hfe).toBeGreaterThanOrEqual(30)
    expect(vceSat('npn', '2N5551', 0.01, 0.001)).toBeLessThanOrEqual(0.15)
    expect(vceSat('npn', '2N5551', 0.05, 0.005)).toBeLessThanOrEqual(0.2)
    expect(1 / (2 * Math.PI * modeloBjt('npn', '2N5551').tf)).toBeGreaterThanOrEqual(100e6)
    expect(cob10('npn', '2N5551')).toBeLessThanOrEqual(6e-12)
    expect(fT('npn', '2N5551')).toBeLessThanOrEqual(300e6)
    expect(vbeSat('npn', '2N5551', 0.01, 0.001)).toBeLessThanOrEqual(1.0)
    expect(vbeSat('npn', '2N5551', 0.05, 0.005)).toBeLessThanOrEqual(1.0)
  })
  it('2N5401: hFE de 50 mín a 1 mA, 60 a 240 a 10 mA y 50 mín a 50 mA, VCE(sat) bajo 0.2 y 0.5 V, VBE(sat) bajo 1 V, fT de 100 a 300 MHz y Cob', () => {
    expect(hfeEn('pnp', '2N5401', 0.001, 5).hfe).toBeGreaterThanOrEqual(50)
    const medio = hfeEn('pnp', '2N5401', 0.01, 5).hfe
    expect(medio).toBeGreaterThanOrEqual(60)
    expect(medio).toBeLessThanOrEqual(240)
    expect(hfeEn('pnp', '2N5401', 0.05, 5).hfe).toBeGreaterThanOrEqual(50)
    expect(vceSat('pnp', '2N5401', 0.01, 0.001)).toBeLessThanOrEqual(0.2)
    expect(vceSat('pnp', '2N5401', 0.05, 0.005)).toBeLessThanOrEqual(0.5)
    expect(1 / (2 * Math.PI * modeloBjt('pnp', '2N5401').tf)).toBeGreaterThanOrEqual(100e6)
    expect(cob10('pnp', '2N5401')).toBeLessThanOrEqual(6e-12)
    expect(fT('pnp', '2N5401')).toBeLessThanOrEqual(300e6)
    expect(vbeSat('pnp', '2N5401', 0.01, 0.001)).toBeLessThanOrEqual(1.0)
    expect(vbeSat('pnp', '2N5401', 0.05, 0.005)).toBeLessThanOrEqual(1.0)
  })
})

describe('2N3055 contra las hojas de ST y de MCC', () => {
  it('hFE de 20 a 70 a 4 A y 5 mín a 10 A, VBE(on) y VCE(sat) dentro de la hoja, y fT sobre los 2.5 MHz mínimos', () => {
    const a = hfeEn('npn', '2N3055', 4, 4)
    expect(a.hfe).toBeGreaterThanOrEqual(20)
    expect(a.hfe).toBeLessThanOrEqual(70)
    expect(a.vbe).toBeLessThanOrEqual(1.5)
    expect(hfeEn('npn', '2N3055', 10, 4).hfe).toBeGreaterThanOrEqual(5)
    expect(vceSat('npn', '2N3055', 4, 0.4)).toBeLessThanOrEqual(1.0)
    expect(vceSat('npn', '2N3055', 10, 3.3)).toBeLessThanOrEqual(3.0)
    expect(1 / (2 * Math.PI * modeloBjt('npn', '2N3055').tf)).toBeGreaterThanOrEqual(2.5e6)
  })
})

// ---- MOSFET de potencia ----
type Canal = 'mosfet-n' | 'mosfet-p'
const mosfet = (tipo: Canal, modelo: string, d: string, g: string, s: string): Parte => ({ tipo, ref: 'Q1', props: { modelo }, pines: { D: d, G: g, S: s } })
const paramsMos = (tipo: Canal, modelo: string) => (lib.get(tipo)!.modelo as unknown as { modelos: Record<string, Record<string, number>> }).modelos[modelo]

/** RDS(on) = VDS / ID con VGS e ID de la hoja (compuerta en una fuente de voltaje, drenador en una fuente de corriente). */
function rdsOn(tipo: Canal, modelo: string, vgs: number, id: number): number {
  const p = tipo === 'mosfet-p'
  const r = punto([DC('V1', String(p ? -vgs : vgs), 'g'), p ? fuenteI('I1', id, 'd', '0') : fuenteI('I1', id, '0', 'd'), mosfet(tipo, modelo, 'd', 'g', '0'), R('R1', '1G', 'd', '0')])
  return Math.abs(r.v('d')) / id
}
/** VGS(th): VGS = VDS con ID = 250 µA, la condición de la hoja. */
function vgsTh(tipo: Canal, modelo: string): number {
  const p = tipo === 'mosfet-p'
  return punto([p ? fuenteI('I1', 250e-6, 'd', '0') : fuenteI('I1', 250e-6, '0', 'd'), mosfet(tipo, modelo, 'd', 'd', '0'), R('R1', '1G', 'd', '0')]).v('d')
}
/** gfs = dID/dVGS con VDS fijo, al ID de la hoja (se busca el VGS que da ese ID y se mide la pendiente). */
function gfs(tipo: Canal, modelo: string, vds: number, id: number): number {
  const p = tipo === 'mosfet-p'
  const corriente = (vgs: number) => Math.abs(punto([DC('V1', String(p ? -vds : vds), 'd'), DC('V2', String(p ? -vgs : vgs), 'g'), mosfet(tipo, modelo, 'd', 'g', '0')]).i('V1'))
  let lo = 0
  let hi = 20
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2
    if (corriente(mid) < id) lo = mid
    else hi = mid
  }
  return (corriente(hi + 0.01) - corriente(hi - 0.01)) / 0.02
}

describe('MOSFET contra su hoja de datos', () => {
  // [tipo, modelo, [VGS, ID, RDS(on) máx, RDS(on) al que se ajustó]...]
  const casos: [Canal, string, [number, number, number, number][], [number, number], number, [number, number] | null][] = [
    ['mosfet-n', 'IRF540N', [[10, 16, 0.044, 0.0352]], [2, 4], 3, [16, 21]],
    ['mosfet-n', 'IRLZ44N', [[10, 25, 0.022, 0.0176], [5, 25, 0.025, 0.02], [4, 21, 0.035, 0.028]], [1, 2], 1.5, [25, 21]],
    ['mosfet-n', 'IRF520', [[10, 5.5, 0.27, 0.216]], [2, 4], 3, [5.5, 2.7]],
    ['mosfet-p', 'IRF4905', [[10, 38, 0.02, 0.016]], [2, 4], 3, [38, 21]]
  ]
  it.each(casos)('%s %s: RDS(on) bajo el máximo de la hoja en cada punto, VGS(th) dentro de su ventana y gfs sobre el mínimo', (tipo, modelo, puntos, [thMin, thMax], thTip, g) => {
    for (const [vgs, id, max, ajustado] of puntos) {
      const r = rdsOn(tipo, modelo, vgs, id)
      expect(r, `${modelo} a ${vgs} V y ${id} A`).toBeLessThanOrEqual(max)
      // El nivel 1 no sigue una sola resistencia en todos los puntos del IRLZ44N: se exige el valor ajustado solo en los dos primeros.
      if (!(modelo === 'IRLZ44N' && vgs === 4)) expect(Math.abs(r - ajustado) / ajustado, `${modelo} a ${vgs} V`).toBeLessThan(0.05)
    }
    const th = Math.abs(vgsTh(tipo, modelo))
    expect(th).toBeGreaterThanOrEqual(thMin)
    expect(th).toBeLessThanOrEqual(thMax)
    expect(Math.abs(th - thTip)).toBeLessThan(0.1)
    if (g) {
      // Con VDS = 50 V (25 V en el IRLZ44N y el IRF4905, como dice su hoja): el motor no debe quedar bajo el mínimo.
      const vds = modelo === 'IRLZ44N' || modelo === 'IRF4905' ? 25 : 50
      expect(gfs(tipo, modelo, vds, g[0])).toBeGreaterThanOrEqual(g[1])
    }
  })
  it('las capacitancias del modelo dan Ciss, Coss y Crss de la hoja a 25 V', () => {
    const hoja: Record<string, [Canal, number, number, number]> = { IRF540N: ['mosfet-n', 1960, 250, 40], IRLZ44N: ['mosfet-n', 1700, 400, 150], IRF520: ['mosfet-n', 360, 150, 34], IRF4905: ['mosfet-p', 3400, 1400, 640] }
    for (const [modelo, [tipo, ciss, coss, crss]] of Object.entries(hoja)) {
      const m = paramsMos(tipo, modelo)
      const cbd25 = m.cbd / Math.sqrt(1 + 25 / m.pb)
      expect((m.cgso + m.cgdo) / 1e-12, `${modelo} Ciss`).toBeCloseTo(ciss, -1)
      expect(m.cgdo / 1e-12, `${modelo} Crss`).toBeCloseTo(crss, 0)
      expect((cbd25 + m.cgdo) / 1e-12, `${modelo} Coss`).toBeGreaterThan(coss * 0.97)
      expect((cbd25 + m.cgdo) / 1e-12, `${modelo} Coss`).toBeLessThan(coss * 1.03)
    }
  })
})

// ---- Amplificadores operacionales ----
const AOp = (modelo: string, mas: string, menos: string, sal: string, vmas: string, vmenos: string): Parte => ({ tipo: 'amp-op', ref: 'U1', props: { modelo }, pines: { '+': mas, '-': menos, OUT: sal, 'V+': vmas, 'V-': vmenos } })
const AC = (ref: string, amplitud: string, frecuencia: string, mas: string): Parte => ({ tipo: 'fuente-ac', ref, props: { amplitud, frecuencia }, pines: { '+': mas, '-': '0' } })
const PULSO = (ref: string, alto: string, frecuencia: string, mas: string): Parte => ({ tipo: 'fuente-pulso', ref, props: { alto, frecuencia, ciclo: '50 %' }, pines: { '+': mas, '-': '0' } })

/** El voltaje de una red en cada paso del motor: tiempos y valores. */
function serie(partes: Parte[], fin: number, hmax: number, red: string): { t: number[]; v: number[] } {
  const d = conEtiquetas(lib, partes)
  const con = calcularConexiones(d, lib)
  const r = compilarNetlist(d, lib, con)
  expect(r.errores).toEqual([])
  const nodo = r.nodoDeRed.get(con.redes.findIndex((x) => x.nombre === red))!
  const sim = new Simulator(JSON.stringify(r.netlist), hmax)
  sim.set_tolerances(1e-4, 1e-12, 1e-7)
  const t: number[] = [0]
  const v: number[] = [0]
  while (sim.time() < fin) {
    sim.advance_to(fin, 1)
    t.push(sim.time())
    v.push(sim.voltages()[nodo])
  }
  sim.free()
  return { t, v }
}

describe('amplificadores operacionales contra su hoja de datos', () => {
  const ao = (modelo: string) => (lib.get('amp-op')!.modelo as unknown as { modelos: Record<string, Record<string, number>> }).modelos[modelo]
  // [modelo, riel (V), GBW de la hoja (Hz), SR de la hoja (V/s), ganancia en continua de la hoja (V/V), escalón del seguidor (V)]
  const hoja: [string, number, number, number, number, number][] = [
    ['LM324', 15, 1.2e6, 0.5e6, 1e5, 5],
    ['OP07', 15, 0.6e6, 0.3e6, 4e5, 5],
    ['NE5532', 15, 12e6, 5e6, 1e5, 5],
    ['TLV9002', 2.5, 1e6, 2e6, 7.1e5, 2],
    ['MCP6002', 2.5, 1e6, 0.6e6, 3.98e5, 2],
    ['OP27', 15, 8e6, 2.8e6, 1.8e6, 5]
  ]
  // Cargas de 1 MΩ y realimentación de 110 kΩ: con la impedancia de salida de 1.2 kΩ del TLV9002 una carga de 10 kΩ le quita 11 % a la salida, que no es del GBW ni del SR.
  const alimentacion = (v: number): Parte[] => [DC('V1', String(v), '1'), DC('V2', String(-v), '2')]

  it.each(hoja)('%s: los parámetros del modelo son los de la hoja', (modelo, _v, gbw, sr, a0) => {
    expect(ao(modelo)).toMatchObject({ gbw, sr, a0 })
  })

  it.each(hoja)('%s: la ganancia en continua de la hoja se ve en un inversor de ganancia 1000', (modelo, riel, _g, _s, a0) => {
    const vin = 1e-3
    const p = punto([...alimentacion(riel), DC('V3', String(vin), '3'), R('R1', '1k', '3', '4'), R('R2', '1M', '4', '5'), R('R3', '10k', '5', '0'), AOp(modelo, '0', '4', '5', '1', '2')])
    // Ganancia de un inversor con A0 finita: -(Rf/Ri) / (1 + (1 + Rf/Ri) / A0).
    const esperado = -vin * 1000 / (1 + 1001 / a0)
    expect(Math.abs((p.v('5') - esperado) / esperado)).toBeLessThan(0.005)
  })

  it.each(hoja)('%s: el ancho de banda de ganancia de la hoja da la ganancia de un inversor ×10 a GBW/10', (modelo, riel, gbw, _s, _a) => {
    const f = gbw / 10
    const amplitud = 0.03
    const periodo = 1 / f
    const { t, v } = serie([...alimentacion(riel), AC('V3', String(amplitud), String(f), '3'), R('R1', '10k', '3', '4'), R('R2', '100k', '4', '5'), R('R3', '1M', '5', '0'), AOp(modelo, '0', '4', '5', '1', '2')], 4 * periodo, periodo / 400, '5')
    // Amplitud del último periodo.
    const pico = Math.max(...v.filter((_, i) => t[i] > 3 * periodo).map(Math.abs))
    // Polo en lazo cerrado: GBW / (1 + Rf/Ri) = GBW / 11, de modo que la ganancia a GBW/10 es 10 / sqrt(1 + (11 / 10)²).
    const esperado = (10 * amplitud) / Math.sqrt(1 + 1.21)
    expect(Math.abs(pico - esperado) / esperado, `${modelo}: ${pico} contra ${esperado}`).toBeLessThan(0.05)
  })

  it.each(hoja)('%s: la velocidad de cambio de la hoja limita el seguidor ante un escalón', (modelo, riel, _g, sr, _a, escalon) => {
    const tSr = escalon / sr
    const fin = 4 * tSr
    const { t, v } = serie([...alimentacion(riel), PULSO('V3', String(escalon), String(1 / (8 * tSr)), '3'), R('R1', '1M', '4', '0'), AOp(modelo, '3', '4', '4', '1', '2')], fin, tSr / 400, '4')
    // La pendiente máxima entre el 20 % y el 80 % del escalón.
    let max = 0
    for (let i = 1; i < t.length; i++) if (v[i] > 0.2 * escalon && v[i] < 0.8 * escalon && t[i] < 4 * tSr) max = Math.max(max, (v[i] - v[i - 1]) / (t[i] - t[i - 1]))
    expect(Math.abs(max - sr) / sr, `${modelo}: ${max} V/s contra ${sr}`).toBeLessThan(0.05)
  })
})

describe('MCP6002, OP27 e Ideal contra su hoja de datos', () => {
  const rieles = (alto: number, bajo: number): Parte[] => [DC('V1', String(alto), '1'), DC('V2', String(bajo), '2')]

  it('MCP6002: la salida llega a 25 mV de cada riel con 10 kΩ a VDD/2 y 0.5 V de sobreexcitación (VDD = 5.5 V)', () => {
    const salida = (vp: number) =>
      punto([...rieles(5.5, 0), DC('V3', String(vp), '3'), DC('V4', '2.5', '4'), DC('V5', '2.75', '5'), R('RL', '10k', '5', 'out'), AOp('MCP6002', '3', '4', 'out', '1', '2')], 2e-3).v('out')
    expect(salida(3)).toBeGreaterThanOrEqual(5.5 - 0.025)
    expect(salida(2)).toBeLessThanOrEqual(0.025)
  })

  it('MCP6002: la corriente de corto de ±23 mA de la hoja (VDD = 5.5 V) limita la salida', () => {
    const corto = punto([...rieles(5.5, 0), DC('V3', '3', '3'), DC('V4', '2.5', '4'), R('RL', '1', 'out', '0'), AOp('MCP6002', '3', '4', 'out', '1', '2')], 2e-3)
    expect(Math.abs(corto.v('out') / 1)).toBeLessThanOrEqual(0.023 * 1.02)
    expect(Math.abs(corto.v('out') / 1)).toBeGreaterThanOrEqual(0.023 * 0.98)
  })

  it('OP27: la salida llega a ±13.8 V con 2 kΩ (±12 V mínimo en la hoja)', () => {
    const salida = (vp: number) => punto([...rieles(15, -15), DC('V3', String(vp), '3'), R('RL', '2k', 'out', '0'), AOp('OP27', '3', '0', 'out', '1', '2')], 2e-3).v('out')
    expect(salida(1)).toBeGreaterThanOrEqual(12)
    expect(Math.abs(salida(1) - 13.8)).toBeLessThan(0.1)
    expect(salida(-1)).toBeLessThanOrEqual(-12)
    expect(Math.abs(salida(-1) + 13.8)).toBeLessThan(0.1)
  })

  it('Ideal: un inversor de ganancia 10 queda a menos de 0.01 % y la salida llega al riel', () => {
    const p = punto([...rieles(15, -15), DC('V3', '0.5', '3'), R('R1', '1k', '3', '4'), R('R2', '10k', '4', 'out'), AOp('Ideal', '0', '4', 'out', '1', '2')], 2e-3)
    expect(Math.abs(p.v('out') / 0.5 + 10) / 10).toBeLessThan(1e-4)
    const sat = punto([...rieles(15, -15), DC('V3', '1', '3'), R('RL', '10k', 'out', '0'), AOp('Ideal', '3', '0', 'out', '1', '2')], 2e-3).v('out')
    expect(Math.abs(sat - 15)).toBeLessThan(1e-3)
  })

  it('Ideal: sus parámetros pasan la validación de rangos del motor', () => {
    const r = compilar([...rieles(15, -15), R('R1', '1k', '3', '0'), R('RL', '10k', 'out', '0'), AOp('Ideal', '3', '0', 'out', '1', '2')])
    expect(r.errores).toEqual([])
    const elementos = r.netlist!.elements.filter((e) => e.type === 'OA')
    expect(elementos).toHaveLength(1)
    expect(errorDeRango(elementos[0], 'U1')).toBeNull()
  })
})

// ---- Comparadores de colector abierto ----
const cmp = (modelo: string, mas: string, menos: string, sal: string, vmas: string): Parte => ({ tipo: 'comparador', ref: 'U1', props: { modelo }, pines: { '+': mas, '-': menos, OUT: sal, 'V+': vmas, 'V-': '0' } })

describe('comparadores LM393 y LM311 contra su hoja de datos', () => {
  /** La salida baja (entrada inversora 100 mV arriba de la no inversora) sosteniendo `ic` en el colector con una fuente de corriente. */
  const vol = (modelo: string, vcc: number, ic: number) =>
    punto([DC('V1', String(vcc), '1'), DC('V3', '1', '3'), DC('V4', '1.1', '4'), fuenteI('I1', ic, '0', 'out'), R('R1', '1G', 'out', '0'), cmp(modelo, '3', '4', 'out', '1')], 2e-3, false).v('out')
  /** La salida alta (no inversora arriba): la corriente que pasa con la salida sostenida a `v` volts. */
  const fuga = (modelo: string, vcc: number, v: number) => Math.abs(punto([DC('V1', String(vcc), '1'), DC('V3', '1', '3'), DC('V4', '0.9', '4'), DC('V5', String(v), 'v5'), R('R9', '100k', 'v5', 'out'), cmp(modelo, '3', '4', 'out', '1')], 2e-3, false).i('R9'))

  it('LM393: VOL de 130 mV típico (400 máx) a 4 mA y salida capaz de 6 mA mínimo con VOL = 1.5 V', () => {
    const v = vol('LM393', 5, 4e-3)
    expect(v).toBeLessThanOrEqual(0.4)
    expect(Math.abs(v - 0.13)).toBeLessThan(0.02)
    // Con la salida sostenida a 1.5 V, la corriente de bajada es mayor que 6 mA.
    const i = Math.abs(punto([DC('V1', '5', '1'), DC('V3', '1', '3'), DC('V4', '1.1', '4'), DC('V5', '1.5', 'out'), cmp('LM393', '3', '4', 'out', '1')]).i('V5'))
    expect(i).toBeGreaterThanOrEqual(6e-3)
  })

  it('LM311: VOL de 0.23 V típico (0.4 máx) a 8 mA con 4.5 V y de 0.75 V típico (1.5 máx) a 50 mA con 15 V', () => {
    const a = vol('LM311', 4.5, 8e-3)
    expect(a).toBeLessThanOrEqual(0.4)
    expect(Math.abs(a - 0.23)).toBeLessThan(0.05)
    const b = vol('LM311', 15, 50e-3)
    expect(b).toBeLessThanOrEqual(1.5)
    expect(Math.abs(b - 0.75)).toBeLessThan(0.1)
  })

  it('con la salida alta la fuga queda bajo el máximo de la hoja (LM393: 1 µA a 30 V; LM311: 10 nA a 35 V)', () => {
    expect(fuga('LM393', 5, 30)).toBeLessThanOrEqual(1e-6)
    expect(fuga('LM311', 15, 35)).toBeLessThanOrEqual(10e-9)
  })

  // Tiempo de respuesta: escalón de 100 mV con 5 mV de sobreexcitación, hasta que la salida cruza 1.4 V.
  const respuesta = (modelo: string, periodo: number, hmax: number, carga: Parte[], vcc: number, vref: number) => {
    const alto = 0.1
    const medir = (mas: string, flanco: number, bajando: boolean) => {
      const { t, v } = serie([DC('V1', String(vcc), '1'), DC('V4', String(mas), '4'), PULSO('V3', String(alto), String(1 / periodo), '3'), DC('V8', String(vref), '8'), ...carga, cmp(modelo, '4', '3', 'out', '1')], flanco + periodo / 2.5, hmax, 'out')
      for (let i = 1; i < t.length; i++) if (t[i] > flanco && (bajando ? v[i - 1] > 1.4 && v[i] <= 1.4 : v[i - 1] < 1.4 && v[i] >= 1.4)) return t[i] - flanco
      return NaN
    }
    // IN+ a 5 mV: el flanco de bajada de la entrada (a mitad del periodo) deja -5 mV, y la salida sube. IN+ a 95 mV: el flanco de subida del siguiente periodo deja +5 mV y la salida baja.
    return { sube: medir('0.005', periodo / 2, false), baja: medir('0.095', periodo, true) }
  }

  it('LM393: respuesta de 1.3 µs típica en la subida (RL = 5.1 kΩ a 5 V), con 15 % de margen', () => {
    const r = respuesta('LM393', 20e-6, 1e-8, [R('RL', '5.1k', '8', 'out')], 5, 5)
    expect(Math.abs(r.sube - 1.3e-6) / 1.3e-6, `sube ${r.sube}`).toBeLessThan(0.15)
    // La hoja del LM393B da 300 ns en la bajada con una entrada TTL: el modelo queda del mismo orden con 5 mV de sobreexcitación.
    expect(r.baja).toBeLessThan(0.6e-6)
  })

  it('LM311: respuesta de 115 ns a nivel alto (500 Ω a 5 V, 5 pF), con 15 % de margen; la de 165 ns a nivel bajo no se reproduce', () => {
    const r = respuesta('LM311', 2e-6, 5e-10, [R('RL', '500', '8', 'out'), { tipo: 'capacitor', ref: 'CL', props: { valor: '5p' }, pines: { '1': 'out', '2': '0' } }], 15, 5)
    expect(Math.abs(r.sube - 115e-9) / 115e-9, `sube ${r.sube}`).toBeLessThan(0.15)
    // DESVIACIÓN CONOCIDA de la hoja (dicha en `fuentes`): la bajada mide 59 ns y la hoja da 165 ns (el transistor de la composición enciende
    // más rápido que la etapa de salida del dispositivo). Se fija el valor medido, con 10 % de margen, para que un cambio del modelo en cualquier
    // sentido se note; si se corrige hacia los 165 ns, este número y la nota de `fuentes` cambian juntos.
    expect(Math.abs(r.baja - 59e-9) / 59e-9, `baja ${r.baja}`).toBeLessThan(0.1)
  })

  it('LM339: VOL de 150 mV típico (400 máx) a 4 mA y salida capaz de 6 mA mínimo con VOL = 1.5 V', () => {
    const v = vol('LM339', 5, 4e-3)
    expect(v).toBeLessThanOrEqual(0.4)
    expect(Math.abs(v - 0.15)).toBeLessThan(0.02)
    const i = Math.abs(punto([DC('V1', '5', '1'), DC('V3', '1', '3'), DC('V4', '1.1', '4'), DC('V5', '1.5', 'out'), cmp('LM339', '3', '4', 'out', '1')]).i('V5'))
    expect(i).toBeGreaterThanOrEqual(6e-3)
  })

  it('LM339: con la salida alta la fuga queda bajo el máximo de la hoja (1 µA a 30 V)', () => {
    expect(fuga('LM339', 5, 30)).toBeLessThanOrEqual(1e-6)
  })

  it('LM339: respuesta de 1.3 µs típica en la subida (RL = 5.1 kΩ a 5 V), con 15 % de margen', () => {
    const r = respuesta('LM339', 20e-6, 1e-8, [R('RL', '5.1k', '8', 'out')], 5, 5)
    expect(Math.abs(r.sube - 1.3e-6) / 1.3e-6, `sube ${r.sube}`).toBeLessThan(0.15)
    expect(r.baja).toBeLessThan(0.6e-6)
  })

  it('avisa si la salida no tiene resistencia de carga a un voltaje, y no avisa con una', () => {
    const base: Parte[] = [DC('V1', '5', '1'), DC('V3', '1', '3'), DC('V4', '1.1', '4'), cmp('LM393', '3', '4', 'out', '1')]
    const aviso = (extra: Parte[]) => compilar([...base, ...extra]).avisos.filter((a) => a.includes('colector abierto'))
    expect(aviso([R('R1', '10k', 'out', '0')])).toEqual(['U1 es de colector abierto y su salida no tiene resistencia de carga a un voltaje: solo baja, nunca sube.'])
    expect(aviso([R('R1', '10k', 'out', '1')])).toEqual([])
    // Un LED con su resistencia hacia V+ también sube la salida; una resistencia a V− no.
    expect(aviso([R('R1', '1k', '1', 'a'), { tipo: 'led', ref: 'D1', props: { color: 'rojo' }, pines: { A: 'a', K: 'out' } }])).toEqual([])
  })
})

describe('reguladores 7809, 7815, 7912 y 7915 contra la hoja de onsemi', () => {
  const fijo = (tipo: string, modelo: string, vin: number, carga: string) =>
    punto([DC('V1', String(vin), 'in'), R('RL', carga, 'out', '0'), { tipo, ref: 'U1', props: { modelo }, pines: { IN: 'in', OUT: 'out', GND: '0' } }], 0.08)
  // [tipo, modelo, entrada de la hoja (V), carga de 0.5 A (Ω), salida típica (V), mínimo y máximo de la hoja a 25 °C (V), reposo típico (mA), caída típica (V)]
  const hoja = [
    ['regulador-positivo', '7809', 15, '18', 9, 8.65, 9.35, 3.4, 2.0],
    ['regulador-positivo', '7815', 23, '30', 15, 14.4, 15.6, 3.5, 2.0],
    ['regulador-negativo', '7912', -19, '24', -12, -12.5, -11.5, 4.4, 1.3],
    ['regulador-negativo', '7915', -23, '30', -15, -15.6, -14.4, 4.4, 1.3]
  ] as const

  it.each(hoja)('%s %s: salida típica de la hoja, dentro de su intervalo y con la corriente de reposo típica', (tipo, modelo, vin, carga, tipica, lo, hi, reposo) => {
    const r = fijo(tipo, modelo, vin, carga)
    expect(r.v('out')).toBeGreaterThanOrEqual(lo)
    expect(r.v('out')).toBeLessThanOrEqual(hi)
    expect(Math.abs(r.v('out') - tipica)).toBeLessThan(0.02)
    const iq = Math.abs(fijo(tipo, modelo, vin, '1G').i('V1')) * 1e3
    expect(Math.abs(iq - reposo)).toBeLessThan(0.15)
    expect(iq).toBeLessThanOrEqual(8)
  })

  it.each(hoja)('%s %s: entrega 1 A con la salida dentro de la regulación de carga de la hoja y regula la línea', (tipo, modelo, vin, _carga, tipica) => {
    const ligera = fijo(tipo, modelo, vin, '10k')
    const plena = fijo(tipo, modelo, vin, String(Math.abs(tipica)))
    expect(Math.abs(plena.i('U1'))).toBeGreaterThan(0.95)
    // Misma exigencia que a los 7805 y 7812: menos de 30 mV de 5 mA a 1 A.
    expect(Math.abs(ligera.v('out') - plena.v('out'))).toBeLessThan(0.03)
    const signo = Math.sign(tipica)
    const a = fijo(tipo, modelo, signo * (Math.abs(tipica) + 4), String(Math.abs(tipica) * 2)).v('out')
    const b = fijo(tipo, modelo, signo * 30, String(Math.abs(tipica) * 2)).v('out')
    expect(Math.abs(a - b)).toBeLessThan(0.03)
  })

  it.each(hoja)('%s %s: la salida mantiene el voltaje con la caída de la hoja a 1 A y lo pierde con 0.4 V menos', (tipo, modelo, _vin, _carga, tipica, _lo, _hi, _iq, caida) => {
    const signo = Math.sign(tipica)
    const objetivo = Math.abs(tipica) - 0.1
    const con = (d: number) => fijo(tipo, modelo, tipica + signo * d, String(objetivo)).v('out')
    expect(Math.abs(con(caida + 0.2))).toBeGreaterThan(objetivo)
    expect(Math.abs(con(caida - 0.4))).toBeLessThan(objetivo)
  })

  it.each(hoja)('%s %s: limita su corriente a unos 2.2 A en un corto', (tipo, modelo, vin) => {
    const corto = fijo(tipo, modelo, vin, '0.1')
    expect(Math.abs(corto.i('U1'))).toBeGreaterThan(1.8)
    expect(Math.abs(corto.i('U1'))).toBeLessThan(2.6)
  })
})

function compilar(partes: Parte[]) {
  const d = conEtiquetas(lib, partes)
  return compilarNetlist(d, lib, calcularConexiones(d, lib))
}

describe('fuentes de los modelos', () => {
  it('cada opción de modelo de las piezas de la serie trae su fuente citada (con documento y URL, salvo el modelo genérico)', () => {
    for (const id of ['diodo', 'zener', 'npn', 'pnp', 'mosfet-n', 'mosfet-p', 'amp-op', 'comparador']) {
      const def = lib.get(id)!
      const prop = def.props.find((p) => p.id === 'modelo' || p.id === 'familia')!
      for (const o of prop.opciones!) {
        // Los modelos que ya existían antes de la serie traen su cita en `limites.por`; los de la serie, en `fuentes`.
        const antes = ['2N2222', '2N3904', 'BC547', '2N2907', '2N3906', 'BC557', '2N7000', 'IRFZ44N', 'BS250', 'IRF9540', 'LM741', 'TL081', 'LM358']
        if (antes.includes(o) || o === 'Genérico' || o === 'Ideal') continue
        const texto = def.fuentes?.[o]
        expect(texto, `${id} ${o}`).toBeTruthy()
        expect(texto, `${id} ${o}`).toMatch(/https?:\/\//)
      }
    }
  })
})

describe('modelo Personalizado en la simulación', () => {
  it('un NPN con sus propios is y bf = 50 da hFE de 50 aunque su lista de modelos diga otra cosa', () => {
    const ic = (spice?: Record<string, number>) =>
      Math.abs(punto([DC('V1', '5', 'c'), fuenteI('I1', 100e-6, '0', 'b'), { ...qBjt('npn', '2N2222', 'c', 'b', '0'), ...(spice ? { spice } : {}) }]).i('V1'))
    expect(ic({ is: 1e-14, bf: 50 }) / 100e-6).toBeGreaterThan(48)
    expect(ic({ is: 1e-14, bf: 50 }) / 100e-6).toBeLessThan(52)
    // Sin juego propio, el 2N2222 de la lista (bf 214 con su corriente de rodilla, ajustado a la hoja de datos) da otra ganancia: unos 134 a 13 mA.
    expect(ic() / 100e-6).toBeGreaterThan(100)
  })
})

describe('JFET contra su hoja de datos', () => {
  // Corriente de drenador (A) con VDS y VGS dados; en canal P ambos son negativos y positivo, respectivamente.
  const id = (tipo: 'jfet-n' | 'jfet-p', modelo: string, vds: number, vgs: number) =>
    Math.abs(punto([DC('V1', String(vds), 'd'), DC('VG', String(vgs), 'g'), { tipo, ref: 'J1', props: { modelo }, pines: { D: 'd', G: 'g', S: '0' } }]).i('V1'))
  const filas: { tipo: 'jfet-n' | 'jfet-p'; modelo: string; s: 1 | -1; idss: [number, number]; voff: [number, number]; gfs?: [number, number]; fuente: string }[] = [
    { tipo: 'jfet-n', modelo: '2N5457', s: 1, idss: [1e-3, 5e-3], voff: [0.5, 6], gfs: [1e-3, 5e-3], fuente: 'Fairchild 2N5457 Rev. G p. 2 y Central 2N5457-5459 p. 1' },
    { tipo: 'jfet-n', modelo: 'J201', s: 1, idss: [0.2e-3, 1e-3], voff: [0.3, 1.5], gfs: [0.5e-3, Infinity], fuente: 'Vishay J/SST201 Rev. G p. 2 y Central J201 p. 1' },
    { tipo: 'jfet-n', modelo: '2N3819', s: 1, idss: [2e-3, 20e-3], voff: [3, 8], gfs: [2e-3, 6.5e-3], fuente: 'Vishay 2N3819 Rev. D p. 2' },
    { tipo: 'jfet-p', modelo: '2N5460', s: -1, idss: [1e-3, 5e-3], voff: [0.75, 6], gfs: [1e-3, 4e-3], fuente: 'Central 2N5460-5462 p. 1' },
    { tipo: 'jfet-p', modelo: 'J175', s: -1, idss: [7e-3, 60e-3], voff: [3, 6], fuente: 'onsemi J175/D Rev. 2 p. 4' }
  ]

  it.each(filas)('$modelo: IDSS, VGS(off) y gfs dentro de los límites de la hoja ($fuente)', ({ tipo, modelo, s, idss, voff, gfs }) => {
    const vds = 15 * s
    const i0 = id(tipo, modelo, vds, 0)
    expect(i0).toBeGreaterThanOrEqual(idss[0])
    expect(i0).toBeLessThanOrEqual(idss[1])
    // VGS(off) se mide con ID = 10 nA: con el voltaje mínimo de la hoja todavía conduce más y con el máximo ya no.
    expect(id(tipo, modelo, vds, -s * voff[0])).toBeGreaterThan(10e-9)
    expect(id(tipo, modelo, vds, -s * voff[1])).toBeLessThanOrEqual(10e-9)
    if (gfs) {
      const g = (id(tipo, modelo, vds, 0) - id(tipo, modelo, vds, -s * 0.01)) / 0.01
      expect(g).toBeGreaterThanOrEqual(gfs[0])
      expect(g).toBeLessThanOrEqual(gfs[1])
    }
  })

  it('J175: rDS(on) a VDS = −0.1 V y VGS = 0 queda bajo los 125 Ω máximos de onsemi J175/D p. 4', () => {
    expect(0.1 / id('jfet-p', 'J175', -0.1, 0)).toBeLessThanOrEqual(125)
  })
})

describe('termistor NTC contra su hoja de datos', () => {
  const ntc = (modelo: string, temperatura: number, a: string, b: string): Parte => ({ tipo: 'ntc', ref: 'TH1', props: { modelo, temperatura: String(temperatura) }, pines: { '1': a, '2': b } })
  // Resistencia en un divisor con 1 MΩ: el calentamiento propio (microvatios) no mueve la lectura.
  const resistencia = (modelo: string, t: number) => {
    const v = punto([DC('V1', '5', '1'), R('R1', '1M', '1', '2'), ntc(modelo, t, '2', '0')]).v('2')
    return (v * 1e6) / (5 - v)
  }
  const tabla: [string, string, [number, number][]][] = [
    ['10 kΩ', 'Vishay NTCLE100E3 (29049) p. 10', [[-20, 96358], [0, 32554], [25, 10000], [50, 3605], [100, 677.3]]],
    ['100 kΩ', 'Vishay NTCLE100E3 (29049) p. 12', [[-20, 1041000], [0, 340900], [25, 100000], [50, 34310], [100, 5835]]]
  ]

  it.each(tabla)('%s: R a -20, 0, 25, 50 y 100 °C da la tabla R/T de la hoja al 1 %% (%s)', (modelo, _fuente, filas) => {
    for (const [t, ohms] of filas) expect(Math.abs(resistencia(modelo, t) / ohms - 1), `${modelo} a ${t} °C`).toBeLessThan(0.01)
  })

  it.each([['10 kΩ', 3977, 0.0075], ['100 kΩ', 4190, 0.015]] as const)('%s: B25/85 sale de R25 y R85 dentro de la tolerancia de la hoja (%i K)', (modelo, b, tol) => {
    const medida = Math.log(resistencia(modelo, 25) / resistencia(modelo, 85)) / (1 / 298.15 - 1 / 358.15)
    expect(Math.abs(medida / b - 1)).toBeLessThan(tol)
  })

  it('el limitador de arranque de 5 Ω a 3 A se asienta cerca de los 0.261 Ω de la hoja de Thinking SCK08053', () => {
    // 3 A hasta 5 constantes de tiempo (38 s): la resistencia residual depende del ajuste de B, por eso 10 %.
    const v = punto([fuenteI('I1', 3, '0', '1'), ntc('Arranque 5 Ω', 25, '1', '0')], 250, false, 0.5).v('1')
    expect(Math.abs(v / 3 / 0.261 - 1)).toBeLessThan(0.1)
    expect(Math.abs(resistencia('Arranque 5 Ω', 25) / 5 - 1)).toBeLessThan(0.01)
  })
})

describe('termistor PTC contra su hoja de datos', () => {
  const ptc = (temperatura: number, a: string, b: string): Parte => ({ tipo: 'ptc', ref: 'TH1', props: { temperatura: String(temperatura) }, pines: { '1': a, '2': b } })
  const resistencia = (t: number) => {
    const v = punto([DC('V1', '5', '1'), R('R1', '1M', '1', '2'), ptc(t, '2', '0')]).v('2')
    return (v * 1e6) / (5 - v)
  }
  it('R a 25 °C queda en 2000 Ω ± 25 % y la curva no baja de Rmin = 900 Ω (TDK B593**, enero 2016, p. 2, tipo J289)', () => {
    expect(Math.abs(resistencia(25) / 2000 - 1)).toBeLessThanOrEqual(0.25)
    for (const t of [-20, 0, 50, 80, 100]) expect(resistencia(t)).toBeGreaterThanOrEqual(900)
  })

  it('Tref de 120 °C: la resistencia pasa por el doble de su mínimo a ±5 °C de ese punto', () => {
    const minimo = Math.min(...[60, 70, 80, 90, 100].map(resistencia))
    expect(resistencia(115)).toBeLessThan(2 * minimo)
    expect(resistencia(125)).toBeGreaterThan(2 * minimo)
  })

  it('a Vmax de 265 V: arranca bajo los 0.15 A de ISmax, la corriente cae a la mitad en menos de 0.5 s y se asienta en los 2.0 mA de Ir', () => {
    const corriente = (fin: number) => Math.abs(punto([DC('V1', '265', '1'), ptc(25, '1', '0')], fin, false, 5e-3).i('V1'))
    const i0 = corriente(1e-3)
    expect(i0).toBeLessThan(0.15)
    expect(corriente(0.5)).toBeLessThan(i0 / 2)
    expect(Math.abs(corriente(400) / 2e-3 - 1)).toBeLessThan(0.1)
  })
})

describe('fotorresistencia contra su hoja de datos', () => {
  const resistencia = (modelo: string, lux: number) => {
    const v = punto([DC('V1', '5', '1'), R('R1', '1M', '1', '2'), { tipo: 'ldr', ref: 'LDR1', props: { modelo, luz: String(lux) }, pines: { '1': '2', '2': '0' } }]).v('2')
    return (v * 1e6) / (5 - v)
  }
  // Senba GL55 (copia de LCSC C125630), p. 2: R a 10 lx, oscuridad y γ = log10(R10 / R100) / log10(100 / 10).
  const filas: [string, [number, number], number, number][] = [
    ['GL5516', [5e3, 10e3], 0.5e6, 0.5],
    ['GL5528', [10e3, 20e3], 1e6, 0.6],
    ['GL5539', [50e3, 100e3], 5e6, 0.8]
  ]
  it.each(filas)('%s: R a 10 lx dentro del rango, oscuridad y γ de la hoja', (modelo, rango, oscuridad, gamma) => {
    const r10 = resistencia(modelo, 10)
    expect(r10).toBeGreaterThanOrEqual(rango[0])
    expect(r10).toBeLessThanOrEqual(rango[1])
    // La perilla llega a 0.1 lx, no a oscuridad total: la resistencia en oscuridad es el tope del modelo.
    expect(lib.get('ldr')!.modelo).toMatchObject({ modelos: { [modelo]: { roscuro: oscuridad } } })
    expect(Math.abs(Math.log10(r10 / resistencia(modelo, 100)) - gamma)).toBeLessThan(0.01)
  })
})

describe('LM35 contra su hoja de datos', () => {
  const salida = (t: number, carga = '10k') => punto([DC('V1', '5', 'vcc'), R('RL', carga, 'out', '0'), { tipo: 'lm35', ref: 'U1', props: { temperatura: String(t) }, pines: { '+VS': 'vcc', VOUT: 'out', GND: '0' } }], 2e-3)

  it('10 mV/°C: 250 mV a 25 °C y 1 V a 100 °C, con pendiente de 10 mV/°C (TI LM35, SNIS159H, p. 1)', () => {
    expect(Math.abs(salida(25).v('out') / 0.25 - 1)).toBeLessThan(0.01)
    expect(Math.abs(salida(100).v('out') / 1 - 1)).toBeLessThan(0.01)
    expect(Math.abs((salida(100).v('out') - salida(25).v('out')) / 75 / 0.01 - 1)).toBeLessThan(0.01)
  })

  it('corriente en reposo de 56 µA a 5 V sin carga y salida casi sin caída con 1 mA (regulación de ±0.4 mV/mA)', () => {
    expect(Math.abs(Math.abs(salida(25, '1G').i('V1')) / 56e-6 - 1)).toBeLessThan(0.1)
    expect(Math.abs(salida(25, '250').v('out') - salida(25, '1G').v('out'))).toBeLessThan(0.0005 * 1.2)
  })
})

describe('TMP36 contra su hoja de datos', () => {
  const salida = (t: number, carga = '100k') => punto([DC('V1', '5', 'vcc'), R('RL', carga, 'out', '0'), { tipo: 'tmp36', ref: 'U1', props: { temperatura: String(t) }, pines: { '+VS': 'vcc', VOUT: 'out', GND: '0' } }], 2e-3)

  it('750 mV a 25 °C, 0.5 V más 10 mV/°C de -40 a 125 °C (Analog Devices TMP35/36/37, Rev. E, Tabla 4)', () => {
    expect(Math.abs(salida(25).v('out') / 0.75 - 1)).toBeLessThan(0.01)
    expect(Math.abs(salida(-40).v('out') / 0.1 - 1)).toBeLessThan(0.01)
    expect(Math.abs(salida(125).v('out') / 1.75 - 1)).toBeLessThan(0.01)
    expect(Math.abs((salida(125).v('out') - salida(-40).v('out')) / 165 / 0.01 - 1)).toBeLessThan(0.01)
  })

  it('corriente en reposo bajo los 50 µA máximos de la hoja a 5 V sin carga', () => {
    expect(Math.abs(salida(25, '1G').i('V1'))).toBeLessThanOrEqual(50e-6 * 1.01)
  })
})

/** Transitorio paso a paso: el tiempo y, en cada paso del motor, el voltaje de cada red y la corriente de cada pieza. */
function traza(partes: Parte[], fin: number, hmax: number): { t: number[]; v: (red: string) => number[]; i: (ref: string) => number[] } {
  const d = conEtiquetas(lib, partes)
  const con = calcularConexiones(d, lib)
  const r = compilarNetlist(d, lib, con)
  expect(r.errores).toEqual([])
  const sim = new Simulator(JSON.stringify(r.netlist), hmax)
  sim.set_tolerances(1e-4, 1e-12, 1e-7)
  const n = sim.element_count()
  const t: number[] = []
  const lecturas: ReturnType<typeof leerResultados>[] = []
  while (sim.time() < fin) {
    sim.advance_to(fin, 1)
    const f64 = (p: number, k = n) => new Float64Array(memoria.buffer, p, k).slice()
    const g = sim.digital_count()
    lecturas.push(leerResultados(r, { time: sim.time(), ratio: 1, capacity: 1, seq: 0, consistente: true, voltages: sim.voltages(), currents: f64(sim.currents_ptr()), aux: f64(sim.aux_ptr()), estado: f64(sim.estado_ptr()), niveles: f64(sim.niveles_ptr(), g), medidas: f64(sim.medidas_ptr(), 3 * g) }))
    t.push(sim.time())
  }
  sim.free()
  const idDe = (ref: string) => Object.values(d.piezas).find((p) => p.ref === ref)!.id
  return { t, v: (red) => lecturas.map((l) => l.redes.get(con.redes.findIndex((x) => x.nombre === red))!), i: (ref) => lecturas.map((l) => l.piezas.get(idDe(ref))!.i) }
}

/** Instante (s) en que `y` cruza `nivel` por primera vez después de `desde`, interpolado; subiendo o bajando. */
function cruce(t: number[], y: number[], nivel: number, desde: number, subiendo: boolean): number {
  for (let k = 1; k < t.length; k++) {
    if (t[k] < desde) continue
    const a = y[k - 1] - nivel, b = y[k] - nivel
    if (subiendo ? a < 0 && b >= 0 : a > 0 && b <= 0) return t[k - 1] + ((t[k] - t[k - 1]) * -a) / (b - a)
  }
  return NaN
}

/** Tiempos de subida y bajada (10 % a 90 %, s) de la corriente del colector ante un pulso en el LED que dura 20 µs desde los 2 µs. */
function tiemposDelColector(opto: Parte, vcc: string, rl: string, rled: string): { subida: number; bajada: number } {
  const pulso: Parte = { tipo: 'fuente-pulso', ref: 'V1', props: { alto: '5', frecuencia: '25k', ciclo: '50 %', retardo: '2u' }, pines: { '+': 'vin', '-': '0' } }
  const { t, i } = traza([pulso, R('R1', rled, 'vin', 'a'), DC('V2', vcc, 'vcc'), R('RL', rl, 'vcc', 'c'), opto], 50e-6, 20e-9)
  const ic = i('V2').map(Math.abs)
  const pico = Math.max(...ic.filter((_, k) => t[k] > 17e-6 && t[k] < 22e-6))
  const [r10, r90] = [cruce(t, ic, 0.1 * pico, 0, true), cruce(t, ic, 0.9 * pico, 0, true)]
  const [f90, f10] = [cruce(t, ic, 0.9 * pico, 21.9e-6, false), cruce(t, ic, 0.1 * pico, 21.9e-6, false)]
  return { subida: r90 - r10, bajada: f10 - f90 }
}

const ISRC = (ref: string, corriente: string, hacia: string): Parte => ({ tipo: 'fuente-corriente', ref, props: { corriente }, pines: { entrada: '0', salida: hacia } })

describe('optoacoplador 4N25 contra su hoja de datos', () => {
  const opto: Parte = { tipo: 'optoacoplador-4n25', ref: 'U1', props: { modelo: '4N25' }, pines: { A: 'a', K: '0', C: 'c', E: '0', B: 'aire_B' } }
  /** LED con la corriente dada y el colector a 10 V: el CTR (colector entre LED) y el voltaje del LED. */
  const ctr = (ifmA: number) => {
    const p = punto([ISRC('I1', `${ifmA}m`, 'a'), DC('V2', '10', 'c'), opto], 5e-3)
    return { ctr: Math.abs(p.i('V2')) / (ifmA * 1e-3), vf: p.v('a') }
  }

  it('CTR de 20 % como mínimo y 50 % típico con IF = 10 mA y VCE = 10 V (Vishay 83725 rev. 1.8 p. 134, onsemi 4N25M p. 2)', () => {
    const c = ctr(10).ctr
    expect(c).toBeGreaterThanOrEqual(0.2)
    expect(Math.abs(c / 0.5 - 1)).toBeLessThan(0.01)
  })

  it('VF de 1.18 V a 10 mA y 1.3 V a 50 mA, bajo el máximo de 1.5 V (onsemi p. 2, Vishay p. 133)', () => {
    expect(Math.abs(ctr(10).vf - 1.18)).toBeLessThan(0.02)
    expect(Math.abs(ctr(50).vf - 1.3)).toBeLessThan(0.02)
    expect(ctr(50).vf).toBeLessThanOrEqual(1.5)
  })

  it('VCE(sat) bajo los 0.5 V de la hoja con IC = 2 mA e IF = 50 mA', () => {
    const p = punto([ISRC('I1', '50m', 'a'), ISRC('I2', '2m', 'c'), opto], 5e-3)
    expect(p.v('c')).toBeGreaterThan(0)
    expect(p.v('c')).toBeLessThanOrEqual(0.5)
  })

  it('subida y bajada de 2 µs con RL = 100 Ω, dentro del ±50 % de la hoja que solo da típicos', () => {
    const { subida, bajada } = tiemposDelColector(opto, '10', '100', '1k')
    expect(subida).toBeGreaterThan(1e-6)
    expect(subida).toBeLessThan(3e-6)
    expect(bajada).toBeGreaterThan(1e-6)
    expect(bajada).toBeLessThan(3e-6)
  })

  it('sin corriente en el LED el transistor no conduce', () => {
    const p = punto([ISRC('I1', '0', 'a'), DC('V2', '10', 'c'), opto], 5e-3)
    expect(Math.abs(p.i('V2'))).toBeLessThan(50e-9)
  })
})

describe('optoacoplador PC817 contra su hoja de datos', () => {
  const pc817 = (rango: string, k = '0'): Parte => ({ tipo: 'optoacoplador-pc817', ref: 'U1', props: { modelo: `PC817${rango}` }, pines: { A: 'a', K: k, C: 'c', E: '0' } })
  const ctr = (rango: string, ifmA: number, vce = '5') => {
    const p = punto([ISRC('I1', `${ifmA}m`, 'a'), DC('V2', vce, 'c'), pc817(rango)], 5e-3)
    return { ctr: Math.abs(p.i('V2')) / (ifmA * 1e-3), vf: p.v('a') }
  }
  // Sharp PC817X (D2-A03101EN) p. 5: IC con IF = 5 mA y VCE = 5 V por rango, y el nominal (media geométrica) al que se ajustó.
  const rangos: [string, number, number, number][] = [['A', 0.8, 1.6, 1.13], ['B', 1.3, 2.6, 1.84], ['C', 2.0, 4.0, 2.83], ['D', 3.0, 6.0, 4.24]]

  it.each(rangos)('rango %s: CTR dentro de su rango de la hoja y en el nominal con IF = 5 mA y VCE = 5 V', (rango, min, max, nominal) => {
    const c = ctr(rango, 5).ctr
    expect(c).toBeGreaterThanOrEqual(min)
    expect(c).toBeLessThanOrEqual(max)
    expect(Math.abs(c / nominal - 1)).toBeLessThan(0.01)
  })

  it('VF de 1.2 V a 20 mA, bajo el máximo de 1.4 V (Sharp p. 4)', () => {
    const vf = ctr('A', 20).vf
    expect(Math.abs(vf - 1.2)).toBeLessThan(0.02)
    expect(vf).toBeLessThanOrEqual(1.4)
  })

  it('VCE(sat) bajo los 0.2 V máximos de la hoja con IF = 20 mA e IC = 1 mA', () => {
    for (const rango of ['A', 'B', 'C', 'D']) {
      const p = punto([ISRC('I1', '20m', 'a'), ISRC('I2', '1m', 'c'), pc817(rango)], 5e-3)
      expect(p.v('c'), rango).toBeGreaterThan(0)
      expect(p.v('c'), rango).toBeLessThanOrEqual(0.2)
    }
  })

  it('subida de 4 µs y bajada de 3 µs con VCE = 2 V, IC = 2 mA y RL = 100 Ω, dentro del ±50 % de la hoja', () => {
    const { subida, bajada } = tiemposDelColector(pc817('A'), '2.2', '100', '2.2k')
    expect(subida).toBeGreaterThan(2e-6)
    expect(subida).toBeLessThan(6e-6)
    expect(bajada).toBeGreaterThan(1.5e-6)
    expect(bajada).toBeLessThan(4.5e-6)
  })

  it('sin corriente en el LED el transistor no conduce', () => {
    const p = punto([ISRC('I1', '0', 'a'), DC('V2', '5', 'c'), pc817('D')], 5e-3)
    expect(Math.abs(p.i('V2'))).toBeLessThan(100e-9)
  })
})

describe('IGBT contra su hoja de datos', () => {
  const igbt = (modelo: string, c: string, g: string, e = '0'): Parte => ({ tipo: 'igbt', ref: 'Q1', props: { modelo }, pines: { C: c, G: g, E: e } })
  /** Voltaje de colector con la corriente forzada y la compuerta a 15 V. */
  const vce = (modelo: string, amperes: number) => punto([ISRC('I1', String(amperes), 'c'), DC('V2', '15', 'g'), igbt(modelo, 'c', 'g')], 5e-3).v('c')
  /** VGE(th): colector y compuerta juntos (VCE = VGE) con la corriente de prueba. */
  const umbral = (modelo: string, amperes: string) => punto([ISRC('I1', amperes, 'c'), igbt(modelo, 'c', 'c')], 5e-3).v('c')
  /** Corriente de colector con VCE = 100 V y la compuerta al voltaje dado. */
  const ic = (modelo: string, vg: number) => Math.abs(punto([DC('V1', '100', 'c'), DC('V2', String(vg), 'g'), igbt(modelo, 'c', 'g')], 5e-3).i('V1'))
  /** VFM del diodo: la corriente forzada del emisor al colector con la compuerta a 0 V. */
  const vfm = (modelo: string, amperes: number) => punto([ISRC('I1', String(amperes), 'e'), igbt(modelo, '0', '0', 'e')], 5e-3).v('e')

  it('IRG4BC30UD: VCE(on) de 1.95 V a 12 A (máximo 2.1 V) y 2.52 V a 23 A con VGE = 15 V (International Rectifier PD 91453B, p. 2)', () => {
    expect(vce('IRG4BC30UD', 12)).toBeLessThanOrEqual(2.1)
    expect(Math.abs(vce('IRG4BC30UD', 12) / 1.95 - 1)).toBeLessThan(0.01)
    expect(Math.abs(vce('IRG4BC30UD', 23) / 2.52 - 1)).toBeLessThan(0.01)
  })

  it('IRG4BC30UD: VGE(th) dentro de 3.0 a 6.0 V con 250 µA y en los 4.5 V a los que se ajustó', () => {
    const v = umbral('IRG4BC30UD', '250u')
    expect(v).toBeGreaterThanOrEqual(3)
    expect(v).toBeLessThanOrEqual(6)
    expect(Math.abs(v - 4.5)).toBeLessThan(0.02)
  })

  it('IRG4BC30UD: gfe de 8.6 S (mínimo 3.1 S) con VCE = 100 V e IC = 12 A', () => {
    const [a, b] = [7.2277, 7.3277]
    expect(Math.abs((ic('IRG4BC30UD', a) + ic('IRG4BC30UD', b)) / 2 / 12 - 1)).toBeLessThan(0.03)
    const gfe = (ic('IRG4BC30UD', b) - ic('IRG4BC30UD', a)) / (b - a)
    expect(gfe).toBeGreaterThanOrEqual(3.1)
    expect(Math.abs(gfe / 8.6 - 1)).toBeLessThan(0.03)
  })

  it('IRG4BC30UD: VFM del diodo en antiparalelo de 1.4 V a 12 A, bajo el máximo de 1.7 V', () => {
    const v = vfm('IRG4BC30UD', 12)
    expect(v).toBeLessThanOrEqual(1.7)
    expect(Math.abs(v - 1.4)).toBeLessThan(0.03)
  })

  it('FGA25N120ANTD: VCE(sat) de 2.0 V a 25 A y 2.65 V a 50 A con VGE = 15 V (Fairchild Rev. C1, p. 2)', () => {
    expect(Math.abs(vce('FGA25N120ANTD', 25) / 2.0 - 1)).toBeLessThan(0.01)
    expect(Math.abs(vce('FGA25N120ANTD', 50) / 2.65 - 1)).toBeLessThan(0.01)
  })

  it('FGA25N120ANTD: VGE(th) dentro de 3.5 a 7.5 V con 25 mA y en los 5.5 V típicos, y VFM de 2.0 V a 25 A bajo el máximo de 3.0 V', () => {
    const v = umbral('FGA25N120ANTD', '25m')
    expect(v).toBeGreaterThanOrEqual(3.5)
    expect(v).toBeLessThanOrEqual(7.5)
    expect(Math.abs(v - 5.5)).toBeLessThan(0.02)
    expect(vfm('FGA25N120ANTD', 25)).toBeLessThanOrEqual(3)
    expect(Math.abs(vfm('FGA25N120ANTD', 25) - 2.0)).toBeLessThan(0.03)
  })

  it('sin voltaje en la compuerta no conduce con el colector a 100 V', () => {
    for (const m of ['IRG4BC30UD', 'FGA25N120ANTD']) expect(ic(m, 0), m).toBeLessThan(1e-6)
  })
})

describe('UJT 2N2646 contra su hoja de datos', () => {
  const ujt = (e: string, b1: string, b2: string): Parte => ({ tipo: 'ujt', ref: 'Q1', props: { modelo: '2N2646' }, pines: { E: e, B1: b1, B2: b2 } })
  /** Voltaje del emisor con la corriente dada, `vbb` entre bases y `rb2` en serie con B2. */
  const ve = (amperes: number, vbb: string, rb2 = '1m', fino = false) => punto([DC('V1', vbb, 'vb'), R('RX', rb2, 'vb', 'b2'), ISRC('I1', String(amperes), 'e'), ujt('e', '0', 'b2')], 5e-3, fino).v('e')
  /** Oscilador de relajación: voltaje del emisor y periodos entre picos. */
  function oscilador(r: string, c: string, fin: number) {
    const { t, v } = traza([DC('V1', '10', 'vcc'), R('R2', '100', 'vcc', 'b2'), R('R1', '47', 'b1', '0'), ujt('e', 'b1', 'b2'), R('R3', r, 'vcc', 'e'), { tipo: 'capacitor', ref: 'C1', props: { valor: c }, pines: { '1': 'e', '2': '0' } }], fin, 1e-6)
    const ve = v('e')
    const picos: number[] = []
    for (let k = 1; k < ve.length - 1; k++) if (ve[k] > ve[k - 1] && ve[k] >= ve[k + 1] && ve[k] > 3) picos.push(k)
    return { t, ve, picos }
  }

  it('RBB de 4.7 a 9.1 kΩ con VB2B1 = 3 V y emisor abierto, en los 6.54 kΩ a los que se ajustó (Central 2N2646 R1, p. 1)', () => {
    const rbb = 3 / Math.abs(punto([DC('V1', '3', 'b2'), ISRC('I1', '0', 'e'), ujt('e', '0', 'b2')], 5e-3).i('V1'))
    expect(rbb).toBeGreaterThanOrEqual(4700)
    expect(rbb).toBeLessThanOrEqual(9100)
    expect(Math.abs(rbb / 6540 - 1)).toBeLessThan(0.01)
  })

  it('η de 0.56 a 0.75 con VB2B1 = 10 V, medida en el pico del oscilador como (Vp - 0.5 V) / VB2B1', () => {
    const { t, ve, picos } = oscilador('100k', '10n', 3e-3)
    expect(picos.length).toBeGreaterThanOrEqual(2)
    const vp = ve[picos[0]]
    // El pico lleva la caída de las resistencias de 100 y 47 Ω sobre la corriente entre bases, unos 0.2 V.
    const eta = (vp - 0.5) / 10
    expect(eta).toBeGreaterThanOrEqual(0.56)
    expect(eta).toBeLessThanOrEqual(0.75)
    expect(Math.abs(eta - 0.655)).toBeLessThan(0.02)
    expect(t[picos[0]]).toBeGreaterThan(0)
  })

  it('IP de 5 µA como máximo con VB2B1 = 25 V: el pico de VE cae entre 1 y 5 µA, cerca de los 3.7 µA del modelo', () => {
    // El pico es ancho (VE cambia milivolts entre 2 y 5 µA): se mide con tolerancias muy cortas.
    const corrientes = [1, 2, 3, 3.6, 4, 5, 6, 8, 20].map((u) => u * 1e-6)
    const v = corrientes.map((i) => ve(i, '25', '1m', true))
    const pico = corrientes[v.indexOf(Math.max(...v))]
    expect(pico).toBeLessThanOrEqual(5e-6)
    expect(Math.abs(pico / 3.7e-6 - 1)).toBeLessThan(0.3)
    expect(v[v.length - 1]).toBeLessThan(Math.max(...v) - 0.03)
  })

  it('IV de 4 mA como mínimo con VB2B1 = 20 V y RB2 = 100 Ω: el valle de VE está sobre 4 mA y cerca de los 4.8 mA del modelo', () => {
    const corrientes = [3, 3.5, 4, 4.4, 4.8, 5.2, 5.6, 6, 7, 8].map((m) => m * 1e-3)
    const v = corrientes.map((i) => ve(i, '20', '100'))
    const valle = corrientes[v.indexOf(Math.min(...v))]
    expect(valle).toBeGreaterThanOrEqual(4e-3)
    expect(Math.abs(valle / 4.8e-3 - 1)).toBeLessThan(0.2)
  })

  it('VE(sat) bajo los 2.5 V máximos con 50 mA y VB2B1 = 10 V (Comset 2N2646/2647, p. 2)', () => {
    const v = ve(50e-3, '10')
    expect(v).toBeGreaterThan(0)
    expect(v).toBeLessThanOrEqual(2.5)
  })

  it.each([['100k', '10n'], ['22k', '47n'], ['470k', '2.2n']])('oscilador de relajación con R = %s y C = %s: frecuencia a menos del 10 % de 1 / (R C ln(1 / (1 - η)))', (r, c) => {
    const num = (s: string) => Number(s.replace('k', 'e3').replace('n', 'e-9'))
    const f0 = 1 / (num(r) * num(c) * Math.log(1 / (1 - 0.655)))
    const { t, picos } = oscilador(r, c, 5.5 / f0)
    expect(picos.length).toBeGreaterThanOrEqual(4)
    const periodo = (t[picos[picos.length - 1]] - t[picos[1]]) / (picos.length - 2)
    expect(Math.abs(1 / periodo / f0 - 1)).toBeLessThan(0.1)
  })
})

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
function punto(partes: Parte[], fin = 2e-3, fino = false): { v: (red: string) => number; i: (ref: string) => number } {
  const d = conEtiquetas(lib, partes)
  const con = calcularConexiones(d, lib)
  const r = compilarNetlist(d, lib, con)
  expect(r.errores).toEqual([])
  const sim = new Simulator(JSON.stringify(r.netlist), 1e-5)
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
    ['TLV9002', 2.5, 1e6, 2e6, 7.1e5, 2]
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

  it('avisa si la salida no tiene resistencia de carga a un voltaje, y no avisa con una', () => {
    const base: Parte[] = [DC('V1', '5', '1'), DC('V3', '1', '3'), DC('V4', '1.1', '4'), cmp('LM393', '3', '4', 'out', '1')]
    const aviso = (extra: Parte[]) => compilar([...base, ...extra]).avisos.filter((a) => a.includes('colector abierto'))
    expect(aviso([R('R1', '10k', 'out', '0')])).toEqual(['U1 es de colector abierto y su salida no tiene resistencia de carga a un voltaje: solo baja, nunca sube.'])
    expect(aviso([R('R1', '10k', 'out', '1')])).toEqual([])
    // Un LED con su resistencia hacia V+ también sube la salida; una resistencia a V− no.
    expect(aviso([R('R1', '1k', '1', 'a'), { tipo: 'led', ref: 'D1', props: { color: 'rojo' }, pines: { A: 'a', K: 'out' } }])).toEqual([])
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
        if (antes.includes(o) || o === 'Genérico') continue
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

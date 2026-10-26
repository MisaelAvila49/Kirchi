// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { calcularConexiones } from '../conexiones/conexiones'
import type { Documento } from '../doc/tipos'
import { compilarNetlist } from '../netlist/netlist'
import { conEtiquetas, type Parte } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import { avisosDelCircuito } from '../ui/proyecto'
import { excesoAbsoluto, juegoDe, medirAbsoluto, type AbsolutoResuelto, type AbsolutosDePieza } from './absolutos'
import { excesoDe, limitesDelCircuito, VigiaDeAvisos } from './avisos'
import { leerResultados, type Lectura } from './lectura'
import init, { Simulator } from './pkg/kirchi_engine.js'
import { VigiaDeQuemado } from './quemado'

// Los máximos absolutos de la hoja de datos de cada modelo comercial.

const lib = libreriaDePrueba().piezas
let memoria: WebAssembly.Memory
beforeAll(async () => {
  memoria = (await init({ module_or_path: readFileSync(join(import.meta.dirname, 'pkg/kirchi_engine_bg.wasm')) })).memory
})

const DC = (ref: string, voltaje: string, mas: string, menos = '0'): Parte => ({ tipo: 'fuente-dc', ref, props: { voltaje }, pines: { '+': mas, '-': menos } })
const R = (ref: string, valor: string, a: string, b: string): Parte => ({ tipo: 'resistencia', ref, props: { valor }, pines: { '1': a, '2': b } })
const opamp = (modelo: string, mas: string, menos: string, vp: string, vn: string, sal: string): Parte => ({ tipo: 'amp-op', ref: 'U1', props: { modelo }, pines: { '+': mas, '-': menos, OUT: sal, 'V+': vp, 'V-': vn } })

describe('los máximos absolutos de la librería', () => {
  const conMaximos = [...lib.values()].filter((d) => d.limites?.absolutos)

  it('las piezas con modelos comerciales los traen, cada juego con su hoja de datos', () => {
    expect(conMaximos.map((d) => d.id).sort()).toEqual(['amp-op', 'comparador', 'diodo', 'mosfet-n', 'mosfet-p', 'npn', 'pnp', 'regulador-ajustable', 'regulador-negativo', 'regulador-positivo', 'temporizador-555', 'triac', 'zener'])
    for (const d of conMaximos) {
      const a = d.limites!.absolutos!
      const opciones = a.prop ? d.props.find((p) => p.id === a.prop)!.opciones! : ['*']
      for (const o of Object.keys(a.valores)) expect(opciones, `${d.id}.${o}`).toContain(o)
      for (const [o, v] of Object.entries(a.valores)) {
        expect(v.fuente, `${d.id}.${o}`).toMatch(/\d/)
        expect(v.fuente.length, `${d.id}.${o}`).toBeGreaterThan(30)
        expect(v.fuente, `${d.id}.${o}`).not.toMatch(/—/)
      }
      // Todas las opciones de las piezas de transistores y amplificadores llevan máximos; el diodo «Genérico» no tiene hoja.
      if (d.id !== 'diodo') expect(Object.keys(a.valores).sort(), d.id).toEqual([...opciones].sort())
    }
    expect(Object.keys(lib.get('diodo')!.limites!.absolutos!.valores)).toEqual(['1N4148', '1N4007', '1N5819'])
  })

  it('amplificadores: la alimentación de la hoja (TL081 y LM741 ±18 V, LM358 32 V, OP07 y NE5532 ±22 V, TLV9002 6 V)', () => {
    const alim = (modelo: string) => {
      const p = { id: 'p', tipo: 'amp-op', ref: 'U1', x: 0, y: 0, rot: 0 as const, espejo: false, props: { modelo } }
      return juegoDe(p, lib.get('amp-op')!)!.limites.find((x) => x.nombre.startsWith('alimentación'))!.max
    }
    expect(['LM741', 'TL081', 'LM358', 'LM324', 'OP07', 'NE5532', 'TLV9002'].map(alim)).toEqual([36, 36, 32, 32, 44, 44, 6])
  })

  it('las entradas, el diodo, el Zener, el 555 y los reguladores traen lo que pide la nota', () => {
    const tiene = (id: string, opcion: string, nombre: string, max: number) => {
      const j = lib.get(id)!.limites!.absolutos!.valores[opcion]
      expect(j.limites.find((x) => x.nombre === nombre)?.max, `${id} ${opcion} ${nombre}`).toBe(max)
    }
    tiene('diodo', '1N4007', 'voltaje inverso', 1000)
    tiene('diodo', '1N4007', 'corriente directa media', 1)
    tiene('diodo', '1N5819', 'voltaje inverso', 40)
    tiene('zener', '1N47xxA', 'potencia', 1)
    tiene('zener', 'BZX55C', 'potencia', 0.5)
    tiene('temporizador-555', 'NE555', 'alimentación (VCC a GND)', 18)
    tiene('regulador-positivo', '7805', 'entrada contra tierra', 35)
    tiene('regulador-ajustable', 'LM317', 'entrada menos salida', 40)
    tiene('npn', '2N2222', 'Vce', 40)
    tiene('mosfet-n', 'IRF540N', 'Vds', 100)
    tiene('mosfet-n', 'IRLZ44N', 'Vgs', 16)
  })
})

describe('la comparación con un máximo', () => {
  const alim: AbsolutoResuelto = { nombre: 'alimentación (V+ a V−)', consejo: 'baja la alimentación.', unidad: 'V', de: [1], a: 2, abs: false, max: 36, escala: 36 }
  const entrada: AbsolutoResuelto = { nombre: 'entrada bajo V−', consejo: 'limita la señal.', unidad: 'V', de: [3, 4], a: 2, abs: false, min: -0.3, escala: 10 }
  const pieza: AbsolutosDePieza = { modelo: 'TL081', lista: [alim, entrada] }
  const redes = (r: Record<number, number>) => new Map(Object.entries(r).map(([k, v]) => [Number(k), v]))

  it('avisa con la alimentación pasada y no con la que cabe', () => {
    expect(excesoAbsoluto(pieza, { redes: redes({ 1: 30, 2: 0, 3: 0, 4: 0 }), m: undefined }, undefined)).toBeNull()
    const e = excesoAbsoluto(pieza, { redes: redes({ 1: 50, 2: 0, 3: 0, 4: 0 }), m: undefined }, undefined)!
    expect(e.texto).toBe('alimentación (V+ a V−): 50.0 V, máximo 36 V')
    expect(e.registro('U1')).toBe('U1 tiene 50.0 V de alimentación (V+ a V−), más de los 36 V que admite el TL081: baja la alimentación.')
    expect(e.veces).toBeCloseTo(50 / 36, 6)
  })

  it('un mínimo mide cuánto falta contra su escala, y el peor de las dos entradas manda', () => {
    const e = excesoAbsoluto(pieza, { redes: redes({ 1: 10, 2: 0, 3: -5, 4: -1 }), m: undefined }, undefined)!
    expect(e.texto).toBe('entrada bajo V−: −5.00 V, mínimo -300 mV')
    expect(e.registro('U1')).toMatch(/menos de los -300 mV/)
    // 4.7 V más allá de 0.3 V sobre una escala de 10 V.
    expect(e.veces).toBeCloseTo(1.47, 6)
  })

  it('un voltaje se mira también con el último paso: la media de una senoidal vale cero', () => {
    const media = { redes: redes({ 1: 0, 2: 0, 3: 0, 4: 0 }), m: undefined }
    expect(excesoAbsoluto(pieza, media, undefined)).toBeNull()
    expect(excesoAbsoluto(pieza, media, undefined, redes({ 1: 45, 2: 0, 3: 0, 4: 0 }))!.texto).toMatch(/45\.0 V/)
  })

  it('corriente y potencia usan la medición media (la potencia integrada si la hay)', () => {
    const p: AbsolutoResuelto = { nombre: 'potencia', consejo: 'agrega una resistencia en serie.', unidad: 'W', medida: 'potencia', abs: false, max: 1, escala: 1 }
    const m = { v: 5, i: 0.3, p: -0.8 }
    expect(medirAbsoluto(p, new Map(), m, undefined)).toBeUndefined()
    expect(medirAbsoluto(p, new Map(), m, 1.5)!.veces).toBeCloseTo(1.5, 9)
    const c: AbsolutoResuelto = { nombre: 'corriente directa media', consejo: 'x', unidad: 'A', medida: 'corriente', abs: false, max: 0.2, escala: 0.2 }
    expect(medirAbsoluto(c, new Map(), m, undefined)!.valor).toBe(0.3)
  })
})

describe('avisos antes de simular (voltajes que las fuentes ya fijan)', () => {
  const avisos = (partes: Parte[]) => {
    const d = conEtiquetas(lib, partes)
    return avisosDelCircuito(d, calcularConexiones(d, lib), lib).filter((a) => /admite/.test(a.texto))
  }

  it('TL081 con 50 V entre sus alimentaciones: avisa, aunque no impide simular', () => {
    const a = avisos([DC('V1', '25', 'vp'), DC('V2', '25', '0', 'vn'), opamp('TL081', '0', 'sal', 'vp', 'vn', 'sal')])
    expect(a).toHaveLength(1)
    expect(a[0].texto).toBe('U1 quedaría con 50.0 V de alimentación (V+ a V−), más de los 36 V que admite el TL081: baja la alimentación o elige un amplificador que admita más.')
    expect(a[0].leve).toBe(true)
  })

  it('±15 V en un TL081 y 50 V en un LM317 con 12 V de salida: lo primero cabe, lo segundo no', () => {
    expect(avisos([DC('V1', '15', 'vp'), DC('V2', '15', '0', 'vn'), opamp('TL081', '0', 'sal', 'vp', 'vn', 'sal')])).toEqual([])
    const lm = avisos([DC('V1', '50', 'in'), { tipo: 'regulador-ajustable', ref: 'U1', props: {}, pines: { IN: 'in', OUT: 'out', ADJ: 'adj' } }, R('R1', '240', 'out', 'adj'), R('R2', '720', 'adj', '0'), DC('V2', '12', 'out')])
    expect(lm).toEqual([])
    const alto = avisos([DC('V1', '60', 'in'), { tipo: 'regulador-ajustable', ref: 'U1', props: {}, pines: { IN: 'in', OUT: 'out', ADJ: 'adj' } }, R('R1', '240', 'out', 'adj'), R('R2', '720', 'adj', '0')])
    expect(alto.map((x) => x.texto)).toEqual([])
  })

  it('un regulador 7805 con 40 V de entrada contra tierra: avisa', () => {
    const a = avisos([DC('V1', '40', 'in'), { tipo: 'regulador-positivo', ref: 'U1', props: { modelo: '7805' }, pines: { IN: 'in', OUT: 'out', GND: '0' } }, R('RL', '1k', 'out', '0')])
    expect(a.map((x) => x.texto)).toEqual(['U1 quedaría con 40.0 V de entrada contra tierra, más de los 35 V que admite el 7805: baja la entrada o pon antes un regulador de más voltaje.'])
  })

  it('un 7805 con 12 V no avisa', () => {
    expect(avisos([DC('V1', '12', 'in'), { tipo: 'regulador-positivo', ref: 'U1', props: { modelo: '7805' }, pines: { IN: 'in', OUT: 'out', GND: '0' } }, R('RL', '1k', 'out', '0')])).toEqual([])
  })
})

/** Simula `partes` y devuelve, tras `fin` segundos, la lectura con sus límites (los de `limitesDelCircuito` con las conexiones). */
function simular(partes: Parte[], fin: number, h = 1e-5) {
  const d = conEtiquetas(lib, partes)
  const con = calcularConexiones(d, lib)
  const r = compilarNetlist(d, lib, con)
  expect(r.errores).toEqual([])
  const sim = new Simulator(JSON.stringify(r.netlist), h)
  const limites = limitesDelCircuito(d, lib, r, con)
  const leer = (): Lectura => {
    const n = sim.element_count()
    const g = sim.digital_count()
    const f64 = (p: number, k = n) => new Float64Array(memoria.buffer, p, k).slice()
    return leerResultados(r, { time: sim.time(), ratio: 1, capacity: 1, seq: 0, consistente: true, voltages: sim.voltages(), currents: f64(sim.currents_ptr()), aux: f64(sim.aux_ptr()), estado: f64(sim.estado_ptr()), niveles: f64(sim.niveles_ptr(), g), medidas: f64(sim.medidas_ptr(), 3 * g) } as never)
  }
  sim.advance_to(fin, 1e9)
  return { d, r, sim, limites, leer, id: (ref: string) => Object.values(d.piezas).find((p) => p.ref === ref)!.id }
}

describe('máximos absolutos al simular', () => {
  it('TL081 con 50 V (±25 V): avisa en el chip y en el Registro, una vez', () => {
    const s = simular([DC('V1', '25', 'vp'), DC('V2', '25', '0', 'vn'), opamp('TL081', 'e', 'sal', 'vp', 'vn', 'sal'), DC('V3', '1', 'e'), R('RL', '10k', 'sal', '0')], 5e-3)
    const l = s.leer()
    const id = s.id('U1')
    expect(s.limites.get(id)).toMatchObject({ tipo: 'absolutos' })
    const e = excesoDe(l, id, s.limites.get(id)!, undefined, l)!
    expect(e.texto).toBe('alimentación (V+ a V−): 50.0 V, máximo 36 V')
    const v = new VigiaDeAvisos()
    const a = v.revisar(l, s.limites, new Map(), 0, () => 'U1', l)
    expect(a.registro).toEqual(['U1 tiene 50.0 V de alimentación (V+ a V−), más de los 36 V que admite el TL081: baja la alimentación o elige un amplificador que admita más.'])
    expect(a.visibles.get(id)).toMatchObject({ tipo: 'absolutos', excedido: true })
    expect(v.revisar(l, s.limites, new Map(), 100, () => 'U1', l).registro).toEqual([])
    s.sim.free()
  })

  it('TL081 con ±15 V y una carga normal: no avisa', () => {
    const s = simular([DC('V1', '15', 'vp'), DC('V2', '15', '0', 'vn'), opamp('TL081', 'e', 'sal', 'vp', 'vn', 'sal'), DC('V3', '1', 'e'), R('RL', '10k', 'sal', '0')], 5e-3)
    const l = s.leer()
    expect(excesoDe(l, s.id('U1'), s.limites.get(s.id('U1'))!, undefined, l)).toBeNull()
    s.sim.free()
  })

  it('una entrada por debajo de V− en un LM358 con alimentación sencilla avisa por la hoja (−0.3 V)', () => {
    const s = simular([DC('V1', '5', 'vp'), opamp('LM358', 'e', 'sal', 'vp', '0', 'sal'), DC('V3', '-2', 'e'), R('RL', '10k', 'sal', '0')], 5e-3)
    const l = s.leer()
    const e = excesoDe(l, s.id('U1'), s.limites.get(s.id('U1'))!, undefined, l)!
    expect(e.texto).toMatch(/^entrada bajo V−: −2\.00 V, mínimo -300 mV$/)
    s.sim.free()
  })

  it('un diodo 1N4148 con 150 V de inverso avisa por Vrrm y un 1N4007 con la misma no', () => {
    const con = (modelo: string) => {
      const s = simular([DC('V1', '-150', 'a'), { tipo: 'diodo', ref: 'D1', props: { modelo }, pines: { A: 'a', K: '0' } }, R('R1', '100k', 'a', '0')], 1e-3)
      const l = s.leer()
      const e = excesoDe(l, s.id('D1'), s.limites.get(s.id('D1'))!, undefined, l)
      s.sim.free()
      return e
    }
    expect(con('1N4148')!.registro('D1')).toMatch(/^D1 tiene 150 V de voltaje inverso, más de los 100 V que admite el 1N4148/)
    expect(con('1N4007')).toBeNull()
  })

  it('una senoidal de 150 V de pico en inversa avisa con el último paso aunque la media del intervalo valga cero (el modelo ya rompe en sus 100 V de ruptura)', () => {
    const s = simular([{ tipo: 'fuente-ac', ref: 'V1', props: { amplitud: '150', frecuencia: '60' }, pines: { '+': '0', '-': 'x' } }, R('RS', '1k', 'x', 'a'), { tipo: 'diodo', ref: 'D1', props: { modelo: '1N4148' }, pines: { A: 'a', K: '0' } }], 1 / 240)
    const pico = s.leer()
    const id = s.id('D1')
    const media: Lectura = { ...pico, redes: new Map([...pico.redes].map(([k]) => [k, 0] as [number, number])) }
    expect(excesoDe(media, id, s.limites.get(id)!, undefined)).toBeNull()
    expect(excesoDe(media, id, s.limites.get(id)!, undefined, pico)!.texto).toBe('voltaje inverso: 100 V, máximo 100 V')
    s.sim.free()
  })

  it('un diodo 1N4148 con más de 200 mA de media avisa por If(av)', () => {
    const s = simular([DC('V1', '5', 'a'), R('R1', '10', 'a', 'k'), { tipo: 'diodo', ref: 'D1', props: { modelo: '1N4148' }, pines: { A: 'k', K: '0' } }], 5e-3)
    const l = s.leer()
    const e = excesoDe(l, s.id('D1'), s.limites.get(s.id('D1'))!, undefined, l)!
    expect(e.texto).toMatch(/^corriente directa media: \d+ mA, máximo 200 mA$/)
    s.sim.free()
  })

  it('un Zener de 1 W: la potencia media pasa el máximo y avisa', () => {
    const s = simular([DC('V1', '24', 'a'), R('R1', '47', 'a', 'k'), { tipo: 'zener', ref: 'D1', props: { familia: '1N47xxA', voltaje: '5.1' }, pines: { A: '0', K: 'k' } }], 5e-3)
    const id = s.id('D1')
    const lim = s.limites.get(id)!
    expect(lim.tipo).toBe('absolutos')
    expect(s.r.potencias.some((k) => s.r.piezaDeElemento[k] === id)).toBe(true)
    const l = s.leer()
    const e = excesoDe(l, id, lim, 2.1, l)!
    expect(e.registro('D1')).toMatch(/^D1 disipa 2\.10 W \(potencia\), más de los 1 W que admite el 1N47xxA/)
    expect(excesoDe(l, id, lim, 0.4, l)).toBeNull()
    s.sim.free()
  })

  it('un BJT 2N2222 con Vce de 60 V avisa por Vceo, además de su corriente y potencia', () => {
    const s = simular([DC('V1', '60', 'c'), DC('V2', '5', 'b'), R('RB', '1M', 'b', 'bb'), { tipo: 'npn', ref: 'Q1', props: { modelo: '2N2222' }, pines: { B: 'bb', C: 'c', E: '0' } }], 5e-3)
    const l = s.leer()
    const id = s.id('Q1')
    expect(excesoDe(l, id, s.limites.get(id)!, undefined, l)!.texto).toBe('Vce: 60.0 V, máximo 40 V')
    s.sim.free()
  })

  it('un MOSFET IRLZ44N con 20 V de compuerta avisa por Vgs (±16 V)', () => {
    const s = simular([DC('V1', '10', 'd'), DC('V2', '20', 'g'), R('RD', '1k', 'd', 'dd'), { tipo: 'mosfet-n', ref: 'M1', props: { modelo: 'IRLZ44N' }, pines: { G: 'g', D: 'dd', S: '0' } }], 5e-3)
    const l = s.leer()
    const id = s.id('M1')
    expect(excesoDe(l, id, s.limites.get(id)!, undefined, l)!.texto).toBe('Vgs: 20.0 V, máximo 16 V')
    s.sim.free()
  })

  it('con «Las piezas se queman», el TL081 con 50 V se abre tras 0.5 s simulados y la corriente de la salida cae a cero', () => {
    const s = simular([DC('V1', '25', 'vp'), DC('V2', '25', '0', 'vn'), opamp('TL081', 'e', 'sal', 'vp', 'vn', 'sal'), DC('V3', '1', 'e'), R('RL', '1k', 'sal', '0')], 5e-3)
    const id = s.id('U1')
    const lim = s.limites.get(id)!
    expect(lim.quema).toMatchObject({ factor: 2, durante: 0.5 })
    const q = new VigiaDeQuemado()
    const l = s.leer()
    expect(q.revisar(l, 0.4, 0.4, s.limites, new Map(), l)).toEqual([])
    expect(q.revisar(l, 0.2, 0.6, s.limites, new Map(), l)).toEqual([id])
    expect(q.esQuemada(id)).toBe(true)
    expect(Math.abs(s.sim.currents()[lim.quema!.elemento])).toBeGreaterThan(5e-4)
    s.sim.quemar(lim.quema!.elemento, true)
    s.sim.advance_to(0.05, 1e9)
    expect(Math.abs(s.sim.currents()[lim.quema!.elemento])).toBeLessThan(1e-6)
    s.sim.free()
  })

  it('un TL081 con 38 V (5 % de más) avisa pero no se quema', () => {
    const s = simular([DC('V1', '19', 'vp'), DC('V2', '19', '0', 'vn'), opamp('TL081', 'e', 'sal', 'vp', 'vn', 'sal'), DC('V3', '1', 'e'), R('RL', '10k', 'sal', '0')], 5e-3)
    const l = s.leer()
    const id = s.id('U1')
    expect(excesoDe(l, id, s.limites.get(id)!, undefined, l)).not.toBeNull()
    const q = new VigiaDeQuemado()
    expect(q.revisar(l, 1, 1, s.limites, new Map(), l)).toEqual([])
    s.sim.free()
  })

  it('una entrada de 17 V con ±18 V de alimentación avisa por el límite de la hoja (±15 V), en el LM741, el TL081 y el OP07 (±22 V: 23 V)', () => {
    for (const [modelo, entrada, texto] of [['TL081', '17', 'voltaje de entrada (contra tierra): 17.0 V, máximo 15 V'], ['LM741', '17', 'voltaje de entrada (contra tierra): 17.0 V, máximo 15 V'], ['OP07', '23', 'voltaje de entrada (contra tierra): 23.0 V, máximo 22 V']] as const) {
      const rieles = modelo === 'OP07' ? '24' : '18'
      const s = simular([DC('V1', rieles, 'vp'), DC('V2', rieles, '0', 'vn'), opamp(modelo, 'e', 'sal', 'vp', 'vn', 'sal'), DC('V3', entrada, 'e'), R('RL', '10k', 'sal', '0')], 5e-3)
      const l = s.leer()
      const id = s.id('U1')
      expect(excesoDe(l, id, s.limites.get(id)!, undefined, l)!.texto, modelo).toBe(texto)
      s.sim.free()
    }
  })

  it('un 7805 con 45 V de entrada avisa y, quemado, abre su transistor de paso (la salida cae a cero)', () => {
    const s = simular([DC('V1', '45', 'in'), { tipo: 'regulador-positivo', ref: 'U1', props: { modelo: '7805' }, pines: { IN: 'in', OUT: 'out', GND: '0' } }, R('RL', '100', 'out', '0')], 0.05, 2e-5)
    const id = s.id('U1')
    const lim = s.limites.get(id)!
    expect(lim.tipo).toBe('compuesto')
    const l = s.leer()
    expect(excesoDe(l, id, lim, undefined, l)!.texto).toBe('entrada contra tierra: 45.0 V, máximo 35 V')
    // El elemento que se abre es el transistor de paso (el 8 de modelo.elementos).
    expect(s.r.tipoDeElemento[lim.quema!.elemento]).toBe('compuesto')
    expect(s.r.netlist!.elements[lim.quema!.elemento].type).toBe('Q')
    s.sim.free()
  })

  it('un comparador LM393 con 40 V de alimentación avisa', () => {
    const s = simular([DC('V1', '40', 'vp'), { tipo: 'comparador', ref: 'U1', props: { modelo: 'LM393' }, pines: { '+': 'e', '-': '0', OUT: 'o', 'V+': 'vp', 'V-': '0' } }, DC('V3', '1', 'e'), R('RP', '10k', 'vp', 'o')], 5e-3)
    const l = s.leer()
    const id = s.id('U1')
    expect(excesoDe(l, id, s.limites.get(id)!, undefined, l)!.texto).toBe('alimentación (V+ a V−): 40.0 V, máximo 36 V')
    s.sim.free()
  })

  it('un NE555 con 20 V avisa por su máximo absoluto de 18 V', () => {
    const s = simular([DC('V1', '20', 'vcc'), { tipo: 'temporizador-555', ref: 'U1', props: { modelo: 'NE555' }, pines: { '1': '0', '2': 'vcc', '3': 'o', '4': 'vcc', '5': 'cv', '6': '0', '7': 'd', '8': 'vcc' } }, R('R1', '10k', 'vcc', 'd'), R('RL', '10k', 'o', '0'), { tipo: 'capacitor', ref: 'C1', props: { valor: '10n' }, pines: { '1': 'cv', '2': '0' } }], 5e-3)
    const l = s.leer()
    const id = s.id('U1')
    expect(excesoDe(l, id, s.limites.get(id)!, undefined, l)!.texto).toBe('alimentación (VCC a GND): 20.0 V, máximo 18 V')
    s.sim.free()
  })
})

// Sin esto la prueba de arriba podría pasar con un documento mal armado.
describe('el documento de prueba', () => {
  it('las piezas armadas con etiquetas tienen sus pines conectados', () => {
    const d: Documento = conEtiquetas(lib, [DC('V1', '5', 'a'), R('R1', '1k', 'a', '0')])
    expect(avisosDelCircuito(d, calcularConexiones(d, lib), lib)).toEqual([])
  })
})

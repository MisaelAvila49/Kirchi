// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { calcularConexiones, clavePin } from '../conexiones/conexiones'
import { idSecuencial } from '../doc/ids'
import { documentoVacio, type Documento, type Pieza } from '../doc/tipos'
import { colisiona } from '../editor/colision'
import { violaciones } from '../editor/conflictos'
import { libreriaDePrueba } from '../prueba/libreria'
import { problemasDeRedes } from '../prueba/ayudaImportar'
import { cablear } from './cables'
import type { CircuitoAjeno, PiezaAjena } from './ajeno'
import { convertir } from './convertir'
import { armarDocumento } from './importar'

const lib = libreriaDePrueba().piezas

/** Divisor de voltaje: V1 a la izquierda, R1 arriba, R2 a la derecha. Posiciones en mm si `conPos`. */
function divisor(conPos: boolean): CircuitoAjeno {
  const p = (ref: string, tipo: string, valor: string, pines: [string, number, number][], x: number, y: number, props: Record<string, string> = {}): PiezaAjena => ({
    ref,
    tipo,
    valor,
    props,
    ...(conPos ? { x, y } : {}),
    pines: pines.map(([nombre, px, py]) => ({ nombre, numero: nombre === '+' ? '1' : nombre === '−' ? '2' : nombre, ...(conPos ? { x: px, y: py } : {}) }))
  })
  return {
    formato: 'spice',
    nombre: 'divisor',
    unidadesPorMm: 1,
    piezas: [
      p('V1', 'V', '12', [['+', 10, 0], ['−', 10, 40]], 10, 20, { dc: '12' }),
      p('R1', 'R', '10k', [['1', 25, 0], ['2', 55, 0]], 40, 0),
      p('R2', 'R', '10k', [['1', 55, 0], ['2', 55, 40]], 55, 20)
    ],
    redes: [
      { nombre: 'in', pines: [{ ref: 'V1', pin: '+' }, { ref: 'R1', pin: '1' }] },
      { nombre: 'out', pines: [{ ref: 'R1', pin: '2' }, { ref: 'R2', pin: '1' }] },
      { nombre: '0', pines: [{ ref: 'V1', pin: '−' }, { ref: 'R2', pin: '2' }] }
    ],
    instrumentos: [],
    directivas: [{ tipo: 'analisis', analisis: 'op', parametros: {}, trazas: [] }],
    avisos: []
  }
}

function importar(a: CircuitoAjeno) {
  const gen = idSecuencial()
  const c = convertir(a, lib, gen)
  const r = armarDocumento(c, lib, gen)
  return { c, ...r }
}

function sinChoques(doc: Documento): void {
  for (const p of Object.values(doc.piezas)) {
    expect(p.x % 2).toBe(0)
    expect(p.y % 2).toBe(0)
    expect(colisiona(doc, lib, p), `${p.ref} choca`).toBeNull()
  }
}

describe('convertir un divisor', () => {
  for (const conPos of [true, false]) {
    it(`${conPos ? 'con' : 'sin'} posiciones queda en la rejilla, sin choques, con las mismas redes y sin cables atravesando piezas`, () => {
      const a = divisor(conPos)
      const { doc, informe } = importar(a)
      sinChoques(doc)
      expect(violaciones(doc, lib)).toEqual([])
      expect(problemasDeRedes(a, doc, lib)).toEqual([])
      expect(informe).toMatchObject({ total: 3, convertidas: 3, aproximadas: [], sinEquivalencia: [], redesConEtiqueta: [] })
      expect(Object.values(doc.piezas).filter((p) => p.tipo === 'tierra').length).toBeGreaterThan(0)
      expect(doc.importacion).toEqual(informe)
    })
  }

  it('con posiciones conserva la forma: V1 a la izquierda de R1 y R1 arriba de R2', () => {
    const { doc } = importar(divisor(true))
    const por = (ref: string): Pieza => Object.values(doc.piezas).find((p) => p.ref === ref)!
    expect(por('V1').x).toBeLessThan(por('R1').x)
    expect(por('R1').y).toBeLessThan(por('R2').y)
    expect(por('R1').x).toBeLessThan(por('R2').x)
  })

  it('sin posiciones pone la fuente a la izquierda y las demás hacia la derecha', () => {
    const { doc } = importar(divisor(false))
    const por = (ref: string): Pieza => Object.values(doc.piezas).find((p) => p.ref === ref)!
    expect(por('V1').x).toBeLessThan(por('R1').x)
    expect(por('R1').x).toBeLessThanOrEqual(por('R2').x)
  })

  it('conserva las referencias del origen y pone el valor en la propiedad de la pieza', () => {
    const { doc } = importar(divisor(true))
    expect(Object.values(doc.piezas).map((p) => p.ref).filter((r) => !r.startsWith('GND')).sort()).toEqual(['R1', 'R2', 'V1'])
    expect(Object.values(doc.piezas).find((p) => p.ref === 'R1')!.props.valor).toBe('10k')
    expect(Object.values(doc.piezas).find((p) => p.ref === 'V1')!.props.voltaje).toBe('12')
  })

  it('renumera una referencia repetida', () => {
    const a = divisor(false)
    a.piezas[2] = { ...a.piezas[2]!, ref: 'R1' }
    const { c } = importar(a)
    const refs = c.fragmento.piezas.map((p) => p.ref)
    expect(new Set(refs).size).toBe(refs.length)
  })
})

describe('piezas sin equivalencia exacta', () => {
  const con = (extra: PiezaAjena[], redes: CircuitoAjeno['redes']): CircuitoAjeno => ({
    formato: 'spice',
    nombre: 'mixto',
    piezas: [
      { ref: 'V1', tipo: 'V', valor: '12', props: { dc: '12' }, pines: [{ nombre: '+', numero: '1' }, { nombre: '−', numero: '2' }] },
      { ref: 'R1', tipo: 'R', valor: '1k', props: {}, pines: [{ nombre: '1', numero: '1' }, { nombre: '2', numero: '2' }] },
      ...extra
    ],
    redes,
    instrumentos: [],
    directivas: [],
    avisos: []
  })

  it('un BC548 se aproxima con el transistor más cercano y queda conectado', () => {
    const a = con([{ ref: 'Q1', tipo: 'Q', modelo: 'BC548', props: { tipoModelo: 'npn' }, pines: [{ nombre: 'C', numero: '1' }, { nombre: 'B', numero: '2' }, { nombre: 'E', numero: '3' }] }], [
      { nombre: 'vcc', pines: [{ ref: 'V1', pin: '+' }, { ref: 'R1', pin: '1' }] },
      { nombre: 'c', pines: [{ ref: 'R1', pin: '2' }, { ref: 'Q1', pin: 'C' }] },
      { nombre: 'b', pines: [{ ref: 'Q1', pin: 'B' }] },
      { nombre: '0', pines: [{ ref: 'V1', pin: '−' }, { ref: 'Q1', pin: 'E' }] }
    ])
    const { doc, informe, avisos } = importar(a)
    expect(informe.aproximadas).toHaveLength(1)
    expect(informe.aproximadas[0]).toMatchObject({ ref: 'Q1', tipo: 'Q', pieza: 'npn' })
    expect(avisos.some((x) => x.startsWith('Q1:'))).toBe(true)
    sinChoques(doc)
    expect(violaciones(doc, lib)).toEqual([])
    expect(problemasDeRedes(a, doc, lib)).toEqual([])
  })

  it('un LM13700 pasa a la caja gris con sus pines y sus conexiones', () => {
    const nombres = ['A1', 'DB1', 'IN+1', 'IN-1', 'OUT1', 'V-', 'BUF1', 'V+']
    const a = con([{ ref: 'U1', tipo: 'LM13700', props: {}, pines: nombres.map((nombre, i) => ({ nombre, numero: String(i + 1) })) }], [
      { nombre: 'a', pines: [{ ref: 'V1', pin: '+' }, { ref: 'U1', pin: '1' }, { ref: 'R1', pin: '1' }] },
      { nombre: 'o', pines: [{ ref: 'R1', pin: '2' }, { ref: 'U1', pin: '5' }] },
      { nombre: '0', pines: [{ ref: 'V1', pin: '−' }, { ref: 'U1', pin: '6' }] }
    ])
    const { doc, informe } = importar(a)
    const u = Object.values(doc.piezas).find((p) => p.ref === 'U1')!
    expect(u.tipo).toBe('sin-equivalencia')
    expect(u.pines).toHaveLength(8)
    expect(u.props.nombre).toBe('LM13700')
    expect(informe.sinEquivalencia).toEqual([{ id: u.id, ref: 'U1', tipo: 'LM13700', original: 'LM13700' }])
    expect(informe.convertidas).toBe(2)
    sinChoques(doc)
    expect(violaciones(doc, lib)).toEqual([])
    expect(problemasDeRedes(a, doc, lib)).toEqual([])
  })

  it('un TL081 es exacto y sus cinco pines quedan en el pin que dice su nombre', () => {
    const a = con([{ ref: 'U1', tipo: 'X', modelo: 'TL081', props: {}, pines: ['IN+', 'IN-', 'OUT', 'V+', 'V-'].map((nombre, i) => ({ nombre, numero: String(i + 1) })) }], [
      { nombre: 'p', pines: [{ ref: 'V1', pin: '+' }, { ref: 'U1', pin: 'V+' }, { ref: 'R1', pin: '1' }] },
      { nombre: 'n', pines: [{ ref: 'U1', pin: 'V-' }, { ref: 'U1', pin: 'IN-' }] },
      { nombre: 'o', pines: [{ ref: 'U1', pin: 'OUT' }, { ref: 'R1', pin: '2' }] },
      { nombre: '0', pines: [{ ref: 'V1', pin: '−' }, { ref: 'U1', pin: 'IN+' }] }
    ])
    const { doc, informe } = importar(a)
    const u = Object.values(doc.piezas).find((p) => p.ref === 'U1')!
    expect(u).toMatchObject({ tipo: 'amp-op', props: { modelo: 'TL081' } })
    expect(informe.aproximadas).toEqual([])
    const con_ = calcularConexiones(doc, lib)
    const red = (pin: string) => con_.redDePin.get(clavePin(u.id, pin))
    const v1 = Object.values(doc.piezas).find((p) => p.ref === 'V1')!
    expect(red('V+')).toBe(con_.redDePin.get(clavePin(v1.id, '+')))
    expect(red('+')).toBe(con_.redDePin.get(clavePin(v1.id, '-')))
    expect(red('V-')).toBe(red('-'))
    expect(new Set([red('V+'), red('+'), red('-'), red('OUT')]).size).toBe(4)
    expect(problemasDeRedes(a, doc, lib)).toEqual([])
  })
})

describe('instrumentos y análisis', () => {
  const rc = (): CircuitoAjeno => ({
    formato: 'spice',
    nombre: 'rc',
    piezas: [
      { ref: 'Vp', tipo: 'V', props: { forma: 'pulse' }, pines: [{ nombre: '+', numero: '1' }, { nombre: '−', numero: '2' }] },
      { ref: 'R1', tipo: 'R', valor: '1k', props: {}, pines: [{ nombre: '1', numero: '1' }, { nombre: '2', numero: '2' }] },
      { ref: 'C1', tipo: 'C', valor: '1u', props: {}, pines: [{ nombre: '1', numero: '1' }, { nombre: '2', numero: '2' }] }
    ],
    redes: [
      { nombre: 'ent', pines: [{ ref: 'Vp', pin: '+' }, { ref: 'R1', pin: '1' }] },
      { nombre: 'sal', pines: [{ ref: 'R1', pin: '2' }, { ref: 'C1', pin: '1' }] },
      { nombre: '0', pines: [{ ref: 'Vp', pin: '−' }, { ref: 'C1', pin: '2' }] }
    ],
    instrumentos: [
      { tipo: 'generador', forma: 'pulso', nombre: 'Vp', red: 'ent', referencia: '0', parametros: { v1: 0, v2: 5, td: 1e-3, tr: 1e-5, tf: 1e-5, pw: 4e-3, per: 1e-2 } },
      { tipo: 'sonda', magnitud: 'voltaje', nombre: 'S1', red: 'sal' },
      { tipo: 'sonda', magnitud: 'corriente', nombre: 'S2', red: 'ent' }
    ],
    directivas: [{ tipo: 'analisis', analisis: 'tran', parametros: { paso: 1e-5, fin: 0.03 }, trazas: ['sal', 'ent'] }, { tipo: 'otra', texto: '.include "x.lib"' }],
    avisos: []
  })

  it('el generador de pulso del origen es la fuente de pulso, sin duplicarse', () => {
    const { doc } = importar(rc())
    const fuentes = Object.values(doc.piezas).filter((p) => ['fuente-pulso', 'generador', 'fuente-dc'].includes(p.tipo))
    expect(fuentes).toHaveLength(1)
    expect(fuentes[0]).toMatchObject({ tipo: 'fuente-pulso', ref: 'Vp', props: { alto: '5', frecuencia: '100', ancho: '4m' } })
  })

  it('las sondas quedan en la red de lo que miden y el transitorio se guarda con trazas por red', () => {
    const { doc, informe } = importar(rc())
    const con = calcularConexiones(doc, lib)
    const sondas = Object.values(doc.sondas ?? {})
    expect(sondas.map((s) => s.tipo).sort()).toEqual(['corriente', 'voltaje'])
    const por = (ref: string) => Object.values(doc.piezas).find((p) => p.ref === ref)!
    const volt = sondas.find((s) => s.tipo === 'voltaje')!
    expect(con.redDeSonda.get(volt.id)).toBe(con.redDePin.get(clavePin(por('C1').id, '1')))
    const corr = sondas.find((s) => s.tipo === 'corriente')!
    expect(con.redDeSonda.get(corr.id)).toBe(con.redDePin.get(clavePin(por('R1').id, '1')))
    const an = Object.values(doc.analisis ?? {})
    expect(an).toHaveLength(1)
    expect(an[0]).toMatchObject({ nombre: 'Transitorio importado', config: { tipo: 'tran', fin: 0.03 } })
    expect([...an[0]!.trazas!.redes].sort()).toEqual(['ent', 'sal'])
    expect(informe.analisis).toHaveLength(1)
    expect(informe.omitidas).toEqual(['.include "x.lib"'])
  })

  it('un generador sin pieza se agrega conectado a su red y a tierra', () => {
    const a = rc()
    a.piezas = a.piezas.slice(1)
    a.redes = a.redes.map((r) => ({ ...r, pines: r.pines.filter((q) => q.ref !== 'Vp') }))
    a.instrumentos = [a.instrumentos[0]!]
    a.directivas = []
    const { doc } = importar(a)
    const g = Object.values(doc.piezas).find((p) => p.tipo === 'fuente-pulso')!
    const con = calcularConexiones(doc, lib)
    const r1 = Object.values(doc.piezas).find((p) => p.ref === 'R1')!
    expect(con.redDePin.get(clavePin(g.id, '+'))).toBe(con.redDePin.get(clavePin(r1.id, '1')))
    expect(con.redes[con.redDePin.get(clavePin(g.id, '-'))!]!.tierra).toBe(true)
    expect(violaciones(doc, lib)).toEqual([])
  })

  it('un osciloscopio virtual se une a sus redes por etiquetas junto a sus entradas y un voltímetro se mide con sondas', () => {
    const a = rc()
    a.instrumentos = [{ tipo: 'virtual', clase: 'osciloscopio', nombre: 'Osc', redes: ['ent', 'sal'] }, { tipo: 'virtual', clase: 'voltimetro', nombre: 'VM', redes: ['sal', '0'] }]
    a.directivas = []
    a.piezas[0] = { ...a.piezas[0]!, valor: '5', props: { dc: '5' } }
    const { doc } = importar(a)
    const osc = Object.values(doc.piezas).find((p) => p.tipo === 'osciloscopio')!
    const mm = Object.values(doc.piezas).find((p) => p.tipo === 'multimetro')!
    const sondas = Object.values(doc.sondas ?? {})
    expect(sondas.filter((s) => s.instrumento === osc.id)).toEqual([])
    const con = calcularConexiones(doc, lib)
    const redDe = (ref: string, pin: string) => con.redDePin.get(clavePin(Object.values(doc.piezas).find((p) => p.ref === ref)!.id, pin))
    expect(redDe(osc.ref, 'A')).toBeDefined()
    expect(redDe(osc.ref, 'A')).toBe(redDe('R1', '1'))
    expect(redDe(osc.ref, 'B')).toBe(redDe('R1', '2'))
    expect(redDe(osc.ref, 'A')).not.toBe(redDe(osc.ref, 'B'))
    expect(sondas.filter((s) => s.instrumento === mm.id).map((s) => s.entrada).sort()).toEqual(['+', 'COM'])
    sinChoques(doc)
    expect(violaciones(doc, lib)).toEqual([])
  })
})

describe('osciloscopio de una gráfica', () => {
  it('toma la base del tiempo de la gráfica, la escala de su rango y un canal por traza', () => {
    const a = divisor(true)
    a.instrumentos = [{ tipo: 'virtual', clase: 'osciloscopio', nombre: 'GRAFICA', redes: ['in', 'out'], x: 70, y: 60, ventana: [0, 50], rangoY: [-0.2, 1.2] }]
    const { c, doc } = importar(a)
    const osc = Object.values(doc.piezas).find((p) => p.tipo === 'osciloscopio')!
    expect(osc.props).toMatchObject({ a_on: 'encendido', b_on: 'encendido', base: '5', a_vdiv: '200m', b_vdiv: '200m', a_pos: '-2.4' })
    expect(osc.props.c_on).toBeUndefined()
    expect(c.avisos).toContain('La gráfica GRAFICA pasó a un osciloscopio y a un análisis transitorio.')
    expect(Object.values(doc.sondas ?? {})).toEqual([])
    sinChoques(doc)
    expect(violaciones(doc, lib)).toEqual([])
  })
})

describe('cablear', () => {
  it('una red sin ruta posible queda con etiquetas del mismo nombre', () => {
    // Un muro de 128 pines separa los extremos más allá de lo que el enrutador explora.
    const doc: Documento = documentoVacio()
    const pieza = (id: string, tipo: string, x: number, y: number): Pieza => ({ id, tipo, ref: id.toUpperCase(), x, y, rot: 0, espejo: false, props: {} })
    const pines = Array.from({ length: 128 }, (_, i) => ({ id: `p${i}`, nombre: `${i}`, lado: i < 64 ? ('izq' as const) : ('der' as const) }))
    doc.piezas.a = pieza('a', 'resistencia', 0, 0)
    doc.piezas.b = pieza('b', 'resistencia', 80, 0)
    doc.piezas.muro = { ...pieza('muro', 'sin-equivalencia', 40, 0), props: { nombre: 'M' }, pines }
    const res = cablear(doc, lib, [{ nombre: 'X', tierra: false, pines: [{ pieza: doc.piezas.a!, pin: '2' }, { pieza: doc.piezas.b!, pin: '1' }] }], idSecuencial(), () => pieza('t', 'tierra', 0, 0))
    expect(res.cables).toHaveLength(0)
    expect(res.etiquetas.map((e) => e.nombre)).toEqual(['X', 'X'])
    expect(res.conEtiqueta).toEqual([{ nombre: 'X', piezas: ['a', 'b'] }])
    const con = calcularConexiones(doc, lib)
    expect(con.redDePin.get(clavePin('a', '2'))).toBe(con.redDePin.get(clavePin('b', '1')))
  })
})

describe('valores raros que vienen del archivo', () => {
  it('un giro que no es número no escribe «NaN» en los avisos', () => {
    const a = divisor(true)
    a.piezas[1] = { ...a.piezas[1]!, giro: NaN }
    expect(importar(a).avisos.join(' ')).not.toContain('NaN')
  })

  it('una ley de potenciómetro con nombre de propiedad de Object no se toma por una ley', () => {
    const a: CircuitoAjeno = {
      formato: 'proteus', nombre: 'pot', unidadesPorMm: 1,
      piezas: [{ ref: 'RV1', tipo: 'POT', valor: '10k', props: { LAW: 'constructor' }, pines: [{ nombre: '1' }, { nombre: '2' }, { nombre: '3' }] }],
      redes: [], instrumentos: [], directivas: [], avisos: []
    }
    const { doc } = importar(a)
    const rv = Object.values(doc.piezas).find((p) => p.ref.startsWith('RV'))!
    expect(Object.values(rv.props).every((v) => typeof v === 'string')).toBe(true)
  })
})

describe('potenciómetro con un extremo libre', () => {
  const circuito = (conectados: string[], posicion: string): CircuitoAjeno => ({
    formato: 'proteus',
    nombre: 'pot',
    unidadesPorMm: 1,
    piezas: [
      { ref: 'V1', tipo: 'BATTERY', valor: '5', props: {}, pines: [{ nombre: '+', numero: '1' }, { nombre: '-', numero: '2' }] },
      { ref: 'RV1', tipo: 'POT', valor: '10k', props: { posicion }, pines: [{ nombre: '1' }, { nombre: '2' }, { nombre: '3' }] }
    ],
    redes: [
      { nombre: 'A', pines: [{ ref: 'V1', pin: '1' }, ...conectados.filter((c) => c !== '3').map((pin) => ({ ref: 'RV1', pin }))] },
      { nombre: '0', pines: [{ ref: 'V1', pin: '2' }, { ref: 'RV1', pin: '3' }] }
    ],
    instrumentos: [],
    directivas: [],
    avisos: []
  })

  it('con el cursor y un extremo conectados se importa como reóstato, con su valor y el aviso en el informe', () => {
    const { doc, informe } = importar(circuito(['1', '3'], '0.25'))
    const rv = Object.values(doc.piezas).find((p) => p.ref.startsWith('RV'))!
    expect(rv.tipo).toBe('reostato')
    expect(rv.props).toMatchObject({ valor: '10k', posicion: '25 %' })
    expect(informe.aproximadas.map((a) => a.pieza)).toContain('reostato')
    expect(informe.avisos.some((a) => a.includes('tenía un extremo libre: se importó como reóstato'))).toBe(true)
    const con = calcularConexiones(doc, lib)
    expect(con.redDePin.get(clavePin(rv.id, '1'))).toBeDefined()
    expect(con.redDePin.get(clavePin(rv.id, '2'))).toBeDefined()
    expect(con.redDePin.get(clavePin(rv.id, '1'))).not.toBe(con.redDePin.get(clavePin(rv.id, '2')))
  })

  it('si el extremo conectado es el otro, la posición se invierte', () => {
    const { doc } = importar(circuito(['2', '3'], '0.25'))
    const rv = Object.values(doc.piezas).find((p) => p.ref.startsWith('RV'))!
    expect(rv.tipo).toBe('reostato')
    expect(rv.props.posicion).toBe('75 %')
  })

  it('un reóstato de 10 kΩ al 10 % entre el pin 1 y el cursor queda en 1 kΩ efectivos', () => {
    const { doc } = importar(circuito(['1', '3'], '0.1'))
    const rv = Object.values(doc.piezas).find((p) => p.ref.startsWith('RV'))!
    expect(rv.props).toMatchObject({ valor: '10k', posicion: '10 %' })
  })

  it('con el pin 2 conectado queda el tramo restante: 90 % de la posición se vuelve 10 %', () => {
    const { doc } = importar(circuito(['2', '3'], '0.9'))
    expect(Object.values(doc.piezas).find((p) => p.ref.startsWith('RV'))!.props.posicion).toBe('10 %')
  })

  it('una ley logarítmica de Proteus se pasa a la de Kirchi y se avisa que es aproximada', () => {
    const c = circuito(['1', '2', '3'], '0.5')
    c.piezas[1]!.props.LAW = '1'
    const { doc, informe } = importar(c)
    expect(Object.values(doc.piezas).find((p) => p.ref.startsWith('RV'))!.props.ley).toBe('logarítmica')
    expect(informe.avisos.some((a) => a.includes('RV1') && a.includes('ley'))).toBe(true)
  })

  it('con los tres pines conectados sigue siendo un potenciómetro', () => {
    const a = circuito(['1', '3'], '0.5')
    a.redes.push({ nombre: 'B', pines: [{ ref: 'RV1', pin: '2' }] })
    const { doc } = importar(a)
    expect(Object.values(doc.piezas).find((p) => p.ref.startsWith('RV'))!.tipo).toBe('potenciometro')
  })
})

describe('piezas comunes de Proteus con familia propia', () => {
  const proteus = (piezas: PiezaAjena[], redes: CircuitoAjeno['redes'] = []): CircuitoAjeno => ({
    formato: 'proteus', nombre: 'p', unidadesPorMm: 1, piezas, redes, instrumentos: [], directivas: [], avisos: []
  })
  const pz = (ref: string, tipo: string, pines: string[], extra: Partial<PiezaAjena> = {}): PiezaAjena => ({ ref, tipo, props: {}, pines: pines.map((n) => ({ nombre: n })), ...extra })

  it('un pull-down sin valor numérico es una resistencia de 10k y con valor conserva el suyo', () => {
    const { doc } = importar(proteus([pz('R1', 'PULLDOWN', ['1', '2'], { valor: 'PULLDOWN' }), pz('R2', 'PULLUP', ['1', '2'], { valor: '4k7' })]))
    expect(Object.values(doc.piezas).filter((p) => p.tipo === 'resistencia').map((p) => p.props.valor).sort()).toEqual(['10k', '4.7k'])
  })

  it('el motor a pasos une sus dos comunes y conecta las cuatro bobinas a sus pines', () => {
    const a = proteus(
      [pz('M1', 'MOTOR-STEPPER', ['AC', 'A1', 'A2', 'BC', 'B1', 'B2']), pz('V1', 'BATTERY', ['+', '-'], { valor: '5' })],
      [{ nombre: 'VCC', pines: [{ ref: 'M1', pin: 'AC' }, { ref: 'M1', pin: 'BC' }, { ref: 'V1', pin: '+' }] }, { nombre: 'N1', pines: [{ ref: 'M1', pin: 'A1' }] }]
    )
    const { doc, informe } = importar(a)
    const m = Object.values(doc.piezas).find((p) => p.tipo === 'motor-pasos-unipolar')!
    expect(m).toBeDefined()
    const con = calcularConexiones(doc, lib)
    expect(con.redDePin.get(clavePin(m.id, 'COM'))).toBeDefined()
    expect(con.redDePin.get(clavePin(m.id, 'A'))).toBeDefined()
    expect(informe.aproximadas.map((x) => x.pieza)).toContain('motor-pasos-unipolar')
  })

  it('un 74HC595 toma la familia HC y un 4511 el decodificador de 7 segmentos CMOS, este último como aproximado', () => {
    const a = proteus([pz('U1', 'SN74HC595N', ['SER']), pz('U2', '4511', ['A', 'B'])])
    const { doc, informe } = importar(a)
    expect(Object.values(doc.piezas).find((p) => p.tipo === 'registro-595')?.props.familia).toBe('74HC')
    const d = Object.values(doc.piezas).find((p) => p.tipo === 'decodificador-7seg')!
    expect(d.props).toMatchObject({ familia: 'CD4000B', salidas: 'activas en alto' })
    expect(informe.aproximadas.map((x) => x.pieza)).toEqual(['decodificador-7seg'])
  })
})

describe('verificador de redes con alimentaciones del mismo voltaje', () => {
  const riel = (ref: string): PiezaAjena => ({ ref, tipo: 'R', valor: '5', props: { forma: 'cd', amplitud: '5' }, pines: [{ numero: '1' }] })
  const resistencia = (ref: string): PiezaAjena => ({ ref, tipo: 'r', props: {}, pines: [{ numero: '1' }, { numero: '2' }] })
  const dosRieles = (v2: string): CircuitoAjeno => ({
    formato: 'falstad',
    nombre: 'rieles',
    piezas: [riel('V1'), resistencia('R1'), { ...riel('V2'), valor: v2, props: { forma: 'cd', amplitud: v2 } }, resistencia('R2'), { ref: 'GND1', tipo: 'g', props: {}, pines: [{ numero: '1' }] }],
    redes: [
      { nombre: 'N1', pines: [{ ref: 'V1', pin: '1' }, { ref: 'R1', pin: '1' }] },
      { nombre: 'N2', pines: [{ ref: 'V2', pin: '1' }, { ref: 'R2', pin: '1' }] },
      { nombre: '0', pines: [{ ref: 'R1', pin: '2' }, { ref: 'R2', pin: '2' }, { ref: 'GND1', pin: '1' }] }
    ],
    instrumentos: [],
    directivas: [],
    avisos: []
  })

  it('dos rieles de 5 V separados en el origen no se cuentan como redes unidas', () => {
    const a = dosRieles('5')
    const { doc } = importar(a)
    expect(Object.values(doc.piezas).filter((p) => p.tipo === 'alimentacion').map((p) => p.props.nombre)).toEqual(['+5V', '+5V'])
    expect(problemasDeRedes(a, doc, lib)).toEqual([])
  })

  it('dos rieles de voltajes distintos quedan en redes distintas', () => {
    const a = dosRieles('3')
    const { doc } = importar(a)
    expect(problemasDeRedes(a, doc, lib)).toEqual([])
  })
})

describe('fuente de CD de un riel con nombre', () => {
  const circuito = (trazas: string[]): CircuitoAjeno => ({
    formato: 'spice',
    nombre: 'riel',
    unidadesPorMm: 1,
    piezas: [
      { ref: 'V1', tipo: 'V', valor: '5', props: { dc: '5' }, pines: [{ nombre: '+', numero: '1' }, { nombre: '−', numero: '2' }] },
      { ref: 'R1', tipo: 'R', valor: '1k', props: {}, pines: [{ nombre: '1', numero: '1' }, { nombre: '2', numero: '2' }] }
    ],
    redes: [{ nombre: 'vcc', pines: [{ ref: 'V1', pin: '+' }, { ref: 'R1', pin: '1' }] }, { nombre: '0', pines: [{ ref: 'V1', pin: '−' }, { ref: 'R1', pin: '2' }] }],
    dibujo: { cables: [], uniones: [], etiquetas: [{ nombre: 'vcc', x: 0, y: 0 }], terminales: [], textos: [] },
    instrumentos: [],
    directivas: [{ tipo: 'analisis', analisis: 'tran', parametros: { paso: 1e-6, fin: 1e-3 }, trazas }],
    avisos: []
  })
  const tipos = (trazas: string[]): string[] => {
    const gen = idSecuencial()
    return Object.values(armarDocumento(convertir(circuito(trazas), lib, gen), lib, gen).doc.piezas).map((p) => p.tipo)
  }
  it('sin que nada la cite pasa a ser el voltaje del riel', () => {
    expect(tipos([])).not.toContain('fuente-dc')
  })
  it('la que un análisis grafica por su corriente (.probe i(v1)) se queda como pieza', () => {
    expect(tipos(['i(V1)'])).toContain('fuente-dc')
  })
})

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { leerSpice, numeroSpice } from './spice'

const leer = (n: string) => leerSpice(readFileSync(join(__dirname, '..', '__fixtures__', 'spice', n), 'utf8'), n)
const pieza = (c: ReturnType<typeof leerSpice>, ref: string) => c.piezas.find((p) => p.ref === ref)!
const red = (c: ReturnType<typeof leerSpice>, nombre: string) => c.redes.find((r) => r.nombre === nombre)!

describe('numeroSpice', () => {
  it('entiende todos los sufijos', () => {
    const casos: [string, number][] = [
      ['1f', 1e-15], ['2p', 2e-12], ['3n', 3e-9], ['4u', 4e-6], ['5µ', 5e-6], ['6m', 6e-3],
      ['7k', 7e3], ['8meg', 8e6], ['9g', 9e9], ['1t', 1e12], ['10mil', 254e-6], ['1.5e3', 1500], ['-2.5k', -2500], ['.5', 0.5]
    ]
    for (const [t, v] of casos) expect(numeroSpice(t)).toBeCloseTo(v, 18)
  })
  it('ignora la unidad pegada tras el sufijo y distingue m de meg', () => {
    expect(numeroSpice('10uF')).toBeCloseTo(10e-6, 15)
    expect(numeroSpice('1kohm')).toBe(1000)
    expect(numeroSpice('1MEG')).toBe(1e6)
    expect(numeroSpice('5V')).toBe(5)
    expect(numeroSpice('3mA')).toBeCloseTo(3e-3, 15)
  })
  it('devuelve null si no es un número', () => {
    expect(numeroSpice('abc')).toBeNull()
    expect(numeroSpice('')).toBeNull()
    expect(numeroSpice('{r1}')).toBeNull()
  })
})

describe('divisor.cir', () => {
  const c = leer('divisor.cir')
  it('lee piezas con refs, tipos, valores y pines', () => {
    expect(c.formato).toBe('spice')
    expect(c.piezas.map((p) => p.ref)).toEqual(['V1', 'R1', 'R2'])
    expect(pieza(c, 'R1')).toMatchObject({ tipo: 'R', valor: '10k', pines: [{ numero: '1', nombre: '1' }, { numero: '2', nombre: '2' }] })
    expect(pieza(c, 'V1')).toMatchObject({ tipo: 'V', valor: '12', pines: [{ numero: '1', nombre: '+' }, { numero: '2', nombre: '−' }] })
  })
  it('agrupa por nodo y toma 0 como tierra', () => {
    expect(red(c, 'in').pines).toEqual([{ ref: 'V1', pin: '1' }, { ref: 'R1', pin: '1' }])
    expect(red(c, 'out').pines).toEqual([{ ref: 'R1', pin: '2' }, { ref: 'R2', pin: '1' }])
    expect(red(c, '0').pines).toEqual([{ ref: 'V1', pin: '2' }, { ref: 'R2', pin: '2' }])
  })
  it('lee .op y no genera instrumentos con DC simple', () => {
    expect(c.directivas).toEqual([{ tipo: 'analisis', analisis: 'op', parametros: {}, trazas: [] }])
    expect(c.instrumentos).toEqual([])
    expect(c.avisos).toEqual([])
  })
})

describe('rc.cir', () => {
  const c = leer('rc.cir')
  it('crea el generador de pulso en SI además de la pieza', () => {
    expect(pieza(c, 'Vp').props.forma).toBe('pulse')
    expect(c.instrumentos).toEqual([
      { tipo: 'generador', forma: 'pulso', nombre: 'Vp', red: 'ent', referencia: '0', parametros: { v1: 0, v2: 5, td: 1e-3, tr: 1e-5, tf: 1e-5, pw: 4e-3, per: 1e-2 } }
    ])
  })
  it('lee .tran con sus trazas de .print', () => {
    expect(c.directivas).toEqual([{ tipo: 'analisis', analisis: 'tran', parametros: { paso: 1e-5, fin: 0.03 }, trazas: ['sal', 'ent'] }])
    expect(pieza(c, 'C1')).toMatchObject({ valor: '1u' })
  })
})

describe('inversor.cir', () => {
  const c = leer('inversor.cir')
  it('guarda el subcircuito sin agregar sus elementos internos', () => {
    expect(c.piezas.map((p) => p.ref)).toEqual(['Vs', 'Vcc', 'Vee', 'R1', 'Rf', 'X1'])
    const sub = c.directivas.find((d) => d.tipo === 'subcircuito')
    expect(sub).toMatchObject({ nombre: 'opamp', nodos: ['inp', 'inn', 'out', 'vcc', 'vee'] })
    expect(sub && sub.tipo === 'subcircuito' && sub.cuerpo).toContain('E1 int 0 inp inn 100k')
  })
  it('la llamada X toma el nombre del subcircuito y los nombres de sus terminales', () => {
    const x = pieza(c, 'X1')
    expect(x.tipo).toBe('opamp')
    expect(x.pines.map((p) => p.nombre)).toEqual(['inp', 'inn', 'out', 'vcc', 'vee'])
    expect(x.pines.map((p) => p.numero)).toEqual(['1', '2', '3', '4', '5'])
    expect(red(c, '0').pines).toContainEqual({ ref: 'X1', pin: '1' })
  })
  it('lee la fuente senoidal, .ac y .probe', () => {
    expect(c.instrumentos).toEqual([
      { tipo: 'generador', forma: 'senoidal', nombre: 'Vs', red: 'in', referencia: '0', parametros: { vo: 0, va: 1, freq: 1000 } }
    ])
    expect(pieza(c, 'Vs').props.ac).toBe('1')
    expect(c.directivas.find((d) => d.tipo === 'analisis')).toEqual({ tipo: 'analisis', analisis: 'ac', parametros: { tipo: 'dec', puntos: 20, fi: 10, ff: 1e5 }, trazas: ['out'] })
  })
})

describe('transistor.cir', () => {
  const c = leer('transistor.cir')
  it('lee el NPN con sus pines C B E', () => {
    expect(pieza(c, 'Q1')).toMatchObject({ tipo: 'Q', modelo: '2N3904', props: { tipoModelo: 'npn' } })
    expect(pieza(c, 'Q1').pines.map((p) => p.nombre)).toEqual(['C', 'B', 'E'])
  })
  it('guarda el .model en línea con parámetros en SI', () => {
    const m = c.directivas.find((d) => d.tipo === 'modelo')
    expect(m).toEqual({ tipo: 'modelo', nombre: '2N3904', clase: 'npn', parametros: { is: 6.7e-15, bf: 416, vaf: 74, cje: 4.5e-12 } })
  })
  it('lee .dc y las trazas de .plot', () => {
    expect(c.directivas.find((d) => d.tipo === 'analisis')).toEqual({
      tipo: 'analisis', analisis: 'dc', parametros: { fuente: 'Vb', inicio: 0.5, fin: 0.9, paso: 0.01 }, trazas: ['i(Vcc)', 'c']
    })
  })
})

describe('filtro.sp', () => {
  const c = leer('filtro.sp')
  it('une continuaciones y quita comentarios', () => {
    expect(pieza(c, 'R1')).toMatchObject({ valor: '4.7kohm' })
    expect(red(c, 'nodo').pines).toContainEqual({ ref: 'R1', pin: '2' })
    expect(pieza(c, 'Vin').props.ac).toBe('1')
  })
  it('trata GND y gnd como tierra', () => {
    expect(red(c, '0').pines).toEqual(expect.arrayContaining([{ ref: 'Vin', pin: '2' }, { ref: 'C1', pin: '2' }, { ref: 'Rl', pin: '2' }]))
    expect(c.redes.map((r) => r.nombre)).not.toContain('GND')
  })
  it('pasa el acoplamiento K a los dos inductores con aviso', () => {
    expect(pieza(c, 'L1').props.acoplamiento).toBe('0.9')
    expect(pieza(c, 'L2').props.acoplamiento).toBe('0.9')
    expect(c.piezas.some((p) => p.ref === 'K1')).toBe(false)
    expect(c.avisos.some((a) => /acoplamiento/.test(a) && /Línea 10/.test(a))).toBe(true)
  })
  it('manda .include y .options a directivas y .param a propiedades globales', () => {
    const otras = c.directivas.filter((d) => d.tipo === 'otra').map((d) => (d as { texto: string }).texto)
    expect(otras).toEqual(['.include "modelos/extra.lib"', '.options reltol=1e-4'])
    expect(c.params).toEqual({ ganancia: '2' })
  })
  it('ignora .control con aviso y termina en .end', () => {
    expect(c.avisos.some((a) => /\.control/.test(a) && /Línea 13/.test(a))).toBe(true)
    expect(c.directivas.filter((d) => d.tipo === 'analisis')).toEqual([{ tipo: 'analisis', analisis: 'ac', parametros: { tipo: 'oct', puntos: 10, fi: 1, ff: 1e6 }, trazas: [] }])
  })
})

describe('casos sueltos', () => {
  it('avisa de elementos desconocidos con su número de línea', () => {
    const c = leerSpice('titulo\nZ1 a b 3\nR1 a 0 1k\n.end\n', 'x')
    expect(c.piezas.map((p) => p.ref)).toEqual(['R1'])
    expect(c.avisos).toEqual(['Línea 2: no se reconoció el elemento «Z1».'])
  })
  it('lee .tran con inicio, máximo y uic, y .four', () => {
    const c = leerSpice('t\nR1 a 0 1\n.tran 1u 1m 0.1m 2u uic\n.four 1k v(a)\n.end', 'x')
    expect(c.directivas).toEqual([
      { tipo: 'analisis', analisis: 'tran', parametros: { paso: 1e-6, fin: 1e-3, inicio: 1e-4, max: 2e-6, uic: 1 }, trazas: [] },
      { tipo: 'analisis', analisis: 'fourier', parametros: { f: 1000 }, trazas: ['a'] }
    ])
  })
  it('lee diodo, MOSFET, JFET, fuentes controladas y fuente I', () => {
    const c = leerSpice('t\nD1 a k dmod\nM1 d g s b nm W=10u\nJ1 d g s jm\nE1 o 0 a b 2\nG1 o 0 a b 1m\nF1 o 0 Vx 3\nH1 o 0 Vx 4\nI1 a 0 1m\nB1 o 0 V=v(a)*2\nQ2 c b e s npnx\n.model dmod D(is=1n)\n.model nm NMOS(vto=1)\n.end', 'x')
    expect(pieza(c, 'D1').pines.map((p) => p.nombre)).toEqual(['A', 'K'])
    expect(pieza(c, 'D1').props.tipoModelo).toBe('d')
    expect(pieza(c, 'M1').pines.map((p) => p.nombre)).toEqual(['D', 'G', 'S', 'B'])
    expect(pieza(c, 'M1').props.tipoModelo).toBe('nmos')
    expect(pieza(c, 'M1').props.w).toBe('10u')
    expect(pieza(c, 'J1').pines).toHaveLength(3)
    expect(pieza(c, 'E1')).toMatchObject({ valor: '2' })
    expect(pieza(c, 'E1').pines).toHaveLength(4)
    expect(pieza(c, 'F1')).toMatchObject({ valor: '3', props: { controladora: 'Vx' } })
    expect(pieza(c, 'B1').props.expresion).toBe('V=v(a)*2')
    expect(pieza(c, 'Q2').pines.map((p) => p.nombre)).toEqual(['C', 'B', 'E', 'S'])
    expect(c.avisos).toEqual([])
  })
  it('no es sensible a mayúsculas', () => {
    const c = leerSpice('T\nr1 A gnd 1K\n.OP\n.END', 'x')
    expect(c.piezas[0]).toMatchObject({ ref: 'r1', tipo: 'R', valor: '1K' })
    expect(c.directivas[0]).toMatchObject({ analisis: 'op' })
  })
})

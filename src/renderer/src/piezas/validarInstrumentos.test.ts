import { describe, expect, it } from 'vitest'
import { validarPieza } from './validar'

const txt = (o: unknown) => JSON.stringify(o, null, 2)
const errores = (o: unknown) => {
  const v = validarPieza(txt(o), 'x/pieza.json')
  return v.ok ? [] : v.errores
}
const casilla = (id: string, nombre: string, opciones: [string, string], defecto = opciones[0]) => ({ id, nombre, opciones, defecto, casilla: true })
const multimetro = {
  id: 'multimetro',
  nombre: { es: 'Multímetro', en: 'Multimeter' },
  categoria: 'instrumentos',
  prefijo: 'XMM',
  buscar: ['multímetro'],
  pines: [
    { id: '+', nombre: '+', x: 0, y: -6 },
    { id: 'COM', nombre: 'COM', x: 0, y: 6 }
  ],
  props: [
    { id: 'modo', nombre: 'Modo', defecto: 'V DC', opciones: ['V DC', 'V AC', 'A DC', 'A AC', 'Ω', 'Continuidad'] },
    casilla('ideal', 'Instrumento ideal', ['no', 'sí'])
  ],
  modelo: { tipo: 'multimetro', mas: '+', com: 'COM', modo: 'modo', ideal: 'ideal' },
  rotulos: [{ prop: 'modo', valores: { 'V DC': 'V', 'V AC': 'V', 'A DC': 'A', 'A AC': 'A', Ω: 'Ω', Continuidad: 'Ω' }, x: 0, y: 0, tam: 2.5 }]
}

describe('los modelos de los instrumentos', () => {
  it('acepta el multímetro con su casilla y su rótulo que sigue al modo', () => {
    const v = validarPieza(txt(multimetro), 'x/pieza.json')
    expect(v.ok).toBe(true)
    if (v.ok) {
      expect(v.def.props[1].casilla).toBe(true)
      expect(v.def.rotulos?.[0]).toMatchObject({ prop: 'modo', valores: { Ω: 'Ω' }, texto: 'V DC' })
    }
  })

  it('una casilla es una lista de dos opciones', () => {
    const props = [multimetro.props[0], { ...casilla('ideal', 'Instrumento ideal', ['no', 'sí']), opciones: ['no', 'sí', 'tal vez'] }]
    expect(errores({ ...multimetro, props })).toContain('x/pieza.json: props[1].casilla solo aplica a una lista de dos opciones')
    const sinCasilla = [multimetro.props[0], { id: 'ideal', nombre: 'Instrumento ideal', opciones: ['no', 'sí'], defecto: 'no' }]
    expect(errores({ ...multimetro, props: sinCasilla })).toContain('x/pieza.json: modelo.ideal debe ser una casilla (lista de dos opciones con "casilla": true)')
  })

  it('los valores de un rótulo son un texto por opción de su propiedad de lista', () => {
    const rotulos = [{ ...multimetro.rotulos[0], valores: { 'V DC': 'V', Ohm: 'Ω' } }]
    expect(errores({ ...multimetro, rotulos })).toContain('x/pieza.json: rotulos[0].valores debe dar un texto por opción de su propiedad («Ohm» no es una)')
  })

  it('el modelo nombra pines distintos de la pieza y sus propiedades', () => {
    expect(errores({ ...multimetro, modelo: { ...multimetro.modelo, com: '+' } })).toContain('x/pieza.json: modelo cada terminal debe ser un pin distinto')
    expect(errores({ ...multimetro, modelo: { ...multimetro.modelo, modo: 'escala' } })).toContain('x/pieza.json: modelo.modo no es una propiedad de la pieza')
    expect(errores({ ...multimetro, modelo: { ...multimetro.modelo, rango: 'auto' } })[0]).toMatch(/modelo.rango clave desconocida en un modelo «multimetro»/)
  })

  it('el osciloscopio nombra sus cuatro entradas', () => {
    const osc = {
      ...multimetro,
      id: 'osciloscopio',
      prefijo: 'XSC',
      pines: ['A', 'B', 'C', 'D'].map((id, k) => ({ id, nombre: id, x: -8, y: -6 + 4 * k })),
      props: [casilla('ideal', 'Instrumento ideal', ['no', 'sí'])],
      modelo: { tipo: 'osciloscopio', entradas: ['A', 'B', 'C'], ideal: 'ideal' },
      rotulos: undefined
    }
    expect(errores(osc)).toContain('x/pieza.json: modelo.entradas debe nombrar las cuatro entradas, A a D')
    expect(errores({ ...osc, modelo: { ...osc.modelo, entradas: ['A', 'B', 'C', 'D'] } })).toEqual([])
  })

  it('las variantes de símbolo van de cada opción de una lista a un archivo simbolo-<nombre>.svg', () => {
    const variantes = { prop: 'modo', simbolos: { 'V DC': 'simbolo-v.svg', Ω: 'simbolo-ohm.svg' } }
    expect(errores({ ...multimetro, variantes })).toEqual([])
    expect(errores({ ...multimetro, variantes: { ...variantes, simbolos: { Amper: 'simbolo-a.svg' } } })).toContain('x/pieza.json: variantes.simbolos.Amper no es una de las opciones de la propiedad')
    expect(errores({ ...multimetro, variantes: { ...variantes, simbolos: { 'V DC': 'otro.svg' } } })).toContain('x/pieza.json: variantes.simbolos.V DC debe ser un archivo simbolo-<nombre>.svg')
  })
})

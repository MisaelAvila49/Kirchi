import { describe, expect, it } from 'vitest'
import type { NetlistMotor } from '../netlistMotor'
import { armarMazo, validarPeticion } from './mazo'

const netlist: NetlistMotor = {
  nodes: 3,
  elements: [
    { type: 'V', a: 1, b: 0, wave: { kind: 'dc', v: 5 } },
    { type: 'R', a: 1, b: 2, ohms: 1000 },
    { type: 'R', a: 2, b: 0, ohms: 1000 },
    { type: 'V', a: 2, b: 0, wave: { kind: 'dc', v: 0 } }
  ]
}
const LINEA = /^(\*|\.|set |save |op$|tran |ac |dc |let |write |foreach |alter |end$|[a-z]+\d+ |[a-z]+\d*$)/i

describe('armarMazo', () => {
  it('termina en salto de linea y no deja lineas rotas ni saltos literales', () => {
    const m = armarMazo(validarPeticion({ netlist, analisis: { tipo: 'op' } }))
    expect(m.texto.endsWith('.end\n')).toBe(true)
    expect(m.texto.includes(String.fromCharCode(92))).toBe(false)
    for (const l of m.texto.split('\n').slice(0, -1)) expect(l, l).toMatch(LINEA)
  })
  it('un transitorio con condiciones iniciales lleva uic aunque no se haya pedido', () => {
    const conIc: NetlistMotor = { nodes: 2, elements: [{ type: 'R', a: 1, b: 0, ohms: 1000 }, { type: 'C', a: 1, b: 0, farads: 1e-5, ic: 5 }] }
    const peticion = (n: NetlistMotor) => armarMazo(validarPeticion({ netlist: n, analisis: { tipo: 'tran', paso: 1e-5, fin: 1e-3 } })).texto
    expect(peticion(conIc)).toMatch(/^tran .* uic$/m)
    expect(peticion({ nodes: 2, elements: [{ type: 'R', a: 1, b: 0, ohms: 1000 }, { type: 'C', a: 1, b: 0, farads: 1e-5 }] })).not.toMatch(/uic/)
  })
  it('barrido DC con segunda fuente y paso hacia atras', () => {
    const m = armarMazo(validarPeticion({ netlist, analisis: { tipo: 'dc', fuente: 0, desde: 5, hasta: 0, paso: 1, segunda: { fuente: 3, desde: 0, hasta: 2, paso: 1 } } }))
    expect(m.texto).toContain('dc v0 5 0 -1 v3 0 2 1\n')
  })
  it('CA con magnitud en la fuente elegida', () => {
    const m = armarMazo(validarPeticion({ netlist, analisis: { tipo: 'ac', barrido: 'dec', puntos: 10, desde: 1, hasta: 1000, fuente: 3, magnitud: 0.5 } }))
    expect(m.texto).toMatch(/^v3 n2 0 .* ac 0\.5$/m)
    expect(m.texto).toContain('ac dec 10 1 1000\n')
  })
  it('CA con frecuencias incluidas: la rejilla y un punto exacto por cada una, en el mismo archivo', () => {
    const m = armarMazo(validarPeticion({ netlist, analisis: { tipo: 'ac', barrido: 'dec', puntos: 10, desde: 1, hasta: 1000, fuente: 3, incluir: [120, 60, 60] } }))
    expect(m.texto).toContain('set appendwrite\n')
    expect(m.texto).toContain('ac dec 10 1 1000\nwrite salida.raw\nac lin 1 60 60\nwrite salida.raw\nac lin 1 120 120\nwrite salida.raw\n')
    expect(() => validarPeticion({ netlist, analisis: { tipo: 'ac', barrido: 'dec', puntos: 10, desde: 1, hasta: 1000, incluir: [5000] } })).toThrow(/fuera del barrido/)
  })
  it('barrido de parametro con alter dentro de un bucle', () => {
    const m = armarMazo(validarPeticion({ netlist, analisis: { tipo: 'op' }, parametro: { elemento: 1, valores: [100, 2000] } }))
    expect(m.texto).toContain('set appendwrite\n')
    expect(m.texto).toMatch(/foreach par 100 2000\nalter r1 = \$par\nop\nwrite salida\.raw\nend\n/)
  })
  it('pide corrientes de elementos', () => {
    const m = armarMazo(validarPeticion({ netlist, analisis: { tipo: 'op' }, corrientes: [1] }))
    expect(m.texto).toContain('save all @r1[i]')
    expect(m.texto).toContain('let corr1 = @r1[i]')
  })
  it('rechaza lo que pasa de los topes o no es valido', () => {
    expect(() => validarPeticion({ netlist, analisis: { tipo: 'tran', paso: 1e-9, fin: 1 } })).toThrow(/tope/)
    expect(() => validarPeticion({ netlist, analisis: { tipo: 'op' }, parametro: { elemento: 1, valores: Array(201).fill(1) } })).toThrow(/tope/)
    expect(() => armarMazo(validarPeticion({ netlist, analisis: { tipo: 'op' }, parametro: { elemento: 1, valores: [-1] } }))).toThrow(/mayor que cero/)
    expect(() => armarMazo(validarPeticion({ netlist, analisis: { tipo: 'op' }, parametro: { elemento: 9, valores: [1] } }))).toThrow(/no está/)
  })
})

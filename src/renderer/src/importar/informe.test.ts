import { describe, expect, it } from 'vitest'
import { describirAnalisis, recortarAvisos, validarInforme, resumenDeInforme, type Informe } from './informe'

const base = (): Informe => ({
  origen: { formato: 'proteus', version: '8.13', nombre: 'fuente' },
  total: 28,
  convertidas: 27,
  aproximadas: [
    { id: 'a', ref: 'Q1', tipo: 'BC547', pieza: 'npn', modelo: '2N3904' },
    { id: 'b', ref: 'Q2', tipo: 'BC557', pieza: 'pnp' },
  ],
  sinEquivalencia: [{ id: 'c', ref: 'U2', tipo: 'XYZ' }],
  redesConEtiqueta: [
    { nombre: 'A', ids: ['a'] },
    { nombre: 'B', ids: [] },
    { nombre: 'C', ids: ['c'] },
  ],
  analisis: [],
  omitidas: [],
  avisos: [],
})

describe('validarInforme', () => {
  it('acepta un informe válido y devuelve una copia', () => {
    const i = base()
    const r = validarInforme(JSON.parse(JSON.stringify(i)))
    expect(r).toEqual(i)
    expect(r).not.toBe(i)
  })
  it('rechaza lo que no tiene la forma', () => {
    expect(validarInforme(null)).toBeNull()
    expect(validarInforme([])).toBeNull()
    expect(validarInforme({ ...base(), total: '28' })).toBeNull()
    expect(validarInforme({ ...base(), total: -1 })).toBeNull()
    expect(validarInforme({ ...base(), origen: { formato: 'orcad', nombre: 'x' } })).toBeNull()
    expect(validarInforme({ ...base(), aproximadas: [{ id: 1 }] })).toBeNull()
    expect(validarInforme({ ...base(), avisos: [3] })).toBeNull()
  })
  it('rechaza listas más largas que el tope y recorta textos largos', () => {
    expect(validarInforme({ ...base(), omitidas: new Array(5000).fill('x') })).toBeNull()
    const r = validarInforme({ ...base(), avisos: ['x'.repeat(5000)] })
    expect(r?.avisos[0].length).toBe(300)
  })
})

describe('resumenDeInforme', () => {
  it('resume omitiendo lo que está en cero', () => {
    expect(resumenDeInforme(base())).toBe('Importado de Proteus 8.13: 27 de 28 piezas, 2 aproximadas, 1 sin equivalencia, 3 redes con etiqueta.')
    const limpio: Informe = { ...base(), origen: { formato: 'kicad', nombre: 'x' }, total: 4, convertidas: 4, aproximadas: [], sinEquivalencia: [], redesConEtiqueta: [] }
    expect(resumenDeInforme(limpio)).toBe('Importado de KiCad: 4 de 4 piezas.')
  })
})

describe('describirAnalisis', () => {
  it('escribe cada análisis con prefijos SI y sin repetir la unidad', () => {
    expect(describirAnalisis({ tipo: 'tran', fin: 0.001 })).toBe('Transitorio de 0 a 1 ms')
    expect(describirAnalisis({ tipo: 'tran', fin: 0.01, inicio: 0.002 })).toBe('Transitorio de 2 a 10 ms')
    expect(describirAnalisis({ tipo: 'ac', barrido: 'dec', puntos: 20, desde: 10, hasta: 1e6, fuente: 'V1', magnitud: 1 })).toBe('CA de 10 Hz a 1 MHz')
    expect(describirAnalisis({ tipo: 'dc', fuente: 'V1', desde: 0, hasta: 5, paso: 0.1 })).toBe('Barrido de CD de V1, 0 a 5 V')
    expect(describirAnalisis({ tipo: 'op' })).toBe('Punto de operación')
  })

  it('el original de una entrada es opcional al leer y se conserva si viene', () => {
    const i = base()
    expect(validarInforme({ ...i, sinEquivalencia: [{ id: 'c', ref: 'U2', tipo: 'XYZ', original: 'LM13700' }] })?.sinEquivalencia[0].original).toBe('LM13700')
    expect(validarInforme({ ...i, sinEquivalencia: [{ id: 'c', ref: 'U2', tipo: 'XYZ' }] })?.sinEquivalencia[0]).toEqual({ id: 'c', ref: 'U2', tipo: 'XYZ' })
    expect(validarInforme({ ...i, sinEquivalencia: [{ id: 'c', ref: 'U2', tipo: 'XYZ', original: 5 }] })).toBeNull()
  })
})

describe('recortarAvisos', () => {
  it('deja la lista como está si cabe', () => {
    expect(recortarAvisos(['a', 'b'])).toEqual(['a', 'b'])
  })
  it('al recortar dice cuántos avisos quedaron fuera', () => {
    const r = recortarAvisos(Array.from({ length: 250 }, (_, i) => `aviso ${i}`))
    expect(r).toHaveLength(200)
    expect(r[199]).toBe('y 51 avisos más.')
  })
})

// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { libreriaDePrueba } from '../prueba/libreria'
import { columnasDeModelos } from './columnasModelo'

const lib = libreriaDePrueba().piezas

describe('columnasDeModelos', () => {
  it('NPN: Bf y corriente máxima de cada modelo, de la hoja de datos de su pieza.json', () => {
    const t = columnasDeModelos(lib.get('npn')!)!
    expect(t.columnas).toEqual(['Bf', 'Ic máx'])
    expect(t.filas.map((f) => f.modelo)).toEqual(['2N2222', '2N3904', 'BC547', 'TIP31', 'TIP120', 'BD139', 'BC337', '2N5551', '2N3055'])
    expect(t.filas[0].celdas).toEqual(['214', '600 mA'])
    expect(t.filas[1].celdas).toEqual(['500', '200 mA'])
  })
  it('MOSFET: Vto e Id máx', () => {
    const t = columnasDeModelos(lib.get('mosfet-n')!)!
    expect(t.columnas).toEqual(['Vto', 'Id máx'])
    expect(t.filas[1].celdas).toEqual(['3 V', '49 A'])
  })
  it('amp. op.: GBW y velocidad de cambio', () => {
    const t = columnasDeModelos(lib.get('amp-op')!)!
    expect(t.columnas).toEqual(['GBW', 'SR'])
    expect(t.filas[0].celdas).toEqual(['1 MHz', '0.5 V/µs'])
    expect(t.filas[1].celdas).toEqual(['3 MHz', '13 V/µs'])
  })
  it('el 555 y lo que no tiene columnas conocidas: sin tabla', () => {
    expect(columnasDeModelos(lib.get('temporizador-555')!)).toBeNull()
    expect(columnasDeModelos(lib.get('resistencia')!)).toBeNull()
  })
})

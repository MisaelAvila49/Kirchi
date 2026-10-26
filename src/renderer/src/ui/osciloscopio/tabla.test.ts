import { describe, expect, it } from 'vitest'
import type { AjustesOsciloscopio } from '../../instrumentos/ajustes'
import { CANALES_PANTALLA, CIFRAS_COLUMNA, MUESTRAS_CSV, type PantallaSab } from '../../sim/protocoloInstrumentos'
import { FILAS_TABLA, tablaDePantalla } from './tabla'

describe('Ver como tabla', () => {
  it('21 filas a intervalos iguales con el tiempo y cada canal encendido', () => {
    const muestras = new Float32Array(CANALES_PANTALLA * MUESTRAS_CSV)
    for (let i = 0; i < MUESTRAS_CSV; i++) {
      muestras[i] = i / 1000
      muestras[2 * MUESTRAS_CSV + i] = Number.NaN
    }
    const p = { t0: 0.01, csv: { t0: 0.01, dt: 5e-6, n: MUESTRAS_CSV }, muestras } as unknown as PantallaSab
    const a = {
      canales: (['A', 'B', 'C', 'D'] as const).map((canal) => ({ canal, on: canal !== 'D', vdiv: 1, pos: 0, acople: 'DC' as const })),
      matematico: false
    } as unknown as AjustesOsciloscopio
    const t = tablaDePantalla(p, a)
    expect(FILAS_TABLA).toBe(21)
    expect(t.columnas).toEqual(['Tiempo', 'A', 'B', 'C'])
    expect(t.filas).toHaveLength(21)
    expect(t.filas[0]).toEqual(['10.00 ms', '0.000 V', '0.000 V', 'sin dato'])
    expect(t.filas[20]).toEqual(['20.00 ms', '2.000 V', '0.000 V', 'sin dato'])
    expect(t.filas[10][1]).toBe('1.000 V')
  })

  it('sin muestras en la pantalla, de sus columnas', () => {
    const ncol = 10
    const columnas = new Float32Array(CANALES_PANTALLA * ncol * CIFRAS_COLUMNA)
    for (let j = 0; j < ncol; j++) columnas.set([j, j + 1, j, j + 1, 0], j * CIFRAS_COLUMNA)
    const p = { t0: 0, dt: 1e-3, ncol, columnas, csv: { t0: 0, dt: 0, n: 0 }, muestras: new Float32Array(0) } as unknown as PantallaSab
    const a = { canales: (['A', 'B', 'C', 'D'] as const).map((canal) => ({ canal, on: canal === 'A', vdiv: 1, pos: 0, acople: 'DC' as const })), matematico: false } as unknown as AjustesOsciloscopio
    const t = tablaDePantalla(p, a)
    expect(t.filas).toHaveLength(21)
    expect(t.filas[0]).toEqual(['0.000 s', '0.000 V'])
    expect(t.filas[10]).toEqual(['5.000 ms', '5.000 V'])
    expect(t.filas[20]).toEqual(['10.00 ms', '10.00 V'])
  })
})

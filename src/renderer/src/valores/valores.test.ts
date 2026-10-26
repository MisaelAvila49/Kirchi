import { describe, expect, it } from 'vitest'
import { formatearMedida, formatearSI, formatearValor, leerEnUnidad, leerValor, SIN_DATO } from './valores'

describe('sin lectura', () => {
  it('se escribe «sin dato», sin raya larga', () => {
    expect(SIN_DATO).toBe('sin dato')
  })
})

describe('leerValor', () => {
  it.each([
    ['4k7', 4700, ''],
    ['4.7k', 4700, ''],
    ['10u', 1e-5, ''],
    ['10µF', 1e-5, 'F'],
    ['10μF', 1e-5, 'F'],
    ['2M2', 2.2e6, ''],
    ['100n', 1e-7, ''],
    ['4R7', 4.7, 'Ω'],
    ['1 kΩ', 1000, 'Ω'],
    ['-5 V', -5, 'V'],
    ['5mA', 0.005, 'A'],
    ['1MHz', 1e6, 'Hz'],
    ['330', 330, ''],
    ['10 ohms', 10, 'Ω'],
    ['1m', 0.001, ''],
    ['.5', 0.5, ''],
    ['1f', 1e-15, ''],
    ['1TΩ', 1e12, 'Ω'],
    ['5 Ω', 5, 'Ω'],
    ['10µF', 1e-5, 'F']
  ])('%s → %d %s', (texto, valor, unidad) => {
    const v = leerValor(texto)
    expect(v).not.toBeNull()
    expect(v!.valor).toBeCloseTo(valor, 15)
    expect(v!.unidad).toBe(unidad)
  })

  it.each(['', 'abc', 'Ω', '4.5k7', 'k7', '5 X', '1..2', '5 constructor', '5 toString'])('rechaza «%s»', (texto) => {
    expect(leerValor(texto)).toBeNull()
  })
})

describe('formatearValor', () => {
  it.each([
    [4700, 'Ω', '4.7 kΩ'],
    [330, 'Ω', '330 Ω'],
    [1e-5, 'F', '10 µF'],
    [0.0211, 'A', '21.1 mA'],
    [0, 'V', '0 V'],
    [999.95, 'Ω', '1 kΩ'],
    [6.96, 'V', '6.96 V'],
    [2.2e6, 'Ω', '2.2 MΩ'],
    [-0.005, 'A', '-5 mA'],
    [1e-15, 'F', '1 fF'],
    [3.2e-20, 'A', '0 A'],
    [1e12, 'Ω', '1 TΩ'],
    [4700, '', '4.7 k'],
    [12, '', '12']
  ])('%d %s → %s', (valor, unidad, texto) => {
    expect(formatearValor(valor, unidad)).toBe(texto)
  })

  it('leer lo formateado devuelve el mismo valor', () => {
    for (const v of [4700, 1e-7, 2.2e6, 0.0211, 330]) {
      expect(leerValor(formatearValor(v, 'Ω'))!.valor).toBeCloseTo(v, 12)
    }
  })
})

describe('formatearMedida', () => {
  it.each([
    [2.5, 'V', '2.50 V'],
    [5, 'V', '5.00 V'],
    [-2.5e-3, 'A', '−2.50 mA'],
    [-12, 'V', '−12.0 V'],
    [-999.6, 'V', '−1.00 kV'],
    [-1e-20, 'A', '0.00 A'],
    [0.0125, 'W', '12.5 mW'],
    [999.6, 'V', '1.00 kV'],
    [1e-4, 'W', '100 µW'],
    [1e-20, 'A', '0.00 A'],
    [Number.NaN, 'V', SIN_DATO],
    [1e12, 'V', '1.00 TV'],
    [999.4e12, 'V', '999 TV'],
    [999.6e12, 'V', '1.00×10¹⁵ V'],
    [1e15, 'A', '1.00×10¹⁵ A'],
    [2.5e18, 'W', '2.50×10¹⁸ W'],
    [-4.7e21, 'V', '−4.70×10²¹ V'],
    [9.996e20, 'V', '1.00×10²¹ V'],
    [Number.POSITIVE_INFINITY, 'V', SIN_DATO]
  ])('%s %s → %s', (v, u, t) => {
    expect(formatearMedida(v, u)).toBe(t)
  })

  it('el signo negativo es el menos tipográfico (U+2212), no el guion', () => {
    expect(formatearMedida(-5, 'V')).toBe('−5.00 V')
    expect(formatearMedida(-5, 'V')).not.toContain('-')
    expect(formatearMedida(5, 'V')).not.toContain('−')
  })
})

describe('formatearMedida con cuatro cifras (el multímetro)', () => {
  it('escribe cuatro significativas con su prefijo y conserva los ceros', () => {
    expect(formatearMedida(2.380952, 'V', 4)).toBe('2.381 V')
    expect(formatearMedida(0.4950495, 'A', 4)).toBe('495.0 mA')
    expect(formatearMedida(4700.2, 'Ω', 4)).toBe('4.700 kΩ')
    expect(formatearMedida(0, 'V', 4)).toBe('0.000 V')
    expect(formatearMedida(2.5, 'V')).toBe('2.50 V')
  })
})

describe('formatearSI: números de ejes y de rangos con prefijo SI común', () => {
  it.each([
    [1e6, 'Hz', '1 MHz'],
    [1000, 'Hz', '1 kHz'],
    [10, 'Hz', '10 Hz'],
    [2.5e-3, 's', '2.5 ms'],
    [0.0025, 's', '2.5 ms'],
    [1.2346e-6, 's', '1.235 µs'],
    [0, 's', '0 s'],
    [-0.5, 'V', '−500 mV'],
    [5, 'V', '5 V'],
    [0.0211, 'A', '21.1 mA'],
    [2e-9, 'A', '2 nA'],
    [-0.0005, 'V', '−500 µV'],
    [-3.01, 'dB', '−3.01 dB'],
    [0, 'dB', '0 dB'],
    [-45, '°', '−45°'],
    [90, '°', '90°'],
    [12.5, '%', '12.5 %']
  ])('%d %s → %s', (valor, unidad, texto) => {
    expect(formatearSI(valor, unidad)).toBe(texto)
  })

  it('nunca escribe una potencia de diez ni ceros de relleno en lo que cabe con prefijo', () => {
    for (const v of [1e6, 1e3, 2.5e-3, 1e-9, 47e3]) expect(formatearSI(v, 'Hz')).not.toMatch(/e[+-]?\d|0{4,}/)
    expect(formatearSI(1000000, 'Hz')).not.toContain('1000000')
  })

  it('sin lectura (NaN o infinito) dice «sin dato»', () => {
    expect(formatearSI(Number.NaN, 'Hz')).toBe(SIN_DATO)
    expect(formatearSI(Number.POSITIVE_INFINITY, 's')).toBe(SIN_DATO)
  })
})

describe('leerEnUnidad: lo que el lector escribe en un campo de rango', () => {
  it.each([
    ['2.5 ms', 's', 0.0025],
    ['2,5ms', 's', 0.0025],
    ['1 MHz', 'Hz', 1e6],
    ['1M', 'Hz', 1e6],
    ['1000000', 'Hz', 1e6],
    ['10 Hz', 'Hz', 10],
    ['500u', 's', 5e-4],
    ['500 µs', 's', 5e-4],
    ['−5 mV', 'V', -0.005],
    ['-3.01 dB', 'dB', -3.01],
    ['45°', '°', 45],
    ['45', '°', 45]
  ])('«%s» en %s → %d', (texto, unidad, valor) => {
    expect(leerEnUnidad(texto, unidad)).toBeCloseTo(valor, 12)
  })

  it('rechaza lo que no es un número o trae otra unidad', () => {
    expect(leerEnUnidad('', 's')).toBeNull()
    expect(leerEnUnidad('abc', 's')).toBeNull()
    expect(leerEnUnidad('5 V', 's')).toBeNull()
    expect(leerEnUnidad('5 ms', 'Hz')).toBeNull()
    expect(leerEnUnidad('1 kdB', 'dB')).toBeNull()
  })

  it('lo formateado se lee de vuelta', () => {
    for (const [v, u] of [[1e6, 'Hz'], [2.5e-3, 's'], [-0.0005, 'V'], [-3.01, 'dB'], [-45, '°']] as const) expect(leerEnUnidad(formatearSI(v, u), u)).toBeCloseTo(v, 9)
  })
})

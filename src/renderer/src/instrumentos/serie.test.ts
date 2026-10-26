import { describe, expect, it } from 'vitest'
import { cercanoSerie, enPalabras, esDeSerie, pasoSerie, valoresSerie, baseDeCapturaAmplia } from './serie'

describe('serie 1, 2 y 5', () => {
  it('reconoce los valores de la serie y redondea al más cercano', () => {
    for (const v of [1e-3, 2e-3, 5e-3, 0.1, 1, 2, 5, 50]) expect(esDeSerie(v), String(v)).toBe(true)
    for (const v of [3, 0.3, 7e-3]) expect(esDeSerie(v), String(v)).toBe(false)
    expect(cercanoSerie(3)).toBe(2)
    expect(cercanoSerie(4)).toBe(5)
    expect(cercanoSerie(0.0007)).toBe(0.0005)
  })

  it('da el siguiente y el anterior, acotados', () => {
    expect(pasoSerie(1, 1, 1e-3, 50)).toBe(2)
    expect(pasoSerie(2, 1, 1e-3, 50)).toBe(5)
    expect(pasoSerie(5, 1, 1e-3, 50)).toBe(10)
    expect(pasoSerie(1, -1, 1e-3, 50)).toBe(0.5)
    expect(pasoSerie(50, 1, 1e-3, 50)).toBe(50)
    expect(pasoSerie(1e-3, -1, 1e-3, 50)).toBe(1e-3)
  })

  it('enumera la serie de 1 µs a 10 s: 22 valores', () => {
    const v = valoresSerie(1e-6, 10)
    expect(v).toHaveLength(22)
    expect(v[0]).toBe(1e-6)
    expect(v.at(-1)).toBe(10)
  })

  it('dice el valor en palabras', () => {
    expect(enPalabras(2, 'V')).toBe('2 voltios por división')
    expect(enPalabras(1, 'V')).toBe('1 voltio por división')
    expect(enPalabras(0.005, 'V')).toBe('5 milivoltios por división')
    expect(enPalabras(1e-6, 's')).toBe('1 microsegundo por división')
    expect(enPalabras(0.5, 's')).toBe('500 milisegundos por división')
    expect(enPalabras(10, 's')).toBe('10 segundos por división')
  })
})

describe('base de tiempo de una captura entera', () => {
  it.each([
    [2.469, 0.25],
    [0.01, 0.001],
    [0.003, 0.0003],
    [4.3, 0.5],
    [0.81, 0.1],
    [0.15, 0.015],
    [10, 1]
  ])('%d s → %d s por división', (span, base) => {
    expect(baseDeCapturaAmplia(span)).toBeCloseTo(base, 12)
  })
  it('las diez divisiones siempre cubren la captura y sobra a lo más un cuarto', () => {
    for (const span of [0.00123, 0.0456, 0.31, 1.7, 2.469, 5.5, 9.99, 37]) {
      const base = baseDeCapturaAmplia(span)
      expect(base * 10).toBeGreaterThanOrEqual(span * (1 - 1e-9))
      expect(base * 10).toBeLessThanOrEqual(span * 1.26)
    }
  })
})

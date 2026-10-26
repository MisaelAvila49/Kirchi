import { describe, expect, it } from 'vitest'
import { dominioEnDivisiones, pasoPorDivision, ticksDeDivisiones } from './divisiones'

describe('dominio en divisiones (estilo Instrumento)', () => {
  it('reparte el rango en el número de divisiones con un paso 1, 2 o 5', () => {
    // Ganancia de un filtro: de -60 a 1 dB en ocho divisiones: 10 dB por división.
    expect(pasoPorDivision(-60, 1, 8, '')).toBe(10)
    expect(dominioEnDivisiones({ min: -60, max: 1 }, 8, '')).toEqual({ min: -60, max: 20 })
    // Un rango que ya cabe justo no sube de paso.
    expect(dominioEnDivisiones({ min: 0, max: 8 }, 8, '')).toEqual({ min: 0, max: 8 })
    expect(dominioEnDivisiones({ min: 0, max: 5 }, 10, 's')).toEqual({ min: 0, max: 5 })
  })

  it('el dominio siempre contiene los datos y mide exactamente n pasos', () => {
    for (const [lo, hi] of [[-3.2, 4.7], [0, 0.0031], [-90, 0], [12, 12.4], [-1e6, 3e6], [0.9, 5]] as const) {
      const d = dominioEnDivisiones({ min: lo, max: hi }, 8, '')
      const paso = pasoPorDivision(lo, hi, 8, '')
      expect(d.min, `${lo}..${hi}`).toBeLessThanOrEqual(lo + 1e-12)
      expect(d.max, `${lo}..${hi}`).toBeGreaterThanOrEqual(hi - 1e-12)
      expect((d.max - d.min) / paso).toBeCloseTo(8, 9)
      // El borde de abajo es un múltiplo del paso: las rayitas caen en cifras redondas.
      expect(Math.abs(d.min / paso - Math.round(d.min / paso))).toBeLessThan(1e-9)
    }
  })

  it('la fase usa pasos de grados que se leen bien (5, 10, 15, 30, 45, 90)', () => {
    expect(pasoPorDivision(-95, 3, 8, '°')).toBe(15)
    expect(pasoPorDivision(-180, 180, 8, '°')).toBe(45)
    expect(dominioEnDivisiones({ min: -92, max: 2 }, 8, '°')).toEqual({ min: -105, max: 15 })
  })

  it('las marcas son n + 1, de borde a borde', () => {
    expect(ticksDeDivisiones({ min: -60, max: 20 }, 8)).toEqual([-60, -50, -40, -30, -20, -10, 0, 10, 20])
    expect(ticksDeDivisiones({ min: 0, max: 5 }, 10)).toHaveLength(11)
  })

  it('un rango sin ancho o con valores raros no revienta', () => {
    expect(dominioEnDivisiones({ min: 3, max: 3 }, 8, '').max).toBeGreaterThan(3)
    expect(Number.isFinite(dominioEnDivisiones({ min: 0, max: Number.POSITIVE_INFINITY }, 8, '').max)).toBe(true)
  })
})

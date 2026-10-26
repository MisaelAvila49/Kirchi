import { describe, expect, it } from 'vitest'
import { esComercial, MANTISAS, masCercano, textoDeIngenieria, vecinosEnSerie } from './series'

describe('series de valores comerciales', () => {
  it('tienen 6, 12, 24 y 96 valores por década y empiezan en 1', () => {
    expect(MANTISAS.E6).toHaveLength(6)
    expect(MANTISAS.E12).toHaveLength(12)
    expect(MANTISAS.E24).toHaveLength(24)
    expect(MANTISAS.E96).toHaveLength(96)
    for (const s of Object.values(MANTISAS)) expect(s[0]).toBe(1)
  })
  it('E6 y E12 están dentro de E24', () => {
    for (const m of [...MANTISAS.E6, ...MANTISAS.E12]) expect(MANTISAS.E24).toContain(m)
  })
  it('cada serie crece sin repetir', () => {
    for (const s of Object.values(MANTISAS)) for (let i = 1; i < s.length; i++) expect(s[i]).toBeGreaterThan(s[i - 1])
  })
})

describe('masCercano', () => {
  it('4.8 k en E24 es 4.7 k y en E12 también', () => {
    expect(masCercano(4800, 'E24')).toBe(4700)
    expect(masCercano(4800, 'E12')).toBe(4700)
  })
  it('redondea por década, también hacia la década siguiente', () => {
    expect(masCercano(9700, 'E12')).toBe(10000)
    expect(masCercano(0.97, 'E12')).toBe(1)
    expect(masCercano(9.6e-9, 'E24')).toBeCloseTo(1e-8, 20)
  })
  it('un valor de la serie vuelve igual', () => {
    expect(masCercano(2.2e-6, 'E6')).toBeCloseTo(2.2e-6, 18)
    expect(masCercano(330, 'E12')).toBe(330)
  })
  it('E96 da tres cifras', () => {
    expect(masCercano(4990, 'E96')).toBe(4990)
  })
  it('un valor no positivo no tiene cercano', () => {
    expect(masCercano(0, 'E12')).toBeNull()
    expect(masCercano(-5, 'E12')).toBeNull()
  })
})

describe('esComercial', () => {
  it('4.7 k sí y 4.8 k no en E24', () => {
    expect(esComercial(4700, 'E24')).toBe(true)
    expect(esComercial(4800, 'E24')).toBe(false)
  })
  it('5.1 k es E24 pero no E12', () => {
    expect(esComercial(5100, 'E24')).toBe(true)
    expect(esComercial(5100, 'E12')).toBe(false)
  })
  it('100 nF es E6, con el ruido de coma flotante de 1e-7', () => {
    expect(esComercial(100e-9, 'E6')).toBe(true)
    expect(esComercial(4.7e-6, 'E6')).toBe(true)
  })
})

describe('vecinosEnSerie', () => {
  it('de 4.8 k en E24: 4.3, 4.7 y 5.1 k', () => {
    expect(vecinosEnSerie(4800, 'E24')).toEqual([4300, 4700, 5100])
  })
  it('cruza décadas', () => {
    expect(vecinosEnSerie(1000, 'E12')).toEqual([820, 1000, 1200])
    expect(vecinosEnSerie(9100, 'E24')).toEqual([8200, 9100, 10000])
  })
})

describe('textoDeIngenieria', () => {
  it.each([
    [4700, '4.7k'],
    [100e-9, '100n'],
    [2.2e-6, '2.2u'],
    [330, '330'],
    [1e6, '1M'],
    [4.7, '4.7']
  ])('%d → %s', (v, t) => expect(textoDeIngenieria(v)).toBe(t))
})

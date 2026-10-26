import { describe, expect, it } from 'vitest'
import { numeroDeCampo, rangoDeTextos } from './rangoCampos'

describe('campos Desde y Hasta de un eje', () => {
  it('leen número con prefijo en las unidades base del eje', () => {
    expect(numeroDeCampo('-10m', 'V')).toBeCloseTo(-0.01, 12)
    expect(numeroDeCampo('1.8156', 's')).toBeCloseTo(1.8156, 12)
    expect(numeroDeCampo('', 'V')).toBeNull()
    expect(numeroDeCampo('abc', 'V')).toBeNull()
  })
  it('forman un rango solo si los dos se leen y el desde es menor que el hasta', () => {
    const r = rangoDeTextos('-150m', '150m', 'V')!
    expect(r.min).toBeCloseTo(-0.15, 12)
    expect(r.max).toBeCloseTo(0.15, 12)
    expect(rangoDeTextos('', '150m', 'V')).toBeNull()
    expect(rangoDeTextos('2', '1', 'V')).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import { LOTE_MAX, PresupuestoDeLote } from './lote'

describe('PresupuestoDeLote', () => {
  it('sin medida previa avanza de a un paso', () => {
    expect(new PresupuestoDeLote().tamano(8)).toBe(1)
  })

  it('el lote es lo que cabe en el tiempo que queda, entre 1 y LOTE_MAX', () => {
    const p = new PresupuestoDeLote()
    p.medir(3.3, 1)
    expect(p.tamano(8)).toBe(2)
    expect(p.tamano(1)).toBe(1)
    const barato = new PresupuestoDeLote()
    barato.medir(0.01, 1)
    expect(barato.tamano(8)).toBe(LOTE_MAX)
  })

  it('una medida de cero milisegundos (reloj grueso) no deja el lote en un paso', () => {
    const p = new PresupuestoDeLote()
    p.medir(0, 40)
    expect(p.tamano(8)).toBe(LOTE_MAX)
  })

  it('sube de golpe si los pasos se encarecen y baja despacio si abaratan', () => {
    const p = new PresupuestoDeLote()
    p.medir(1, 10)
    p.medir(20, 10)
    expect(p.msPorPaso).toBe(2)
    p.medir(10, 10)
    expect(p.msPorPaso).toBeCloseTo(1.7, 9)
  })

  it('ignora una medición sin pasos', () => {
    const p = new PresupuestoDeLote()
    p.medir(5, 0)
    expect(p.tamano(8)).toBe(1)
  })
})

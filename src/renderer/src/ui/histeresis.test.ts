import { describe, expect, it } from 'vitest'
import { Histeresis, HISTERESIS_CIFRA, ultimaCifra } from './histeresis'

describe('histéresis de la última cifra', () => {
  it('la última cifra con tres significativas', () => {
    expect(ultimaCifra(2.5, 3)).toBeCloseTo(0.01, 15)
    expect(ultimaCifra(12.3e-3, 3)).toBeCloseTo(1e-4, 18)
    expect(ultimaCifra(-470, 3)).toBe(1)
    expect(ultimaCifra(0, 3)).toBe(0)
    expect(HISTERESIS_CIFRA).toBe(0.6)
  })

  it('una cifra nueva reemplaza a la vista solo si difiere en más de 0.6 de su última cifra', () => {
    const h = new Histeresis(3)
    expect(h.valor('v', 2.5004)).toBe(2.5004)
    expect(h.valor('v', 2.5011)).toBe(2.5004)
    expect(h.valor('v', 2.4950)).toBe(2.5004)
    expect(h.valor('v', 2.512)).toBe(2.512)
    // Con cuatro cifras (el multímetro) la tolerancia es diez veces menor.
    const m = new Histeresis(4)
    expect(m.valor('v', 2.5004)).toBe(2.5004)
    expect(m.valor('v', 2.5011)).toBe(2.5011)
  })

  it('cada clave lleva su cifra, un valor que no es número no la mueve y reiniciar olvida', () => {
    const h = new Histeresis(3)
    h.valor('a', 1)
    expect(h.valor('b', 1.004)).toBe(1.004)
    expect(h.valor('a', Number.NaN)).toBeNaN()
    expect(h.valor('a', 1.003)).toBe(1)
    h.reiniciar()
    expect(h.valor('a', 1.003)).toBe(1.003)
  })
})

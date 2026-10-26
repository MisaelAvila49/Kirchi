import { describe, expect, it } from 'vitest'
import { pasoPerilla, textoPerilla } from './perilla'

describe('campo de perilla (cursor de dígito)', () => {
  it('cuatro cifras significativas con prefijo SI', () => {
    expect(textoPerilla(1000)).toBe('1.000k')
    expect(textoPerilla(0.05)).toBe('50.00m')
    expect(textoPerilla(0)).toBe('0.000')
    expect(textoPerilla(-1.5)).toBe('-1.500')
    expect(textoPerilla(999.96)).toBe('1.000k')
    expect(textoPerilla(2e-6)).toBe('2.000u')
  })

  it('la flecha mueve la cifra a la izquierda del cursor y el cursor sigue en la misma cifra', () => {
    expect(pasoPerilla('1.000k', 1, 1, 0, 1e6)).toEqual({ texto: '2.000k', caret: 1, valor: 2000 })
    expect(pasoPerilla('1.000k', 3, 1, 0, 1e6)).toEqual({ texto: '1.100k', caret: 3, valor: 1100 })
    expect(pasoPerilla('9.500k', 1, 1, 0, 1e6)).toEqual({ texto: '10.50k', caret: 2, valor: 10500 })
    expect(pasoPerilla('2.000', 5, -1, 0, 20)).toEqual({ texto: '1.999', caret: 5, valor: 1.999 })
  })

  it('al tope no cambia; un texto que no es número tampoco', () => {
    expect(pasoPerilla('20.00', 2, 1, 0, 20)).toBeNull()
    expect(pasoPerilla('hola', 2, 1, 0, 20)).toBeNull()
  })
})

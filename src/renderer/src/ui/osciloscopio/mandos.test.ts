import { describe, expect, it } from 'vitest'
import { encenderOtros, leerEscrito, siguienteAcople, textoAcople, textoFuente, textoPosicion } from './mandos'

describe('mandos del osciloscopio', () => {
  it('el acoplamiento rota DC, AC y GND y el botón dice a cuál cambia', () => {
    expect(siguienteAcople('DC')).toBe('AC')
    expect(siguienteAcople('AC')).toBe('GND')
    expect(siguienteAcople('GND')).toBe('DC')
    expect(textoAcople('A', 'DC')).toBe('Acoplamiento del canal A: DC. Cambia a AC')
  })

  it('la línea de los canales apagados', () => {
    expect(encenderOtros(['C', 'D'])).toBe('Encender C o D')
    expect(encenderOtros(['B', 'C', 'D'])).toBe('Encender B, C o D')
    expect(encenderOtros(['D'])).toBe('Encender D')
  })

  it('la posición con su signo y de dónde mide la entrada', () => {
    expect(textoPosicion(-3)).toBe('−3.0 div')
    expect(textoPosicion(1)).toBe('+1.0 div')
    expect(textoPosicion(0)).toBe('0.0 div')
    expect(textoFuente('R1:2')).toBe('← R1:2')
    expect(textoFuente(null)).toBe('sin conectar')
  })
})

describe('el nivel escrito a mano', () => {
  it('lee número con unidad y prefijo, y lo acota igual que los botones', () => {
    expect(leerEscrito('1.5 V', 'V', -1e3, 1e3)).toBe(1.5)
    expect(leerEscrito('200m', 'V', -1e3, 1e3)).toBe(0.2)
    expect(leerEscrito('-2', 'V', -1e3, 1e3)).toBe(-2)
    expect(leerEscrito('5 kV', 'V', -1e3, 1e3)).toBe(1000)
    expect(leerEscrito('-9k', 'V', -1e3, 1e3)).toBe(-1000)
  })
  it('lo que no es un voltaje no se acepta', () => {
    expect(leerEscrito('abc', 'V', -1e3, 1e3)).toBeNull()
    expect(leerEscrito('3 A', 'V', -1e3, 1e3)).toBeNull()
    expect(leerEscrito('', 'V', -1e3, 1e3)).toBeNull()
  })
})

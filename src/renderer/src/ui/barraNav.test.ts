import { describe, expect, it } from 'vitest'
import { siguienteControl } from './barraNav'

describe('navegación con flechas en la barra de formato', () => {
  it('Flecha derecha e izquierda avanzan y retroceden sin dar la vuelta', () => {
    expect(siguienteControl(5, 0, 'ArrowRight')).toBe(1)
    expect(siguienteControl(5, 4, 'ArrowRight')).toBe(4)
    expect(siguienteControl(5, 2, 'ArrowLeft')).toBe(1)
    expect(siguienteControl(5, 0, 'ArrowLeft')).toBe(0)
  })

  it('Inicio y Fin van al primero y al último; otras teclas no mueven', () => {
    expect(siguienteControl(5, 3, 'Home')).toBe(0)
    expect(siguienteControl(5, 1, 'End')).toBe(4)
    expect(siguienteControl(5, 1, 'ArrowDown')).toBeNull()
    expect(siguienteControl(5, 1, 'a')).toBeNull()
    expect(siguienteControl(0, 0, 'Home')).toBeNull()
  })
})

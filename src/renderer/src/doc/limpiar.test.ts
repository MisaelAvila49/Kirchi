import { describe, expect, it } from 'vitest'
import { limpiarTexto } from './limpiar'

describe('limpiarTexto', () => {
  it('quita los controles C0 salvo tabulador, salto y retorno', () => {
    expect(limpiarTexto('a\u0000b\u000Bc\u000Cd\u001Fe\tf\ng\rh')).toBe('abcde\tf\ng\rh')
  })
  it('quita U+FFFE, U+FFFF y los sustitutos sueltos, y conserva los pares', () => {
    expect(limpiarTexto('a\uFFFEb\uFFFFc\uD800d\uDC00e')).toBe('abcde')
    expect(limpiarTexto('x😀y')).toBe('x😀y')
  })
  it('normaliza a NFC', () => {
    expect(limpiarTexto('Ome\u0301ga')).toBe('Oméga')
  })
})

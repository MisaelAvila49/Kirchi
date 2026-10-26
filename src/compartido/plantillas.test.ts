import { describe, expect, it } from 'vitest'
import { LARGO_MAXIMO_NOMBRE, motivoNombreInvalido } from './plantillas'

describe('motivoNombreInvalido', () => {
  it.each(['Filtro RC', 'Amplificador 2N2222', 'ñandú', 'a.b', 'v1.2', 'x'.repeat(LARGO_MAXIMO_NOMBRE)])('acepta «%s»', (n) => {
    expect(motivoNombreInvalido(n)).toBeNull()
  })

  it.each(['..', '.', '../fuera', 'a/b', 'a\\b', 'C:\\x', 'C:x', '/abs', 'a\u0000b', 'a\nb', 'a*b', 'a?b', 'a"b', 'a<b', 'a|b'])('rechaza el recorrido o separador «%j»', (n) => {
    expect(motivoNombreInvalido(n)).not.toBeNull()
  })

  it.each(['CON', 'con', 'PRN', 'AUX', 'NUL', 'COM1', 'com9', 'LPT1', 'lpt9', 'CON.txt', 'nul.kir', 'aux .x'])('rechaza el nombre reservado de Windows «%s»', (n) => {
    expect(motivoNombreInvalido(n)).toMatch(/reservado/)
  })

  it('no confunde un nombre que solo empieza igual que uno reservado', () => {
    expect(motivoNombreInvalido('console')).toBeNull()
    expect(motivoNombreInvalido('COM10')).toBeNull()
  })

  it('rechaza vacío, espacios en los bordes, punto final y largo excesivo', () => {
    expect(motivoNombreInvalido('')).not.toBeNull()
    expect(motivoNombreInvalido('   ')).not.toBeNull()
    expect(motivoNombreInvalido(' a')).not.toBeNull()
    expect(motivoNombreInvalido('a ')).not.toBeNull()
    expect(motivoNombreInvalido('a.')).not.toBeNull()
    expect(motivoNombreInvalido('x'.repeat(LARGO_MAXIMO_NOMBRE + 1))).toMatch(/largo/)
  })

  it('rechaza lo que no es texto', () => {
    for (const n of [null, undefined, 3, {}, ['a']]) expect(motivoNombreInvalido(n)).not.toBeNull()
  })

  it('una categoría no puede llamarse como la de las incluidas', () => {
    expect(motivoNombreInvalido('Incluidas', 'categoría')).not.toBeNull()
    expect(motivoNombreInvalido('incluidas', 'categoría')).not.toBeNull()
    expect(motivoNombreInvalido('Incluidas', 'nombre')).toBeNull()
  })
})

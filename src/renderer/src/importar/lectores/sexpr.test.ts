import { describe, expect, it } from 'vitest'
import { ErrorSexpr, hijo, hijos, leerSexpr, numeros, texto, TOPE_PROFUNDIDAD, TOPE_TAMANO } from './sexpr'

describe('lector de S-expressions', () => {
  it('lee listas anidadas, átomos y números', () => {
    const [raiz] = leerSexpr('(a (b 1 -2.5) (c) d)')
    expect(raiz).toEqual(['a', ['b', '1', '-2.5'], ['c'], 'd'])
  })

  it('lee cadenas con espacios, paréntesis y escapes de comilla y diagonal inversa', () => {
    const [raiz] = leerSexpr('(property "Value" "a (b) \\"c\\" d\\\\e")')
    expect(raiz).toEqual(['property', 'Value', 'a (b) "c" d\\e'])
  })

  it('lee varias expresiones de nivel superior y tolera un cierre de más', () => {
    expect(leerSexpr('(a) (b))')).toEqual([['a'], ['b']])
  })

  it('las ayudas buscan hijos por nombre', () => {
    const [raiz] = leerSexpr('(x (at 1 2 3) (name "n") (p 1) (p 2))')
    const l = raiz as string[]
    expect(numeros(l, 'at')).toEqual([1, 2, 3])
    expect(texto(l, 'name')).toBe('n')
    expect(hijos(l, 'p')).toHaveLength(2)
    expect(hijo(l, 'q')).toBeUndefined()
  })

  it('rechaza un paréntesis sin cerrar', () => {
    expect(() => leerSexpr('(a (b)')).toThrow(ErrorSexpr)
  })

  it('rechaza un anidado más profundo que el tope', () => {
    const t = '('.repeat(TOPE_PROFUNDIDAD + 5) + ')'.repeat(TOPE_PROFUNDIDAD + 5)
    expect(() => leerSexpr(t)).toThrow(/anida/)
  })

  it('rechaza un texto mayor que el tope de tamaño', () => {
    expect(() => leerSexpr(' '.repeat(TOPE_TAMANO + 1))).toThrow(/tamaño/)
  })
})

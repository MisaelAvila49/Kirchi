// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { libreriaDePrueba } from '../prueba/libreria'
import { catalogo, CATEGORIAS } from './catalogo'
import { TONOS_CATEGORIA } from './colores'

const lib = libreriaDePrueba().piezas

describe('tono de cada categoría de la Librería', () => {
  it('las ocho categorías de componentes/ salen con su tono, en el orden en que se validaron', () => {
    const cats = catalogo(lib)
    expect(cats.map((c) => c.id)).toEqual(CATEGORIAS.map(([id]) => id))
    expect(cats.map((c) => c.tono)).toEqual([...TONOS_CATEGORIA])
  })

  it('con filtro, cada categoría que queda conserva su tono', () => {
    for (const c of catalogo(lib, 'r 4k7')) expect(c.tono, c.id).toBeDefined()
  })

  it('una categoría que no es de las ocho queda sin tono (se dibuja en gris)', () => {
    const [def] = lib.values()
    const raro = new Map([['raro', { ...def, id: 'raro', categoria: 'misterio' }]])
    expect(catalogo(raro)).toEqual([expect.objectContaining({ id: 'misterio', tono: undefined })])
  })

  it('con un prefijo de modelo («tip»), la pieza sale una sola vez en la Librería', () => {
    const ids = catalogo(lib, 'tip').flatMap((c) => c.piezas.map((p) => p.def.id))
    expect(ids).toEqual(expect.arrayContaining(['npn', 'pnp']))
    expect(new Set(ids).size).toBe(ids.length)
  })
})

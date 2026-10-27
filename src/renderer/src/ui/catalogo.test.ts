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

  describe('grupos plegables', () => {
    const base = [...lib.values()].find((d) => d.categoria === 'digitales')!
    const conGrupos = new Map(
      [
        ['a', 'Aritmética'],
        ['b', 'Compuertas'],
        ['c', 'Compuertas'],
        ['d', 'Zeta nuevo'],
        ['e', undefined]
      ].map(([id, grupo]) => [id as string, { ...base, id: id as string, nombre: { ...base.nombre, es: `Compuerta ${id}` }, categoria: 'digitales', grupo }])
    )

    it('las piezas sin grupo van arriba y los grupos en el orden fijo, con los desconocidos al final', () => {
      const [dig] = catalogo(conGrupos)
      expect(dig.sueltas!.map((e) => e.def.id)).toEqual(['e'])
      expect(dig.grupos!.map((g) => [g.id, g.piezas.map((e) => e.def.id)])).toEqual([
        ['digitales/Compuertas', ['b', 'c']],
        ['digitales/Aritmética', ['a']],
        ['digitales/Zeta nuevo', ['d']]
      ])
      expect(dig.piezas).toHaveLength(5)
    })

    it('una categoría sin ninguna pieza con grupo queda plana', () => {
      const plana = catalogo(new Map([['x', { ...base, id: 'x', grupo: undefined }]]))
      expect(plana[0].grupos).toBeUndefined()
      expect(plana[0].sueltas).toBeUndefined()
    })

    it('con filtro la búsqueda ignora los grupos', () => {
      const [dig] = catalogo(conGrupos, 'compuerta')
      expect(dig.grupos).toBeUndefined()
    })
  })
})

// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { aplicarOk, documento, nuevoNucleo, pieza } from '../../prueba/ayudaEdicion'

describe('propiedad', () => {
  it('cambia el valor con la validación del inspector y un paso de deshacer', () => {
    const n = nuevoNucleo(documento([pieza('a', 'resistencia', 'R1', 0, 0)]))
    aplicarOk(n, { orden: 'propiedad', ref: 'R1', prop: 'valor', valor: '4k7' })
    expect(n.doc.piezas.a.props.valor).toBe('4k7')
    n.deshacer()
    expect(n.doc.piezas.a.props.valor).toBeUndefined()
  })

  it('rechaza un valor inválido, una unidad ajena y una propiedad que no existe', () => {
    const n = nuevoNucleo(documento([pieza('a', 'resistencia', 'R1', 0, 0)]))
    expect(n.aplicar({ orden: 'propiedad', ref: 'R1', prop: 'valor', valor: 'abc' })).toEqual({ ok: false, motivo: '«abc» no es un valor válido.' })
    expect(n.aplicar({ orden: 'propiedad', ref: 'R1', prop: 'valor', valor: '5 V' })).toEqual({ ok: false, motivo: 'Se esperaba un valor en Ω.' })
    expect(n.aplicar({ orden: 'propiedad', ref: 'R1', prop: 'color', valor: 'rojo' })).toEqual({ ok: false, motivo: 'R1 no tiene la propiedad «color».' })
    expect(n.aplicar({ orden: 'propiedad', ref: 'R9', prop: 'valor', valor: '1k' })).toEqual({ ok: false, motivo: 'No hay ninguna pieza con la referencia «R9».' })
    expect(n.historial.puedeDeshacer).toBe(false)
  })

  it('poner el valor que ya tiene no deja paso', () => {
    const n = nuevoNucleo(documento([pieza('a', 'resistencia', 'R1', 0, 0)]))
    expect(n.aplicar({ orden: 'propiedad', ref: 'R1', prop: 'valor', valor: '1k' }).ok).toBe(true)
    expect(n.historial.puedeDeshacer).toBe(false)
  })

  it('la cantidad de entradas de una compuerta cambia la pieza por la de su familia', () => {
    const n = nuevoNucleo(documento([pieza('g', 'and', 'U1', 0, 0)]))
    aplicarOk(n, { orden: 'propiedad', ref: 'U1', prop: 'entradas', valor: '3' })
    expect(n.doc.piezas.g.tipo).toBe('and-3')
    expect(n.aplicar({ orden: 'propiedad', ref: 'U1', prop: 'entradas', valor: '1' })).toMatchObject({ ok: false, motivo: expect.stringMatching(/^Las entradas van de 2 a/) })
  })

  it('una opción fuera de la lista se rechaza con las opciones', () => {
    const n = nuevoNucleo(documento([pieza('l', 'led', 'D1', 0, 0)]))
    const r = n.aplicar({ orden: 'propiedad', ref: 'D1', prop: 'color', valor: 'plateado' })
    expect(r).toMatchObject({ ok: false, motivo: expect.stringMatching(/^Elige una opción: /) })
    aplicarOk(n, { orden: 'propiedad', ref: 'D1', prop: 'color', valor: 'verde' })
    expect(n.doc.piezas.l.props.color).toBe('verde')
  })

  it('la referencia se renombra en un paso y no admite una repetida', () => {
    const n = nuevoNucleo(documento([pieza('a', 'resistencia', 'R1', 0, 0), pieza('b', 'resistencia', 'R2', 20, 0)]))
    aplicarOk(n, { orden: 'propiedad', ref: 'R1', prop: 'ref', valor: 'RL' })
    expect(n.doc.piezas.a.ref).toBe('RL')
    expect(n.aplicar({ orden: 'propiedad', ref: 'R2', prop: 'ref', valor: 'rl' }).ok).toBe(false)
    n.deshacer()
    expect(n.doc.piezas.a.ref).toBe('R1')
  })
})

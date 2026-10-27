// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { cable, documento, lib, nuevoNucleo, pieza, texto } from '../prueba/ayudaEdicion'
import { describir } from './describir'
import { extremosSueltos } from './sueltos'

describe('cables sueltos', () => {
  it('un tramo que no toca patilla, etiqueta ni otro cable se informa en leer_circuito con su red', () => {
    const n = nuevoNucleo(documento([pieza('a', 'resistencia', 'R1', 0, 0)], [cable('w', [4, 0], [12, 0])]))
    expect(extremosSueltos(n.doc, lib)).toEqual([{ cable: 'w', punto: { x: 12, y: 0 } }])
    const d = describir(n.doc, lib, n.con)
    expect(d.cablesSueltos).toHaveLength(1)
    expect(d.cablesSueltos![0]).toMatchObject({ x: 15, y: 0 })
  })

  it('sin cables sueltos leer_circuito no trae el campo', () => {
    const n = nuevoNucleo(documento([pieza('a', 'resistencia', 'R1', 0, 0)]))
    expect('cablesSueltos' in describir(n.doc, lib, n.con)).toBe(false)
  })

  it('borrar la etiqueta que puso nombrar se lleva su tramo y no deja nada colgando', () => {
    const n = nuevoNucleo(documento([pieza('a', 'resistencia', 'R1', 0, 0)]))
    expect(n.aplicar({ orden: 'nombrar', punto: 'R1.2', nombre: 'SALIDA' })).toMatchObject({ ok: true })
    const tramos = Object.keys(n.doc.cables).length
    expect(n.aplicar({ orden: 'borrar', etiquetas: ['SALIDA'] })).toMatchObject({ ok: true })
    expect(Object.keys(n.doc.cables).length).toBe(0)
    expect(extremosSueltos(n.doc, lib)).toEqual([])
    n.deshacer()
    expect(Object.keys(n.doc.cables).length).toBe(tramos)
  })

  it('una conexión que no se puede hacer no deja nada', () => {
    const n = nuevoNucleo(documento([pieza('a', 'resistencia', 'R1', 0, 0), pieza('b', 'resistencia', 'R2', 0, 16)]))
    expect(n.aplicar({ orden: 'nombrar', punto: 'R1.2', nombre: 'A' })).toMatchObject({ ok: true })
    expect(n.aplicar({ orden: 'nombrar', punto: 'R2.2', nombre: 'B' })).toMatchObject({ ok: true })
    const antes = texto(n)
    for (const via of ['cable', 'etiqueta', 'auto'] as const) expect(n.aplicar({ orden: 'conectar', desde: 'R1.2', hasta: 'R2.2', via }).ok).toBe(false)
    expect(texto(n)).toBe(antes)
    expect(extremosSueltos(n.doc, lib)).toEqual([])
  })
})

// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { documento, nuevoNucleo, pieza, texto } from '../prueba/ayudaEdicion'
import { validarOrden } from './ordenes'

const puestas = () => {
  const n = nuevoNucleo()
  for (let i = 0; i < 3; i++) expect(n.aplicar({ orden: 'colocar', tipo: 'nand', en: { x: i * 40, y: 0 } }).ok).toBe(true)
  return n
}

describe('órdenes de unidades', () => {
  it('colocar devuelve la referencia con la unidad (U1A, U1B…) y el paquete queda en las propiedades', () => {
    const n = puestas()
    expect(Object.values(n.doc.piezas).map((p) => p.ref).sort()).toEqual(['U1A', 'U1B', 'U1C'])
  })

  it('unidad pasa una pieza a otra unidad libre, y deshacer deja el documento igual', () => {
    const n = puestas()
    const antes = texto(n)
    expect(n.aplicar({ orden: 'unidad', ref: 'U1C', unidad: 'D' }).ok).toBe(true)
    expect(Object.values(n.doc.piezas).map((p) => p.ref).sort()).toEqual(['U1A', 'U1B', 'U1D'])
    expect(n.aplicar({ orden: 'deshacer' }).ok).toBe(true)
    expect(texto(n)).toBe(antes)
  })

  it('unidad ocupada, inexistente o de una pieza sin paquete se rechaza con su motivo', () => {
    const n = nuevoNucleo(documento([pieza('r', 'resistencia', 'R1', 0, 0)]))
    expect(n.aplicar({ orden: 'unidad', ref: 'R1', unidad: 'B' })).toMatchObject({ ok: false, motivo: expect.stringContaining('no forma parte') })
    expect(n.aplicar({ orden: 'unidad', ref: 'U9', unidad: 'B' }).ok).toBe(false)
    const m = puestas()
    expect(m.aplicar({ orden: 'unidad', ref: 'U1C', unidad: 'A' })).toMatchObject({ ok: false, motivo: expect.stringContaining('en uso por U1A') })
  })

  it('propiedad ref sobre una unidad renombra el paquete entero', () => {
    const n = puestas()
    expect(n.aplicar({ orden: 'propiedad', ref: 'U1B', prop: 'ref', valor: 'IC4' }).ok).toBe(true)
    expect(Object.values(n.doc.piezas).map((p) => p.ref).sort()).toEqual(['IC4A', 'IC4B', 'IC4C'])
  })

  it('agrupar reparte las piezas sueltas en un paso y no hace nada sin ellas', () => {
    const n = nuevoNucleo(documento([pieza('a', 'nand', 'U10', 0, 0), pieza('b', 'nand', 'U11', 40, 0)]))
    const antes = texto(n)
    expect(n.aplicar({ orden: 'agrupar' }).ok).toBe(true)
    expect(Object.values(n.doc.piezas).map((p) => p.ref).sort()).toEqual(['U1A', 'U1B'])
    expect(n.aplicar({ orden: 'deshacer' }).ok).toBe(true)
    expect(texto(n)).toBe(antes)
    const vacio = puestas()
    const r = vacio.aplicar({ orden: 'agrupar' })
    expect(r.ok && r.avisos.join(' ')).toContain('No hay piezas sueltas')
    expect(vacio.historial.puedeRehacer).toBe(false)
  })

  it('un lote con colocar y unidad queda en un solo paso', () => {
    const n = nuevoNucleo()
    const r = n.aplicar({ orden: 'lote', ordenes: [{ orden: 'colocar', tipo: 'nand', en: { x: 0, y: 0 } }, { orden: 'colocar', tipo: 'nand', en: { x: 40, y: 0 } }, { orden: 'unidad', ref: 'U1B', unidad: 'C' }] })
    expect(r.ok).toBe(true)
    expect(Object.values(n.doc.piezas).map((p) => p.ref).sort()).toEqual(['U1A', 'U1C'])
  })

  it('el validador reconoce unidad y agrupar y rechaza los campos que sobran', () => {
    expect(validarOrden({ orden: 'unidad', ref: 'U1A', unidad: 'B' })).toEqual({ ok: true, orden: { orden: 'unidad', ref: 'U1A', unidad: 'B' } })
    expect(validarOrden({ orden: 'agrupar' })).toEqual({ ok: true, orden: { orden: 'agrupar' } })
    expect(validarOrden({ orden: 'unidad', ref: 'U1A' }).ok).toBe(false)
    expect(validarOrden({ orden: 'unidad', ref: 'U1A', unidad: 'B', otra: 1 }).ok).toBe(false)
  })

  it('en solo lectura y simulando se rechaza', () => {
    const n = puestas()
    n.simulando = true
    expect(n.aplicar({ orden: 'unidad', ref: 'U1C', unidad: 'D' }).ok).toBe(false)
    expect(n.aplicar({ orden: 'agrupar' }).ok).toBe(false)
    n.simulando = false
    n.soloLectura = true
    expect(n.aplicar({ orden: 'unidad', ref: 'U1C', unidad: 'D' }).ok).toBe(false)
  })
})

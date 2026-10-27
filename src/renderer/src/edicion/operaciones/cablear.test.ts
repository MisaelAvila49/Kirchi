// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { aplicarOk, cable, documento, nuevoNucleo, pieza, sinViolaciones, texto } from '../../prueba/ayudaEdicion'

describe('cablear', () => {
  it('traza un cable en un paso y deshacer lo quita', () => {
    const n = nuevoNucleo(documento())
    const antes = texto(n)
    aplicarOk(n, { orden: 'cablear', puntos: [{ x: 0, y: 0 }, { x: 25, y: 0 }, { x: 25, y: 10 }] })
    expect(Object.values(n.doc.cables).map((c) => c.puntos)).toEqual([[{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 8 }]])
    n.deshacer()
    expect(texto(n)).toBe(antes)
  })

  it('funde el cable nuevo con el que termina donde empieza', () => {
    const n = nuevoNucleo(documento([], [cable('w', [0, 0], [20, 0])]))
    aplicarOk(n, { orden: 'cablear', puntos: [{ x: 25, y: 0 }, { x: 25, y: 10 }] })
    expect(Object.keys(n.doc.cables)).toHaveLength(1)
    expect(Object.values(n.doc.cables)[0].puntos[0]).toEqual({ x: 0, y: 0 })
    expect(sinViolaciones(n)).toEqual([])
    n.deshacer()
    expect(Object.keys(n.doc.cables)).toEqual(['w'])
  })

  it('rechaza un cable que atraviesa una pieza y uno fuera de la rejilla', () => {
    const n = nuevoNucleo(documento([pieza('a', 'resistencia', 'R1', 0, 0)]))
    const r = n.aplicar({ orden: 'cablear', puntos: [{ x: -20, y: 0 }, { x: 20, y: 0 }] })
    expect(r.ok).toBe(false)
    expect(n.historial.puedeDeshacer).toBe(false)
    expect(n.aplicar({ orden: 'cablear', puntos: [{ x: 1, y: 0 }, { x: 20, y: 0 }] })).toEqual({ ok: false, motivo: 'La posición va en múltiplos de 2.5 mm.' })
  })
})

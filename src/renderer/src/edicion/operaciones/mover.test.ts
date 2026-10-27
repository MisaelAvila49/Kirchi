// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { aplicarOk, cable, documento, nuevoNucleo, pieza, sinViolaciones, texto } from '../../prueba/ayudaEdicion'

describe('mover', () => {
  it('desplaza la pieza y los cables que llegan a ella la siguen', () => {
    const n = nuevoNucleo(documento([pieza('a', 'resistencia', 'R1', 0, 0)], [cable('w', [4, 0], [40, 0])]))
    const antes = texto(n)
    aplicarOk(n, { orden: 'mover', refs: ['R1'], desplazar: { x: 0, y: 5 } })
    expect(n.doc.piezas.a).toMatchObject({ x: 0, y: 4 })
    const w = Object.values(n.doc.cables)
    expect(w.some((c) => c.puntos[0].x === 4 && c.puntos[0].y === 4)).toBe(true)
    expect(w.some((c) => c.puntos[c.puntos.length - 1].x === 40 && c.puntos[c.puntos.length - 1].y === 0)).toBe(true)
    expect(sinViolaciones(n)).toEqual([])
    n.deshacer()
    expect(texto(n)).toBe(antes)
  })

  it('con a lleva la primera pieza a ese punto y el resto la acompaña', () => {
    const n = nuevoNucleo(documento([pieza('a', 'resistencia', 'R1', 0, 0), pieza('b', 'resistencia', 'R2', 24, 0)]))
    aplicarOk(n, { orden: 'mover', refs: ['R1', 'R2'], a: { x: 0, y: 25 } })
    expect(n.doc.piezas.a).toMatchObject({ x: 0, y: 20 })
    expect(n.doc.piezas.b).toMatchObject({ x: 24, y: 20 })
  })

  it('el cable que atravesaría una pieza se repara y el invariante se cumple', () => {
    const n = nuevoNucleo(documento([pieza('a', 'resistencia', 'R1', 0, 0), pieza('o', 'resistencia', 'R3', 20, -10, 90)], [cable('w', [4, 0], [40, 0])]))
    aplicarOk(n, { orden: 'mover', refs: ['R1'], desplazar: { x: 0, y: -12.5 } })
    expect(n.doc.piezas.a.y).toBe(-10)
    expect(sinViolaciones(n)).toEqual([])
  })

  it('rechaza encimarse con otra pieza con la frase del Registro y no deja paso', () => {
    const n = nuevoNucleo(documento([pieza('a', 'resistencia', 'R1', 0, 0), pieza('b', 'resistencia', 'R2', 30, 0)]))
    const r = n.aplicar({ orden: 'mover', refs: ['R1'], a: { x: 37.5, y: 0 } })
    expect(r).toEqual({ ok: false, motivo: 'No se pudo mover la selección: se encimaría con R2.' })
    expect(n.historial.puedeDeshacer).toBe(false)
  })

  it('rechaza lo que sale del área de dibujo', () => {
    const n = nuevoNucleo(documento([pieza('a', 'resistencia', 'R1', 0, 0)]))
    expect(n.aplicar({ orden: 'mover', refs: ['R1'], a: { x: 2 ** 21 * 1.25, y: 0 } })).toEqual({ ok: false, motivo: 'No se pudo mover la selección: quedaría fuera del área de dibujo.' })
  })

  it('moverse a donde ya está no deja paso y una referencia desconocida se rechaza', () => {
    const n = nuevoNucleo(documento([pieza('a', 'resistencia', 'R1', 0, 0)]))
    expect(n.aplicar({ orden: 'mover', refs: ['R1'], a: { x: 0, y: 0 } }).ok).toBe(true)
    expect(n.historial.puedeDeshacer).toBe(false)
    expect(n.aplicar({ orden: 'mover', refs: ['R7'], desplazar: { x: 5, y: 0 } })).toEqual({ ok: false, motivo: 'No hay ninguna pieza con la referencia «R7».' })
  })
})

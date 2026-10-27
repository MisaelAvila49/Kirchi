// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { aplicarOk, cable, documento, nuevoNucleo, pieza, sinViolaciones, texto } from '../../prueba/ayudaEdicion'

describe('transformar', () => {
  it('gira una pieza sobre su origen y su cable la sigue sin atravesarla', () => {
    const n = nuevoNucleo(documento([pieza('a', 'resistencia', 'R1', 0, 0)], [cable('w', [4, 0], [40, 0])]))
    const antes = texto(n)
    aplicarOk(n, { orden: 'transformar', refs: ['R1'], op: 'girar' })
    expect(n.doc.piezas.a).toMatchObject({ x: 0, y: 0, rot: 90 })
    expect(sinViolaciones(n)).toEqual([])
    // El cable que llegaba a (4,0) ahora llega al pin que quedó en (0,4).
    expect(Object.values(n.doc.cables).some((c) => c.puntos.some((p) => p.x === 0 && p.y === 4))).toBe(true)
    n.deshacer()
    expect(texto(n)).toBe(antes)
  })

  it('refleja una pieza y gira un grupo alrededor del centro de su caja', () => {
    const n = nuevoNucleo(documento([pieza('a', 'diodo', 'D1', 0, 0), pieza('b', 'resistencia', 'R1', 30, 0)]))
    aplicarOk(n, { orden: 'transformar', refs: ['D1'], op: 'espejoX' })
    expect(n.doc.piezas.a.espejo).toBe(true)
    aplicarOk(n, { orden: 'transformar', refs: ['D1', 'R1'], op: 'girar' })
    expect(n.doc.piezas.a.rot).toBe(90)
    expect(n.doc.piezas.b.rot).toBe(90)
    expect(n.doc.piezas.b.x).not.toBe(30)
    expect(sinViolaciones(n)).toEqual([])
  })

  it('rechaza un giro que choca con otra pieza y dice cuál', () => {
    const n = nuevoNucleo(documento([pieza('a', 'resistencia', 'R1', 0, 0), pieza('b', 'resistencia', 'R2', 0, 5)]))
    const r = n.aplicar({ orden: 'transformar', refs: ['R1'], op: 'girar' })
    expect(r).toEqual({ ok: false, motivo: 'R1 no se pudo girar: se encimaría con R2.' })
    expect(n.doc.piezas.a.rot).toBe(0)
    expect(n.historial.puedeDeshacer).toBe(false)
  })

  it('rechaza una referencia desconocida', () => {
    expect(nuevoNucleo().aplicar({ orden: 'transformar', refs: ['R1'], op: 'girar' })).toEqual({ ok: false, motivo: 'No hay ninguna pieza con la referencia «R1».' })
  })
})

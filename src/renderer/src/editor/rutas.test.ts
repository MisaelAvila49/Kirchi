import { describe, expect, it } from 'vitest'
import type { Punto } from '../doc/tipos'
import { ajustar, juntarCables, limpiarPolilinea, proyectarEnTramo, rutaL } from './rutas'

const P = (...pts: [number, number][]): Punto[] => pts.map(([x, y]) => ({ x, y }))

describe('rutas', () => {
  it('ajusta a la rejilla principal de 2 unidades sin devolver -0', () => {
    expect(ajustar({ x: 3.1, y: -0.9 })).toEqual({ x: 4, y: 0 })
    expect(ajustar({ x: -3.1, y: 5.2 })).toEqual({ x: -4, y: 6 })
    expect(Object.is(ajustar({ x: -0.4, y: 0 }).x, 0)).toBe(true)
  })

  it('la L va primero en horizontal o en vertical', () => {
    expect(rutaL({ x: 0, y: 0 }, { x: 10, y: 4 }, true)).toEqual(P([0, 0], [10, 0], [10, 4]))
    expect(rutaL({ x: 0, y: 0 }, { x: 10, y: 4 }, false)).toEqual(P([0, 0], [0, 4], [10, 4]))
    expect(rutaL({ x: 0, y: 0 }, { x: 10, y: 0 }, false)).toEqual(P([0, 0], [10, 0]))
    expect(rutaL({ x: 2, y: 2 }, { x: 2, y: 2 }, true)).toEqual(P([2, 2]))
  })

  it('limpia duplicados, colineales y regresos', () => {
    expect(limpiarPolilinea(P([0, 0], [0, 0], [5, 0], [10, 0], [10, 5]))).toEqual(P([0, 0], [10, 0], [10, 5]))
    expect(limpiarPolilinea(P([0, 0], [10, 0], [10, 5]))).toEqual(P([0, 0], [10, 0], [10, 5]))
    expect(limpiarPolilinea(P([0, 0], [10, 0], [0, 0]))).toEqual(P([0, 0]))
  })

  it('quita regresos sobre la misma línea y lo que dejan alineado', () => {
    // A→B→C colineales con vuelta atrás: queda A→C.
    expect(limpiarPolilinea(P([0, 0], [10, 0], [4, 0], [4, 6]))).toEqual(P([0, 0], [4, 0], [4, 6]))
    // Un pico que sube y vuelve deja la recta.
    expect(limpiarPolilinea(P([0, 0], [0, -8], [0, 0], [10, 0]))).toEqual(P([0, 0], [10, 0]))
    // El chipote aplanado: tramos de largo cero y alineados en cadena.
    expect(limpiarPolilinea(P([0, 0], [0, 0], [18, 0], [18, 0], [40, 0]))).toEqual(P([0, 0], [40, 0]))
    expect(limpiarPolilinea(P([0, 0], [0, 6], [0, 6], [0, 2], [8, 2]))).toEqual(P([0, 0], [0, 2], [8, 2]))
  })

  it('proyecta sobre un tramo al punto de rejilla más cercano', () => {
    expect(proyectarEnTramo({ x: 4.7, y: 0.4 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toEqual({ x: 4, y: 0 })
    expect(proyectarEnTramo({ x: 0.3, y: 7.1 }, { x: 0, y: 0 }, { x: 0, y: 10 })).toEqual({ x: 0, y: 8 })
    expect(proyectarEnTramo({ x: 12, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toEqual({ x: 10, y: 0 })
  })

  it('junta dos cables que comparten un extremo, en cualquier sentido', () => {
    const a = P([0, 0], [10, 0])
    expect(juntarCables(a, P([10, 0], [20, 0]))).toEqual(P([0, 0], [20, 0]))
    expect(juntarCables(a, P([10, 5], [10, 0]))).toEqual(P([0, 0], [10, 0], [10, 5]))
    expect(juntarCables(a, P([0, 5], [0, 0]))).toEqual(P([0, 5], [0, 0], [10, 0]))
    expect(juntarCables(a, P([0, 0], [0, 5]))).toEqual(P([10, 0], [0, 0], [0, 5]))
    expect(juntarCables(a, P([3, 3], [4, 4]))).toBeNull()
  })
})

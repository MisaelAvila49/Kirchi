import { describe, expect, it } from 'vitest'
import type { Punto } from '../doc/tipos'
import { CableEnCurso } from './cableado'

const P = (...pts: [number, number][]): Punto[] => pts.map(([x, y]) => ({ x, y }))
const p = (x: number, y: number): Punto => ({ x, y })

describe('CableEnCurso', () => {
  it('la L sigue al cursor y «/» la invierte', () => {
    const c = new CableEnCurso(p(0, 0))
    expect(c.vista()).toEqual(P([0, 0]))
    c.mover(p(10, 4))
    expect(c.vista()).toEqual(P([0, 0], [10, 0], [10, 4]))
    c.invertir()
    expect(c.vista()).toEqual(P([0, 0], [0, 4], [10, 4]))
    c.mover(p(10, 0))
    expect(c.vista()).toEqual(P([0, 0], [10, 0]))
  })

  it('el primer movimiento decide la orientación', () => {
    const c = new CableEnCurso(p(0, 0))
    c.mover(p(2, 10))
    expect(c.vista()).toEqual(P([0, 0], [0, 10], [2, 10]))
    c.mover(p(10, 10))
    expect(c.vista()).toEqual(P([0, 0], [0, 10], [10, 10]))
  })

  it('fija esquinas y Retroceso las quita', () => {
    const c = new CableEnCurso(p(0, 0))
    c.mover(p(10, 4))
    c.fijarEsquina()
    c.mover(p(20, 8))
    expect(c.vista()).toEqual(P([0, 0], [10, 0], [10, 4], [20, 4], [20, 8]))
    expect(c.quitarEsquina()).toBe(true)
    expect(c.vista()).toEqual(P([0, 0], [20, 0], [20, 8]))
    expect(c.quitarEsquina()).toBe(false)
    expect(c.vista()).toEqual(P([0, 0], [20, 0], [20, 8]))
  })

  it('Retroceso quita todos los puntos que agregó el último clic', () => {
    const c = new CableEnCurso(p(4, 0))
    c.mover(p(10, 6))
    c.fijarEsquina()
    expect(c.vista()).toEqual(P([4, 0], [10, 0], [10, 6]))
    c.mover(p(10, 6))
    expect(c.quitarEsquina()).toBe(true)
    expect(c.vista()).toEqual(P([4, 0], [10, 0], [10, 6]))
    c.mover(p(4, 8))
    expect(c.vista()).toEqual(P([4, 0], [4, 8]))
    c.mover(p(6, 8))
    expect(c.vista()).toEqual(P([4, 0], [4, 8], [6, 8]))
  })

  it('terminar devuelve la polilínea limpia hasta el punto final', () => {
    const c = new CableEnCurso(p(4, 0))
    c.mover(p(10, 6))
    c.fijarEsquina()
    expect(c.terminar(p(16, 0))).toEqual(P([4, 0], [10, 0], [10, 6], [16, 6], [16, 0]))
    expect(c.inicio).toEqual(p(4, 0))
  })
})

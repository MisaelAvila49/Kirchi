import { describe, expect, it } from 'vitest'
import type { Cable } from '../doc/tipos'
import { cruces, tramoConSaltos } from './saltos'

const C = (id: string, ...pts: [number, number][]): Cable => ({ id, puntos: pts.map(([x, y]) => ({ x, y })) })

describe('cruces', () => {
  it('un vertical que atraviesa un horizontal produce un salto en el horizontal', () => {
    const m = cruces([C('h', [0, 0], [10, 0]), C('v', [5, -5], [5, 5])], [])
    expect([...m]).toEqual([['h#0', [5]]])
  })

  it('no hay salto donde hay unión', () => {
    expect(cruces([C('h', [0, 0], [10, 0]), C('v', [5, -5], [5, 5])], [{ x: 5, y: 0 }]).size).toBe(0)
  })

  it('una T (extremo del vertical sobre el horizontal) no salta', () => {
    expect(cruces([C('h', [0, 0], [10, 0]), C('v', [5, 0], [5, 5])], []).size).toBe(0)
  })

  it('un vertical en el extremo del horizontal no salta', () => {
    expect(cruces([C('h', [0, 0], [10, 0]), C('v', [0, -5], [0, 5])], []).size).toBe(0)
  })

  it('varios cruces salen ordenados por x', () => {
    const m = cruces([C('h', [0, 0], [10, 0]), C('b', [7, -5], [7, 5]), C('a', [2, -5], [2, 5])], [])
    expect(m.get('h#0')).toEqual([2, 7])
  })

  it('la clave nombra el tramo dentro de la polilínea', () => {
    const m = cruces([C('c', [0, 0], [10, 0], [10, 10]), C('d', [5, -5], [5, 5])], [])
    expect([...m.keys()]).toEqual(['c#0'])
  })
})

describe('tramoConSaltos', () => {
  it('inserta un semicírculo de 9 puntos hacia arriba', () => {
    const pts = tramoConSaltos({ x: 0, y: 0 }, { x: 10, y: 0 }, [5])
    expect(pts).toHaveLength(22)
    expect(pts.slice(0, 4)).toEqual([0, 0, 4.2, 0])
    expect(pts[10]).toBeCloseTo(5, 9)
    expect(pts[11]).toBeCloseTo(-0.8, 9)
    expect(pts[18]).toBeCloseTo(5.8, 9)
    expect(pts.slice(20)).toEqual([10, 0])
  })

  it('respeta el sentido del tramo', () => {
    const pts = tramoConSaltos({ x: 10, y: 0 }, { x: 0, y: 0 }, [5])
    expect(pts[2]).toBeCloseTo(5.8, 9)
    expect(pts[18]).toBeCloseTo(4.2, 9)
  })

  it('dos cruces son dos arcos', () => {
    expect(tramoConSaltos({ x: 0, y: 0 }, { x: 10, y: 0 }, [2, 7])).toHaveLength(40)
  })
})

describe('arcos cercanos', () => {
  const xsDe = (pts: number[]) => pts.filter((_, i) => i % 2 === 0)
  it('dos cruces a 1 de distancia dan arcos de radio 0.5 y x no decrece', () => {
    const pts = tramoConSaltos({ x: 0, y: 0 }, { x: 20, y: 0 }, [5, 6])
    const xs = xsDe(pts)
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThanOrEqual(xs[i - 1] - 1e-9)
    expect(pts[2]).toBeCloseTo(4.5, 9)
    const ysMin = Math.min(...pts.filter((_, i) => i % 2 === 1))
    expect(ysMin).toBeCloseTo(-0.5, 9)
  })
  it('cruce junto al inicio del tramo recorta el radio', () => {
    const pts = tramoConSaltos({ x: 0, y: 0 }, { x: 10, y: 0 }, [0.5])
    expect(pts[2]).toBeCloseTo(0.25, 9)
    expect(Math.min(...pts.filter((_, i) => i % 2 === 1))).toBeCloseTo(-0.25, 9)
  })
})

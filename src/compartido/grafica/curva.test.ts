import { describe, expect, it } from 'vitest'
import { avanzarEnCurva, pendiente, puntoMasCercano } from './curva'

const identidad = (x: number, y: number): [number, number] => [x, y]

describe('puntoMasCercano', () => {
  it('en una circunferencia elige el lado del puntero y no el de x parecida', () => {
    const n = 360
    const x = Float64Array.from({ length: n + 1 }, (_, k) => 100 * Math.cos((2 * Math.PI * k) / n))
    const y = Float64Array.from({ length: n + 1 }, (_, k) => 100 * Math.sin((2 * Math.PI * k) / n))
    // Sobre la mitad de arriba (x = 30): hay dos puntos con esa x, el puntero está arriba.
    const arriba = puntoMasCercano([{ x, y }], identidad, 31, 90)!
    expect(arriba.y).toBeGreaterThan(0)
    expect(Math.hypot(arriba.x, arriba.y)).toBeCloseTo(100, 1)
    const abajo = puntoMasCercano([{ x, y }], identidad, 31, -90)!
    expect(abajo.y).toBeLessThan(0)
    expect(abajo.x).toBeCloseTo(arriba.x, 0)
  })

  it('proyecta sobre el segmento: no se pega al vértice', () => {
    const p = puntoMasCercano([{ x: [0, 10], y: [0, 0] }], identidad, 3.3, 5)!
    expect(p.x).toBeCloseTo(3.3, 9)
    expect(p.dist).toBeCloseTo(5, 9)
  })

  it('no cruza el hueco de un vértice sin dato', () => {
    const p = puntoMasCercano([{ x: [0, 1, Number.NaN, 9, 10], y: [0, 0, Number.NaN, 0, 0] }], identidad, 5, 0)!
    expect(p.x === 1 || p.x === 9).toBe(true)
  })
})

describe('pendiente', () => {
  it('lee −14 en una recta muestreada y = −14x', () => {
    const x = Float64Array.from({ length: 101 }, (_, k) => -1 + k * 0.02)
    const y = x.map((v) => -14 * v)
    const a = puntoMasCercano([{ x, y }], (px, py) => [px * 100, py * 5], -0.5 * 100 + 0.2, 7 * 5 + 1)!
    const b = puntoMasCercano([{ x, y }], (px, py) => [px * 100, py * 5], 0.6 * 100 - 0.3, -8.4 * 5)!
    expect(Math.abs(pendiente(a, b)! + 14) / 14).toBeLessThan(0.01)
  })

  it('es null con dos puntos en la misma vertical', () => {
    expect(pendiente({ x: 1, y: 0 }, { x: 1, y: 5 })).toBeNull()
  })
})

describe('avanzarEnCurva', () => {
  it('salta el vértice sin dato y se queda en el extremo', () => {
    const c = { x: [0, 1, Number.NaN, 3], y: [0, 1, Number.NaN, 3] }
    const de = puntoMasCercano([c], identidad, 1, 1)!
    expect(avanzarEnCurva(c, de, 1)).toEqual({ x: 3, y: 3 })
    expect(avanzarEnCurva(c, de, 9)).toEqual({ x: 3, y: 3 })
    expect(avanzarEnCurva(c, de, -5)).toEqual({ x: 0, y: 0 })
  })
})

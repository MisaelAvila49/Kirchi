import { describe, expect, it } from 'vitest'
import type { GraficoResultado } from '../ngspice'
import { unirBarridosAc } from './unirAc'

const grafico = (f: number[], v: number[]): GraficoResultado => ({
  nombre: 'AC Analysis',
  complejo: true,
  puntos: f.length,
  vectores: [
    { nombre: 'frequency', unidad: 'frequency', referencia: { tipo: 'escala' }, re: Float64Array.from(f), im: Float64Array.from(f.map(() => 0)) },
    { nombre: 'v(n2)', unidad: 'voltage', referencia: { tipo: 'nodo', nodo: 2 }, re: Float64Array.from(v), im: Float64Array.from(v.map((x) => -x)) }
  ]
})

describe('unirBarridosAc', () => {
  it('une la rejilla con los puntos exactos, ordenados por frecuencia', () => {
    const [g] = unirBarridosAc([grafico([10, 100, 1000], [1, 2, 3]), grafico([60], [9]), grafico([500], [8])], 3)
    expect(Array.from(g.vectores[0].re)).toEqual([10, 60, 100, 500, 1000])
    expect(Array.from(g.vectores[1].re)).toEqual([1, 9, 2, 8, 3])
    expect(Array.from(g.vectores[1].im!)).toEqual([-1, -9, -2, -8, -3])
    expect(g.puntos).toBe(5)
  })
  it('si la rejilla ya tiene esa frecuencia (con error de redondeo) queda el punto exacto', () => {
    const [g] = unirBarridosAc([grafico([10, 60.00000000001, 100], [1, 2, 3]), grafico([60], [9])], 2)
    expect(Array.from(g.vectores[0].re)).toEqual([10, 60, 100])
    expect(Array.from(g.vectores[1].re)).toEqual([1, 9, 3])
  })
  it('con barrido de parámetro une cada grupo por separado', () => {
    const r = unirBarridosAc([grafico([10, 100], [1, 2]), grafico([60], [9]), grafico([10, 100], [4, 5]), grafico([60], [7])], 2)
    expect(r).toHaveLength(2)
    expect(Array.from(r[1].vectores[1].re)).toEqual([4, 7, 5])
  })
  it('sin grupo no toca nada', () => {
    const g = [grafico([1], [1])]
    expect(unirBarridosAc(g, 1)).toBe(g)
  })
})

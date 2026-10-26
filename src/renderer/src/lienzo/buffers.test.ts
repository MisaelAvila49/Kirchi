import { describe, expect, it } from 'vitest'
import { Crecible, EscritorTrazos, EscritorTriangulos, FLOTANTES_TRAZO, FLOTANTES_VERTICE } from './buffers'
import type { RGBA } from './paleta'

// Valores exactos en float32 para comparar sin tolerancia.
const C: RGBA = [0.5, 0.25, 0.125, 1]

describe('EscritorTrazos', () => {
  it('un segmento son 9 flotantes', () => {
    const e = new EscritorTrazos()
    e.segmento(1, 2, 3, 4, 0.25, C)
    expect(e.cuenta).toBe(1)
    expect(Array.from(e.resultado())).toEqual([1, 2, 3, 4, 0.25, 0.5, 0.25, 0.125, 1])
  })

  it('una polilínea de 3 puntos son 2 segmentos', () => {
    const e = new EscritorTrazos()
    e.polilinea([0, 0, 10, 0, 10, 5], 0.5, C)
    expect(e.cuenta).toBe(2)
    expect(Array.from(e.resultado().subarray(FLOTANTES_TRAZO, FLOTANTES_TRAZO + 4))).toEqual([10, 0, 10, 5])
  })

  it('crece sin perder lo escrito', () => {
    const e = new EscritorTrazos()
    for (let i = 0; i < 1000; i++) e.segmento(i, 0, i + 1, 0, 1, C)
    const r = e.resultado()
    expect(e.cuenta).toBe(1000)
    expect(r.length).toBe(1000 * FLOTANTES_TRAZO)
    expect(r[0]).toBe(0)
    expect(r[999 * FLOTANTES_TRAZO]).toBe(999)
  })

  it('vaciar reinicia la cuenta', () => {
    const e = new EscritorTrazos()
    e.segmento(0, 0, 1, 1, 1, C)
    e.vaciar()
    expect(e.cuenta).toBe(0)
    expect(e.resultado().length).toBe(0)
  })
})

describe('EscritorTriangulos', () => {
  it('un triángulo son 3 vértices de 6 flotantes', () => {
    const e = new EscritorTriangulos()
    e.triangulo(0, 0, 1, 0, 0, 1, C)
    expect(e.cuenta).toBe(1)
    expect(e.resultado().length).toBe(3 * FLOTANTES_VERTICE)
    expect(Array.from(e.resultado().subarray(6, 12))).toEqual([1, 0, 0.5, 0.25, 0.125, 1])
  })

  it('crece sin perder lo escrito', () => {
    const e = new EscritorTriangulos()
    for (let i = 0; i < 500; i++) e.triangulo(i, 0, i, 1, i + 1, 0, C)
    expect(e.cuenta).toBe(500)
    expect(e.resultado()[499 * 3 * FLOTANTES_VERTICE]).toBe(499)
  })
})

describe('Crecible', () => {
  it('con capacidad 0 acepta escrituras', () => {
    const b = new Crecible(0)
    const d = b.reservar(3)
    expect(d.length).toBeGreaterThanOrEqual(3)
  })
})

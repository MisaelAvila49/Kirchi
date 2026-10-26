import { describe, expect, it } from 'vitest'
import type { GraficoResultado } from '../ngspice'
import type { AnalisisDoc } from './config'
import { mapearResultados, type Nombres } from './resultados'

const nombres: Nombres = { redes: new Map([[1, 'salida']]), elementos: [], sondas: [], pieza: (id) => (id === 'v2' ? 'V2' : 'V1') }
const doc = (config: AnalisisDoc['config']): AnalisisDoc => ({ id: 'a', nombre: 'DC', config })

/** Un gráfico de CD: `eje` es el voltaje de la fuente barrida y `v` la red 1. */
function graficoDc(eje: number[], v: number[]): GraficoResultado {
  return {
    nombre: 'DC transfer characteristic',
    complejo: false,
    puntos: eje.length,
    vectores: [
      { nombre: 'v-sweep', unidad: 'voltage', referencia: { tipo: 'escala' }, re: Float64Array.from(eje), im: null },
      { nombre: 'v(n1)', unidad: 'voltage', referencia: { tipo: 'nodo', nodo: 1 }, re: Float64Array.from(v), im: null }
    ]
  }
}

describe('barrido de CD anidado', () => {
  const config = { tipo: 'dc' as const, fuente: 'v1', desde: 0, hasta: 2, paso: 1, segunda: { fuente: 'v2', desde: 0, hasta: 1, paso: 1 } }

  it('parte las corridas por los puntos de la fuente interior, no por la longitud del eje', () => {
    // Interior: 3 puntos (0, 1, 2). Exterior: 2 valores (0 y 1). Seis puntos en total.
    const g = graficoDc([0, 1, 2, 0, 1, 2], [10, 11, 12, 20, 21, 22])
    const r = mapearResultados(doc(config), [g], nombres)
    expect(r.corridas).toHaveLength(2)
    expect(Array.from(r.corridas[0].eje)).toEqual([0, 1, 2])
    expect(Array.from(r.corridas[1].series[0].valores)).toEqual([20, 21, 22])
    expect(r.avisos).toEqual([])
  })

  it('avisa si el número de puntos no es el esperado y no inventa corridas vacías', () => {
    const g = graficoDc([0, 1, 2, 0], [10, 11, 12, 20])
    const r = mapearResultados(doc(config), [g], nombres)
    expect(r.avisos.join(' ')).toMatch(/4 puntos.*6/)
    expect(r.corridas.every((c) => c.eje.length > 0)).toBe(true)
  })

  it('con una fuente barrida de hasta a desde sigue funcionando', () => {
    const g = graficoDc([2, 1, 0, 2, 1, 0], [1, 2, 3, 4, 5, 6])
    const r = mapearResultados(doc({ ...config, desde: 2, hasta: 0 }), [g], nombres)
    expect(r.corridas).toHaveLength(2)
    expect(Array.from(r.corridas[0].eje)).toEqual([2, 1, 0])
  })
})

describe('trazas por omisión: sin rieles de alimentación', () => {
  const op: AnalisisDoc = { id: 'a', nombre: 'OP', config: { tipo: 'op' } }
  const graficoOp = (nodos: number[]): GraficoResultado => ({
    nombre: 'Operating Point',
    complejo: false,
    puntos: 1,
    vectores: nodos.map((n) => ({ nombre: `v(n${n})`, unidad: 'voltage', referencia: { tipo: 'nodo' as const, nodo: n }, re: Float64Array.from([n]), im: null }))
  })
  const ids = (n: Nombres, nodos: number[]) => mapearResultados(op, [graficoOp(nodos)], n).corridas[0].series.map((s) => s.id)

  it('un riel con nombre no sale por omisión; una red con nombre que no es riel sí', () => {
    const n: Nombres = { redes: new Map([[1, '+15V'], [2, '-15V'], [3, 'Salida']]), rieles: new Set([1, 2]), elementos: [], sondas: [] }
    expect(ids(n, [1, 2, 3, 4])).toEqual(['v:3'])
  })

  it('un riel se grafica si se pide a mano', () => {
    const n: Nombres = { redes: new Map([[1, '+15V'], [3, 'Salida']]), rieles: new Set([1]), elementos: [], sondas: [] }
    const r = mapearResultados(op, [graficoOp([1, 3])], n, [], { redes: [1] })
    expect(r.corridas[0].series.map((s) => s.id)).toEqual(['v:1', 'v:3'])
  })

  it('si solo hay rieles con nombre, salen las redes que no son rieles (con aviso) y no los rieles', () => {
    const n: Nombres = { redes: new Map([[1, '+15V'], [2, '-15V']]), rieles: new Set([1, 2]), todasLasRedes: new Map([[3, 'N3'], [4, 'N4']]), elementos: [], sondas: [] }
    const r = mapearResultados(op, [graficoOp([1, 2, 3, 4])], n)
    expect(r.corridas[0].series.map((s) => s.id)).toEqual(['v:3', 'v:4'])
    expect(r.avisos).toHaveLength(1)
  })

  it('las sondas cuentan: con rieles y una sonda, sale la sonda', () => {
    const n: Nombres = { redes: new Map([[1, '+15V']]), rieles: new Set([1]), elementos: [], sondas: [{ nombre: 'XO1 canal A', tipo: 'v' }] }
    const g = graficoOp([1])
    g.vectores.push({ nombre: 'sonda0', unidad: 'voltage', referencia: { tipo: 'sonda', indice: 0 }, re: Float64Array.from([2]), im: null })
    expect(mapearResultados(op, [g], n).corridas[0].series.map((s) => s.id)).toEqual(['s:0'])
  })

  it('si todas las redes son rieles, salen todas; si no hay pocas, las primeras ocho con aviso', () => {
    const solo: Nombres = { redes: new Map([[1, '+5V']]), rieles: new Set([1]), elementos: [], sondas: [] }
    expect(ids(solo, [1])).toEqual(['v:1'])
    const muchas = Array.from({ length: 12 }, (_, i) => i + 1)
    const n: Nombres = { redes: new Map(), rieles: new Set(), elementos: [], sondas: [] }
    const r = mapearResultados(op, [graficoOp(muchas)], n)
    expect(r.corridas[0].series).toHaveLength(8)
    expect(r.avisos.join(' ')).toMatch(/ocho/)
  })
})

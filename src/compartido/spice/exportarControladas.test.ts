import { describe, expect, it } from 'vitest'
import type { ElementoMotor, NetlistMotor } from '../netlistMotor'
import { exportarSpice } from './exportar'

const exportar = (...elements: ElementoMotor[]): string[] => exportarSpice({ nodes: 6, elements } as NetlistMotor).cuerpo.trim().split('\n')

describe('exportar JFET, fuentes controladas y fuente por tramos', () => {
  it('el JFET de canal N escribe su modelo NJF con los parámetros dados', () => {
    const l = exportar({ type: 'J', d: 1, g: 2, s: 3, pjf: false, model: { vto: -1.5, beta: 2e-3, lambda: 0.01 } })
    expect(l).toEqual(['.model jm1 njf(vto=-1.5 beta=0.002 lambda=0.01)', 'j0 n1 n2 n3 jm1'])
  })

  it('el de canal P usa PJF y comparte el modelo cuando es el mismo', () => {
    const j = { type: 'J', d: 1, g: 2, s: 3, pjf: true, model: { vto: 1 } } as const
    const l = exportar(j, { ...j, d: 4 })
    expect(l.filter((x) => x.startsWith('.model'))).toEqual(['.model jm1 pjf(vto=1)'])
    expect(l.filter((x) => x.startsWith('j'))).toEqual(['j0 n1 n2 n3 jm1', 'j1 n4 n2 n3 jm1'])
  })

  it('un parámetro de JFET desconocido se rechaza', () => {
    expect(() => exportar({ type: 'J', d: 1, g: 2, s: 3, pjf: false, model: { xx: 1 } })).toThrow(/no existe/)
  })

  it('E y G se escriben directos', () => {
    expect(exportar({ type: 'E', p: 1, n: 2, cp: 3, cn: 4, ganancia: 2 })).toEqual(['e0 n1 n2 n3 n4 2'])
    expect(exportar({ type: 'G', p: 1, n: 2, cp: 3, cn: 4, gm: 0.01 })).toEqual(['g0 n1 n2 n3 n4 0.01'])
  })

  it('H y F llevan una fuente de 0 V auxiliar entre los nodos de control y la nombran', () => {
    expect(exportar({ type: 'H', p: 1, n: 2, cp: 3, cn: 4, r: 100 })).toEqual(['vh0_ctl n3 n4 dc 0', 'h0 n1 n2 vh0_ctl 100'])
    expect(exportar({ type: 'R', a: 1, b: 0, ohms: 1 }, { type: 'F', p: 1, n: 2, cp: 3, cn: 4, ganancia: 2 })[1]).toBe('vf1_ctl n3 n4 dc 0')
  })

  it('un nodo de control a tierra se escribe 0', () => {
    expect(exportar({ type: 'F', p: 1, n: 0, cp: 3, cn: 0, ganancia: 2 })).toEqual(['vf0_ctl n3 0 dc 0', 'f0 n1 0 vf0_ctl 2'])
  })

  it('la fuente por tramos escribe pwl y con repetir agrega r=0', () => {
    const puntos: [number, number][] = [[0, 0], [1e-3, 5], [2e-3, 0]]
    expect(exportar({ type: 'V', a: 1, b: 0, wave: { kind: 'pwl', puntos } })).toEqual(['v0 n1 0 pwl(0 0 0.001 5 0.002 0)'])
    expect(exportar({ type: 'V', a: 1, b: 0, wave: { kind: 'pwl', puntos, repetir: true } })).toEqual(['v0 n1 0 pwl(0 0 0.001 5 0.002 0) r=0'])
  })

  it('una fuente por tramos de un solo punto es continua', () => {
    expect(exportar({ type: 'V', a: 1, b: 0, wave: { kind: 'pwl', puntos: [[0, 3]], repetir: true } })).toEqual(['v0 n1 0 dc 3'])
  })

  it('una fuente por tramos sin puntos válidos se rechaza', () => {
    expect(() => exportar({ type: 'V', a: 1, b: 0, wave: { kind: 'pwl', puntos: [] } })).toThrow(/puntos/)
    expect(() => exportar({ type: 'V', a: 1, b: 0, wave: { kind: 'pwl', puntos: [[0.1, 0], [1, 1]] } })).toThrow(/puntos/)
  })
})

import { describe, expect, it } from 'vitest'
import type { Pieza } from '../doc/tipos'
import type { PiezaDef } from './tipos'
import { cajaEnMundo, girar, pinesEnMundo, transformar } from './transformar'

describe('transformar', () => {
  it('gira en sentido horario de pantalla (y hacia abajo)', () => {
    expect(transformar(4, 0, 0, false)).toEqual([4, 0])
    expect(transformar(4, 0, 90, false)).toEqual([0, 4])
    expect(transformar(4, 0, 180, false)).toEqual([-4, 0])
    expect(transformar(4, 0, 270, false)).toEqual([0, -4])
  })

  it('refleja antes de girar y nunca devuelve -0', () => {
    expect(transformar(4, 0, 0, true)).toEqual([-4, 0])
    const [x, y] = transformar(4, 0, 90, true)
    expect(Object.is(x, 0)).toBe(true)
    expect(y).toBe(-4)
  })

  it('girar da la vuelta', () => {
    expect(girar(270, 1)).toBe(0)
    expect(girar(0, -1)).toBe(270)
  })

  it('pinesEnMundo suma la posición de la pieza', () => {
    const def = { pines: [{ id: '1', nombre: '1', x: -4, y: 0 }, { id: '2', nombre: '2', x: 4, y: 0 }] } as PiezaDef
    const p: Pieza = { id: 'p', tipo: 'r', ref: 'R1', x: 14, y: -4, rot: 90, espejo: false, props: {} }
    expect(pinesEnMundo(p, def)).toEqual([{ id: '1', x: 14, y: -8 }, { id: '2', x: 14, y: 0 }])
  })
})

describe('cajaEnMundo', () => {
  const def = (minX: number, minY: number, maxX: number, maxY: number) =>
    ({ pines: [], geometria: { trazos: [], rellenos: [], caja: { minX, minY, maxX, maxY } } }) as unknown as PiezaDef
  const pieza = (x: number, y: number, rot: 0 | 90 | 180 | 270, espejo: boolean) => ({ id: 'p', tipo: 't', ref: 'R1', x, y, rot, espejo, props: {} })

  it('gira, refleja, desplaza y amplía la caja', () => {
    expect(cajaEnMundo(pieza(10, 0, 90, false), def(-4, -1, 4, 1), 0.125)).toEqual({ minX: 8.875, minY: -4.125, maxX: 11.125, maxY: 4.125 })
    expect(cajaEnMundo(pieza(0, 0, 0, true), def(-1, -4, 2.2, 4))).toEqual({ minX: -2.2, minY: -4, maxX: 1, maxY: 4 })
  })
})

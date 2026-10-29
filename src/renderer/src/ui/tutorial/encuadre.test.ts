import { describe, expect, it } from 'vitest'
import { debeEncuadrar, sobresaleDelPanel, zonaFueraDeVista } from './encuadre'

const area = { x: 100, y: 50, w: 800, h: 600 }
const identidad = (p: { x: number; y: number }) => ({ x: p.x, y: p.y })

describe('encuadre del tutorial', () => {
  it('una zona dentro del área visible no pide encuadrar', () => {
    expect(zonaFueraDeVista({ minX: 200, minY: 100, maxX: 400, maxY: 300 }, identidad, area)).toBe(false)
  })
  it('una zona que sobresale por cualquier lado, o que está fuera, sí', () => {
    expect(zonaFueraDeVista({ minX: 50, minY: 100, maxX: 400, maxY: 300 }, identidad, area)).toBe(true)
    expect(zonaFueraDeVista({ minX: 200, minY: 100, maxX: 950, maxY: 300 }, identidad, area)).toBe(true)
    expect(zonaFueraDeVista({ minX: 200, minY: 600, maxX: 400, maxY: 700 }, identidad, area)).toBe(true)
    expect(zonaFueraDeVista({ minX: 2000, minY: 0, maxX: 2100, maxY: 10 }, identidad, area)).toBe(true)
  })
  it('sin lienzo medido no se mueve nada', () => {
    expect(zonaFueraDeVista({ minX: 0, minY: 0, maxX: 10, maxY: 10 }, identidad, null)).toBe(false)
    expect(zonaFueraDeVista({ minX: 0, minY: 0, maxX: 10, maxY: 10 }, () => null, area)).toBe(false)
  })
  it('se encuadra al cambiar de capítulo y, dentro del mismo, solo si el objetivo queda fuera', () => {
    expect(debeEncuadrar(null, 'a', false)).toBe(true)
    expect(debeEncuadrar('a', 'b', false)).toBe(true)
    expect(debeEncuadrar('a', 'a', false)).toBe(false)
    expect(debeEncuadrar('a', 'a', true)).toBe(true)
  })
  it('una zona de un panel con desplazamiento se desplaza solo si sobresale de lo que el panel deja ver', () => {
    const panel = { x: 700, y: 100, w: 300, h: 400 }
    expect(sobresaleDelPanel({ x: 710, y: 120, w: 200, h: 80 }, panel)).toBe(false)
    expect(sobresaleDelPanel({ x: 710, y: 460, w: 200, h: 80 }, panel)).toBe(true)
    expect(sobresaleDelPanel({ x: 710, y: 60, w: 200, h: 80 }, panel)).toBe(true)
  })
})

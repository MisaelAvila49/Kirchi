// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { svgAGeometria } from './svg'

const svg = (cuerpo: string) => `<svg xmlns="http://www.w3.org/2000/svg">${cuerpo}</svg>`

describe('svgAGeometria', () => {
  it('línea y caja', () => {
    const g = svgAGeometria(svg('<line x1="-4" y1="0" x2="4" y2="1"/>'))
    expect(g.trazos).toEqual([[-4, 0, 4, 1]])
    expect(g.rellenos).toEqual([])
    expect(g.caja).toEqual({ minX: -4, minY: 0, maxX: 4, maxY: 1 })
  })

  it('trayectoria absoluta cerrada repite el primer punto', () => {
    expect(svgAGeometria(svg('<path d="M0 0 H4 V2 Z"/>')).trazos).toEqual([[0, 0, 4, 0, 4, 2, 0, 0]])
  })

  it('trayectoria relativa', () => {
    expect(svgAGeometria(svg('<path d="m1 1 l2 0 v3"/>')).trazos).toEqual([[1, 1, 3, 1, 3, 4]])
  })

  it('varias subtrayectorias', () => {
    expect(svgAGeometria(svg('<path d="M0 0 H1 M0 2 H1"/>')).trazos).toEqual([[0, 0, 1, 0], [0, 2, 1, 2]])
  })

  it('arco: puntos sobre el círculo, extremo exacto y por arriba con sweep 1', () => {
    const [t] = svgAGeometria(svg('<path d="M-1 0 A1 1 0 0 1 1 0"/>')).trazos
    for (let i = 0; i < t.length; i += 2) expect(Math.hypot(t[i], t[i + 1])).toBeCloseTo(1, 9)
    expect(t.slice(-2)).toEqual([1, 0])
    const mitad = (t.length / 2 - 1) >> 1
    expect(t[mitad * 2 + 1]).toBeLessThan(0)
  })

  it('círculo de 32 tramos cerrado', () => {
    const [t] = svgAGeometria(svg('<circle cx="0" cy="0" r="2"/>')).trazos
    expect(t.length).toBe(66)
    expect(t.slice(-2)).toEqual(t.slice(0, 2))
  })

  it('rectángulo cerrado', () => {
    expect(svgAGeometria(svg('<rect x="0" y="0" width="2" height="1"/>')).trazos).toEqual([[0, 0, 2, 0, 2, 1, 0, 1, 0, 0]])
  })

  it('relleno heredado de un grupo y sin trazo', () => {
    const g = svgAGeometria(svg('<g fill="currentColor" stroke="none"><polygon points="-1,-1 -1,1 1,0"/></g>'))
    expect(g.trazos).toEqual([])
    expect(g.rellenos).toHaveLength(6)
  })

  it('curva cúbica termina en su punto final', () => {
    const [t] = svgAGeometria(svg('<path d="M0 0 C0 1 1 1 1 0"/>')).trazos
    expect(t.slice(-2)).toEqual([1, 0])
    expect(t.length).toBe(2 + 12 * 2)
  })

  it('rechaza lo no admitido', () => {
    expect(() => svgAGeometria(svg('<image href="a.png"/>'))).toThrow(/no soportado: <image>/)
    expect(() => svgAGeometria(svg('<line x1="0" y1="0" x2="1" y2="0" transform="rotate(90)"/>'))).toThrow(/transform/)
    expect(() => svgAGeometria(svg('<path d="M0 0 S1 1 2 2"/>'))).toThrow(/no soportado: S/)
    expect(() => svgAGeometria('<html/>')).toThrow(/SVG inválido/)
  })

  it('rechaza coordenadas inválidas', () => {
    expect(() => svgAGeometria(svg('<line x1="a" y1="0" x2="1" y2="0"/>'))).toThrow(/coordenada inválida en <line>/)
    expect(() => svgAGeometria(svg('<polyline points="0 0 1"/>'))).toThrow(/coordenada inválida en <polyline>/)
  })

  it('rechaza style con fill o stroke, también heredado', () => {
    expect(() => svgAGeometria(svg('<line x1="0" y1="0" x2="1" y2="0" style="stroke:red"/>'))).toThrow(/no style \(en <line>\)/)
    expect(() => svgAGeometria(svg('<g style="fill: red"><line x1="0" y1="0" x2="1" y2="0"/></g>'))).toThrow(/no style/)
    expect(svgAGeometria(svg('<line x1="0" y1="0" x2="1" y2="0" style="stroke-width:2"/>')).trazos).toHaveLength(1)
  })

  it('ignora defs, otros espacios de nombres y trata transparent y vacío como ninguno', () => {
    const cuerpo =
      '<defs><circle r="1"/></defs><sodipodi:namedview xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd"/>' +
      '<line x1="0" y1="0" x2="1" y2="0" stroke="transparent"/><line x1="0" y1="1" x2="1" y2="1" stroke=""/><line x1="0" y1="2" x2="1" y2="2"/>'
    expect(svgAGeometria(svg(cuerpo)).trazos).toEqual([[0, 2, 1, 2]])
  })

  it('exige banderas de arco 0 o 1 separadas', () => {
    expect(() => svgAGeometria(svg('<path d="M-1 0 A1 1 0 011 0"/>'))).toThrow(/bandera de arco inválida/)
    expect(svgAGeometria(svg('<path d="M-1 0 A1 1 0 0 1 1 0"/>')).trazos).toHaveLength(1)
  })

  it('no deja puntos repetidos seguidos ni cierre duplicado', () => {
    expect(svgAGeometria(svg('<polyline points="0,0 0,0 1,0 1,0"/>')).trazos).toEqual([[0, 0, 1, 0]])
    expect(svgAGeometria(svg('<path d="M0 0 H4 V2 L0 0 Z"/>')).trazos).toEqual([[0, 0, 4, 0, 4, 2, 0, 0]])
    expect(svgAGeometria(svg('<polygon points="0,0 4,0 4,2 0,0"/>')).trazos).toEqual([[0, 0, 4, 0, 4, 2, 0, 0]])
  })

  it('ignora title y desc', () => {
    expect(svgAGeometria(svg('<title>R</title><desc>x</desc><line x1="0" y1="0" x2="1" y2="0"/>')).trazos).toHaveLength(1)
  })
})

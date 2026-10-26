// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { documentoVacio } from '../doc/tipos'
import { libreriaDePrueba } from '../prueba/libreria'
import { Indice } from './indice'
import { seleccionarEnRectangulo } from './rectangulo'

const lib = libreriaDePrueba().piezas
// R1 en el origen (caja -4.125..4.125 × -1.125..1.125) y un cable de (4, 0) a (12, 0).
const d = documentoVacio()
d.piezas.r1 = { id: 'r1', tipo: 'resistencia', ref: 'R1', x: 0, y: 0, rot: 0, espejo: false, props: {} }
d.cables.c1 = { id: 'c1', puntos: [{ x: 4, y: 0 }, { x: 12, y: 0 }] }
const ind = new Indice()
ind.reconstruir(d, lib)
const rect = (ax: number, ay: number, bx: number, by: number) => {
  const s = seleccionarEnRectangulo(ind, d, { x: ax, y: ay }, { x: bx, y: by })
  return { piezas: [...s.piezas], cables: [...s.cables] }
}

describe('seleccionarEnRectangulo', () => {
  it('de izquierda a derecha toma solo lo que queda adentro', () => {
    expect(rect(-6, -3, 6, 3)).toEqual({ piezas: ['r1'], cables: [] })
  })

  it('de derecha a izquierda toma lo que toca', () => {
    expect(rect(6, 3, -6, -3)).toEqual({ piezas: ['r1'], cables: ['c1'] })
  })

  it('un rectángulo dentro de la pieza solo la toma cruzando', () => {
    expect(rect(-2, -3, 2, 3)).toEqual({ piezas: [], cables: [] })
    expect(rect(2, 3, -2, -3)).toEqual({ piezas: ['r1'], cables: [] })
  })

  it('un cable entra completo cuando todos sus tramos caben', () => {
    expect(rect(-10, -10, 20, 10)).toEqual({ piezas: ['r1'], cables: ['c1'] })
  })
})

describe('seleccionarEnRectangulo con figuras (decisión 7: el marco no le quita al lienzo su rectángulo)', () => {
  // Un marco de sección de (20, -20) a (60, 20) y una línea corta dentro de él.
  const df = documentoVacio()
  df.figuras = {
    marco: { id: 'marco', tipo: 'rectangulo', x1: 20, y1: -20, x2: 60, y2: 20, orden: 0, relleno: true },
    raya: { id: 'raya', tipo: 'linea', x1: 30, y1: 0, x2: 34, y2: 0, orden: 1 }
  }
  const indf = new Indice()
  indf.reconstruir(df, lib)
  const fig = (ax: number, ay: number, bx: number, by: number) => [...seleccionarEnRectangulo(indf, df, { x: ax, y: ay }, { x: bx, y: by }).figuras].sort()

  it('cruzando dentro del marco toma lo que toca adentro, no el marco', () => {
    expect(fig(40, 10, 28, -10)).toEqual(['raya'])
  })

  it('cruzando sobre su borde sí toma el marco', () => {
    expect(fig(70, 5, 50, -5)).toEqual(['marco'])
  })

  it('de izquierda a derecha el marco entra solo si cabe completo', () => {
    expect(fig(25, -10, 45, 10)).toEqual(['raya'])
    expect(fig(10, -30, 70, 30)).toEqual(['marco', 'raya'])
  })
})

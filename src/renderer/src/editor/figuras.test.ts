import { describe, expect, it } from 'vitest'
import { LIMITE_COORDENADA } from '../doc/limites'
import type { Figura } from '../doc/tipos'
import { a45, alFondo, asasDeFigura, conMedida, cuadrar, cursorDeAsaFigura, figuraDeArrastre, fino, leerMedida, moverAsaFigura } from './figuras'

describe('arrastre de una figura nueva', () => {
  it('fino lleva el puntero al punto entero más cercano de la rejilla fina, sin -0', () => {
    expect(fino({ x: 3.4, y: -0.2 })).toEqual({ x: 3, y: 0 })
    expect(Object.is(fino({ x: -0.2, y: 0 }).x, 0)).toBe(true)
  })

  it('cuadrar: el lado más largo manda y cada eje conserva su sentido', () => {
    expect(cuadrar({ x: 0, y: 0 }, { x: 7, y: 3 })).toEqual({ x: 7, y: 7 })
    expect(cuadrar({ x: 0, y: 0 }, { x: -2, y: 5 })).toEqual({ x: -5, y: 5 })
    expect(cuadrar({ x: 0, y: 0 }, { x: 0, y: -4 })).toEqual({ x: 4, y: -4 })
  })

  it('a45: horizontal, vertical o diagonal exacta, la que esté más cerca del puntero', () => {
    expect(a45({ x: 0, y: 0 }, { x: 10, y: 3 })).toEqual({ x: 10, y: 0 })
    expect(a45({ x: 0, y: 0 }, { x: -2, y: 9 })).toEqual({ x: 0, y: 9 })
    expect(a45({ x: 0, y: 0 }, { x: 8, y: -7 })).toEqual({ x: 8, y: -8 })
  })

  it('el rectángulo y la elipse salen con sus esquinas en orden; la línea y la flecha guardan su sentido', () => {
    expect(figuraDeArrastre('rectangulo', { x: 10, y: 8 }, { x: 2, y: 1 }, false)).toEqual({ id: '', tipo: 'rectangulo', x1: 2, y1: 1, x2: 10, y2: 8, orden: 0 })
    expect(figuraDeArrastre('elipse', { x: 0, y: 0 }, { x: 7, y: 3 }, true)).toMatchObject({ x1: 0, y1: 0, x2: 7, y2: 7 })
    expect(figuraDeArrastre('flecha', { x: 10, y: 8 }, { x: 2, y: 1 }, false)).toMatchObject({ x1: 10, y1: 8, x2: 2, y2: 1 })
    expect(figuraDeArrastre('linea', { x: 0, y: 0 }, { x: 8, y: 7 }, true)).toMatchObject({ x2: 8, y2: 8 })
  })
})

const caja: Figura = { id: 'f', tipo: 'rectangulo', x1: 0, y1: 0, x2: 20, y2: 10, orden: 0 }
const linea: Figura = { id: 'l', tipo: 'linea', x1: 0, y1: 0, x2: 10, y2: 0, orden: 0 }

describe('asas', () => {
  it('ocho en una caja (esquinas y centros de los lados) y dos en una línea, con su cursor', () => {
    expect(asasDeFigura(caja).map((a) => [a.asa, a.x, a.y])).toEqual([
      ['no', 0, 0], ['n', 10, 0], ['ne', 20, 0], ['e', 20, 5], ['se', 20, 10], ['s', 10, 10], ['so', 0, 10], ['o', 0, 5]
    ])
    expect(asasDeFigura(linea).map((a) => a.asa)).toEqual(['p1', 'p2'])
    expect(['no', 'se', 'ne', 'so', 'n', 's', 'e', 'o', 'p1'].map((a) => cursorDeAsaFigura(a as never))).toEqual([
      'nwse-resize', 'nwse-resize', 'nesw-resize', 'nesw-resize', 'ns-resize', 'ns-resize', 'ew-resize', 'ew-resize', 'crosshair'
    ])
  })

  it('un asa de lado mueve solo su borde y no cruza el de enfrente (queda al menos 1.25 mm)', () => {
    expect(moverAsaFigura(caja, 'e', { x: 30, y: 99 }, false)).toEqual({ ...caja, x2: 30 })
    expect(moverAsaFigura(caja, 'n', { x: 99, y: -4 }, false)).toEqual({ ...caja, y1: -4 })
    expect(moverAsaFigura(caja, 'o', { x: 50, y: 0 }, false)).toEqual({ ...caja, x1: 19 })
  })

  it('una esquina mueve sus dos bordes; con Shift conserva la proporción de antes', () => {
    expect(moverAsaFigura(caja, 'se', { x: 30, y: 30 }, false)).toEqual({ ...caja, x2: 30, y2: 30 })
    // 2:1 de antes: el puntero en (40, 12) da 24 × 12. Manda el lado que menos creció: la caja nunca pasa del puntero.
    expect(moverAsaFigura(caja, 'se', { x: 40, y: 12 }, true)).toEqual({ ...caja, x2: 24, y2: 12 })
    expect(moverAsaFigura(caja, 'no', { x: -10, y: -1 }, true)).toEqual({ ...caja, x1: -2, y1: -1 })
  })

  it('el extremo de una línea va al puntero (Shift: a 45° del otro) y no puede caer sobre el otro', () => {
    expect(moverAsaFigura(linea, 'p2', { x: 6, y: 7 }, false)).toEqual({ ...linea, x2: 6, y2: 7 })
    expect(moverAsaFigura(linea, 'p2', { x: 6, y: 7 }, true)).toEqual({ ...linea, x2: 7, y2: 7 })
    expect(moverAsaFigura(linea, 'p1', { x: 10, y: 0 }, false)).toBeNull()
  })
})

describe('medidas y orden', () => {
  it('leerMedida acepta mm con punto decimal y redondea a la rejilla fina', () => {
    expect(leerMedida('20')).toEqual({ unidades: 16 })
    expect(leerMedida(' 12.5 mm ')).toEqual({ unidades: 10 })
    expect(leerMedida('19.5 mm')).toEqual({ unidades: 16 })
    expect(leerMedida('0.5')).toEqual({ error: 'La medida mínima es 1.25 mm.' })
    expect(leerMedida('3000')).toEqual({ error: 'La medida máxima es 2000 mm.' })
    expect(leerMedida('12,5')).toEqual({ error: 'Escribe la medida en mm con punto decimal, como 20 o 12.5.' })
  })

  it('conMedida cambia el ancho o el alto con la esquina de arriba a la izquierda fija', () => {
    expect(conMedida(caja, 'ancho', 8)).toEqual({ ...caja, x2: 8 })
    expect(conMedida(caja, 'alto', 3)).toEqual({ ...caja, y2: 3 })
    expect(conMedida(caja, 'ancho', 20)).toBe(caja)
  })

  it('alFondo pone las elegidas detrás de las demás en el orden que tenían; si ya estaban, nada', () => {
    const fs: Figura[] = [{ ...caja, id: 'a', orden: 0 }, { ...caja, id: 'b', orden: 1 }, { ...caja, id: 'c', orden: 2 }]
    expect(alFondo(fs, new Set(['c', 'b']))).toEqual([{ ...caja, id: 'b', orden: -2 }, { ...caja, id: 'c', orden: -1 }])
    expect(alFondo(fs, new Set(['a']))).toEqual([])
    expect(alFondo(fs, new Set(['x']))).toEqual([])
  })
})

describe('al fondo sin pasar del límite', () => {
  it('cerca del límite de abajo, renumera todas desde 0: las elegidas primero', () => {
    const f = (id: string, orden: number): Figura => ({ id, tipo: 'linea', x1: 0, y1: 0, x2: 4, y2: 0, orden })
    const fs = [f('a', -LIMITE_COORDENADA), f('b', 0), f('c', 5)]
    expect(alFondo(fs, new Set(['c']))).toEqual([f('c', 0), f('a', 1), f('b', 2)])
  })
})

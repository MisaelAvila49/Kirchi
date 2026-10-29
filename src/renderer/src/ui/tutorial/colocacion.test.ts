import { describe, expect, it } from 'vitest'
import { colocarGlobo, rectDeFoco } from './colocacion'

const ventana = { w: 1440, h: 800 }
const globo = { w: 292, h: 140 }

describe('colocarGlobo', () => {
  it('se aparta de una zona que no debe tapar (el editor de valores abierto bajo el objetivo)', () => {
    const o = { x: 300, y: 200, w: 100, h: 60 }
    const editor = { x: 280, y: 270, w: 220, h: 120 }
    const s = colocarGlobo({ objetivo: o, globo, ventana, evitar: [editor] })
    expect(s.lado).toBe('arriba')
    expect(s.y).toBe(200 - 12 - 140)
    // Sin estorbo se queda debajo.
    expect(colocarGlobo({ objetivo: o, globo, ventana }).lado).toBe('abajo')
  })

  it('pone el globo debajo del objetivo, alineado a su borde, con la flecha en su centro', () => {
    const s = colocarGlobo({ objetivo: { x: 300, y: 200, w: 100, h: 60 }, globo, ventana })
    expect(s.lado).toBe('abajo')
    expect(s.y).toBe(200 + 60 + 12)
    expect(s.x).toBe(300)
    expect(s.flecha).toBe(50)
  })

  it('si debajo no cabe, lo pone arriba', () => {
    const s = colocarGlobo({ objetivo: { x: 300, y: 700, w: 100, h: 60 }, globo, ventana })
    expect(s.lado).toBe('arriba')
    expect(s.y).toBe(700 - 12 - 140)
  })

  it('si ni arriba ni abajo caben, lo pone a la derecha y luego a la izquierda', () => {
    const alto = { w: 1440, h: 150 }
    const d = colocarGlobo({ objetivo: { x: 100, y: 40, w: 80, h: 70 }, globo, ventana: alto })
    expect(d.lado).toBe('derecha')
    expect(d.x).toBe(100 + 80 + 12)
    const i = colocarGlobo({ objetivo: { x: 1300, y: 40, w: 80, h: 70 }, globo, ventana: alto })
    expect(i.lado).toBe('izquierda')
    expect(i.x).toBe(1300 - 12 - 292)
  })

  it('el lado preferido del paso se intenta primero y, si no cabe, se vuelve al orden de siempre', () => {
    const o = { x: 300, y: 200, w: 100, h: 60 }
    expect(colocarGlobo({ objetivo: o, globo, ventana, preferido: 'derecha' })).toMatchObject({ lado: 'derecha', x: 300 + 100 + 12 })
    expect(colocarGlobo({ objetivo: o, globo, ventana, preferido: 'arriba' })).toMatchObject({ lado: 'arriba', y: 200 - 12 - 140 })
    // A la izquierda no cabe (el objetivo está pegado al borde): cae en abajo.
    expect(colocarGlobo({ objetivo: { x: 20, y: 200, w: 100, h: 60 }, globo, ventana, preferido: 'izquierda' }).lado).toBe('abajo')
  })

  it('nunca se sale de la ventana por los lados', () => {
    const der = colocarGlobo({ objetivo: { x: 1380, y: 100, w: 50, h: 30 }, globo, ventana })
    expect(der.x + globo.w).toBeLessThanOrEqual(ventana.w - 12)
    expect(der.flecha).toBeGreaterThanOrEqual(18)
    expect(der.flecha).toBeLessThanOrEqual(globo.w - 18)
    const izq = colocarGlobo({ objetivo: { x: 2, y: 100, w: 20, h: 30 }, globo, ventana })
    expect(izq.x).toBeGreaterThanOrEqual(12)
  })

  it('sin objetivo, o sin lado que quepa, queda abajo a la izquierda', () => {
    expect(colocarGlobo({ objetivo: null, globo, ventana })).toEqual({ x: 12, y: 800 - 140 - 12, lado: 'centro', flecha: 0 })
    const chica = { w: 300, h: 160 }
    expect(colocarGlobo({ objetivo: { x: 20, y: 20, w: 260, h: 120 }, globo, ventana: chica }).lado).toBe('centro')
  })

  it('en una ventana chica el globo se acota y sigue entero a la vista', () => {
    const s = colocarGlobo({ objetivo: null, globo, ventana: { w: 280, h: 120 } })
    expect(s.x).toBe(12)
    expect(s.y).toBe(12)
  })
})

describe('rectDeFoco', () => {
  it('agrega aire y se acota a la ventana', () => {
    expect(rectDeFoco({ x: 100, y: 50, w: 40, h: 20 }, 4, ventana)).toEqual({ x: 96, y: 46, w: 48, h: 28 })
    expect(rectDeFoco({ x: 0, y: 0, w: 40, h: 20 }, 4, ventana)).toEqual({ x: 0, y: 0, w: 44, h: 24 })
    expect(rectDeFoco({ x: 1430, y: 790, w: 40, h: 20 }, 4, ventana)).toEqual({ x: 1426, y: 786, w: 14, h: 14 })
  })
})

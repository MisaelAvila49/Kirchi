import { describe, expect, it } from 'vitest'
import type { LadoEjeY, PosicionEjeX } from '../../../../compartido/grafica/aspecto'
import { anchoDeColumna, colocar, zonaColocada, type EntradaColocacion } from './colocacion'

const base = (lados: LadoEjeY[], ejeX: PosicionEjeX = 'abajo', dpr = 1): EntradaColocacion => ({
  W: 1000 * dpr, H: 400 * dpr, dpr, lados, ejeX, columna: 40, inicioIzq: 4, aireIzq: 20, aireDer: 22, banda: 40, arribaLibre: 24, abajoLibre: 8
})

describe('colocación de los ejes', () => {
  it('con todos a la izquierda reserva una columna por eje, como la pantalla A1', () => {
    const c = colocar(base(['izquierda', 'izquierda'], 'arriba'))
    expect(c.columnas.map((k) => [k.x0, k.x1])).toEqual([[4, 44], [44, 84]])
    expect(c.x).toBe(20 + 80)
    expect(c.y).toBe(40)
    expect(c.w).toBe(1000 - c.x - 22)
    expect(c.h).toBe(400 - 40 - 8)
    expect(c.eje).toMatchObject({ y0: 0, y1: 40, linea: 40 })
  })

  it('un eje a la derecha va después de la retícula y le quita ancho', () => {
    const c = colocar(base(['izquierda', 'derecha']))
    const der = c.columnas[1]
    expect(der.x0).toBe(c.x + c.w + 22)
    expect(der.linea).toBe(c.x + c.w)
    expect(c.w).toBe(1000 - c.x - 22 - 40)
  })

  it('un eje en medio no reserva ancho y su línea cae sobre el centro de la retícula', () => {
    const solo = colocar(base(['centro']))
    const sin = colocar(base([]))
    expect(solo.w).toBe(sin.w)
    expect(solo.x).toBe(sin.x)
    expect(solo.columnas[0].linea).toBeCloseTo(solo.x + solo.w / 2, 6)
  })

  it('dos ejes en medio quedan uno junto al otro, el último sobre el centro', () => {
    const c = colocar(base(['centro', 'centro']))
    expect(c.columnas[1].linea - c.columnas[0].linea).toBe(40)
    expect(c.columnas[1].linea).toBeCloseTo(c.x + c.w / 2, 6)
  })

  it('el eje del tiempo arriba, abajo o en medio cambia la banda y la altura de su línea', () => {
    const arriba = colocar(base(['izquierda'], 'arriba'))
    const abajo = colocar(base(['izquierda'], 'abajo'))
    const medio = colocar(base(['izquierda'], 'centro'))
    expect(arriba.y).toBe(40)
    expect(arriba.eje.linea).toBe(arriba.y)
    expect(abajo.y).toBe(24)
    expect(abajo.eje.y0).toBe(abajo.y + abajo.h)
    expect(abajo.eje.y1).toBe(400)
    expect(medio.y).toBe(24)
    expect(medio.h).toBe(400 - 24 - 8)
    expect(medio.eje.linea).toBeCloseTo(medio.y + medio.h / 2, 6)
  })

  it('con dpr 2 todo mide el doble', () => {
    const a = colocar(base(['izquierda', 'derecha'], 'abajo', 1))
    const b = colocar(base(['izquierda', 'derecha'], 'abajo', 2))
    for (const k of ['x', 'y', 'w', 'h'] as const) expect(b[k]).toBe(2 * a[k])
  })

  it('el espacio extra a la izquierda (marcas de 0 V apiladas) empuja la retícula', () => {
    const a = colocar(base(['izquierda']))
    const b = colocar({ ...base(['izquierda']), extraIzq: 16 })
    expect(b.x - a.x).toBe(16)
  })

  it('sabe qué hay bajo un punto', () => {
    const c = colocar(base(['izquierda', 'derecha']))
    expect(zonaColocada(c, c.columnas[0].x0 + 5, 100)).toEqual({ tipo: 'columna', i: 0 })
    expect(zonaColocada(c, c.columnas[1].x0 + 5, 100)).toEqual({ tipo: 'columna', i: 1 })
    expect(zonaColocada(c, c.x + c.w / 2, c.eje.y0 + 5)).toEqual({ tipo: 'ejeX' })
    expect(zonaColocada(c, c.x + c.w / 2, c.y + 50)).toEqual({ tipo: 'reticula' })
    expect(zonaColocada(c, 2, 2)).toBeNull()
  })
})

describe('ancho de columna por texto', () => {
  it('«2000.0000» pide más que «2000» y el ancho sigue al tamaño de la letra', () => {
    expect(anchoDeColumna(['2000.0000', 'B mV'], 11)).toBeGreaterThan(anchoDeColumna(['2000', 'B mV'], 11))
    expect(anchoDeColumna(['2000'], 18)).toBeGreaterThan(anchoDeColumna(['2000'], 11))
    expect(anchoDeColumna(['0'], 11)).toBe(Math.ceil(0.6 * 11) + 12)
  })
  it('cada columna mide la suya, a la izquierda y a la derecha, y la retícula gana lo que sobra', () => {
    const ancho = colocar({ ...base(['izquierda', 'derecha']), anchos: [90, 60] })
    const angosto = colocar({ ...base(['izquierda', 'derecha']), anchos: [40, 40] })
    expect(ancho.columnas[0]).toMatchObject({ x0: 4, x1: 94 })
    expect(ancho.columnas[1].x1 - ancho.columnas[1].x0).toBe(60)
    expect(ancho.x).toBe(20 + 90)
    expect(ancho.columnas[1].x1).toBeLessThanOrEqual(1000)
    expect(angosto.w).toBeGreaterThan(ancho.w)
    expect(angosto.w - ancho.w).toBe(50 + 20)
  })
})

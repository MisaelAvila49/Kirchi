// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { libreriaDePrueba } from '../prueba/libreria'
import { acotar, grosorIcono, ICONO_ALTO, ICONO_ANCHO, posicionBuscador, TRAZO_MIN_PX, TRAZO_UNIDADES, vistaPrevia } from './buscadorUtil'

const lib = libreriaDePrueba().piezas

describe('vistaPrevia', () => {
  it('la resistencia es una polilínea en una caja con margen de 1', () => {
    const v = vistaPrevia(lib.get('resistencia')!.geometria)
    expect(v.viewBox).toBe('-5 -2 10 4')
    expect(v.lineas).toHaveLength(1)
    expect(v.lineas[0].startsWith('-4,0 -2.5,0 ')).toBe(true)
    expect(v.triangulos).toEqual([])
  })

  it('el diodo trae su triángulo relleno', () => {
    const v = vistaPrevia(lib.get('diodo')!.geometria)
    expect(v.triangulos).toHaveLength(1)
    expect(new Set(v.triangulos[0].split(' '))).toEqual(new Set(['-1,-1.2', '-1,1.2', '1,0']))
  })
})

describe('posicionBuscador', () => {
  it('va a la derecha del punto, o a la izquierda si no cabe, y nunca lo tapa', () => {
    const a = posicionBuscador(100, 300, 1920, 1080)
    expect(a.left).toBe(124)
    expect(a.top).toBeCloseTo(300 - 340 / 3, 9)
    const b = posicionBuscador(1800, 300, 1920, 1080)
    expect(b.left).toBe(1256)
    expect(b.left + 520).toBeLessThan(1800)
    expect(posicionBuscador(20, 20, 1920, 1080).top).toBe(8)
  })
})

describe('acotar', () => {
  it('limita a [min, max] y, si no cabe, deja el borde mínimo', () => {
    expect(acotar(5, 8, 100)).toBe(8)
    expect(acotar(50, 8, 100)).toBe(50)
    expect(acotar(500, 8, 100)).toBe(100)
    expect(acotar(50, 8, -20)).toBe(8)
  })
})

describe('grosorIcono', () => {
  const pxDeTrazo = (id: string) => {
    const v = vistaPrevia(lib.get(id)!.geometria)
    const [, , w, h] = v.viewBox.split(' ').map(Number)
    return grosorIcono(v.viewBox) * Math.min(ICONO_ANCHO / w, ICONO_ALTO / h)
  }

  it('todos los símbolos, también los altos (7 segmentos, MOSFET), dibujan un trazo de al menos 0.9 px en el icono', () => {
    for (const id of lib.keys()) expect(pxDeTrazo(id), id).toBeGreaterThanOrEqual(TRAZO_MIN_PX - 1e-9)
  })

  it('un símbolo alto lleva un trazo más grueso (en unidades) que uno ancho, y nunca menos que el de siempre', () => {
    const g = (id: string) => grosorIcono(vistaPrevia(lib.get(id)!.geometria).viewBox)
    expect(g('display-7seg')).toBeGreaterThan(g('resistencia'))
    expect(g('resistencia')).toBeGreaterThanOrEqual(TRAZO_UNIDADES)
  })

  it('el display se llama «Display 7 segmentos» para no envolver en la lista de 188 px', () => {
    expect(lib.get('display-7seg')!.nombre.es).toBe('Display 7 segmentos')
  })
})

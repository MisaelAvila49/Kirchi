// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import type { Pieza } from '../doc/tipos'
import { cuerpoEnMundo } from '../editor/colision'
import { libreriaDePrueba } from '../prueba/libreria'
import { cajaTexto } from './apartar'
import { textosLocales } from './etiquetas'
import { centroDeTexto, LUGARES_TEXTO, lugarMasCercano, posicionLibre, posicionManual, textosManuales } from './textosManuales'

/** Referencia, valor y voltaje de un terminal se arrastran a uno de ocho lugares o libres con Alt. El lugar se guarda en
 * el marco del símbolo: gira y se refleja con la pieza y el texto siempre se lee derecho. */

const lib = libreriaDePrueba().piezas
const R = (extra: Partial<Pieza> = {}): Pieza => ({ id: 'r', tipo: 'resistencia', ref: 'R1', x: 10, y: 20, rot: 0, espejo: false, props: { valor: '1k' }, ...extra })
const def = lib.get('resistencia')!
const manuales = (p: Pieza) => textosManuales(p, def, textosLocales(p, def))
/** El lado del cuerpo en que queda la caja del texto: -1, 0 o 1 en cada eje. */
function lado(p: Pieza, i: number): [number, number] {
  const c = cuerpoEnMundo(p, def)
  const t = cajaTexto(manuales(p).get(i)!, 0)
  const sx = t.minX >= c.maxX ? 1 : t.maxX <= c.minX ? -1 : 0
  const sy = t.minY >= c.maxY ? 1 : t.maxY <= c.minY ? -1 : 0
  return [sx, sy]
}

describe('ocho lugares alrededor del cuerpo', () => {
  it('son arriba, abajo, los lados y las esquinas; cada uno deja el texto fuera del cuerpo, de su lado', () => {
    expect(LUGARES_TEXTO).toHaveLength(8)
    const esperado: Record<string, [number, number]> = {
      arriba: [0, -1], 'arriba-derecha': [1, -1], derecha: [1, 0], 'abajo-derecha': [1, 1], abajo: [0, 1], 'abajo-izquierda': [-1, 1], izquierda: [-1, 0], 'arriba-izquierda': [-1, -1]
    }
    for (const lugar of LUGARES_TEXTO) expect(lado(R({ textos: { ref: { lugar } } }), 0), lugar).toEqual(esperado[lugar])
  })

  it('los dos textos en el mismo lugar se apilan: la referencia sobre el valor, sin encimarse', () => {
    for (const lugar of LUGARES_TEXTO) {
      const m = manuales(R({ textos: { ref: { lugar }, valor: { lugar } } }))
      const [a, b] = [m.get(0)!, m.get(1)!]
      expect(a.y, lugar).toBeLessThan(b.y)
      const ca = cajaTexto(a, 0), cb = cajaTexto(b, 0)
      expect(ca.maxY <= cb.minY + 1e-9, lugar).toBe(true)
    }
  })

  it('sin posición a mano no da nada: ese texto lo coloca el reparto automático', () => {
    expect(manuales(R()).size).toBe(0)
    expect([...manuales(R({ textos: { valor: { lugar: 'derecha' } } })).keys()]).toEqual([1])
  })
})

describe('girar y reflejar la pieza conserva el lugar elegido', () => {
  it('el lugar va en el marco del símbolo: arriba de una resistencia acostada queda a un lado al girarla 90°', () => {
    expect(lado(R({ textos: { ref: { lugar: 'arriba' } } }), 0)).toEqual([0, -1])
    expect(lado(R({ rot: 90, textos: { ref: { lugar: 'arriba' } } }), 0)).toEqual([1, 0])
    expect(lado(R({ rot: 180, textos: { ref: { lugar: 'arriba' } } }), 0)).toEqual([0, 1])
    expect(lado(R({ rot: 270, textos: { ref: { lugar: 'arriba' } } }), 0)).toEqual([-1, 0])
  })

  it('reflejar cambia el lado de una esquina como cambia el dibujo; el texto sigue derecho (alineado según su lado)', () => {
    expect(lado(R({ textos: { ref: { lugar: 'arriba-derecha' } } }), 0)).toEqual([1, -1])
    expect(lado(R({ espejo: true, textos: { ref: { lugar: 'arriba-derecha' } } }), 0)).toEqual([-1, -1])
    expect(manuales(R({ textos: { ref: { lugar: 'derecha' } } })).get(0)!.alinear).toBe('izq')
    expect(manuales(R({ espejo: true, textos: { ref: { lugar: 'derecha' } } })).get(0)!.alinear).toBe('der')
  })

  it('una posición libre (Alt) es el centro del texto en el símbolo: gira con la pieza', () => {
    const p = R({ textos: { ref: { x: 3, y: -4 } } })
    expect(centroDeTexto(manuales(p).get(0)!)).toEqual({ x: 13, y: 16 })
    const g = R({ rot: 90, textos: { ref: { x: 3, y: -4 } } })
    expect(centroDeTexto(manuales(g).get(0)!)).toEqual({ x: 14, y: 23 })
  })
})

describe('arrastrar: el lugar más cercano y la posición libre', () => {
  it('el lugar más cercano al centro del texto arrastrado, en una pieza girada también', () => {
    const p = R()
    const c = cuerpoEnMundo(p, def)
    expect(lugarMasCercano(p, def, 'R1', { x: (c.minX + c.maxX) / 2, y: c.minY - 5 })).toBe('arriba')
    expect(lugarMasCercano(p, def, 'R1', { x: c.maxX + 5, y: c.maxY + 5 })).toBe('abajo-derecha')
    const g = R({ rot: 90 })
    const cg = cuerpoEnMundo(g, def)
    // Girada 90°, el lado derecho del mundo es el «arriba» del símbolo.
    expect(lugarMasCercano(g, def, 'R1', { x: cg.maxX + 5, y: (cg.minY + cg.maxY) / 2 })).toBe('arriba')
  })

  it('la posición libre se guarda en el símbolo con dos decimales y con tope', () => {
    expect(posicionLibre(R(), { x: 13.456, y: 16.004 })).toEqual({ x: 3.46, y: -4 })
    expect(posicionLibre(R({ rot: 90 }), { x: 14, y: 23 })).toEqual({ x: 3, y: -4 })
    expect(posicionLibre(R(), { x: 1e6, y: -1e6 })).toEqual({ x: 100, y: -100 })
  })
})

describe('posicionManual: lo que trae el documento se lee con cuidado', () => {
  it('solo llaves propias, lugares conocidos y coordenadas finitas dentro del tope', () => {
    expect(posicionManual(R({ textos: { ref: { lugar: 'abajo' } } }), 'ref')).toEqual({ lugar: 'abajo' })
    expect(posicionManual(R(), 'ref')).toBeNull()
    expect(posicionManual(R({ textos: { ref: { lugar: 'centro' } } } as unknown as Partial<Pieza>), 'ref')).toBeNull()
    expect(posicionManual(R({ textos: { ref: { x: Number.NaN, y: 0 } } }), 'ref')).toBeNull()
    expect(posicionManual(R({ textos: { ref: { x: 101, y: 0 } } }), 'ref')).toBeNull()
    const heredado = Object.create({ ref: { lugar: 'abajo' } })
    expect(posicionManual(R({ textos: heredado }), 'ref')).toBeNull()
  })
})

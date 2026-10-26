// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { calcularConexiones } from '../conexiones/conexiones'
import type { Documento } from '../doc/tipos'
import { libreriaDePrueba } from '../prueba/libreria'
import { fuenteDeEntrada, fuentesDeInstrumento } from './entradas'

const lib = libreriaDePrueba().piezas
const pieza = (id: string, tipo: string, ref: string, x: number, y: number, props: Record<string, string> = {}) => ({ id, tipo, ref, x, y, rot: 0 as const, espejo: false, props })

describe('de dónde mide una entrada', () => {
  // R1 de (−4,0) a (4,0) y SW1; la entrada A de XSC1 (en 72,−6) cableada al pin 2 de R1 y B a una tierra.
  const doc: Documento = {
    piezas: {
      r: pieza('r', 'resistencia', 'R1', 0, 0, { valor: '1k' }),
      s: pieza('s', 'resistencia', 'R10', 20, 20, { valor: '1k' }),
      o: pieza('o', 'osciloscopio', 'XSC1', 80, 0),
      g: pieza('g', 'tierra', 'GND1', 72, 20),
      m: pieza('m', 'multimetro', 'XMM1', 40, 40)
    },
    cables: {
      c: { id: 'c', puntos: [{ x: 4, y: 0 }, { x: 60, y: 0 }, { x: 60, y: -6 }, { x: 72, y: -6 }] },
      c2: { id: 'c2', puntos: [{ x: 16, y: 20 }, { x: 16, y: 0 }] },
      d: { id: 'd', puntos: [{ x: 72, y: -2 }, { x: 66, y: -2 }, { x: 66, y: 20 }, { x: 72, y: 20 }] }
    },
    etiquetas: { e: { id: 'e', nombre: 'VIN', x: 40, y: 34, rot: 0 } },
    notas: {}
  }
  const con = calcularConexiones(doc, lib)

  it('dice el primer pin ajeno de la red en orden natural', () => {
    // La red de A tiene R1:2, R10:1 y la entrada A: R1 va antes que R10.
    expect(fuenteDeEntrada(doc, con, 'o', 'A')).toBe('R1:2')
  })

  it('dice GND en la tierra, el nombre en una red con nombre y null suelta', () => {
    expect(fuenteDeEntrada(doc, con, 'o', 'B')).toBe('GND')
    expect(fuenteDeEntrada(doc, con, 'm', '+')).toBe('VIN')
    expect(fuenteDeEntrada(doc, con, 'o', 'C')).toBeNull()
  })

  it('da las entradas de cada instrumento', () => {
    expect(fuentesDeInstrumento(doc, lib, con, 'o')).toEqual({ A: 'R1:2', B: 'GND', C: null, D: null })
    expect(fuentesDeInstrumento(doc, lib, con, 'm')).toEqual({ '+': 'VIN', COM: null })
    expect(fuentesDeInstrumento(doc, lib, con, 'r')).toEqual({})
  })
})

// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { calcularConexiones } from '../conexiones/conexiones'
import { documentoVacio, type Documento, type Pieza, type Sonda } from '../doc/tipos'
import { libreriaDePrueba } from '../prueba/libreria'
import { etiquetasHermanas, globoDeSonda, nombreLargoDeSonda, pinesQueMide, textosInspectorDeSonda } from './textosSonda'

const lib = libreriaDePrueba().piezas
const pieza = (id: string, tipo: string, ref: string, x: number, y: number): Pieza => ({ id, tipo, ref, x, y, rot: 0, espejo: false, props: {} })
/** R1 (pines −4,0 y 4,0) y R2 (16,0 y 24,0) unidos por un cable, y el osciloscopio XSC1. */
const circuito = (sondas: Record<string, Sonda>): Documento => ({
  ...documentoVacio(),
  piezas: { r: pieza('r', 'resistencia', 'R1', 0, 0), r2: pieza('r2', 'resistencia', 'R2', 20, 0), o: pieza('o', 'osciloscopio', 'XSC1', 80, 0) },
  cables: { c: { id: 'c', puntos: [{ x: 4, y: 0 }, { x: 16, y: 0 }] } },
  sondas
})

describe('lo que se dice de una sonda', () => {
  it('su nombre largo', () => {
    const d = circuito({})
    expect(nombreLargoDeSonda(d, { id: 's', tipo: 'osciloscopio', x: 0, y: 0, instrumento: 'o', entrada: 'A' })).toBe('Sonda A de XSC1')
    expect(nombreLargoDeSonda(d, { id: 's', tipo: 'voltaje', x: 0, y: 0 })).toBe('Sonda de voltaje')
    expect(nombreLargoDeSonda(d, { id: 's', tipo: 'corriente', x: 0, y: 0, sentido: 'abajo' })).toBe('Sonda de corriente hacia abajo')
  })

  it('los pines que mide, sin los del propio instrumento', () => {
    const d = circuito({ s: { id: 's', tipo: 'osciloscopio', x: 10, y: 0, instrumento: 'o', entrada: 'A' } })
    expect(pinesQueMide(d, calcularConexiones(d, lib), d.sondas!.s)).toEqual(['R1:2', 'R2:1'])
  })

  it('el globo dice qué mide y cómo se mueve', () => {
    const d = circuito({ s: { id: 's', tipo: 'osciloscopio', x: 10, y: 0, instrumento: 'o', entrada: 'A' }, v: { id: 'v', tipo: 'voltaje', x: 300, y: 0 } })
    const con = calcularConexiones(d, lib)
    expect(globoDeSonda(d, con, 's')).toBe('Sonda A de XSC1 · Mide la red de R1:2 y R2:1. Arrástrala por la red; Supr la quita.')
    expect(globoDeSonda(d, con, 'v')).toBe('Sonda de voltaje · No toca ningún cable ni pin: arrástrala a uno.')
    expect(globoDeSonda(d, con, 'nada')).toBeNull()
  })
})

describe('las etiquetas hermanas (B1)', () => {
  const d = (): Documento => ({
    ...documentoVacio(),
    piezas: { r: pieza('r', 'resistencia', 'R1', 0, 0), o: pieza('o', 'osciloscopio', 'XSC1', 80, 0) },
    cables: { c: { id: 'c', puntos: [{ x: 4, y: 0 }, { x: 16, y: 0 }] } },
    etiquetas: {
      a: { id: 'a', nombre: 'VIN', x: 16, y: 0, rot: 0 },
      b: { id: 'b', nombre: 'VIN', x: 72, y: -6, rot: 0 },
      s: { id: 's', nombre: 'SOLA', x: 40, y: 40, rot: 0 }
    }
  })
  it('encuentra las etiquetas hermanas por nombre', () => {
    const doc = d()
    expect(etiquetasHermanas(doc, 'a')).toEqual(['b'])
  })
})

describe('el inspector de una sonda y el de un medidor', () => {
  it('el medidor no repite la fila «Mide» y se quita como medidor', () => {
    expect(textosInspectorDeSonda(true)).toEqual({ mostrarMide: false, quitar: 'Quitar el medidor' })
    expect(textosInspectorDeSonda(false)).toEqual({ mostrarMide: true, quitar: 'Quitar la sonda' })
  })
})

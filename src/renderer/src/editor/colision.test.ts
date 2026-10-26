// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { documentoVacio, type Documento, type Pieza, type Rotacion } from '../doc/tipos'
import { libreriaDePrueba } from '../prueba/libreria'
import { colisiona, cuerpoEnMundo, cuerpoLocal, choqueDeGrupo, lugarLibre, SEPARACION } from './colision'
import { Indice } from './indice'

const lib = libreriaDePrueba().piezas
const R = (id: string, x: number, y: number, rot: Rotacion = 0): Pieza => ({ id, tipo: 'resistencia', ref: id.toUpperCase(), x, y, rot, espejo: false, props: {} })
const pieza = (tipo: string, id: string, x: number, y: number): Pieza => ({ id, tipo, ref: id.toUpperCase(), x, y, rot: 0, espejo: false, props: {} })
function con(...ps: Pieza[]): Documento {
  const d = documentoVacio()
  for (const p of ps) d.piezas[p.id] = p
  return d
}
const cerca = (a: { minX: number; minY: number; maxX: number; maxY: number }, b: typeof a) => {
  for (const k of ['minX', 'minY', 'maxX', 'maxY'] as const) expect(a[k], k).toBeCloseTo(b[k], 9)
}

describe('cuerpo de una pieza', () => {
  it('la resistencia excluye sus patas: x de -2.5 a 2.5, y de -1 a 1 (las patas llegan a ±4)', () => {
    cerca(cuerpoLocal(lib.get('resistencia')!), { minX: -2.5, minY: -1, maxX: 2.5, maxY: 1 })
    expect(lib.get('resistencia')!.geometria.caja).toMatchObject({ minX: -4, maxX: 4 })
  })

  it('gira con la pieza', () => {
    cerca(cuerpoEnMundo(R('a', 10, 0, 90), lib.get('resistencia')!), { minX: 9, minY: -2.5, maxX: 11, maxY: 2.5 })
  })

  it('capacitor, tierra y batería quitan solo los puntos de pin', () => {
    cerca(cuerpoLocal(lib.get('capacitor')!), { minX: -0.5, minY: -1.6, maxX: 0.5, maxY: 1.6 })
    cerca(cuerpoLocal(lib.get('tierra')!), { minX: -1.4, minY: 1, maxX: 1.4, maxY: 2.2 })
    const b = cuerpoLocal(lib.get('bateria')!)
    expect(b.minY).toBeCloseTo(-3, 9)
    expect(b.maxY).toBeCloseTo(1.2, 9)
  })

  it('la separación es de 1 unidad por lado (2.5 mm entre cuerpos)', () => {
    expect(SEPARACION).toBe(1)
  })
})

describe('colisiona', () => {
  const d = con(R('r1', 0, 0))

  it('dos resistencias lado a lado con los pines tocándose no chocan (R2 en (8, 0))', () => {
    // cuerpos −2.5..2.5 y 5.5..10.5: 3 unidades de hueco ≥ 2.
    expect(colisiona(d, lib, R('r2', 8, 0))).toBeNull()
  })

  it('cuerpos encimados chocan (R2 en (4, 0))', () => {
    expect(colisiona(d, lib, R('r2', 4, 0))).toBe('r1')
  })

  it('demasiado cerca en vertical choca (R2 en (0, 3): hueco de 1 unidad)', () => {
    expect(colisiona(d, lib, R('r2', 0, 3))).toBe('r1')
  })

  it('a 2 unidades exactas (R2 en (0, 4)) y más lejos (0, 6) no chocan', () => {
    expect(colisiona(d, lib, R('r2', 0, 4))).toBeNull()
    expect(colisiona(d, lib, R('r2', 0, 6))).toBeNull()
  })

  it('la misma pieza o las ignoradas no cuentan', () => {
    expect(colisiona(d, lib, R('r1', 0, 0))).toBeNull()
    expect(colisiona(d, lib, R('r2', 0, 0), new Set(['r1']))).toBeNull()
  })

  it('con el índice espacial da lo mismo que recorriendo el documento', () => {
    const doc = con(R('r1', 0, 0), R('r3', 40, 0), pieza('capacitor', 'c1', 20, 20))
    const ind = new Indice()
    ind.reconstruir(doc, lib)
    for (const [x, y] of [[4, 0], [8, 0], [0, 3], [0, 6], [40, 2], [20, 22], [20, 26], [36, 0]] as const) {
      const cand = R('n', x, y)
      expect(colisiona(doc, lib, cand, undefined, ind), `${x},${y}`).toBe(colisiona(doc, lib, cand))
    }
  })

  it('una tierra bajo el pin de una resistencia vertical no choca', () => {
    // Resistencia vertical: cuerpo y −2.5..2.5, pin inferior en (0, 4); la tierra en ese pin tiene cuerpo y 5..6.2.
    expect(colisiona(con(R('r1', 0, 0, 90)), lib, pieza('tierra', 'g', 0, 4))).toBeNull()
  })
})

describe('choqueDeGrupo y lugarLibre', () => {
  it('choqueDeGrupo da la primera pieza del grupo que choca y contra cuál', () => {
    const d = con(R('r1', 0, 0), R('r2', 20, 0))
    expect(choqueDeGrupo(d, lib, [R('x', 40, 0), R('y', 20, 2)], new Set())).toEqual({ pieza: 'y', con: 'r2' })
    expect(choqueDeGrupo(d, lib, [R('x', 40, 0)], new Set())).toBeNull()
  })

  it('lugarLibre avanza 2 unidades en diagonal hasta encontrar hueco', () => {
    const d = con(R('r1', 0, 0))
    expect(lugarLibre(d, lib, [R('x', 0, 0)], { x: 2, y: 2 })).toEqual({ en: { x: 4, y: 4 }, libre: true })
    expect(lugarLibre(d, lib, [R('x', 0, 0)], { x: 40, y: 0 })).toEqual({ en: { x: 40, y: 0 }, libre: true })
  })

  it('lugarLibre se rinde tras 20 intentos y devuelve el último', () => {
    // Una fila diagonal de resistencias que tapa cada intento.
    const ps: Pieza[] = []
    for (let k = 0; k <= 22; k++) ps.push(R(`r${k}`, 2 * k, 2 * k))
    const r = lugarLibre(con(...ps), lib, [R('x', 0, 0)], { x: 0, y: 0 })
    expect(r).toEqual({ en: { x: 40, y: 40 }, libre: false })
  })
})

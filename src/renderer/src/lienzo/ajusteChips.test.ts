// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { calcularConexiones, clavePin } from '../conexiones/conexiones'
import { divisor } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import type { Lectura } from '../sim/lectura'
import { acotarAlAlcance, cajaChip, cajaConChips, chipEn, claveDeRedChip, DESPLAZO_MAX_CHIP, desplazoTrasArrastre, limitarDesplazo, MARGEN_HOVER_CHIP, redDeGolpe, redesConChip, redLlevaChip } from './ajusteChips'
import { chipsDeVoltaje } from './chips'

import { documentoVacio } from '../doc/tipos'
const lib = libreriaDePrueba().piezas
const d = divisor()
const con = calcularConexiones(d, lib)
const alta = con.redDePin.get(clavePin('p_v1', '+'))!
const medio = con.redDePin.get(clavePin('p_r1', '2'))!
const lectura = (redes: [number, number][]): Lectura => ({ t: 0, ratio: 1, redes: new Map(redes), piezas: new Map() })

describe('desplazo de un chip', () => {
  it('se sanea: lo que no es número vale cero y lo absurdo se recorta', () => {
    expect(limitarDesplazo(1, -2)).toEqual({ dx: 1, dy: -2 })
    expect(limitarDesplazo(30, 40)).toEqual({ dx: 30, dy: 40 })
    expect(limitarDesplazo(NaN, Infinity)).toEqual({ dx: 0, dy: 0 })
    const m = limitarDesplazo(1e9, 0)
    expect(m.dx).toBeLessThan(1e5)
  })

  it('el alcance (8 unidades) se cuenta desde la red, no desde el lugar calculado: el arrastre acumula', () => {
    expect(DESPLAZO_MAX_CHIP).toBe(8)
    let d = { dx: 0, dy: 0 }
    for (let i = 0; i < 5; i++) d = desplazoTrasArrastre(d, { x: 100, y: 50 }, { x: 103, y: 50 })
    expect(d).toEqual({ dx: 15, dy: 0 })
    d = desplazoTrasArrastre(d, { x: 0, y: 0 }, { x: -5, y: 0 })
    expect(d).toEqual({ dx: 10, dy: 0 })
    expect(desplazoTrasArrastre(d, { x: 1, y: 1 }, { x: 1, y: 1 })).toEqual(d)
  })

  it('acotarAlAlcance deja pasar lo que está a 8 unidades de la red y lleva al borde lo que está más lejos', () => {
    const red = con.redes.find((x) => x.id === alta)!
    const cable = d.cables[red.cables[0]].puntos
    const p = cable[0]
    // Sobre el cable y a 5 unidades de él: igual. A 30 unidades: a 8 de la red, en la misma dirección.
    expect(acotarAlAlcance(d, lib, red, p.x, p.y)).toEqual({ x: p.x, y: p.y })
    expect(acotarAlAlcance(d, lib, red, p.x, p.y - 5)).toEqual({ x: p.x, y: p.y - 5 })
    const lejos = acotarAlAlcance(d, lib, red, p.x, p.y - 30)
    expect(lejos.x).toBeCloseTo(p.x, 9)
    expect(p.y - lejos.y).toBeGreaterThanOrEqual(8 - 1e-9)
    expect(acotarAlAlcance(d, lib, red, lejos.x, lejos.y)).toEqual(lejos)
  })

  it('a lo largo de un cable largo el chip llega al otro extremo sin perder el alcance', () => {
    const doc = documentoVacio()
    doc.cables.c = { id: 'c', puntos: [{ x: 0, y: 0 }, { x: 40, y: 0 }] }
    const red = { pines: [], cables: ['c'] }
    expect(acotarAlAlcance(doc, lib, red, 40, -1.6)).toEqual({ x: 40, y: -1.6 })
    expect(acotarAlAlcance(doc, lib, red, 60, 0).x).toBeCloseTo(48, 9)
  })
})

describe('llave de red de un chip', () => {
  it('es el menor de sus pines, y no cambia aunque cambie el número de la red', () => {
    const r = con.redes.find((x) => x.id === alta)!
    expect(claveDeRedChip(r)).toBe(`p:${[...r.pines].sort()[0]}`)
    const otra = calcularConexiones(d, lib)
    expect(claveDeRedChip(otra.redes.find((x) => x.pines.includes(r.pines[0]))!)).toBe(claveDeRedChip(r))
    expect(claveDeRedChip({ pines: [], cables: ['c9', 'c2'] })).toBe('c:c2')
    expect(claveDeRedChip({ pines: [], cables: [] })).toBe('')
  })
})

describe('chip bajo el puntero', () => {
  const chips = chipsDeVoltaje(d, lib, con, lectura([[alta, 5], [medio, 2.5]]))
  it('lo encuentra dentro de su placa y no fuera', () => {
    const c = chips[0]
    const caja = cajaChip(c)
    expect(caja.maxX - caja.minX).toBeGreaterThan(0)
    expect(chipEn(chips, { x: (caja.minX + caja.maxX) / 2, y: (caja.minY + caja.maxY) / 2 })).toBe(c)
    expect(chipEn(chips, { x: caja.maxX + 0.5, y: caja.maxY + 0.5 })).toBeNull()
    expect(chipEn([], { x: 0, y: 0 })).toBeNull()
  })
  it('con margen alcanza el hueco entre el cable y la placa (el chip no se oculta en el camino hacia él)', () => {
    const c = chips[0]
    const caja = cajaChip(c)
    const x = (caja.minX + caja.maxX) / 2
    const hueco = { x, y: caja.minY - 0.5 }
    expect(chipEn(chips, hueco)).toBeNull()
    expect(chipEn(chips, hueco, MARGEN_HOVER_CHIP)).toBe(c)
    expect(chipEn(chips, { x, y: caja.minY - MARGEN_HOVER_CHIP - 0.5 }, MARGEN_HOVER_CHIP)).toBeNull()
  })
  it('un chip sin llave no se agarra', () => {
    const { clave: _, ...sinLlave } = chips[0]
    const caja = cajaChip(sinLlave)
    expect(chipEn([sinLlave], { x: caja.minX + 0.1, y: caja.minY + 0.1 })).toBeNull()
  })
})

describe('caja del encuadre con los chips a la vista', () => {
  const chips = chipsDeVoltaje(d, lib, con, lectura([[alta, 5], [medio, 2.5]]))
  const base = { minX: 0, minY: 0, maxX: 1, maxY: 1 }
  it('sin chips visibles es la misma caja, y sin caja ni chips no hay nada', () => {
    expect(cajaConChips(base, [])).toEqual(base)
    expect(cajaConChips(null, [])).toBeNull()
  })
  it('crece lo justo para abarcar la placa de cada chip, y una caja que ya los contiene no cambia', () => {
    const lejos = { ...chips[0], x: 40, y: -30 }
    const c = cajaConChips(base, [lejos])!
    const placa = cajaChip(lejos)
    expect(c.maxX).toBeCloseTo(placa.maxX, 9)
    expect(c.minY).toBeCloseTo(placa.minY, 9)
    expect(c.minX).toBe(0)
    expect(c.maxY).toBe(1)
    expect(cajaConChips(c, [lejos])).toEqual(c)
  })
  it('sin caja de escena, los chips solos dan la caja', () => {
    const placa = cajaChip(chips[0])
    expect(cajaConChips(null, [chips[0]])).toEqual(placa)
  })
  it('un texto que no es chip no cuenta', () => {
    const { chip: _, ...texto } = { ...chips[0], x: 500, y: 500 }
    expect(cajaConChips(base, [texto])).toEqual(base)
  })
})

describe('red bajo el ratón', () => {
  it('un cable, un pin o una etiqueta dan su red; lo demás, nada', () => {
    expect(redDeGolpe(con, { tipo: 'cable', id: 'c_a', tramo: 0 })).toBe(con.redDeCable.get('c_a'))
    expect(redDeGolpe(con, { tipo: 'pin', piezaId: 'p_v1', pinId: '+', x: 0, y: 0 })).toBe(alta)
    expect(redDeGolpe(con, { tipo: 'pieza', id: 'p_r1' })).toBeUndefined()
    expect(redDeGolpe(con, { tipo: 'nota', id: 'n' })).toBeUndefined()
    expect(redDeGolpe(con, null)).toBeUndefined()
  })
})

describe('redes con chip', () => {
  it('con la tecla V, todas; sin ella y sin ratón sobre nada, ninguna', () => {
    expect(redesConChip({ todos: true, bajoElRaton: 3 })).toBeNull()
    expect(redesConChip({ todos: false })).toEqual(new Set())
  })
  it('sin la tecla: la red del ratón, la del chip que tiene encima y la que se arrastra', () => {
    expect(redesConChip({ todos: false, bajoElRaton: 2 })).toEqual(new Set([2]))
    expect(redesConChip({ todos: false, bajoElChip: 4 })).toEqual(new Set([4]))
    expect(redesConChip({ todos: false, bajoElRaton: 2, bajoElChip: 2, arrastrada: 5 })).toEqual(new Set([2, 5]))
    expect(redesConChip({ todos: false, bajoElRaton: 0 })).toEqual(new Set([0]))
  })
})

describe('redLlevaChip', () => {
  it('la tierra y las redes con menos de dos conexiones no llevan chip', () => {
    expect(redLlevaChip({ tierra: false, pines: ['a:1', 'b:2'], cables: [] })).toBe(true)
    expect(redLlevaChip({ tierra: false, pines: ['a:1'], cables: ['c1'] })).toBe(true)
    expect(redLlevaChip({ tierra: false, pines: ['a:1'], cables: [] })).toBe(false)
    expect(redLlevaChip({ tierra: true, pines: ['a:1', 'b:2'], cables: ['c1'] })).toBe(false)
  })

  it('coincide con las redes que chipsDeVoltaje rotula en el divisor', () => {
    const llevan = con.redes.filter(redLlevaChip).length
    expect(llevan).toBe(2)
  })
})

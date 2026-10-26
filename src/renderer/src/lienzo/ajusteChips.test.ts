// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { calcularConexiones, clavePin } from '../conexiones/conexiones'
import { divisor } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import type { Lectura } from '../sim/lectura'
import { cajaChip, cajaConChips, chipEn, claveDeRedChip, DESPLAZO_MAX_CHIP, desplazoTrasArrastre, limitarDesplazo, MARGEN_HOVER_CHIP, redDeGolpe, redesConChip, redLlevaChip } from './ajusteChips'
import { chipsDeVoltaje } from './chips'

const lib = libreriaDePrueba().piezas
const d = divisor()
const con = calcularConexiones(d, lib)
const alta = con.redDePin.get(clavePin('p_v1', '+'))!
const medio = con.redDePin.get(clavePin('p_r1', '2'))!
const lectura = (redes: [number, number][]): Lectura => ({ t: 0, ratio: 1, redes: new Map(redes), piezas: new Map() })

describe('desplazo de un chip', () => {
  it('se acota a 8 unidades (10 mm) de donde lo puso el reparto, en cualquier dirección', () => {
    expect(limitarDesplazo(1, -2)).toEqual({ dx: 1, dy: -2 })
    expect(limitarDesplazo(5, -6)).toEqual({ dx: 5, dy: -6 })
    expect(DESPLAZO_MAX_CHIP).toBe(8)
    for (const [x, y] of [[20, 0], [0, -20], [30, 40], [-8, -8.1]]) {
      const m = limitarDesplazo(x, y)
      expect(Math.hypot(m.dx, m.dy)).toBeLessThanOrEqual(8 + 1e-9)
    }
    const m = limitarDesplazo(30, 40)
    expect(m.dx).toBeCloseTo(4.8, 9)
    expect(m.dy).toBeCloseTo(6.4, 9)
    expect(limitarDesplazo(NaN, Infinity)).toEqual({ dx: 0, dy: 0 })
  })

  it('el límite se cuenta desde el lugar calculado: arrastres repetidos nunca lo sacan del radio', () => {
    let d = { dx: 0, dy: 0 }
    for (let i = 0; i < 200; i++) {
      // Cada arrastre empieza donde está el chip y lo empuja 3 unidades hacia el mismo lado.
      d = desplazoTrasArrastre(d, { x: 100, y: 50 }, { x: 103, y: 50 })
      expect(Math.hypot(d.dx, d.dy)).toBeLessThanOrEqual(8 + 1e-9)
    }
    expect(d).toEqual({ dx: 8, dy: 0 })
    // Y se puede regresar: el arrastre contrario lo trae de vuelta, sin quedar pegado al borde.
    d = desplazoTrasArrastre(d, { x: 0, y: 0 }, { x: -5, y: 0 })
    expect(d).toEqual({ dx: 3, dy: 0 })
    // Un arrastre que no se mueve no cambia nada.
    expect(desplazoTrasArrastre(d, { x: 1, y: 1 }, { x: 1, y: 1 })).toEqual(d)
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

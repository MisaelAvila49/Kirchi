// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { documentoVacio, type Cable, type Documento, type Pieza, type Sonda } from '../doc/tipos'
import { libreriaDePrueba } from '../prueba/libreria'
import { anclaDeSonda } from './anclas'
import { calcularConexiones, clavePin } from './conexiones'

const lib = libreriaDePrueba().piezas
const pieza = (id: string, tipo: string, ref: string, x: number, y: number): Pieza => ({ id, tipo, ref, x, y, rot: 0, espejo: false, props: {} })
const C = (id: string, ...pts: [number, number][]): Cable => ({ id, puntos: pts.map(([x, y]) => ({ x, y })) })

/** R1 (pines en −4,0 y 4,0) con su cable `c` de (4,0) a (20,0), el osciloscopio XSC1 (A en 72,−6) y una tierra en (−4,0). */
function circuito(extra: Partial<Documento> = {}): Documento {
  const d = documentoVacio()
  d.piezas.r = pieza('r', 'resistencia', 'R1', 0, 0)
  d.piezas.o = pieza('o', 'osciloscopio', 'XSC1', 80, 0)
  d.piezas.g = pieza('g', 'tierra', 'GND1', -4, 0)
  d.cables.c = C('c', [4, 0], [20, 0])
  return { ...d, ...extra, cables: { ...d.cables, ...extra.cables } }
}
const sonda = (s: Sonda) => ({ [s.id]: s })

describe('sondas en las conexiones', () => {
  it('la sonda de osciloscopio pone la entrada en la red del cable, como un cable', () => {
    const doc = circuito({ sondas: sonda({ id: 's', tipo: 'osciloscopio', x: 10, y: 0, instrumento: 'o', entrada: 'A' }) })
    const con = calcularConexiones(doc, lib)
    expect(con.redDePin.get(clavePin('o', 'A'))).toBe(con.redDeCable.get('c'))
    expect(con.redDeSonda.get('s')).toBe(con.redDeCable.get('c'))
    // Las demás entradas siguen sueltas.
    expect(con.redDePin.get(clavePin('o', 'B'))).not.toBe(con.redDeCable.get('c'))
  })

  it('en un pin o en el ancla de una etiqueta también une', () => {
    const enPin = calcularConexiones(circuito({ sondas: sonda({ id: 's', tipo: 'osciloscopio', x: -4, y: 0, instrumento: 'o', entrada: 'B' }) }), lib)
    const tierra = enPin.redes[enPin.redDePin.get(clavePin('o', 'B'))!]
    expect(tierra.tierra).toBe(true)
    const conEtiqueta = circuito({ etiquetas: { e: { id: 'e', nombre: 'VIN', x: 30, y: 30, rot: 0 } }, sondas: sonda({ id: 'm', tipo: 'osciloscopio', x: 30, y: 30, instrumento: 'o', entrada: 'C' }) })
    const con = calcularConexiones(conEtiqueta, lib)
    expect(con.redes[con.redDePin.get(clavePin('o', 'C'))!].nombre).toBe('VIN')
  })

  it('las de voltaje y corriente no cambian ninguna red', () => {
    const sin = calcularConexiones(circuito(), lib)
    const con = calcularConexiones(circuito({ sondas: { v: { id: 'v', tipo: 'voltaje', x: 10, y: 0 }, i: { id: 'i', tipo: 'corriente', x: 12, y: 0, sentido: 'derecha' } } }), lib)
    expect([...con.redDePin]).toEqual([...sin.redDePin])
    expect([...con.redDeCable]).toEqual([...sin.redDeCable])
    expect(con.uniones).toEqual(sin.uniones)
    expect(con.redDeSonda.get('v')).toBe(con.redDeCable.get('c'))
    expect(con.redDeSonda.get('i')).toBe(con.redDeCable.get('c'))
  })

  it('en un cruce sin unión no junta los dos cables', () => {
    const doc = circuito({ cables: { x: C('x', [10, -10], [10, 10]) }, sondas: sonda({ id: 'v', tipo: 'voltaje', x: 10, y: 0 }) })
    const con = calcularConexiones(doc, lib)
    expect(con.redDeCable.get('c')).not.toBe(con.redDeCable.get('x'))
    expect(con.uniones).toEqual(calcularConexiones({ ...doc, sondas: {} }, lib).uniones)
  })

  it('en el aire no mide nada y la entrada queda suelta', () => {
    const doc = circuito({ sondas: sonda({ id: 's', tipo: 'osciloscopio', x: 500, y: 500, instrumento: 'o', entrada: 'A' }) })
    const con = calcularConexiones(doc, lib)
    expect(con.redDeSonda.has('s')).toBe(false)
    expect(con.redDePin.get(clavePin('o', 'A'))).not.toBe(con.redDeCable.get('c'))
  })

  it('sin el instrumento o con una entrada que no tiene, la sonda solo lee', () => {
    const doc = circuito({ sondas: { s: { id: 's', tipo: 'osciloscopio', x: 10, y: 0, instrumento: 'nadie', entrada: 'A' }, t: { id: 't', tipo: 'multimetro', x: 12, y: 0, instrumento: 'o', entrada: '+' } } })
    const con = calcularConexiones(doc, lib)
    expect(con.redDeSonda.get('s')).toBe(con.redDeCable.get('c'))
    expect([...con.redDePin]).toEqual([...calcularConexiones(circuito(), lib).redDePin])
  })

  it('la red de cada sonda es la de lo que toca según anclaDeSonda, en 200 puntos', () => {
    const doc = circuito({
      cables: { x: C('x', [10, -10], [10, 10]), y: C('y', [20, 0], [20, 12], [36, 12]) },
      etiquetas: { e: { id: 'e', nombre: 'N', x: 36, y: 12, rot: 0 } }
    })
    let semilla = 7
    const azar = () => ((semilla = (semilla * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
    const sondas: Record<string, Sonda> = {}
    for (let k = 0; k < 200; k++) sondas[`v${k}`] = { id: `v${k}`, tipo: 'voltaje', x: Math.floor(azar() * 50) - 8, y: Math.floor(azar() * 30) - 12 }
    const con = calcularConexiones({ ...doc, sondas }, lib)
    const base = calcularConexiones(doc, lib)
    for (const s of Object.values(sondas)) {
      const a = anclaDeSonda(doc, lib, s.x, s.y)
      const esperada = !a ? undefined : a.tipo === 'pin' ? base.redDePin.get(a.clave) : a.tipo === 'etiqueta' ? base.redDeEtiqueta.get(a.id) : base.redDeCable.get(a.id)
      expect(con.redDeSonda.get(s.id), `(${s.x}, ${s.y})`).toBe(esperada)
    }
  })

  it('solo une la entrada de un instrumento del tipo de la sonda', () => {
    // Una sonda alterada que dice ser de osciloscopio en la entrada A de una compuerta no toca la compuerta.
    const doc = circuito({ piezas: { ...circuito().piezas, u: pieza('u', 'and', 'U1', 40, 40) }, sondas: sonda({ id: 's', tipo: 'osciloscopio', x: 10, y: 0, instrumento: 'u', entrada: 'A' }) })
    const con = calcularConexiones(doc, lib)
    expect(con.redDePin.get(clavePin('u', 'A'))).not.toBe(con.redDeCable.get('c'))
    expect(con.redDeSonda.get('s')).toBe(con.redDeCable.get('c'))
  })

  it('una entrada con cable no se une a la red de su sonda: las dos redes siguen separadas y se avisa', () => {
    // La sonda A está en el cable c; un cable d lleva la entrada A a la red de la tierra.
    const doc = circuito({ cables: { d: C('d', [72, -6], [60, -6], [60, 20], [-4, 20], [-4, 0]) }, sondas: sonda({ id: 's', tipo: 'osciloscopio', x: 10, y: 0, instrumento: 'o', entrada: 'A' }) })
    const con = calcularConexiones(doc, lib)
    expect(con.redDeCable.get('c')).not.toBe(con.redDeCable.get('d'))
    expect(con.redDePin.get(clavePin('o', 'A'))).toBe(con.redDeCable.get('d'))
    expect(con.sondasSinUnir).toEqual(['s'])
  })

  it('una sonda que apunta a una pieza que se llama como un método del objeto no rompe nada', () => {
    const doc = circuito({ sondas: sonda({ id: 's', tipo: 'osciloscopio', x: 10, y: 0, instrumento: 'constructor', entrada: 'A' }) })
    expect(() => calcularConexiones(doc, lib)).not.toThrow()
  })
})

// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { documentoVacio, type Cable, type Documento, type Pieza } from '../doc/tipos'
import { libreriaDePrueba } from '../prueba/libreria'
import { calcularConexiones, clavePin, partirClavePin } from './conexiones'
import { UnionFind } from './unionFind'

const lib = libreriaDePrueba().piezas
const R = (id: string, x: number, y: number, rot: Pieza['rot'] = 0): Pieza => ({ id, tipo: 'resistencia', ref: id.toUpperCase(), x, y, rot, espejo: false, props: {} })
const C = (id: string, ...pts: [number, number][]): Cable => ({ id, puntos: pts.map(([x, y]) => ({ x, y })) })
const docCon = (piezas: Pieza[], cables: Cable[] = []): Documento => {
  const d = documentoVacio()
  for (const p of piezas) d.piezas[p.id] = p
  for (const c of cables) d.cables[c.id] = c
  return d
}
const misma = (con: ReturnType<typeof calcularConexiones>, a: string, b: string) => con.redDePin.get(a) === con.redDePin.get(b)

describe('UnionFind', () => {
  it('une transitivamente', () => {
    const u = new UnionFind()
    u.unir(1, 2)
    u.unir(2, 3)
    expect(u.buscar(1)).toBe(u.buscar(3))
    expect(u.buscar(4)).not.toBe(u.buscar(1))
  })
})

describe('calcularConexiones', () => {
  it('un cable une dos resistencias en serie', () => {
    const con = calcularConexiones(docCon([R('r1', 0, 0), R('r2', 16, 0)], [C('c1', [4, 0], [12, 0])]), lib)
    expect(misma(con, clavePin('r1', '2'), clavePin('r2', '1'))).toBe(true)
    expect(misma(con, clavePin('r1', '1'), clavePin('r1', '2'))).toBe(false)
    expect(con.uniones).toEqual([])
  })

  it('pines que se tocan quedan unidos sin cable', () => {
    const con = calcularConexiones(docCon([R('r1', 0, 0), R('r2', 8, 0)]), lib)
    expect(misma(con, clavePin('r1', '2'), clavePin('r2', '1'))).toBe(true)
  })

  it('unión en T conecta y pone punto de unión', () => {
    const con = calcularConexiones(docCon([], [C('a', [0, 10], [20, 10]), C('b', [10, 10], [10, 20])]), lib)
    expect(con.redDeCable.get('a')).toBe(con.redDeCable.get('b'))
    expect(con.uniones).toEqual([{ x: 10, y: 10 }])
  })

  it('un cruce no conecta', () => {
    const con = calcularConexiones(docCon([], [C('a', [0, 10], [20, 10]), C('b', [10, 0], [10, 20])]), lib)
    expect(con.redDeCable.get('a')).not.toBe(con.redDeCable.get('b'))
    expect(con.uniones).toEqual([])
  })

  it('un pin sobre la mitad de un cable lo conecta', () => {
    const con = calcularConexiones(docCon([R('r1', 14, 5)], [C('a', [10, 0], [10, 20])]), lib)
    expect(con.redDePin.get(clavePin('r1', '1'))).toBe(con.redDeCable.get('a'))
  })

  it('etiquetas con el mismo nombre conectan y nombran la red', () => {
    const d = docCon([R('r1', 0, 0), R('r2', 40, 0)], [C('a', [4, 0], [10, 0]), C('b', [30, 0], [36, 0])])
    d.etiquetas.e1 = { id: 'e1', nombre: 'VSAL', x: 10, y: 0, rot: 0 }
    d.etiquetas.e2 = { id: 'e2', nombre: 'VSAL', x: 30, y: 0, rot: 0 }
    const con = calcularConexiones(d, lib)
    expect(misma(con, clavePin('r1', '2'), clavePin('r2', '1'))).toBe(true)
    expect(con.redes[con.redDePin.get(clavePin('r1', '2'))!].nombre).toBe('VSAL')
  })

  it('la tierra marca su red', () => {
    const d = docCon([R('r1', 0, 0), { id: 'g', tipo: 'tierra', ref: 'GND1', x: 4, y: 0, rot: 0, espejo: false, props: {} }])
    const con = calcularConexiones(d, lib)
    expect(con.redes[con.redDePin.get(clavePin('r1', '2'))!].tierra).toBe(true)
    expect(con.redes[con.redDePin.get(clavePin('r1', '1'))!].tierra).toBe(false)
  })

  it('una pieza girada 90° usa sus pines girados', () => {
    const con = calcularConexiones(docCon([R('r1', 0, 0, 90)], [C('a', [0, 4], [0, 10])]), lib)
    expect(con.redDePin.get(clavePin('r1', '2'))).toBe(con.redDeCable.get('a'))
  })

  it('piezas de tipo desconocido no rompen el cálculo', () => {
    const d = docCon([{ id: 'x', tipo: 'no-existe', ref: 'X1', x: 0, y: 0, rot: 0, espejo: false, props: {} }])
    expect(calcularConexiones(d, lib).redes).toEqual([])
  })

  it('una etiqueta en el interior de un cable lo conecta sin punto de unión', () => {
    const d = docCon([R('r1', 0, 0)], [C('a', [4, 0], [20, 0])])
    d.etiquetas.e1 = { id: 'e1', nombre: 'X', x: 10, y: 0, rot: 0 }
    d.etiquetas.e2 = { id: 'e2', nombre: 'X', x: 10, y: 30, rot: 0 }
    d.cables.b = { id: 'b', puntos: [{ x: 10, y: 30 }, { x: 20, y: 30 }] }
    const con = calcularConexiones(d, lib)
    expect(con.redDeCable.get('a')).toBe(con.redDeCable.get('b'))
    expect(con.uniones).toEqual([])
  })

  it('dos tierras forman una sola red de tierra', () => {
    const g = (id: string, x: number): Pieza => ({ id, tipo: 'tierra', ref: id, x, y: 0, rot: 0, espejo: false, props: {} })
    const con = calcularConexiones(docCon([g('g1', 0), g('g2', 20)]), lib)
    expect(con.redes.filter((r) => r.tierra)).toHaveLength(1)
    expect(con.redDePin.get(clavePin('g1', '1'))).toBe(con.redDePin.get(clavePin('g2', '1')))
  })

  it('cuatro brazos en un punto dan punto de unión', () => {
    const con = calcularConexiones(docCon([], [C('a', [0, 10], [10, 10]), C('b', [10, 10], [20, 10]), C('c', [10, 0], [10, 10]), C('d', [10, 10], [10, 20])]), lib)
    expect(con.uniones).toEqual([{ x: 10, y: 10 }])
  })

  it('extremo con extremo colineal conecta sin punto de unión', () => {
    const con = calcularConexiones(docCon([], [C('a', [0, 10], [10, 10]), C('b', [10, 10], [20, 10])]), lib)
    expect(con.redDeCable.get('a')).toBe(con.redDeCable.get('b'))
    expect(con.uniones).toEqual([])
  })

  it('ignora puntos duplicados y cables degenerados', () => {
    const con = calcularConexiones(docCon([], [C('a', [0, 0], [0, 0]), C('b', [0, 10], [0, 10], [20, 10])]), lib)
    expect(con.redDeCable.has('a')).toBe(false)
    expect(con.redDeCable.has('b')).toBe(true)
  })

  it('un nombre de etiqueta vacío no une redes', () => {
    const d = docCon([], [C('a', [0, 0], [4, 0]), C('b', [0, 20], [4, 20])])
    d.etiquetas.e1 = { id: 'e1', nombre: ' ', x: 0, y: 0, rot: 0 }
    d.etiquetas.e2 = { id: 'e2', nombre: '', x: 0, y: 20, rot: 0 }
    const con = calcularConexiones(d, lib)
    expect(con.redDeCable.get('a')).not.toBe(con.redDeCable.get('b'))
    expect(con.redes[0].nombre).toBeUndefined()
  })
})

describe('partirClavePin', () => {
  it('es la inversa de clavePin, también con «:» en el id del pin', () => {
    expect(partirClavePin(clavePin('r1', '2'))).toEqual({ piezaId: 'r1', pinId: '2' })
    expect(partirClavePin(clavePin('r1', 'a:b'))).toEqual({ piezaId: 'r1', pinId: 'a:b' })
  })
})

describe('el punto de conexión de una etiqueta (B1)', () => {
  it('está conectado si un cable o un pin llega a su punto', () => {
    const d = documentoVacio()
    d.piezas.r = { id: 'r', tipo: 'resistencia', ref: 'R1', x: 0, y: 0, rot: 0, espejo: false, props: {} }
    d.cables.c = { id: 'c', puntos: [{ x: 4, y: 0 }, { x: 20, y: 0 }] }
    d.etiquetas.extremo = { id: 'extremo', nombre: 'A', x: 20, y: 0, rot: 0 }
    d.etiquetas.medio = { id: 'medio', nombre: 'B', x: 10, y: 0, rot: 0 }
    d.etiquetas.pin = { id: 'pin', nombre: 'C', x: -4, y: 0, rot: 0 }
    d.etiquetas.suelta = { id: 'suelta', nombre: 'A', x: 50, y: 50, rot: 0 }
    const con = calcularConexiones(d, lib)
    expect([...con.etiquetaConectada].sort()).toEqual(['extremo', 'medio', 'pin'])
  })
})

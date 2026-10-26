// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { documentoVacio, type Cable, type Documento, type Pieza } from '../doc/tipos'
import { libreriaDePrueba } from '../prueba/libreria'
import { anclaTextoEtiqueta } from '../lienzo/medidas'
import { Indice } from './indice'

const lib = libreriaDePrueba().piezas
const R = (id: string, x: number, y: number, rot: Pieza['rot'] = 0): Pieza => ({ id, tipo: 'resistencia', ref: id.toUpperCase(), x, y, rot, espejo: false, props: {} })
const C = (id: string, ...pts: [number, number][]): Cable => ({ id, puntos: pts.map(([x, y]) => ({ x, y })) })

/** R1 en el origen (pines en ±4), cable de su pin 2 a (12, 8), etiqueta VCC al final, R2 vertical en (40, 0) y una nota lejos. */
function ejemplo(): Documento {
  const d = documentoVacio()
  d.piezas.r1 = R('r1', 0, 0)
  d.piezas.r2 = R('r2', 40, 0, 90)
  d.cables.c1 = C('c1', [4, 0], [12, 0], [12, 8])
  d.etiquetas.e1 = { id: 'e1', nombre: 'VCC', x: 12, y: 8, rot: 0 }
  d.notas.n1 = { id: 'n1', x: -20, y: -20, ancho: 8, texto: 'hola' }
  return d
}
const indice = (d = ejemplo()) => {
  const i = new Indice()
  i.reconstruir(d, lib)
  return i
}

describe('Indice', () => {
  it('el pin gana sobre la pieza y el cable', () => {
    expect(indice().golpe({ x: 4.3, y: 0.2 }, 0.5)).toEqual({ tipo: 'pin', piezaId: 'r1', pinId: '2', x: 4, y: 0 })
  })

  it('dentro de la caja se toca la pieza', () => {
    expect(indice().golpe({ x: 0, y: 0.5 }, 0.5)).toEqual({ tipo: 'pieza', id: 'r1' })
  })

  it('cada tramo de cable se distingue', () => {
    const i = indice()
    expect(i.golpe({ x: 8, y: 0.3 }, 0.5)).toEqual({ tipo: 'cable', id: 'c1', tramo: 0 })
    expect(i.golpe({ x: 12.2, y: 4 }, 0.5)).toEqual({ tipo: 'cable', id: 'c1', tramo: 1 })
  })

  it('etiquetas y notas se tocan por su caja', () => {
    const i = indice()
    expect(i.golpe({ x: 14, y: 8.5 }, 0.5)).toEqual({ tipo: 'etiqueta', id: 'e1' })
    expect(i.golpe({ x: -18, y: -19 }, 0.5)).toEqual({ tipo: 'nota', id: 'n1' })
  })

  it('una etiqueta vertical se toca también por su nombre, que queda fuera de la bandera', () => {
    const d = documentoVacio()
    d.etiquetas.v = { id: 'v', nombre: 'VSAL', x: 10, y: 30, rot: 90 }
    const a = anclaTextoEtiqueta(d.etiquetas.v)
    const i = indice(d)
    expect(i.golpe({ x: a.x, y: a.y }, 0.2)).toEqual({ tipo: 'etiqueta', id: 'v' })
    expect(i.golpe({ x: 10, y: 31 }, 0.2)).toEqual({ tipo: 'etiqueta', id: 'v' })
    expect(i.golpe({ x: a.x + 20, y: a.y }, 0.2)).toBeNull()
  })

  it('el vacío no toca nada', () => {
    expect(indice().golpe({ x: 30, y: 30 }, 0.5)).toBeNull()
  })

  it('la caja de la pieza girada también gira', () => {
    expect(indice().golpe({ x: 40, y: 3 }, 0.3)).toEqual({ tipo: 'pieza', id: 'r2' })
  })

  it('encuentra los pines exactos de un punto', () => {
    const i = indice()
    expect(i.pinesEn(4, 0).map((p) => [p.piezaId, p.pinId])).toEqual([['r1', '2']])
    expect(i.pinesEn(5, 0)).toEqual([])
  })

  it('busca por caja', () => {
    expect(indice().buscar({ minX: -1, minY: -1, maxX: 1, maxY: 1 }).some((it) => it.col === 'piezas' && it.id === 'r1')).toBe(true)
  })
})

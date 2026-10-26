// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { documentoVacio, type Cable, type Documento, type Pieza } from '../doc/tipos'
import { libreriaDePrueba } from '../prueba/libreria'
import { Indice } from './indice'
import { imanEn, radioIman, RADIO_IMAN_MIN, RADIO_IMAN_PX } from './iman'

const lib = libreriaDePrueba().piezas
const R = (id: string, x: number, y: number, rot: Pieza['rot'] = 0): Pieza => ({ id, tipo: 'resistencia', ref: id.toUpperCase(), x, y, rot, espejo: false, props: {} })
const C = (id: string, ...pts: [number, number][]): Cable => ({ id, puntos: pts.map(([x, y]) => ({ x, y })) })

/** R1 en el origen (pines en ±4), R2 a la derecha (pines en 16 y 24) y un cable horizontal de y = 10 de x = -8 a 30. */
function ejemplo(): Documento {
  const d = documentoVacio()
  d.piezas.r1 = R('r1', 0, 0)
  d.piezas.r2 = R('r2', 20, 0)
  d.cables.c1 = C('c1', [-8, 10], [30, 10])
  return d
}
const indice = (d = ejemplo()) => {
  const i = new Indice()
  i.reconstruir(d, lib)
  return i
}

describe('radio del imán', () => {
  it('son 12 px de pantalla, entre un cuarto de celda y media celda de mundo (nunca hasta el siguiente punto)', () => {
    expect(RADIO_IMAN_PX).toBe(12)
    expect(RADIO_IMAN_MIN).toBe(0.5)
    // A poco zoom los 12 px serían muchas unidades: manda la media celda (1 unidad de 2).
    expect(radioIman(1)).toBe(1)
    expect(radioIman(0.5)).toBe(1)
    expect(radioIman(4.72)).toBe(1)
    // A 200 % (9.45 px por unidad) 12 px son 1.27 unidades: sigue la media celda.
    expect(radioIman(9.45)).toBe(1)
    // A 400 % (18.9 px por unidad) 12 px son 0.63 unidades.
    expect(radioIman(18.9)).toBeCloseTo(12 / 18.9, 9)
    expect(radioIman(42)).toBe(0.5)
    for (const z of [0.2, 1, 4.72, 12, 20, 42]) expect(radioIman(z)).toBeLessThanOrEqual(1)
  })
})

describe('imanEn', () => {
  it('lleva al pin más cercano dentro del radio, con la posición exacta del pin', () => {
    const i = indice()
    expect(imanEn(i, ejemplo(), { x: 5.5, y: 1.2 }, 2.5)).toEqual({ tipo: 'pin', piezaId: 'r1', pinId: '2', x: 4, y: 0 })
    expect(imanEn(i, ejemplo(), { x: 15, y: -1 }, 2.5)).toMatchObject({ tipo: 'pin', piezaId: 'r2', pinId: '1', x: 16, y: 0 })
  })

  it('entre dos pines gana el más cercano', () => {
    const i = indice()
    // Entre el pin 2 de R1 (4, 0) y el pin 1 de R2 (16, 0): más cerca del de R2.
    expect(imanEn(i, ejemplo(), { x: 11, y: 0 }, 8)).toMatchObject({ pinId: '1', piezaId: 'r2' })
    expect(imanEn(i, ejemplo(), { x: 9, y: 0 }, 8)).toMatchObject({ pinId: '2', piezaId: 'r1' })
  })

  it('fuera del radio no hay imán', () => {
    expect(imanEn(indice(), ejemplo(), { x: 10, y: 5 }, 2.5)).toBeNull()
    expect(imanEn(indice(), ejemplo(), { x: 7, y: 0 }, 2.5)).toBeNull()
  })

  it('un tramo de cable dentro del radio da el punto de rejilla del tramo más cercano', () => {
    const m = imanEn(indice(), ejemplo(), { x: 9.3, y: 11.4 }, 2.5)
    expect(m).toEqual({ tipo: 'cable', id: 'c1', tramo: 0, x: 10, y: 10 })
    expect(imanEn(indice(), ejemplo(), { x: 9.3, y: 13.5 }, 2.5)).toBeNull()
  })

  it('el pin gana al cable aunque el cable esté más cerca del cursor', () => {
    const d = ejemplo()
    d.cables.c1 = C('c1', [-8, 2], [30, 2])
    // El cursor está a 0.2 del cable y a 1.8 del pin (4, 0): manda el pin.
    expect(imanEn(indice(d), d, { x: 5.6, y: 1.8 }, 2.5)).toMatchObject({ tipo: 'pin', pinId: '2' })
    // Pasado el radio del pin, el cable.
    expect(imanEn(indice(d), d, { x: 8, y: 1.8 }, 2.5)).toMatchObject({ tipo: 'cable', id: 'c1' })
  })

  it('a distintos zoom el radio en mundo cambia y el pin se alcanza o no', () => {
    const i = indice(), d = ejemplo()
    const p = { x: 8.5, y: 0 } // a 4.5 unidades del pin (4, 0)
    expect(imanEn(i, d, p, radioIman(4.72))).toBeNull() // 100 %: 1 unidad
    expect(imanEn(i, d, p, radioIman(1.5))).toBeNull() // 32 %: media celda, no 8 unidades
    expect(imanEn(i, d, { x: 4.9, y: 0 }, radioIman(1.5))).toMatchObject({ pinId: '2' })
    expect(imanEn(i, d, { x: 5.2, y: 0 }, radioIman(1.5))).toBeNull() // pasa de la media celda
    expect(imanEn(i, d, { x: 4.4, y: 0 }, radioIman(42))).toMatchObject({ pinId: '2' }) // 900 %: medio radio
  })

  it('el extremo de un cable gana al resto de su tramo', () => {
    const d = ejemplo()
    d.cables.c1 = C('c1', [-8, 10], [30, 10], [30, 20])
    // Cerca de la esquina (30, 10): los dos tramos que la comparten dan la esquina.
    expect(imanEn(indice(d), d, { x: 30.4, y: 10.8 }, 2.5)).toMatchObject({ tipo: 'cable', x: 30, y: 10 })
  })
})

describe('el imán y las etiquetas puestas a mano (B1)', () => {
  it('el punto de conexión de una etiqueta atrae al cable después de los pines y antes que los tramos', () => {
    const d = ejemplo()
    d.etiquetas.e = { id: 'e', nombre: 'VIN', x: 40, y: 0, rot: 0 }
    expect(imanEn(indice(d), d, { x: 41, y: 0.5 }, 2)).toEqual({ tipo: 'etiqueta', id: 'e', x: 40, y: 0 })
    // Un pin cercano gana.
    d.etiquetas.f = { id: 'f', nombre: 'X', x: 5, y: 0, rot: 0 }
    expect(imanEn(indice(d), d, { x: 4.6, y: 0 }, 2)).toMatchObject({ tipo: 'pin' })
    // Excluido el origen del cable, no se ofrece.
    expect(imanEn(indice(d), d, { x: 40.5, y: 0 }, 2, { x: 40, y: 0 })).toBeNull()
  })
})

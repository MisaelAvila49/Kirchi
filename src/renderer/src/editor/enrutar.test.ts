// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { documentoVacio, type Cable, type Documento, type Pieza, type Punto, type Rotacion } from '../doc/tipos'
import { libreriaDePrueba } from '../prueba/libreria'
import { violaciones, piezaCruzada } from './conflictos'
import { codos, enrutar, rutaLibre } from './enrutar'
import { rutaL } from './rutas'

const lib = libreriaDePrueba().piezas
const R = (id: string, x: number, y: number, rot: Rotacion = 0): Pieza => ({ id, tipo: 'resistencia', ref: id.toUpperCase(), x, y, rot, espejo: false, props: {} })
const P = (...pts: [number, number][]): Punto[] => pts.map(([x, y]) => ({ x, y }))
function doc(piezas: Pieza[], cables: Cable[] = []): Documento {
  const d = documentoVacio()
  for (const p of piezas) d.piezas[p.id] = p
  for (const c of cables) d.cables[c.id] = c
  return d
}

describe('enrutar', () => {
  it('línea recta cuando está libre', () => {
    const d = doc([R('a', 0, 0), R('b', 20, 0)])
    expect(enrutar(d, lib, { x: 4, y: 0 }, { x: 16, y: 0 })).toEqual(P([4, 0], [16, 0]))
  })

  it('la L preferida si está libre, y la otra si la preferida atraviesa un cuerpo', () => {
    const d = doc([R('a', 0, 0), R('c', 30, 14, 90)])
    expect(enrutar(d, lib, { x: 4, y: 0 }, { x: 30, y: 10 }, { horizontalPrimero: true })).toEqual(P([4, 0], [30, 0], [30, 10]))
    expect(enrutar(d, lib, { x: 4, y: 0 }, { x: 30, y: 10 }, { horizontalPrimero: false })).toEqual(P([4, 0], [4, 10], [30, 10]))
    // Con R2 en (12, 0) la L horizontal pasa por su pin y su cuerpo: se toma la vertical aunque se prefiera la otra.
    const d2 = doc([R('a', 0, 0), R('b', 12, 0), R('c', 16, 14, 90)])
    expect(enrutar(d2, lib, { x: 4, y: 0 }, { x: 16, y: 10 }, { horizontalPrimero: true })).toEqual(P([4, 0], [4, 10], [16, 10]))
  })

  it('rodea una resistencia que está entre los dos pines', () => {
    // R1 y R2 en línea con una resistencia vertical entre ellas: la recta la atraviesa.
    const d = doc([R('a', -14, 0), R('b', 14, 0), R('m', 0, 0, 90)])
    const r = enrutar(d, lib, { x: -10, y: 0 }, { x: 10, y: 0 })
    expect(r[0]).toEqual({ x: -10, y: 0 })
    expect(r[r.length - 1]).toEqual({ x: 10, y: 0 })
    expect(piezaCruzada(d, lib, r)).toBeNull()
    expect(rutaLibre(d, lib, r)).toBe(true)
    expect(codos(r)).toBe(2)
    // No pasa por los pines de la vertical (0, ±4): se conectaría con ellos.
    expect(r.every((p) => !(p.x === 0 && Math.abs(p.y) === 4))).toBe(true)
    const conCable = { ...d, cables: { w: { id: 'w', puntos: r } } }
    expect(violaciones(conCable, lib)).toEqual([])
  })

  it('no corre encima de otro cable si puede rodearlo, pero sí lo cruza', () => {
    const d = doc([R('a', -14, 0), R('b', 14, 0)], [{ id: 'x', puntos: P([-20, -6], [-6, -6], [-6, 6]) }])
    // La recta de (−10, 0) a (10, 0) cruza el tramo vertical x = −6: se permite.
    expect(enrutar(d, lib, { x: -10, y: 0 }, { x: 10, y: 0 })).toEqual(P([-10, 0], [10, 0]))
    // De (−10, 0) a (−14, −6) cualquier L correría sobre el tramo y = −6 o pasaría por su vértice: se rodea.
    const r = enrutar(d, lib, { x: -10, y: 0 }, { x: 4, y: -10 })
    expect(rutaLibre(d, lib, r)).toBe(true)
  })

  it('sin camino devuelve la L con menos conflictos', () => {
    const d = doc([R('a', 0, 0), R('b', 20, 0)])
    // El destino está dentro del cuerpo de R2: no hay camino libre.
    const r = enrutar(d, lib, { x: 4, y: 0 }, { x: 20, y: 0 })
    expect([rutaL({ x: 4, y: 0 }, { x: 20, y: 0 }, true), rutaL({ x: 4, y: 0 }, { x: 20, y: 0 }, false)]).toContainEqual(r)
  })

  it('el cable de la batería al botón no pasa por encima de ninguno (caso del usuario)', () => {
    const d = documentoVacio()
    d.piezas.b = { id: 'b', tipo: 'bateria', ref: 'B1', x: 0, y: 0, rot: 0, espejo: false, props: {} }
    d.piezas.s = { id: 's', tipo: 'boton', ref: 'S1', x: 10, y: -8, rot: 0, espejo: false, props: {} }
    // Pin «−» de la batería (0, 4) al pin derecho del botón (14, −8); las dos L atraviesan algún cuerpo.
    for (const h of [true, false]) {
      const r = enrutar(d, lib, { x: 0, y: 4 }, { x: 14, y: -8 }, { horizontalPrimero: h })
      expect(piezaCruzada(d, lib, r), JSON.stringify(r)).toBeNull()
      expect(r[0]).toEqual({ x: 0, y: 4 })
      expect(r[r.length - 1]).toEqual({ x: 14, y: -8 })
    }
  })
})

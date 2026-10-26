// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { aplicar } from '../doc/comandos'
import { idSecuencial } from '../doc/ids'
import { documentoVacio, type Cable, type Documento, type Pieza, type Punto, type Rotacion } from '../doc/tipos'
import { libreriaDePrueba } from '../prueba/libreria'
import { insertarEnCable } from './insertar'

const lib = libreriaDePrueba().piezas
const R = (id: string, x: number, y: number, rot: Rotacion = 0, tipo = 'resistencia'): Pieza => ({ id, tipo, ref: id.toUpperCase(), x, y, rot, espejo: false, props: {} })
const C = (id: string, ...pts: [number, number][]): Cable => ({ id, puntos: pts.map(([x, y]) => ({ x, y })) })
const P = (...pts: [number, number][]): Punto[] => pts.map(([x, y]) => ({ x, y }))
function doc(piezas: Pieza[], cables: Cable[]): Documento {
  const d = documentoVacio()
  for (const p of piezas) d.piezas[p.id] = p
  for (const c of cables) d.cables[c.id] = c
  return d
}
/** Aplica lo que devuelve insertarEnCable para la pieza `id` y lista los cables que quedan. */
function insertar(d: Documento, id: string): Punto[][] | null {
  const cmd = insertarEnCable(d, lib, d.piezas[id], idSecuencial())
  return cmd ? Object.values(aplicar(d, cmd).cables).map((c) => c.puntos) : null
}

describe('insertarEnCable', () => {
  it('una resistencia sobre un cable recto lo parte en sus pines y quita el tramo de en medio', () => {
    const d = doc([R('r', 0, 0)], [C('w', [-20, 0], [20, 0])])
    expect(insertar(d, 'r')).toEqual([P([-20, 0], [-4, 0]), P([4, 0], [20, 0])])
  })

  it('conserva el id del cable en el primer trozo', () => {
    const d = doc([R('r', 0, 0)], [C('w', [-20, 0], [20, 0])])
    const cmd = insertarEnCable(d, lib, d.piezas.r, idSecuencial())!
    const cables = aplicar(d, cmd).cables
    expect(cables.w.puntos).toEqual(P([-20, 0], [-4, 0]))
    expect(Object.keys(cables)).toHaveLength(2)
  })

  it('funciona en un tramo de un cable con esquinas y en cualquier sentido', () => {
    const d = doc([R('r', 0, 0)], [C('w', [10, 10], [10, 0], [-20, 0])])
    expect(insertar(d, 'r')).toEqual([P([10, 10], [10, 0], [4, 0]), P([-4, 0], [-20, 0])])
  })

  it('una resistencia vertical sobre un tramo vertical también', () => {
    const d = doc([R('r', 0, 0, 90)], [C('w', [0, -10], [0, 10])])
    expect(insertar(d, 'r')).toEqual([P([0, -10], [0, -4]), P([0, 4], [0, 10])])
  })

  it('pines en los extremos del tramo: el cable entre ellos desaparece y el resto se queda', () => {
    expect(insertar(doc([R('r', 0, 0)], [C('w', [-4, 0], [4, 0])]), 'r')).toEqual([])
    expect(insertar(doc([R('r', 0, 0)], [C('w', [-4, 0], [12, 0])]), 'r')).toEqual([P([4, 0], [12, 0])])
  })

  it('no hace nada si la pieza no está alineada, si los pines caen en cables distintos o si no tiene dos pines', () => {
    expect(insertar(doc([R('r', 0, 0, 90)], [C('w', [-20, 0], [20, 0])]), 'r')).toBeNull()
    expect(insertar(doc([R('r', 0, 0)], [C('a', [-20, 0], [-2, 0]), C('b', [2, 0], [20, 0])]), 'r')).toBeNull()
    expect(insertar(doc([R('r', 0, 0)], [C('w', [-20, 0], [0, 0], [0, 10])]), 'r')).toBeNull()
    expect(insertar(doc([R('g', 0, 0, 0, 'tierra')], [C('w', [-20, 0], [20, 0])]), 'g')).toBeNull()
  })
})

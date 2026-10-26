import { describe, expect, it } from 'vitest'
import { aplicar, invertir } from '../doc/comandos'
import { idSecuencial } from '../doc/ids'
import { documentoVacio, type Cable, type Punto } from '../doc/tipos'
import { partirEnUniones } from './normalizar'

const C = (id: string, ...pts: [number, number][]): Cable => ({ id, puntos: pts.map(([x, y]) => ({ x, y })) })
const P = (...pts: [number, number][]): Punto[] => pts.map(([x, y]) => ({ x, y }))
const docCon = (...cs: Cable[]) => {
  const d = documentoVacio()
  for (const c of cs) d.cables[c.id] = c
  return d
}

describe('partirEnUniones', () => {
  it('parte el cable por donde termina otro, en una T', () => {
    const d = docCon(C('m', [4, 0], [30, 0]), C('t', [10, 0], [10, 10]))
    const cmd = partirEnUniones(d, idSecuencial())!
    const n = aplicar(d, cmd)
    expect(Object.values(n.cables).map((c) => c.puntos)).toEqual(expect.arrayContaining([P([4, 0], [10, 0]), P([10, 0], [30, 0]), P([10, 0], [10, 10])]))
    expect(n.cables.m.puntos).toEqual(P([4, 0], [10, 0]))
    expect(Object.keys(n.cables)).toHaveLength(3)
    expect(aplicar(n, invertir(cmd))).toEqual(d)
  })

  it('es idempotente y no toca lo que ya está partido', () => {
    const d = docCon(C('m', [4, 0], [30, 0]), C('t', [10, 0], [10, 10]))
    const n = aplicar(d, partirEnUniones(d, idSecuencial())!)
    expect(partirEnUniones(n, idSecuencial())).toBeNull()
    expect(partirEnUniones(docCon(C('a', [0, 0], [10, 0]), C('b', [10, 0], [10, 6])), idSecuencial())).toBeNull()
  })

  it('parte en varios puntos y en vértices interiores, en orden', () => {
    const d = docCon(C('m', [0, 0], [20, 0], [20, 10]), C('a', [14, 0], [14, 4]), C('b', [6, 0], [6, -4]), C('v', [20, 0], [26, 0]))
    const n = aplicar(d, partirEnUniones(d, idSecuencial())!)
    expect(n.cables.m.puntos).toEqual(P([0, 0], [6, 0]))
    const resto = Object.values(n.cables).map((c) => c.puntos)
    expect(resto).toEqual(expect.arrayContaining([P([6, 0], [14, 0]), P([14, 0], [20, 0]), P([20, 0], [20, 10])]))
  })

  it('ignora un extremo propio y los tramos diagonales', () => {
    expect(partirEnUniones(docCon(C('a', [0, 0], [10, 0], [10, 6], [0, 6], [0, 0])), idSecuencial())).toBeNull()
    expect(partirEnUniones(docCon(C('d', [0, 0], [10, 10]), C('t', [5, 5], [5, 9])), idSecuencial())).toBeNull()
  })
})

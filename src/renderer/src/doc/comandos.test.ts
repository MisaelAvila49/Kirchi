import { describe, expect, it } from 'vitest'
import { aplicar, borrar, crear, fusionar, invertir, juntar, modificar } from './comandos'
import { documentoVacio, type Pieza } from './tipos'

const pieza = (id: string, x = 0): Pieza => ({ id, tipo: 'resistencia', ref: 'R1', x, y: 0, rot: 0, espejo: false, props: {} })

describe('comandos', () => {
  it('crear agrega sin tocar el documento original', () => {
    const d0 = documentoVacio()
    const d1 = aplicar(d0, crear('crear', 'piezas', pieza('a')))
    expect(d1.piezas.a.x).toBe(0)
    expect(d0.piezas).toEqual({})
    expect(d1.cables).toBe(d0.cables)
  })

  it('invertir deshace crear, modificar y borrar', () => {
    const d0 = aplicar(documentoVacio(), crear('c', 'piezas', pieza('a')))
    for (const cmd of [crear('c', 'piezas', pieza('b')), modificar('m', 'piezas', pieza('a'), pieza('a', 5)), borrar('b', 'piezas', pieza('a'))]) {
      expect(aplicar(aplicar(d0, cmd), invertir(cmd))).toEqual(d0)
    }
  })

  it('juntar aplica varios cambios en un paso y se invierte en orden', () => {
    const cmd = juntar('dos', [crear('c', 'piezas', pieza('a')), modificar('m', 'piezas', pieza('a'), pieza('a', 3))])
    const d1 = aplicar(documentoVacio(), cmd)
    expect(d1.piezas.a.x).toBe(3)
    expect(aplicar(d1, invertir(cmd))).toEqual(documentoVacio())
  })

  it('fusionar descarta cambios que se anulan (crear y borrar el mismo id)', () => {
    const f = fusionar(crear('c', 'piezas', pieza('a'), 'g'), borrar('b', 'piezas', pieza('a'), 'g'))
    expect(f.cambios).toHaveLength(0)
  })

  it('fusionar conserva el primer antes y el último después', () => {
    const a = modificar('mover', 'piezas', pieza('a', 0), pieza('a', 1), 'g')
    const b = modificar('mover', 'piezas', pieza('a', 1), pieza('a', 2), 'g')
    const f = fusionar(a, b)
    expect(f.cambios).toHaveLength(1)
    expect(f.cambios[0].antes).toEqual(pieza('a', 0))
    expect(f.cambios[0].despues).toEqual(pieza('a', 2))
    expect(f.grupo).toBe('g')
  })
})

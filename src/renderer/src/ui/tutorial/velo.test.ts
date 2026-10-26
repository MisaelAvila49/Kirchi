import { describe, expect, it } from 'vitest'
import { trazoRect, trazoVelo, unirFocos } from './velo'

describe('el velo con varios focos', () => {
  it('sin focos no hay velo', () => {
    expect(trazoVelo({ w: 100, h: 80 }, [])).toBe('')
    expect(trazoVelo({ w: 100, h: 80 }, [{ x: 5, y: 5, w: 0, h: 10 }])).toBe('')
  })

  it('un hueco por foco aparte: el trazo trae el marco y un subtrazo por foco', () => {
    const d = trazoVelo({ w: 200, h: 100 }, [{ x: 10, y: 10, w: 30, h: 20 }, { x: 100, y: 50, w: 40, h: 30 }])
    expect(d.startsWith('M0 0H200V100H0Z')).toBe(true)
    expect(d.match(/Z/g)).toHaveLength(3)
  })

  it('dos focos que se encilman o se tocan se juntan en su caja envolvente', () => {
    expect(unirFocos([{ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 }])).toEqual([{ x: 0, y: 0, w: 15, h: 15 }])
    expect(unirFocos([{ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 }])).toEqual([{ x: 0, y: 0, w: 20, h: 10 }])
    expect(unirFocos([{ x: 0, y: 0, w: 10, h: 10 }, { x: 30, y: 0, w: 10, h: 10 }])).toHaveLength(2)
  })

  it('une en cadena: A toca a B y B toca a C aunque A no toque a C', () => {
    const r = unirFocos([{ x: 0, y: 0, w: 10, h: 10 }, { x: 30, y: 0, w: 10, h: 10 }, { x: 8, y: 0, w: 24, h: 10 }])
    expect(r).toEqual([{ x: 0, y: 0, w: 40, h: 10 }])
  })

  it('el radio no pasa de la mitad del lado menor', () => {
    expect(trazoRect({ x: 0, y: 0, w: 10, h: 4 }, 8)).toContain('A2 2')
  })
})

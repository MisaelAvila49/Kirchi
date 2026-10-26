import { describe, expect, it } from 'vitest'
import { Rueda } from './rueda'

const ev = (deltaY: number, deltaMode = 0) => ({ deltaY, deltaMode })

describe('la rueda da un paso por muesca', () => {
  it('un ratón (100 px por muesca) da un paso por evento; arriba es −1', () => {
    const r = new Rueda(() => 0)
    expect(r.paso(ev(100))).toBe(1)
    expect(r.paso(ev(-100))).toBe(-1)
    expect(r.paso(ev(120))).toBe(1)
  })
  it('sin movimiento vertical no hace nada', () => {
    expect(new Rueda(() => 0).paso(ev(0))).toBe(0)
  })
  it('un panel táctil junta sus pasos chicos hasta una muesca, y no corre por la serie', () => {
    const r = new Rueda(() => 0)
    const pasos = Array.from({ length: 30 }, () => r.paso(ev(8)))
    // 240 px en pasos de 8: dos muescas, no treinta.
    expect(pasos.filter((p) => p !== 0)).toEqual([1, 1])
  })
  it('las líneas y las páginas cuentan como muescas', () => {
    const r = new Rueda(() => 0)
    expect(r.paso(ev(3, 1))).toBe(1)
    expect(r.paso(ev(1, 2))).toBe(1)
  })
  it('lo juntado se olvida tras una pausa', () => {
    let t = 0
    const r = new Rueda(() => t)
    expect(r.paso(ev(60))).toBe(0)
    t = 1000
    expect(r.paso(ev(60))).toBe(0)
  })
})

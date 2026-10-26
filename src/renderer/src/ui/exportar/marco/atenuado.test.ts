import { describe, expect, it } from 'vitest'
import { fueraDelArea } from './atenuado'

const hoja = { x: 10, y: 20, w: 200, h: 100 }
const superficie = (r: { w: number; h: number }[]) => r.reduce((s, p) => s + p.w * p.h, 0)

describe('lo que se atenúa fuera del área', () => {
  it('sin área no se atenúa nada', () => {
    expect(fueraDelArea(hoja, null)).toEqual([])
  })
  it('un área interior deja cuatro franjas que, con el área, suman la lámina', () => {
    const area = { x: 50, y: 40, w: 100, h: 50 }
    const f = fueraDelArea(hoja, area)
    expect(f).toHaveLength(4)
    expect(superficie(f) + area.w * area.h).toBe(hoja.w * hoja.h)
    expect(f.some((p) => p.x < area.x + area.w && p.x + p.w > area.x && p.y < area.y + area.h && p.y + p.h > area.y)).toBe(false)
  })
  it('un área pegada a un borde omite la franja vacía y una que sobresale se acota a la lámina', () => {
    expect(fueraDelArea(hoja, { x: 10, y: 20, w: 100, h: 100 })).toEqual([{ x: 110, y: 20, w: 100, h: 100 }])
    const f = fueraDelArea(hoja, { x: -50, y: 20, w: 100, h: 100 })
    expect(superficie(f)).toBe(200 * 100 - 40 * 100)
  })
  it('un área fuera de la lámina la atenúa entera', () => {
    expect(fueraDelArea(hoja, { x: 500, y: 500, w: 10, h: 10 })).toEqual([hoja])
  })
})

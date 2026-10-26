// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import type { Pieza, Rotacion } from '../doc/tipos'
import { libreriaDePrueba } from '../prueba/libreria'
import { cajaEnMundo } from '../piezas/transformar'
import { cajaDeCuerpo, cajaDeSeleccion } from './cajaPieza'

const lib = libreriaDePrueba().piezas
const vcc = (rot: Rotacion): Pieza => ({ id: 'v', tipo: 'alimentacion', ref: 'PWR1', x: 20, y: 20, rot, espejo: false, props: { nombre: 'VCC' } })
const area = (c: { minX: number; minY: number; maxX: number; maxY: number }) => (c.maxX - c.minX) * (c.maxY - c.minY)

describe('zona de selección del terminal de alimentación', () => {
  it.each([0, 90, 180, 270] as const)('con %d° es bastante menor que la caja de la definición y contiene el símbolo y su texto', (rot) => {
    const def = lib.get('alimentacion')!
    const p = vcc(rot)
    const c = cajaDeSeleccion(p, def)
    expect(area(c)).toBeLessThan(area(cajaEnMundo(p, def)) * 0.6)
    // El pin y la punta de la flecha quedan dentro.
    expect(c.minX).toBeLessThanOrEqual(20)
    expect(c.maxX).toBeGreaterThanOrEqual(20)
    expect(c.minY).toBeLessThanOrEqual(20)
    expect(c.maxY).toBeGreaterThanOrEqual(20)
  })

  it('el texto «VCC» a 0° queda dentro de la zona', () => {
    const def = lib.get('alimentacion')!
    const c = cajaDeSeleccion(vcc(0), def)
    // El rótulo va 4.4 unidades arriba del pin.
    expect(c.minY).toBeLessThanOrEqual(20 - 4.4)
  })

  it('las demás piezas conservan la caja de su definición', () => {
    const def = lib.get('resistencia')!
    const p: Pieza = { id: 'r', tipo: 'resistencia', ref: 'R1', x: 0, y: 0, rot: 0, espejo: false, props: {} }
    expect(cajaDeSeleccion(p, def, 0.2)).toEqual(cajaEnMundo(p, def, 0.2))
  })
})

describe('cuerpo de una pieza para el minimapa', () => {
  it('es el dibujo del símbolo, sin los rótulos, y nunca sale de la caja de la definición', () => {
    for (const [tipo, def] of lib) {
      const p: Pieza = { id: 'p', tipo, ref: 'X1', x: 10, y: 10, rot: 0, espejo: false, props: {} }
      const cuerpo = cajaDeCuerpo(p, def)
      const caja = cajaEnMundo(p, def)
      expect(cuerpo.minX, tipo).toBeGreaterThanOrEqual(caja.minX - 1e-9)
      expect(cuerpo.maxX, tipo).toBeLessThanOrEqual(caja.maxX + 1e-9)
      expect(cuerpo.minY, tipo).toBeGreaterThanOrEqual(caja.minY - 1e-9)
      expect(cuerpo.maxY, tipo).toBeLessThanOrEqual(caja.maxY + 1e-9)
    }
  })

  it('el terminal de alimentación no suma su texto: el cuerpo es menor que la zona de selección', () => {
    const def = lib.get('alimentacion')!
    expect(area(cajaDeCuerpo(vcc(0), def))).toBeLessThan(area(cajaDeSeleccion(vcc(0), def)))
  })

  it('gira con la pieza', () => {
    const def = lib.get('resistencia')!
    const p = (rot: Rotacion): Pieza => ({ id: 'r', tipo: 'resistencia', ref: 'R1', x: 0, y: 0, rot, espejo: false, props: {} })
    const a = cajaDeCuerpo(p(0), def), b = cajaDeCuerpo(p(90), def)
    expect(b.maxX - b.minX).toBeCloseTo(a.maxY - a.minY)
    expect(b.maxY - b.minY).toBeCloseTo(a.maxX - a.minX)
  })
})

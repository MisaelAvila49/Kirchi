import { describe, expect, it } from 'vitest'
import type { NetlistMotor, Onda } from '../netlist/netlist'
import { netlistEnContinua, ondaEnContinua } from './operacion'

describe('el punto de operación evalúa las fuentes en su valor de reposo', () => {
  it('senoidal en su offset, pulso y escalera en su nivel bajo, cuadrada en su nivel de arranque y continua igual', () => {
    const casos: [Onda, number][] = [
      [{ kind: 'dc', v: 5 }, 5],
      [{ kind: 'sine', offset: 2.5, amp: 2, freq: 1000 }, 2.5],
      [{ kind: 'sine', offset: 0, amp: 5, freq: 50, phase: 0.25 }, 0],
      [{ kind: 'pulse', low: 0.5, high: 5, freq: 1000, rise: 1e-6, fall: 1e-6, width: 4e-4 }, 0.5],
      [{ kind: 'stair', low: 1, high: 4, freq: 100, steps: 4 }, 1],
      [{ kind: 'square', low: 0, high: 3.3, freq: 1000, duty: 0.5 }, 3.3]
    ]
    for (const [w, v] of casos) expect(ondaEnContinua(w), w.kind).toEqual({ kind: 'dc', v })
  })

  it('la netlist en continua cambia las fuentes variables y los reactivos, y deja los índices', () => {
    const n: NetlistMotor = {
      nodes: 3,
      elements: [
        { type: 'V', a: 1, b: 0, wave: { kind: 'sine', offset: 1.5, amp: 3, freq: 60 } },
        { type: 'C', a: 1, b: 2, farads: 1e-6 },
        { type: 'L', a: 2, b: 0, henries: 1e-3 },
        { type: 'R', a: 1, b: 0, ohms: 1000 }
      ]
    }
    const c = netlistEnContinua(n)
    expect(c.elements.length).toBe(4)
    expect(c.elements[0]).toEqual({ type: 'V', a: 1, b: 0, wave: { kind: 'dc', v: 1.5 } })
    expect(c.elements[1].type).toBe('R')
    expect(c.elements[2].type).toBe('R')
    expect(c.elements[3]).toEqual(n.elements[3])
  })

  it('una fuente de corriente con onda también pasa a su valor de reposo', () => {
    const n = {
      nodes: 2,
      elements: [
        { type: 'I', a: 1, b: 0, amps: 0, wave: { kind: 'sine', offset: 0, amp: 1e-3, freq: 1000 } },
        { type: 'I', a: 1, b: 0, amps: 0, wave: { kind: 'pulse', low: 1e-4, high: 1e-3, freq: 1000, rise: 1e-6, fall: 1e-6, width: 4e-4 } },
        { type: 'I', a: 1, b: 0, amps: 2e-3 }
      ]
    } as unknown as NetlistMotor
    const c = netlistEnContinua(n)
    expect(c.elements[0]).toEqual({ type: 'I', a: 1, b: 0, amps: 0, wave: { kind: 'dc', v: 0 } })
    expect(c.elements[1]).toMatchObject({ wave: { kind: 'dc', v: 1e-4 } })
    expect(c.elements[2]).toEqual(n.elements[2])
  })
})

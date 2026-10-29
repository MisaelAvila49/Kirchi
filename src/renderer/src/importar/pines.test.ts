// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { libreriaDePrueba } from '../prueba/libreria'
import type { PiezaAjena } from './ajeno'
import { emparejarPines } from './pines'

const lib = libreriaDePrueba().piezas
const pieza = (tipo: string, pines: PiezaAjena['pines'], extra: Partial<PiezaAjena> = {}): PiezaAjena => ({ ref: 'X1', tipo, props: {}, pines, ...extra })

describe('emparejarPines', () => {
  it('reconoce los nombres de un amplificador operacional con cualquier convención', () => {
    for (const nombres of [['IN+', 'IN-', 'OUT', 'V+', 'V-'], ['+IN', '-IN', 'O', 'VCC', 'VEE'], ['inp', 'inn', 'out', 'vdd', 'vss'], ['NI', 'IM', 'OP', 'V+', 'V−']]) {
      const e = emparejarPines(pieza('X', nombres.map((nombre) => ({ nombre }))), lib.get('amp-op')!, {})
      expect([...e.pares.values()]).toEqual(['+', '-', 'OUT', 'V+', 'V-'])
      expect(e.sobrantes).toEqual([])
      expect(e.faltantes).toEqual([])
    }
  })

  it('con números de encapsulado usa las patillas de la hoja de datos', () => {
    const p = pieza('Amplifier_Operational:TL081', ['3', '2', '6', '7', '4'].map((numero) => ({ numero })))
    const e = emparejarPines(p, lib.get('amp-op')!, { modelo: 'TL081' }, { fisico: true })
    expect([...e.pares.values()]).toEqual(['+', '-', 'OUT', 'V+', 'V-'])
  })

  it('un transistor de SPICE sin nombres sigue el orden C B E aunque la pieza liste B C E', () => {
    const e = emparejarPines(pieza('Q', [{ numero: '1' }, { numero: '2' }, { numero: '3' }]), lib.get('npn')!, {})
    expect(e.pares.get('1')).toBe('C')
    expect(e.pares.get('2')).toBe('B')
    expect(e.pares.get('3')).toBe('E')
  })

  it('un MOSFET de SPICE sigue D G S y el cursor de un potenciómetro se reconoce por nombre', () => {
    const m = emparejarPines(pieza('M', [{ numero: '1' }, { numero: '2' }, { numero: '3' }]), lib.get('mosfet-n')!, {})
    expect([m.pares.get('1'), m.pares.get('2'), m.pares.get('3')]).toEqual(['D', 'G', 'S'])
    const pot = emparejarPines(pieza('174', [{ numero: '1' }, { numero: '2' }, { numero: '3', nombre: 'cursor' }]), lib.get('potenciometro')!, {})
    expect(pot.pares.get('3')).toBe('3')
    expect(pot.pares.get('1')).toBe('1')
  })

  it('un pin sobrante y uno faltante se informan', () => {
    const e = emparejarPines(pieza('r', [{ numero: '1' }, { numero: '2' }, { numero: '3' }]), lib.get('resistencia')!, {})
    expect(e.sobrantes).toEqual(['3'])
    const d = emparejarPines(pieza('X', [{ nombre: 'IN+' }, { nombre: 'IN-' }, { nombre: 'OUT' }]), lib.get('amp-op')!, {})
    expect(d.faltantes.sort()).toEqual(['V+', 'V-'])
  })
})

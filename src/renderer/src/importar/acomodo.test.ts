// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { LIMITE_COORDENADA } from '../doc/limites'
import { libreriaDePrueba } from '../prueba/libreria'
import type { CircuitoAjeno } from './ajeno'
import { proyectar } from './acomodo'
import { convertir } from './convertir'

const lib = libreriaDePrueba().piezas

describe('coordenadas absurdas de un archivo ajeno', () => {
  it('se acotan y nunca salen infinitas ni NaN', () => {
    for (const v of [Infinity, -Infinity, NaN, 1e300, -1e300, 2 ** 60]) {
      const p = proyectar({ unidadesPorMm: 1 }, v, v)
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true)
      expect(Math.abs(p.x)).toBeLessThanOrEqual(LIMITE_COORDENADA)
      expect(Math.abs(p.y)).toBeLessThanOrEqual(LIMITE_COORDENADA)
    }
    expect(proyectar({ unidadesPorMm: NaN }, 10, 10).x).toBeCloseTo(proyectar({ unidadesPorMm: 1 }, 10, 10).x)
  })

  it('un circuito con piezas en coordenadas gigantes se convierte sin colgarse', () => {
    const pieza = (ref: string, x: number) => ({ ref, tipo: 'r', valor: '1k', props: {}, x, y: x, pines: [{ nombre: '1', numero: '1', x, y: x }, { nombre: '2', numero: '2', x: x + 32, y: x }] })
    const ajeno: CircuitoAjeno = {
      formato: 'falstad',
      nombre: 'absurdo',
      unidadesPorMm: 6.4,
      piezas: [pieza('R1', 1e300), pieza('R2', -1e300), pieza('R3', Infinity), pieza('R4', 0)],
      redes: [],
      instrumentos: [],
      directivas: [],
      avisos: []
    }
    const t0 = performance.now()
    const r = convertir(ajeno, lib)
    expect(performance.now() - t0).toBeLessThan(5000)
    expect(r.fragmento.piezas.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true)
  })
})

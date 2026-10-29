// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { A, C, R, V, compilar, conOnda, corrida, fijarMemoria, leerCsv } from '../prueba/convertidoresMotor'
import type { Parte } from '../prueba/circuitos'
import init from './pkg/kirchi_engine.js'

// El DAC0808 de la Librería en el motor contra su hoja: la corriente de salida en los 256 códigos de la figura 1.

beforeAll(async () => {
  fijarMemoria((await init({ module_or_path: readFileSync(join(import.meta.dirname, 'pkg/kirchi_engine_bg.wasm')) })).memory)
})

describe('DAC0808: corriente de salida', () => {
  const entradas = (k: number) => String(1 + (k + 1) / 100)
  /** La figura 1 de la hoja: VREF de 10 V sobre R14 de 5 kΩ, R15 igual a tierra, VCC de 5 V, VEE de −15 V y una carga en IO. */
  const circuito = (rl: string, salidaDe: (pin: string) => string = (p) => p.toLowerCase()): Parte[] => [
    V('V1', '5', 'vcc'), V('V2', '-15', 'vee'), V('V3', '10', 'vref'),
    ...A.map((p, k) => V(`VB${k}`, entradas(k), salidaDe(p))),
    R('R14', '5k', 'refp', 'vref'), R('R15', '5k', 'refn', '0'), R('RL', rl, 'io', '0'), C('C1', '37p', 'comp', 'vee'),
    { tipo: 'dac0808', ref: 'U1', props: {}, pines: { ...Object.fromEntries(A.map((p) => [p, p.toLowerCase()])), IO: 'io', GND: '0', VEE: 'vee', VCC: 'vcc', 'VREF+': 'refp', 'VREF-': 'refn', COMP: 'comp' } }
  ]

  it('IO = IREF · (A1/2 + A2/4 + … + A8/256) en los 256 códigos, con IREF = VREF / R14 aunque R15 vaya a tierra', () => {
    const tabla = leerCsv('dac0808.corriente.csv')
    expect(tabla).toHaveLength(256)
    const c = compilar(circuito('1k'))
    // A1 es el bit más significativo: cada entrada recorre su bit del código 0 a 255, 3 µs por código.
    const PASO = 3e-6
    A.forEach((_, k) => {
      const puntos: [number, number][] = []
      for (let codigo = 0; codigo < 256; codigo++) {
        const antes = codigo ? ((codigo - 1) >> (7 - k)) & 1 : 0
        puntos.push([codigo * PASO, antes * 5], [codigo * PASO + 1e-9, ((codigo >> (7 - k)) & 1) * 5])
      }
      conOnda(c.r, Number(entradas(k)), puntos)
    })
    const sim = corrida(c.r)
    const io = c.nodo('io')
    const peor = { error: 0, codigo: -1 }
    for (const [codigo, mA] of tabla) {
      sim.advance_to((codigo + 1) * PASO - 10e-9, 1e9)
      // La carga de 1 kΩ va de tierra a IO: la corriente que el DAC hunde baja el voltaje de IO.
      const error = Math.abs(sim.voltages()[io] + mA * 1e-3 * 1000)
      if (error > peor.error) Object.assign(peor, { error, codigo })
    }
    sim.free()
    expect(peor.error).toBeLessThan(1e-6)
    expect(tabla[255][1]).toBeCloseTo(1.992188, 6)
  }, 120000)
})


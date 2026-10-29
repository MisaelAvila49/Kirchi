// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { A, DB, MARCA_VIN, MARCA_WR, R, V, adc, codigoDe, compilar, conOnda, corrida, fijarMemoria, niveles, relojRc } from '../prueba/convertidoresMotor'
import type { Parte } from '../prueba/circuitos'
import init from './pkg/kirchi_engine.js'

// El ADC0804 manejando un DAC0808: el código de la conversión sale como corriente por IO.

beforeAll(async () => {
  fijarMemoria((await init({ module_or_path: readFileSync(join(import.meta.dirname, 'pkg/kirchi_engine_bg.wasm')) })).memory)
})

describe('lazo ADC0804 a DAC0808', () => {
  it('el código del ADC sale por IO del DAC como IREF · código / 256 en toda la rampa de entrada', () => {
    const bits = DB.map((_, k) => `db${7 - k}`)
    const partes: Parte[] = [
      V('V1', '5', 'vcc'), V('V2', '2.5', 'vref2'), V('V3', String(MARCA_WR), 'wr'), V('V4', String(MARCA_VIN), 'vin'), V('V6', '-15', 'vee'), V('V7', '5', 'vref'),
      adc({}), ...relojRc,
      R('R14', '2.5k', 'refp', 'vref'), R('R15', '2.5k', 'refn', '0'), R('RL', '1k', 'io', '0'),
      { tipo: 'dac0808', ref: 'U2', props: {}, pines: { ...Object.fromEntries(A.map((p, k) => [p, bits[k]])), IO: 'io', GND: '0', VEE: 'vee', VCC: 'vcc', 'VREF+': 'refp', 'VREF-': 'refn', COMP: 'comp' } }
    ]
    const { r, msi, nodo } = compilar(partes)
    const vins = [0, 0.4, 1.6, 2.5, 3.3, 4.97]
    const PERIODO = 140e-6
    const vin: [number, number][] = [[0, 0]]
    const wr: [number, number][] = [[0, 5]]
    vins.forEach((v, k) => {
      const t0 = 20e-6 + k * PERIODO
      vin.push([t0 - 10e-6, k ? vins[k - 1] : 0], [t0 - 10e-6 + 1e-9, v])
      wr.push([t0, 5], [t0 + 1e-9, 0], [t0 + 301e-9, 0], [t0 + 302e-9, 5])
    })
    conOnda(r, MARCA_VIN, vin)
    conOnda(r, MARCA_WR, wr)
    const sim = corrida(r)
    const io = nodo('io')
    // La vista previa llama a advance_to en cada cuadro; aquí se avanza de 2 µs en 2 µs.
    const avanzar = (hasta: number) => {
      while (sim.time() < hasta - 1e-12) sim.advance_to(Math.min(hasta, sim.time() + 2e-6), 1e9)
    }
    const dados = vins.map((v, k) => {
      avanzar(20e-6 + k * PERIODO + 130e-6)
      return { codigo: codigoDe(niveles(sim), msi!), esperado: Math.min(255, Math.max(0, Math.round(v / (5 / 256)))), vio: sim.voltages()[io] }
    })
    // Los flancos de 20 ns del ADC pasan por la zona entre los umbrales del DAC sin que eso sea una entrada sin nivel.
    const sinNivel = Array.from(sim.take_indefinidos())
    sim.free()
    expect(sinNivel).toEqual([])
    for (const d of dados) {
      expect(d.codigo).toBe(d.esperado)
      // IREF = 5 V / 2.5 kΩ = 2 mA; la carga de 1 kΩ va de tierra a IO.
      expect(d.vio).toBeCloseTo(-2e-3 * (d.codigo / 256) * 1000, 4)
    }
  }, 60000)
})

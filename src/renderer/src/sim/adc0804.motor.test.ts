// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { frecuenciaDelReloj } from '../netlist/convertidores'
import { MARCA_VIN, MARCA_WR, V, adc, compilar, conOnda, convertir, corrida, fijarMemoria, leerCsv, niveles, relojRc } from '../prueba/convertidoresMotor'
import init from './pkg/kirchi_engine.js'

// El ADC0804 de la Librería en el motor contra su hoja: la función de transferencia con su medio LSB (las 255 transiciones) y el tiempo de
// conversión en periodos de reloj.

beforeAll(async () => {
  fijarMemoria((await init({ module_or_path: readFileSync(join(import.meta.dirname, 'pkg/kirchi_engine_bg.wasm')) })).memory)
})

describe('ADC0804: función de transferencia', () => {
  it('cada transición de la hoja (n − 1/2 LSB con VREF/2 de 2.5 V) cambia el código de n − 1 a n', () => {
    const transiciones = leerCsv('adc0804.transiciones.csv')
    expect(transiciones).toHaveLength(255)
    const pruebas: { vin: number; codigo: number }[] = [{ vin: 0, codigo: 0 }, { vin: 5.1, codigo: 255 }]
    for (const [n, mv] of transiciones) pruebas.push({ vin: mv / 1000 - 1e-3, codigo: n - 1 }, { vin: mv / 1000 + 1e-3, codigo: n })
    const dados = convertir([V('V1', '5', 'vcc'), V('V2', '2.5', 'vref2'), V('V3', String(MARCA_WR), 'wr'), V('V4', String(MARCA_VIN), 'vin'), adc({}), ...relojRc], pruebas.map((p) => p.vin))
    const malas = pruebas.flatMap((p, k) => (dados[k] === p.codigo ? [] : [`VIN ${p.vin.toFixed(5)} V dio ${dados[k]} y la hoja pide ${p.codigo}`]))
    expect(malas).toEqual([])
  }, 120000)

  it('con otro VREF/2 el fondo de escala y el medio LSB siguen a la referencia', () => {
    // LSB = 2 · 1 V / 256 = 7.8125 mV: la primera transición cae en 3.906 mV y la del código 100 en 99.5 LSB.
    const lsb = 2 / 256
    const casos = [{ vin: 0.5 * lsb - 0.5e-3, codigo: 0 }, { vin: 0.5 * lsb + 0.5e-3, codigo: 1 }, { vin: 99.5 * lsb - 0.5e-3, codigo: 99 }, { vin: 99.5 * lsb + 0.5e-3, codigo: 100 }, { vin: 2.1, codigo: 255 }]
    expect(convertir([V('V1', '5', 'vcc'), V('V2', '1', 'vref2'), V('V3', String(MARCA_WR), 'wr'), V('V4', String(MARCA_VIN), 'vin'), adc({}), ...relojRc], casos.map((c) => c.vin))).toEqual(casos.map((c) => c.codigo))
  }, 60000)

  it('con VREF/2 al aire el fondo de escala es VCC: la mitad de VCC por dos', () => {
    const lsb = 5 / 256
    expect(convertir([V('V1', '5', 'vcc'), V('V3', String(MARCA_WR), 'wr'), V('V4', String(MARCA_VIN), 'vin'), adc({ 'VREF/2': 'aire' }), ...relojRc], [0.5 * lsb - 1e-3, 0.5 * lsb + 1e-3, 127.5 * lsb + 1e-3])).toEqual([0, 1, 128])
  }, 60000)
})

describe('ADC0804: tiempo de conversión', () => {
  it('INTR baja entre 65 y 72 periodos de reloj después de la subida de WR, con el reloj de la fórmula de la hoja', () => {
    // RD en alto para que INTR siga a la bandera de fin de conversión.
    const { r, msi } = compilar([V('V1', '5', 'vcc'), V('V2', '2.5', 'vref2'), V('V5', '5', 'rd'), V('V3', String(MARCA_WR), 'wr'), V('V4', '1.7', 'vin'), adc({ RD: 'rd' }), ...relojRc])
    conOnda(r, MARCA_WR, [[0, 0], [20e-6, 0], [20e-6 + 1e-9, 5]])
    const intr = msi!.salidas[16]
    const sim = corrida(r)
    sim.advance_to(20e-6 + 2e-9, 1e9)
    expect(niveles(sim)[intr]).toBe(1)
    let t = 20e-6
    let baja = Number.NaN
    while (t < 20e-6 + 200e-6) {
      t += 100e-9
      sim.advance_to(t, 1e9)
      if (niveles(sim)[intr] === 0) {
        baja = t
        break
      }
    }
    sim.free()
    const periodos = (baja - 20e-6) * frecuenciaDelReloj(10e3, 150e-12, 3.1, 1.8)
    // La hoja da 66 a 73 periodos por conversión (103 a 114 µs a 640 kHz) y 65 a 72 como 64 de aproximación más el arranque.
    expect(periodos).toBeGreaterThanOrEqual(65)
    expect(periodos).toBeLessThanOrEqual(72)
    expect(periodos).toBeCloseTo(66.2, 0)
  }, 60000)
})


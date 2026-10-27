import { describe, expect, it } from 'vitest'
import { FORMAS } from './ajustes'
import { admiteRms, AYUDA_MEDIDA, medidaAVpp, medidaEfectiva, vppAMedida } from './medidaAmplitud'

describe('medida de la amplitud', () => {
  it('senoidal: 7.07 mVrms son 20 mVpp', () => {
    expect(medidaAVpp('Senoidal', 'rms', 7.07e-3)).toBeCloseTo(20e-3, 4)
    expect(vppAMedida('Senoidal', 'rms', 20e-3)).toBeCloseTo(7.071e-3, 5)
  })
  it('cuadrada: rms igual al pico', () => {
    expect(vppAMedida('Cuadrada', 'rms', 4)).toBeCloseTo(2, 12)
    expect(medidaAVpp('Cuadrada', 'rms', 2)).toBeCloseTo(4, 12)
  })
  it('triangular y diente de sierra: Vp / raíz de 3', () => {
    for (const f of ['Triangular', 'Diente de sierra'] as const) {
      expect(vppAMedida(f, 'rms', 6)).toBeCloseTo(3 / Math.sqrt(3), 12)
      expect(medidaAVpp(f, 'rms', 3 / Math.sqrt(3))).toBeCloseTo(6, 12)
    }
  })
  it('pico es la mitad del pico a pico', () => {
    expect(vppAMedida('Pulso', 'pico', 5)).toBe(2.5)
    expect(medidaAVpp('Pulso', 'pico', 2.5)).toBe(5)
  })
  it('pulso, escalón y escalera no admiten rms y caen a pico a pico', () => {
    for (const f of ['Pulso', 'Escalón', 'Escalera'] as const) {
      expect(admiteRms(f)).toBe(false)
      expect(medidaEfectiva(f, 'rms')).toBe('pp')
      expect(vppAMedida(f, 'rms', 3)).toBe(3)
    }
  })
  it('ida y vuelta en toda forma y medida', () => {
    for (const f of FORMAS) for (const m of ['pp', 'pico', 'rms'] as const) expect(medidaAVpp(f, m, vppAMedida(f, m, 3.7))).toBeCloseTo(3.7, 12)
  })
})

describe('globos de la amplitud', () => {
  it('Pico dice de dónde a dónde va la señal y ningún globo lleva guion largo', () => {
    expect(AYUDA_MEDIDA.pico).toBe('La señal va de offset − Vp a offset + Vp.')
    for (const t of Object.values(AYUDA_MEDIDA)) expect(t).not.toContain('—')
  })
})

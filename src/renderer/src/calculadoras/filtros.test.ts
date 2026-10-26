import { describe, expect, it } from 'vitest'
import { type Calculo } from './formulas'
import { notchDobleT, pasaBanda, rechazaBanda, respuestaNotch, respuestaPasaBanda, respuestaRechazaBanda } from './filtros'
import { redondeoDe } from './redondeo'

const E12 = redondeoDe('E12')
const mod = (z: { re: number; im: number }) => Math.hypot(z.re, z.im)

function ok<T extends object>(r: Calculo<T>): { ok: true } & T {
  if (!r.ok) throw new Error(r.error)
  return r
}
const error = (r: Calculo<object>) => (r.ok ? '' : r.error)

describe('pasa banda RC-RC', () => {
  it('valores de libro: fL 159.15 Hz con 100 nF da R1 = 10 kΩ; R2 = 10 · R1 = 100 kΩ y fH 15.9 kHz da C2 = 100 pF', () => {
    const r = ok(pasaBanda({ fl: 1 / (2 * Math.PI * 10e3 * 100e-9), fh: 1 / (2 * Math.PI * 100e3 * 100e-12), c: 100e-9 }))
    expect(r.r1).toBeCloseTo(10e3, 6)
    expect(r.r2).toBeCloseTo(100e3, 5)
    expect(r.c2).toBeCloseTo(100e-12, 15)
    expect(r.flReal).toBeCloseTo(159.155, 2)
    expect(r.fhReal).toBeCloseTo(15915.5, 0)
    expect(r.f0).toBeCloseTo(Math.sqrt(159.155 * 15915.5), 1)
  })
  it('la respuesta exacta con carga queda entre la del producto de las dos secciones sueltas y un poco menos', () => {
    const r = ok(pasaBanda({ fl: 159.155, fh: 15915.5, c: 100e-9 }))
    // Sin carga, al centro: (f0/fL)/√(1+(f0/fL)²) · 1/√(1+(f0/fH)²) = 0.9901.
    expect(r.gCentro).toBeLessThan(0.9901)
    expect(r.gCentro).toBeGreaterThan(0.97)
    expect(r.gPico).toBeGreaterThanOrEqual(r.gCentro)
    // Los cortes a −3 dB (contra el pico, que no llega a 1) quedan a pocos por ciento de los de las secciones sueltas.
    expect(r.fl3).toBeGreaterThan(r.flReal * 0.9)
    expect(r.fl3).toBeLessThan(r.flReal * 1.5)
    expect(r.fh3).toBeLessThan(r.fhReal * 1.1)
    expect(r.fh3).toBeGreaterThan(r.fhReal * 0.6)
  })
  it('lejos de la banda la respuesta cae a 20 dB por década en cada lado', () => {
    const r = ok(pasaBanda({ fl: 159.155, fh: 15915.5, c: 100e-9 }))
    const H = (f: number) => mod(respuestaPasaBanda(f, r.r1c, r.c1c, r.r2c, r.c2c))
    expect(H(1.5915) / H(15.915)).toBeCloseTo(0.1, 2)
    expect(H(1591550) / H(159155)).toBeCloseTo(0.1, 1)
  })
  it('con E12 los comerciales mueven los cortes poco y la segunda sección sigue 10 veces más resistiva', () => {
    const r = ok(pasaBanda({ fl: 100, fh: 10e3, c: 100e-9 }, E12))
    expect(r.c1c).toBe(100e-9)
    expect(r.r1c).toBe(15e3)
    expect(r.r2c).toBe(150e3)
    expect(Math.abs(r.flReal / 100 - 1)).toBeLessThan(0.1)
    expect(Math.abs(r.fhReal / 10e3 - 1)).toBeLessThan(0.1)
  })
  it('con cortes juntos avisa del pico bajo, con el orden equivocado o con ceros no calcula', () => {
    expect(ok(pasaBanda({ fl: 1000, fh: 2000, c: 100e-9 })).avisos.join(' ')).toMatch(/pico baja/)
    expect(error(pasaBanda({ fl: 2000, fh: 1000, c: 100e-9 }))).toMatch(/mayor que el inferior/)
    expect(error(pasaBanda({ fl: 0, fh: 1000, c: 100e-9 }))).toMatch(/mayor que cero/)
    expect(error(pasaBanda({ fl: 100, fh: 1000, c: NaN }))).toMatch(/mayor que cero/)
  })
})

describe('rechaza banda (pasa bajas + pasa altas + sumador)', () => {
  it('valores de libro: con 100 nF, fL 100 Hz da 15.9 kΩ y fH 10 kHz da 159 Ω; el sumador pesa 10 veces la más alta', () => {
    const r = ok(rechazaBanda({ fl: 100, fh: 10e3, c: 100e-9 }))
    expect(r.r1).toBeCloseTo(15915.5, 0)
    expect(r.r2).toBeCloseTo(159.155, 2)
    expect(r.rs).toBeCloseTo(159155, 0)
  })
  it('con sumador ideal (resistencias enormes) la profundidad en el centro es la de libro: |LP + HP| = 2 · 0.0995 · 0.0995 = 0.0197', () => {
    // Textbook: en f0 = 1 kHz, |LP| = |HP| = 1/√101 con fases ∓84.3°, y la suma es real: 2 · cos(84.3°) / √101.
    const H = mod(respuestaRechazaBanda(1000, 1 / (2 * Math.PI * 100 * 100e-9), 1 / (2 * Math.PI * 10e3 * 100e-9), 100e-9, 1e12))
    expect(H).toBeCloseTo((2 * Math.cos(Math.atan(10))) / Math.sqrt(101), 4)
    expect(H).toBeCloseTo(0.0197, 3)
  })
  it('con el sumador del cálculo la muesca queda cerca de −34 dB y la banda baja pasa con Rs / (Rs + R1)', () => {
    const r = ok(rechazaBanda({ fl: 100, fh: 10e3, c: 100e-9 }))
    expect(r.gMin).toBeLessThan(0.04)
    expect(r.gMin).toBeGreaterThan(0.01)
    expect(r.fMin / r.f0).toBeGreaterThan(0.5)
    expect(r.fMin / r.f0).toBeLessThan(2)
    expect(r.gBaja).toBeCloseTo(r.rs / (r.rs + r.r1c), 9)
    expect(r.gBaja).toBeCloseTo(0.909, 2)
    expect(r.gAlta).toBeCloseTo(1, 2)
  })
  it('cortes juntos o en desorden: aviso y error', () => {
    expect(ok(rechazaBanda({ fl: 1000, fh: 1500, c: 100e-9 })).avisos.join(' ')).toMatch(/muesca solo baja/)
    expect(error(rechazaBanda({ fl: 5000, fh: 1000, c: 100e-9 }))).toMatch(/tiene que ser mayor/)
  })
})

describe('notch de doble T', () => {
  it('f0 = 1 / (2π · R · C): 1 kHz con 100 nF da R = 1.5915 kΩ', () => {
    const r = ok(notchDobleT({ f0: 1000, c: 100e-9 }))
    expect(r.r).toBeCloseTo(1591.55, 1)
    expect(r.f0Real).toBeCloseTo(1000, 6)
    expect(r.q).toBe(0.25)
  })
  it('la respuesta de libro: cero en f0 y 0.927 una década antes y una después (Q = 1/4)', () => {
    expect(mod(respuestaNotch(1))).toBeLessThan(1e-12)
    expect(mod(respuestaNotch(0.1))).toBeCloseTo(0.927, 3)
    expect(mod(respuestaNotch(10))).toBeCloseTo(0.927, 3)
    // |H|² = (1 − x²)² / ((1 − x²)² + 16 x²): en x = 0.1 es 0.9801 / 1.1401.
    expect(mod(respuestaNotch(0.1)) ** 2).toBeCloseTo(0.9801 / 1.1401, 6)
  })
  it('con E12 la frecuencia real sale de R y C comerciales', () => {
    const r = ok(notchDobleT({ f0: 1000, c: 100e-9 }, E12))
    expect(r.rc).toBe(1500)
    expect(r.f0Real).toBeCloseTo(1 / (2 * Math.PI * 1500 * 100e-9), 6)
  })
  it('R baja avisa y los datos inválidos no calculan', () => {
    expect(ok(notchDobleT({ f0: 1e6, c: 100e-9 })).avisos.join(' ')).toMatch(/carga mucho/)
    expect(error(notchDobleT({ f0: -1, c: 100e-9 }))).toMatch(/mayor que cero/)
  })
})

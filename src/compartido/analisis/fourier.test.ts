import { describe, expect, it } from 'vitest'
import { fourier } from './fourier'

describe('fourier', () => {
  const n = 4001
  const t = Float64Array.from({ length: n }, (_, i) => (i * 3e-3) / (n - 1))
  const y = Float64Array.from(t, (x) => 1 + 2 * Math.cos(2 * Math.PI * 1000 * x + 0.5) + 0.5 * Math.cos(2 * Math.PI * 3000 * x))
  it('recupera continua, magnitudes, fase y THD de una suma de senos', () => {
    for (const ventana of ['rectangular', 'hann'] as const) {
      const r = fourier(t, y, { fundamental: 1000, armonicos: 5, periodos: 2, ventana, puntosPorPeriodo: 256 })
      expect(r.continua).toBeCloseTo(1, 2)
      expect(r.armonicos[0].magnitud).toBeCloseTo(2, 2)
      expect(r.armonicos[2].magnitud).toBeCloseTo(0.5, 2)
      expect(r.armonicos[1].magnitud).toBeLessThan(0.01)
      expect(r.thd).toBeCloseTo(25, 0)
      expect(r.armonicos[0].fase).toBeCloseTo(((0.5 + 2 * Math.PI * 1000 * (3e-3 - 2e-3)) * 180) / Math.PI % 360, 0)
    }
  })
  it('avisa si el transitorio es mas corto que la ventana', () => {
    expect(() => fourier(t, y, { fundamental: 1000, armonicos: 3, periodos: 10, ventana: 'rectangular', puntosPorPeriodo: 64 })).toThrow(/más corto/)
  })
  it('da lo mismo que la suma directa con cos y sen por armónico', () => {
    const o = { fundamental: 1000, armonicos: 7, periodos: 3, ventana: 'hann' as const, puntosPorPeriodo: 256 }
    const r = fourier(t, y, o)
    const N = o.periodos * o.puntosPorPeriodo
    const T = 1 / o.fundamental
    const t0 = 3e-3 - o.periodos * T
    const x = Float64Array.from({ length: N }, (_, i) => 1 + 2 * Math.cos(2 * Math.PI * 1000 * (t0 + (i * T) / o.puntosPorPeriodo) + 0.5) + 0.5 * Math.cos(2 * Math.PI * 3000 * (t0 + (i * T) / o.puntosPorPeriodo)))
    for (let n = 1; n <= o.armonicos; n++) {
      let re = 0
      let im = 0
      let sw = 0
      for (let i = 0; i < N; i++) {
        const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N)
        sw += w
        re += w * x[i] * Math.cos((2 * Math.PI * n * o.periodos * i) / N)
        im -= w * x[i] * Math.sin((2 * Math.PI * n * o.periodos * i) / N)
      }
      expect(r.armonicos[n - 1].magnitud).toBeCloseTo((2 * Math.hypot(re, im)) / sw, 3)
    }
  })
  it('rechaza una configuración que pide demasiado cálculo y el peor caso permitido es rápido', () => {
    const tg = Float64Array.from({ length: 1000 }, (_, i) => (i * 0.1) / 999)
    expect(() => fourier(tg, tg, { fundamental: 1000, armonicos: 200, periodos: 100, ventana: 'rectangular', puntosPorPeriodo: 40_000 })).toThrow(/demasiado/)
    const largo = Float64Array.from({ length: 400_000 }, (_, i) => (i * 0.1) / 399_999)
    const t0 = Date.now()
    const r = fourier(largo, largo, { fundamental: 1000, armonicos: 200, periodos: 100, ventana: 'rectangular', puntosPorPeriodo: 4000 })
    expect(r.armonicos).toHaveLength(200)
    expect(Date.now() - t0).toBeLessThan(5000)
  })
})

import { describe, expect, it } from 'vitest'
import { FpsMeter } from './fps'

describe('FpsMeter', () => {
  it('mide 60 fps con cuadros de 16.67 ms', () => {
    const m = new FpsMeter()
    for (let i = 0; i <= 60; i++) m.frame(i * (1000 / 60))
    const s = m.stats()
    expect(s.fps).toBeCloseTo(60, 1)
    expect(s.p95ms).toBeCloseTo(16.67, 1)
  })

  it('un tirón de 50 ms aparece en el p95', () => {
    const m = new FpsMeter()
    let t = 0
    for (let i = 0; i < 40; i++) m.frame((t += 16.67))
    for (let i = 0; i < 3; i++) m.frame((t += 50))
    expect(m.stats().p95ms).toBeCloseTo(50, 0)
  })

  it('olvida lo anterior a un segundo', () => {
    const m = new FpsMeter()
    m.frame(0)
    m.frame(10)
    m.frame(2000)
    m.frame(2020)
    expect(m.stats().fps).toBeCloseTo(50, 5)
  })

  it('sin cuadros suficientes devuelve cero', () => {
    expect(new FpsMeter().stats()).toEqual({ fps: 0, p95ms: 0 })
  })
})

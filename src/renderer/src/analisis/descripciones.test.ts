import { describe, expect, it } from 'vitest'
import { AJUSTES_DE_FICHA, DESCRIPCION_FICHA, PISTAS } from './descripciones'
import { TIPOS_FICHA } from './fichas'

const textos = (): [string, string][] => [
  ...TIPOS_FICHA.flatMap((t): [string, string][] => [[`${t}.mide`, DESCRIPCION_FICHA[t].mide], [`${t}.veras`, DESCRIPCION_FICHA[t].veras]]),
  ...Object.entries(PISTAS)
]

describe('descripciones de las fichas de análisis (N8b)', () => {
  it('cada tipo de ficha tiene «Qué mide» y «Qué verás»', () => {
    for (const t of TIPOS_FICHA) {
      expect(DESCRIPCION_FICHA[t].mide.length, t).toBeGreaterThan(10)
      expect(DESCRIPCION_FICHA[t].veras.length, t).toBeGreaterThan(10)
    }
  })
  it('cada ajuste de cada ficha tiene su pista, y no sobra ninguna', () => {
    const usadas = new Set(Object.values(AJUSTES_DE_FICHA).flat())
    for (const k of usadas) expect(PISTAS[k], k).toBeTruthy()
    for (const k of Object.keys(PISTAS)) expect(usadas.has(k), k).toBe(true)
  })
  it('una idea por texto: una sola frase de hasta 22 palabras, sin guiones largos ni punto y coma', () => {
    for (const [k, t] of textos()) {
      expect(t.endsWith('.'), k).toBe(true)
      expect(t.slice(0, -1).includes('. '), k).toBe(false)
      expect(t.split(/\s+/).length, k).toBeLessThanOrEqual(22)
      expect(t, k).not.toMatch(/—|;/)
    }
  })
  it('los textos no quedan con espacios de más ni con la estructura «no es X, es Y»', () => {
    for (const [k, t] of textos()) {
      expect(t, k).toBe(t.trim())
      expect(t, k).not.toMatch(/ {2}/)
      expect(t, k).not.toMatch(/\bno es\b.*\bes\b/i)
    }
  })
})

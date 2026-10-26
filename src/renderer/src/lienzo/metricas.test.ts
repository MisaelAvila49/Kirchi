import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import tabla from './metricas.json'
import { anchoEnEm, avance, AVANCE_RESPALDO } from './metricas'

const e = (fuente: 'sans' | 'serif' | 'mono', negrita = false, cursiva = false) => ({ fuente, negrita, cursiva })

describe('métricas de las fuentes incluidas', () => {
  it('la tabla trae las tres fuentes con sus cuatro variantes y un avance por carácter', () => {
    expect(Object.keys(tabla.fuentes).sort()).toEqual(['mono', 'sans', 'serif'])
    const n = Array.from(tabla.caracteres).length
    for (const f of Object.values(tabla.fuentes)) {
      expect(Object.keys(f).sort()).toEqual(['cursiva', 'negrita', 'negritaCursiva', 'normal'])
      for (const v of Object.values(f)) expect(v).toHaveLength(n)
    }
    // Lo que se escribe en una nota técnica está medido en las tres; µ y Ω se miden con el griego de Source Serif, que es el respaldo de las pilas.
    const medido = (c: string, f: 'sans' | 'serif' | 'mono') => tabla.fuentes[f].normal[Array.from(tabla.caracteres).indexOf(c)] !== null
    for (const c of 'AaÁáÑñ0123456789.,;:-()°±×µΩμ') for (const f of ['sans', 'serif', 'mono'] as const) expect(medido(c, f), `${c} ${f}`).toBe(true)
  })

  it('las métricas son de las fuentes instaladas: la huella de los .woff2 coincide y las versiones están fijas', async () => {
    const raiz = join(import.meta.dirname, '../../../..')
    const comun = (await import(pathToFileURL(join(raiz, 'scripts/fuentes-comun.mjs')).href)) as { huellaFuentes: () => string }
    // Si falla: las fuentes cambiaron; correr `node scripts/metricas-fuentes.mjs` y revisar el reparto de las notas.
    expect(comun.huellaFuentes()).toBe((tabla as { huella?: string }).huella)
    const pkg = JSON.parse(readFileSync(join(raiz, 'package.json'), 'utf8')) as { dependencies: Record<string, string> }
    for (const f of ['mona-sans', 'geist-mono', 'source-serif-4']) expect(pkg.dependencies[`@fontsource-variable/${f}`], f).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('Geist Mono es monoespaciada a 0.6 em, en negrita y cursiva también', () => {
    for (const [n, c] of [[false, false], [true, false], [false, true], [true, true]] as const) {
      expect(anchoEnEm('Mil', e('mono', n, c))).toBeCloseTo(1.8, 9)
      expect(anchoEnEm('iiii', e('mono', n, c))).toBeCloseTo(anchoEnEm('MMMM', e('mono', n, c)), 9)
    }
  })

  it('en Mona Sans y Source Serif la M es más ancha que la i y la negrita ensancha', () => {
    for (const f of ['sans', 'serif'] as const) {
      expect(avance('M', e(f))).toBeGreaterThan(2 * avance('i', e(f)))
      expect(anchoEnEm('negrita', e(f, true))).toBeGreaterThan(anchoEnEm('negrita', e(f)))
    }
  })

  it('µ y Ω no usan el respaldo en ninguna fuente; el signo ohm es el mismo glifo que la omega', () => {
    for (const f of ['sans', 'serif', 'mono'] as const) {
      for (const c of [String.fromCharCode(0x3a9), String.fromCharCode(0x2126)]) expect(avance(c, e(f)), `${c} ${f}`).not.toBe(AVANCE_RESPALDO)
      if (f !== 'mono') expect(avance('µ', e(f))).not.toBe(AVANCE_RESPALDO)
      expect(avance(String.fromCharCode(0x2126), e(f))).toBe(avance(String.fromCharCode(0x3a9), e(f)))
    }
    // Mona Sans no trae µ ni Ω: salen del mismo glifo que en Source Serif.
    expect(avance(String.fromCharCode(0x3a9), e('sans'))).toBe(avance(String.fromCharCode(0x3a9), e('serif')))
  })

  it('un carácter sin medir usa el avance de respaldo y el ancho suma los avances', () => {
    expect(avance('漢', e('sans'))).toBe(AVANCE_RESPALDO)
    expect(anchoEnEm('a漢', e('sans'))).toBeCloseTo(avance('a', e('sans')) + AVANCE_RESPALDO, 9)
    expect(anchoEnEm('', e('serif'))).toBe(0)
  })
})

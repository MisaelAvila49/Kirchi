import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { carpetaHerramientas } from './recursos'
import { localizarNgspice, ServicioNgspice } from './servicioNgspice'

// El barrido de CA con muchos puntos y con frecuencias incluidas, en el ngspice real. Sin `herramientas/ngspice` se omite.
const raiz = join(import.meta.dirname, '../..')
const ejecutable = localizarNgspice({ empaquetado: false, carpetaHerramientas: carpetaHerramientas({ empaquetado: false, resourcesPath: '', appPath: raiz }), appPath: raiz })
const hay = (() => {
  if (!ejecutable) return false
  const r = spawnSync(ejecutable, ['-n', '-v'], { encoding: 'utf8', windowsHide: true })
  return /ngspice-47\b/.test(`${r.stdout}${r.stderr}`)
})()

/** RC pasa bajas de 1 kΩ y 1 µF (corte en 159.15 Hz) excitado por el elemento 0. */
const netlist = { nodes: 3, elements: [{ type: 'V', a: 1, b: 0, wave: { kind: 'dc', v: 0 } }, { type: 'R', a: 1, b: 2, ohms: 1000 }, { type: 'C', a: 2, b: 0, farads: 1e-6 }] }
const servicio = new ServicioNgspice({ ejecutable: ejecutable ?? 'ngspice', limiteMs: 120_000 })
const frecuencias = (g: { vectores: { referencia: { tipo: string }; re: Float64Array }[] }) => g.vectores.find((v) => v.referencia.tipo === 'escala')!.re

describe.skipIf(!hay)('barrido de CA en ngspice', () => {
  it('10,000 puntos por década en tres décadas dan 30,001 puntos', async () => {
    const r = await servicio.ejecutar(1, { netlist, analisis: { tipo: 'ac', barrido: 'dec', puntos: 10_000, desde: 1, hasta: 1000, fuente: 0 } })
    if (!r.ok) throw new Error(r.error)
    expect(r.graficos).toHaveLength(1)
    expect(r.graficos[0].puntos).toBe(30_001)
  }, 120_000)

  it('incluir 60 Hz lo deja exacto en un solo gráfico ordenado, y la rejilla sigue completa', async () => {
    const r = await servicio.ejecutar(1, { netlist, analisis: { tipo: 'ac', barrido: 'dec', puntos: 10, desde: 1, hasta: 1000, fuente: 0, incluir: [60, 120] } })
    if (!r.ok) throw new Error(r.error)
    expect(r.graficos).toHaveLength(1)
    const f = frecuencias(r.graficos[0])
    expect(f.length).toBe(31 + 2)
    expect(Array.from(f)).toContain(60)
    expect(Array.from(f)).toContain(120)
    expect(Array.from(f)).toEqual([...f].sort((a, b) => a - b))
    // La magnitud en 60 Hz es la del RC: 1 / sqrt(1 + (60/159.155)^2).
    const k = Array.from(f).indexOf(60)
    const v = r.graficos[0].vectores.find((x) => x.referencia.tipo === 'nodo' && x.referencia.nodo === 2)!
    expect(Math.hypot(v.re[k], v.im![k])).toBeCloseTo(1 / Math.sqrt(1 + (60 / 159.1549) ** 2), 5)
  })

  it('con barrido de parámetro cada corrida lleva sus frecuencias incluidas', async () => {
    const r = await servicio.ejecutar(1, { netlist, analisis: { tipo: 'ac', barrido: 'dec', puntos: 5, desde: 10, hasta: 1000, fuente: 0, incluir: [60] }, parametro: { elemento: 1, valores: [500, 2000] } })
    if (!r.ok) throw new Error(r.error)
    expect(r.graficos).toHaveLength(2)
    for (const g of r.graficos) expect(Array.from(frecuencias(g))).toContain(60)
  })
})

import { describe, expect, it } from 'vitest'
import { leerFalstad } from './falstad'
import { leerKicad } from './kicad'
import { leerLtspice } from './ltspice'
import { leerSpice } from './spice'

const N = 20_000
/** Holgura amplia para una máquina cargada: el código lineal tarda decenas de ms y el cuadrático, muchos segundos. */
const UMBRAL_MS = 3000
const rango = (n: number): number[] => Array.from({ length: n }, (_, i) => i)
const tarda = (f: () => unknown): number => {
  const t0 = performance.now()
  f()
  return performance.now() - t0
}

describe('archivos fabricados con miles de cables en una misma fila', () => {
  it('KiCad une cada punto con su cable sin recorrer todas las parejas', () => {
    const cables = rango(3 * N).map((i) => `(wire (pts (xy ${i * 2} 0) (xy ${i * 2 + 2} 0)))`)
    const juntas = rango(3 * N).map((i) => `(junction (at ${i * 2 + 1} 0))`)
    const texto = `(kicad_sch (version 20250114) (generator "eeschema")\n${cables.join('\n')}\n${juntas.join('\n')})`
    let c: ReturnType<typeof leerKicad> | undefined
    expect(tarda(() => (c = leerKicad(texto, 'x.kicad_sch')))).toBeLessThan(UMBRAL_MS)
    expect(c?.dibujo?.cables).toHaveLength(3 * N)
  })
  it('LTspice une cada punto con su cable sin recorrer todas las parejas', () => {
    const cables = rango(2 * N).map((i) => `WIRE ${i * 32} 0 ${i * 32 + 32} 0`)
    const flags = rango(2 * N).map((i) => `FLAG ${i * 32 + 16} 0 n${i}`)
    const texto = `Version 4\nSHEET 1 880 680\n${cables.join('\n')}\n${flags.join('\n')}\n`
    expect(tarda(() => leerLtspice(texto, 'x.asc'))).toBeLessThan(UMBRAL_MS)
  })
  it('Falstad une cada punto con su cable sin recorrer todas las parejas', () => {
    const cables = rango(N).map((i) => `w ${i * 32} 0 ${i * 32 + 32} 0 0`)
    const resistencias = rango(N).map((i) => `r ${i * 32 + 16} 0 ${i * 32 + 16} 32 0 1000`)
    const texto = `$ 1 0.000005 10 50 5 50\n${cables.join('\n')}\n${resistencias.join('\n')}\n`
    expect(tarda(() => leerFalstad(texto, 'x.txt'))).toBeLessThan(UMBRAL_MS)
  })
  it('Falstad ubica la pieza de cada deslizador sin recorrerlas todas', () => {
    const resistencias = rango(2 * N).map((i) => `r ${i * 32} 0 ${i * 32 + 32} 0 0 1000`)
    const deslizadores = rango(2 * N).map((i) => `38 ${i} 0 0 100 Resistencia`)
    const texto = `$ 1 0.000005 10 50 5 50\n${resistencias.join('\n')}\n${deslizadores.join('\n')}\n`
    expect(tarda(() => leerFalstad(texto, 'x.txt'))).toBeLessThan(UMBRAL_MS)
  })
  it('SPICE ubica los inductores de cada acoplamiento sin recorrerlos todos', () => {
    const inductores = rango(2 * N).map((i) => `L${i} a${i} 0 1m`)
    const acoplamientos = rango(N).map((i) => `K${i} L${2 * i} L${2 * i + 1} 0.9`)
    const texto = `titulo\n${inductores.join('\n')}\n${acoplamientos.join('\n')}\n.end\n`
    const c = leerSpice(texto, 'x.cir')
    expect(c.piezas.length).toBe(2 * N)
    expect(tarda(() => leerSpice(texto, 'x.cir'))).toBeLessThan(UMBRAL_MS)
  })
})

describe('las redes siguen igual con el barrido por filas', () => {
  it('LTspice une un punto interior a un cable y no a uno que solo lo roza por el extremo', () => {
    const c = leerLtspice('Version 4\nSHEET 1 880 680\nWIRE 0 0 64 0\nWIRE 64 0 64 64\nFLAG 32 0 a\nFLAG 64 32 b\nFLAG 0 0 0\n', 'x.asc')
    expect(c.avisos.some((a) => /dos nombres/.test(a))).toBe(true)
  })
})

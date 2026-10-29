// @vitest-environment happy-dom
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { idSecuencial } from '../doc/ids'
import { colisiona } from '../editor/colision'
import { violaciones } from '../editor/conflictos'
import { problemasDeRedes } from '../prueba/ayudaImportar'
import { libreriaDePrueba } from '../prueba/libreria'
import type { CircuitoAjeno } from './ajeno'
import { decodificarTexto } from './detectar'
import { importarBytes } from './importar'
import { leerFalstad } from './lectores/falstad'
import { leerSpice } from './lectores/spice'

const lib = libreriaDePrueba().piezas
const fixture = (carpeta: string, n: string): Uint8Array => readFileSync(join(__dirname, '__fixtures__', carpeta, n))
const leer = (carpeta: 'falstad' | 'spice', n: string): CircuitoAjeno => (carpeta === 'falstad' ? leerFalstad : leerSpice)(decodificarTexto(fixture(carpeta, n)), n)

function importar(carpeta: 'falstad' | 'spice', n: string) {
  const r = importarBytes(n, fixture(carpeta, n), lib, idSecuencial())
  if (!r.ok) throw new Error(r.motivo)
  return r
}

describe('importarBytes con los ejemplos', () => {
  const casos: ['falstad' | 'spice', string][] = [
    ['falstad', 'divisor.txt'], ['falstad', 'inversor.txt'], ['falstad', 'led-npn.txt'], ['falstad', 'osciloscopio.txt'], ['falstad', 'rc.txt'], ['falstad', 'sobre-cable.txt'],
    ['spice', 'divisor.cir'], ['spice', 'filtro.sp'], ['spice', 'inversor.cir'], ['spice', 'rc.cir'], ['spice', 'transistor.cir']
  ]
  for (const [carpeta, n] of casos)
    it(`${carpeta}/${n}: en la rejilla, sin choques, sin violaciones y con las redes del origen`, () => {
      const { doc, informe } = importar(carpeta, n)
      for (const p of Object.values(doc.piezas)) {
        expect(colisiona(doc, lib, p), `${p.ref} choca`).toBeNull()
        expect(p.x % 2).toBe(0)
        expect(p.y % 2).toBe(0)
      }
      expect(violaciones(doc, lib)).toEqual([])
      expect(problemasDeRedes(leer(carpeta, n), doc, lib)).toEqual([])
      expect(doc.importacion).toEqual(informe)
    })

  it('el inversor de Falstad lleva el amplificador exacto con tres de sus cinco pines conectados', () => {
    const { doc, avisos } = importar('falstad', 'inversor.txt')
    const u = Object.values(doc.piezas).find((p) => p.tipo === 'amp-op')!
    expect(u.props.modelo ?? 'LM741').toBe('LM741')
    expect(avisos.some((a) => a.includes('V+') && a.includes('V-'))).toBe(true)
  })

  it('el transistor de SPICE queda exacto y la sonda de .dc se guarda como análisis con su fuente por referencia', () => {
    const { doc, informe } = importar('spice', 'transistor.cir')
    expect(Object.values(doc.piezas).find((p) => p.tipo === 'npn')!.props.modelo).toBe('2N3904')
    expect(informe.aproximadas).toEqual([])
    const a = Object.values(doc.analisis ?? {})
    expect(a).toHaveLength(1)
    const vb = Object.values(doc.piezas).find((p) => p.ref === 'Vb')!
    expect(a[0]!.config).toMatchObject({ tipo: 'dc', fuente: vb.id })
  })

  it('el filtro de SPICE avisa de lo que no entra y lo anota como omitido', () => {
    const { informe } = importar('spice', 'filtro.sp')
    expect(informe.omitidas.some((o) => o.includes('.include'))).toBe(true)
    expect(informe.analisis).toEqual([{ nombre: 'Respuesta en frecuencia importada', de: expect.stringMatching(/^CA de /) }])
  })

  it('el osciloscopio de Falstad se mide con sondas del instrumento y crea el transitorio', () => {
    const { doc } = importar('falstad', 'osciloscopio.txt')
    const osc = Object.values(doc.piezas).find((p) => p.tipo === 'osciloscopio')!
    expect(Object.values(doc.sondas ?? {}).filter((s) => s.instrumento === osc.id)).toHaveLength(2)
    expect(Object.values(doc.analisis ?? {}).map((a) => a.config.tipo)).toEqual(['tran'])
  })

  it('rechaza lo que no es de otro programa y lo que todavía no se lee', () => {
    expect(importarBytes('x.txt', new TextEncoder().encode('hola'), lib)).toMatchObject({ ok: false })
    expect(importarBytes('x.asc', new TextEncoder().encode('Version 4\nSHEET 1 880 680\n'), lib)).toMatchObject({ ok: false, motivo: expect.stringContaining('LTspice') })
  })
})

describe('importarBytes ante fallos internos', () => {
  it('una librería sin las piezas básicas da un motivo legible y no lanza', () => {
    const r = importarBytes('divisor.cir', fixture('spice', 'divisor.cir'), new Map(), idSecuencial())
    expect(r).toMatchObject({ ok: false })
    if (!r.ok) expect(r.motivo).toMatch(/^No se pudo convertir el archivo de SPICE/)
  })
})

// Espera KIRCHI_LOTE_IMPORTAR con lote/falstad y lote/spice; sin la variable se omite.
const RAIZ = process.env.KIRCHI_LOTE_IMPORTAR ? join(process.env.KIRCHI_LOTE_IMPORTAR, 'lote') : ''
describe.skipIf(RAIZ === '' || !existsSync(RAIZ))('lote local de ejemplos', () => {
  it('importa todos y resume cuántos quedan sin violaciones', () => {
    let total = 0, limpios = 0, fallan = 0, cajas = 0, redesEtiqueta = 0, redesMal = 0
    const detalle: string[] = []
    for (const carpeta of ['falstad', 'spice'] as const)
      for (const n of readdirSync(join(RAIZ, carpeta))) {
        total++
        const bytes = readFileSync(join(RAIZ, carpeta, n))
        const r = importarBytes(n, bytes, lib, idSecuencial())
        if (!r.ok) {
          fallan++
          detalle.push(`${carpeta}/${n}: ${r.motivo}`)
          continue
        }
        const v = violaciones(r.doc, lib)
        const redes = problemasDeRedes((carpeta === 'falstad' ? leerFalstad : leerSpice)(decodificarTexto(bytes), n), r.doc, lib)
        if (v.length === 0) limpios++
        if (redes.length) redesMal++
        cajas += r.informe.sinEquivalencia.length
        redesEtiqueta += r.informe.redesConEtiqueta.length
        if (v.length || redes.length) detalle.push(`${carpeta}/${n}: ${v.length} violaciones, ${redes.length} redes distintas (${redes[0] ?? v[0]})`)
      }
    process.stdout.write(`Lote: ${total} archivos, ${limpios} sin violaciones, ${redesMal} con redes distintas, ${fallan} sin piezas, ${cajas} cajas, ${redesEtiqueta} redes con etiqueta.\n${detalle.join('\n')}\n`)
    expect(total).toBeGreaterThan(0)
    expect(limpios + fallan).toBe(total)
  }, 600000)
})

describe('esquema jerárquico de KiCad con anexos', () => {
  const dec = (n: string): Uint8Array => fixture('kicad', n)
  it('las hojas de los anexos entran al documento con sus redes', () => {
    const r = importarBytes('padre.kicad_sch', dec('padre.kicad_sch'), lib, idSecuencial(), { 'hijo.kicad_sch': dec('hijo.kicad_sch') })
    if (!r.ok) throw new Error(r.motivo)
    expect(Object.values(r.doc.piezas).map((p) => p.ref).filter((x) => !x.startsWith('GND')).sort()).toEqual(['C1', 'Filtro/R1', 'R1', 'R2'])
    expect(r.avisos.join(' ')).not.toMatch(/no se encontró/)
  })
  it('sin anexos la hoja falta y se avisa', () => {
    const r = importarBytes('padre.kicad_sch', dec('padre.kicad_sch'), lib, idSecuencial())
    if (!r.ok) throw new Error(r.motivo)
    expect(Object.values(r.doc.piezas).map((p) => p.ref).filter((x) => !x.startsWith('GND')).sort()).toEqual(['R1', 'R2'])
    expect(r.avisos.join(' ')).toMatch(/no se encontró/)
  })
})

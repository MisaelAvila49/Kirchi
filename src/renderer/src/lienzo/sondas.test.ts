// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { cuerpoEnMundo } from '../editor/colision'
import { documentoVacio, type Documento, type Pieza, type Sonda } from '../doc/tipos'
import { circuitoAlAzar } from '../prueba/circuitoAlAzar'
import { libreriaDePrueba } from '../prueba/libreria'
import { cajaTexto, cajasSeCruzan, etiquetasSinChoques } from './apartar'
import type { Texto } from './etiquetas'
import { cajaEtiqueta, cajaNota } from './medidas'
import { banderasDeEntradas, cajasCandidatas, colocarSondas, letraDeSonda, rotulosDeEntradas } from './sondas'
import { calcularConexiones } from '../conexiones/conexiones'

const lib = libreriaDePrueba().piezas
const pieza = (id: string, tipo: string, ref: string, x: number, y: number): Pieza => ({ id, tipo, ref, x, y, rot: 0, espejo: false, props: {} })
const textosDe = (doc: Documento): Texto[] => [...etiquetasSinChoques(doc, lib).values()].flat()

describe('las banderas de las sondas', () => {
  it('la letra de cada tipo', () => {
    expect(letraDeSonda({ id: 'a', tipo: 'osciloscopio', x: 0, y: 0, instrumento: 'o', entrada: 'C' })).toBe('C')
    expect(letraDeSonda({ id: 'a', tipo: 'multimetro', x: 0, y: 0, instrumento: 'm', entrada: 'COM' })).toBe('COM')
    expect(letraDeSonda({ id: 'a', tipo: 'voltaje', x: 0, y: 0 })).toBe('V')
    expect(letraDeSonda({ id: 'a', tipo: 'corriente', x: 0, y: 0, sentido: 'derecha' })).toBe('I')
  })

  it('en el aire va arriba a la derecha con su tallo desde el punto', () => {
    const doc = { ...documentoVacio(), sondas: { v: { id: 'v', tipo: 'voltaje' as const, x: 10, y: 10 } } }
    const b = colocarSondas(doc, lib, []).get('v')!
    expect(b.lugar).toBe('ne')
    expect(b.tallo[0]).toEqual({ x: 10, y: 10 })
    expect(b.caja.minX).toBeGreaterThan(10)
    expect(b.caja.maxY).toBeLessThan(10)
  })

  it('no pisa el cuerpo ni la referencia de la resistencia de al lado', () => {
    // R1 en (8,−6): su cuerpo y su referencia quedan arriba a la derecha de la sonda en (4,−2), donde iría la bandera.
    const doc: Documento = { ...documentoVacio(), piezas: { r: pieza('r', 'resistencia', 'R1', 8, -6) }, sondas: { v: { id: 'v', tipo: 'voltaje', x: 4, y: -2 } } }
    const textos = textosDe(doc)
    const b = colocarSondas(doc, lib, textos).get('v')!
    expect(cajasSeCruzan(b.caja, cuerpoEnMundo(doc.piezas.r, lib.get('resistencia')))).toBe(false)
    for (const t of textos) expect(cajasSeCruzan(b.caja, cajaTexto(t))).toBe(false)
  })

  it('dos sondas en el mismo punto no se enciman y el orden es por id', () => {
    const sondas: Record<string, Sonda> = {
      b: { id: 'b', tipo: 'osciloscopio', x: 0, y: 0, instrumento: 'o', entrada: 'B' },
      a: { id: 'a', tipo: 'osciloscopio', x: 0, y: 0, instrumento: 'o', entrada: 'A' }
    }
    const doc = { ...documentoVacio(), sondas }
    const m = colocarSondas(doc, lib, [])
    expect(cajasSeCruzan(m.get('a')!.caja, m.get('b')!.caja)).toBe(false)
    expect(m.get('a')!.lugar).toBe('ne')
    const alReves = colocarSondas({ ...doc, sondas: { a: sondas.a, b: sondas.b } }, lib, [])
    expect(alReves.get('b')).toEqual(m.get('b'))
  })

  it('en 120 circuitos al azar, si algún lugar estaba libre, la bandera no pisa cuerpos, textos, etiquetas, notas ni otras banderas', () => {
    for (let semilla = 1; semilla <= 120; semilla++) {
      const base = circuitoAlAzar(semilla, lib)
      const sondas: Record<string, Sonda> = {}
      Object.values(base.cables).slice(0, 6).forEach((c, k) => (sondas[`s${k}`] = { id: `s${k}`, tipo: k % 2 ? 'voltaje' : 'osciloscopio', x: c.puntos[0].x, y: c.puntos[0].y, ...(k % 2 ? {} : { instrumento: 'o', entrada: 'A' }) }))
      const doc = { ...base, sondas }
      const textos = textosDe(doc)
      const obstaculos = [
        ...Object.values(doc.piezas).map((p) => cuerpoEnMundo(p, lib.get(p.tipo))),
        ...textos.map((t) => cajaTexto(t)),
        ...Object.values(doc.etiquetas).map(cajaEtiqueta),
        ...Object.values(doc.notas).map(cajaNota)
      ]
      const m = colocarSondas(doc, lib, textos)
      const puestas: typeof obstaculos = []
      for (const s of Object.values(sondas).sort((a, b) => (a.id < b.id ? -1 : 1))) {
        const b = m.get(s.id)!
        const libre = (c: (typeof obstaculos)[number]) => ![...obstaculos, ...puestas].some((o) => cajasSeCruzan(c, o))
        if (cajasCandidatas(s).some(libre)) expect(libre(b.reservada), `semilla ${semilla}, sonda ${s.id}`).toBe(true)
        puestas.push(b.reservada)
      }
    }
  })
})

describe('el rótulo de las entradas con sonda', () => {
  // R1 con su cable de (4,0) a (20,0); el osciloscopio XSC1 (A en 72,−6); el multímetro XMM1 en (40,30) (+ en 40,24).
  const base = (sondas: Record<string, Sonda>): Documento => ({
    ...documentoVacio(),
    piezas: { r: pieza('r', 'resistencia', 'R1', 0, 0), o: pieza('o', 'osciloscopio', 'XSC1', 80, 0), m: pieza('m', 'multimetro', 'XMM1', 40, 30), g: pieza('g', 'tierra', 'GND1', -4, 0) },
    cables: { c: { id: 'c', puntos: [{ x: 4, y: 0 }, { x: 20, y: 0 }] } },
    sondas
  })
  it('dice de dónde mide: «A ← R1:2» en el osciloscopio y «← R1:2», «COM ← GND» en el multímetro', () => {
    const doc = base({
      a: { id: 'a', tipo: 'osciloscopio', x: 10, y: 0, instrumento: 'o', entrada: 'A' },
      p: { id: 'p', tipo: 'multimetro', x: 12, y: 0, instrumento: 'm', entrada: '+' },
      q: { id: 'q', tipo: 'multimetro', x: -4, y: 0, instrumento: 'm', entrada: 'COM' }
    })
    const r = rotulosDeEntradas(doc, lib, calcularConexiones(doc, lib))
    expect(r.get('o')!.reemplazos.get('A')).toEqual({ texto: 'A ← R1:2', color: 'sondaA' })
    expect(r.get('m')!.extra.map((t) => t.texto)).toEqual(['← R1:2', 'COM ← GND'])
    expect(r.has('r')).toBe(false)
  })
  it('recorta una fuente larga a ocho caracteres', () => {
    const doc = { ...base({ a: { id: 'a', tipo: 'osciloscopio', x: 10, y: 0, instrumento: 'o', entrada: 'B' } }), etiquetas: { e: { id: 'e', nombre: 'SALIDA_DEL_FILTRO', x: 20, y: 0, rot: 0 as const } } }
    const r = rotulosDeEntradas(doc, lib, calcularConexiones(doc, lib))
    expect(r.get('o')!.reemplazos.get('B')!.texto).toBe('B ← SALIDA_…')
  })
  it('sin red no dice nada', () => {
    const doc = base({ a: { id: 'a', tipo: 'osciloscopio', x: 500, y: 500, instrumento: 'o', entrada: 'A' } })
    expect(rotulosDeEntradas(doc, lib, calcularConexiones(doc, lib)).get('o')?.reemplazos.has('A') ?? false).toBe(false)
  })
})

describe('banderas en las entradas de los instrumentos', () => {
  const doc = (sondas: Record<string, Sonda>): Documento => ({ ...documentoVacio(), piezas: { m: pieza('m', 'multimetro', 'XMM1', 0, 0), r: pieza('r', 'resistencia', 'R1', 20, 0) }, cables: { c: { id: 'c', puntos: [{ x: 4, y: 20 }, { x: 30, y: 20 }] } }, sondas })
  it('una entrada unida por sonda lleva su banderita con la letra junto al pin, hacia afuera del cuerpo', () => {
    const d = doc({ p: { id: 'p', tipo: 'multimetro', x: 18, y: 20, instrumento: 'm', entrada: '+' }, q: { id: 'q', tipo: 'multimetro', x: 22, y: 20, instrumento: 'm', entrada: 'COM' } })
    const con = calcularConexiones(d, lib)
    const bs = banderasDeEntradas(d, lib, con)
    expect(bs.map((b) => b.letra).sort()).toEqual(['+', 'COM'])
    const mas = bs.find((b) => b.letra === '+')!, com = bs.find((b) => b.letra === 'COM')!
    // «+» está arriba del cuerpo y COM abajo: las banderitas salen en esos sentidos.
    expect(mas.caja.maxY).toBeLessThanOrEqual(-6)
    expect(com.caja.minY).toBeGreaterThanOrEqual(6)
    expect(mas.tallo[0]).toEqual({ x: 0, y: -6 })
    expect(cajasSeCruzan(mas.caja, cuerpoEnMundo(d.piezas.m, lib.get('multimetro')!))).toBe(false)
  })
  it('una sonda que no mide nada no dibuja banderita en el pin', () => {
    const d = doc({ p: { id: 'p', tipo: 'multimetro', x: 500, y: 500, instrumento: 'm', entrada: '+' } })
    expect(banderasDeEntradas(d, lib, calcularConexiones(d, lib))).toEqual([])
  })
})

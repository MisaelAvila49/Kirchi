// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { libreriaSinDom } from '../prueba/pasoVista'
import { agrupar, invarianteDePaquete, patillasDeUnidad, PROPS_DE_DOCUMENTO, refDe, renombrarPaquete, siguienteUnidad, unidadesDe } from './paquetes'
import { documentoVacio, type Documento, type Pieza } from './tipos'

const lib = libreriaSinDom()
const pieza = (id: string, tipo: string, ref: string, props: Record<string, string> = {}, x = 0, y = 0): Pieza => ({ id, tipo, ref, x, y, rot: 0, espejo: false, props })
const docDe = (...ps: Pieza[]): Documento => ({ ...documentoVacio(), piezas: Object.fromEntries(ps.map((p) => [p.id, p])) })
const def = (tipo: string) => lib.get(tipo)!

describe('unidades de un encapsulado', () => {
  it('las propiedades de documento son paquete y unidad, y ninguna pieza las declara', () => {
    expect(PROPS_DE_DOCUMENTO).toEqual(['paquete', 'unidad'])
    for (const d of lib.values()) for (const p of d.props) expect(PROPS_DE_DOCUMENTO as readonly string[]).not.toContain(p.id)
  })

  it('una NAND 74HC00 trae cuatro unidades A a D sin patillas compartidas', () => {
    expect(unidadesDe(def('nand'), { familia: '74HC', entradas: '2' })).toEqual({ nombres: ['A', 'B', 'C', 'D'], compartidos: [] })
  })

  it('un LM358 trae dos unidades y comparte V+ y V-', () => {
    expect(unidadesDe(def('amp-op'), { modelo: 'LM358' })).toEqual({ nombres: ['A', 'B'], compartidos: ['V+', 'V-'] })
  })

  it('un LM741 y una resistencia no son multiunidad', () => {
    expect(unidadesDe(def('amp-op'), { modelo: 'LM741' })).toBeNull()
    expect(unidadesDe(def('resistencia'), {})).toBeNull()
  })

  it('las patillas de cada unidad suman las compartidas', () => {
    expect(patillasDeUnidad(def('amp-op'), { modelo: 'LM358' }, 'B')).toEqual({ '-': '6', '+': '5', OUT: '7', 'V+': '8', 'V-': '4' })
    expect(patillasDeUnidad(def('amp-op'), { modelo: 'LM358' }, 'Z')).toBeNull()
  })

  it('la referencia es el paquete seguido de la unidad', () => {
    expect(refDe('U1', 'B')).toBe('U1B')
    expect(invarianteDePaquete('U1B', { paquete: 'U1', unidad: 'B' })).toBe(true)
    expect(invarianteDePaquete('U1', {})).toBe(true)
    expect(invarianteDePaquete('U2B', { paquete: 'U1', unidad: 'B' })).toBe(false)
    expect(invarianteDePaquete('U1B', { paquete: 'U1' })).toBe(false)
  })
})

describe('siguiente unidad libre', () => {
  const n = { familia: '74HC', entradas: '2' }
  it('sin piezas abre el paquete U1 con la unidad A', () => {
    expect(siguienteUnidad(docDe(), lib, 'nand', n)).toEqual({ paquete: 'U1', unidad: 'A' })
  })

  it('toma la primera unidad libre del paquete del mismo tipo y familia', () => {
    const d = docDe(pieza('a', 'nand', 'U1A', { ...n, paquete: 'U1', unidad: 'A' }), pieza('c', 'nand', 'U1C', { ...n, paquete: 'U1', unidad: 'C' }))
    expect(siguienteUnidad(d, lib, 'nand', n)).toEqual({ paquete: 'U1', unidad: 'B' })
  })

  it('con el paquete lleno o de otra familia abre uno nuevo', () => {
    const llenas = ['A', 'B', 'C', 'D'].map((u) => pieza(u, 'nand', `U1${u}`, { ...n, paquete: 'U1', unidad: u }))
    expect(siguienteUnidad(docDe(...llenas), lib, 'nand', n)).toEqual({ paquete: 'U2', unidad: 'A' })
    expect(siguienteUnidad(docDe(llenas[0]), lib, 'nand', { familia: '74LS', entradas: '2' })).toEqual({ paquete: 'U2', unidad: 'A' })
  })

  it('un tipo de otra pieza o de otra entrada no comparte paquete', () => {
    const d = docDe(pieza('a', 'nand', 'U1A', { ...n, paquete: 'U1', unidad: 'A' }))
    expect(siguienteUnidad(d, lib, 'nand', { familia: '74HC', entradas: '3' })?.paquete).toBe('U2')
    expect(siguienteUnidad(d, lib, 'nor', n)?.paquete).toBe('U2')
  })

  it('una pieza que no es multiunidad no tiene unidad', () => {
    expect(siguienteUnidad(docDe(), lib, 'resistencia', {})).toBeNull()
  })

  it('la referencia suelta de un archivo viejo ocupa su número', () => {
    expect(siguienteUnidad(docDe(pieza('a', 'nand', 'U1', n)), lib, 'nand', n)).toEqual({ paquete: 'U2', unidad: 'A' })
  })
})

describe('renombrar un paquete', () => {
  const n = { familia: '74HC', entradas: '2' }
  const doc = () => docDe(pieza('a', 'nand', 'U1A', { ...n, paquete: 'U1', unidad: 'A' }), pieza('b', 'nand', 'U1B', { ...n, paquete: 'U1', unidad: 'B' }), pieza('r', 'resistencia', 'R1'))

  it('cambia la referencia de todas sus unidades', () => {
    expect(renombrarPaquete(doc(), 'U1', 'U7')).toEqual({ ok: true, cambios: [{ id: 'a', ref: 'U7A', paquete: 'U7' }, { id: 'b', ref: 'U7B', paquete: 'U7' }] })
  })

  it('rechaza un nombre vacío, con espacios o que choca con otra pieza', () => {
    expect(renombrarPaquete(doc(), 'U1', ' ')).toMatchObject({ ok: false })
    expect(renombrarPaquete(doc(), 'U1', 'U 7')).toMatchObject({ ok: false })
    expect(renombrarPaquete(doc(), 'U1', 'R1')).toMatchObject({ ok: false })
    const otro = doc()
    otro.piezas.c = pieza('c', 'nand', 'U2A', { ...n, paquete: 'U2', unidad: 'A' })
    expect(renombrarPaquete(otro, 'U1', 'u2')).toMatchObject({ ok: false })
  })

  it('el mismo nombre no es un choque consigo mismo', () => {
    expect(renombrarPaquete(doc(), 'U1', 'U1')).toMatchObject({ ok: true })
  })
})

describe('agrupar en encapsulados', () => {
  it('reparte las sueltas por tipo y familia en orden de lectura', () => {
    const n = { familia: '74HC', entradas: '2' }
    const d = docDe(
      pieza('e', 'nand', 'U5', n, 60, 0),
      pieza('a', 'nand', 'U1', n, 0, 0),
      pieza('b', 'nand', 'U2', n, 20, 0),
      pieza('l', 'nand', 'U3', { ...n, familia: '74LS' }, 0, 10),
      pieza('c', 'nand', 'U4', n, 0, 20),
      pieza('t', 'temporizador-555', 'U6', { modelo: 'NE555' })
    )
    const r = agrupar(d, lib)
    const por = Object.fromEntries(r.map((x) => [x.id, x.ref]))
    expect(por).toEqual({ a: 'U7A', b: 'U7B', e: 'U7C', c: 'U7D', l: 'U8A' })
    expect(r.find((x) => x.id === 'e')).toEqual({ id: 'e', ref: 'U7C', paquete: 'U7', unidad: 'C' })
  })

  it('sigue con un paquete nuevo cuando se llena y no toca los que ya están agrupados ni las demás referencias', () => {
    const n = { familia: '74HC', entradas: '2' }
    const sueltas = [0, 1, 2, 3, 4].map((k) => pieza(`s${k}`, 'nand', `U${10 + k}`, n, k * 10, 0))
    const d = docDe(pieza('g', 'nand', 'U1A', { ...n, paquete: 'U1', unidad: 'A' }), pieza('t', 'temporizador-555', 'U2', { modelo: 'NE555' }), ...sueltas)
    const r = agrupar(d, lib)
    expect(r.map((x) => x.ref)).toEqual(['U3A', 'U3B', 'U3C', 'U3D', 'U4A'])
  })

  it('sin piezas sueltas no hay nada que hacer', () => {
    expect(agrupar(docDe(pieza('r', 'resistencia', 'R1')), lib)).toEqual([])
  })
})

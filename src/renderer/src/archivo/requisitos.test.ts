// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { documentoVacio, type Documento } from '../doc/tipos'
import { libreriaSinDom } from '../prueba/pasoVista'
import { faltantesDe, PROPS_DE_REQUISITO, requisitosDe, requisitosLeidos } from './requisitos'

const pieza = (id: string, tipo: string, ref: string, props: Record<string, string> = {}) => ({ id, tipo, ref, x: 0, y: 0, rot: 0 as const, espejo: false, props })
const docDe = (...ps: ReturnType<typeof pieza>[]): Documento => ({ ...documentoVacio(), piezas: Object.fromEntries(ps.map((p) => [p.id, p])) })
const lib = libreriaSinDom()
const sin = (...tipos: string[]) => new Map([...lib].filter(([t]) => !tipos.includes(t)))

describe('requisitos del circuito', () => {
  it('lista los tipos y los valores de modelo, familia y color, ordenados y sin repetir', () => {
    const d = docDe(pieza('a', 'npn', 'Q2', { modelo: 'BC337' }), pieza('b', 'npn', 'Q1', { modelo: 'BC337' }), pieza('c', 'led', 'D1', { color: 'rojo' }))
    expect(requisitosDe(d)).toEqual(['opcion:led.color=rojo', 'opcion:npn.modelo=BC337', 'pieza:led', 'pieza:npn'])
  })

  it('las propiedades fuera de la regla no entran', () => {
    expect(PROPS_DE_REQUISITO).toEqual(['modelo', 'familia', 'color'])
    expect(requisitosDe(docDe(pieza('a', 'resistencia', 'R1', { valor: '1k' })))).toEqual(['pieza:resistencia'])
  })

  it('una lista inválida o fuera de los topes se ignora', () => {
    expect(requisitosLeidos(['pieza:a'])).toEqual(['pieza:a'])
    expect(requisitosLeidos('pieza:a')).toEqual([])
    expect(requisitosLeidos(['pieza:a', 3])).toEqual([])
    expect(requisitosLeidos(Array.from({ length: 501 }, (_, i) => `pieza:p${i}`))).toEqual([])
    expect(requisitosLeidos(['pieza:' + 'x'.repeat(120)])).toEqual([])
  })
})

describe('faltantes frente a la librería', () => {
  it('con todo presente no hay aviso', () => {
    const d = docDe(pieza('a', 'npn', 'Q1', { modelo: '2N3904' }))
    expect(faltantesDe(requisitosDe(d), lib, d)).toEqual({ entradas: [], aviso: null })
    expect(faltantesDe([], lib, d).aviso).toBeNull()
  })

  it('un tipo que la librería no tiene se nombra con sus referencias', () => {
    const d = docDe(pieza('a', 'jfet', 'U3'))
    const r = faltantesDe(['pieza:jfet'], lib, d)
    expect(r.entradas).toEqual(['pieza:jfet'])
    expect(r.aviso).toBe('Este circuito usa lo que esta versión de Kirchi no tiene: la pieza jfet (U3). Se conservan al guardar. Actualiza Kirchi para simularlos.')
  })

  it('una opción que la pieza no ofrece se nombra con su referencia', () => {
    const d = docDe(pieza('b', 'npn', 'Q2', { modelo: 'XX9999' }))
    expect(faltantesDe(['pieza:npn', 'opcion:npn.modelo=XX9999'], lib, d).aviso).toContain('el modelo XX9999 (Q2)')
  })

  it('un tipo faltante no repite sus opciones', () => {
    const d = docDe(pieza('b', 'npn', 'Q2', { modelo: 'BC337' }))
    expect(faltantesDe(['pieza:npn', 'opcion:npn.modelo=BC337'], sin('npn'), d).entradas).toEqual(['pieza:npn'])
  })

  it('un prefijo desconocido cuenta como faltante con un nombre genérico', () => {
    const r = faltantesDe(['rasgo:luces', 'otro:x'], lib, docDe())
    expect(r.entradas).toEqual(['rasgo:luces', 'otro:x'])
    expect(r.aviso).toContain('algo que no se reconoce')
  })

  it('nombra hasta tres y cuenta el resto', () => {
    const d = docDe(pieza('a', 't1', 'U1'), pieza('b', 't2', 'U2'), pieza('c', 't3', 'U3'), pieza('d', 't4', 'U4'), pieza('e', 't5', 'U5'))
    const r = faltantesDe(['pieza:t1', 'pieza:t2', 'pieza:t3', 'pieza:t4', 'pieza:t5'], lib, d)
    expect(r.aviso).toContain('la pieza t1 (U1), la pieza t2 (U2), la pieza t3 (U3) y 2 más.')
  })
})

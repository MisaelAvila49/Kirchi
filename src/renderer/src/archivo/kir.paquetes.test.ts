// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { documentoVacio, type Documento } from '../doc/tipos'
import { libreriaSinDom } from '../prueba/pasoVista'
import { escribirKir, formatoDe, leerKir, serializarDocumento } from './kir'
import { faltantesDe } from './requisitos'

const pieza = (id: string, tipo: string, ref: string, props: Record<string, string> = {}) => ({ id, tipo, ref, x: 0, y: 0, rot: 0 as const, espejo: false, props })
const docDe = (...ps: ReturnType<typeof pieza>[]): Documento => ({ ...documentoVacio(), piezas: Object.fromEntries(ps.map((p) => [p.id, p])) })
const abrir = (d: Documento) => leerKir(escribirKir(d, 't'))

describe('paquete y unidad en el .kir', () => {
  it('un archivo con compuertas sin unidades abre sin avisos ni cambios de referencia', () => {
    const d = docDe(pieza('a', 'nand', 'U1', { familia: '74HC' }), pieza('b', 'nand', 'U2', { familia: '74HC' }))
    const l = abrir(d)
    expect(l.ok && l.avisos).toEqual([])
    if (l.ok) expect(Object.values(l.doc.piezas).map((p) => p.ref)).toEqual(['U1', 'U2'])
  })

  it('el formato sigue en 8 y no sube por tener unidades', () => {
    const d = docDe(pieza('a', 'nand', 'U1A', { paquete: 'U1', unidad: 'A' }))
    expect(formatoDe(d)).toBe(formatoDe(docDe(pieza('a', 'nand', 'U1A'))))
    expect(formatoDe(d)).toBeLessThan(9)
  })

  it('con el invariante cumplido las dos propiedades se conservan y los bytes vuelven iguales', () => {
    const d = docDe(pieza('a', 'nand', 'U1A', { paquete: 'U1', unidad: 'A' }), pieza('b', 'nand', 'U1B', { paquete: 'U1', unidad: 'B' }))
    const l = abrir(d)
    expect(l.ok && l.avisos).toEqual([])
    if (!l.ok) return
    expect(l.doc.piezas.b.props).toEqual({ paquete: 'U1', unidad: 'B' })
    expect(serializarDocumento(l.doc)).toBe(serializarDocumento(d))
  })

  it('una pieza cuya referencia no es paquete más unidad pierde las dos propiedades y se avisa', () => {
    const l = abrir(docDe(pieza('a', 'nand', 'U7', { familia: '74HC', paquete: 'U1', unidad: 'B' })))
    expect(l.ok).toBe(true)
    if (!l.ok) return
    expect(l.doc.piezas.a.props).toEqual({ familia: '74HC' })
    expect(l.doc.piezas.a.ref).toBe('U7')
    expect(l.avisos).toEqual(['Se quitaron el paquete y la unidad de U7: no coinciden con su referencia.'])
  })

  it('una sola de las dos propiedades también se quita', () => {
    const l = abrir(docDe(pieza('a', 'nand', 'U1A', { unidad: 'A' })))
    expect(l.ok && l.doc.piezas.a.props).toEqual({})
  })

  it('un archivo con unidades y una pieza que esta versión no tiene abre con el aviso de requiere y conserva las unidades', () => {
    const d = docDe(pieza('a', 'nand', 'U1A', { paquete: 'U1', unidad: 'A' }), pieza('c', 'contador-169', 'U2', { familia: '74HC' }))
    const l = abrir(d)
    expect(l.ok).toBe(true)
    if (!l.ok) return
    expect(l.requiere).toContain('pieza:contador-169')
    const f = faltantesDe(l.requiere, libreriaSinDom(), l.doc)
    expect(f.aviso).toContain('la pieza contador-169 (U2)')
    expect(l.doc.piezas.a.props).toEqual({ paquete: 'U1', unidad: 'A' })
    expect(serializarDocumento(l.doc)).toBe(serializarDocumento(d))
  })
})

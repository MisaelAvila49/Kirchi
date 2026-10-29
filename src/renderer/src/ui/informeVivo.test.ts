// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { aplicar, invertir } from '../doc/comandos'
import { documentoVacio, type Documento, type Pieza } from '../doc/tipos'
import type { Informe } from '../importar/informe'
import { informeVivo, resumenDeConversion, tituloDeImportacion } from './informeVivo'

const pieza = (id: string, tipo: string, ref: string): Pieza => ({ id, tipo, ref, x: 0, y: 0, rot: 0, espejo: false, props: {} })

const informe: Informe = {
  origen: { formato: 'proteus', version: '8.13', nombre: 'filtro.pdsprj' },
  total: 4,
  convertidas: 3,
  aproximadas: [
    { id: 'u1', ref: 'U1', tipo: 'X', original: 'LM358', pieza: 'amp-op', modelo: 'TL081' },
    { id: 'q1', ref: 'Q1', tipo: 'BC547', original: 'BC548', pieza: 'npn' }
  ],
  sinEquivalencia: [{ id: 'u2', ref: 'U2', tipo: 'X', original: 'LM13700' }],
  redesConEtiqueta: [{ nombre: 'Vin', ids: ['u1', 'q1'] }],
  analisis: [{ nombre: 'Transitorio', de: 'Transitorio de 0 a 1 ms' }],
  omitidas: [],
  avisos: []
}

function documento(): Documento {
  const d = documentoVacio()
  d.piezas = { u1: pieza('u1', 'amp-op', 'U1'), q1: pieza('q1', 'npn', 'Q1'), u2: pieza('u2', 'sin-equivalencia', 'U2') }
  d.etiquetas = { e1: { id: 'e1', nombre: 'Vin', x: 0, y: 0, rot: 0 } }
  d.analisis = { a1: { id: 'a1', nombre: 'Transitorio' } as never }
  d.importacion = informe
  return d
}

describe('ids que vienen del archivo', () => {
  it('un id «constructor» en el informe no cuenta como una pieza del documento', () => {
    const malo: Informe = { ...informe, redesConEtiqueta: [{ nombre: 'Vin', ids: ['constructor', 'u1'] }], sinEquivalencia: [{ id: 'constructor', ref: 'X', tipo: 'X' }] }
    const t = informeVivo(documento(), malo)
    expect(t.find((x) => x.clase === 'etiquetas')!.piezas).toEqual(['u1'])
    expect(t.find((x) => x.clase === 'sinEquivalencia')!.titulo).toBe('Todas reemplazadas')
  })
})

const clases = (d: Documento) => informeVivo(d, informe).map((t) => t.clase)

describe('las tarjetas del informe de importación', () => {
  it('cuentan lo que el documento todavía tiene', () => {
    const t = informeVivo(documento(), informe, (tipo) => (tipo === 'amp-op' ? 'Amplificador operacional' : tipo))
    expect(t.map((x) => x.titulo)).toEqual(['2 con modelo aproximado', '1 sin equivalencia', '1 red con etiqueta', '1 análisis convertido'])
    expect(t[0].lineas).toEqual(['U1 LM358 → TL081', 'Q1 BC548 → npn'])
    expect(t[1].lineas[0]).toBe('U2 LM13700 queda como caja gris. Reemplázala para simular.')
    expect(t[3].lineas).toEqual(['Transitorio de 0 a 1 ms'])
    expect(t[0].piezas).toEqual(['u1', 'q1'])
    expect(t[1].piezas).toEqual(['u2'])
    expect(t[2].etiquetas).toEqual(['e1'])
    expect(t[2].piezas).toEqual(['u1', 'q1'])
  })

  it('dejan de contar una aproximada cuya pieza se cambió por otra o se borró', () => {
    const d = documento()
    d.piezas.u1 = pieza('u1', 'otro-amp', 'U1')
    delete d.piezas.q1
    expect(clases(d)).not.toContain('aproximadas')
  })

  it('reemplazar la caja gris marca la tarjeta como resuelta en vez de quitarla', () => {
    const d = documento()
    d.piezas.u2 = pieza('u2', 'amp-op', 'U2')
    const t = informeVivo(d, informe).find((x) => x.clase === 'sinEquivalencia')!
    expect(t.titulo).toBe('Todas reemplazadas')
    expect(t.tono).toBe('verdeazul')
    expect(t.piezas).toEqual([])
  })

  it('ocultan la tarjeta de etiquetas y la de análisis cuando ya no hay nada de eso', () => {
    const d = documento()
    d.etiquetas = {}
    d.analisis = {}
    expect(clases(d)).toEqual(['aproximadas', 'sinEquivalencia'])
  })

  it('no inventan tarjetas para lo que la importación no produjo', () => {
    const vacio: Informe = { ...informe, aproximadas: [], sinEquivalencia: [], redesConEtiqueta: [], analisis: [] }
    expect(informeVivo(documento(), vacio)).toEqual([])
  })

  it('resumen los renglones de más con «y N más»', () => {
    const muchas = Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, ref: `U${i}`, tipo: 'X', pieza: 'amp-op' }))
    const d = documentoVacio()
    for (const m of muchas) d.piezas[m.id] = pieza(m.id, 'amp-op', m.ref)
    const t = informeVivo(d, { ...informe, aproximadas: muchas, sinEquivalencia: [], redesConEtiqueta: [], analisis: [] })
    expect(t[0].lineas).toHaveLength(4)
    expect(t[0].lineas[3]).toBe('y 2 más')
  })

  it('titulan y resumen con el programa, la versión y las cuentas', () => {
    expect(tituloDeImportacion(informe)).toBe('Importado de Proteus 8.13')
    expect(resumenDeConversion(informe)).toBe('filtro.pdsprj: 3 de 4 piezas convertidas. El original no se modificó.')
  })
})

describe('ocultar el informe como cambio del documento', () => {
  it('quita el informe y deshacer lo regresa', () => {
    const d = documento()
    const cmd = { nombre: 'ocultar', cambios: [{ col: 'importacion' as const, id: 'informe', antes: informe }] }
    const sin = aplicar(d, cmd)
    expect(sin.importacion).toBeUndefined()
    expect(aplicar(sin, invertir(cmd)).importacion).toEqual(informe)
    expect(d.importacion).toEqual(informe)
  })
})

describe('ocultar el informe desde el editor', () => {
  it('quita el informe en un paso de deshacer y lo regresa con deshacer', async () => {
    const { Editor } = await import('../editor/Editor')
    const { idSecuencial } = await import('../doc/ids')
    const { libreriaDePrueba } = await import('../prueba/libreria')
    const ed = new Editor(libreriaDePrueba().piezas, documento(), idSecuencial(), {})
    expect(ed.ocultarInforme()).toBeNull()
    expect(ed.doc.importacion).toBeUndefined()
    ed.deshacer()
    expect(ed.doc.importacion).toEqual(informe)
  })
})

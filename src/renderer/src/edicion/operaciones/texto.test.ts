// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { cable, documento, nuevoNucleo } from '../../prueba/ayudaEdicion'
import { etiquetaEn, notaEn } from './texto'

describe('texto', () => {
  it('una etiqueta sobre un cable va con su tramo corto en un solo paso', () => {
    const n = nuevoNucleo(documento([], [cable('w', [0, 0], [40, 0])]))
    const r = etiquetaEn(n, { x: 20, y: 0 }, ' SALIDA ')
    if ('motivo' in r) throw new Error(r.motivo)
    expect(r.normalizar).toBe(true)
    n.ejecutar(r.cmd)
    expect(Object.values(n.doc.etiquetas).map((e) => e.nombre)).toEqual(['SALIDA'])
    n.deshacer()
    expect(n.doc.etiquetas).toEqual({})
  })

  it('un nombre o un texto vacío se rechazan con el aviso de siempre', () => {
    const n = nuevoNucleo(documento())
    expect(etiquetaEn(n, { x: 0, y: 0 }, '  ')).toEqual({ motivo: 'Escribe el nombre de la red.' })
    expect(notaEn(n, { x: 0, y: 0 }, ' \n')).toEqual({ motivo: 'Escribe el texto de la nota.' })
    const r = notaEn(n, { x: 4, y: 4 }, 'hola  ')
    expect('nota' in r && r.nota.texto).toBe('hola')
  })
})

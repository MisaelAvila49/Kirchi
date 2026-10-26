import { describe, expect, it } from 'vitest'
import { documentoVacio } from '../doc/tipos'
import { alternar, depurar, mismaSeleccion, seleccionDe, seleccionVacia, tamañoSeleccion, todo, unir } from './seleccion'

describe('selección', () => {
  it('las figuras son una colección más: todo las toma, depurar las quita y un documento sin figuras no falla', () => {
    const d = documentoVacio()
    d.figuras = { f: { id: 'f', tipo: 'linea', x1: 0, y1: 0, x2: 4, y2: 0, orden: 0 } }
    const s = todo(d)
    expect([...s.figuras]).toEqual(['f'])
    expect(tamañoSeleccion(s)).toBe(1)
    expect(depurar(s, documentoVacio()).figuras.size).toBe(0)
    expect(tamañoSeleccion(todo(documentoVacio()))).toBe(0)
    expect(mismaSeleccion(seleccionDe('figuras', 'f'), seleccionDe('notas', 'f'))).toBe(false)
  })

  it('mismaSeleccion compara por contenido, no por identidad', () => {
    const a = unir(seleccionDe('piezas', 'a'), seleccionDe('cables', 'w'))
    const b = unir(seleccionDe('cables', 'w'), seleccionDe('piezas', 'a'))
    expect(mismaSeleccion(a, b)).toBe(true)
    expect(mismaSeleccion(a, seleccionDe('piezas', 'a'))).toBe(false)
    expect(mismaSeleccion(seleccionDe('piezas', 'a'), seleccionDe('piezas', 'b'))).toBe(false)
    expect(mismaSeleccion(seleccionVacia(), seleccionVacia())).toBe(true)
    expect(mismaSeleccion(seleccionDe('piezas', 'x'), seleccionDe('notas', 'x'))).toBe(false)
  })


  it('alternar agrega y quita sin mutar', () => {
    const a = seleccionDe('piezas', 'p1')
    const b = alternar(a, 'piezas', 'p2')
    expect([...b.piezas]).toEqual(['p1', 'p2'])
    expect([...a.piezas]).toEqual(['p1'])
    expect([...alternar(b, 'piezas', 'p1').piezas]).toEqual(['p2'])
  })

  it('unir junta dos selecciones', () => {
    const s = unir(seleccionDe('piezas', 'p1'), seleccionDe('cables', 'c1'))
    expect(tamañoSeleccion(s)).toBe(2)
    expect(s.cables.has('c1')).toBe(true)
  })

  it('todo toma cada elemento del documento', () => {
    const d = documentoVacio()
    d.piezas.p = { id: 'p', tipo: 'resistencia', ref: 'R1', x: 0, y: 0, rot: 0, espejo: false, props: {} }
    d.cables.c = { id: 'c', puntos: [] }
    d.notas.n = { id: 'n', x: 0, y: 0, ancho: 8, texto: 'a' }
    expect(tamañoSeleccion(todo(d))).toBe(3)
    expect(tamañoSeleccion(seleccionVacia())).toBe(0)
  })

  it('depurar quita lo que ya no existe', () => {
    const d = documentoVacio()
    d.cables.c = { id: 'c', puntos: [] }
    const s = depurar(unir(seleccionDe('cables', 'c'), seleccionDe('piezas', 'fantasma')), d)
    expect([...s.cables]).toEqual(['c'])
    expect(s.piezas.size).toBe(0)
  })
})

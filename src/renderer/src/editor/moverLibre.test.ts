// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { idSecuencial } from '../doc/ids'
import { documentoVacio, type Documento } from '../doc/tipos'
import { libreriaDePrueba } from '../prueba/libreria'
import { Editor } from './Editor'

// Con Alt, las notas y las etiquetas de red se mueven fuera de la rejilla de 2.5 mm, en
// la rejilla fina de 1.25 mm (la del archivo, que guarda posiciones enteras), como los textos de las piezas.
const lib = libreriaDePrueba().piezas
function nuevo(d: Documento): Editor {
  const ed = new Editor(lib, d, idSecuencial())
  ed.tolerancia = 6 / 4.72
  return ed
}
function arrastrar(ed: Editor, desde: [number, number], hasta: [number, number], alt: boolean) {
  ed.abajo({ x: desde[0], y: desde[1] }, { alt })
  ed.mover({ x: (desde[0] + hasta[0]) / 2, y: (desde[1] + hasta[1]) / 2 }, { alt })
  ed.mover({ x: hasta[0], y: hasta[1] }, { alt })
  ed.arriba({ x: hasta[0], y: hasta[1] }, { alt })
}

describe('mover con Alt fuera de la rejilla', () => {
  it('una nota sigue al puntero sin rejilla con Alt (dos decimales), y sin Alt en la de 2.5 mm', () => {
    const d = documentoVacio()
    d.notas.n = { id: 'n', x: -30, y: -30, ancho: 8, texto: 'hola' }
    const conAlt = nuevo(structuredClone(d))
    arrastrar(conAlt, [-26, -28], [-22.8, -26.6], true)
    expect(conAlt.doc.notas.n).toMatchObject({ x: -26.8, y: -28.6 })
    const sinAlt = nuevo(structuredClone(d))
    arrastrar(sinAlt, [-26, -28], [-22.8, -26.6], false)
    expect(sinAlt.doc.notas.n).toMatchObject({ x: -26, y: -28 })
  })

  it('una figura y una nota juntas se mueven libres con Alt; con una etiqueta en la selección, la etiqueta sigue en la rejilla fina', () => {
    const d = documentoVacio()
    d.notas.n = { id: 'n', x: -30, y: -30, ancho: 8, texto: 'hola' }
    d.figuras = { f: { id: 'f', tipo: 'linea', x1: 0, y1: 0, x2: 10, y2: 0, orden: 0 } as any }
    const ed = nuevo(structuredClone(d))
    ed.seleccionarTodo()
    arrastrar(ed, [-26, -28], [-22.8, -26.6], true)
    expect(ed.doc.notas.n).toMatchObject({ x: -26.8, y: -28.6 })
    expect(ed.doc.figuras!.f).toMatchObject({ x1: 3.2, y1: 1.4, x2: 13.2, y2: 1.4 })
    const e = structuredClone(d)
    e.etiquetas.e = { id: 'e', nombre: 'A', x: 20, y: 0, rot: 0 }
    const mixta = nuevo(e)
    mixta.seleccionarTodo()
    arrastrar(mixta, [-26, -28], [-22.8, -26.6], true)
    expect(mixta.doc.notas.n).toMatchObject({ x: -27, y: -29 })
  })

  it('avisa al tutorial solo cuando el arrastre con Alt movió algo en la rejilla fina', () => {
    const d = documentoVacio()
    d.notas.n = { id: 'n', x: -30, y: -30, ancho: 8, texto: 'hola' }
    const contar = (alt: boolean) => {
      let avisos = 0
      const ed = nuevo(structuredClone(d))
      ed.ponerGanchos({ alMoverFino: () => avisos++ })
      arrastrar(ed, [-26, -28], [-22.8, -26.6], alt)
      return avisos
    }
    expect(contar(false)).toBe(0)
    expect(contar(true)).toBeGreaterThan(0)
  })

  it('una etiqueta suelta también; una con cables sigue en la rejilla de 2.5 mm para no sacarlos de ella', () => {
    const d = documentoVacio()
    d.etiquetas.e = { id: 'e', nombre: 'A', x: 20, y: 0, rot: 0 }
    const suelta = nuevo(structuredClone(d))
    arrastrar(suelta, [22.4, 0.2], [25.4, 1.2], true)
    expect(suelta.doc.etiquetas.e).toMatchObject({ x: 23, y: 1 })
    const conCable = structuredClone(d)
    conCable.cables.c = { id: 'c', puntos: [{ x: 10, y: 0 }, { x: 20, y: 0 }] }
    const ed = nuevo(conCable)
    arrastrar(ed, [22.4, 0.2], [25.4, 1.2], true)
    expect(ed.doc.etiquetas.e).toMatchObject({ x: 24, y: 2 })
    expect(ed.doc.cables.c.puntos.every((q) => q.x % 2 === 0 && q.y % 2 === 0)).toBe(true)
  })

  it('con una pieza en la selección, Alt no cambia nada: la pieza sigue en su rejilla', () => {
    const d = documentoVacio()
    d.piezas.r = { id: 'r', tipo: 'resistencia', ref: 'R1', x: 0, y: 0, rot: 0, espejo: false, props: {} }
    d.notas.n = { id: 'n', x: -30, y: -30, ancho: 8, texto: 'hola' }
    const ed = nuevo(d)
    ed.seleccionarTodo()
    arrastrar(ed, [0, 0.3], [3.2, 1.3], true)
    expect(ed.doc.piezas.r).toMatchObject({ x: 4, y: 2 })
    expect(ed.doc.notas.n).toMatchObject({ x: -26, y: -28 })
  })
})

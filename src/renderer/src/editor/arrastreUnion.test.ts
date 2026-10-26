// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { idSecuencial } from '../doc/ids'
import { documentoVacio, type Documento, type Punto } from '../doc/tipos'
import { amplificadorInversor } from '../prueba/ejemplos'
import { libreriaDePrueba } from '../prueba/libreria'
import { solape, violaciones } from './conflictos'
import { Editor } from './Editor'

// Arreglos (reporte 3): junto a una unión en T, arrastrar un cable movía otro cable de la unión, y el codo que
// deja la punta clavada corría encima de un cable de la misma red, así que la unión parecía irse con lo arrastrado.
const lib = libreriaDePrueba().piezas
const geo = (ed: Editor) => new Map(Object.values(ed.doc.cables).map((c) => [c.id, c.puntos.map((p) => `${p.x},${p.y}`).join(' ')]))
function nuevo(doc: Documento): Editor {
  const ed = new Editor(lib, doc, idSecuencial())
  ed.tolerancia = 6 / 4.72
  return ed
}
function arrastrar(ed: Editor, a: Punto, d: Punto) {
  ed.abajo(a)
  ed.mover({ x: a.x + d.x / 2, y: a.y + d.y / 2 })
  ed.mover({ x: a.x + d.x, y: a.y + d.y })
  ed.arriba({ x: a.x + d.x, y: a.y + d.y })
}
/** Pares de cables (de cualquier red) con un tramo encimado. */
function encimados(ed: Editor): string[] {
  const cs = Object.values(ed.doc.cables), out: string[] = []
  for (let u = 0; u < cs.length; u++)
    for (let v = u + 1; v < cs.length; v++)
      for (let i = 1; i < cs[u].puntos.length; i++)
        for (let j = 1; j < cs[v].puntos.length; j++)
          if (solape(cs[u].puntos[i - 1], cs[u].puntos[i], cs[v].puntos[j - 1], cs[v].puntos[j]) > 0) out.push(`${cs[u].id}/${cs[v].id}`)
  return out
}
/** Cuántas puntas de cable llegan a `p`. */
const puntas = (ed: Editor, p: Punto) =>
  Object.values(ed.doc.cables).filter((c) => [c.puntos[0], c.puntos[c.puntos.length - 1]].some((q) => q.x === p.x && q.y === p.y)).length

describe('arrastrar junto a una unión en T (amplificador inversor, unión en (30, 18))', () => {
  it('el tramo que se aprieta es el que se mueve, aunque la punta de rejilla caiga en la unión', () => {
    // c_menos va de la unión (30, 18) a la entrada − (34, 18); apretarlo a 0.6 de la unión daba la punta (30, 18) y se movía c_r1.
    const ed = nuevo(amplificadorInversor())
    const antes = geo(ed)
    arrastrar(ed, { x: 30.6, y: 18 }, { x: 0, y: -4 })
    const despues = geo(ed)
    expect(despues.get('c_r1')).toBe(antes.get('c_r1'))
    expect(despues.get('c_r2a')).toBe(antes.get('c_r2a'))
    expect(despues.get('c_menos')).not.toBe(antes.get('c_menos'))
    expect([...ed.seleccion.cables]).toEqual(['c_menos'])
  })

  it('mover a la izquierda el tramo vertical de R2 deja la unión donde estaba y no corre sobre el cable de R1', () => {
    const ed = nuevo(amplificadorInversor())
    const antes = geo(ed)
    arrastrar(ed, { x: 30, y: 17 }, { x: -4, y: 0 })
    const despues = geo(ed)
    expect(despues.get('c_r1')).toBe(antes.get('c_r1'))
    expect(despues.get('c_menos')).toBe(antes.get('c_menos'))
    expect(encimados(ed)).toEqual([])
    expect(puntas(ed, { x: 30, y: 18 })).toBe(3)
    // El tramo vertical se movió a x = 26 y sale de la unión con un escalón a lo largo de él.
    expect(ed.doc.cables.c_r2a.puntos).toEqual([{ x: 30, y: 18 }, { x: 30, y: 16 }, { x: 26, y: 16 }, { x: 26, y: 0 }, { x: 36, y: 0 }])
    expect(violaciones(ed.doc, lib)).toEqual([])
  })

  it('mover una pieza: el cable estirado vuelve a la unión sin correr sobre otro cable de su red', () => {
    // R en el origen (pines en ±4), su cable a la unión (8, 0), que sigue a la derecha y hacia arriba.
    const d = documentoVacio()
    d.piezas.r = { id: 'r', tipo: 'resistencia', ref: 'R1', x: 0, y: 0, rot: 0, espejo: false, props: {} }
    d.cables.a = { id: 'a', puntos: [{ x: 4, y: 0 }, { x: 8, y: 0 }] }
    d.cables.b = { id: 'b', puntos: [{ x: 8, y: 0 }, { x: 16, y: 0 }] }
    d.cables.c = { id: 'c', puntos: [{ x: 8, y: 0 }, { x: 8, y: -10 }] }
    const ed = nuevo(d)
    arrastrar(ed, { x: 0, y: 0.3 }, { x: 6, y: 6 })
    expect(ed.doc.piezas.r.x).toBe(6)
    expect(ed.doc.cables.b.puntos).toEqual([{ x: 8, y: 0 }, { x: 16, y: 0 }])
    expect(ed.doc.cables.c.puntos).toEqual([{ x: 8, y: 0 }, { x: 8, y: -10 }])
    expect(encimados(ed)).toEqual([])
    expect(puntas(ed, { x: 8, y: 0 })).toBe(3)
    expect(violaciones(ed.doc, lib)).toEqual([])
  })
})

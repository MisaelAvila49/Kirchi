// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { idSecuencial } from '../doc/ids'
import { documentoVacio, type Cable, type Documento, type Pieza } from '../doc/tipos'
import { libreriaDePrueba } from '../prueba/libreria'
import { Editor, type PedidoTexto } from './Editor'
import { LARGO_TRAMO_ETIQUETA, planDeEtiqueta } from './etiquetaEnTramo'

const lib = libreriaDePrueba().piezas
const R = (id: string, x: number, y: number, rot: Pieza['rot'] = 0): Pieza => ({ id, tipo: 'resistencia', ref: id.toUpperCase(), x, y, rot, espejo: false, props: {} })
const C = (id: string, ...pts: [number, number][]): Cable => ({ id, puntos: pts.map(([x, y]) => ({ x, y })) })
const doc = (piezas: Pieza[], cables: Cable[]): Documento => {
  const d = documentoVacio()
  for (const p of piezas) d.piezas[p.id] = p
  for (const c of cables) d.cables[c.id] = c
  return d
}

describe('la etiqueta puesta sobre un cable va en un tramo corto (B1)', () => {
  it('en un tramo horizontal libre, el tramo sube y la etiqueta queda en su punta', () => {
    const d = doc([R('r1', 0, 0)], [C('c', [4, 0], [40, 0])])
    expect(LARGO_TRAMO_ETIQUETA).toBe(4)
    expect(planDeEtiqueta(d, lib, { x: 20, y: 0 })).toEqual({ cable: [{ x: 20, y: 0 }, { x: 20, y: -4 }], etiqueta: { x: 20, y: -4, rot: 0 } })
  })
  it('con una pieza arriba, baja', () => {
    const d = doc([R('r1', 0, 0), R('r2', 20, -4)], [C('c', [4, 0], [40, 0])])
    expect(planDeEtiqueta(d, lib, { x: 20, y: 0 })).toEqual({ cable: [{ x: 20, y: 0 }, { x: 20, y: 4 }], etiqueta: { x: 20, y: 4, rot: 0 } })
  })
  it('en un tramo vertical, a la derecha (o a la izquierda, con la etiqueta hacia ese lado)', () => {
    const d = doc([], [C('c', [10, 0], [10, 40])])
    expect(planDeEtiqueta(d, lib, { x: 10, y: 20 })).toEqual({ cable: [{ x: 10, y: 20 }, { x: 14, y: 20 }], etiqueta: { x: 14, y: 20, rot: 0 } })
    const conPieza = doc([R('r', 18, 20)], [C('c', [10, 0], [10, 40])])
    expect(planDeEtiqueta(conPieza, lib, { x: 10, y: 20 })).toEqual({ cable: [{ x: 10, y: 20 }, { x: 6, y: 20 }], etiqueta: { x: 6, y: 20, rot: 180 } })
  })
  it('en el aire, en un pin o en la punta de un cable, la etiqueta va donde se pidió', () => {
    const d = doc([R('r1', 0, 0)], [C('c', [4, 0], [40, 0])])
    expect(planDeEtiqueta(d, lib, { x: 60, y: 60 })).toEqual({ etiqueta: { x: 60, y: 60, rot: 0 } })
    expect(planDeEtiqueta(d, lib, { x: -4, y: 0 })).toEqual({ etiqueta: { x: -4, y: 0, rot: 0 } })
    expect(planDeEtiqueta(d, lib, { x: 40, y: 0 })).toEqual({ etiqueta: { x: 40, y: 0, rot: 0 } })
  })
  it('en el editor, el tramo y la etiqueta son un solo paso de deshacer', () => {
    let pedido: PedidoTexto | null = null
    const ed = new Editor(lib, doc([R('r1', 0, 0)], [C('c', [4, 0], [40, 0])]), idSecuencial(), { editarTexto: (p) => (pedido = p as PedidoTexto) })
    ed.cursor = { x: 20, y: 0 }
    ed.colocarEtiqueta()
    expect(pedido!.aceptar('VIN')).toBeNull()
    const [e] = Object.values(ed.doc.etiquetas)
    expect(e).toMatchObject({ nombre: 'VIN', x: 20, y: -4 })
    expect(ed.con.redDeEtiqueta.get(e.id)).toBe(ed.con.redDePin.get('r1:2'))
    ed.deshacer()
    expect(Object.keys(ed.doc.etiquetas)).toEqual([])
    expect(Object.values(ed.doc.cables).map((c) => c.puntos)).toEqual([[{ x: 4, y: 0 }, { x: 40, y: 0 }]])
  })
})

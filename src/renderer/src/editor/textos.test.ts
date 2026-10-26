// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { idSecuencial } from '../doc/ids'
import { documentoVacio } from '../doc/tipos'
import { libreriaDePrueba } from '../prueba/libreria'
import { escribirKir, leerKir, serializarDocumento } from '../archivo/kir'
import { Editor, type PedidoTexto } from './Editor'

const lib = libreriaDePrueba().piezas

describe('texto aceptado por el editor', () => {
  it('etiquetas y notas nuevas o editadas quedan sin controles y en NFC', () => {
    const pedidos: PedidoTexto[] = []
    const ed = new Editor(lib, undefined, idSecuencial(), { editarTexto: (p) => pedidos.push(p as PedidoTexto) })
    ed.cargar(documentoVacio())
    ed.colocarEtiqueta()
    expect(pedidos[0].aceptar('VS\u000BAL\u0301')).toBeNull()
    const idE = Object.keys(ed.doc.etiquetas)[0]
    expect(ed.doc.etiquetas[idE].nombre).toBe('VSAL\u0301'.normalize('NFC'))
    ed.colocarNota()
    expect(pedidos[1].aceptar('Ome\u0301ga\u0000')).toBeNull()
    const idN = Object.keys(ed.doc.notas)[0]
    expect(ed.doc.notas[idN].texto).toBe('Oméga')
    ed.editarEtiqueta(idE)
    expect(pedidos[2].aceptar('X\u0002Y')).toBeNull()
    expect(ed.doc.etiquetas[idE].nombre).toBe('XY')
    ed.editarNota(idN)
    expect(pedidos[3].aceptar('a\u000Cb')).toBeNull()
    expect(ed.doc.notas[idN].texto).toBe('ab')
    expect(pedidos[3].aceptar('\u0001')).not.toBeNull()
  })

  it('lo escrito y lo reabierto son iguales: texto con acentos descompuestos sobrevive a guardar y leer', () => {
    const pedidos: PedidoTexto[] = []
    const ed = new Editor(lib, undefined, idSecuencial(), { editarTexto: (p) => pedidos.push(p as PedidoTexto) })
    ed.cargar(documentoVacio())
    ed.colocarEtiqueta()
    pedidos[0].aceptar('Vérticé')
    ed.colocarNota()
    pedidos[1].aceptar('Oméga con ñ')
    const r = leerKir(escribirKir(ed.doc, '0.0.1'))
    expect(r.ok && serializarDocumento(r.doc)).toBe(serializarDocumento(ed.doc))
  })
})

// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { idSecuencial } from '../doc/ids'
import { documentoVacio, type Pieza } from '../doc/tipos'
import { libreriaDePrueba } from '../prueba/libreria'
import { Editor, type PedidoCampos, type PedidoTexto } from './Editor'

/* Arreglos (B11): el doble clic y el clic derecho del generador traen periodo, mínimo y máximo, desfase, retardo y pasos. */

const lib = libreriaDePrueba().piezas
const gen = (props: Record<string, string> = {}): Pieza => ({ id: 'g', tipo: 'generador', ref: 'XFG1', x: 0, y: 0, rot: 0, espejo: false, props })

function abrir(props: Record<string, string> = {}) {
  const d = documentoVacio()
  d.piezas.g = gen(props)
  const pedidos: (PedidoTexto | PedidoCampos)[] = []
  const ed = new Editor(lib, d, idSecuencial(), { editarTexto: (p) => pedidos.push(p) })
  ed.tolerancia = 0.5
  ed.editarValor('g')
  return { ed, campos: pedidos[0] as PedidoCampos }
}
const ids = (c: PedidoCampos) => c.campos.map((x) => x.id)

describe('el editor del generador', () => {
  it('abre la frecuencia, el periodo, la amplitud, los extremos, el desfase, el retardo y los pasos antes de las listas', () => {
    const { campos } = abrir({ frecuencia: '250', amplitud: '4', desplazamiento: '1' })
    expect(ids(campos).slice(0, 10)).toEqual(['ref', 'valor', 'num:periodo', 'num:amplitud', 'num:desplazamiento', 'num:minimo', 'num:maximo', 'num:desfase', 'num:retardo', 'num:pasos'])
    const por = Object.fromEntries(campos.campos.map((c) => [c.id, c.inicial]))
    expect(por).toMatchObject({ valor: '250', 'num:periodo': '0.004', 'num:minimo': '-1', 'num:maximo': '3', 'num:desfase': '0', 'num:pasos': '4' })
  })

  it('el periodo cambia la frecuencia y el mínimo y el máximo la amplitud y el desplazamiento, en un solo paso de deshacer', () => {
    const { ed, campos } = abrir({ frecuencia: '250', amplitud: '4', desplazamiento: '1' })
    const vals = campos.campos.map((c) => c.inicial)
    const poner = (id: string, t: string) => (vals[ids(campos).indexOf(id as never)] = t)
    poner('num:periodo', '2m')
    poner('num:minimo', '0')
    poner('num:maximo', '5')
    poner('num:desfase', '90')
    expect(campos.aceptar(vals)).toBeNull()
    expect(ed.doc.piezas.g.props).toMatchObject({ frecuencia: '500', amplitud: '5', desplazamiento: '2.5', desfase: '90' })
    ed.deshacer()
    expect(ed.doc.piezas.g.props.desfase).toBeUndefined()
    expect(ed.doc.piezas.g.props.frecuencia).toBe('250')
  })

  it('un máximo menor que el mínimo se rechaza en su campo', () => {
    const { ed, campos } = abrir({ frecuencia: '250', amplitud: '4', desplazamiento: '1' })
    const vals = campos.campos.map((c) => c.inicial)
    vals[ids(campos).indexOf('num:maximo')] = '-5'
    const r = campos.aceptar(vals)
    expect(r).toEqual({ campo: ids(campos).indexOf('num:maximo'), error: 'El máximo no puede ser menor que el mínimo.' })
    expect(ed.doc.piezas.g.props.amplitud).toBe('4')
  })

  it('un generador guardado sin desfase, retardo ni pasos no los escribe si no se tocan', () => {
    const { ed, campos } = abrir({ frecuencia: '1k' })
    expect(campos.aceptar(campos.campos.map((c) => c.inicial))).toBeNull()
    expect(ed.doc.piezas.g.props).toEqual({ frecuencia: '1k' })
  })
})

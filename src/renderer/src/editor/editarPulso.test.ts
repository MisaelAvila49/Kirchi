// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { calcularConexiones } from '../conexiones/conexiones'
import { idSecuencial } from '../doc/ids'
import { documentoVacio, type Pieza } from '../doc/tipos'
import { libreriaDePrueba } from '../prueba/libreria'
import { serializarDocumento } from '../archivo/kir'
import { nombresDeRedes } from '../ui/redes'
import { vistaInspector } from '../ui/vistaInspector'
import { Editor, type PedidoCampos, type PedidoTexto } from './Editor'
import { seleccionVacia } from './seleccion'

/* Fuente de pulso: periodo, ancho, subida, bajada y retardo se editan en el inspector y en el doble clic. */

const lib = libreriaDePrueba().piezas
const pulso = (props: Record<string, string> = {}): Pieza => ({ id: 'v', tipo: 'fuente-pulso', ref: 'V1', x: 0, y: 0, rot: 0, espejo: false, props })

function abrir(props: Record<string, string> = {}) {
  const d = documentoVacio()
  d.piezas.v = pulso(props)
  const pedidos: (PedidoTexto | PedidoCampos)[] = []
  const ed = new Editor(lib, d, idSecuencial(), { editarTexto: (p) => pedidos.push(p) })
  ed.tolerancia = 0.5
  ed.editarValor('v')
  return { ed, campos: pedidos[0] as PedidoCampos }
}
const ids = (c: PedidoCampos) => c.campos.map((x) => x.id)

describe('el doble clic de la fuente de pulso', () => {
  it('trae la frecuencia, el ciclo, el periodo, el ancho, la subida, la bajada y el retardo', () => {
    const { campos } = abrir({ frecuencia: '250' })
    expect(ids(campos)).toEqual(['ref', 'valor', 'num:frecuencia', 'prop:ciclo', 'num:periodo', 'num:ancho', 'num:subida', 'num:bajada', 'num:retardo'])
    const por = Object.fromEntries(campos.campos.map((c) => [c.id, c.inicial]))
    expect(por).toMatchObject({ valor: '5', 'num:frecuencia': '250', 'num:periodo': '0.004', 'num:ancho': '0', 'num:subida': '0', 'num:bajada': '0', 'num:retardo': '0' })
    expect(campos.campos.find((c) => c.id === 'num:ancho')).toMatchObject({ unidad: 's' })
  })

  it('el periodo cambia la frecuencia y los tiempos se guardan solo si cambian, en un paso de deshacer', () => {
    const { ed, campos } = abrir({ frecuencia: '250' })
    const vals = campos.campos.map((c) => c.inicial)
    const poner = (id: string, t: string) => (vals[ids(campos).indexOf(id as never)] = t)
    poner('num:periodo', '2m')
    poner('num:subida', '10u')
    poner('num:retardo', '100u')
    expect(campos.aceptar(vals)).toBeNull()
    expect(ed.doc.piezas.v.props).toEqual({ frecuencia: '500', subida: '10u', retardo: '100u' })
    ed.deshacer()
    expect(ed.doc.piezas.v.props).toEqual({ frecuencia: '250' })
  })

  it('un periodo que no es positivo o un tiempo que no se lee se rechaza en su campo', () => {
    const { ed, campos } = abrir()
    const vals = campos.campos.map((c) => c.inicial)
    vals[ids(campos).indexOf('num:periodo')] = '0'
    expect(campos.aceptar(vals)).toEqual({ campo: ids(campos).indexOf('num:periodo'), error: 'El periodo debe ser un número mayor que cero.' })
    const otros = campos.campos.map((c) => c.inicial)
    otros[ids(campos).indexOf('num:ancho')] = 'ancho'
    expect(campos.aceptar(otros)).toMatchObject({ campo: ids(campos).indexOf('num:ancho') })
    expect(ed.doc.piezas.v.props).toEqual({})
  })

  it('una fuente guardada sin los tiempos nuevos no los escribe si no se tocan', () => {
    const { ed, campos } = abrir({ alto: '3.3', frecuencia: '1k', ciclo: '25 %' })
    expect(campos.aceptar(campos.campos.map((c) => c.inicial))).toBeNull()
    expect(ed.doc.piezas.v.props).toEqual({ alto: '3.3', frecuencia: '1k', ciclo: '25 %' })
  })

  it('un .kir de antes se escribe con los mismos bytes después de abrir y aceptar el doble clic', () => {
    const d = documentoVacio()
    d.piezas.v = pulso({ alto: '3.3', frecuencia: '1k', ciclo: '25 %' })
    const antes = serializarDocumento(d)
    const { ed, campos } = abrir({ alto: '3.3', frecuencia: '1k', ciclo: '25 %' })
    expect(campos.aceptar(campos.campos.map((c) => c.inicial))).toBeNull()
    expect(serializarDocumento(ed.doc)).toBe(antes)
  })
})

describe('el inspector y cambiarPropiedad de la fuente de pulso', () => {
  it('el periodo es un campo derivado de la frecuencia, después del ciclo', () => {
    const d = documentoVacio()
    d.piezas.v = pulso({ frecuencia: '2k' })
    const con = calcularConexiones(d, lib)
    const s = seleccionVacia()
    s.piezas.add('v')
    const v = vistaInspector(d, lib, con, s, nombresDeRedes(d, con))
    if (v.tipo !== 'pieza') throw new Error(v.tipo)
    expect(v.props.map((c) => c.id)).toEqual(['alto', 'frecuencia', 'ciclo', 'periodo', 'ancho', 'subida', 'bajada', 'retardo'])
    expect(v.props.find((c) => c.id === 'periodo')).toMatchObject({ texto: '0.0005', unidad: 's', enCaliente: true })
  })

  it('escribir el periodo escribe la frecuencia y un periodo inválido se dice', () => {
    const d = documentoVacio()
    d.piezas.v = pulso()
    const ed = new Editor(lib, d, idSecuencial(), {})
    expect(ed.cambiarPropiedad('v', 'periodo', '2m')).toBeNull()
    expect(ed.doc.piezas.v.props.frecuencia).toBe('500')
    expect(ed.cambiarPropiedad('v', 'periodo', '-1')).toBe('El periodo debe ser un número mayor que cero.')
    expect(ed.cambiarPropiedad('v', 'periodo', 'xx')).toBe('«xx» no es un valor válido.')
    expect(ed.cambiarPropiedad('v', 'ancho', '100u')).toBeNull()
    expect(ed.doc.piezas.v.props).toMatchObject({ frecuencia: '500', ancho: '100u' })
  })
})

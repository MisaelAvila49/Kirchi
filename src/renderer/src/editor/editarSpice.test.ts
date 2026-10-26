// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { calcularConexiones } from '../conexiones/conexiones'
import { idSecuencial } from '../doc/ids'
import { documentoVacio, type Documento, type Pieza } from '../doc/tipos'
import { formatoDe } from '../archivo/kir'
import { libreriaDePrueba } from '../prueba/libreria'
import { nombresDeRedes } from '../ui/redes'
import { repartirCampos, vistaInspector } from '../ui/vistaInspector'
import { seleccionVacia } from './seleccion'
import { MENSAJE_SOLO_EN_CALIENTE } from './enCaliente'
import { Editor, type PedidoCampos, type PedidoTexto } from './Editor'

/* Modelo «Personalizado»: un transistor, un MOSFET o un amplificador lleva sus parámetros de SPICE propios en lugar de
   los de su lista de modelos, desde el doble clic y desde el inspector, en un paso de deshacer. */

const lib = libreriaDePrueba().piezas
const P = (id: string, tipo: string, ref: string, props: Record<string, string> = {}): Pieza => ({ id, tipo, ref, x: 0, y: 0, rot: 0, espejo: false, props })

function abrir(piezas: Pieza[]) {
  const doc: Documento = documentoVacio()
  for (const p of piezas) doc.piezas[p.id] = p
  const pedidos: (PedidoTexto | PedidoCampos)[] = []
  const ed = new Editor(lib, doc, idSecuencial(), { editarTexto: (p) => pedidos.push(p), registrar: () => {} })
  ed.tolerancia = 0.5
  return { ed, doc, pedidos }
}
const pedido = (ed: Editor, pedidos: (PedidoTexto | PedidoCampos)[], id: string): PedidoCampos => {
  ed.editarValor(id)
  const p = pedidos.at(-1)
  if (p?.tipo !== 'pieza') throw new Error('sin pedido')
  return p
}
const iSpice = (p: PedidoCampos) => p.campos.findIndex((c) => c.id === 'spice')

describe('doble clic: modelo Personalizado', () => {
  it('un transistor, un MOSFET y un amplificador lo traen vacío y con los parámetros de su modelo elegido como base', () => {
    const { ed, pedidos } = abrir([P('q', 'npn', 'Q1', { modelo: '2N3904' }), P('m', 'mosfet-n', 'Q2'), P('u', 'amp-op', 'U1', { modelo: 'LM358' })])
    const q = pedido(ed, pedidos, 'q')
    expect(q.campos[iSpice(q)]).toMatchObject({ titulo: 'Personalizado', inicial: '', personalizado: { familia: 'bjt' } })
    expect(q.campos[iSpice(q)].personalizado!.base).toContain('bf = 500')
    const m = pedido(ed, pedidos, 'm')
    expect(m.campos[iSpice(m)].personalizado).toMatchObject({ familia: 'mosfet' })
    expect(m.campos[iSpice(m)].personalizado!.base).toContain('vto = 2.1')
    const u = pedido(ed, pedidos, 'u')
    expect(u.campos[iSpice(u)].personalizado).toMatchObject({ familia: 'ampop' })
    expect(u.campos[iSpice(u)].personalizado!.base).toContain('gbw = 1000000')
  })

  it('una resistencia, un diodo y un comparador no lo traen', () => {
    const { ed, pedidos } = abrir([P('r', 'resistencia', 'R1'), P('d', 'diodo', 'D1'), P('c', 'comparador', 'U2')])
    for (const id of ['r', 'd', 'c']) expect(iSpice(pedido(ed, pedidos, id))).toBe(-1)
  })

  it('activarlo escribe el juego en la pieza en un paso de deshacer; quitarlo vuelve al modelo', () => {
    const { ed, pedidos } = abrir([P('q', 'npn', 'Q1', { modelo: 'BC547' })])
    const p = pedido(ed, pedidos, 'q')
    const vals = p.campos.map((c) => c.inicial)
    vals[iSpice(p)] = 'bf = 200\nis = 1e-14'
    expect(p.aceptar(vals)).toBeNull()
    expect(ed.doc.piezas.q.spice).toEqual({ bf: 200, is: 1e-14 })
    expect(ed.historial.puedeDeshacer).toBe(true)
    ed.deshacer()
    expect(ed.doc.piezas.q.spice).toBeUndefined()
    expect(ed.historial.puedeDeshacer).toBe(false)
    // Vuelve a abrir con el juego puesto y lo quita escribiendo nada.
    ed.rehacer()
    const otra = pedido(ed, pedidos, 'q')
    expect(otra.campos[iSpice(otra)].inicial).toBe('is = 1e-14\nbf = 200')
    const v2 = otra.campos.map((c) => c.inicial)
    v2[iSpice(otra)] = ''
    expect(otra.aceptar(v2)).toBeNull()
    expect(Object.hasOwn(ed.doc.piezas.q, 'spice')).toBe(false)
  })

  it('cambiar el modelo y el juego propio va en el mismo paso, y aceptar sin tocar no abre ninguno', () => {
    const { ed, pedidos } = abrir([P('q', 'npn', 'Q1', { modelo: '2N2222' })])
    const p = pedido(ed, pedidos, 'q')
    expect(p.aceptar(p.campos.map((c) => c.inicial))).toBeNull()
    expect(ed.historial.puedeDeshacer).toBe(false)
    const vals = p.campos.map((c) => c.inicial)
    vals[p.campos.findIndex((c) => c.id === 'prop:modelo')] = 'BC547'
    vals[iSpice(p)] = 'bf = 50'
    expect(p.aceptar(vals)).toBeNull()
    expect(ed.doc.piezas.q.props.modelo).toBe('BC547')
    expect(ed.doc.piezas.q.spice).toEqual({ bf: 50 })
    ed.deshacer()
    expect(ed.doc.piezas.q.props.modelo).toBe('2N2222')
    expect(ed.doc.piezas.q.spice).toBeUndefined()
  })

  it('un renglón que el motor no lee se dice mientras se escribe y al aceptar, sin cambiar nada', () => {
    const { ed, pedidos } = abrir([P('q', 'npn', 'Q1')])
    const p = pedido(ed, pedidos, 'q')
    const vals = p.campos.map((c) => c.inicial)
    vals[iSpice(p)] = 'beta = 100'
    expect(p.revisar(vals)[iSpice(p)].error).toMatch(/^Renglón 1 \(«beta»\): parámetro desconocido/)
    expect(p.aceptar(vals)).toMatchObject({ campo: iSpice(p), error: expect.stringContaining('beta') })
    expect(ed.doc.piezas.q.spice).toBeUndefined()
    expect(ed.historial.puedeDeshacer).toBe(false)
  })
})

describe('inspector: modelo Personalizado', () => {
  const vista = (d: Documento, id: string) => {
    const con = calcularConexiones(d, lib)
    const s = seleccionVacia()
    s.piezas.add(id)
    return vistaInspector(d, lib, con, s, nombresDeRedes(d, con))
  }

  it('el campo viaja con la pieza y va siempre a «Más ajustes»', () => {
    const { doc } = abrir([P('q', 'npn', 'Q1', { modelo: '2N3904' }), P('r', 'resistencia', 'R1')])
    const v = vista(doc, 'q')
    if (v.tipo !== 'pieza') throw new Error('no es una pieza')
    const campo = v.props.find((c) => c.id === 'spice')!
    expect(campo).toMatchObject({ nombre: 'Personalizado', texto: '', personalizado: { familia: 'bjt' } })
    const partes = repartirCampos(v.props, (c) => !!c.personalizado)
    expect(partes.vistos.map((c) => c.id)).toEqual(['modelo'])
    expect(partes.mas.map((c) => c.id)).toEqual(['spice'])
    const r = vista(doc, 'r')
    if (r.tipo !== 'pieza') throw new Error('no es una pieza')
    expect(r.props.some((c) => c.id === 'spice')).toBe(false)
  })

  it('cambiarPropiedad con «spice» lo pone y lo quita; simulando queda fijo y un error no cambia nada', () => {
    const { ed } = abrir([P('q', 'npn', 'Q1')])
    expect(ed.cambiarPropiedad('q', 'spice', 'bf = 120')).toBeNull()
    expect(ed.doc.piezas.q.spice).toEqual({ bf: 120 })
    expect(ed.cambiarPropiedad('q', 'spice', 'bf = 120')).toBeNull()
    expect(ed.cambiarPropiedad('q', 'spice', 'bf = abc')).toMatch(/no es un número/)
    expect(ed.doc.piezas.q.spice).toEqual({ bf: 120 })
    ed.ponerSimulando(true)
    expect(ed.cambiarPropiedad('q', 'spice', '')).toBe(MENSAJE_SOLO_EN_CALIENTE)
    ed.ponerSimulando(false)
    expect(ed.cambiarPropiedad('q', 'spice', '')).toBeNull()
    expect(Object.hasOwn(ed.doc.piezas.q, 'spice')).toBe(false)
  })

  it('al abrir un archivo, el `spice` de una pieza sin familia de SPICE se descarta con un aviso, y el formato vuelve a ser el de antes', () => {
    const doc: Documento = documentoVacio()
    doc.piezas.r = { ...P('r', 'resistencia', 'R1'), spice: { bf: 200 } }
    doc.piezas.q = { ...P('q', 'npn', 'Q1'), spice: { bf: 200 } }
    const avisos: string[] = []
    const ed = new Editor(lib, documentoVacio(), idSecuencial(), { editarTexto: () => {}, registrar: (t) => avisos.push(t) })
    expect(formatoDe(doc)).toBe(6)
    ed.cargar(doc)
    expect(ed.doc.piezas.r.spice).toBeUndefined()
    expect(Object.hasOwn(ed.doc.piezas.r, 'spice')).toBe(false)
    expect(ed.doc.piezas.q.spice).toEqual({ bf: 200 })
    expect(avisos).toEqual(['Se descartó el modelo propio de R1: su modelo no tiene parámetros de SPICE.'])
    // Sin la del transistor, el archivo ya no necesita el formato 6.
    ed.cargar({ ...doc, piezas: { r: doc.piezas.r } })
    expect(formatoDe(ed.doc)).toBe(1)
    expect(ed.historial.sinGuardar).toBe(true)
  })

  it('un archivo con spice solo en piezas que sí lo admiten se abre tal cual, sin aviso ni cambios', () => {
    const doc: Documento = documentoVacio()
    doc.piezas.q = { ...P('q', 'npn', 'Q1'), spice: { bf: 200 } }
    const avisos: string[] = []
    const ed = new Editor(lib, documentoVacio(), idSecuencial(), { editarTexto: () => {}, registrar: (t) => avisos.push(t) })
    ed.cargar(doc)
    expect(ed.doc).toBe(doc)
    expect(avisos).toEqual([])
    expect(ed.historial.sinGuardar).toBe(false)
  })

  it('una resistencia no tiene modelo propio: la propiedad «spice» no hace nada', () => {
    const { ed } = abrir([P('r', 'resistencia', 'R1')])
    expect(ed.cambiarPropiedad('r', 'spice', 'bf = 5')).toBeNull()
    expect(ed.doc.piezas.r.spice).toBeUndefined()
  })
})

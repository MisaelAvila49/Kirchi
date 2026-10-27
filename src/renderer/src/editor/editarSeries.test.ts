// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { escribirKir, leerKir } from '../archivo/kir'
import { idSecuencial } from '../doc/ids'
import { documentoVacio, type Documento, type Pieza } from '../doc/tipos'
import { libreriaDePrueba } from '../prueba/libreria'
import { vistaCatalogo } from '../valores/vistaSerie'
import { Editor, type PedidoCampos, type PedidoTexto } from './Editor'

/* Series y valores: el doble clic lleva a la ficha la serie de una resistencia o un capacitor, el catálogo de un
   Zener y la tabla de modelos de un transistor; un `.kir` viejo con un valor libre abre como Personalizado y no cambia nada. */

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

describe('doble clic: serie, catálogo y tabla', () => {
  it('el valor de una resistencia lleva la serie elegida y su unidad; el de un capacitor, también', () => {
    const { ed, pedidos } = abrir([P('r', 'resistencia', 'R1', { valor: '4.8k' }), P('c', 'capacitor', 'C1', { valor: '100n' })])
    expect(pedido(ed, pedidos, 'r').campos.find((c) => c.id === 'valor')).toMatchObject({ inicial: '4.8k', unidad: 'Ω', serie: 'elegida' })
    expect(pedido(ed, pedidos, 'c').campos.find((c) => c.id === 'valor')).toMatchObject({ unidad: 'F', serie: 'elegida' })
  })
  it('la capacitancia de un electrolítico es E6 fija y su voltaje, una lista de voltajes comerciales', () => {
    const { ed, pedidos } = abrir([P('e', 'capacitor-electrolitico', 'C1')])
    const p = pedido(ed, pedidos, 'e')
    expect(p.campos.find((c) => c.id === 'valor')).toMatchObject({ serie: 'E6', unidad: 'F' })
    expect(p.campos.find((c) => c.id === 'prop:voltaje')?.opciones).toEqual(['6.3 V', '10 V', '16 V', '25 V', '35 V', '50 V', '63 V', '100 V'])
  })
  it('un transistor lleva la tabla de modelos en la lista del modelo, y elegir uno es un paso de deshacer', () => {
    const { ed, pedidos } = abrir([P('q', 'npn', 'Q1', { modelo: '2N3904' })])
    const p = pedido(ed, pedidos, 'q')
    const i = p.campos.findIndex((c) => c.id === 'prop:modelo')
    expect(p.campos[i].tabla?.filas.map((f) => f.modelo)).toEqual(['2N2222', '2N3904', 'BC547', 'TIP31', 'TIP120', 'BD139', 'BC337', '2N5551', '2N3055'])
    const vals = p.campos.map((c) => c.inicial)
    vals[i] = 'BC547'
    expect(p.aceptar(vals)).toBeNull()
    expect(ed.doc.piezas.q.props.modelo).toBe('BC547')
  })
})

describe('un .kir viejo con un valor libre abre como Personalizado', () => {
  const viejo = () => {
    const d = documentoVacio()
    d.piezas.z = P('z', 'zener', 'D1', { voltaje: '5.7' })
    d.piezas.r = P('r', 'resistencia', 'R1', { valor: '4.8k' })
    return d
  }
  it('el archivo guarda y lee los mismos textos: nada migra', () => {
    const r = leerKir(escribirKir(viejo(), '0.0.1'))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.doc.piezas.z.props).toEqual({ voltaje: '5.7' })
  })
  it('el Zener con 5.7 V no es del catálogo: Personalizado, con ese mismo valor', () => {
    const { ed, pedidos } = abrir([P('z', 'zener', 'D1', { voltaje: '5.7' })])
    const c = pedido(ed, pedidos, 'z').campos.find((x) => x.id === 'valor')!
    expect(c.inicial).toBe('5.7')
    expect(c.catalogo).toContain('5.1')
    expect(c.catalogo).not.toContain('5.7')
    expect(vistaCatalogo(c.inicial, 'V', c.catalogo!).personalizado).toBe(true)
  })
  it('aceptar sin tocar el valor no cambia el documento ni abre un paso de deshacer', () => {
    const { ed, pedidos } = abrir([P('z', 'zener', 'D1', { voltaje: '5.7' }), P('r', 'resistencia', 'R1', { valor: '4.8k' })])
    for (const id of ['z', 'r']) {
      const antes = JSON.stringify(ed.doc.piezas[id])
      const p = pedido(ed, pedidos, id)
      expect(p.aceptar(p.campos.map((c) => c.inicial))).toBeNull()
      expect(JSON.stringify(ed.doc.piezas[id])).toBe(antes)
    }
    expect(ed.historial.puedeDeshacer).toBe(false)
  })
  it('el valor libre sigue aceptándose, también uno que no es comercial', () => {
    const { ed, pedidos } = abrir([P('r', 'resistencia', 'R1', { valor: '1k' })])
    const p = pedido(ed, pedidos, 'r')
    const vals = p.campos.map((c) => c.inicial)
    vals[p.campos.findIndex((c) => c.id === 'valor')] = '4.8k'
    expect(p.aceptar(vals)).toBeNull()
    expect(ed.doc.piezas.r.props.valor).toBe('4.8k')
  })
})

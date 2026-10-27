// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { calcularConexiones } from '../conexiones/conexiones'
import { idSecuencial } from '../doc/ids'
import { documentoVacio, type Cable, type Documento, type Pieza } from '../doc/tipos'
import { libreriaDePrueba } from '../prueba/libreria'
import { Editor, type PedidoCampos } from './Editor'

const lib = libreriaDePrueba().piezas
const NAND = (id: string, ref: string, x: number, y: number, props: Record<string, string> = {}): Pieza => ({ id, tipo: 'nand', ref, x, y, rot: 0, espejo: false, props })

function abrir(doc: Documento): Editor {
  const ed = new Editor(lib, doc, idSecuencial(), { registrar: () => {} })
  ed.tolerancia = 0.5
  return ed
}
/** Una NAND en el origen con un cable horizontal que llega a su entrada B (-6, 2) y otro que sale de Y (6, 0). */
function conCables(): Documento {
  const d = documentoVacio()
  d.piezas.u = NAND('u', 'U1', 0, 0)
  const c = (id: string, ...pts: [number, number][]): Cable => ({ id, puntos: pts.map(([x, y]) => ({ x, y })) })
  d.cables.b = c('b', [-20, 2], [-6, 2])
  d.cables.y = c('y', [6, 0], [20, 0])
  return d
}

describe('cantidad de entradas de una compuerta', () => {
  it('una compuerta sin la propiedad (un archivo de antes) tiene dos entradas', () => {
    const ed = abrir(conCables())
    const def = lib.get(ed.doc.piezas.u.tipo)!
    expect(def.pines.map((p) => p.id)).toEqual(['A', 'B', 'Y'])
    expect(def.props.find((p) => p.id === 'entradas')?.defecto).toBe('2')
  })

  it('cada cantidad de 3 a 8 es una pieza oculta con sus pines en la rejilla y una columna centrada', () => {
    for (const n of [3, 4, 5, 6, 7, 8]) {
      const def = lib.get(`nand-${n}`)!
      expect(def.oculta).toBe(true)
      const entradas = def.pines.filter((p) => p.id !== 'Y')
      expect(entradas.map((p) => p.id).join('')).toBe('ABCDEFGH'.slice(0, n))
      expect(entradas.reduce((s, p) => s + p.y, 0), 'centrada').toBe(0)
      expect(entradas.every((p, k) => k === 0 || p.y - entradas[k - 1].y === 4)).toBe(true)
      expect(def.modelo).toMatchObject({ tipo: 'compuerta', funcion: 'nand', entradas: entradas.map((p) => p.id) })
    }
  })

  it('subir a 4 entradas cambia la pieza, conserva su referencia y lleva el cable de B a su lugar nuevo', () => {
    const ed = abrir(conCables())
    expect(ed.cambiarPropiedad('u', 'entradas', '4')).toBeNull()
    expect(ed.doc.piezas.u).toMatchObject({ tipo: 'nand-4', ref: 'U1', x: 0, y: 0 })
    expect(ed.doc.piezas.u.props.entradas).toBeUndefined()
    const pinB = lib.get('nand-4')!.pines.find((p) => p.id === 'B')!
    const puntos = ed.doc.cables.b.puntos
    expect(puntos[0]).toEqual({ x: -20, y: 2 })
    expect(puntos[puntos.length - 1]).toEqual({ x: pinB.x, y: pinB.y })
    // Siguen unidos: B y la salida están en las redes de sus cables.
    const con = calcularConexiones(ed.doc, lib)
    expect(con.redDePin.get('u:B')).toBeDefined()
    expect(con.redDePin.get('u:Y')).toBeDefined()
  })

  it('deshacer devuelve la compuerta de dos entradas y su cable', () => {
    const ed = abrir(conCables())
    const antes = JSON.stringify(ed.doc)
    ed.cambiarPropiedad('u', 'entradas', '3')
    expect(ed.doc.piezas.u.tipo).toBe('nand-3')
    ed.deshacer()
    expect(JSON.stringify(ed.doc)).toBe(antes)
  })

  it('bajar de cantidad deja suelto el cable de la entrada que desaparece', () => {
    const d = documentoVacio()
    d.piezas.u = { ...NAND('u', 'U1', 0, 0), tipo: 'nand-4' }
    d.cables.d = { id: 'd', puntos: [{ x: -20, y: 6 }, { x: -6, y: 6 }] }
    const ed = abrir(d)
    expect(ed.cambiarPropiedad('u', 'entradas', '2')).toBeNull()
    expect(ed.doc.piezas.u.tipo).toBe('nand')
    expect(ed.doc.cables.d.puntos).toEqual([{ x: -20, y: 6 }, { x: -6, y: 6 }])
    expect(calcularConexiones(ed.doc, lib).redDePin.get('u:D')).toBeUndefined()
  })

  it('si la compuerta más grande choca con otra pieza, no cambia y lo dice', () => {
    const d = documentoVacio()
    d.piezas.u = NAND('u', 'U1', 0, 0)
    d.piezas.v = NAND('v', 'U2', 0, 12)
    const ed = abrir(d)
    expect(ed.cambiarPropiedad('u', 'entradas', '8')).toMatch(/^U1 no cabe con 8 entradas: choca con U2/)
    expect(ed.doc.piezas.u.tipo).toBe('nand')
  })

  it('simulando no se cambia', () => {
    const ed = abrir(conCables())
    ed.simulando = true
    expect(ed.cambiarPropiedad('u', 'entradas', '3')).not.toBeNull()
    expect(ed.doc.piezas.u.tipo).toBe('nand')
  })

  it('el editor del doble clic ofrece Entradas y cambia la compuerta como el inspector', () => {
    const pedidos: PedidoCampos[] = []
    const ed = new Editor(lib, conCables(), idSecuencial(), { registrar: () => {}, editarTexto: (p) => pedidos.push(p as PedidoCampos) })
    ed.editarValor('u')
    const campo = pedidos[0].campos.find((c) => c.id === 'prop:entradas')!
    expect(campo.opciones).toEqual(['2', '3', '4', '5', '6', '7', '8'])
    expect(campo.inicial).toBe('2')
    const vals = pedidos[0].campos.map((c) => (c.id === 'prop:entradas' ? '4' : c.inicial))
    expect(pedidos[0].aceptar(vals)).toBeNull()
    expect(ed.doc.piezas.u.tipo).toBe('nand-4')
    // Una compuerta de cuatro entradas la muestra con 4 y bajar a 2 funciona igual.
    ed.editarValor('u')
    const otro = pedidos[1]
    expect(otro.campos.find((c) => c.id === 'prop:entradas')!.inicial).toBe('4')
    expect(otro.aceptar(otro.campos.map((c) => (c.id === 'prop:entradas' ? '2' : c.inicial)))).toBeNull()
    expect(ed.doc.piezas.u.tipo).toBe('nand')
  })

  it('en el editor del doble clic, si no cabe, el error va en el campo y nada cambia', () => {
    const d = documentoVacio()
    d.piezas.u = NAND('u', 'U1', 0, 0)
    d.piezas.v = NAND('v', 'U2', 0, 12)
    const pedidos: PedidoCampos[] = []
    const ed = new Editor(lib, d, idSecuencial(), { registrar: () => {}, editarTexto: (p) => pedidos.push(p as PedidoCampos) })
    ed.editarValor('u')
    const r = pedidos[0].aceptar(pedidos[0].campos.map((c) => (c.id === 'prop:entradas' ? '8' : c.inicial)))
    expect(r?.error).toMatch(/no cabe con 8 entradas/)
    expect(ed.doc.piezas.u.tipo).toBe('nand')
  })
})

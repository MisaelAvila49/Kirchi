// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { calcularConexiones } from '../conexiones/conexiones'
import { conEtiquetas, type Parte } from '../prueba/circuitos'
import { conPiezas, piezaDePrueba } from '../prueba/piezasNuevas'
import { compilarNetlist, type ElementoMotor } from './netlist'
import { secuenciaDeRebote } from './teclado'

const dip = piezaDePrueba(
  'dip-t', ['1', '2', '3', '4', '5', '6', '7', '8'],
  [{ id: 'estado', nombre: 'Estado', texto: true, defecto: '0000' }],
  { tipo: 'interruptores', contactos: [['1', '8'], ['2', '7'], ['3', '6'], ['4', '5']], estado: 'estado', r_on: 0.05, r_off: 1e9 },
  'SW'
)
const FILAS = ['F1', 'F2', 'F3', 'F4']
const COLUMNAS = ['C1', 'C2', 'C3', 'C4']
const teclado = piezaDePrueba('tec-t', [...FILAS, ...COLUMNAS], [], { tipo: 'teclado', filas: FILAS, columnas: COLUMNAS, r_on: 100, r_off: 1e8 }, 'KP')
const lib = conPiezas(dip, teclado)

const compilar = (partes: Parte[]) => {
  const d = conEtiquetas(lib, partes)
  const con = calcularConexiones(d, lib)
  return { d, r: compilarNetlist(d, lib, con), nodo: (nombre: string) => con.redes.find((x) => x.nombre === nombre)!.id }
}
const intc = (els: ElementoMotor[]) => els.filter((e) => e.type === 'INTC') as Extract<ElementoMotor, { type: 'INTC' }>[]
const R = (ref: string, a: string, b: string): Parte => ({ tipo: 'resistencia', ref, props: { valor: '1k' }, pines: { '1': a, '2': b } })

describe('el interruptor DIP', () => {
  const partes = (estado: string): Parte[] => [{ tipo: 'dip-t', ref: 'SW1', props: { estado }, pines: Object.fromEntries(['1', '2', '3', '4', '5', '6', '7', '8'].map((p) => [p, `n${p}`])) }]

  it('arma un INTC por posición entre sus dos patillas, con un canal cada una', () => {
    const { d, r, nodo } = compilar(partes('0000'))
    expect(r.errores).toEqual([])
    const els = intc(r.netlist!.elements)
    expect(els).toHaveLength(4)
    expect(els.map((e) => [e.a, e.b])).toEqual([['n1', 'n8'], ['n2', 'n7'], ['n3', 'n6'], ['n4', 'n5']].map(([x, y]) => [r.nodoDeRed.get(nodo(x)), r.nodoDeRed.get(nodo(y))]))
    expect(els.every((e) => e.r_on === 0.05 && e.r_off === 1e9)).toBe(true)
    const id = Object.keys(d.piezas).find((k) => d.piezas[k].tipo === 'dip-t')!
    expect(els.map((e) => e.canal)).toEqual([0, 1, 2, 3].map((k) => r.canalDe.get(`${id}:estado:${k}`)))
  })

  it('el estado del documento llega a los canales: un 1 es cerrado', () => {
    const { r } = compilar(partes('1010'))
    expect(r.netlist!.canales!.map((c) => c.inicial)).toEqual([1, 0, 1, 0])
  })

  it('el contacto cuenta como conexión de sus redes sin reportar las patillas sueltas', () => {
    expect(compilar(partes('0000')).r.errores).toEqual([])
  })
})

describe('el teclado matricial', () => {
  const pines = Object.fromEntries([...FILAS, ...COLUMNAS].map((p) => [p, p.toLowerCase()]))

  it('arma una tecla por cruce de fila y columna: la tecla k = fila · 4 + columna une su fila con su columna', () => {
    const { d, r, nodo } = compilar([{ tipo: 'tec-t', ref: 'KP1', props: {}, pines }])
    expect(r.errores).toEqual([])
    const els = intc(r.netlist!.elements)
    expect(els).toHaveLength(16)
    const id = Object.keys(d.piezas).find((k) => d.piezas[k].tipo === 'tec-t')!
    // Tecla de la fila 2 (índice 1) y la columna 3 (índice 2): la sexta del arreglo, k = 6.
    const k = 1 * 4 + 2
    const e = els.find((x) => x.canal === r.canalDe.get(`${id}:tecla:${k}`))!
    expect([e.a, e.b]).toEqual([r.nodoDeRed.get(nodo('f2')), r.nodoDeRed.get(nodo('c3'))])
    expect(e).toMatchObject({ r_on: 100, r_off: 1e8 })
    // Todas arrancan sueltas.
    expect(r.netlist!.canales!.every((c) => c.inicial === 0)).toBe(true)
    expect(r.netlist!.canales).toHaveLength(16)
  })

  it('un teclado cableado a una resistencia no deja filas ni columnas reportadas sueltas', () => {
    const { r } = compilar([{ tipo: 'tec-t', ref: 'KP1', props: {}, pines: { ...pines, F1: 'a', C1: 'b' } }, R('R1', 'a', 'b'), R('R2', 'b', '0')])
    expect(r.errores).toEqual([])
  })
})

describe('el rebote', () => {
  it('es un patrón fijo de cambios en menos de 5 ms que empieza en t = 0 y termina en el valor final', () => {
    for (const cierra of [true, false]) {
      const s = secuenciaDeRebote(cierra)
      expect(s[0][0]).toBe(0)
      expect(s[s.length - 1][1]).toBe(cierra ? 1 : 0)
      expect(s[s.length - 1][0]).toBeLessThan(5e-3)
      expect(s.every(([t], k) => k === 0 || t > s[k - 1][0])).toBe(true)
      // Cada cambio alterna el valor.
      expect(s.every(([, v], k) => k === 0 || v !== s[k - 1][1])).toBe(true)
    }
    expect(secuenciaDeRebote(true)).toEqual(secuenciaDeRebote(true))
    expect(secuenciaDeRebote(false).map(([, v]) => v)).toEqual(secuenciaDeRebote(true).map(([, v]) => 1 - v))
  })
})

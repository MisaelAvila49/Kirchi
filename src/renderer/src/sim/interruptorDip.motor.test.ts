// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { calcularConexiones } from '../conexiones/conexiones'
import { compilarNetlist } from '../netlist/netlist'
import { conEtiquetas, type Parte } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import { basesDeTiempo, pasoDeSimulacion } from './lectura'
import init, { Simulator } from './pkg/kirchi_engine.js'

// El interruptor DIP de la Librería en el motor: qué patillas une cada posición y que un canal la cierra en el instante dado.

const lib = libreriaDePrueba().piezas
beforeAll(async () => {
  await init({ module_or_path: readFileSync(join(import.meta.dirname, 'pkg/kirchi_engine_bg.wasm')) })
})

const V = (ref: string, v: string, mas: string): Parte => ({ tipo: 'fuente-dc', ref, props: { voltaje: v }, pines: { '+': mas, '-': '0' } })
const R = (ref: string, valor: string, a: string, b: string): Parte => ({ tipo: 'resistencia', ref, props: { valor }, pines: { '1': a, '2': b } })

function armar(partes: Parte[], ref: string) {
  const d = conEtiquetas(lib, partes)
  const con = calcularConexiones(d, lib)
  const r = compilarNetlist(d, lib, con)
  expect(r.errores).toEqual([])
  const id = Object.values(d.piezas).find((p) => p.ref === ref)!.id
  const sim = new Simulator(JSON.stringify(r.netlist), pasoDeSimulacion(r.netlist!, basesDeTiempo(r)))
  sim.set_tolerances(1e-4, 1e-12, 1e-7)
  const nodo = (nombre: string) => r.nodoDeRed.get(con.redes.find((x) => x.nombre === nombre)!.id)!
  const canal = (prop: string, k: number) => r.canalDe.get(`${id}:${prop}:${k}`)!
  const v = (nombre: string) => sim.voltages()[nodo(nombre)]
  return { r, sim, nodo, canal, v }
}


/** Las variantes de la Librería: posiciones y pieza. */
const VARIANTES = [[4, 'interruptor-dip-4'], [8, 'interruptor-dip-8']] as const

describe('interruptor DIP', () => {
  /** Cada posición k tiene una fuente de 5 V en su patilla k y una carga de 1 kΩ a tierra en la contraria. */
  const circuito = (tipo: string, n: number, estado: string): Parte[] => {
    const pines: Record<string, string> = {}
    const partes: Parte[] = []
    for (let k = 1; k <= n; k++) {
      pines[String(k)] = `a${k}`
      pines[String(2 * n + 1 - k)] = `b${k}`
      partes.push(V(`V${k}`, '5', `a${k}`), R(`R${k}`, '1k', `b${k}`, '0'))
    }
    return [...partes, { tipo, ref: 'SW1', props: { estado }, pines }]
  }

  it.each(VARIANTES)('el DIP de %d posiciones une la patilla k con la %d + 1 − k solo en las palancas cerradas', (n, tipo) => {
    const estado = Array.from({ length: n }, (_, k) => (k % 2 === 0 ? '1' : '0')).join('')
    const { r, sim, v } = armar(circuito(tipo, n, estado), 'SW1')
    sim.advance_to(1e-5, 1e9)
    for (let k = 1; k <= n; k++) expect(v(`b${k}`), `posición ${k}`).toBeCloseTo(k % 2 === 1 ? 5 * 1000 / (1000 + 0.05) : 0, 3)
    expect([...r.canalDe.keys()].filter((c) => c.includes(':estado:'))).toHaveLength(n)
    sim.free()
  })

  it('un canal cierra o abre su palanca en el instante pedido', () => {
    const { sim, canal, v } = armar(circuito('interruptor-dip-8', 8, '00000000'), 'SW1')
    sim.advance_to(1e-5, 1e9)
    expect(v('b3')).toBeCloseTo(0, 4)
    sim.poner_valor(canal('estado', 2), sim.time(), 1)
    sim.advance_to(2e-5, 1e9)
    expect(v('b3')).toBeCloseTo(5, 2)
    expect(v('b4')).toBeCloseTo(0, 4)
    sim.poner_valor(canal('estado', 2), sim.time(), 0)
    sim.advance_to(3e-5, 1e9)
    expect(v('b3')).toBeCloseTo(0, 4)
    sim.free()
  })
})


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

// El teclado matricial de la Librería en el motor: una tecla une su fila con su columna en el instante en que su canal la cierra.

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


/** Las variantes de la Librería: filas, columnas y pieza. */
const VARIANTES = [[4, 3, 'teclado-4x3'], [4, 4, 'teclado-4x4']] as const

describe('teclado matricial', () => {
  const circuito = (tipo: string, filas: number, columnas: number): Parte[] => {
    const pines: Record<string, string> = {}
    const partes: Parte[] = []
    for (let i = 1; i <= filas; i++) pines[`F${i}`] = `f${i}`
    for (let j = 1; j <= columnas; j++) {
      pines[`C${j}`] = `c${j}`
      partes.push(R(`R${j}`, '1k', `c${j}`, '0'))
    }
    return [...partes, V('V1', '5', 'f1'), V('V2', '5', 'f3'), { tipo, ref: 'KP1', props: {}, pines }]
  }

  it.each(VARIANTES)('el teclado de %d × %d: una tecla une su fila con su columna y las demás no', (filas, columnas, tipo) => {
    const { r, sim, canal, v } = armar(circuito(tipo, filas, columnas), 'KP1')
    expect([...r.canalDe.keys()].filter((c) => c.includes(':tecla:'))).toHaveLength(filas * columnas)
    sim.advance_to(1e-5, 1e9)
    for (let j = 1; j <= columnas; j++) expect(v(`c${j}`)).toBeLessThan(0.001)
    // Las filas 1 y 3 están a 5 V: sus teclas elevan la columna por la resistencia de contacto de 100 Ω.
    const alto = 5 * 1000 / 1100
    for (let i = 0; i < filas; i++) {
      for (let j = 0; j < columnas; j++) {
        sim.poner_valor(canal('tecla', i * columnas + j), sim.time(), 1)
        sim.advance_to(sim.time() + 1e-5, 1e9)
        for (let c = 0; c < columnas; c++) {
          const esperado = c === j && (i === 0 || i === 2) ? alto : 0
          expect(v(`c${c + 1}`), `tecla fila ${i + 1} columna ${j + 1}, columna ${c + 1}`).toBeCloseTo(esperado, 2)
        }
        sim.poner_valor(canal('tecla', i * columnas + j), sim.time(), 0)
        sim.advance_to(sim.time() + 1e-5, 1e9)
      }
    }
    sim.free()
  })
})

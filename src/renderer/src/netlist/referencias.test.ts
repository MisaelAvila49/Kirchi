// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { calcularConexiones } from '../conexiones/conexiones'
import type { Id } from '../doc/tipos'
import { conEtiquetas } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import { leerResultados, type Lectura } from '../sim/lectura'
import init, { Simulator } from '../sim/pkg/kirchi_engine.js'
import { CASOS } from './casosReferencia'
import { compilarNetlist } from './netlist'

// Los circuitos de `engine/referencias/` armados con piezas de la librería, pasados por la netlist y simulados en el WASM
// contra los CSV de ngspice, con el criterio del motor: 1 % del valor (piso de 1 % del pico en transitorio) y ventana de
// tiempo en flancos.

const lib = libreriaDePrueba().piezas
let memoria: WebAssembly.Memory
beforeAll(async () => {
  memoria = (await init({ module_or_path: readFileSync(join(import.meta.dirname, '../sim/pkg/kirchi_engine_bg.wasm')) })).memory
})

const carpeta = join(import.meta.dirname, '../../../../engine/referencias')
function leerCsv(caso: string): { columnas: string[]; filas: number[][] } {
  const [cabeza, ...resto] = readFileSync(join(carpeta, `${caso}.csv`), 'utf8').trim().split(/\r?\n/)
  return { columnas: cabeza.split(','), filas: resto.map((r) => r.split(',').map(Number)) }
}

/** Peor error de cada columna como fracción de la tolerancia (1 es el límite). */
function comparar(caso: string): Record<string, number> {
  const c = CASOS[caso]
  const d = conEtiquetas(lib, c.partes)
  const con = calcularConexiones(d, lib)
  const r = compilarNetlist(d, lib, con)
  expect(r.errores, caso).toEqual([])
  const sim = new Simulator(JSON.stringify(r.netlist), c.hmax)
  if (!c.holgada) sim.set_tolerances(1e-4, 1e-12, 1e-7)
  const idDe = (ref: string): Id => Object.values(d.piezas).find((p) => p.ref === ref)!.id
  const redDe = (nombre: string) => con.redes.findIndex((x) => x.nombre === nombre)
  const leer = (): Lectura => {
    const n = sim.element_count()
    const f64 = (p: number, k = n) => new Float64Array(memoria.buffer, p, k).slice()
    const g = sim.digital_count()
    return leerResultados(r, { time: sim.time(), ratio: 1, capacity: 1, seq: 0, consistente: true, voltages: sim.voltages(), currents: f64(sim.currents_ptr()), aux: f64(sim.aux_ptr()), estado: f64(sim.estado_ptr()), niveles: f64(sim.niveles_ptr(), g), medidas: f64(sim.medidas_ptr(), 3 * g) })
  }
  const medir = (l: Lectura, col: string) => (col.startsWith('v(') ? l.redes.get(redDe(col.slice(2, -1)))! : l.piezas.get(idDe(c.corrientes![col]))!.i)
  const { columnas, filas } = leerCsv(caso)
  const peor: Record<string, number> = {}
  if (columnas[0] !== 't') {
    sim.advance_to(c.fin, 10_000_000)
    const l = leer()
    columnas.forEach((col, j) => {
      // Las corrientes por terminal (`@q1[ic]`) se comparan en las pruebas del motor.
      if (!col.startsWith('v(') && !c.corrientes?.[col]) return
      const ref = filas[0][j]
      peor[col] = Math.abs(medir(l, col) - ref) / (0.01 * Math.abs(ref) + (col.startsWith('i(') ? 1e-9 : 1e-6))
    })
    sim.free()
    return peor
  }
  // Lo que no es una red del esquema (el calentamiento del foco, la velocidad del motor) se compara en las pruebas del motor.
  const cols = columnas.slice(1).filter((col) => (col.startsWith('v(') && redDe(col.slice(2, -1)) >= 0) || c.corrientes?.[col])
  const ts = [0]
  const vs: number[][] = [cols.map(() => 0)]
  if (c.enLosInstantesDelCsv) {
    for (const f of filas) {
      if (f[0] <= 0) continue
      sim.advance_to(f[0], 10_000_000)
      const l = leer()
      ts.push(sim.time())
      vs.push(cols.map((col) => medir(l, col)))
    }
  }
  while (!c.enLosInstantesDelCsv && sim.time() < c.fin) {
    sim.advance_to(c.fin, 1)
    const l = leer()
    ts.push(sim.time())
    vs.push(cols.map((col) => medir(l, col)))
  }
  sim.free()
  const interpolar = (j: number, t: number) => {
    let i = ts.findIndex((x) => x >= t)
    i = Math.min(Math.max(i, 1), ts.length - 1)
    const [t0, t1] = [ts[i - 1], ts[i]]
    return t1 === t0 ? vs[i][j] : vs[i - 1][j] + ((vs[i][j] - vs[i - 1][j]) * (t - t0)) / (t1 - t0)
  }
  cols.forEach((col, j) => {
    const k = columnas.indexOf(col)
    const pico = Math.max(...filas.map((f) => Math.abs(f[k])))
    let max = 0
    for (const f of filas) {
      const [t, ref] = [f[0], f[k]]
      const tol = 0.01 * Math.max(Math.abs(ref), 0.01 * pico) + (col.startsWith('i(') ? 1e-9 : 1e-6)
      let e = Math.abs(interpolar(j, t) - ref) / tol
      if (e > 1 && c.tolT) {
        // En un flanco vale cualquier instante a menos de tolT: la referencia debe caer en lo que el motor recorrió.
        let lo = Math.min(interpolar(j, t - c.tolT), interpolar(j, t + c.tolT))
        let hi = Math.max(interpolar(j, t - c.tolT), interpolar(j, t + c.tolT))
        ts.forEach((x, i) => {
          if (x >= t - c.tolT! && x <= t + c.tolT!) {
            lo = Math.min(lo, vs[i][j])
            hi = Math.max(hi, vs[i][j])
          }
        })
        e = Math.min(e, ref < lo ? (lo - ref) / tol : ref > hi ? (ref - hi) / tol : 0)
      }
      max = Math.max(max, e)
    }
    peor[col] = max
  })
  return peor
}

describe('las piezas de la librería contra ngspice', () => {
  it.each(Object.keys(CASOS))('%s', (caso) => {
    const peor = comparar(caso)
    console.log(`${caso}: ${Object.entries(peor).map(([c, e]) => `${c} ${e.toFixed(3)}`).join(', ')}`)
    for (const [col, e] of Object.entries(peor)) expect(e, `${caso} ${col}`).toBeLessThanOrEqual(1)

  })
})

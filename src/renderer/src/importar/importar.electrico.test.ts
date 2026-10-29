// @vitest-environment happy-dom
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { calcularConexiones, clavePin } from '../conexiones/conexiones'
import { idSecuencial } from '../doc/ids'
import type { Documento } from '../doc/tipos'
import { compilarNetlist } from '../netlist/netlist'
import { libreriaDePrueba } from '../prueba/libreria'
import { leerResultados, type Lectura } from '../sim/lectura'
import init, { Simulator } from '../sim/pkg/kirchi_engine.js'
import { importarBytes } from './importar'

// Los circuitos importados se simulan en el WASM y se comparan con ngspice sobre el mismo circuito escrito a mano en SPICE
// (`__fixtures__/referencias/*.cir`, CSV generados con `scripts/referencias-importar.mjs`), con el criterio de `referencias.test.ts`:
// 1 % del valor (piso de 1 % del pico en transitorio).

const lib = libreriaDePrueba().piezas
let memoria: WebAssembly.Memory
beforeAll(async () => {
  memoria = (await init({ module_or_path: readFileSync(join(import.meta.dirname, '../sim/pkg/kirchi_engine_bg.wasm')) })).memory
})

const fixtures = join(import.meta.dirname, '__fixtures__')

/** Una red del documento se nombra por un pin suyo: `[referencia, pin]`. */
type Pin = [string, string]

interface Corrida {
  doc: Documento
  /** Voltaje de la red del pin dado en cada instante: un solo instante para el punto de operación. */
  tiempos: number[]
  valores: (pin: Pin) => number[]
}

function simular(doc: Documento, fin: number, hmax: number, transitorio: boolean): Corrida {
  const con = calcularConexiones(doc, lib)
  const r = compilarNetlist(doc, lib, con)
  expect(r.errores).toEqual([])
  const sim = new Simulator(JSON.stringify(r.netlist), hmax)
  sim.set_tolerances(1e-4, 1e-12, 1e-7)
  const leer = (): Lectura => {
    const n = sim.element_count()
    const f64 = (p: number, k = n) => new Float64Array(memoria.buffer, p, k).slice()
    const g = sim.digital_count()
    return leerResultados(r, { time: sim.time(), ratio: 1, capacity: 1, seq: 0, consistente: true, voltages: sim.voltages(), currents: f64(sim.currents_ptr()), aux: f64(sim.aux_ptr()), estado: f64(sim.estado_ptr()), niveles: f64(sim.niveles_ptr(), g), medidas: f64(sim.medidas_ptr(), 3 * g) })
  }
  const redDe = ([ref, pin]: Pin): number => {
    const p = Object.values(doc.piezas).find((x) => x.ref === ref)
    if (!p) throw new Error(`No hay pieza ${ref}`)
    const id = p.pines?.find((x) => x.numero === pin)?.id ?? pin
    const red = con.redDePin.get(clavePin(p.id, id))
    if (red === undefined) throw new Error(`${ref}.${pin} no está en ninguna red`)
    return red
  }
  const tiempos: number[] = []
  const lecturas: Lectura[] = []
  if (!transitorio) {
    sim.advance_to(fin, 10_000_000)
    tiempos.push(sim.time())
    lecturas.push(leer())
  } else {
    tiempos.push(0)
    lecturas.push(leer())
    while (sim.time() < fin) {
      sim.advance_to(fin, 1)
      tiempos.push(sim.time())
      lecturas.push(leer())
    }
  }
  sim.free()
  return { doc, tiempos, valores: (pin) => lecturas.map((l) => l.redes.get(redDe(pin))!) }
}

function leerCsv(caso: string): { columnas: string[]; filas: number[][] } {
  const [cabeza, ...resto] = readFileSync(join(fixtures, 'referencias', `${caso}.csv`), 'utf8').trim().split(/\r?\n/)
  return { columnas: cabeza.split(','), filas: resto.map((r) => r.split(',').map(Number)) }
}

/** Peor error de cada columna como fracción de la tolerancia (1 es el límite). `columnas` liga cada `v(red)` del CSV con un pin del documento. */
function comparar(caso: string, c: Corrida, columnas: Record<string, Pin>, tolT = 0): Record<string, number> {
  const { columnas: cols, filas } = leerCsv(caso)
  const peor: Record<string, number> = {}
  const interpolar = (v: number[], t: number) => {
    const i = Math.min(Math.max(c.tiempos.findIndex((x) => x >= t), 1), c.tiempos.length - 1)
    const [t0, t1] = [c.tiempos[i - 1], c.tiempos[i]]
    return t1 === t0 ? v[i] : v[i - 1] + ((v[i] - v[i - 1]) * (t - t0)) / (t1 - t0)
  }
  for (const [nombre, pin] of Object.entries(columnas)) {
    const k = cols.indexOf(nombre)
    expect(k, `${caso} no trae ${nombre}`).toBeGreaterThanOrEqual(0)
    const v = c.valores(pin)
    if (cols[0] !== 't') {
      peor[nombre] = Math.abs(v[0] - filas[0][k]) / (0.01 * Math.abs(filas[0][k]) + 1e-6)
      continue
    }
    const pico = Math.max(...filas.map((f) => Math.abs(f[k])))
    peor[nombre] = Math.max(
      ...filas.map((f) => {
        const [t, ref] = [f[0], f[k]]
        const tol = 0.01 * Math.max(Math.abs(ref), 0.01 * pico) + 1e-6
        const e = Math.abs(interpolar(v, t) - ref) / tol
        if (e <= 1 || !tolT) return e
        // En un flanco vale cualquier instante a menos de tolT: la referencia debe caer en lo que recorrió el motor.
        const cerca = [interpolar(v, t - tolT), interpolar(v, t + tolT), ...v.filter((_, i) => Math.abs(c.tiempos[i] - t) <= tolT)]
        const [lo, hi] = [Math.min(...cerca), Math.max(...cerca)]
        return Math.min(e, ref < lo ? (lo - ref) / tol : ref > hi ? (ref - hi) / tol : 0)
      })
    )
  }
  return peor
}

function importar(carpeta: string, nombre: string, props: Record<string, Record<string, string>> = {}): Documento {
  const r = importarBytes(nombre, readFileSync(join(fixtures, carpeta, nombre)), lib, idSecuencial())
  if (!r.ok) throw new Error(r.motivo)
  for (const [ref, ps] of Object.entries(props)) Object.assign(Object.values(r.doc.piezas).find((p) => p.ref === ref)!.props, ps)
  return r.doc
}

interface Caso {
  origen: [string, string]
  referencia: string
  columnas: Record<string, Pin>
  /** Fin del transitorio en segundos (sin él, punto de operación). */
  fin?: number
  hmax?: number
  /** Ventana de tiempo en los flancos, en segundos (los generadores no tienen flancos de 1 ns). */
  tolT?: number
  /** Propiedades que se corrigen a mano tras importar (referencia de pieza a sus props). */
  ajustes?: Record<string, Record<string, string>>
}

const CASOS: Caso[] = [
  { origen: ['spice', 'divisor.cir'], referencia: 'spice-divisor', columnas: { 'v(in)': ['R1', '1'], 'v(out)': ['R2', '1'] } },
  { origen: ['spice', 'rc.cir'], referencia: 'spice-rc', fin: 30e-3, hmax: 1e-5, columnas: { 'v(ent)': ['R1', '1'], 'v(sal)': ['C1', '1'] } },
  { origen: ['spice', 'transistor.cir'], referencia: 'spice-transistor', columnas: { 'v(c)': ['Rc', '2'], 'v(b)': ['Rb', '2'], 'v(e)': ['Re', '1'] } },
  { origen: ['ltspice', 'divisor.asc'], referencia: 'ltspice-divisor', columnas: { 'v(n1)': ['R1', '2'], 'v(out)': ['R2', '1'] } },
  { origen: ['ltspice', 'rc.asc'], referencia: 'ltspice-rc', fin: 20e-3, hmax: 1e-5, columnas: { 'v(ent)': ['R1', '2'], 'v(sal)': ['C1', '1'] } },
  { origen: ['falstad', 'rc.txt'], referencia: 'falstad-rc', fin: 30e-3, hmax: 1e-5, tolT: 5e-6, columnas: { 'v(ent)': ['R1', '1'], 'v(sal)': ['C1', '1'] } },
  { origen: ['ltspice', 'npn.asc'], referencia: 'ltspice-npn', columnas: { 'v(c)': ['Q1', 'C'], 'v(b)': ['Q1', 'B'] } },
  { origen: ['falstad', 'divisor.txt'], referencia: 'falstad-divisor', columnas: { 'v(in)': ['R1', '1'], 'v(out)': ['R2', '1'] } },
  { origen: ['kicad', 'divisor.kicad_sch'], referencia: 'kicad-divisor', columnas: { 'v(in)': ['R1', '1'], 'v(out)': ['R2', '1'] } }
]

describe('los circuitos importados contra ngspice', () => {
  it.each(CASOS)('$origen $referencia', (c) => {
    const doc = importar(...c.origen, c.ajustes)
    const corrida = simular(doc, c.fin ?? 0.01, c.hmax ?? 1e-4, c.fin !== undefined)
    const peor = comparar(c.referencia, corrida, c.columnas, c.tolT)
    console.log(`${c.referencia}: ${Object.entries(peor).map(([k, e]) => `${k} ${e.toFixed(3)}`).join(', ')}`)
    for (const [col, e] of Object.entries(peor)) expect(e, `${c.referencia} ${col}`).toBeLessThanOrEqual(1)
  })
})

// La fuente de Falstad es ideal: sin eso la entrada cae 3.6 % bajo carga.
it('la fuente de voltaje de Falstad se importa como generador ideal', () => {
  const g = Object.values(importar('falstad', 'rc.txt').piezas).find((p) => p.tipo === 'generador')!
  expect(g.props.ideal).toBe('sí')
})

// El proyecto del usuario: el .pdsprj importado, sin ajustes, contra la simulación que Proteus guardó en su gráfica (traza U4(OP): el escalón
// de 0 a 1 V termina en 0.998 V y el pico es 1.19 V a los 3.9 s). Solo corre en su máquina.
const PDSPRJ = process.env.KIRCHI_PROTEUS_USUARIO ?? (process.env.KIRCHI_LOTE_IMPORTAR ? `${process.env.KIRCHI_LOTE_IMPORTAR}/proteus/New Project.pdsprj` : '')

describe.skipIf(PDSPRJ === '' || !existsSync(PDSPRJ))('el proyecto de Proteus importado contra la simulación que guardó Proteus', () => {
  it('la salida de U4 llega a 0.998 V y tiene su pico de 1.19 V a los 3.9 s', () => {
    const r = importarBytes('New Project.pdsprj', readFileSync(PDSPRJ), lib, idSecuencial())
    if (!r.ok) throw new Error(r.motivo)
    const c = simular(r.doc, 10, 5e-3, true)
    const v = c.valores(['U4', 'OUT'])
    const pico = Math.max(...v)
    const tPico = c.tiempos[v.indexOf(pico)]!
    const final = v[v.length - 1]!
    console.log(`proteus-usuario: final ${final.toFixed(4)} V, pico ${pico.toFixed(4)} V a ${tPico.toFixed(2)} s`)
    expect(Math.abs(final - 0.998) / 0.998).toBeLessThanOrEqual(0.03)
    expect(Math.abs(pico - 1.19) / 1.19).toBeLessThanOrEqual(0.03)
    expect(Math.abs(tPico - 3.9)).toBeLessThanOrEqual(0.3)
  })
})

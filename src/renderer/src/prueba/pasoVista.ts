import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { calcularConexiones } from '../conexiones/conexiones'
import { leerKir } from '../archivo/kir'
import { compilarNetlist, type NetlistMotor } from '../netlist/netlist'
import { conEtiquetas, relojConDisplay, type Parte } from './circuitos'
import { libreriaDePrueba } from './libreria'
import init, { Simulator } from '../sim/pkg/kirchi_engine.js'

/** Lo común de las pruebas del paso de la vista previa: circuitos de comparación y una corrida con muestras. */
const lib = libreriaDePrueba().piezas

export async function iniciarMotor(): Promise<void> {
  await init({ module_or_path: readFileSync(join(import.meta.dirname, '../sim/pkg/kirchi_engine_bg.wasm')) })
}

export function netlistDe(partes: Parte[]): NetlistMotor {
  const d = conEtiquetas(lib, partes)
  const r = compilarNetlist(d, lib, calcularConexiones(d, lib))
  if (!r.netlist) throw new Error(r.errores.join(' '))
  return r.netlist
}

/** El archivo de PruebasManualesKirchi (dentro del repositorio). */
export function netlistDeArchivo(nombre: string): NetlistMotor {
  const bytes = readFileSync(join(import.meta.dirname, '../../../../PruebasManualesKirchi', nombre))
  const l = leerKir(new Uint8Array(bytes))
  if (!l.ok) throw new Error(l.error)
  const r = compilarNetlist(l.doc, lib, calcularConexiones(l.doc, lib))
  if (!r.netlist) throw new Error(r.errores.join(' '))
  return r.netlist
}

const R = (ref: string, valor: string, a: string, b: string): Parte => ({ tipo: 'resistencia', ref, props: { valor }, pines: { '1': a, '2': b } })

export const RC_CUADRADA: Parte[] = [
  { tipo: 'fuente-pulso', ref: 'V1', props: { alto: '5', frecuencia: '1k' }, pines: { '+': 'e', '-': '0' } },
  R('R1', '1k', 'e', 's'),
  { tipo: 'capacitor', ref: 'C1', props: { valor: '100n' }, pines: { '1': 's', '2': '0' } }
]
export const RECTIFICADOR_LED: Parte[] = [
  { tipo: 'fuente-ac', ref: 'V1', props: { amplitud: '5', frecuencia: '60' }, pines: { '+': 'e', '-': '0' } },
  { tipo: 'diodo', ref: 'D1', pines: { A: 'e', K: 'm' } },
  { tipo: 'led', ref: 'D2', pines: { A: 'm', K: 'k' } },
  R('R1', '330', 'k', '0'),
  { tipo: 'capacitor', ref: 'C1', props: { valor: '10u' }, pines: { '1': 'm', '2': '0' } }
]
export const ASTABLE_555: Parte[] = [
  { tipo: 'fuente-dc', ref: 'V1', props: { voltaje: '5' }, pines: { '+': 'vcc', '-': '0' } },
  R('R1', '1k', 'vcc', 'dis'),
  R('R2', '10k', 'dis', 'thr'),
  { tipo: 'capacitor', ref: 'C1', props: { valor: '100n' }, pines: { '1': 'thr', '2': '0' } },
  { tipo: 'capacitor', ref: 'C2', props: { valor: '10n' }, pines: { '1': 'cv', '2': '0' } },
  { tipo: 'temporizador-555', ref: 'U1', props: { modelo: 'NE555' }, pines: { '1': '0', '2': 'thr', '3': 'out', '4': 'vcc', '5': 'cv', '6': 'thr', '7': 'dis', '8': 'vcc' } }
]
/** 555 a unos 700 Hz que cuenta con un contador de 4 bits y lo muestra en un display. */
export const CONTADOR = relojConDisplay('10k', '100n')

/** Corre la netlist con el paso máximo `h` y devuelve, cada `cada` s, todos los voltajes de nodo; y el tiempo de cálculo. */
export function correr(net: NetlistMotor, h: number, hasta: number, cada: number, tramo = 0.01): { t: number[]; v: number[][]; ms: number; pasos: number; error?: string; tError?: number } {
  const sim = new Simulator(JSON.stringify(net), h)
  const t: number[] = []
  const v: number[][] = []
  const inicio = performance.now()
  let siguiente = 0
  let pasos = 0
  let error: string | undefined
  let tError: number | undefined
  try {
    while (sim.time() < hasta - 1e-12) {
      pasos += sim.advance_to(Math.min(hasta, sim.time() + Math.min(tramo, cada)), 1e9)
      if (sim.time() >= siguiente - 1e-12) {
        t.push(sim.time())
        v.push(Array.from(sim.voltages()))
        siguiente += cada
      }
    }
  } catch (e) {
    error = String(e)
    tError = sim.time()
  }
  const ms = performance.now() - inicio
  sim.free()
  return { t, v, ms, pasos, error, tError }
}

/** La mayor diferencia entre dos corridas en los mismos instantes. */
export function diferenciaMaxima(a: number[][], b: number[][]): number {
  let d = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) for (let j = 0; j < a[i].length; j++) d = Math.max(d, Math.abs(a[i][j] - b[i][j]))
  return d
}

/** Cada paso aceptado del motor (t y todos los voltajes) hasta `hasta`, sin recortarlos con tramos: así se ve el paso que elige. */
export function trazaPorPasos(net: NetlistMotor, h: number, hasta: number): { t: number[]; v: Float64Array[]; pasos: number } {
  const sim = new Simulator(JSON.stringify(net), h)
  const t: number[] = []
  const v: Float64Array[] = []
  while (sim.time() < hasta) {
    sim.advance_to(1e9, 1)
    t.push(sim.time())
    v.push(Float64Array.from(sim.voltages()))
  }
  sim.free()
  return { t, v, pasos: t.length }
}

type Traza = { t: number[]; v: Float64Array[] }

/** El voltaje del nodo `n` en el instante `tq`, interpolado entre los dos pasos que lo rodean. */
export function enInstante(z: Traza, n: number, tq: number, desde: { i: number }): number {
  while (desde.i + 1 < z.t.length && z.t[desde.i + 1] < tq) desde.i++
  const i = desde.i
  const j = Math.min(i + 1, z.t.length - 1)
  const dt = z.t[j] - z.t[i]
  const f = dt > 0 ? Math.min(1, Math.max(0, (tq - z.t[i]) / dt)) : 0
  return z.v[i][n] * (1 - f) + z.v[j][n] * f
}

/** Instantes en que el nodo `n` cruza hacia arriba la mitad de su rango (interpolados); vacío si casi no oscila. */
export function cruces(z: Traza, n: number, minSwing = 0.5): number[] {
  let lo = Infinity
  let hi = -Infinity
  for (const w of z.v) {
    lo = Math.min(lo, w[n])
    hi = Math.max(hi, w[n])
  }
  if (hi - lo < minSwing) return []
  const mid = (lo + hi) / 2
  const out: number[] = []
  for (let k = 1; k < z.t.length; k++) {
    const a = z.v[k - 1][n]
    const b = z.v[k][n]
    if (a < mid && b >= mid) out.push(z.t[k - 1] + ((mid - a) / (b - a)) * (z.t[k] - z.t[k - 1]))
  }
  return out
}

/** Periodo medio entre cruces; NaN si hay menos de dos. */
export function periodoMedio(c: number[]): number {
  return c.length < 2 ? Number.NaN : (c[c.length - 1] - c[0]) / (c.length - 1)
}

/** La mayor diferencia entre dos trazas en una rejilla común, relativa al rango de cada nodo (0 a 1), por nodo. */
export function formaRelativa(a: Traza, b: Traza, desde: number, hasta: number, paso: number): number {
  const nodos = a.v[0].length
  let peor = 0
  for (let n = 0; n < nodos; n++) {
    let lo = Infinity
    let hi = -Infinity
    for (const w of a.v) {
      lo = Math.min(lo, w[n])
      hi = Math.max(hi, w[n])
    }
    const rango = Math.max(hi - lo, 1e-9)
    const ia = { i: 0 }
    const ib = { i: 0 }
    for (let tq = desde; tq <= hasta; tq += paso) peor = Math.max(peor, Math.abs(enInstante(a, n, tq, ia) - enInstante(b, n, tq, ib)) / rango)
  }
  return peor
}

/** Voltajes de todos los nodos cada `cada` s (interpolados entre los dos pasos que rodean el instante) dando los pasos naturales del motor. */
export function muestrear(net: NetlistMotor, h: number, hasta: number, cada: number): { v: Float64Array[]; ms: number; pasos: number } {
  const sim = new Simulator(JSON.stringify(net), h)
  const v: Float64Array[] = []
  const inicio = performance.now()
  let pasos = 0
  let tPrev = 0
  let vPrev = Float64Array.from(sim.voltages())
  let siguiente = 0
  while (siguiente <= hasta + 1e-9) {
    sim.advance_to(1e9, 1)
    pasos++
    const t = sim.time()
    const vAct = Float64Array.from(sim.voltages())
    while (siguiente <= t && siguiente <= hasta + 1e-9) {
      const f = t > tPrev ? (siguiente - tPrev) / (t - tPrev) : 1
      v.push(vPrev.map((x, i) => x * (1 - f) + vAct[i] * f))
      siguiente += cada
    }
    tPrev = t
    vPrev = vAct
  }
  const ms = performance.now() - inicio
  sim.free()
  return { v, ms, pasos }
}

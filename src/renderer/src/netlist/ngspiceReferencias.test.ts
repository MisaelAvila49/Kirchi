// @vitest-environment happy-dom
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { GraficoResultado } from '../../../compartido/ngspice'
import type { NetlistMotor } from '../../../compartido/netlistMotor'
import { carpetaHerramientas } from '../../../main/recursos'
import { localizarNgspice, ServicioNgspice } from '../../../main/servicioNgspice'
import { calcularConexiones } from '../conexiones/conexiones'
import type { Id } from '../doc/tipos'
import { conEtiquetas } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import { CASOS } from './casosReferencia'
import { compilarNetlist } from './netlist'

// Cada circuito de `engine/referencias/` armado con piezas de la librería, pasado por la netlist y exportado a SPICE
// corre en el ngspice 47 real y debe dar lo del CSV de referencia: 1 % del valor, piso de 1 % del pico en transitorio y
// ventana de tiempo en flancos. Sin `herramientas/ngspice` se omite con aviso.

const raiz = join(import.meta.dirname, '../../../..')
const ejecutable = localizarNgspice({ empaquetado: false, carpetaHerramientas: carpetaHerramientas({ empaquetado: false, resourcesPath: '', appPath: raiz }), appPath: raiz })
const hay = (() => {
  if (!ejecutable) return false
  const r = spawnSync(ejecutable, ['-n', '-v'], { encoding: 'utf8', windowsHide: true })
  return /ngspice-47\b/.test(`${r.stdout}${r.stderr}`)
})()
if (!hay) console.warn('ngspice 47 no está en herramientas/ngspice (node scripts/referencias-ngspice.mjs lo descarga): se omiten las pruebas contra ngspice.')

const lib = libreriaDePrueba().piezas
const carpeta = join(raiz, 'engine/referencias')
function leerCsv(caso: string): { columnas: string[]; filas: number[][] } {
  const [cabeza, ...resto] = readFileSync(join(carpeta, `${caso}.csv`), 'utf8').trim().split(/\r?\n/)
  return { columnas: cabeza.split(','), filas: resto.map((r) => r.split(',').map(Number)) }
}

const SUFIJOS: Record<string, number> = { f: 1e-15, p: 1e-12, n: 1e-9, u: 1e-6, m: 1e-3, k: 1e3, meg: 1e6, g: 1e9, t: 1e12 }
/** Un número de SPICE (`2u`, `10m`, `1meg`, `2.083e-08`). */
function numeroSpice(t: string): number {
  const m = /^([+-]?[0-9.]+(?:e[+-]?\d+)?)(f|p|n|u|m|k|meg|g|t)?$/i.exec(t)
  if (!m) throw new Error(`Número de SPICE no reconocido: ${t}`)
  return Number(m[1]) * (m[2] ? SUFIJOS[m[2].toLowerCase()] : 1)
}

/** Tarjeta de análisis y opciones del solucionador de la referencia: el paso de ngspice cambia el instante en que los
 * puentes digitales ven un cruce (con otro paso el 555 se desfasa 5 µs en 10 ms), así que se usa el mismo mazo. */
function tarjetaDeReferencia(caso: string) {
  const texto = readFileSync(join(carpeta, `${caso}.cir`), 'utf8')
  const t = /^tran\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)(\s+uic)?\s*$/im.exec(texto)
  const solver: Record<string, number> = {}
  for (const m of (/^\.options\s+(.*)$/im.exec(texto)?.[1] ?? '').matchAll(/(\w+)=(\S+)/g)) if (['reltol', 'abstol', 'vntol', 'itl4', 'gmin'].includes(m[1])) solver[m[1]] = numeroSpice(m[2])
  return { tran: t ? { tipo: 'tran' as const, paso: numeroSpice(t[1]), fin: numeroSpice(t[2]), inicio: numeroSpice(t[3]), maximo: numeroSpice(t[4]), uic: !!t[5] } : null, solver }
}

/** La referencia del cristal modela el escalón con un pulso de 1 ps (`PULSE(0 1 0 1p 1p 1 2)`) y la netlist lo trae como
 * fuente de CD con `uic`, que arranca ya en 1 V: la primera decena de nanosegundos de la rama motional cambia la
 * corriente. Se compara el mismo escalón. */
const AJUSTES: Record<string, (n: NetlistMotor) => void> = {
  cristal_8mhz_escalon: (n) => {
    const v = n.elements.find((e) => e.type === 'V')
    if (v?.type === 'V') v.wave = { kind: 'pulse', low: 0, high: 1, freq: 0.5, rise: 1e-12, fall: 1e-12, width: 1 }
  }
}

const servicio = new ServicioNgspice({ ejecutable: ejecutable ?? 'ngspice', limiteMs: 120_000 })

async function correr(caso: string): Promise<Record<string, number>> {
  const c = CASOS[caso]
  const d = conEtiquetas(lib, c.partes)
  const con = calcularConexiones(d, lib)
  const r = compilarNetlist(d, lib, con)
  expect(r.errores, caso).toEqual([])
  const idDe = (ref: string): Id => Object.values(d.piezas).find((p) => p.ref === ref)!.id
  const redDe = (nombre: string) => con.redes.findIndex((x) => x.nombre === nombre)
  const nodoDe = (nombre: string): number | undefined => {
    const red = redDe(nombre)
    return red < 0 ? undefined : r.nodoDeRed.get(red)
  }
  const { columnas, filas } = leerCsv(caso)
  const esTransitorio = columnas[0] === 't'
  AJUSTES[caso]?.(r.netlist!)
  const tarjeta = tarjetaDeReferencia(caso)
  const analisis = esTransitorio ? tarjeta.tran! : ({ tipo: 'op' } as const)
  const res = await servicio.ejecutar(1, { netlist: r.netlist, analisis, solver: tarjeta.solver })
  if (!res.ok) throw new Error(`${caso}: ${res.error}`)
  const g: GraficoResultado = res.graficos[0]
  const vector = (col: string): Float64Array | null => {
    if (col.startsWith('v(')) {
      const nodo = nodoDe(col.slice(2, -1))
      if (nodo === undefined) return null
      if (nodo === 0) return new Float64Array(g.puntos)
      return g.vectores.find((v) => v.referencia.tipo === 'nodo' && v.referencia.nodo === nodo)?.re ?? null
    }
    const ref = c.corrientes?.[col]
    if (!ref) return null
    const id = idDe(ref)
    const indices = r.piezaDeElemento.map((p, i) => (p === id ? i : -1)).filter((i) => i >= 0)
    for (const i of indices) {
      const v = g.vectores.find((x) => x.referencia.tipo === 'elemento' && x.referencia.indice === i)
      if (v) return v.re
    }
    return null
  }
  const peor: Record<string, number> = {}
  if (!esTransitorio) {
    columnas.forEach((col, j) => {
      const v = vector(col)
      if (!v) return
      const ref = filas[0][j]
      peor[col] = Math.abs(v[0] - ref) / (0.01 * Math.abs(ref) + (col.startsWith('i(') ? 1e-9 : 1e-6))
    })
    return peor
  }
  const ts = g.vectores[0].re
  const interpolar = (v: Float64Array, t: number): number => {
    let lo = 0
    let hi = ts.length - 1
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1
      if (ts[m] >= t) hi = m
      else lo = m
    }
    const i = Math.min(Math.max(ts[lo] >= t ? lo : hi, 1), ts.length - 1)
    const [t0, t1] = [ts[i - 1], ts[i]]
    return t1 === t0 ? v[i] : v[i - 1] + ((v[i] - v[i - 1]) * (t - t0)) / (t1 - t0)
  }
  const cols = columnas.slice(1).filter((col) => vector(col) !== null)
  expect(cols.length, `${caso}: ninguna columna comparable`).toBeGreaterThan(0)
  for (const col of cols) {
    const v = vector(col)!
    const k = columnas.indexOf(col)
    const pico = Math.max(...filas.map((f) => Math.abs(f[k])))
    let max = 0
    for (const f of filas) {
      const [t, ref] = [f[0], f[k]]
      const tol = 0.01 * Math.max(Math.abs(ref), 0.01 * pico) + (col.startsWith('i(') ? 1e-9 : 1e-6)
      let e = Math.abs(interpolar(v, t) - ref) / tol
      if (e > 1 && c.tolT) {
        // En un flanco vale cualquier instante a menos de tolT: la referencia debe caer en lo que ngspice recorrió.
        let lo = Math.min(interpolar(v, t - c.tolT), interpolar(v, t + c.tolT))
        let hi = Math.max(interpolar(v, t - c.tolT), interpolar(v, t + c.tolT))
        for (let i = 0; i < ts.length; i++) {
          if (ts[i] >= t - c.tolT && ts[i] <= t + c.tolT) {
            lo = Math.min(lo, v[i])
            hi = Math.max(hi, v[i])
          }
        }
        e = Math.min(e, ref < lo ? (lo - ref) / tol : ref > hi ? (ref - hi) / tol : 0)
      }
      max = Math.max(max, e)
    }
    peor[col] = max
  }
  return peor
}

describe.skipIf(!hay)('el exportador a SPICE contra las referencias guardadas', () => {
  it.each(Object.keys(CASOS))('%s', async (caso) => {
    const peor = await correr(caso)
    console.log(`${caso}: ${Object.entries(peor).map(([c, e]) => `${c} ${e.toFixed(3)}`).join(', ')}`)
    for (const [col, e] of Object.entries(peor)) expect(e, `${caso} ${col}`).toBeLessThanOrEqual(1)
  }, 180_000)
})

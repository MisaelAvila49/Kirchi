// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { calcularConexiones } from '../conexiones/conexiones'
import type { Documento } from '../doc/tipos'
import { compilarNetlist } from '../netlist/netlist'
import { DEFINICIONES } from '../prueba/definicionesPlantillas'
import { libreriaDePrueba } from '../prueba/libreria'
import { construir } from '../prueba/plantillasIncluidas'
import { configDeInstrumentos, InstrumentosEnWorker } from './instrumentosWorker'
import { basesDeTiempo, pasoDeSimulacion } from './lectura'
import init, { Simulator } from './pkg/kirchi_engine.js'
import { bytesSabInstrumentos, CIFRAS_COLUMNA, crearVistas, leerInstrumentos, MUESTRAS_CSV } from './protocoloInstrumentos'

/** Exportar la captura: la vista previa solo mostraba la última pantalla (diez divisiones). La captura amplia pide al
 * worker TODO lo que conservan las sondas, de su instante más viejo al último, en una sola pantalla. */
const lib = libreriaDePrueba().piezas
let memoria: WebAssembly.Memory
beforeAll(async () => {
  memoria = (await init({ module_or_path: readFileSync(join(import.meta.dirname, 'pkg/kirchi_engine_bg.wasm')) })).memory
})

function filtroConOsciloscopioEnA(): Documento {
  const d = construir(DEFINICIONES.find((x) => x.id === 'filtro-rc-paso-bajas')!, lib)
  d.piezas.p_osc = { id: 'p_osc', tipo: 'osciloscopio', ref: 'XSC1', x: 60, y: 0, rot: 0, espejo: false, props: {} }
  const q = d.cables.c_2.puntos[0]
  d.sondas = { s1: { id: 's1', tipo: 'osciloscopio', x: q.x, y: q.y, instrumento: 'p_osc', entrada: 'A' } }
  return d
}

function simular(d: Documento, ms: number) {
  const r = compilarNetlist(d, lib, calcularConexiones(d, lib))
  if (!r.netlist) throw new Error(r.errores.join(' '))
  const sim = new Simulator(JSON.stringify(r.netlist), pasoDeSimulacion(r.netlist, basesDeTiempo(r)))
  const ci = configDeInstrumentos(r.instrumentos)
  const vistas = crearVistas(new SharedArrayBuffer(bytesSabInstrumentos(1, 0)), 1, 0)
  let reloj = 0
  const inst = new InstrumentosEnWorker(sim, () => memoria.buffer, vistas, structuredClone(ci.config), reloj)
  for (let k = 0; k < ms; k++) {
    sim.advance_to(sim.time() + 1e-3, 1e9)
    reloj += 25
    inst.publicar(reloj)
  }
  inst.publicar(reloj + 1, true)
  const pantalla = leerInstrumentos(vistas, { osciloscopio: 0 }).pantalla!
  const amplia = inst.capturaAmplia(0, 1000)
  const hasta = sim.time()
  sim.free()
  return { pantalla, amplia, hasta }
}

describe('captura amplia del osciloscopio', () => {
  it('abarca todo lo conservado por las sondas y la pantalla normal solo el último tramo', () => {
    const { pantalla, amplia, hasta } = simular(filtroConOsciloscopioEnA(), 60)
    // La pantalla normal (10 divisiones de 1 ms) empieza bien entrada la simulación.
    expect(pantalla.t0).toBeGreaterThan(0.03)
    expect(amplia).not.toBeNull()
    const a = amplia!
    expect(a.t0).toBeGreaterThanOrEqual(0)
    expect(a.t0).toBeLessThan(2e-3)
    expect(a.tCaptura).toBeCloseTo(hasta, 3)
    expect(a.ncol).toBe(1000)
    // Diez divisiones de una base redonda: cubren lo capturado y sobra a lo más un cuarto.
    expect(a.dt * a.ncol).toBeGreaterThanOrEqual((a.tCaptura - a.t0) * (1 - 1e-9))
    expect(a.dt * a.ncol).toBeLessThanOrEqual((a.tCaptura - a.t0) * 1.26)
    expect(Number.isNaN(a.tDisparo)).toBe(true)
    expect(a.csv.n).toBe(MUESTRAS_CSV)
    expect(a.csv.t0).toBeCloseTo(a.t0, 9)
    expect(a.columnas.length).toBe(5 * 1000 * CIFRAS_COLUMNA)
    expect(a.muestras.length).toBe(5 * MUESTRAS_CSV)
  })

  it('el canal A trae datos en todo el tramo (primera y última columna con dato) y B, sin cable, va vacío', () => {
    const { amplia } = simular(filtroConOsciloscopioEnA(), 60)
    const a = amplia!
    const col = (canal: number, j: number) => a.columnas[(canal * a.ncol + j) * CIFRAS_COLUMNA + 4]
    expect(col(0, 0) & 8).toBe(0)
    // La última columna con dato cae donde acaba lo capturado; después, vacío.
    const ultima = Math.min(a.ncol - 1, Math.floor((a.tCaptura - a.t0) / a.dt - 1e-9))
    expect(col(0, ultima) & 8).toBe(0)
    if (ultima < a.ncol - 1) expect(col(0, a.ncol - 1) & 8).toBe(8)
    expect(col(1, 10) & 8).toBe(8)
    // La señal se mueve a lo largo de todo el tramo: no es una línea plana ni NaN.
    const mins = Array.from({ length: a.ncol }, (_, j) => a.columnas[(0 * a.ncol + j) * CIFRAS_COLUMNA])
    const maxs = Array.from({ length: a.ncol }, (_, j) => a.columnas[(0 * a.ncol + j) * CIFRAS_COLUMNA + 1])
    expect(mins.every(Number.isFinite) && maxs.every(Number.isFinite)).toBe(true)
    expect(Math.max(...maxs)).toBeGreaterThan(Math.min(...mins) + 0.1)
  })

  it('con un instante final dado (pantalla congelada) llega solo hasta ahí', () => {
    const r = compilarNetlist(filtroConOsciloscopioEnA(), lib, calcularConexiones(filtroConOsciloscopioEnA(), lib))
    const sim = new Simulator(JSON.stringify(r.netlist), pasoDeSimulacion(r.netlist!, basesDeTiempo(r)))
    const vistas = crearVistas(new SharedArrayBuffer(bytesSabInstrumentos(1, 0)), 1, 0)
    const inst = new InstrumentosEnWorker(sim, () => memoria.buffer, vistas, structuredClone(configDeInstrumentos(r.instrumentos).config), 0)
    let reloj = 0
    for (let k = 0; k < 40; k++) {
      sim.advance_to(sim.time() + 1e-3, 1e9)
      reloj += 25
      inst.publicar(reloj)
    }
    const a = inst.capturaAmplia(0, 500, 0.02)!
    expect(a.tCaptura).toBeCloseTo(0.02, 4)
    expect(inst.capturaAmplia(5, 500)).toBeNull()
    sim.free()
  })

  it('las columnas finas cubren todo lo conservado con columnas de la pantalla y traen lo mismo que la captura amplia', () => {
    const r = compilarNetlist(filtroConOsciloscopioEnA(), lib, calcularConexiones(filtroConOsciloscopioEnA(), lib))
    const sim = new Simulator(JSON.stringify(r.netlist), pasoDeSimulacion(r.netlist!, basesDeTiempo(r)))
    const vistas = crearVistas(new SharedArrayBuffer(bytesSabInstrumentos(1, 0)), 1, 0)
    const inst = new InstrumentosEnWorker(sim, () => memoria.buffer, vistas, structuredClone(configDeInstrumentos(r.instrumentos).config), 0)
    let reloj = 0
    for (let k = 0; k < 60; k++) {
      sim.advance_to(sim.time() + 1e-3, 1e9)
      reloj += 25
      inst.publicar(reloj)
    }
    const f = inst.capturaFina(0)!
    const a = inst.capturaAmplia(0, 1000)!
    expect(f.t0).toBeCloseTo(a.t0, 9)
    expect(f.tCaptura).toBeCloseTo(a.tCaptura, 9)
    expect(f.n * f.dt).toBeGreaterThanOrEqual((f.tCaptura - f.t0) * (1 - 1e-9))
    expect(f.n).toBeGreaterThan(1000)
    expect(f.columnas.length).toBe(5 * f.n * CIFRAS_COLUMNA)
    const extremos = (c: Float32Array, n: number) => {
      let mn = Infinity, mx = -Infinity
      for (let j = 0; j < n; j++) {
        if (c[j * CIFRAS_COLUMNA + 4] & 8) continue
        mn = Math.min(mn, c[j * CIFRAS_COLUMNA])
        mx = Math.max(mx, c[j * CIFRAS_COLUMNA + 1])
      }
      return [mn, mx]
    }
    const [fmn, fmx] = extremos(f.columnas, f.n)
    const [amn, amx] = extremos(a.columnas, a.ncol)
    expect(fmn).toBeCloseTo(amn, 2)
    expect(fmx).toBeCloseTo(amx, 2)
    // Un osciloscopio que no existe no da nada.
    expect(inst.capturaFina(5)).toBeNull()
    sim.free()
  })
})

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
import { bytesSabInstrumentos, CIFRAS_COLUMNA, crearVistas, leerInstrumentos } from './protocoloInstrumentos'

/** Un canal encendido sin nada conectado no debe dibujar traza: una entrada sin cable tiene su propia red de un solo pin y
 * el armado no debe tratarla como conectada («lee 0 V por su resistencia»). */
const lib = libreriaDePrueba().piezas
let memoria: WebAssembly.Memory
beforeAll(async () => {
  memoria = (await init({ module_or_path: readFileSync(join(import.meta.dirname, 'pkg/kirchi_engine_bg.wasm')) })).memory
})

/** La plantilla del filtro RC con XSC1 lejos y una sonda en A sobre el cable entre R1 y C1. */
function filtroConOsciloscopioEnA(): Documento {
  const d = construir(DEFINICIONES.find((x) => x.id === 'filtro-rc-paso-bajas')!, lib)
  d.piezas.p_osc = { id: 'p_osc', tipo: 'osciloscopio', ref: 'XSC1', x: 60, y: 0, rot: 0, espejo: false, props: {} }
  const q = d.cables.c_2.puntos[0]
  d.sondas = { s1: { id: 's1', tipo: 'osciloscopio', x: q.x, y: q.y, instrumento: 'p_osc', entrada: 'A' } }
  return d
}

function simular(d: Documento) {
  const r = compilarNetlist(d, lib, calcularConexiones(d, lib))
  if (!r.netlist) throw new Error(r.errores.join(' '))
  const sim = new Simulator(JSON.stringify(r.netlist), pasoDeSimulacion(r.netlist, basesDeTiempo(r)))
  const ci = configDeInstrumentos(r.instrumentos)
  const vistas = crearVistas(new SharedArrayBuffer(bytesSabInstrumentos(1, 0)), 1, 0)
  let reloj = 0
  const inst = new InstrumentosEnWorker(sim, () => memoria.buffer, vistas, structuredClone(ci.config), reloj)
  for (let k = 0; k < 40; k++) {
    sim.advance_to(sim.time() + 1e-3, 1e9)
    reloj += 25
    inst.publicar(reloj)
  }
  inst.publicar(reloj + 1, true)
  const p = leerInstrumentos(vistas, { osciloscopio: 0 }).pantalla!
  sim.free()
  return { p, r }
}
const columnasDe = (p: NonNullable<ReturnType<typeof simular>['p']>, canal: number) => p.columnas.subarray(canal * p.ncol * CIFRAS_COLUMNA, (canal + 1) * p.ncol * CIFRAS_COLUMNA)
const vacias = (col: Float32Array) => Array.from({ length: col.length / CIFRAS_COLUMNA }, (_, j) => col[j * CIFRAS_COLUMNA + 4] & 8).every(Boolean)

describe('canal con la entrada al aire', () => {
  it('el filtro RC con el osciloscopio en A: B (sin cable) no dibuja nada y A sí', () => {
    const { p, r } = simular(filtroConOsciloscopioEnA())
    const canales = r.instrumentos.osciloscopios.get('p_osc')!.canales
    expect(canales[0].alAire).toBe(false)
    expect(canales[1].alAire).toBe(true)
    expect(canales[1].sonda).toBeNull()
    expect(p.medidas[0][0].valor).toBeGreaterThan(1)
    expect(vacias(columnasDe(p, 0))).toBe(false)
    expect(vacias(columnasDe(p, 1))).toBe(true)
    expect(p.medidas[1][0].razon).toBe('sin-datos')
  })

  it('con B conectado a tierra por un cable sí dibuja 0 V (lo conectó el usuario)', () => {
    const d = filtroConOsciloscopioEnA()
    // La tierra del filtro (t1) y el pin B del osciloscopio unidos con un cable.
    const t = d.piezas.p_t1
    const osc = d.piezas.p_osc
    const pinB = { x: osc.x - 8, y: osc.y - 2 }
    d.cables.c_tb = { id: 'c_tb', puntos: [{ x: t.x, y: t.y }, { x: pinB.x, y: t.y }, pinB] }
    const { p, r } = simular(d)
    expect(r.instrumentos.osciloscopios.get('p_osc')!.canales[1].alAire).toBe(false)
    expect(vacias(columnasDe(p, 1))).toBe(false)
    expect(p.medidas[1][0].valor).toBe(0)
  })
})

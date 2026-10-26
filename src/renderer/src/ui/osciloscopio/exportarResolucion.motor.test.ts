// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { calcularConexiones } from '../../conexiones/conexiones'
import { compilarNetlist } from '../../netlist/netlist'
import { conEtiquetas, type Parte } from '../../prueba/circuitos'
import { libreriaDePrueba } from '../../prueba/libreria'
import { configDeInstrumentos, InstrumentosEnWorker } from '../../sim/instrumentosWorker'
import { basesDeTiempo, pasoDeSimulacion } from '../../sim/lectura'
import init, { Simulator } from '../../sim/pkg/kirchi_engine.js'
import { bytesSabInstrumentos, CIFRAS_COLUMNA, crearVistas } from '../../sim/protocoloInstrumentos'
import { csvDeCaptura } from './exportarCaptura'
import { recortarCaptura } from './recorte'

/**
 * Una senoidal exportada debe salir suave: el tramo se toma de las columnas finas y no de las 2,000 de la captura entera.
 */
const lib = libreriaDePrueba().piezas
let memoria: WebAssembly.Memory
beforeAll(async () => {
  memoria = (await init({ module_or_path: readFileSync(join(import.meta.dirname, '../../sim/pkg/kirchi_engine_bg.wasm')) })).memory
})

const partes: Parte[] = [
  { tipo: 'generador', ref: 'XFG1', props: { frecuencia: '1k', amplitud: '2', forma: 'Senoidal', ideal: 'sí' }, pines: { '+': 's', COM: '0' } },
  { tipo: 'resistencia', ref: 'R1', props: { valor: '1k' }, pines: { '1': 's', '2': '0' } },
  { tipo: 'osciloscopio', ref: 'XSC1', props: { disp_modo: 'Automático', base: '1m' }, pines: { A: 's', B: '0', C: '0', D: '0' } }
]

function capturar(segundos: number) {
  const d = conEtiquetas(lib, partes)
  const r = compilarNetlist(d, lib, calcularConexiones(d, lib))
  if (!r.netlist) throw new Error(r.errores.join(' '))
  const sim = new Simulator(JSON.stringify(r.netlist), pasoDeSimulacion(r.netlist, basesDeTiempo(r)))
  const ci = configDeInstrumentos(r.instrumentos)
  const vistas = crearVistas(new SharedArrayBuffer(bytesSabInstrumentos(1, 0)), 1, 0)
  let reloj = 0
  const inst = new InstrumentosEnWorker(sim, () => memoria.buffer, vistas, structuredClone(ci.config), reloj)
  const paso = 1e-3
  for (let k = 0; k < Math.round(segundos / paso); k++) {
    sim.advance_to(sim.time() + paso, 1e9)
    reloj += 25
    inst.publicar(reloj)
  }
  const amplia = inst.capturaAmplia(0, 2000)!
  const fino = inst.capturaFina(0)!
  const ajustes = ci.config.osciloscopios[0].ajustes
  sim.free()
  return { amplia, fino, ajustes }
}

/** Puntos por periodo y la mayor desviación (V) de las primeras cifras de las columnas contra v(t) = sen(2π·1000·t), amplitud 1 V. */
function medir(p: { t0: number; dt: number; ncol: number; columnas: Float32Array }) {
  let maxDev = 0
  let n = 0
  for (let j = 0; j < p.ncol; j++) {
    const q = j * CIFRAS_COLUMNA
    if (p.columnas[q + 4] & 8) continue
    const t = p.t0 + j * p.dt
    maxDev = Math.max(maxDev, Math.abs(p.columnas[q + 2] - Math.sin(2 * Math.PI * 1000 * t)))
    n++
  }
  return { n, maxDev }
}

describe('exportar un tramo de la captura a su resolución plena', () => {
  it('1 kHz durante 10 ms, tramo de 0 a 5 ms: 40 puntos por periodo o más y desviación menor a 1 % de la amplitud', () => {
    const { amplia, fino, ajustes } = capturar(0.01)
    const rec = recortarCaptura(ajustes, { ...amplia, fino }, { desde: 0, hasta: 5e-3 })
    expect(rec.recortada).toBe(true)
    const { n, maxDev } = medir(rec.p)
    expect(n / 5).toBeGreaterThanOrEqual(40)
    expect(maxDev).toBeLessThan(0.01)
  })

  it('una captura larga (2 s) no deja el tramo de 5 periodos en unos 8 puntos por periodo', () => {
    const { amplia, fino, ajustes } = capturar(2)
    const sinFino = recortarCaptura(ajustes, amplia, { desde: 0, hasta: 5e-3 })
    // Antes: las 2,000 columnas de 2 s dan 1 ms por columna, un punto por periodo.
    expect(sinFino.p.ncol / 5).toBeLessThan(10)
    const rec = recortarCaptura(ajustes, { ...amplia, fino }, { desde: 0, hasta: 5e-3 })
    expect(rec.p.ncol / 5).toBeGreaterThanOrEqual(40)
  })

  it('el CSV del tramo trae las muestras finas del tramo, no los 2,001 instantes de toda la captura', () => {
    const { amplia, fino, ajustes } = capturar(2)
    const filas = csvDeCaptura('XSC1', ajustes, { ...amplia, fino }, { desde: 0, hasta: 5e-3 })
      .split('\n')
      .filter((l) => l && !l.startsWith('#'))
      .slice(1)
    expect(filas.length / 5).toBeGreaterThanOrEqual(40)
  })
})

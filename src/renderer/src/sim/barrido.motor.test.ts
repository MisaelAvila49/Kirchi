// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { calcularConexiones } from '../conexiones/conexiones'
import { compilarNetlist } from '../netlist/netlist'
import { conEtiquetas, type Parte } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import { configDeInstrumentos, InstrumentosEnWorker } from './instrumentosWorker'
import { basesDeTiempo, pasoDeSimulacion } from './lectura'
import init, { Simulator } from './pkg/kirchi_engine.js'
import { bytesSabInstrumentos, crearVistas, leerInstrumentos } from './protocoloInstrumentos'

const lib = libreriaDePrueba().piezas
let memoria: WebAssembly.Memory
beforeAll(async () => {
  memoria = (await init({ module_or_path: readFileSync(join(import.meta.dirname, './pkg/kirchi_engine_bg.wasm')) })).memory
})

function armar(osc: Record<string, string>) {
  const partes: Parte[] = [
    { tipo: 'generador', ref: 'XFG1', props: { frecuencia: '40' }, pines: { '+': 's', COM: '0' } },
    { tipo: 'resistencia', ref: 'R1', props: { valor: '1k' }, pines: { '1': 's', '2': '0' } },
    { tipo: 'osciloscopio', ref: 'XSC1', props: { disp_modo: 'Automático', ...osc }, pines: { A: 's', B: '0', C: '0', D: '0' } }
  ]
  const d = conEtiquetas(lib, partes)
  const r = compilarNetlist(d, lib, calcularConexiones(d, lib))
  if (!r.netlist) throw new Error(r.errores.join(' '))
  const sim = new Simulator(JSON.stringify(r.netlist), pasoDeSimulacion(r.netlist, basesDeTiempo(r)))
  const ci = configDeInstrumentos(r.instrumentos)
  const vistas = crearVistas(new SharedArrayBuffer(bytesSabInstrumentos(1, 0)), 1, 0)
  let reloj = 0
  const inst = new InstrumentosEnWorker(sim, () => memoria.buffer, vistas, structuredClone(ci.config), reloj)
  const registro: { t: number; v: number; estado: string; t0: number; tDisparo: number }[] = []
  let vistaV = -1
  /** Avanza `seg` s de tiempo simulado en pasos de `paso` s, con 25 ms de reloj por paso (40 pasos por segundo de reloj). */
  const correr = (seg: number, paso: number, msPorPaso: number) => {
    for (let k = 0; k < Math.round(seg / paso); k++) {
      sim.advance_to(sim.time() + paso, 1e9)
      reloj += msPorPaso
      inst.publicar(reloj)
      const p = leerInstrumentos(vistas, { osciloscopio: 0 }).pantalla
      if (p && p.version !== vistaV) {
        vistaV = p.version
        registro.push({ t: sim.time(), v: p.version, estado: p.estado, t0: p.t0, tDisparo: p.tDisparo })
      }
    }
  }
  return { sim, correr, registro }
}

describe('el barrido de una señal de 40 Hz con el motor', () => {
  // Causa raíz medida con el motor, con una señal de 25 ms de periodo: con bases cortas (1 ms a 20 µs) el estado pasaba a
  // «libre» entre disparos (dos pantallas son microsegundos) y encabezado y eje del tiempo alternaban sin parar.
  // Con bases largas (20 ms) la pantalla se renovaba con cada ciclo de la señal y no con cada barrido terminado.
  const estadosDespuesDelPrimerDisparo = (r: { estado: string }[]) => r.slice(r.findIndex((x) => x.estado === 'disparado')).map((x) => x.estado)

  for (const base of ['1m', '100u', '20u']) {
    it(`con ${base} por división el estado se queda en «disparado» y no alterna con «libre»`, () => {
      const { sim, correr, registro } = armar({ base })
      correr(2, 0.0025, 25)
      const est = estadosDespuesDelPrimerDisparo(registro)
      expect(est.length).toBeGreaterThan(10)
      expect(est.every((e) => e === 'disparado')).toBe(true)
      sim.free()
    })
  }

  it('con 20 ms por división cada barrido terminado renueva la pantalla: unas cinco veces por segundo, nunca con cada ciclo', () => {
    const { sim, correr, registro } = armar({ base: '20m' })
    correr(3, 0.016, 16)
    const d = registro.filter((r) => r.estado === 'disparado')
    // 3 s simulados: entre 12 y 16 barridos de 200 ms (no los ~110 de un disparo por ciclo).
    expect(d.length).toBeGreaterThanOrEqual(12)
    expect(d.length).toBeLessThanOrEqual(16)
    for (let k = 1; k < d.length; k++) expect(d[k].tDisparo - d[k - 1].tDisparo).toBeGreaterThanOrEqual(0.18 - 1e-9)
    // Y todos los disparos caen en el mismo punto de la señal (el eje desde el disparo no se mueve dentro de un barrido).
    for (const r of d) expect(r.tDisparo - r.t0).toBeCloseTo(0.02, 6)
    sim.free()
  })

  it('sin señal que dispare, Automático barre libre pasados 100 ms y la pantalla se mueve', () => {
    const { sim, correr, registro } = armar({ base: '20u', disp_nivel: '50' })
    correr(1, 0.0025, 25)
    expect(registro.some((r) => r.estado === 'libre')).toBe(true)
    expect(registro.find((r) => r.estado === 'libre')!.t).toBeGreaterThanOrEqual(0.1)
    sim.free()
  })
})

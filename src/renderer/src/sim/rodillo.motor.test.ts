// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { calcularConexiones } from '../conexiones/conexiones'
import { compilarNetlist } from '../netlist/netlist'
import { conEtiquetas, type Parte } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import { configDeInstrumentos, InstrumentosEnWorker } from './instrumentosWorker'
import { basesDeTiempo, pasoDeSimulacion } from './lectura'
import init, { Simulator } from './pkg/kirchi_engine.js'
import { bytesSabInstrumentos, CIFRAS_COLUMNA, crearVistas, leerInstrumentos } from './protocoloInstrumentos'

const lib = libreriaDePrueba().piezas
let memoria: WebAssembly.Memory
beforeAll(async () => {
  memoria = (await init({ module_or_path: readFileSync(join(import.meta.dirname, './pkg/kirchi_engine_bg.wasm')) })).memory
})

/** Una senoidal de 1 Hz en Rodante con 1 s por división: la pantalla abarca 10 s y el búfer crudo de la sonda, la mitad (la vieja sale de la rejilla). */
function correrRodante() {
  const partes: Parte[] = [
    { tipo: 'fuente-ac', ref: 'V1', props: { amplitud: '2', frecuencia: '1' }, pines: { '+': 'e', '-': '0' } },
    { tipo: 'resistencia', ref: 'R1', props: { valor: '1k' }, pines: { '1': 'e', '2': 's' } },
    { tipo: 'capacitor', ref: 'C1', props: { valor: '159.15n' }, pines: { '1': 's', '2': '0' } },
    { tipo: 'osciloscopio', ref: 'XSC1', props: { base: '1', a_vdiv: '1', b_vdiv: '1' }, pines: { A: 'e', B: 's', C: '0', D: '0' } }
  ]
  const d = conEtiquetas(lib, partes)
  const r = compilarNetlist(d, lib, calcularConexiones(d, lib))
  if (!r.netlist) throw new Error(r.errores.join(' '))
  const sim = new Simulator(JSON.stringify(r.netlist), pasoDeSimulacion(r.netlist, basesDeTiempo(r)))
  const ci = configDeInstrumentos(r.instrumentos)
  const vistas = crearVistas(new SharedArrayBuffer(bytesSabInstrumentos(1, 0)), 1, 0)
  let reloj = 0
  const inst = new InstrumentosEnWorker(sim, () => memoria.buffer, vistas, structuredClone(ci.config), reloj)
  inst.columnas(0, 850)
  for (let k = 0; k < 1400; k++) {
    sim.advance_to(sim.time() + 0.01, 1e9)
    reloj += 25
    inst.publicar(reloj)
  }
  /** La pantalla que se dibuja con `columnas` columnas (el ancho del panel en píxeles de dispositivo). */
  const pantalla = (columnas: number) => {
    inst.columnas(0, columnas)
    inst.publicar((reloj += 25), true)
    return leerInstrumentos(vistas, { osciloscopio: 0 }).pantalla!
  }
  return { pantalla, liberar: () => sim.free() }
}

describe('la traza del rodillo con el motor', () => {
  const corrida = () => (cache ??= correrRodante())
  let cache: ReturnType<typeof correrRodante> | undefined
  afterAll(() => cache?.liberar())
  for (const n of [850, 1013, 1700, 1972, 3944]) {
    it(`con ${n} columnas la mitad vieja (de la rejilla) y la nueva (de las muestras) se dibujan igual de limpias`, () => {
      const p = corrida().pantalla(n)
      expect(p.estado).toBe('rodillo')
      expect(p.ncol).toBe(n)
      const col = p.columnas
      // La mitad vieja sale de la rejilla (bandera de columna gruesa) y la nueva de las muestras: la prueba cruza el empalme.
      let gruesas = 0
      for (let j = 0; j < n; j++) gruesas += (col[j * CIFRAS_COLUMNA + 4] & 4) !== 0 ? 1 : 0
      expect(gruesas, 'columnas de la rejilla').toBeGreaterThan(n * 0.2)
      expect(gruesas, 'columnas de las muestras').toBeLessThan(n * 0.9)
      // Un pico en la traza: el máximo o el mínimo de la columna salen de sus extremos más de lo que dibuja el osciloscopio (0.02 V/div).
      const picos: number[] = []
      for (let j = 0; j < n; j++) {
        const q = j * CIFRAS_COLUMNA
        const [mn, mx, pr, ul] = [col[q], col[q + 1], col[q + 2], col[q + 3]]
        const t = p.t0 + (j + 0.5) * p.dt
        // Solo donde la senoidal no tiene cima ni valle (ahí el máximo sí supera a los extremos).
        // Con más columnas que las 2,048 de la rejilla en el ancho tampoco hay excepción en las cimas.
        const lejosDeCima = n > 2048 || Math.abs(Math.cos(2 * Math.PI * t)) > 0.1
        if (lejosDeCima && (mx > Math.max(pr, ul) + 2e-3 || mn < Math.min(pr, ul) - 2e-3)) picos.push(j)
      }
      expect(picos, `columnas con picos: ${picos.slice(0, 10)}`).toEqual([])
      // Y ninguna columna abarca más de lo que sube la onda en su ancho más el de una columna de la rejilla (la que a veces suma de más).
      const subida = 2 * Math.PI * 2 * (p.dt + 10 / 2048)
      for (let j = 0; j < n; j++) {
        const q = j * CIFRAS_COLUMNA
        expect(col[q + 1] - col[q]).toBeLessThanOrEqual(subida * 1.05 + 1e-3)
      }
    }, 60_000)
  }
})

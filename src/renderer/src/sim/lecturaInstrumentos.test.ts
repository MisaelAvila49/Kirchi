// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { calcularConexiones } from '../conexiones/conexiones'
import { compilarNetlist } from '../netlist/netlist'
import { conEtiquetas, type Parte } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import { leerResultados, pasoDeSimulacion } from './lectura'
import init, { Simulator } from './pkg/kirchi_engine.js'
import type { SimReading } from './protocol'

const lib = libreriaDePrueba().piezas
let memoria: WebAssembly.Memory
beforeAll(async () => {
  memoria = (await init({ module_or_path: readFileSync(join(import.meta.dirname, 'pkg/kirchi_engine_bg.wasm')) })).memory
})

/** Simula `t` segundos y lee las mediciones de pieza. */
function medir(partes: Parte[], t = 5e-3) {
  const d = conEtiquetas(lib, partes)
  const r = compilarNetlist(d, lib, calcularConexiones(d, lib))
  if (!r.netlist) throw new Error(r.errores.join(' '))
  const sim = new Simulator(JSON.stringify(r.netlist), pasoDeSimulacion(r.netlist))
  sim.advance_to(t, 1e9)
  const n = sim.element_count()
  const leer = (p: number, k = n) => new Float64Array(memoria.buffer, p, k).slice()
  const s: SimReading = {
    time: sim.time(), ratio: 1, capacity: 1, seq: 1, consistente: true, voltages: sim.voltages(), currents: sim.currents(),
    aux: leer(sim.aux_ptr()), estado: leer(sim.estado_ptr()), niveles: new Float64Array(0), medidas: new Float64Array(0)
  }
  sim.free()
  return leerResultados(r, s).piezas
}

describe('la medición de pieza de los instrumentos', () => {
  it('la fuente variable: lo que entrega y su modo, CV o CC', () => {
    const fuente = (carga: string): Parte[] => [
      { tipo: 'fuente-variable', ref: 'XPS1', props: { voltaje: '12', limite: '100m' }, pines: { '+': 'v', '-': '0' } },
      { tipo: 'resistencia', ref: 'R1', props: { valor: carga }, pines: { '1': 'v', '2': '0' } }
    ]
    const cv = medir(fuente('1k')).get('p_0')!
    expect(cv.v).toBeCloseTo(12, 2)
    // Paso a paso la corriente oscila unos ±0.6 mA: el trapezoidal con el polo de 5 ns de la salida (50 mΩ por 100 nF) y pasos
    // de 10 µs. El panel y el lienzo leen el promedio de 100 ms (`paraTexto`), que no oscila.
    expect(Math.abs(cv.i - 0.012)).toBeLessThan(1e-3)
    expect(cv.p).toBeLessThan(0)
    expect(cv.extra).toEqual({ tipo: 'fuente-variable', modo: 'CV' })
    const cc = medir(fuente('10')).get('p_0')!
    expect(cc.i).toBeCloseTo(0.1, 3)
    expect(cc.extra).toEqual({ tipo: 'fuente-variable', modo: 'CC' })
  })

  it('el generador: el voltaje entre su salida y COM y la corriente que entrega', () => {
    const m = medir([
      { tipo: 'generador', ref: 'XFG1', props: { amplitud: '0', desplazamiento: '1' }, pines: { '+': 's', COM: '0' } },
      { tipo: 'resistencia', ref: 'R1', props: { valor: '1k' }, pines: { '1': 's', '2': '0' } }
    ]).get('p_0')!
    expect(m.v).toBeCloseTo(1000 / 1050, 4)
    expect(m.i).toBeCloseTo(1 / 1050, 6)
    expect(m.p).toBeLessThan(0)
  })

  it('el multímetro: el voltaje entre sus terminales y su fusible; el osciloscopio no tiene medición de pieza', () => {
    const p = medir([
      { tipo: 'fuente-dc', ref: 'V1', props: { voltaje: '5' }, pines: { '+': 'vcc', '-': '0' } },
      { tipo: 'resistencia', ref: 'R1', props: { valor: '1M' }, pines: { '1': 'vcc', '2': 'm' } },
      { tipo: 'resistencia', ref: 'R2', props: { valor: '1M' }, pines: { '1': 'm', '2': '0' } },
      { tipo: 'multimetro', ref: 'XMM1', props: { modo: 'V DC' }, pines: { '+': 'm', COM: '0' } },
      { tipo: 'osciloscopio', ref: 'XSC1', props: {}, pines: { A: 'm', B: '0', C: '0', D: '0' } }
    ])
    const mm = p.get('p_3')!
    // Con el multímetro (10 MΩ) y el osciloscopio (1 MΩ) en paralelo con R2.
    const abajo = 1 / (1 / 1e6 + 1 / 10e6 + 1 / 1e6)
    expect(mm.v).toBeCloseTo((5 * abajo) / (abajo + 1e6), 4)
    expect(mm.extra).toEqual({ tipo: 'fusible', fundido: false })
    expect(p.has('p_4')).toBe(false)
  })
})

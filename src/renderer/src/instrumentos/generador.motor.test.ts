// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import type { Pieza } from '../doc/tipos'
import { libreriaDePrueba } from '../prueba/libreria'
import init, { Simulator } from '../sim/pkg/kirchi_engine.js'
import { ajustesGenerador, ondaDelGenerador } from './ajustes'

const lib = libreriaDePrueba().piezas
beforeAll(async () => {
  await init({ module_or_path: readFileSync(join(import.meta.dirname, '../sim/pkg/kirchi_engine_bg.wasm')) })
})

/** El voltaje de un generador sin carga (la onda sobre 1 MΩ) en cada instante `ts`, simulado con el motor. */
function voltajes(props: Record<string, string>, ts: number[]): number[] {
  const p: Pieza = { id: 'p', tipo: 'generador', ref: 'XFG1', x: 0, y: 0, rot: 0, espejo: false, props }
  const r = ajustesGenerador(p, lib.get('generador')!)
  if (!r.ok) throw new Error(r.error)
  const net = { nodes: 2, elements: [{ type: 'V', a: 1, b: 0, wave: ondaDelGenerador(r.a) }, { type: 'R', a: 1, b: 0, ohms: 1e6 }] }
  const sim = new Simulator(JSON.stringify(net), 1e-5)
  const out: number[] = []
  for (const t of ts) {
    sim.advance_to(t, 1e9)
    out.push(sim.voltages()[1])
  }
  sim.free()
  return out
}

// Con 1 kHz (periodo de 1 ms) y de -1 a 3 V (4 Vpp con 1 V de desplazamiento). Los instantes caen a mitad de tramo.
const BASE = { frecuencia: '1k', amplitud: '4', desplazamiento: '1' }
const T = 1e-3
const cerca = (a: number[], b: number[], tol = 0.01) => a.forEach((x, k) => expect(x, `instante ${k}`).toBeCloseTo(b[k], -Math.log10(tol)))

describe('las formas del generador contra su fórmula', () => {
  it('senoidal: 1 + 2 sen(2πft)', () => {
    const ts = [0.125 * T, 0.25 * T, 0.5 * T + 5 * T, 0.75 * T + 7 * T]
    cerca(voltajes({ ...BASE, forma: 'Senoidal' }, ts), ts.map((t) => 1 + 2 * Math.sin((2 * Math.PI * t) / T)))
  })

  it('cuadrada al 50 %: 3 V la primera mitad, −1 V la segunda', () => {
    cerca(voltajes({ ...BASE, forma: 'Cuadrada' }, [0.25 * T, 0.75 * T, 3.25 * T, 3.75 * T]), [3, -1, 3, -1])
  })

  it('pulso al 25 %: 3 V solo el primer cuarto', () => {
    cerca(voltajes({ ...BASE, forma: 'Pulso', ciclo: '25 %' }, [0.1 * T, 0.4 * T, 0.9 * T, 2.1 * T]), [3, -1, -1, 3])
  })

  it('triangular simétrica: sube de −1 a 3 en medio periodo y baja', () => {
    cerca(voltajes({ ...BASE, forma: 'Triangular' }, [0.25 * T, 0.49 * T, 0.75 * T, 2.25 * T]), [1, 2.92, 1, 1])
  })

  it('diente de sierra: sube lineal todo el periodo y cae de golpe', () => {
    const ts = [0.25 * T, 0.5 * T, 0.75 * T, 1.25 * T, 4.5 * T]
    cerca(voltajes({ ...BASE, forma: 'Diente de sierra' }, ts), [0, 1, 2, 0, 1])
  })

  it('escalera de 4 pasos: de −1 a 3 V en cuatro niveles iguales por periodo', () => {
    const paso = 4 / 3
    cerca(voltajes({ ...BASE, forma: 'Escalera', pasos: '4' }, [0.125 * T, 0.375 * T, 0.625 * T, 0.875 * T, 1.125 * T, 5.875 * T]), [-1, -1 + paso, -1 + 2 * paso, 3, -1, 3])
  })

  it('escalón: bajo hasta su retardo y arriba después', () => {
    cerca(voltajes({ ...BASE, forma: 'Escalón', retardo: '2m' }, [0.5e-3, 1.9e-3, 2.1e-3, 5e-3, 50e-3]), [-1, -1, 3, 3, 3])
    cerca(voltajes({ ...BASE, forma: 'Escalón' }, [1e-4, 5e-3]), [3, 3])
  })

  it('el desfase adelanta la onda: 90° en una senoidal es un coseno y 180° invierte la cuadrada', () => {
    const ts = [0.02 * T, 0.125 * T, 0.3 * T]
    cerca(voltajes({ ...BASE, forma: 'Senoidal', desfase: '90' }, ts), ts.map((t) => 1 + 2 * Math.cos((2 * Math.PI * t) / T)))
    cerca(voltajes({ ...BASE, forma: 'Cuadrada', desfase: '180' }, [0.25 * T, 0.75 * T]), [-1, 3])
    cerca(voltajes({ ...BASE, forma: 'Senoidal', desfase: '-90' }, ts), ts.map((t) => 1 - 2 * Math.cos((2 * Math.PI * t) / T)))
  })
})

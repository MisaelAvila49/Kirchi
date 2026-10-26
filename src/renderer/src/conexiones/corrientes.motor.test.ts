// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import init, { Simulator } from '../sim/pkg/kirchi_engine.js'
import { calcularConexiones, clavePin } from './conexiones'
import { armarReparto } from './corrientes'
import { compilarNetlist, nodosDeElemento } from '../netlist/netlist'
import { conEtiquetas, divisor, type Parte } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'

const lib = libreriaDePrueba().piezas
const R = (ref: string, valor: string, a: string, b: string): Parte => ({ tipo: 'resistencia', ref, props: { valor }, pines: { '1': a, '2': b } })
/** Un 555 astable que maneja un NPN con su carga: elementos de dos, tres, cuatro y cinco terminales y una red interna. */
const MEZCLA: Parte[] = [
  { tipo: 'fuente-dc', ref: 'V1', props: { voltaje: '5' }, pines: { '+': 'vcc', '-': '0' } },
  R('R1', '1k', 'vcc', 'dis'),
  R('R2', '10k', 'dis', 'thr'),
  { tipo: 'capacitor', ref: 'C1', props: { valor: '100n' }, pines: { '1': 'thr', '2': '0' } },
  { tipo: 'capacitor', ref: 'C2', props: { valor: '10n' }, pines: { '1': 'cv', '2': '0' } },
  { tipo: 'temporizador-555', ref: 'U1', props: { modelo: 'NE555' }, pines: { '1': '0', '2': 'thr', '3': 'out', '4': 'vcc', '5': 'cv', '6': 'thr', '7': 'dis', '8': 'vcc' } },
  R('R3', '10k', 'out', 'b'),
  { tipo: 'npn', ref: 'Q1', pines: { B: 'b', C: 'c', E: '0' } },
  R('R4', '1k', 'vcc', 'c')
]
let memoria: WebAssembly.Memory
beforeAll(async () => {
  memoria = (await init({ module_or_path: readFileSync(join(import.meta.dirname, '../sim/pkg/kirchi_engine_bg.wasm')) })).memory
})

describe('corrientes por terminal del motor repartidas en los cables', () => {
  it('los puertos de la netlist son las casillas del motor, con el pin de cada terminal', () => {
    for (const d of [divisor(), conEtiquetas(lib, MEZCLA)]) {
      const con = calcularConexiones(d, lib)
      const r = compilarNetlist(d, lib, con)
      expect(r.errores).toEqual([])
      const sim = new Simulator(JSON.stringify(r.netlist), 1e-5)
      expect(r.puertos).toHaveLength(sim.casillas_terminales())
      // Cada elemento analógico: sus nodos más la tierra interna.
      const esperadas = r.netlist!.elements.reduce((n, e) => n + (nodosDeElemento(e).length ? nodosDeElemento(e).length + 1 : 0), 0)
      expect(r.puertos).toHaveLength(esperadas)
      sim.free()
    }
    const d = divisor()
    const r = compilarNetlist(d, lib, calcularConexiones(d, lib))
    // Las piezas van por id (p_g, p_r1, p_r2, p_v1): R1 es el primer elemento, con las casillas 0, 1 y 2.
    expect(r.puertos.slice(0, 3).map((p) => p.pin)).toEqual([clavePin('p_r1', '1'), clavePin('p_r1', '2'), null])
    expect(r.potencias).toEqual([0, 1])
  })

  it('en el divisor los tramos llevan los 2.5 mA del motor y cada punto cumple la ley de corrientes', () => {
    const d = divisor()
    const con = calcularConexiones(d, lib)
    const r = compilarNetlist(d, lib, con)
    const sim = new Simulator(JSON.stringify(r.netlist), 1e-5)
    sim.activar_terminales(true)
    sim.advance_to(1e-3, 1_000_000)
    sim.reiniciar_promedios()
    sim.advance_to(2e-3, 1_000_000)
    const n = sim.casillas_terminales()
    const p = sim.terminales_ptr()
    const datos = new Float64Array(memoria.buffer, p, 1 + 2 * n).slice()
    expect(datos[0]).toBeCloseTo(1e-3, 12)
    const medias = datos.subarray(1, 1 + n), absolutas = datos.subarray(1 + n)
    const rep = armarReparto(d, lib, con, r.puertos)
    const m = new Float64Array(rep.tramos.length), a = new Float64Array(rep.tramos.length)
    rep.repartir(medias, absolutas, m, a)
    for (let k = 0; k < rep.tramos.length; k++) {
      expect(Math.abs(m[k])).toBeCloseTo(2.5e-3, 9)
      expect(a[k]).toBeCloseTo(2.5e-3, 9)
    }
    expect(rep.residuo(medias)).toBeLessThan(1e-12)
    sim.free()
  })
})

describe('los nodos de cada elemento, como el motor', () => {
  it('un puente de salida con sus alimentaciones explícitas cuenta sus casillas como el motor', () => {
    const net = {
      nodes: 4,
      digital_nets: 1,
      elements: [
        { type: 'V' as const, a: 1, b: 0, wave: { kind: 'dc' as const, v: 5 } },
        { type: 'LOGIC' as const, out: 0, value: 1 as const },
        { type: 'DAC' as const, input: 0, out: 2, lo: 0, hi: 1, v_lo: 0, v_hi: 5, r_lo: 50, r_hi: 50, t_rise: 6e-9, t_fall: 6e-9 },
        { type: 'R' as const, a: 2, b: 3, ohms: 330 },
        { type: 'R' as const, a: 3, b: 0, ohms: 330 }
      ]
    }
    expect(nodosDeElemento(net.elements[2])).toEqual([2, 0, 1])
    const sim = new Simulator(JSON.stringify(net), 1e-5)
    const esperadas = net.elements.reduce((n, e) => n + (nodosDeElemento(e).length ? nodosDeElemento(e).length + 1 : 0), 0)
    expect(sim.casillas_terminales()).toBe(esperadas)
    sim.free()
  })
})

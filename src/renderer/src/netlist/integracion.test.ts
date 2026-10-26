// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { calcularConexiones, clavePin } from '../conexiones/conexiones'
import type { Documento } from '../doc/tipos'
import { conEtiquetas, divisor, ledConBateria, type Parte } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import init, { Simulator } from '../sim/pkg/kirchi_engine.js'
import { compilarNetlist } from './netlist'

const lib = libreriaDePrueba().piezas

let memoria: WebAssembly.Memory
beforeAll(async () => {
  memoria = (await init({ module_or_path: readFileSync(join(import.meta.dirname, '../sim/pkg/kirchi_engine_bg.wasm')) })).memory
})

/** Simula 10 µs y devuelve el voltaje del nodo donde está el pin indicado. */
function voltajeEn(d: Documento, piezaId: string, pinId: string): number {
  const con = calcularConexiones(d, lib)
  const r = compilarNetlist(d, lib, con)
  expect(r.errores).toEqual([])
  const sim = new Simulator(JSON.stringify(r.netlist), 1e-6)
  sim.advance_to(1e-5, 100)
  const v = sim.voltages()[r.nodoDeRed.get(con.redDePin.get(clavePin(piezaId, pinId))!)!]
  sim.free()
  return v
}

describe('esquema → netlist → motor', () => {
  it('el divisor de 5 V con dos resistencias de 1 kΩ da 2.50 V en el punto medio', () => {
    expect(voltajeEn(divisor(), 'p_r1', '2')).toBeCloseTo(2.5, 6)
  })

  it('los voltajes y las corrientes se leen de la memoria del WASM sin copiarlos y coinciden con los arreglos', () => {
    const d = divisor()
    const con = calcularConexiones(d, lib)
    const r = compilarNetlist(d, lib, con)
    const sim = new Simulator(JSON.stringify(r.netlist), 1e-6)
    sim.advance_to(1e-5, 100)
    const pv = sim.voltages_ptr()
    const pc = sim.currents_ptr()
    const v = new Float64Array(memoria.buffer, pv, sim.node_count())
    const i = new Float64Array(memoria.buffer, pc, sim.element_count())
    expect(Array.from(v)).toEqual(Array.from(sim.voltages()))
    expect(Array.from(i)).toEqual(Array.from(sim.currents()))
    // El mismo búfer se reutiliza en la siguiente lectura.
    sim.advance_to(2e-5, 100)
    expect(sim.voltages_ptr()).toBe(pv)
    sim.free()
  })

  it('el WASM cambia elementos en caliente, da el estado de cada uno y avisa del fusible que se funde', () => {
    const sim = new Simulator(
      JSON.stringify({
        nodes: 3,
        elements: [
          { type: 'V', a: 1, b: 0, wave: { kind: 'dc', v: 5 } },
          { type: 'FUSE', a: 1, b: 2, ohms: 0.1, inom: 1, ifusion: 2, tau: 0.125 },
          { type: 'R', a: 2, b: 0, ohms: 1 }
        ]
      }),
      1e-5
    )
    // 4.55 A funden el fusible de 1 A a los 26.9 ms: elemento, instante, corriente y duración de la sobrecarga.
    sim.advance_to(0.04, 1_000_000)
    const ev = Array.from(sim.take_events())
    expect(ev).toHaveLength(4)
    expect(ev[0]).toBe(1)
    expect(ev[1]).toBeCloseTo(0.0269, 3)
    expect(ev[2]).toBeCloseTo(5 / 1.1, 3)
    expect(Array.from(sim.take_events())).toEqual([])
    const estado = () => new Float64Array(memoria.buffer, sim.estado_ptr(), sim.element_count())[1]
    expect(estado()).toBe(1)
    // Repuesto y con 10 Ω de carga (0.5 A) ya no se funde; la corriente es la de la resistencia nueva.
    sim.reset_element(1)
    sim.set_element(2, JSON.stringify({ type: 'R', a: 2, b: 0, ohms: 10 }))
    sim.advance_to(0.3, 1_000_000)
    expect(estado()).toBe(0)
    expect(Array.from(sim.currents())[2]).toBeCloseTo(5 / 10.1, 4)
    expect(new Float64Array(memoria.buffer, sim.aux_ptr(), 3)[1]).toBeGreaterThan(0)
    // Otro tipo de elemento no entra en caliente.
    expect(() => sim.set_element(1, JSON.stringify({ type: 'R', a: 1, b: 2, ohms: 1 }))).toThrow(/en caliente/)
    sim.free()
  })

  it('el motor en WASM da la corriente de cada elemento: 2.5 mA en las resistencias del divisor', () => {
    const d = divisor()
    const con = calcularConexiones(d, lib)
    const r = compilarNetlist(d, lib, con)
    const sim = new Simulator(JSON.stringify(r.netlist), 1e-6)
    sim.advance_to(1e-5, 100)
    const i = Array.from(sim.currents())
    expect(sim.element_count()).toBe(3)
    const tipos = r.netlist!.elements.map((e) => e.type)
    i.forEach((x, k) => expect(x).toBeCloseTo(tipos[k] === 'V' ? -2.5e-3 : 2.5e-3, 9))
    sim.free()
  })

  it('una fuente AC de 5 V de pico a 50 Hz da 2.50 V de pico en el punto medio del divisor', () => {
    const d = divisor()
    d.piezas.p_v1 = { ...d.piezas.p_v1, tipo: 'fuente-ac', props: { amplitud: '5', frecuencia: '50' } }
    const con = calcularConexiones(d, lib)
    const r = compilarNetlist(d, lib, con)
    const sim = new Simulator(JSON.stringify(r.netlist), 1e-5)
    sim.advance_to(0.005, 1000)
    const medio = r.nodoDeRed.get(con.redDePin.get(clavePin('p_r1', '2'))!)!
    expect(sim.voltages()[medio]).toBeCloseTo(2.5, 6)
    sim.free()
  })

  it.each([
    ['rojo', 1.8],
    ['amarillo', 2.0],
    ['verde', 2.1],
    ['azul', 3.1],
    ['blanco', 3.1]
  ])('el LED %s cae cerca de su voltaje directo de 20 mA (%s V) con 330 Ω y 9 V', (color, vf) => {
    const d = ledConBateria()
    d.piezas.p_d1 = { ...d.piezas.p_d1, props: { color } }
    // Con 9 V y 330 Ω pasan de 18 a 22 mA: el voltaje queda a menos de 0.05 V del de 20 mA.
    expect(Math.abs(voltajeEn(d, 'p_d1', 'A') - vf)).toBeLessThan(0.05)
  })

  it('el potenciómetro de 10 kΩ al 25 % entre 5 V y tierra da 3.75 V en el cursor', () => {
    const d = divisor()
    // R1 y R2 se quitan; el pin 1 del potenciómetro va a V1+, el pin 2 a tierra y el cursor carga solo 1 GΩ (R9).
    delete d.piezas.p_r1
    delete d.piezas.p_r2
    d.piezas.p_rv = { id: 'p_rv', tipo: 'potenciometro', ref: 'RV1', x: 10, y: -8, rot: 0, espejo: false, props: { valor: '10k', posicion: '25 %' } }
    d.cables.c_b = { id: 'c_b', puntos: [{ x: 14, y: -8 }, { x: 18, y: -8 }, { x: 18, y: 8 }, { x: 0, y: 8 }, { x: 0, y: 4 }] }
    d.cables.c_c = { id: 'c_c', puntos: [{ x: 10, y: -12 }, { x: 10, y: -16 }, { x: 30, y: -16 }] }
    d.piezas.p_rc = { id: 'p_rc', tipo: 'resistencia', ref: 'R9', x: 34, y: -16, rot: 0, espejo: false, props: { valor: '1G' } }
    d.cables.c_d = { id: 'c_d', puntos: [{ x: 38, y: -16 }, { x: 40, y: -16 }, { x: 40, y: 8 }, { x: 18, y: 8 }] }
    expect(voltajeEn(d, 'p_rv', '3')).toBeCloseTo(3.75, 3)
  })

  it('una fuente de corriente de 1 mA sobre 1 kΩ da 1 V', () => {
    const d = divisor()
    delete d.piezas.p_r2
    d.piezas.p_v1 = { ...d.piezas.p_v1, tipo: 'fuente-corriente', props: { corriente: '1m' } }
    // R1 va de la salida de la fuente (arriba) a tierra por un cable nuevo desde su pin 2.
    d.cables.c_b = { id: 'c_b', puntos: [{ x: 14, y: -8 }, { x: 18, y: -8 }, { x: 18, y: 8 }, { x: 0, y: 8 }, { x: 0, y: 4 }] }
    expect(voltajeEn(d, 'p_r1', '1')).toBeCloseTo(1, 6)
  })

  it('el WASM rechaza una netlist que pasa de los límites de la vista previa antes de construir el motor', () => {
    const muchasRedes = JSON.stringify({ nodes: 1100, elements: [{ type: 'R', a: 1, b: 0, ohms: 10 }] })
    expect(() => new Simulator(muchasRedes, 1e-6)).toThrow(/admite hasta 1024 redes y este circuito tiene 1100/)
    const muchasPiezas = JSON.stringify({ nodes: 2, elements: Array.from({ length: 4097 }, () => ({ type: 'R', a: 1, b: 0, ohms: 10 })) })
    expect(() => new Simulator(muchasPiezas, 1e-6)).toThrow(/admite hasta 4096 piezas simuladas y este circuito tiene 4097/)
  })

  it('con una cuadrada rápida los pasos por llamada se agotan antes de llegar al tiempo pedido, sin retroceder', () => {
    // 100 kHz con paso máximo de 1 µs: cada flanco es un punto de quiebre, así que pocos pasos no alcanzan 10 ms.
    const sim = new Simulator(
      JSON.stringify({
        nodes: 2,
        elements: [
          { type: 'V', a: 1, b: 0, wave: { kind: 'square', low: 0, high: 5, freq: 1e5 } },
          { type: 'R', a: 1, b: 0, ohms: 1000 }
        ]
      }),
      1e-6
    )
    let t = 0
    for (let k = 0; k < 5; k++) {
      expect(sim.advance_to(1e-2, 50)).toBe(50)
      expect(sim.time()).toBeGreaterThan(t)
      t = sim.time()
    }
    expect(t).toBeLessThan(1e-2)
    sim.free()
  })

  it('el LED rojo con 330 Ω y 9 V cae entre 1.6 y 2.1 V', () => {
    const v = voltajeEn(ledConBateria(), 'p_d1', 'A')
    console.log(`LED: ${v.toFixed(3)} V, ${(((9 - v) / 330) * 1000).toFixed(1)} mA`)
    expect(v).toBeGreaterThan(1.6)
    expect(v).toBeLessThan(2.1)
  })
})

describe('esquema → netlist → motor, con piezas digitales', () => {
  const R = (ref: string, valor: string, a: string, b: string): Parte => ({ tipo: 'resistencia', ref, props: { valor }, pines: { '1': a, '2': b } })
  const estado = (ref: string, valor: '0' | '1', red: string): Parte => ({ tipo: 'estado-logico', ref, props: { estado: valor }, pines: { S: red } })
  /** Simula hasta `t` y devuelve el voltaje de la red con ese nombre. */
  function correr(partes: Parte[], t: number, h = 1e-6) {
    const d = conEtiquetas(lib, partes)
    const con = calcularConexiones(d, lib)
    const r = compilarNetlist(d, lib, con)
    expect(r.errores).toEqual([])
    const sim = new Simulator(JSON.stringify(r.netlist), h)
    const v = (red: string) => sim.voltages()[r.nodoDeRed.get(con.redes.find((x) => x.nombre === red)!.id)!]
    return { sim, v, avanzar: (hasta: number) => sim.advance_to(hasta, 1_000_000), t }
  }

  it('una NAND con sus dos entradas en 1 apaga el LED, y con una en 0 lo enciende a 5 V menos su caída', () => {
    const circuito = (b: '0' | '1') => [estado('E1', '1', 'a'), estado('E2', b, 'b'), { tipo: 'nand', ref: 'U1', pines: { A: 'a', B: 'b', Y: 'y' } }, R('R1', '330', 'y', 'led'), { tipo: 'led', ref: 'D1', props: { color: 'rojo' }, pines: { A: 'led', K: '0' } }]
    const apagado = correr(circuito('1'), 1e-6)
    apagado.avanzar(1e-6)
    expect(apagado.v('y')).toBeLessThan(0.1)
    apagado.sim.free()
    const encendido = correr(circuito('0'), 1e-6)
    encendido.avanzar(1e-6)
    expect(encendido.v('y')).toBeGreaterThan(4)
    expect(encendido.v('led')).toBeGreaterThan(1.6)
    expect(encendido.v('led')).toBeLessThan(2.1)
    encendido.sim.free()
  })

  it('el 555 astable con 1 kΩ, 10 kΩ y 100 nF oscila cerca de 1/(0.693 (R1 + 2 R2) C) = 687 Hz', () => {
    const { sim, v, avanzar } = correr([
      { tipo: 'fuente-dc', ref: 'V1', props: { voltaje: '5' }, pines: { '+': 'vcc', '-': '0' } },
      R('R1', '1k', 'vcc', 'dis'),
      R('R2', '10k', 'dis', 'thr'),
      { tipo: 'capacitor', ref: 'C1', props: { valor: '100n' }, pines: { '1': 'thr', '2': '0' } },
      { tipo: 'capacitor', ref: 'C2', props: { valor: '10n' }, pines: { '1': 'cv', '2': '0' } },
      R('RL', '10k', 'out', '0'),
      { tipo: 'temporizador-555', ref: 'U1', props: { modelo: 'NE555' }, pines: { '1': '0', '2': 'thr', '3': 'out', '4': 'vcc', '5': 'cv', '6': 'thr', '7': 'dis', '8': 'vcc' } }
    ], 0, 2e-6)
    // Subidas de la salida entre 3 y 9 ms (la primera carga, de 0 a 2/3 de VCC, queda fuera).
    const subidas: number[] = []
    let antes = v('out') > 2.5
    for (let t = 1e-6; t <= 9e-3; t += 1e-6) {
      avanzar(t)
      const ahora = v('out') > 2.5
      if (ahora && !antes && sim.time() > 3e-3) subidas.push(sim.time())
      antes = ahora
    }
    sim.free()
    expect(subidas.length).toBeGreaterThanOrEqual(3)
    const f = (subidas.length - 1) / (subidas[subidas.length - 1] - subidas[0])
    expect(f).toBeGreaterThan(640)
    expect(f).toBeLessThan(720)
  })
})

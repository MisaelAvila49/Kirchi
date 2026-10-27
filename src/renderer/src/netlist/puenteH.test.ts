// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest'
import { calcularConexiones } from '../conexiones/conexiones'
import { conEtiquetas, type Parte } from '../prueba/circuitos'
import { iniciarMotor } from '../prueba/pasoVista'
import { conPiezas, piezaDePrueba } from '../prueba/piezasNuevas'
import { lecturaDelMotor } from '../sinVentana/lecturas'
import { memoriaDelMotor, Simulator } from '../sinVentana/motor'
import { compilarNetlist, type ElementoMotor } from './netlist'
import { L298_POR_OMISION } from './puenteH'

beforeAll(iniciarMotor)

const PINES = ['IN1', 'IN2', 'IN3', 'IN4', 'ENA', 'ENB', 'OUT1', 'OUT2', 'OUT3', 'OUT4', 'SENSA', 'SENSB', 'VS', 'VSS', 'GND']
const l298 = piezaDePrueba('l298-t', PINES, [{ id: 'modelo', nombre: 'Modelo', defecto: 'L298N', opciones: ['L298N'] }], {
  tipo: 'puente-h', entradas: ['IN1', 'IN2', 'IN3', 'IN4'], habilita: ['ENA', 'ENB'], salidas: ['OUT1', 'OUT2', 'OUT3', 'OUT4'],
  sensa: 'SENSA', sensb: 'SENSB', vs: 'VS', vss: 'VSS', gnd: 'GND', prop: 'modelo', modelos: { L298N: {} }
}, 'U')
const lib = conPiezas(l298)

const V = (ref: string, v: string, mas: string): Parte => ({ tipo: 'fuente-dc', ref, props: { voltaje: v }, pines: { '+': mas, '-': '0' } })
const R = (ref: string, valor: string, a: string, b: string): Parte => ({ tipo: 'resistencia', ref, props: { valor }, pines: { '1': a, '2': b } })

/** El L298 con un motor de 10 Ω entre OUT1 y OUT2 (el canal B queda a tierra): `in1` e `in2` son sus entradas y `en` el ENA. */
function circuito(in1: string, in2: string, en: string): Parte[] {
  return [
    V('V1', '12', 'vs'), V('V2', '5', 'vss'), V('V3', '5', 'alto'),
    { tipo: 'l298-t', ref: 'U1', props: {}, pines: { IN1: in1, IN2: in2, IN3: '0', IN4: '0', ENA: en, ENB: '0', OUT1: 'o1', OUT2: 'o2', OUT3: 'o3', OUT4: 'o4', SENSA: '0', SENSB: '0', VS: 'vs', VSS: 'vss', GND: '0' } },
    R('RM', '10', 'o1', 'o2'), R('R3', '1k', 'o3', 'o4')
  ]
}

const compilar = (partes: Parte[]) => {
  const d = conEtiquetas(lib, partes)
  const con = calcularConexiones(d, lib)
  return { r: compilarNetlist(d, lib, con), nodo: (nombre: string) => con.redes.find((x) => x.nombre === nombre)!.id }
}
const de = <T extends ElementoMotor['type']>(els: ElementoMotor[], tipo: T) => els.filter((e) => e.type === tipo) as Extract<ElementoMotor, { type: T }>[]

/** Voltajes de OUT1 y OUT2 tras 1 ms de la vista previa. */
function salidas(partes: Parte[]): { o1: number; o2: number } {
  const { r, nodo } = compilar(partes)
  expect(r.errores).toEqual([])
  const sim = new Simulator(JSON.stringify(r.netlist), 1e-6)
  try {
    sim.advance_to(1e-3, 1e9)
    const s = lecturaDelMotor(sim, memoriaDelMotor(), sim.node_count(), sim.element_count(), sim.digital_count())
    return { o1: s.voltages[r.nodoDeRed.get(nodo('o1'))!], o2: s.voltages[r.nodoDeRed.get(nodo('o2'))!] }
  } finally {
    sim.free()
  }
}

describe('el L298', () => {
  it('arma por canal una entrada por IN y por EN, una compuerta con habilitación y un puente de salida con VS y SENSE', () => {
    const { r, nodo } = compilar(circuito('alto', '0', 'alto'))
    expect(r.errores).toEqual([])
    const els = r.netlist!.elements
    // IN2, IN3, IN4 y ENB van a tierra: leen 0 sin puente.
    expect(de(els, 'ADC')).toHaveLength(2)
    expect(de(els, 'LOGIC')).toHaveLength(4)
    const compuertas = de(els, 'GATE')
    expect(compuertas).toHaveLength(4)
    const salidasDac = de(els, 'DAC')
    expect(salidasDac).toHaveLength(4)
    // Las dos compuertas de un canal comparten su habilitación, activa en alto, y cada una maneja su puente.
    expect(compuertas[0].enable).toBe(compuertas[1].enable)
    expect(compuertas[0].enable).not.toBe(compuertas[2].enable)
    expect(compuertas.every((g) => g.fn === 'buf' && g.enable_bajo === false)).toBe(true)
    compuertas.forEach((g, k) => expect(salidasDac[k].input).toBe(g.output))
    const vs = r.nodoDeRed.get(nodo('vs'))
    expect(salidasDac.every((d) => d.z === true && d.hi === vs && d.lo === 0)).toBe(true)
    expect(salidasDac[0]).toMatchObject({ v_hi: -L298_POR_OMISION.v0_alto, v_lo: L298_POR_OMISION.v0_bajo, r_hi: L298_POR_OMISION.r_alto, r_lo: L298_POR_OMISION.r_bajo })
    expect(de(els, 'ADC')[0]).toMatchObject({ in_low: 1.9, in_high: 1.9, r_in: 150e3 })
    expect(r.manejoDeRed.get(nodo('o1'))).toBe(compuertas[0].output)
  })

  it('con ENA en alto y IN1 alto, IN2 bajo, el motor ve VS menos las caídas de la hoja (a unos 0.95 A)', () => {
    const { o1, o2 } = salidas(circuito('alto', '0', 'alto'))
    expect(o1).toBeGreaterThan(10.5)
    expect(o1).toBeLessThan(10.9)
    expect(o2).toBeGreaterThan(1.0)
    expect(o2).toBeLessThan(1.4)
  })

  it('invertir las entradas invierte el voltaje del motor', () => {
    const { o1, o2 } = salidas(circuito('0', 'alto', 'alto'))
    expect(o2).toBeGreaterThan(10.5)
    expect(o1).toBeLessThan(1.4)
  })

  it('con EN en bajo las salidas quedan en Z: el motor no lleva corriente', () => {
    const { o1, o2 } = salidas(circuito('alto', '0', '0'))
    expect(Math.abs(o1 - o2)).toBeLessThan(1e-3)
  })

  it('un pin sin conectar se dice con su nombre', () => {
    const partes = circuito('alto', '0', 'alto')
    partes[3] = { ...partes[3], pines: { ...partes[3].pines, SENSA: 'suelto' } }
    expect(compilar(partes).r.errores).toContain('El pin SENSA de U1 no está conectado a nada.')
  })
})

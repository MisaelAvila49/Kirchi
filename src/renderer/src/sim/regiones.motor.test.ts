// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest'
import { calcularConexiones } from '../conexiones/conexiones'
import { compilarNetlist, type NetlistMotor } from '../netlist/netlist'
import { conEtiquetas, type Parte } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import { iniciarMotor } from '../prueba/pasoVista'
import { Simulator, memoriaDelMotor } from '../sinVentana/motor'
import { lecturaDelMotor } from '../sinVentana/lecturas'
import { estadoEnPalabras } from '../ui/medicion'
import { extraDeElemento, leerResultados, REGIONES } from './lectura'

beforeAll(iniciarMotor)

/** Código que publica el motor (`engine/src/devices/region.rs`) y nombre que muestra Mediciones tras simular un circuito. */
function region(elementos: object[], indice: number, nodos = 5): { codigo: number; nombre: string | null } {
  const net = { nodes: nodos, elements: elementos } as unknown as NetlistMotor
  const sim = new Simulator(JSON.stringify(net), 1e-6)
  try {
    sim.advance_to(1e-3, 1e9)
    const s = lecturaDelMotor(sim, memoriaDelMotor(), sim.node_count(), sim.element_count(), sim.digital_count())
    const e = net.elements[indice]
    const extra = extraDeElemento(e, undefined, { v: 0, i: 0 }, (n) => (n === 0 ? 0 : (s.voltages[n] ?? 0)), s.aux[indice] ?? 0, s.estado[indice] ?? 0)
    return { codigo: s.estado[indice], nombre: extra ? estadoEnPalabras({ v: 0, i: 0, p: 0, extra }) : null }
  } finally {
    sim.free()
  }
}

const dc = (a: number, v: number) => ({ type: 'V', a, b: 0, wave: { kind: 'dc', v } })
const R = (a: number, b: number, ohms: number) => ({ type: 'R', a, b, ohms })

/** NPN con 12 V y 1 kΩ en el colector, y la base por `rb` desde `vb`. */
const npn = (vb: number, rb: number) => [dc(1, 12), dc(2, vb), R(2, 3, rb), R(1, 4, 1000), { type: 'Q', c: 4, b: 3, e: 0, pnp: false, model: {} }]
/** NPN al revés: el colector a tierra y el emisor al riel por la resistencia. */
const npnInverso = [dc(1, 12), dc(2, 5), R(2, 3, 100e3), R(1, 4, 1000), { type: 'Q', c: 0, b: 3, e: 4, pnp: false, model: {} }]
/** MOSFET de canal N con 12 V y 100 Ω en el drenador, y la compuerta a `vg`. */
const nmos = (vg: number) => [dc(1, 12), dc(2, vg), R(1, 3, 100), { type: 'M', d: 3, g: 2, s: 0, pmos: false, model: { vto: 2.1, kp: 0.18, lambda: 0.02 } }]

describe('el código de región del motor y el nombre que se muestra coinciden', () => {
  it('un BJT en cada región', () => {
    expect(region(npn(0, 10e3), 4)).toEqual({ codigo: 0, nombre: 'corte' })
    expect(region(npn(1.5, 100e3), 4)).toEqual({ codigo: 1, nombre: 'activa' })
    expect(region(npn(5, 10e3), 4)).toEqual({ codigo: 2, nombre: 'saturación' })
    expect(region(npnInverso, 4)).toEqual({ codigo: 3, nombre: 'activa inversa' })
  })

  it('un MOSFET en cada región: 1 amplifica (saturación) y 2 conduce como interruptor (lineal)', () => {
    expect(region(nmos(1), 3, 4)).toEqual({ codigo: 0, nombre: 'corte' })
    expect(region(nmos(2.6), 3, 4)).toEqual({ codigo: 1, nombre: 'saturación' })
    expect(region(nmos(10), 3, 4)).toEqual({ codigo: 2, nombre: 'lineal' })
  })

  it('cada tipo con región usa el mismo sentido por código', () => {
    // 0 no conduce, 1 amplifica, 2 conduce como interruptor, 3 al revés (solo bipolares).
    expect(REGIONES.bjt).toEqual(['corte', 'activa', 'saturación', 'activa inversa'])
    expect(REGIONES.igbt).toEqual(REGIONES.bjt)
    expect(REGIONES.mosfet).toEqual(['corte', 'saturación', 'lineal'])
    expect(REGIONES.jfet).toEqual(REGIONES.mosfet)
  })
})

describe('la región del IGBT, que declara su pieza en medida.region', () => {
  const lib = libreriaDePrueba().piezas
  /** El estado que muestra Mediciones para el IGBT con la compuerta al voltaje dado, 30 V y 2.3 ohm en el colector. */
  function regionDelIgbt(vg: string): string | null {
    const partes: Parte[] = [
      { tipo: 'fuente-dc', ref: 'V1', props: { voltaje: '30' }, pines: { '+': 'vin', '-': '0' } },
      { tipo: 'resistencia', ref: 'R1', props: { valor: '2.3' }, pines: { '1': 'vin', '2': 'c' } },
      { tipo: 'fuente-dc', ref: 'V2', props: { voltaje: vg }, pines: { '+': 'g', '-': '0' } },
      { tipo: 'igbt', ref: 'Q1', props: { modelo: 'IRG4BC30UD' }, pines: { C: 'c', G: 'g', E: '0' } }
    ]
    const d = conEtiquetas(lib, partes)
    const r = compilarNetlist(d, lib, calcularConexiones(d, lib))
    expect(r.errores).toEqual([])
    const sim = new Simulator(JSON.stringify(r.netlist), 1e-6)
    try {
      sim.advance_to(1e-3, 1e9)
      const l = leerResultados(r, lecturaDelMotor(sim, memoriaDelMotor(), sim.node_count(), sim.element_count(), sim.digital_count()))
      const id = Object.values(d.piezas).find((p) => p.ref === 'Q1')!.id
      return estadoEnPalabras(l.piezas.get(id)!)
    } finally {
      sim.free()
    }
  }

  it('sin tensión en la compuerta está en corte y conduciendo su PNP interno está activo', () => {
    expect(regionDelIgbt('0')).toBe('corte')
    expect(regionDelIgbt('15')).toBe('activa')
  })

  it('la lista de regiones del IGBT es la del bipolar y las piezas sin medida.region no publican ninguna', () => {
    expect(REGIONES.igbt).toEqual(REGIONES.bjt)
    const regiones = [...lib.values()].filter((d) => d.modelo?.tipo === 'compuesto' && d.modelo.medida.region !== undefined).map((d) => d.id)
    expect(regiones).toEqual(['igbt'])
  })
})

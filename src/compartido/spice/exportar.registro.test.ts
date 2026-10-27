import { describe, expect, it } from 'vitest'
import { nodosDeElemento } from '../../renderer/src/netlist/netlist'
import { TIPOS_ELEMENTO, type ElementoMotor, type NetlistMotor } from '../netlistMotor'
import { exportarSpice } from './exportar'

const modeloBjt = { is: 1e-14, bf: 100, br: 1 }
const modeloMos = { kp: 2e-5, vto: 1 }
const retardos = { rise_delay: 1000, fall_delay: 1000, z_como: 'x' as const }

/** Un elemento mínimo válido de cada tipo y los nodos que `nodosDeElemento` debe devolver (los analógicos, en el orden del motor). */
const MINIMOS: Record<ElementoMotor['type'], { e: ElementoMotor; nodos: number[] }> = {
  R: { e: { type: 'R', a: 1, b: 2, ohms: 1000 }, nodos: [1, 2] },
  C: { e: { type: 'C', a: 1, b: 2, farads: 1e-6 }, nodos: [1, 2] },
  L: { e: { type: 'L', a: 1, b: 2, henries: 1e-3 }, nodos: [1, 2] },
  V: { e: { type: 'V', a: 1, b: 2, wave: { kind: 'dc', v: 5 } }, nodos: [1, 2] },
  D: { e: { type: 'D', a: 1, b: 2, is: 1e-14, n: 1 }, nodos: [1, 2] },
  I: { e: { type: 'I', a: 1, b: 2, amps: 1e-3 }, nodos: [1, 2] },
  Q: { e: { type: 'Q', c: 1, b: 2, e: 3, pnp: false, model: modeloBjt }, nodos: [1, 2, 3] },
  M: { e: { type: 'M', d: 1, g: 2, s: 3, pmos: false, model: modeloMos }, nodos: [1, 2, 3] },
  OA: { e: { type: 'OA', p: 1, n: 2, out: 3, vp: 4, vn: 5, model: {} }, nodos: [1, 2, 3, 4, 5] },
  J: { e: { type: 'J', d: 1, g: 2, s: 3, pjf: false, model: {} }, nodos: [1, 2, 3] },
  E: { e: { type: 'E', p: 1, n: 2, cp: 3, cn: 4, ganancia: 2 }, nodos: [1, 2, 3, 4] },
  G: { e: { type: 'G', p: 1, n: 2, cp: 3, cn: 4, gm: 0.01 }, nodos: [1, 2, 3, 4] },
  H: { e: { type: 'H', p: 1, n: 2, cp: 3, cn: 4, r: 100 }, nodos: [1, 2, 3, 4] },
  F: { e: { type: 'F', p: 1, n: 2, cp: 3, cn: 4, ganancia: 2 }, nodos: [1, 2, 3, 4] },
  TERM: { e: { type: 'TERM', a: 1, b: 2, tipo: 'ntc', r25: 10000, beta: 3950, delta: 2e-3, tau: 10, canal: 0, tmax: 150 }, nodos: [1, 2] },
  LDR: { e: { type: 'LDR', a: 1, b: 2, r10: 10000, gamma: 0.7, roscuro: 1e6, tau_sube: 0.02, tau_baja: 0.03, canal: 0 }, nodos: [1, 2] },
  PASOS: { e: { type: 'PASOS', nodos: [1, 2, 3, 4], r: 10, l: 0.01, km: 0.1, dientes: 50, td: 1e-3, j: 1e-5, bm: 1e-4 }, nodos: [1, 2, 3, 4] },
  EXT: { e: { type: 'EXT', a: 1, b: 2, modo: 'v', canal: 0, k: 0.01, c: 0 }, nodos: [1, 2] },
  LAMP: { e: { type: 'LAMP', a: 1, b: 2, rfrio: 10, k: 4, pnom: 1, tau: 0.01 }, nodos: [1, 2] },
  MOTOR: { e: { type: 'MOTOR', a: 1, b: 2, r: 1, l: 1e-3, ke: 0.01, j: 1e-5, bm: 1e-6 }, nodos: [1, 2] },
  FUSE: { e: { type: 'FUSE', a: 1, b: 2, ohms: 0.01, inom: 1, ifusion: 2, tau: 0.1 }, nodos: [1, 2] },
  PSU: { e: { type: 'PSU', a: 1, b: 2, v: 5, ilim: 1, vk: 0.1, encendida: true }, nodos: [1, 2] },
  XFMR: { e: { type: 'XFMR', a1: 1, b1: 2, a2: 3, b2: 4, l1: 1e-3, l2: 1e-3, k: 0.9 }, nodos: [1, 2, 3, 4] },
  RELAY: { e: { type: 'RELAY', a1: 1, a2: 2, com: 3, na: 4, nc: 5, r: 100, l: 0.1, ion: 0.01, ioff: 0.005 }, nodos: [1, 2, 3, 4, 5] },
  BUZZER: { e: { type: 'BUZZER', a: 1, b: 2, ohms: 100, umbral: 2 }, nodos: [1, 2] },
  GATE: { e: { type: 'GATE', fn: 'and', inputs: [0, 1], output: 2, ...retardos }, nodos: [] },
  LOGIC: { e: { type: 'LOGIC', out: 0, value: 1 }, nodos: [] },
  DFF: { e: { type: 'DFF', d: 0, clk: 1, pre: 2, clr: 3, q: 4, qn: 5, ...retardos }, nodos: [] },
  JKFF: { e: { type: 'JKFF', j: 0, k: 1, clk: 2, pre: 3, clr: 4, q: 5, qn: 6, ...retardos }, nodos: [] },
  COUNTER: { e: { type: 'COUNTER', clk: 0, rst: 1, q: [2, 3, 4, 5], co: 6, modulo: 16, ...retardos }, nodos: [] },
  DECODER: { e: { type: 'DECODER', inputs: [0, 1, 2, 3], outputs: [4, 5, 6, 7, 8, 9, 10], activo_alto: true, ...retardos }, nodos: [] },
  LATCH555: { e: { type: 'LATCH555', trig: 0, thr: 1, res: 2, q: 3, delay: 1000 }, nodos: [] },
  ADC: { e: { type: 'ADC', p: 1, n: 2, out: 0, in_low: 0, in_high: 5 }, nodos: [1, 2] },
  DAC: { e: { type: 'DAC', input: 0, out: 1, v_lo: 0, v_hi: 5, r_lo: 100, r_hi: 100, t_rise: 1e-9, t_fall: 1e-9 }, nodos: [1] },
  OUT555: { e: { type: 'OUT555', q: 0, out: 1, dis: 2, vcc: 3, gnd: 4, v_lo: 0.1, r_lo: 10, v_hi: 4, r_hi: 10, g_on: 1, g_off: 1e-9, t_rise: 1e-9, t_fall: 1e-9 }, nodos: [1, 2, 3, 4] },
  LUT: { e: { type: 'LUT', comunes: [], rebanadas: [{ entradas: [0, 1], salidas: [2] }], tabla: 0, retardos: [[1e-9, 1e-9]], z_como: 'x' }, nodos: [] },
  MSI: {
    e: { type: 'MSI', entradas: [0], salidas: [1], nucleo: { tipo: 'contador', bits: 1, modulo: 2, reloj: { senales: [{ entrada: 0 }] } }, de: [{ tipo: 'directa', fuente: { bit: 0 } }], retardos: [[1e-9, 1e-9]], z_como: 'x' },
    nodos: []
  },
  DACM: { e: { type: 'DACM', modo: 'voltaje', out: 1, ret: 0, ref_p: 2, ref_n: 0, bits: [0, 1], t_asentamiento: 1e-7 }, nodos: [1, 0, 2, 0] },
  INTC: { e: { type: 'INTC', a: 1, b: 2, canal: 0, r_on: 0.1, r_off: 1e9 }, nodos: [1, 2] }
}

describe('cada elemento del motor tiene su traducción a ngspice', () => {
  it('hay un elemento mínimo por cada tipo', () => {
    expect(Object.keys(MINIMOS).sort()).toEqual([...TIPOS_ELEMENTO].sort())
  })

  it('una netlist sin canales ni lectores se serializa igual que antes', () => {
    const net: NetlistMotor = { nodes: 2, elements: [{ type: 'R', a: 1, b: 0, ohms: 1000 }] }
    expect(JSON.stringify(net)).toBe('{"nodes":2,"elements":[{"type":"R","a":1,"b":0,"ohms":1000}]}')
  })

  for (const tipo of TIPOS_ELEMENTO) {
    it(`${tipo}: se exporta y nodosDeElemento da sus nodos`, () => {
      const { e, nodos } = MINIMOS[tipo]
      const net: NetlistMotor = { nodes: 6, digital_nets: 12, elements: [e], canales: [{ inicial: 25 }], ...(e.type === 'LUT' || e.type === 'MSI' ? { tablas: [[0, 1, 1, 0]] } : {}) }
      expect(nodosDeElemento(e)).toEqual(nodos)
      let salida: ReturnType<typeof exportarSpice> | undefined
      expect(() => (salida = exportarSpice(net)), `exportarSpice con ${tipo}`).not.toThrow()
      expect(salida!.cuerpo.trim().length, `el cuerpo de ${tipo}`).toBeGreaterThan(0)
    })
  }
})

import { describe, expect, it } from 'vitest'
import type { ElementoMotor, NetlistMotor } from '../netlistMotor'
import { exportarSpice } from './exportar'
import { generarSubcircuito, subcircuitoLdr, subcircuitoPasos, subcircuitoTermistor } from './subcircuitos'

const exportar = (canales: number[], ...elements: ElementoMotor[]): string[] =>
  exportarSpice({ nodes: 8, elements, canales: canales.map((inicial) => ({ inicial })) } as NetlistMotor).cuerpo.trim().split('\n')

/** Separa el subcircuito (hasta el primer `.ends`) de los renglones que lo siguen. */
const sub = (l: string[]): string => l.slice(0, l.indexOf('.ends') + 1).join('\n')
const resto = (l: string[]): string[] => l.slice(l.indexOf('.ends') + 1)

const TERM: ElementoMotor = { type: 'TERM', a: 1, b: 2, tipo: 'ntc', r25: 10000, beta: 3950, delta: 2e-3, tau: 10, canal: 0, tmax: 150 }
const LDR: ElementoMotor = { type: 'LDR', a: 1, b: 2, r10: 10000, gamma: 0.7, roscuro: 1e6, tau_sube: 0.02, tau_baja: 0.03, canal: 0 }
const PASOS: ElementoMotor = { type: 'PASOS', nodos: [1, 2, 3, 4], r: 10, l: 0.01, km: 0.1, dientes: 50, td: 1e-3, j: 1e-5, bm: 1e-4 }

describe('exportar termistor, fotorresistencia, motor a pasos y fuente externa', () => {
  it('el termistor llama a su subcircuito con la temperatura del canal', () => {
    const l = exportar([50], TERM)
    expect(sub(l)).toBe(subcircuitoTermistor('tm1', { tipo: 'ntc', r25: 10000, beta: 3950, delta: 2e-3, tau: 10 }))
    expect(resto(l)).toEqual(['x0 n1 n2 tm1 amb=50'])
    expect(l).toContain('bres rt 0 v=min(max(10000*exp(3950*(1/min(max(amb+v(th)+273.15,100),3000)-1/298.15)),1e-6),1e15)')
    expect(l).toContain('rth th 0 500')
    expect(l).toContain('cth th 0 0.02')
  })

  it('el PTC invierte el signo de beta y una tabla R/T usa pwl sobre ln R', () => {
    expect(subcircuitoTermistor('t', { tipo: 'ptc', r25: 100, beta: 3000, delta: 1, tau: 1 })).toContain('exp(-3000*(')
    const t = subcircuitoTermistor('t', { tipo: 'ntc', r25: 100, beta: 3000, rt: [[0, 1000], [100, 10]], delta: 1, tau: 1 })
    expect(t).toContain(`pwl(min(max(amb+v(th),0),100),0,${Math.log(1000)},100,${Math.log(10)})`)
  })

  it('dos termistores iguales comparten el subcircuito', () => {
    const l = exportar([25], TERM, { ...TERM, a: 3 })
    expect(l.filter((x) => x.startsWith('.subckt'))).toHaveLength(1)
    expect(l.filter((x) => x.startsWith('x'))).toEqual(['x0 n1 n2 tm1 amb=25', 'x1 n3 n2 tm1 amb=25'])
  })

  it('el termistor con tabla mal ordenada o canal inexistente se rechaza', () => {
    expect(() => exportar([25], { ...TERM, rt: [[10, 1], [0, 2]] })).toThrow(/tabla/)
    expect(() => exportar([], TERM)).toThrow(/canal/)
  })

  it('la fotorresistencia lleva la luz del canal y el ternario de sus dos constantes', () => {
    const l = exportar([100], LDR)
    expect(sub(l)).toBe(subcircuitoLdr('ld1', { r10: 10000, gamma: 0.7, roscuro: 1e6, tau_sube: 0.02, tau_baja: 0.03 }))
    expect(resto(l)).toEqual(['x0 n1 n2 ld1 lux=100'])
    expect(sub(l)).toContain('(v(s)<obj ? 0.02 : 0.03)')
    expect(resto(exportar([-5], LDR))).toEqual(['x0 n1 n2 ld1 lux=0'])
  })

  it('el motor a pasos bipolar escribe dos ramas y el unipolar cuatro con sus acoplamientos', () => {
    const bi = exportar([], PASOS)
    expect(sub(bi)).toBe(subcircuitoPasos('pp1', { unipolar: false, r: 10, l: 0.01, k_mutua: 0.99, km: 0.1, dientes: 50, td: 1e-3, j: 1e-5, bm: 1e-4 }))
    expect(resto(bi)).toEqual(['x0 n1 n2 n3 n4 pp1 tc=0'])
    expect(bi[0]).not.toContain('\nka ')
    const uni = exportar([], { ...PASOS, nodos: [1, 2, 3, 4, 5, 6], unipolar: true, k_mutua: 0.9 })
    expect(uni).toContain('ka la1 la2 0.9')
    expect(uni).toContain('kb lb1 lb2 0.9')
    expect(uni).toContain('.subckt pp1 a1 a2 b1 b2 ca cb params: tc=0')
    expect(resto(uni)).toEqual(['x0 n1 n2 n3 n4 n5 n6 pp1 tc=0'])
  })

  it('la carga del canal llega al eje dividida por la reducción', () => {
    expect(resto(exportar([0.5], { ...PASOS, canal_carga: 0, reduccion: 10 }))).toEqual(['x0 n1 n2 n3 n4 pp1 tc=0.05'])
  })

  it('un motor a pasos con nodos de menos se rechaza', () => {
    expect(() => exportar([], { ...PASOS, nodos: [1, 2, 3] })).toThrow(/4 nodos/)
  })

  it('EXT de voltaje escribe una fuente de continua, con su resistencia en serie si la lleva', () => {
    expect(exportar([250], { type: 'EXT', a: 1, b: 2, modo: 'v', canal: 0, k: 0.01, c: 0.5 })).toEqual(['v0 n1 n2 dc 3'])
    expect(exportar([250], { type: 'EXT', a: 1, b: 2, modo: 'v', canal: 0, k: 0.01, c: 0, r: 10 })).toEqual(['v0 n1 xe0 dc 2.5', 're0 xe0 n2 10'])
  })

  it('EXT de corriente escribe una fuente de corriente', () => {
    expect(exportar([2], { type: 'EXT', a: 1, b: 2, modo: 'i', canal: 0, k: 0.001, c: 0 })).toEqual(['i0 n1 n2 dc 0.002'])
  })

  it('el generador compartido rechaza una clase desconocida y valores no finitos', () => {
    expect(() => generarSubcircuito('nada', 'x', {})).toThrow(/generador/)
    expect(() => subcircuitoLdr('x', { r10: NaN, gamma: 1, roscuro: 1, tau_sube: 1, tau_baja: 1 })).toThrow(/finito/)
    expect(generarSubcircuito('ldr', 'ld9', { r10: 1000, gamma: 1, roscuro: 1e6, tau_sube: 1, tau_baja: 1 })).toContain('.subckt ld9 a b')
  })
})

// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { calcularConexiones } from '../conexiones/conexiones'
import type { Documento } from '../doc/tipos'
import decodificador138 from '../piezas/__fixtures__/funciones/decodificador-138.json'
import multiplexor151 from '../piezas/__fixtures__/funciones/multiplexor-151.json'
import { cargarLibreria } from '../piezas/libreria'
import { tablaHoja } from '../piezas/tablaVerdad'
import { conEtiquetas, type Parte } from '../prueba/circuitos'
import { leerCarpeta, RAIZ_COMPONENTES } from '../prueba/libreria'
import { FAMILIAS, parametrosDeFamilia, retardoDeChip } from './familias'
import { compilarNetlist, type ElementoMotor } from './netlist'

type El<T extends ElementoMotor['type']> = Extract<ElementoMotor, { type: T }>

const propsFamilia = [
  { id: 'familia', nombre: 'Familia', defecto: '74HC', opciones: ['74HC', '74LS'] },
  { id: 'alimentacion', nombre: 'Alimentación', defecto: '5 V', opciones: ['2 V', '4.5 V', '5 V', '6 V'] }
]
const retardos = (c: Record<string, [number, number]>) => ({ '74HC': { vcc: 4.5, ...c }, '74LS': { vcc: 5, ...c } })

/** Una pieza de prueba: pines de entrada a la izquierda y los de `der` a la derecha, en un rectángulo que los deja fuera. */
function pieza(id: string, pines: string[], der: string[], modelo: object) {
  const izq = pines.filter((p) => !der.includes(p))
  const alto = 2 * Math.max(izq.length, der.length) + 2
  const json = {
    id, nombre: { es: id, en: id }, categoria: 'digitales', prefijo: 'U', buscar: [id],
    pines: [...izq.map((p, k) => ({ id: p, nombre: p, x: -8, y: 2 * k })), ...der.map((p, k) => ({ id: p, nombre: p, x: 8, y: 2 * k }))],
    props: propsFamilia, modelo, etiquetas: { ref: { x: 0, y: -4 }, valor: { x: 0, y: alto + 2 } }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -4 20 ${alto + 6}" fill="none" stroke="currentColor"><path d="M-6 -2 H6 V${alto} H-6 Z"/></svg>`
  return { [`digitales/${id}/pieza.json`]: JSON.stringify(json), [`digitales/${id}/simbolo.svg`]: svg }
}

const P138 = ['G1', 'G2A', 'G2B', 'C', 'B', 'A']
const Y138 = ['Y0', 'Y1', 'Y2', 'Y3', 'Y4', 'Y5', 'Y6', 'Y7']
const P151 = [...multiplexor151.columnas, 'Y', 'W']
const base = { familia: 'familia', alimentacion: 'alimentacion' }

const archivos = {
  ...leerCarpeta(RAIZ_COMPONENTES),
  ...pieza('dec-138', [...P138, ...Y138], Y138, { tipo: 'lut', ...base, comunes: P138, tabla: tablaHoja(decodificador138), retardos: retardos({ '*': [13e-9, 13e-9] }) }),
  ...pieza('mux-151', P151, ['Y', 'W'], { tipo: 'lut', ...base, comunes: multiplexor151.columnas, tabla: tablaHoja(multiplexor151), retardos: retardos({ '*': [15e-9, 15e-9] }) }),
  ...pieza('trx-245', ['OE', 'DIR', 'A1', 'B1', 'A2', 'B2'], ['B1', 'B2'], {
    tipo: 'lut', ...base, comunes: ['OE', 'DIR'], rebanadas: [{ A: 'A1', B: 'B1' }, { A: 'A2', B: 'B2' }], bidireccionales: ['A', 'B'],
    tabla: { columnas: ['OE', 'DIR', 'A', 'B'], salidas: ['A', 'B'], filas: ['1 X X X > Z Z', '0 0 X X > B Z', '0 1 X X > Z A'] },
    retardos: retardos({ '*': [10e-9, 10e-9] })
  }),
  ...pieza('ctr-161', ['CLK', 'CLR', 'LOAD', 'ENT', 'A', 'B', 'QA', 'QB', 'RCO'], ['QA', 'QB', 'RCO'], {
    tipo: 'msi', ...base,
    nucleo: {
      tipo: 'contador', bits: 2, modulo: 4, reloj: { senales: ['CLK'], flanco: 'subida' }, habilita: ['ENT'],
      borra: { senal: '!CLR', sincrona: false }, carga: { senal: '!LOAD', sincrona: true, datos: ['A', 'B'] }
    },
    salidas: { QA: 'q0', QB: '!q1', RCO: 'tabla' },
    tabla: { columnas: ['ENT', 'estado'], salidas: ['RCO'], filas: ['1 3 > 1', '1 0-2 > 0', '0 X > 0'] },
    retardos: retardos({ 'Q*': [17e-9, 17e-9], RCO: [20e-9, 20e-9] })
  }),
  ...pieza('reg-595', ['SER', 'SRCLK', 'SRCLR', 'RCLK', 'OE', 'QA', 'QB'], ['QA', 'QB'], {
    tipo: 'msi', ...base,
    nucleo: { tipo: 'desplazamiento', bits: 2, reloj: { senales: ['SRCLK'] }, serie: ['SER'], borra: { senal: '!SRCLR', sincrona: false }, almacen: { senales: ['RCLK'] } },
    salidas: { QA: 'tabla', QB: 'tabla' },
    tabla: { columnas: ['!OE', 'a0', 'a1'].map((c) => c.replace('!', '')), salidas: ['QA', 'QB'], filas: ['1 X X > Z Z', '0 X X > a0 a1'] },
    retardos: retardos({ '*': [20e-9, 20e-9] })
  })
}
const lib = cargarLibreria(archivos)
const compilar = (d: Documento) => compilarNetlist(d, lib.piezas, calcularConexiones(d, lib.piezas))
const armar = (partes: Parte[]) => conEtiquetas(lib.piezas, partes)
const estado = (ref: string, valor: '0' | '1', red: string, props: Record<string, string> = {}): Parte => ({ tipo: 'estado-logico', ref, props: { estado: valor, ...props }, pines: { S: red } })
const R = (ref: string, valor: string, a: string, b: string): Parte => ({ tipo: 'resistencia', ref, props: { valor }, pines: { '1': a, '2': b } })
const tipos = (els: ElementoMotor[]) => els.map((e) => e.type).sort()

describe('las piezas de prueba cargan', () => {
  it('la librería no trae errores', () => expect(lib.errores).toEqual([]))
})

describe('un 138 como LUT', () => {
  const entradas = P138.map((p, k) => estado(`E${k}`, '1', p.toLowerCase()))
  const d = armar([...entradas, { tipo: 'dec-138', ref: 'U1', props: {}, pines: Object.fromEntries([...P138.map((p) => [p, p.toLowerCase()]), ...Y138.map((p) => [p, p.toLowerCase()])]) }, R('R1', '1k', 'y0', '0')])
  const r = compilar(d)

  it('arma un LUT con sus seis comunes, ocho salidas y un puente solo donde la red es analógica', () => {
    expect(r.errores).toEqual([])
    const n = r.netlist!
    expect(tipos(n.elements)).toEqual(['DAC', 'LOGIC', 'LOGIC', 'LOGIC', 'LOGIC', 'LOGIC', 'LOGIC', 'LUT', 'R'])
    const lut = n.elements.find((e) => e.type === 'LUT') as El<'LUT'>
    expect(lut.comunes).toHaveLength(6)
    expect(lut.rebanadas).toHaveLength(1)
    expect(lut.rebanadas[0].entradas).toEqual([])
    expect(lut.rebanadas[0].salidas).toHaveLength(8)
    const dac = n.elements.find((e) => e.type === 'DAC') as El<'DAC'>
    expect(dac.input).toBe(lut.rebanadas[0].salidas[0])
    expect(dac.z).toBeUndefined()
    expect(lut.z_como).toBe('x')
  })

  it('la tabla compartida es la de la hoja: G1 = 1 con todo lo demás en 0 baja solo Y0', () => {
    const t = r.netlist!.tablas![0]
    expect(t).toHaveLength(64)
    // Índice 0b100000, Y0 en los bits bajos: Y0 = 0 y las otras siete en 1.
    expect(t[32]).toBe(0x5554)
    expect(t[0]).toBe(0x5555)
  })

  it('los retardos salen de la hoja a 4.5 V escalados a la alimentación de la pieza', () => {
    const lut = r.netlist!.elements.find((e) => e.type === 'LUT') as El<'LUT'>
    const f = FAMILIAS.familias['74HC']
    expect(lut.retardos).toHaveLength(8)
    expect(lut.retardos[0]).toEqual(retardoDeChip(f, 5, 4.5, [13e-9, 13e-9]))
  })
})

describe('un 245 con rebanadas', () => {
  const pines = (a1: string, b1: string) => ({ OE: 'oe', DIR: 'dir', A1: a1, B1: b1, A2: 'a2', B2: 'b2' })

  it('en red pura un pin bidireccional es una sola red digital para leer y para manejar', () => {
    const d = armar([estado('E1', '0', 'oe'), estado('E2', '1', 'dir'), estado('E3', '1', 'a1'), { tipo: 'trx-245', ref: 'U1', props: {}, pines: pines('a1', 'b1') }])
    const r = compilar(d)
    expect(r.errores).toEqual([])
    const lut = r.netlist!.elements.find((e) => e.type === 'LUT') as El<'LUT'>
    expect(lut.comunes).toHaveLength(2)
    expect(lut.rebanadas).toHaveLength(2)
    // A1 se lee y B1 se maneja; la red de A1 la maneja además el estado lógico (una salida fija y una de tres estados).
    expect(lut.rebanadas[0].entradas[0]).toBe(lut.rebanadas[0].salidas[0])
    expect(lut.rebanadas[0].entradas[1]).toBe(lut.rebanadas[0].salidas[1])
    expect(tipos(r.netlist!.elements).filter((t) => t === 'DAC' || t === 'ADC')).toEqual([])
  })

  it('en una red con resistencia lleva un puente de entrada y otro de salida con z sobre el mismo nodo', () => {
    const d = armar([estado('E1', '0', 'oe'), estado('E2', '1', 'dir'), estado('E3', '1', 'a1'), R('R1', '10k', 'b1', '0'), { tipo: 'trx-245', ref: 'U1', props: {}, pines: pines('a1', 'b1') }])
    const r = compilar(d)
    expect(r.errores).toEqual([])
    const adc = r.netlist!.elements.filter((e) => e.type === 'ADC') as El<'ADC'>[]
    const dac = r.netlist!.elements.filter((e) => e.type === 'DAC') as El<'DAC'>[]
    expect(adc).toHaveLength(1)
    expect(dac).toHaveLength(1)
    expect(dac[0].z).toBe(true)
    expect(adc[0].p).toBe(dac[0].out)
    expect(adc[0].n).toBe(0)
    const lut = r.netlist!.elements.find((e) => e.type === 'LUT') as El<'LUT'>
    expect(lut.rebanadas[0].entradas[1]).toBe(adc[0].out)
    expect(lut.rebanadas[0].salidas[1]).toBe(dac[0].input)
    expect(adc[0].out).not.toBe(dac[0].input)
  })
})

describe('un 161 y un 595 como MSI', () => {
  it('un contador arma su núcleo con las entradas por índice, las salidas directas y la tabla de RCO', () => {
    const d = armar([
      estado('E1', '1', 'clk'), estado('E2', '1', 'clr'), estado('E3', '1', 'load'), estado('E4', '1', 'ent'), estado('E5', '0', 'a'), estado('E6', '0', 'b'),
      { tipo: 'ctr-161', ref: 'U1', props: {}, pines: { CLK: 'clk', CLR: 'clr', LOAD: 'load', ENT: 'ent', A: 'a', B: 'b', QA: 'qa', QB: 'qb', RCO: 'rco' } }
    ])
    const r = compilar(d)
    expect(r.errores).toEqual([])
    const msi = r.netlist!.elements.find((e) => e.type === 'MSI') as El<'MSI'>
    expect(msi.entradas).toHaveLength(6)
    expect(msi.salidas).toHaveLength(3)
    // Entradas en el orden del núcleo: CLK, ENT, CLR, LOAD, A, B.
    expect(msi.nucleo).toEqual({
      tipo: 'contador', bits: 2, modulo: 4, reloj: { senales: [{ entrada: 0 }], flanco: 'subida' }, habilita: [{ entrada: 1 }],
      borra: { senal: { entrada: 2, bajo: true }, sincrona: false }, carga: { senal: { entrada: 3, bajo: true }, sincrona: true, datos: [4, 5] }
    })
    expect(msi.de).toEqual([{ tipo: 'directa', fuente: { bit: 0 } }, { tipo: 'directa', fuente: { bit: 1 }, negada: true }, { tipo: 'tabla', columna: 0 }])
    // La columna ENT y los dos bits de «estado», el más significativo primero.
    expect(msi.fuentes).toEqual([{ entrada: 1 }, { bit: 1 }, { bit: 0 }])
    expect(msi.tabla).toBe(0)
    expect(r.netlist!.tablas![0]).toHaveLength(8)
    expect(msi.retardos).toHaveLength(3)
  })

  it('un registro con salida de tres estados maneja con z y lee el registro auxiliar en su tabla', () => {
    const d = armar([
      estado('E1', '1', 'ser'), estado('E2', '1', 'srclk'), estado('E3', '1', 'srclr'), estado('E4', '1', 'rclk'), estado('E5', '0', 'oe'),
      R('R1', '1k', 'qa', '0'),
      { tipo: 'reg-595', ref: 'U1', props: {}, pines: { SER: 'ser', SRCLK: 'srclk', SRCLR: 'srclr', RCLK: 'rclk', OE: 'oe', QA: 'qa', QB: 'qb' } }
    ])
    const r = compilar(d)
    expect(r.errores).toEqual([])
    const msi = r.netlist!.elements.find((e) => e.type === 'MSI') as El<'MSI'>
    expect(msi.fuentes).toEqual([{ entrada: msi.entradas.length - 1 }, { aux: 0 }, { aux: 1 }])
    expect(msi.de).toEqual([{ tipo: 'tabla', columna: 0 }, { tipo: 'tabla', columna: 1 }])
    const dac = r.netlist!.elements.filter((e) => e.type === 'DAC') as El<'DAC'>[]
    expect(dac.map((x) => x.z)).toEqual([true])
  })
})

describe('tablas compartidas', () => {
  it('dos 151 usan la misma tabla de la netlist', () => {
    const pines = (s: string) => Object.fromEntries(P151.map((p) => [p, `${s}${p.toLowerCase()}`]))
    const d = armar([{ tipo: 'mux-151', ref: 'U1', props: {}, pines: pines('a') }, { tipo: 'mux-151', ref: 'U2', props: {}, pines: pines('b') }])
    const r = compilar(d)
    expect(r.errores).toEqual([])
    const luts = r.netlist!.elements.filter((e) => e.type === 'LUT') as El<'LUT'>[]
    expect(luts.map((l) => l.tabla)).toEqual([0, 0])
    expect(r.netlist!.tablas).toHaveLength(1)
    expect(r.netlist!.tablas![0]).toHaveLength(4096)
  })
})

describe('retardo escalado por familia', () => {
  const f = FAMILIAS.familias['74HC']
  const tplh = (v: number) => {
    const k = parametrosDeFamilia(f, v)
    return k.rise_delay + k.t_rise / 2
  }
  it.each([2, 4.5, 6])('a %s V sigue la curva de la familia desde el valor de la hoja a 4.5 V', (v) => {
    const k = parametrosDeFamilia(f, v)
    const esperado = (13e-9 * tplh(v)) / tplh(4.5) - k.t_rise / 2
    expect(retardoDeChip(f, v, 4.5, [13e-9, 13e-9])[0]).toBeCloseTo(esperado, 15)
  })

  it('el LUT de una pieza a 2 V y a 6 V trae los retardos escalados', () => {
    for (const v of [2, 6]) {
      const d = armar([{ tipo: 'mux-151', ref: 'U1', props: { alimentacion: `${v} V` }, pines: Object.fromEntries(P151.map((p) => [p, p.toLowerCase()])) }])
      const lut = compilar(d).netlist!.elements[0] as El<'LUT'>
      expect(lut.retardos[0]).toEqual(retardoDeChip(f, v, 4.5, [15e-9, 15e-9]))
    }
  })
})

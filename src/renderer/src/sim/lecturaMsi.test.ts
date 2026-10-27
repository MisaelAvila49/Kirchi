// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { calcularConexiones } from '../conexiones/conexiones'
import { cargarLibreria } from '../piezas/libreria'
import { conEtiquetas, type Parte } from '../prueba/circuitos'
import { leerCarpeta, RAIZ_COMPONENTES } from '../prueba/libreria'
import { conPiezas, piezaDePrueba } from '../prueba/piezasNuevas'
import { compilarNetlist } from '../netlist/netlist'
import { leerResultados, type ExtraMedicion } from './lectura'
import type { SimReading } from './protocol'

const propsFamilia = [
  { id: 'familia', nombre: 'Familia', defecto: '74HC', opciones: ['74HC', '74LS'] },
  { id: 'alimentacion', nombre: 'Alimentación', defecto: '5 V', opciones: ['2 V', '4.5 V', '5 V', '6 V'] }
]
const retardos = { '74HC': { vcc: 4.5, '*': [20e-9, 20e-9] }, '74LS': { vcc: 5, '*': [20e-9, 20e-9] } }
const base = { familia: 'familia', alimentacion: 'alimentacion' }

/** Una pieza de prueba con sus pines de entrada a la izquierda y los de `der` a la derecha. */
function pieza(id: string, pines: string[], der: string[], modelo: object) {
  const izq = pines.filter((p) => !der.includes(p))
  const json = {
    id, nombre: { es: id, en: id }, categoria: 'digitales', prefijo: 'U', buscar: [id],
    pines: [...izq.map((p, k) => ({ id: p, nombre: p, x: -8, y: 2 * k })), ...der.map((p, k) => ({ id: p, nombre: p, x: 8, y: 2 * k }))],
    props: propsFamilia, modelo, etiquetas: { ref: { x: 0, y: -4 }, valor: { x: 0, y: 12 } }
  }
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -4 20 20" fill="none" stroke="currentColor"><path d="M-6 -2 H6 V10 H-6 Z"/></svg>'
  return { [`digitales/${id}/pieza.json`]: JSON.stringify(json), [`digitales/${id}/simbolo.svg`]: svg }
}

const lib = cargarLibreria({
  ...leerCarpeta(RAIZ_COMPONENTES),
  ...pieza('ctr-161', ['CLK', 'CLR', 'ENT', 'QA', 'QB', 'RCO'], ['QA', 'QB', 'RCO'], {
    tipo: 'msi', ...base,
    nucleo: { tipo: 'contador', bits: 2, modulo: 4, reloj: { senales: ['CLK'], flanco: 'subida' }, habilita: ['ENT'], borra: { senal: '!CLR', sincrona: false } },
    salidas: { QA: 'q0', QB: '!q1', RCO: 'tabla' },
    tabla: { columnas: ['ENT', 'estado'], salidas: ['RCO'], filas: ['1 3 > 1', '1 0-2 > 0', '0 X > 0'] },
    retardos
  }),
  ...pieza('reg-595', ['SER', 'SRCLK', 'RCLK', 'QA', 'QB'], ['QA', 'QB'], {
    tipo: 'msi', ...base,
    nucleo: { tipo: 'desplazamiento', bits: 2, reloj: { senales: ['SRCLK'] }, serie: ['SER'], almacen: { senales: ['RCLK'] } },
    salidas: { QA: 'tabla', QB: 'tabla' },
    tabla: { columnas: ['a0', 'a1'], salidas: ['QA', 'QB'], filas: ['X X > a0 a1'] },
    retardos
  })
}).piezas

const estado = (ref: string, red: string): Parte => ({ tipo: 'estado-logico', ref, props: { estado: '1' }, pines: { S: red } })

/** Compila el circuito y arma una lectura del motor: `aux` y `estado` del elemento de la pieza y la frecuencia de su red de reloj. */
function leer(partes: Parte[], ref: string, aux: number, estadoMotor: number, reloj: [string, number]) {
  const d = conEtiquetas(lib, partes)
  const con = calcularConexiones(d, lib)
  const r = compilarNetlist(d, lib, con)
  expect(r.errores).toEqual([])
  const n = r.netlist!
  const id = Object.values(d.piezas).find((p) => p.ref === ref)!.id
  const dig = r.digitales.get(id)!
  const ceros = new Float64Array(n.elements.length)
  const auxs = ceros.slice(), est = ceros.slice()
  auxs[dig.elemento] = aux
  est[dig.elemento] = estadoMotor
  const medidas = new Float64Array(3 * n.digital_nets!)
  medidas[3 * dig.pines.find((p) => p.id === reloj[0])!.red] = reloj[1]
  const s: SimReading = { time: 0.01, ratio: 1, capacity: 1, seq: 1, consistente: true, voltages: new Float64Array(n.nodes), currents: ceros, aux: auxs, estado: est, niveles: new Float64Array(n.digital_nets!), medidas }
  return leerResultados(r, s).piezas.get(id)!.extra as Extract<ExtraMedicion, { tipo: 'digital' }>
}

describe('lectura de un MSI', () => {
  it('un contador da su cuenta con los nombres de los pines de cada bit y la frecuencia de su reloj', () => {
    const x = leer(
      [estado('E1', 'clk'), estado('E2', 'clr'), estado('E3', 'ent'), { tipo: 'ctr-161', ref: 'U1', props: {}, pines: { CLK: 'clk', CLR: 'clr', ENT: 'ent', QA: 'qa', QB: 'qb', RCO: 'rco' } }],
      'U1', 2, 0, ['CLK', 1000]
    )
    expect(x.registro).toEqual({ clase: 'cuenta', valor: 2, bits: 2, nombres: ['QA', 'QB'], reloj: { hz: 1000, pin: 'CLK' } })
  })

  it('un registro con almacén da el almacén (la segunda lectura) y -1 se lee como sin definir', () => {
    const partes = [estado('E1', 'ser'), estado('E2', 'sr'), estado('E3', 'rc'), { tipo: 'reg-595', ref: 'U2', props: {}, pines: { SER: 'ser', SRCLK: 'sr', RCLK: 'rc', QA: 'qa', QB: 'qb' } }]
    expect(leer(partes, 'U2', 3, 1, ['SRCLK', 0]).registro).toMatchObject({ clase: 'almacén', valor: 1, bits: 2, nombres: ['QA', 'QB'], reloj: { hz: 0, pin: 'SRCLK' } })
    expect(leer(partes, 'U2', 3, -1, ['SRCLK', 0]).registro!.valor).toBeNull()
  })
})

const DB = Array.from({ length: 8 }, (_, k) => `DB${k}`)
const adc = piezaDePrueba('adc-t', ['CS', 'RD', 'WR', 'CLKIN', 'INTR', 'VINP', 'VINN', 'AGND', 'VREF2', 'DGND', 'VCC', 'CLKR', ...DB], [], {
  tipo: 'convertidor-ad', cs: 'CS', rd: 'RD', wr: 'WR', clkin: 'CLKIN', clkr: 'CLKR', intr: 'INTR', vinp: 'VINP', vinn: 'VINN', agnd: 'AGND', vref2: 'VREF2', dgnd: 'DGND', vcc: 'VCC', db: DB,
  vil: 0.8, vih: 2, vtp: 3.1, vtn: 1.8, voh: 4.5, vol: 0.4, rref: 2200, r_lo: 250, r_hi: 500, ciclos_inicio: 4, ciclos_bit: 8, t_acceso: 135e-9, t_intr: 300e-9
})
const A = Array.from({ length: 8 }, (_, k) => `A${k + 1}`)
const dac = piezaDePrueba('dac-t', [...A, 'IO', 'GND', 'VEE', 'VCC', 'VREFP', 'VREFN', 'COMP'], [], {
  tipo: 'convertidor-da', a: A, io: 'IO', gnd: 'GND', vee: 'VEE', vcc: 'VCC', vrefp: 'VREFP', vrefn: 'VREFN', comp: 'COMP', vil: 0.8, vih: 2, t_asentamiento: 150e-9
})
const libConv = conPiezas(adc, dac)
const V = (ref: string, v: string, mas: string): Parte => ({ tipo: 'fuente-dc', ref, props: { voltaje: v }, pines: { '+': mas, '-': '0' } })
const R = (ref: string, valor: string, a: string, b: string): Parte => ({ tipo: 'resistencia', ref, props: { valor }, pines: { '1': a, '2': b } })
const C = (ref: string, valor: string, a: string, b: string): Parte => ({ tipo: 'capacitor', ref, props: { valor }, pines: { '1': a, '2': b } })

describe('lectura de los convertidores', () => {
  const pinesAdc = { CS: '0', RD: '0', WR: 'wr', CLKIN: 'clkin', INTR: 'intr', VINP: 'vin', VINN: '0', AGND: '0', VREF2: 'vref2', DGND: '0', VCC: 'vcc', CLKR: 'clkr', ...Object.fromEntries(DB.map((p) => [p, p.toLowerCase()])) }
  const partes = [V('V1', '5', 'vcc'), V('V2', '2.5', 'vin'), V('V3', '5', 'wr'), V('V4', '2.5', 'vref2'), { tipo: 'adc-t', ref: 'U1', props: {}, pines: pinesAdc }, R('R1', '10k', 'clkr', 'clkin'), C('C1', '150p', 'clkin', '0')]
  const compilar = (partes: Parte[]) => {
    const d = conEtiquetas(libConv, partes)
    const con = calcularConexiones(d, libConv)
    return { d, con, r: compilarNetlist(d, libConv, con) }
  }

  it('el ADC0804 da el código, si convierte, INTR, el fondo de escala y su reloj', () => {
    const { d, con, r } = compilar(partes)
    expect(r.errores).toEqual([])
    const id = Object.values(d.piezas).find((p) => p.ref === 'U1')!.id
    const c = r.convertidores.get(id)!
    const n = r.netlist!
    const ceros = new Float64Array(n.elements.length)
    const aux = ceros.slice(), est = ceros.slice()
    aux[c.elemento] = 128
    const v = new Float64Array(n.nodes)
    v[r.nodoDeRed.get(con.redes.find((x) => x.nombre === 'vref2')!.id)!] = 2.5
    const niveles = new Float64Array(n.digital_nets!)
    niveles[c.intr!] = 0
    const base: SimReading = { time: 0.01, ratio: 1, capacity: 1, seq: 1, consistente: true, voltages: v, currents: ceros, aux, estado: est, niveles, medidas: new Float64Array(3 * n.digital_nets!) }
    const listo = leerResultados(r, base).piezas.get(id)!.extra
    expect(listo).toMatchObject({ tipo: 'convertidor-ad', codigo: 128, bits: 8, convirtiendo: false, intr: '0', vref: 5, reloj: { tipo: 'rc', r: 10e3, c: 150e-12 } })
    // Con un código de prueba en curso convierte; con un bit sin definir el código es null.
    est[c.elemento] = 192
    expect(leerResultados(r, base).piezas.get(id)!.extra).toMatchObject({ convirtiendo: true })
    aux[c.elemento] = -1
    expect(leerResultados(r, base).piezas.get(id)!.extra).toMatchObject({ codigo: null })
  })

  it('el DAC0808 da el código vigente y la corriente de IO', () => {
    const pines = { ...Object.fromEntries(A.map((p) => [p, '0'])), IO: 'io', GND: '0', VEE: 'vee', VCC: 'vcc', VREFP: 'vrefp', VREFN: '0', COMP: 'comp' }
    const { d, r } = compilar([V('V1', '5', 'vcc'), V('V2', '-5', 'vee'), V('V3', '5', 'vrefp'), R('R1', '1k', 'io', '0'), { tipo: 'dac-t', ref: 'U2', props: {}, pines }])
    const id = Object.values(d.piezas).find((p) => p.ref === 'U2')!.id
    const k = r.convertidores.get(id)!.elemento
    const n = r.netlist!
    const ceros = new Float64Array(n.elements.length)
    const est = ceros.slice(), corr = ceros.slice()
    est[k] = 64
    corr[k] = 0.5e-3
    const s: SimReading = { time: 0.01, ratio: 1, capacity: 1, seq: 1, consistente: true, voltages: new Float64Array(n.nodes), currents: corr, aux: ceros, estado: est, niveles: new Float64Array(n.digital_nets!), medidas: new Float64Array(3 * n.digital_nets!) }
    expect(leerResultados(r, s).piezas.get(id)!.extra).toEqual({ tipo: 'convertidor-da', codigo: 64, io: 0.5e-3 })
  })
})

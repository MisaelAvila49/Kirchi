import { describe, expect, it } from 'vitest'
import decodificador138 from './__fixtures__/funciones/decodificador-138.json'
import { validarPieza } from './validar'

const pin = (id: string, k = 0) => ({ id, nombre: id, x: 2 * k, y: 0 })
const propsFamilia = [
  { id: 'familia', nombre: 'Familia', defecto: '74HC', opciones: ['74HC', '74LS'] },
  { id: 'alimentacion', nombre: 'Alimentación', defecto: '5 V', opciones: ['5 V', '3.3 V'] }
]
const retardos = { '74HC': { vcc: 4.5, '*': [13e-9, 13e-9] }, '74LS': { vcc: 5, '*': [18e-9, 27e-9] } }
const pieza = (id: string, pines: string[], modelo: object, extra: object = {}) => ({
  id,
  nombre: { es: id, en: id },
  categoria: 'digitales',
  prefijo: 'U',
  buscar: ['u'],
  pines: pines.map(pin),
  props: propsFamilia,
  modelo,
  ...extra
})
const errores = (o: unknown) => {
  const v = validarPieza(JSON.stringify(o), 'x/pieza.json')
  return v.ok ? [] : v.errores.map((e) => e.replace('x/pieza.json: ', ''))
}

const P138 = ['G1', 'G2A', 'G2B', 'C', 'B', 'A', 'Y0', 'Y1', 'Y2', 'Y3', 'Y4', 'Y5', 'Y6', 'Y7']
const lut138 = (tabla: object = { columnas: decodificador138.columnas, salidas: decodificador138.salidas, filas: decodificador138.filas }, extra: object = {}) => ({
  tipo: 'lut', familia: 'familia', alimentacion: 'alimentacion', comunes: ['G1', 'G2A', 'G2B', 'C', 'B', 'A'], tabla, retardos, ...extra
})

describe('modelo lut', () => {
  it('acepta el 138 con la tabla de la hoja', () => {
    expect(errores(pieza('dec-138', P138, lut138()))).toEqual([])
  })

  it('rechaza la errata de una clave con la sugerencia', () => {
    expect(errores(pieza('dec-138', P138, lut138(undefined, { retardo: retardos })))).toContain('modelo.retardo clave desconocida en un modelo «lut», ¿quisiste decir «retardos»?')
  })

  it('dice qué combinación falta cuando se borra una fila', () => {
    const filas = decodificador138.filas.slice(0, -1)
    const e = errores(pieza('dec-138', P138, lut138({ columnas: decodificador138.columnas, salidas: decodificador138.salidas, filas })))
    expect(e).toContain('modelo.tabla la tabla no dice qué pasa con G1 = 1, G2A = 0, G2B = 0, C = 1, B = 1, A = 1')
  })

  it('dice qué filas se cruzan', () => {
    const filas = [...decodificador138.filas, '1 0 0 0 0 0 > 1 1 1 1 1 1 1 1']
    const e = errores(pieza('dec-138', P138, lut138({ columnas: decodificador138.columnas, salidas: decodificador138.salidas, filas })))
    expect(e).toContain('modelo.tabla las filas 4 y 12 se cruzan en G1 = 1, G2A = 0, G2B = 0, C = 0, B = 0, A = 0')
  })

  it('exige que cada pin aparezca en el modelo, que haya retardos por familia y que cubran las salidas', () => {
    expect(errores(pieza('dec-138', [...P138, 'NC'], lut138()))).toContain('modelo el pin NC no aparece en el modelo')
    expect(errores(pieza('dec-138', P138, lut138(undefined, { retardos: { '74HC': retardos['74HC'] } })))).toContain('modelo.retardos.74LS falta: cada opción de familia necesita sus retardos')
    expect(errores(pieza('dec-138', P138, lut138(undefined, { retardos: { '74HC': { vcc: 4.5, Y0: [1e-8, 1e-8] }, '74LS': retardos['74LS'] } })))[0]).toContain('falta el retardo de Y1')
  })

  it('las rebanadas del 245 piden declarar los pines bidireccionales', () => {
    const pines = ['OE', 'DIR', 'A1', 'B1', 'A2', 'B2']
    const modelo = (extra: object = {}) => ({
      tipo: 'lut', familia: 'familia', alimentacion: 'alimentacion', comunes: ['OE', 'DIR'],
      rebanadas: [{ A: 'A1', B: 'B1' }, { A: 'A2', B: 'B2' }],
      tabla: { columnas: ['OE', 'DIR', 'A', 'B'], salidas: ['A', 'B'], filas: ['1 X X X > Z Z', '0 0 X X > B Z', '0 1 X X > Z A'] },
      retardos, ...extra
    })
    expect(errores(pieza('tr-245', pines, modelo({ bidireccionales: ['A', 'B'] })))).toEqual([])
    expect(errores(pieza('tr-245', pines, modelo()))).toContain('modelo.bidireccionales «A» es entrada y salida de la tabla: decláralo en bidireccionales')
  })

  it('una entrada puede repetirse en varias rebanadas con el mismo nombre local y una salida no', () => {
    const modelo = (reb: object[]) => ({
      tipo: 'lut', familia: 'familia', alimentacion: 'alimentacion', comunes: [], rebanadas: reb,
      tabla: { columnas: ['OE', 'A'], salidas: ['Y'], filas: ['1 X > Z', '0 X > A'] }, retardos
    })
    const pines = ['OE', 'A1', 'A2', 'Y1', 'Y2']
    expect(errores(pieza('buf', pines, modelo([{ OE: 'OE', A: 'A1', Y: 'Y1' }, { OE: 'OE', A: 'A2', Y: 'Y2' }])))).toEqual([])
    expect(errores(pieza('buf', pines, modelo([{ OE: 'OE', A: 'A1', Y: 'Y1' }, { OE: 'OE', A: 'A2', Y: 'Y1' }])))).toContain('modelo.rebanadas[1].Y una salida no puede repetirse en otra rebanada')
    // Con otro nombre local el pin sigue siendo de una sola rebanada.
    expect(errores(pieza('buf', pines, modelo([{ OE: 'OE', A: 'A1', Y: 'Y1' }, { OE: 'A1', A: 'A2', Y: 'Y2' }])))).toContain('modelo.rebanadas[1].OE el pin A1 ya está en otra rebanada')
  })

  it('una salida que copia su propia patilla se rechaza', () => {
    const modelo = {
      tipo: 'lut', familia: 'familia', alimentacion: 'alimentacion', comunes: ['DIR'], rebanadas: [{ A: 'A1' }],
      tabla: { columnas: ['DIR', 'A'], salidas: ['A'], filas: ['0 X > A', '1 X > 0'] }, bidireccionales: ['A'], retardos
    }
    expect(errores(pieza('tr', ['DIR', 'A1'], modelo))).toContain('modelo.tabla la salida A depende de la entrada A de su propio pin')
  })

  it('un generador sustituye a la tabla, y los dos juntos no valen', () => {
    const pines = ['A1', 'A2', 'B1', 'B2', 'C0', 'S1', 'S2', 'C2']
    const generar = { tipo: 'suma', a: ['A1', 'A2'], b: ['B1', 'B2'], acarreo: 'C0', suma: ['S1', 'S2'], salida_acarreo: 'C2' }
    const modelo = (extra: object = {}) => ({ tipo: 'lut', familia: 'familia', alimentacion: 'alimentacion', comunes: ['A1', 'A2', 'B1', 'B2', 'C0'], generar, retardos, ...extra })
    expect(errores(pieza('sum', pines, modelo()))).toEqual([])
    expect(errores(pieza('sum', pines, modelo({ tabla: { columnas: [], salidas: [], filas: [] } })))).toContain('modelo.generar no va junto con tabla')
  })
})

describe('modelo msi', () => {
  const pines = ['CLK', 'CLR', 'ENT', 'QA', 'QB', 'RCO']
  const modelo = (extra: object = {}) => ({
    tipo: 'msi', familia: 'familia', alimentacion: 'alimentacion',
    nucleo: { tipo: 'contador', bits: 2, modulo: 4, reloj: { senales: ['CLK'], flanco: 'subida' }, habilita: ['ENT'], borra: { senal: '!CLR', sincrona: false } },
    salidas: { QA: 'q0', QB: 'q1', RCO: 'tabla' },
    tabla: { columnas: ['ENT', 'estado'], salidas: ['RCO'], filas: ['1 3 > 1', '1 0-2 > 0', '0 X > 0'] },
    retardos: { '74HC': { vcc: 4.5, 'Q*': [17e-9, 17e-9], RCO: [20e-9, 20e-9] }, '74LS': { vcc: 5, 'Q*': [18e-9, 27e-9], RCO: [20e-9, 20e-9] } },
    ...extra
  })

  it('acepta un contador con tabla de salida sobre el estado', () => {
    expect(errores(pieza('ctr', pines, modelo()))).toEqual([])
  })

  it('rechaza módulo fuera de rango, bits del registro que no existen y una tabla sin su salida', () => {
    expect(errores(pieza('ctr', pines, modelo({ nucleo: { tipo: 'contador', bits: 2, modulo: 5, reloj: { senales: ['CLK'] }, habilita: ['ENT'], borra: { senal: '!CLR' } } })))).toContain('modelo.nucleo.modulo debe ser un entero de 2 a 2^bits')
    expect(errores(pieza('ctr', pines, modelo({ salidas: { QA: 'q0', QB: 'q2', RCO: 'tabla' } })))).toContain('modelo.salidas.QB el registro tiene 2 bits')
    expect(errores(pieza('ctr', pines, modelo({ salidas: { QA: 'q0', QB: 'q1', RCO: 'q1' } })))).toContain('modelo.salidas «RCO» está en la tabla: su valor debe ser «tabla»')
  })

  it('una señal de control debe ser un pin y un reloj sugiere la errata', () => {
    expect(errores(pieza('ctr', pines, modelo({ nucleo: { tipo: 'contador', bits: 2, modulo: 4, reloj: { senales: ['CK'], flanco: 'subida' }, habilita: ['ENT'], borra: { senal: '!CLR' } } })))).toContain('modelo.nucleo.reloj.senales[0] no es un pin de la pieza (con ! delante si es activo en bajo)')
    expect(errores(pieza('ctr', pines, modelo({ nucleo: { tipo: 'contador', bits: 2, modulo: 4, reloj: { senal: ['CLK'] }, habilita: ['ENT'], borra: { senal: '!CLR' } } })))).toContain('modelo.nucleo.reloj.senal clave desconocida, ¿quisiste decir «senales»?')
  })
})

describe('modelos de convertidores y entradas', () => {
  it('un interruptor DIP exige la propiedad de texto y pares de pines distintos', () => {
    const pines = ['1', '2', '3', '4']
    const modelo = (extra: object = {}) => ({ tipo: 'interruptores', contactos: [['1', '4'], ['2', '3']], estado: 'estado', r_on: 0.1, r_off: 1e9, ...extra })
    const props = [{ id: 'estado', nombre: 'Estado', texto: true, defecto: '00' }]
    expect(errores({ ...pieza('dip', pines, modelo()), props })).toEqual([])
    expect(errores({ ...pieza('dip', pines, modelo({ contactos: [['1', '4'], ['1', '3']] })), props })).toContain('modelo.contactos cada pin debe aparecer una sola vez')
    expect(errores({ ...pieza('dip', pines, modelo()), props: propsFamilia })).toContain('modelo.estado no es una propiedad de la pieza')
  })

  it('un convertidor AD pide sus doce pines, ocho de datos y los niveles de la hoja ordenados', () => {
    const db = Array.from({ length: 8 }, (_, k) => `DB${k}`)
    const pines = ['CS', 'RD', 'WR', 'CLKIN', 'CLKR', 'INTR', 'VINP', 'VINN', 'AGND', 'VREF2', 'DGND', 'VCC', ...db]
    const modelo = (extra: object = {}) => ({
      tipo: 'convertidor-ad', cs: 'CS', rd: 'RD', wr: 'WR', clkin: 'CLKIN', clkr: 'CLKR', intr: 'INTR', vinp: 'VINP', vinn: 'VINN', agnd: 'AGND', vref2: 'VREF2', dgnd: 'DGND', vcc: 'VCC', db,
      vil: 0.8, vih: 2, vtp: 3.1, vtn: 1.8, voh: 4.5, vol: 0.4, rref: 2200, r_lo: 250, r_hi: 500, ciclos_inicio: 4, ciclos_bit: 8, t_acceso: 135e-9, t_intr: 300e-9, ...extra
    })
    expect(errores(pieza('adc', pines, modelo()))).toEqual([])
    expect(errores(pieza('adc', pines, modelo({ vtn: 3.5 })))).toContain('modelo.vtn debe ser menor que vtp')
    expect(errores(pieza('adc', pines, modelo({ db: db.slice(1) })))).toContain('modelo.db debe tener los ocho pines DB0 a DB7, el bit 0 primero')
  })

  it('un convertidor DA pide ocho bits y parámetros positivos', () => {
    const pines = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'IO', 'GND', 'VEE', 'VCC', 'VREFP', 'VREFN', 'COMP']
    const modelo = (extra: object = {}) => ({ tipo: 'convertidor-da', a: pines.slice(0, 8), io: 'IO', gnd: 'GND', vee: 'VEE', vcc: 'VCC', vrefp: 'VREFP', vrefn: 'VREFN', comp: 'COMP', vil: 0.8, vih: 2, t_asentamiento: 150e-9, ...extra })
    expect(errores(pieza('dac', pines, modelo()))).toEqual([])
    expect(errores(pieza('dac', pines, modelo({ a: pines.slice(0, 7), t_asentamiento: 0 })))).toEqual(
      expect.arrayContaining(['modelo.a debe tener los ocho pines A1 a A8, el más significativo primero', 'modelo.t_asentamiento debe ser un número positivo'])
    )
  })
})

describe('clave caja y propiedades reservadas', () => {
  const modelo = { tipo: 'compuerta', funcion: 'and', entradas: ['A', 'B'], salida: 'Y', familia: 'familia', alimentacion: 'alimentacion' }
  const and = (caja: object) => ({ ...pieza('and-x', ['A', 'B', 'Y'], modelo), caja })

  it('acepta una caja funcional con marcas', () => {
    const v = validarPieza(JSON.stringify(and({ titulo: '&', forma: 'funcional', izquierda: ['A', '!B'], derecha: ['Y'], marcas: { Y: ['z'] } })), 'x/pieza.json')
    expect(v.ok && v.def.caja?.forma).toBe('funcional')
  })

  it('rechaza claves ajenas con sugerencia, pines inexistentes y marcas desconocidas', () => {
    expect(errores(and({ forma: 'funcional', izquierdo: ['A'] }))).toContain('caja.izquierdo clave desconocida, ¿quisiste decir «izquierda»?')
    expect(errores(and({ forma: 'funcional', izquierda: ['A', 'Q'] }))).toContain('caja.izquierda[1] «Q» no es un pin de la pieza')
    expect(errores(and({ forma: 'funcional', marcas: { Y: ['dinamic'] } }))[0]).toContain('«dinamic» no es una marca')
    expect(errores(and({ forma: 'redonda' }))).toContain('caja.forma debe ser «funcional» o «dip»')
  })

  it('paquete y unidad son del documento y ninguna pieza las declara', () => {
    const p = { ...pieza('and-x', ['A', 'B', 'Y'], modelo), props: [...propsFamilia, { id: 'unidad', nombre: 'Unidad', defecto: 'A', opciones: ['A', 'B'] }] }
    expect(errores(p)).toContain('props[2].id «unidad» está reservado para el documento')
  })
})

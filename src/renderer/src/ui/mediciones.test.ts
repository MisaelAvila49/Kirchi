// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { calcularConexiones, clavePin } from '../conexiones/conexiones'
import { divisor } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import type { ExtraMedicion, Lectura, MedicionPieza } from '../sim/lectura'
import { cssRgba, PALETA_CLARA } from '../lienzo/paleta'
import { colorDeVoltaje } from '../lienzo/voltajes'
import { cifrasDe, colorDeRed, fichaLogica, fichasDe, vistaMediciones } from './mediciones'
import { nombresDeRedes } from './redes'

const lib = libreriaDePrueba().piezas
const d = divisor()
const con = calcularConexiones(d, lib)
const nombres = nombresDeRedes(d, con)
const red = (pieza: string, pin: string) => con.redDePin.get(clavePin(pieza, pin))!
const l: Lectura = {
  t: 1.25,
  ratio: 0.997,
  redes: new Map([[red('p_v1', '+'), 5], [red('p_r1', '2'), 2.5], [red('p_v1', '-'), 0]]),
  piezas: new Map([
    ['p_v1', { v: 5, i: -2.5e-3, p: -12.5e-3 }],
    ['p_r2', { v: 2.5, i: 2.5e-3, p: 6.25e-3 }],
    ['p_r1', { v: 2.5, i: 2.5e-3, p: 6.25e-3 }]
  ])
}

describe('vistaMediciones', () => {
  it('una red digital pura lleva su nivel y una pieza digital solo sus lecturas en palabras', () => {
    const conDigital: Lectura = {
      ...l,
      digitales: new Map([[red('p_r1', '2'), { nivel: '1', nominal: 5, f: 0, ciclo: 0, vcc: 5, cambios: 1, conmuta: false }]]),
      redes: new Map([...l.redes].filter(([id]) => id !== red('p_r1', '2'))),
      piezas: new Map([...l.piezas, ['p_r2', { v: 0, i: 0, p: 0, extra: { tipo: 'digital', modelo: 'contador', pines: [], cuenta: 7 } }]])
    }
    const v = vistaMediciones(d, nombres, conDigital)!
    expect(v.redes.find((r) => r.red === red('p_r1', '2'))!.voltaje).toBe('1 · 5.00 V nominal')
    const fila = v.piezas.find((p) => p.id === 'p_r2')!
    expect(fila).toMatchObject({ estado: '7, 0111', digital: true })
    expect(cifrasDe(fila)).toEqual(['7, 0111'])
  })
  it('encabezado con el tiempo y el ritmo; redes en el orden de Proyecto con su voltaje', () => {
    const v = vistaMediciones(d, nombres, l)!
    expect(v.encabezado).toBe('t = 1.25 s · al 100 % del tiempo real')
    expect(v.redes.map((r) => [r.nombre, r.voltaje])).toEqual([...nombres].map(([id, n]) => [n, `${l.redes.get(id)!.toFixed(2)} V`]))
    expect(v.redes[0]).toMatchObject({ nombre: 'GND', voltaje: '0.00 V' })
  })

  it('piezas por referencia con voltaje, corriente y potencia', () => {
    expect(vistaMediciones(d, nombres, l)!.piezas).toEqual([
      { id: 'p_r1', ref: 'R1', voltaje: '2.50 V', corriente: '2.50 mA', potencia: '6.25 mW' },
      { id: 'p_r2', ref: 'R2', voltaje: '2.50 V', corriente: '2.50 mA', potencia: '6.25 mW' },
      { id: 'p_v1', ref: 'V1', voltaje: '5.00 V', corriente: '−2.50 mA', potencia: '12.5 mW (entrega)' }
    ])
  })

  it('un potenciómetro agrega el voltaje de su cursor', () => {
    const dp = { ...d, piezas: { ...d.piezas, p_rv: { id: 'p_rv', tipo: 'potenciometro', ref: 'RV1', x: 0, y: 0, rot: 0 as const, espejo: false, props: {} } } }
    const lp: Lectura = { ...l, piezas: new Map([['p_rv', { v: 5, cursor: 3.75, i: 0.5e-3, p: 2.5e-3 }]]) }
    expect(vistaMediciones(dp, nombres, lp)!.piezas).toEqual([{ id: 'p_rv', ref: 'RV1', voltaje: '5.00 V', cursor: '3.75 V', corriente: '500 µA', potencia: '2.50 mW' }])
  })

  it('cifrasDe: tres cifras, o cuatro rotuladas en un potenciómetro', () => {
    expect(cifrasDe({ id: 'a', ref: 'R1', voltaje: '2.50 V', corriente: '2.50 mA', potencia: '6.25 mW' })).toEqual(['2.50 V', '2.50 mA', '6.25 mW'])
    expect(cifrasDe({ id: 'a', ref: 'RV1', voltaje: '5.00 V', cursor: '3.75 V', corriente: '500 µA', potencia: '2.50 mW' })).toEqual(['extremos 5.00 V', 'cursor 3.75 V', '500 µA', '2.50 mW'])
    // Lo propio del modelo va al final: la región de un transistor, el estado de un fusible.
    expect(cifrasDe({ id: 'q', ref: 'Q1', voltaje: '5.95 V', corriente: '2.37 mA', potencia: '14.1 mW', estado: 'activa' })).toEqual(['5.95 V', '2.37 mA', '14.1 mW', 'activa'])
  })

  it('el filtro busca en nombres, referencias y cifras; sin lectura no hay vista', () => {
    const v = vistaMediciones(d, nombres, l, 'r2')!
    expect(v.piezas.map((p) => p.ref)).toEqual(['R2'])
    expect(vistaMediciones(d, nombres, l, '5.00')!.redes).toHaveLength(1)
    expect(vistaMediciones(d, nombres, null)).toBeNull()
  })
})

describe('Mediciones P1', () => {
  it('el color de la muestra de una red es el de su cable en el lienzo, con la misma escala', () => {
    const r = red('p_r1', '2')
    expect(colorDeRed(r, l, 5, PALETA_CLARA)).toBe(cssRgba(colorDeVoltaje(2.5, 5, PALETA_CLARA)))
    // Sin lectura de la red (no simula), el gris del cero.
    expect(colorDeRed(9999, l, 5, PALETA_CLARA)).toBe(cssRgba(PALETA_CLARA.voltajeCero))
  })

  it('las fichas de una pieza: cada cifra con su magnitud; lo que no es una magnitud (el estado), sin ella', () => {
    expect(fichasDe({ id: 'q', ref: 'Q1', voltaje: '5.95 V', corriente: '2.37 mA', potencia: '14.1 mW', estado: 'activa' })).toEqual([
      { texto: '5.95 V', magnitud: 'v' }, { texto: '2.37 mA', magnitud: 'i' }, { texto: '14.1 mW', magnitud: 'p' }, { texto: 'activa' }
    ])
    expect(fichasDe({ id: 'u', ref: 'U1', voltaje: '', corriente: '', potencia: '', estado: 'alto', digital: true })).toEqual([{ texto: 'alto' }])
  })

  it('las dos cifras rotuladas del potenciómetro también llevan su magnitud', () => {
    expect(fichasDe({ id: 'p', ref: 'RV1', voltaje: '5.00 V', cursor: '2.50 V', corriente: '1.00 mA', potencia: '5.00 mW' }).map((f) => f.magnitud)).toEqual(['v', 'v', 'i', 'p'])
  })
})

describe('Mediciones de lógica y convertidores', () => {
  const contador: ExtraMedicion = {
    tipo: 'digital', modelo: 'msi',
    pines: [{ id: 'QA', nombre: 'QA', nivel: '1', salida: true }, { id: 'QD', nombre: 'QD', nivel: '1', salida: true }, { id: 'RCO', nombre: 'RCO', nivel: '0', salida: true }, { id: 'CLK', nombre: 'CLK', nivel: '0', salida: false }],
    registro: { clase: 'cuenta', valor: 9, bits: 4, nombres: ['QA', 'QB', 'QC', 'QD'], reloj: { hz: 1000, pin: 'CLK' } }
  }

  it('un contador da la cuenta, sus formas, los bits del más al menos significativo con su nivel y el reloj', () => {
    expect(fichaLogica('p', 'U1', 'Contador · 74HC161', contador)).toEqual({
      id: 'p', ref: 'U1', titulo: 'Contador · 74HC161', rotulo: 'cuenta', cifra: '9', formas: ['0x9', '0b1001', 'RCO 0'],
      bits: [{ nombre: 'QD', valor: '1' }, { nombre: 'QC', valor: '0' }, { nombre: 'QB', valor: '0' }, { nombre: 'QA', valor: '1' }],
      renglones: [{ rotulo: 'Reloj', valor: '1.00 kHz (CLK)' }]
    })
  })

  it('con bits sin definir no hay bits ni formas, y muchas salidas sueltas no se repiten en la ficha', () => {
    const f = fichaLogica('p', 'U1', 'x', { ...contador, registro: { ...(contador as { registro: object }).registro, valor: null } as never })!
    expect(f).toMatchObject({ cifra: 'sin definir', formas: ['RCO 0'], bits: [] })
    const muchas = { ...contador, pines: [...Array.from({ length: 3 }, (_, k) => ({ id: `Y${k}`, nombre: `Y${k}`, nivel: '0' as const, salida: true }))] } as ExtraMedicion
    expect(fichaLogica('p', 'U1', 'x', muchas)!.formas).toEqual(['0x9', '0b1001'])
  })

  it('el ADC0804 da el código, lo que representa, INTR y el reloj, con su estado para la pastilla', () => {
    const adc: ExtraMedicion = { tipo: 'convertidor-ad', codigo: 128, bits: 8, convirtiendo: false, intr: '0', vref: 5, reloj: { tipo: 'rc', hz: 606e3, r: 10e3, c: 150e-12 } }
    expect(fichaLogica('a', 'U2', 'ADC0804', adc)).toEqual({
      id: 'a', ref: 'U2', titulo: 'ADC0804', rotulo: '', estado: { texto: 'listo', tono: 'verdeazul' }, cifra: '128', formas: ['0x80', '0b10000000'], bits: [],
      renglones: [{ rotulo: 'Representa', valor: '2.50 V de 5.00 V' }, { rotulo: 'INTR', valor: '0' }, { rotulo: 'Reloj', valor: '606 kHz (R 10 kΩ, C 150 pF)' }]
    })
    expect(fichaLogica('a', 'U2', 'ADC0804', { ...adc, convirtiendo: true } as ExtraMedicion)!.estado).toEqual({ texto: 'convirtiendo', tono: 'ambar' })
  })

  it('el DAC0808 pone el código en su rótulo y la corriente de IO en un renglón', () => {
    expect(fichaLogica('d', 'U5', 'DAC0808', { tipo: 'convertidor-da', codigo: 64, io: 0.5e-3 })).toMatchObject({ rotulo: 'código 64', renglones: [{ rotulo: 'Corriente IO', valor: '500 µA' }] })
  })

  it('la vista los separa de las piezas, los ordena por referencia, los titula con su modelo y los filtra', () => {
    const lect: Lectura = {
      ...l,
      piezas: new Map<string, MedicionPieza>([
        ['p_r1', { v: 2.5, i: 2.5e-3, p: 6.25e-3 }],
        ['p_r2', { v: 0, i: 0, p: 0, extra: contador }],
        ['p_v1', { v: 0, i: 0, p: 0, extra: { tipo: 'convertidor-da', codigo: 64, io: 0.5e-3 } }]
      ])
    }
    const v = vistaMediciones(d, nombres, lect, '', lib)!
    expect(v.piezas.map((p) => p.ref)).toEqual(['R1'])
    expect(v.logica.map((f) => f.ref)).toEqual(['R2', 'V1'])
    expect(vistaMediciones(d, nombres, lect, 'corriente io', lib)!.logica.map((f) => f.ref)).toEqual(['V1'])
    expect(vistaMediciones(d, nombres, lect, '')!.logica[0].titulo).toBe('R2')
  })
})

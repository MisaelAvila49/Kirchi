// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { calcularConexiones, clavePin } from '../conexiones/conexiones'
import { divisor } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import type { Lectura } from '../sim/lectura'
import { cssRgba, PALETA_CLARA } from '../lienzo/paleta'
import { colorDeVoltaje } from '../lienzo/voltajes'
import { cifrasDe, colorDeRed, fichasDe, vistaMediciones } from './mediciones'
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

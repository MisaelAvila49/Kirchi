import { describe, expect, it } from 'vitest'
import type { LimitePieza } from './avisos'
import type { Lectura } from './lectura'
import type { AbsolutoResuelto } from './absolutos'
import { VigiaDeQuemado } from './quemado'

const led: LimitePieza = { tipo: 'led', corriente: 0.02, quema: { factor: 2, durante: 0.5, elemento: 1 } }
const lectura = (i: number): Lectura => ({ t: 1, ratio: 1, redes: new Map(), piezas: new Map([['d', { v: 2, i, p: 2 * i }]]) })

describe('el quemado', () => {
  it('un mismo intervalo promediado leído muchas veces cuenta una sola vez', () => {
    const q = new VigiaDeQuemado()
    const lim = new Map([['d', led]])
    // 50 mA (2.5 veces) en un intervalo de 0.1 s que termina en t = 0.1, leído doscientas veces (las lecturas por cuadro).
    for (let k = 0; k < 200; k++) expect(q.revisar(lectura(0.05), 0.1, 0.1, lim, new Map())).toEqual([])
    expect(q.esQuemada('d')).toBe(false)
    // Cinco intervalos distintos de 0.1 s seguidos: medio segundo simulado.
    const quemadas = [0.2, 0.3, 0.4, 0.5].flatMap((fin) => q.revisar(lectura(0.05), 0.1, fin, lim, new Map()))
    expect(quemadas).toEqual(['d'])
  })
})

describe('el quemado por máximos absolutos', () => {
  const alim: AbsolutoResuelto = { nombre: 'alimentación', consejo: 'baja la alimentación.', unidad: 'V', de: [1], a: 2, abs: false, max: 36, escala: 36, sinQuema: false }
  const entradas: AbsolutoResuelto = { nombre: 'voltaje entre las entradas', consejo: 'pon una resistencia.', unidad: 'V', de: [3], a: 4, abs: true, max: 0.5, escala: 0.5, sinQuema: true }
  const quema = { factor: 2, durante: 0.5, elemento: 1 }
  const con = (lista: AbsolutoResuelto[]): ReadonlyMap<string, LimitePieza> => new Map([['u', { tipo: 'absolutos', absolutos: { modelo: 'X', lista }, quema }]])
  const lec = (r: Record<number, number>): Lectura => ({ t: 1, ratio: 1, redes: new Map(Object.entries(r).map(([k, v]) => [Number(k), v])), piezas: new Map() })

  it('un diferencial de entrada pasado (NE5532, 0.5 V) avisa pero nunca se quema', () => {
    const q = new VigiaDeQuemado()
    const l = lec({ 3: 3, 4: 0 }) // 3 V entre las entradas: 6 veces el máximo, en la media y en el último paso
    for (let k = 1; k <= 30; k++) expect(q.revisar(l, 0.1, k * 0.1, con([entradas]), new Map(), l)).toEqual([])
    expect(VigiaDeQuemado.vecesAbsolutas(l, 'u', con([entradas]).get('u')!, undefined, l)).toBe(0)
  })

  it('una muestra suelta sobre el máximo en el último paso de dos intervalos no quema', () => {
    const q = new VigiaDeQuemado()
    const lim = con([alim])
    const media = lec({ 1: 20, 2: 0 }), pico = lec({ 1: 60, 2: 0 })
    // Dos intervalos con pico en la muestra final y uno limpio: la racha se corta y nunca llega al mínimo de intervalos seguidos.
    for (let k = 1; k <= 20; k++) {
      const hay = k % 3 !== 0
      expect(q.revisar(media, 0.1, k * 0.1, lim, new Map(), hay ? pico : media)).toEqual([])
    }
  })

  it('el exceso solo en la muestra final, en intervalos seguidos, sí quema una vez pasado el mínimo', () => {
    const q = new VigiaDeQuemado()
    const lim = con([alim])
    const media = lec({ 1: 20, 2: 0 }), pico = lec({ 1: 60, 2: 0 })
    const nuevas: string[] = []
    for (let k = 1; k <= 10; k++) nuevas.push(...q.revisar(media, 0.1, k * 0.1, lim, new Map(), pico))
    expect(nuevas).toEqual(['u'])
  })

  it('un intervalo largo cuya media pasa el máximo sigue quemando de un solo intervalo (el 50 V del TL081)', () => {
    const q = new VigiaDeQuemado()
    const l = lec({ 1: 50, 2: 0 })
    expect(q.revisar(l, 0.6, 0.6, con([alim]), new Map(), l)).toEqual(['u'])
  })
})

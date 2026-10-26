// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import type { Pieza } from '../doc/tipos'
import { libreriaDePrueba } from '../prueba/libreria'
import { acumularRueda, ejeDePotenciometro, PASO_POT, PASO_POT_FINO, posicionDeArrastre, posicionDeProp, textoPosicion, ladosDelPot, ohmsDelPot } from './potenciometro'

const lib = libreriaDePrueba().piezas
const pot = (rot: Pieza['rot'] = 0, espejo = false): Pieza => ({ id: 'rv', tipo: 'potenciometro', ref: 'RV1', x: 10, y: 20, rot, espejo, props: {} })

describe('posición del cursor', () => {
  it('se escribe como «25 %», con enteros de 0 a 100', () => {
    expect(textoPosicion(25)).toBe('25 %')
    expect(textoPosicion(0)).toBe('0 %')
    expect(textoPosicion(100)).toBe('100 %')
    expect(textoPosicion(37.6)).toBe('38 %')
    expect(textoPosicion(-4)).toBe('0 %')
    expect(textoPosicion(180)).toBe('100 %')
    expect(textoPosicion(NaN)).toBe('0 %')
  })

  it('se lee del texto de la propiedad; lo ilegible vale 50 %', () => {
    expect(posicionDeProp('75 %')).toBe(75)
    expect(posicionDeProp('12.5 %')).toBe(12.5)
    expect(posicionDeProp('abc')).toBe(50)
    expect(posicionDeProp(undefined)).toBe(50)
  })

  it('un clic de la rueda mueve 5 % y con Shift 1 %', () => {
    expect(PASO_POT).toBe(5)
    expect(PASO_POT_FINO).toBe(1)
  })
})

describe('rueda del ratón', () => {
  it('una muesca (100 px) es un paso; hacia arriba (deltaY negativo) sube', () => {
    expect(acumularRueda(0, { deltaY: -100, deltaX: 0, deltaMode: 0 })).toEqual({ pasos: 1, resto: 0 })
    expect(acumularRueda(0, { deltaY: 100, deltaX: 0, deltaMode: 0 })).toEqual({ pasos: -1, resto: 0 })
    expect(acumularRueda(0, { deltaY: -300, deltaX: 0, deltaMode: 0 })).toEqual({ pasos: 3, resto: 0 })
  })

  it('un panel táctil junta los pedazos hasta completar una muesca y conserva el resto', () => {
    let r = 0
    const pasos: number[] = []
    for (let i = 0; i < 7; i++) {
      const a = acumularRueda(r, { deltaY: -30, deltaX: 0, deltaMode: 0 })
      pasos.push(a.pasos)
      r = a.resto
    }
    expect(pasos.reduce((s, v) => s + v, 0)).toBe(2)
    expect(r).toBeCloseTo(10, 9)
  })

  it('con Shift algunos sistemas mandan deltaX; las líneas valen 33 px; sin movimiento no hay pasos', () => {
    expect(acumularRueda(0, { deltaY: 0, deltaX: -100, deltaMode: 0 }).pasos).toBe(1)
    expect(acumularRueda(0, { deltaY: -3, deltaX: 0, deltaMode: 1 }).pasos).toBe(1)
    expect(acumularRueda(0, { deltaY: 0, deltaX: 0, deltaMode: 0 })).toEqual({ pasos: 0, resto: 0 })
  })
})

describe('arrastre sobre la pieza', () => {
  const lado = (rot: Pieza['rot'], espejo = false) => ejeDePotenciometro(pot(rot, espejo), lib.get('potenciometro')!)

  it('el eje va del pin 1 al pin 2 en el mundo, y su largo son 8 unidades', () => {
    expect(lado(0)).toEqual({ x: 1, y: 0, largo: 8 })
    const e90 = lado(90)
    expect(e90.x).toBeCloseTo(0, 9)
    expect(e90.y).toBeCloseTo(1, 9)
    expect(lado(0, true).x).toBeCloseTo(-1, 9)
  })

  it('arrastrar a lo largo del eje un largo entero recorre todo el rango', () => {
    expect(posicionDeArrastre(0, { x: 0, y: 0 }, { x: 8, y: 0 }, lado(0))).toBe(100)
    expect(posicionDeArrastre(50, { x: 0, y: 0 }, { x: 2, y: 0 }, lado(0))).toBe(75)
    expect(posicionDeArrastre(50, { x: 0, y: 0 }, { x: -2, y: 5 }, lado(0))).toBe(25)
  })

  it('se acota a 0 y 100 y nunca da decimales', () => {
    expect(posicionDeArrastre(90, { x: 0, y: 0 }, { x: 40, y: 0 }, lado(0))).toBe(100)
    expect(posicionDeArrastre(10, { x: 0, y: 0 }, { x: -40, y: 0 }, lado(0))).toBe(0)
    expect(Number.isInteger(posicionDeArrastre(33, { x: 0, y: 0 }, { x: 0.37, y: 0 }, lado(0)))).toBe(true)
  })

  it('con la pieza a 90° solo cuenta el movimiento vertical, hacia abajo si el pin 2 está abajo', () => {
    const e = lado(90)
    expect(posicionDeArrastre(0, { x: 0, y: 0 }, { x: 0, y: 4 }, e)).toBe(50)
    expect(posicionDeArrastre(50, { x: 0, y: 0 }, { x: 0, y: -2 }, e)).toBe(25)
    expect(posicionDeArrastre(0, { x: 0, y: 0 }, { x: 4, y: 0 }, e)).toBe(0)
    expect(posicionDeArrastre(50, { x: 0, y: 0 }, { x: -2, y: 2 }, e)).toBe(75)
  })

  it('a 270° el sentido se invierte y a 180° o con espejo, también', () => {
    expect(posicionDeArrastre(50, { x: 0, y: 0 }, { x: 0, y: 4 }, lado(270))).toBe(0)
    expect(posicionDeArrastre(50, { x: 0, y: 0 }, { x: 4, y: 0 }, lado(180))).toBe(0)
    expect(posicionDeArrastre(50, { x: 0, y: 0 }, { x: 4, y: 3 }, lado(0, true))).toBe(0)
    expect(posicionDeArrastre(50, { x: 0, y: 0 }, { x: 0, y: 4 }, lado(90, true))).toBe(0)
    expect(posicionDeArrastre(50, { x: 0, y: 0 }, { x: 3, y: 4 }, lado(270, true))).toBe(100)
  })

  it('el movimiento perpendicular al eje no mueve el cursor a 0° ni a 90°', () => {
    expect(posicionDeArrastre(50, { x: 0, y: 0 }, { x: 0, y: 30 }, lado(0))).toBe(50)
    expect(posicionDeArrastre(50, { x: 0, y: 0 }, { x: 30, y: 0 }, lado(90))).toBe(50)
  })
})

describe('resistencia de cada lado del cursor', () => {
  it('pin 1 al cursor y cursor al pin 2 en notación de ingeniería con su porcentaje', () => {
    expect(ladosDelPot(10_000, 25)).toEqual({ pin1: '2.5 kΩ · 25 %', pin2: '7.5 kΩ · 75 %' })
    expect(ladosDelPot(4700, 50)).toEqual({ pin1: '2.35 kΩ · 50 %', pin2: '2.35 kΩ · 50 %' })
  })
  it('en los extremos un lado vale 0 Ω', () => {
    expect(ladosDelPot(10_000, 0)).toEqual({ pin1: '0 Ω · 0 %', pin2: '10 kΩ · 100 %' })
    expect(ladosDelPot(10_000, 100)).toEqual({ pin1: '10 kΩ · 100 %', pin2: '0 Ω · 0 %' })
  })
  it('las dos mitades suman el total y un valor ilegible no inventa nada', () => {
    expect(ladosDelPot(null, 50)).toBeNull()
    expect(ladosDelPot(0, 50)).toBeNull()
    expect(ladosDelPot(1000, 33.4)).toEqual({ pin1: '330 Ω · 33 %', pin2: '670 Ω · 67 %' })
  })
  it('la resistencia total sale de la propiedad de valor de la pieza', () => {
    const def = lib.get('potenciometro')!
    expect(ohmsDelPot({ ...pot(), props: { valor: '4k7' } }, def)).toBe(4700)
    expect(ohmsDelPot(pot(), def)).toBe(10_000)
    expect(ohmsDelPot({ ...pot(), props: { valor: 'mucho' } }, def)).toBeNull()
    expect(ohmsDelPot({ ...pot(), props: { valor: '5 V' } }, def)).toBeNull()
  })

  it('con la ley logarítmica los lados del cursor son los de la ley y no el porcentaje del giro', () => {
    expect(ladosDelPot(10000, 50, 'logarítmica')).toEqual({ pin1: '1.5 kΩ · 15 %', pin2: '8.5 kΩ · 85 %' })
    expect(ladosDelPot(10000, 50, 'lineal')).toEqual(ladosDelPot(10000, 50))
  })
})

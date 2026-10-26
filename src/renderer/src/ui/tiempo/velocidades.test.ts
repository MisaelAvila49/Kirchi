import { describe, expect, it } from 'vitest'
import { deltaAutomatico, divisionDeVista, formatearTiempo, intervaloDe, instantePorOmision, leerDelta, LO_MAS_RAPIDO, masLenta, masRapida, porSegundo, textoDelMenu, textoDelta, textoVelocidad, VELOCIDADES } from './velocidades'

describe('velocidad del tiempo', () => {
  it('la serie son ocho velocidades fijas y no hay décadas intermedias', () => {
    expect(VELOCIDADES).toEqual([10, 5, 2, 1, 0.5, 0.1, 0.01, 0.001])
  })

  it('«Más lento» y «Más rápido» recorren solo esa lista, con «Sin límite de tiempo real» arriba de 10×', () => {
    expect(masLenta(1)).toBe(0.5)
    expect(masLenta(0.5)).toBe(0.1)
    expect(masLenta(0.001)).toBeNull()
    expect(masLenta(LO_MAS_RAPIDO)).toBe(10)
    expect(masRapida(0.1)).toBe(0.5)
    expect(masRapida(10)).toBe(LO_MAS_RAPIDO)
    expect(masRapida(LO_MAS_RAPIDO)).toBeNull()
    expect(masLenta(0.1 * 0.1)).toBe(0.001)
  })

  it('una velocidad retirada se lleva a la más cercana', () => {
    expect(textoVelocidad(0.0002)).toBe('0.001×')
    expect(textoVelocidad(0.2)).toBe('0.1×')
    expect(masLenta(0.0002)).toBeNull()
  })

  it('cada opción dice cuánto se simula por segundo', () => {
    expect(textoVelocidad(1)).toBe('1×')
    expect(textoVelocidad(0.001)).toBe('0.001×')
    expect(textoVelocidad(LO_MAS_RAPIDO)).toBe('Sin límite de tiempo real')
    const esperado = ['×10 (1 s = 10 s simulados)', '×5 (1 s = 5 s simulados)', '×2 (1 s = 2 s simulados)', '×1 (1 s = 1 s simulado)', '×0.5 (1 s = 500 ms simulados)', '×0.1 (1 s = 100 ms simulados)', '×0.01 (1 s = 10 ms simulados)', '×0.001 (1 s = 1 ms simulado)']
    expect(VELOCIDADES.map(textoDelMenu)).toEqual(esperado)
    expect(textoDelMenu(LO_MAS_RAPIDO)).toBe('Sin límite de tiempo real')
  })
})

describe('tiempo simulado a la vista', () => {
  it('la última cifra cambia unas diez veces por segundo de reloj, con cuatro cifras significativas como mínimo', () => {
    expect(formatearTiempo(12.3456, 1)).toBe('12.35 s')
    expect(formatearTiempo(0.0123456, 0.000001)).toBe('12.3456 ms')
    expect(formatearTiempo(0.0123456, 0.01)).toBe('12.35 ms')
    expect(formatearTiempo(0.0123456, 0.001)).toBe('12.35 ms')
    expect(formatearTiempo(0.0123456, 0.0001)).toBe('12.35 ms')
    expect(formatearTiempo(0.0123456, 0.00001)).toBe('12.346 ms')
    expect(formatearTiempo(2.5e-6, 1e-6)).toBe('2.500 µs')
    expect(formatearTiempo(0, 1)).toBe('0 s')
    expect(formatearTiempo(250, LO_MAS_RAPIDO)).toBe('250.0 s')
  })
})

describe('Avanzar (F6)', () => {
  it('el Δ automático es una división del osciloscopio a la vista, o lo que la velocidad recorre en 0.1 s de reloj', () => {
    expect(deltaAutomatico(0.001, null)).toBeCloseTo(1e-4, 15)
    expect(deltaAutomatico(1, 2e-3)).toBe(2e-3)
    expect(deltaAutomatico(LO_MAS_RAPIDO, null)).toBeCloseTo(0.1, 15)
    expect(intervaloDe('paso', 1, null)).toBe('paso')
    expect(intervaloDe(5e-3, 1, 1e-3)).toBe(5e-3)
    expect(textoDelta('automatico', 0.01, null)).toBe('Una división (1 ms)')
    expect(textoDelta('paso', 1, null)).toBe('Un paso de cálculo')
    expect(textoDelta('paso', 1, null, 2e-5)).toBe('Un paso de cálculo (20 µs)')
    expect(textoDelta('paso', 1, null, 1.5e-6)).toBe('Un paso de cálculo (1.5 µs)')
    expect(textoDelta(2e-3, 1, null)).toBe('2 ms')
  })

  it('el instante por omisión de «Avanzar hasta t» es el siguiente de la serie 1-2-5 sobre el actual, desde 1 ms', () => {
    expect(instantePorOmision(0)).toBe(1e-3)
    expect(instantePorOmision(1.2e-3)).toBe(2e-3)
    expect(instantePorOmision(0.012)).toBe(0.02)
    expect(instantePorOmision(0.02)).toBe(0.05)
    expect(instantePorOmision(3)).toBe(5)
    expect(instantePorOmision(5000)).toBe(1000)
  })

  it('un Δ escrito se lee con unidades del SI y se rechaza fuera de 1 ns a 1000 s', () => {
    expect(leerDelta('10 µs')).toEqual({ valor: 1e-5 })
    expect(leerDelta('2ms')).toEqual({ valor: 2e-3 })
    expect(leerDelta('0.5')).toEqual({ valor: 0.5 })
    expect(leerDelta('3 V')).toEqual({ error: 'Escribe un tiempo con unidades, como «10 µs» o «2 ms».' })
    expect(leerDelta('100u')).toEqual({ valor: 1e-4 })
    expect(leerDelta('5n')).toEqual({ valor: 5e-9 })
    expect(leerDelta('')).toEqual({ error: 'Escribe un tiempo, por ejemplo 2 ms.' })
    expect(leerDelta('abc')).toEqual({ error: 'Escribe un tiempo con unidades, como «10 µs» o «2 ms».' })
    expect(leerDelta('0')).toEqual({ error: 'El intervalo va de 1 ns a 1000 s.' })
    expect(leerDelta('0', 'instante')).toEqual({ error: 'El instante va de 1 ns a 1000 s.' })
    expect(leerDelta('2000')).toEqual({ error: 'El intervalo va de 1 ns a 1000 s.' })
  })
})

describe('la división que usa «Una división»', () => {
  it('detenida, con la franja plegada, ya cuenta la del osciloscopio que se abrirá al simular; abierta en otra pestaña, no', () => {
    expect(divisionDeVista(true, 'osciloscopio', 2e-3)).toBe(2e-3)
    expect(divisionDeVista(false, 'registro', 2e-3)).toBe(2e-3)
    expect(divisionDeVista(true, 'registro', 2e-3)).toBeNull()
    expect(divisionDeVista(false, 'osciloscopio', null)).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import { lecturaMultimetro, rangoSiguiente, textoMultimetro } from './multimetro'

/** Una ventana del motor sin periodos (las doce primeras cifras, sin el tiempo medido: es el intervalo): desde, hasta, ∫v y ∫v². */
const plana = (d: number, prom: number, cuad = prom * prom): number[] => [0, d, prom * d, cuad * d, prom, prom, 0, Number.NaN, Number.NaN, 0, 0, 0]
/** Con `n` periodos de `T` y su promedio y cuadrado medio. */
const periodica = (n: number, T: number, prom: number, cuad: number): number[] => [0, 1, 0, 0, -1, 1, n, 0.01, 0.01 + n * T, prom * n * T, cuad * n * T, 0]

describe('lectura del multímetro', () => {
  it('V DC: el promedio; con periodos, sobre los periodos completos', () => {
    expect(lecturaMultimetro('V DC', plana(0.25, 2.381), plana(0.25, 0), 1e4)).toMatchObject({ valor: 2.381, estado: 'ok', ventana: 0.25 })
    // Un ∫v de toda la ventana que no es de periodos enteros no cuenta si hay periodos.
    const w = periodica(250, 1e-3, 6, 72)
    w[2] = 999
    expect(lecturaMultimetro('V DC', w, plana(1, 0), 1e4).valor).toBeCloseTo(6, 12)
  })

  it('V AC: el eficaz de la componente alterna y la frecuencia', () => {
    // 1 V de continua y 1 V de pico: cuadrado medio 1 + 1/2.
    const l = lecturaMultimetro('V AC', periodica(50, 1e-3, 1, 1.5), plana(1, 0), 1e4)
    expect(l.valor).toBeCloseTo(Math.SQRT1_2, 12)
    expect(l.frecuencia).toBeCloseTo(1000, 9)
  })

  it('sin periodos, el promedio divide por el tiempo medido sin X ni Z (la cifra 13 de la ventana)', () => {
    // 1 s de ventana con 0.5 s en X: ∫v = 2.5 V·s sobre 0.5 s medidos son 5 V, no 2.5 V.
    const w = [...plana(1, 2.5), 0.5]
    expect(lecturaMultimetro('V DC', w, plana(1, 0), 1e4).valor).toBeCloseTo(5, 12)
  })

  it('A DC lee la sonda de corriente', () => {
    expect(lecturaMultimetro('A DC', plana(0.25, 0), plana(0.25, 0.495), 1e4).valor).toBeCloseTo(0.495, 12)
  })

  it('Ω: R = Rrango V/(1 − V), OL arriba de 40 MΩ y «hay voltaje» fuera de lo que da la prueba', () => {
    expect(lecturaMultimetro('Ω', plana(0.25, 0.3197279), plana(0.25, 0), 1e4).valor).toBeCloseTo(4700, 0)
    expect(lecturaMultimetro('Ω', plana(0.25, 1), plana(0.25, 0), 1e7)).toMatchObject({ estado: 'OL' })
    expect(lecturaMultimetro('Ω', plana(0.25, 0.9), plana(0.25, 0), 1e7)).toMatchObject({ estado: 'OL' })
    expect(lecturaMultimetro('Ω', plana(0.25, 5), plana(0.25, 0), 1e4)).toMatchObject({ estado: 'voltaje' })
    expect(lecturaMultimetro('Continuidad', plana(0.25, 1 / 6), plana(0.25, 0), 1e4).valor).toBeCloseTo(20, 9)
  })

  it('sin tiempo medido no hay lectura', () => {
    expect(lecturaMultimetro('V DC', plana(0, 0), plana(0, 0), 1e4)).toMatchObject({ estado: 'sin-medida' })
  })

  it('el rango automático sube o baja una década fuera de 9 % a 91 %', () => {
    expect(rangoSiguiente(1e4, plana(0.25, 0.95))).toBe(1e5)
    expect(rangoSiguiente(1e4, plana(0.25, 0.05))).toBe(1e3)
    expect(rangoSiguiente(1e4, plana(0.25, 0.5))).toBe(1e4)
    expect(rangoSiguiente(100, plana(0.25, 0.01))).toBe(100)
    expect(rangoSiguiente(1e7, plana(0.25, 0.99))).toBe(1e7)
  })

  it('la cifra con cuatro significativas y su unidad', () => {
    expect(textoMultimetro('V DC', { valor: 2.3809524, frecuencia: Number.NaN, estado: 'ok', ventana: 0.25, periodos: 0 })).toBe('2.381 V')
    expect(textoMultimetro('A AC', { valor: 0.0123456, frecuencia: 1000, estado: 'ok', ventana: 0.25, periodos: 250 })).toBe('12.35 mA')
    expect(textoMultimetro('Ω', { valor: Number.POSITIVE_INFINITY, frecuencia: Number.NaN, estado: 'OL', ventana: 0.25, periodos: 0 })).toBe('OL')
    expect(textoMultimetro('Continuidad', { valor: 20, frecuencia: Number.NaN, estado: 'ok', ventana: 0.25, periodos: 0 })).toBe('20.00 Ω · hay paso')
    expect(textoMultimetro('Ω', { valor: Number.NaN, frecuencia: Number.NaN, estado: 'voltaje', ventana: 0.25, periodos: 0 })).toBe('Apaga las fuentes para medir resistencia')
    expect(textoMultimetro('Continuidad', { valor: Number.NaN, frecuencia: Number.NaN, estado: 'voltaje', ventana: 0.25, periodos: 0 })).toBe('Apaga las fuentes para medir continuidad')
  })
})

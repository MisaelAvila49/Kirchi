import { describe, expect, it } from 'vitest'
import { acotar, aPixel, deltaCursores, desplazar, deValor, indiceCursorCercano, interpolar, zoomCaja, zoomEn } from './vista'

describe('de valor a píxel y de vuelta', () => {
  it('lineal', () => {
    expect(aPixel(5, { min: 0, max: 10 }, 'lin', 100, 300)).toBe(200)
    expect(deValor(200, { min: 0, max: 10 }, 'lin', 100, 300)).toBe(5)
  })
  it('logarítmico: una década ocupa lo mismo en cualquier lugar', () => {
    const d = { min: 1, max: 1000 }
    expect(aPixel(10, d, 'log', 0, 300)).toBeCloseTo(100, 9)
    expect(aPixel(100, d, 'log', 0, 300)).toBeCloseTo(200, 9)
    expect(deValor(200, d, 'log', 0, 300)).toBeCloseTo(100, 9)
  })
  it('un eje invertido (el vertical) va de abajo arriba', () => {
    expect(aPixel(0, { min: 0, max: 10 }, 'lin', 300, 100)).toBe(300)
    expect(aPixel(10, { min: 0, max: 10 }, 'lin', 300, 100)).toBe(100)
  })
})

describe('zoom', () => {
  it('con la rueda acerca alrededor del punto sin moverlo', () => {
    const d = zoomEn({ min: 0, max: 100 }, 'lin', 0.25, 0.5)
    expect(d.max - d.min).toBeCloseTo(50, 9)
    // El valor bajo el puntero (25) sigue a un cuarto del ancho.
    expect((25 - d.min) / (d.max - d.min)).toBeCloseTo(0.25, 9)
  })
  it('alejar con factor mayor que 1', () => {
    const d = zoomEn({ min: 40, max: 60 }, 'lin', 0.5, 2)
    expect(d).toEqual({ min: 30, max: 70 })
  })
  it('en logarítmico acerca en la razón, no en la resta', () => {
    const d = zoomEn({ min: 1, max: 10000 }, 'log', 0.5, 0.5)
    expect(d.min).toBeCloseTo(10, 6)
    expect(d.max).toBeCloseTo(1000, 6)
  })
  it('una caja arrastrada fija la nueva ventana', () => {
    expect(zoomCaja({ min: 0, max: 100 }, 'lin', 0.2, 0.6)).toEqual({ min: 20, max: 60 })
    const l = zoomCaja({ min: 1, max: 1000 }, 'log', 1 / 3, 2 / 3)
    expect(l.min).toBeCloseTo(10, 6)
    expect(l.max).toBeCloseTo(100, 6)
    // Al revés da lo mismo.
    expect(zoomCaja({ min: 0, max: 100 }, 'lin', 0.6, 0.2)).toEqual({ min: 20, max: 60 })
  })
  it('no se acerca más de un ancho mínimo ni se sale de los datos', () => {
    const limite = { min: 0, max: 10 }
    expect(acotar({ min: -5, max: 4 }, limite, 'lin')).toEqual({ min: 0, max: 9 })
    expect(acotar({ min: 8, max: 12 }, limite, 'lin')).toEqual({ min: 6, max: 10 })
    const m = acotar({ min: 5, max: 5 + 1e-15 }, limite, 'lin')
    expect(m.max - m.min).toBeGreaterThan(1e-9)
    // Más ancho que los datos: se queda en los datos.
    expect(acotar({ min: -100, max: 100 }, limite, 'lin')).toEqual(limite)
  })
  it('desplazar mueve la ventana una fracción de su ancho', () => {
    expect(desplazar({ min: 0, max: 10 }, 'lin', 0.1)).toEqual({ min: 1, max: 11 })
    const l = desplazar({ min: 1, max: 100 }, 'log', 0.5)
    expect(l.min).toBeCloseTo(10, 6)
    expect(l.max).toBeCloseTo(1000, 6)
  })
})

describe('cursores', () => {
  it('la diferencia es el valor absoluto y, en log, también la razón', () => {
    expect(deltaCursores([2, 5], 'lin')).toEqual({ dx: 3, razon: null })
    const l = deltaCursores([100, 1000], 'log')
    expect(l.dx).toBe(900)
    expect(l.razon).toBeCloseTo(10, 9)
    expect(deltaCursores([5, 2], 'lin').dx).toBe(3)
  })
  it('toma el cursor más cercano dentro del radio, o ninguno', () => {
    const d = { min: 0, max: 10 }
    // 0..10 en 0..1000 px: el cursor en 2 está en 200 px y el de 8 en 800.
    expect(indiceCursorCercano([2, 8], 205, d, 'lin', 0, 1000, 8)).toBe(0)
    expect(indiceCursorCercano([2, 8], 795, d, 'lin', 0, 1000, 8)).toBe(1)
    expect(indiceCursorCercano([2, 8], 500, d, 'lin', 0, 1000, 8)).toBeNull()
  })
  it('interpola entre dos puntos y no extrapola', () => {
    const x = Float64Array.from([0, 1, 2, 4])
    const y = Float64Array.from([0, 10, 20, 40])
    expect(interpolar(x, y, 0.5, 'lin')).toBe(5)
    expect(interpolar(x, y, 3, 'lin')).toBe(30)
    expect(Number.isNaN(interpolar(x, y, 5, 'lin'))).toBe(true)
    expect(Number.isNaN(interpolar(x, y, -1, 'lin'))).toBe(true)
  })
  it('con x decreciente (barrido de hasta a desde) también interpola', () => {
    const x = Float64Array.from([4, 2, 1, 0])
    const y = Float64Array.from([40, 20, 10, 0])
    expect(interpolar(x, y, 3, 'lin')).toBe(30)
    expect(interpolar(x, y, 0.5, 'lin')).toBe(5)
    expect(interpolar(x, y, 0, 'lin')).toBe(0)
    expect(interpolar(x, y, 4, 'lin')).toBe(40)
    expect(Number.isNaN(interpolar(x, y, 5, 'lin'))).toBe(true)
  })
  it('en un eje logarítmico interpola en el logaritmo de x (una recta en la gráfica)', () => {
    const x = Float64Array.from([1, 100])
    const y = Float64Array.from([0, -40])
    expect(interpolar(x, y, 10, 'log')).toBeCloseTo(-20, 9)
  })
})

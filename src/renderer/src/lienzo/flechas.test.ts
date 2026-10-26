import { describe, expect, it } from 'vitest'
import type { Tramo } from '../conexiones/corrientes'
import { DOBLE, FasesDeFlechas, FLECHA, flechasVisibles, FLOTANTES_FLECHA, globoDeCorriente, instanciasDeFlechas, MM_POR_UNIDAD, SEPARACION_FLECHAS, SIN_FLECHA, tipoDeTramo, velocidadFlecha } from './flechas'

const mm = (i: number, v = 1, f = 1) => velocidadFlecha(i, v, f) * MM_POR_UNIDAD

describe('flechas de la corriente', () => {
  it('a 1× avanzan 2 mm/s con 1 µA y 4 mm/s más por década, con un tope de 30 mm/s', () => {
    expect(mm(1e-6)).toBeCloseTo(2, 9)
    expect(mm(1e-3)).toBeCloseTo(14, 9)
    expect(mm(20e-3)).toBeCloseTo(19.2, 1)
    expect(mm(1)).toBeCloseTo(26, 9)
    expect(mm(100)).toBe(30)
    expect(mm(5e-7)).toBe(0)
    expect(mm(-1e-3)).toBeCloseTo(-14, 9)
  })

  it('en cámara lenta se frenan con el tiempo, por encima de 1× van como a 1×, y el factor de Configuración las multiplica', () => {
    expect(mm(1e-3, 0.01)).toBeCloseTo(0.14, 9)
    expect(mm(1e-3, 10)).toBeCloseTo(14, 9)
    expect(mm(1e-3, Number.POSITIVE_INFINITY)).toBeCloseTo(14, 9)
    expect(mm(1e-3, 1, 0.25)).toBeCloseTo(3.5, 9)
  })

  it('un tramo cuya media es menor que la cuarta parte de su media absoluta alterna: puntas dobles quietas', () => {
    // 50 Hz a 1× leída a 10 Hz: la media de cinco ciclos es casi cero.
    expect(tipoDeTramo(1e-5, 6.4e-3)).toBe(DOBLE)
    // A 0.01× el intervalo es un pedazo de medio ciclo: la media lleva el signo de la corriente.
    expect(tipoDeTramo(-9.5e-3, 9.6e-3)).toBe(FLECHA)
    expect(tipoDeTramo(2e-3, 2e-3)).toBe(FLECHA)
    expect(tipoDeTramo(1e-7, 1e-7)).toBe(SIN_FLECHA)
  })

  it('las puntas desaparecen cuando su separación en pantalla baja de 8 px', () => {
    expect(SEPARACION_FLECHAS).toBe(4)
    expect(flechasVisibles(2)).toBe(true)
    expect(flechasVisibles(1.99)).toBe(false)
  })

  it('la fase se acumula con la velocidad anterior al llegar una lectura: una punta nunca retrocede', () => {
    const f = new FasesDeFlechas(1)
    f.actualizar([2], 0, false)
    const antes = f.fase(0, 100, false)
    expect(antes).toBeCloseTo(0.2, 12)
    // Llega una lectura con la mitad de la velocidad: la punta sigue desde donde iba.
    f.actualizar([1], 100, false)
    expect(f.fase(0, 100, false)).toBeCloseTo(antes, 12)
    expect(f.fase(0, 200, false)).toBeCloseTo(0.3, 12)
    // En pausa de las animaciones no se mueve.
    f.actualizar([1], 200, true)
    expect(f.fase(0, 900, true)).toBeCloseTo(f.fase(0, 200, true), 12)
  })

  it('las instancias llevan el largo acumulado de su cable, la fase y la velocidad, y omiten los tramos sin corriente', () => {
    const tramo = (cable: string, x0: number, x1: number): Tramo => ({ cable, segmento: 0, x0, y0: 0, x1, y1: 0, largo: Math.abs(x1 - x0), red: 1 })
    const tramos = [tramo('a', 0, 6), tramo('a', 6, 10), tramo('b', 20, 30), tramo('c', 40, 50)]
    const fases = new FasesDeFlechas(tramos.length)
    const r = instanciasDeFlechas(tramos, [1e-3, 1e-3, 0, 1e-5], [1e-3, 1e-3, 0, 1e-3], 1, 1, fases, 0, false)
    expect(r.cuenta).toBe(3)
    const fila = (k: number) => Array.from(r.datos.subarray(k * FLOTANTES_FLECHA, (k + 1) * FLOTANTES_FLECHA))
    expect(fila(0)[4]).toBe(0)
    // El segundo tramo de «a» sigue los 6 de largo del primero (módulo la separación).
    expect(fila(1)[4]).toBeCloseTo(6 % SEPARACION_FLECHAS, 6)
    expect(fila(1)[6]).toBeCloseTo(14 / MM_POR_UNIDAD, 5)
    expect(fila(2)[7]).toBe(DOBLE)
    expect(fila(2)[6]).toBe(0)
  })

  it('el globo del cable dice su corriente media y, si alterna, que se baje la velocidad', () => {
    const f = (a: number) => `${(a * 1000).toFixed(2)} mA`
    expect(globoDeCorriente(-2.5e-3, 2.5e-3, f)).toBe('Corriente media 2.50 mA.')
    expect(globoDeCorriente(1e-5, 6.4e-3, f)).toBe('Corriente alterna, 6.40 mA de media en valor absoluto: baja la velocidad para verla cambiar de sentido.')
    expect(globoDeCorriente(0, 0, f)).toBeNull()
  })
})

describe('las flechas que se mueven', () => {
  const tramo = (x0: number, x1: number): Tramo => ({ cable: `c${x0}`, segmento: 0, x0, y0: 0, x1, y1: 0, largo: Math.abs(x1 - x0), red: 0 }) as Tramo
  it('cuentan solo las que avanzan, con la caja donde están; en pausa ninguna', () => {
    const tramos = [tramo(0, 10), tramo(100, 110)]
    // Una con corriente continua y otra alterna (puntas dobles quietas).
    const r = instanciasDeFlechas(tramos, [1e-3, 0], [1e-3, 1e-3], 1, 1, new FasesDeFlechas(2), 0, false)
    expect(r.cuenta).toBe(2)
    expect(r.moviles).toBe(1)
    expect(r.caja).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 0 })
    expect(instanciasDeFlechas(tramos, [1e-3, 0], [1e-3, 1e-3], 1, 1, new FasesDeFlechas(2), 0, true).moviles).toBe(0)
  })

  it('una media que no es un número no deja una fase rota', () => {
    const f = new FasesDeFlechas(1)
    instanciasDeFlechas([tramo(0, 10)], [Number.NaN], [1e-3], 1, 1, f, 0, false)
    instanciasDeFlechas([tramo(0, 10)], [1e-3], [1e-3], 1, 1, f, 100, false)
    expect(Number.isFinite(f.fases[0])).toBe(true)
  })
})

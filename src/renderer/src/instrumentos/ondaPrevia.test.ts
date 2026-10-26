import { describe, expect, it } from 'vitest'
import { FORMAS, type AjustesGenerador } from './ajustes'
import { extrasDeForma, GEOMETRIA_PREVIA, marcasDeTiempo, nombreDeForma, resumenExtras, trazoIcono, usaFrecuencia, valorOnda, vistaPrevia } from './ondaPrevia'

const base: AjustesGenerador = { forma: 'Pulso', frecuencia: 1000, vpp: 2, desplazamiento: 1, simetria: 0.5, ciclo: 0.25, desfase: 0, retardo: 0.001, pasos: 4, salida: true, ideal: false }
const par = (forma: AjustesGenerador['forma'], x: Partial<{ simetria: number; ciclo: number; desfase: number; pasos: number }> = {}) => ({ forma, simetria: 0.5, ciclo: 0.25, desfase: 0, pasos: 4, ...x })

describe('qué usa cada forma', () => {
  it('muestra solo los ajustes que la forma lee', () => {
    expect(extrasDeForma('Senoidal')).toEqual(['fase'])
    expect(extrasDeForma('Triangular')).toEqual(['simetria', 'fase'])
    expect(extrasDeForma('Pulso')).toEqual(['ciclo', 'fase'])
    expect(extrasDeForma('Escalón')).toEqual(['retardo'])
    expect(extrasDeForma('Escalera')).toEqual(['pasos', 'fase'])
    expect(resumenExtras('Pulso')).toBe('ciclo, fase')
  })
  it('el escalón no tiene frecuencia y las demás sí', () => {
    expect(FORMAS.filter((f) => !usaFrecuencia(f))).toEqual(['Escalón'])
  })
})

describe('la onda normalizada', () => {
  it('la senoidal llega a ±1 y el pulso respeta su ciclo', () => {
    expect(valorOnda(par('Senoidal'), 0.25)).toBeCloseTo(1, 9)
    expect(valorOnda(par('Senoidal'), 0.75)).toBeCloseTo(-1, 9)
    expect(valorOnda(par('Pulso'), 0.2)).toBe(1)
    expect(valorOnda(par('Pulso'), 0.3)).toBe(-1)
    expect(valorOnda(par('Pulso', { ciclo: 0.5 }), 0.4)).toBe(1)
  })
  it('el desfase corre la onda', () => {
    expect(valorOnda(par('Senoidal', { desfase: 90 }), 0)).toBeCloseTo(1, 9)
  })
  it('la escalera tiene tantos niveles como pasos', () => {
    const niveles = new Set<number>()
    for (let i = 0; i < 100; i++) niveles.add(valorOnda(par('Escalera', { pasos: 8 }), i / 100))
    expect(niveles.size).toBe(8)
  })
})

describe('los trazos', () => {
  it('cada forma tiene un icono distinto', () => {
    expect(new Set(FORMAS.map(trazoIcono)).size).toBe(FORMAS.length)
  })
  it('la vista previa dice los extremos y deja 0 V dentro del dibujo', () => {
    const v = vistaPrevia(base)
    expect(v.minimo).toBe(0)
    expect(v.maximo).toBe(2)
    expect(v.yMax).toBeLessThan(v.yCero)
    expect(v.yCero).toBeLessThanOrEqual(v.yMin)
    expect(v.trazo.startsWith('M')).toBe(true)
  })
  it('con un mínimo negativo, 0 V queda entre el máximo y el mínimo', () => {
    const v = vistaPrevia({ ...base, forma: 'Senoidal', vpp: 4, desplazamiento: 0 })
    expect(v.yMax).toBeLessThan(v.yCero)
    expect(v.yCero).toBeLessThan(v.yMin)
  })
})

describe('las marcas de tiempo de la vista previa', () => {
  it('a 1 kHz y dos periodos rotula 0, T/2, T, 3T/2 y 2T en unidades reales', () => {
    const m = marcasDeTiempo({ ...base, forma: 'Senoidal', frecuencia: 1000 })
    expect(m.map((t) => t.texto)).toEqual(['0', '500 µs', '1 ms', '1.5 ms', '2 ms'])
    const g = GEOMETRIA_PREVIA
    expect(m[0].x).toBe(g.mx)
    expect(m[4].x).toBe(g.ancho - g.mx)
    expect(m[2].x).toBe(g.ancho / 2)
  })
  it('sigue la frecuencia: 50 Hz da 10 ms por periodo', () => {
    const m = marcasDeTiempo({ ...base, forma: 'Cuadrada', frecuencia: 50 })
    expect(m.map((t) => t.texto)).toEqual(['0', '10 ms', '20 ms', '30 ms', '40 ms'])
  })
  it('el escalón no es periódico y no lleva eje de tiempo', () => {
    expect(marcasDeTiempo({ ...base, forma: 'Escalón' })).toEqual([])
  })
})

describe('nombres de las formas en la interfaz', () => {
  it('«Diente de sierra» se ve como «Rampa» y las demás conservan su nombre; ninguna se repite', () => {
    expect(nombreDeForma('Diente de sierra')).toBe('Rampa')
    const nombres = FORMAS.map(nombreDeForma)
    expect(nombres).toEqual(['Senoidal', 'Cuadrada', 'Triangular', 'Rampa', 'Pulso', 'Escalón', 'Escalera'])
    expect(new Set(nombres).size).toBe(FORMAS.length)
  })
  it('lo propio de cada forma: el ciclo de trabajo es del pulso, el retardo del escalón y los pasos de la escalera', () => {
    expect(extrasDeForma('Pulso')).toContain('ciclo')
    expect(extrasDeForma('Escalón')).toEqual(['retardo'])
    expect(extrasDeForma('Escalera')).toContain('pasos')
    expect(extrasDeForma('Cuadrada')).not.toContain('ciclo')
  })
})

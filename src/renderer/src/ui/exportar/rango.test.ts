import { describe, expect, it } from 'vitest'
import { deFraccion, aFraccion, escribirNumero, extremoMovido, leerNumero, rangoEfectivo, textoDeExtremo, tramoDeCampo, TRAMO_MINIMO } from './rango'

const total = { min: -0.001, max: 0.009 }

describe('recorte del eje al exportar', () => {
  it('un rango que cubre todo el eje, invertido o vacío no recorta; uno interior se acota', () => {
    expect(rangoEfectivo(null, total)).toBeNull()
    expect(rangoEfectivo({ desde: -1, hasta: 1 }, total)).toBeNull()
    expect(rangoEfectivo({ desde: 0.002, hasta: 0.002 }, total)).toBeNull()
    expect(rangoEfectivo({ desde: Number.NaN, hasta: 1 }, total)).toBeNull()
    expect(rangoEfectivo({ desde: 0.004, hasta: 0.002 }, total)).toEqual({ min: 0.002, max: 0.004 })
    expect(rangoEfectivo({ desde: -1, hasta: 0.003 }, total)).toEqual({ min: -0.001, max: 0.003 })
  })
  it('los campos leen punto o coma y menos tipográfico, y escriben pocas cifras', () => {
    expect(leerNumero('1,5')).toBe(1.5)
    expect(leerNumero(' −2.5e-3 ')).toBe(-0.0025)
    expect(leerNumero('')).toBeNull()
    expect(leerNumero('abc')).toBeNull()
    expect(escribirNumero(0.0012345678)).toBe('0.00123457')
    expect(escribirNumero(-3)).toBe('−3')
  })
})

describe('deslizador de dos asas del tramo', () => {
  const total = { min: 0, max: 10 }

  it('pasa del valor a la fracción del deslizador y de vuelta, en eje lineal y logarítmico', () => {
    expect(aFraccion(2.5, total, 'lin')).toBeCloseTo(0.25, 12)
    expect(deFraccion(0.25, total, 'lin')).toBeCloseTo(2.5, 12)
    const dom = { min: 10, max: 1e6 }
    expect(aFraccion(1000, dom, 'log')).toBeCloseTo(0.4, 12)
    expect(deFraccion(0.4, dom, 'log')).toBeCloseTo(1000, 6)
    expect(aFraccion(-5, total, 'lin')).toBe(0)
    expect(aFraccion(99, total, 'lin')).toBe(1)
  })

  it('el tramo admite cualquier ancho: una asa llega a una milésima del eje de la otra', () => {
    const r = extremoMovido(total, 'lin', { min: 3, max: 7 }, 0, 0.6999)
    expect(7 - r.desde).toBeLessThan(10 * 0.005)
    expect(rangoEfectivo(r, total)).not.toBeNull()
    const f = extremoMovido(total, 'lin', { min: 3, max: 7 }, 1, 0.3001)
    expect(f.hasta - 3).toBeLessThan(10 * 0.005)
  })

  it('mover una asa cambia solo su lado, no pasa de la otra ni sale del eje', () => {
    expect(extremoMovido(total, 'lin', total, 0, 0.3)).toEqual({ desde: 3, hasta: 10 })
    expect(extremoMovido(total, 'lin', { min: 3, max: 10 }, 1, 0.7)).toEqual({ desde: 3, hasta: 7 })
    const dentro = extremoMovido(total, 'lin', { min: 3, max: 7 }, 0, 0.9)
    expect(dentro.hasta).toBe(7)
    expect(dentro.desde).toBeCloseTo(7 - 10 * TRAMO_MINIMO, 9)
    const otra = extremoMovido(total, 'lin', { min: 3, max: 7 }, 1, 0.1)
    expect(otra.desde).toBe(3)
    expect(otra.hasta).toBeCloseTo(3 + 10 * TRAMO_MINIMO, 9)
    expect(extremoMovido(total, 'lin', total, 0, -1)).toEqual({ desde: 0, hasta: 10 })
    expect(extremoMovido(total, 'lin', total, 1, 2)).toEqual({ desde: 0, hasta: 10 })
  })

  it('en un eje logarítmico la separación mínima se cuenta en décadas', () => {
    const dom = { min: 10, max: 1e6 }
    const r = extremoMovido(dom, 'log', { min: 100, max: 1e5 }, 0, 0.99)
    expect(r.hasta).toBe(1e5)
    expect(r.desde).toBeLessThan(1e5)
    expect(aFraccion(r.desde, dom, 'log')).toBeCloseTo(aFraccion(1e5, dom, 'log') - TRAMO_MINIMO, 9)
  })

  it('llevar las dos asas a los extremos deja de recortar', () => {
    expect(rangoEfectivo({ desde: 0, hasta: 10 }, total)).toBeNull()
  })
})

describe('campos Desde y Hasta con unidad', () => {
  const total = { min: 0, max: 0.01 }
  const completo = { min: 0, max: 0.01 }
  it('escriben el extremo con el prefijo de la unidad del eje', () => {
    expect(textoDeExtremo(0.0025, 's')).toBe('2.5m')
    expect(textoDeExtremo(1500, 'Hz')).toBe('1.5k')
    expect(textoDeExtremo(0.5, '°')).toBe('0.5')
  })
  it('leen lo escrito, con prefijo o sin él, y avisan si no se lee', () => {
    const t = tramoDeCampo('2.5m', 0, 's', 0, total, 'lin', completo)
    expect('rango' in t && t.rango.desde).toBeCloseTo(0.0025, 12)
    const u = tramoDeCampo('4000 µs', 1, 's', 0, total, 'lin', completo)
    expect('rango' in u && u.rango.hasta).toBeCloseTo(0.004, 12)
    expect(tramoDeCampo('abc', 0, 's', 0, total, 'lin', completo)).toHaveProperty('error')
  })
  it('acota a lo capturado y mantiene Desde antes de Hasta', () => {
    const a = tramoDeCampo('-5', 0, 's', 0, total, 'lin', completo)
    expect('rango' in a && a.rango.desde).toBe(0)
    const b = tramoDeCampo('1', 1, 's', 0, total, 'lin', completo)
    expect('rango' in b && b.rango.hasta).toBe(0.01)
    const c = tramoDeCampo('9m', 0, 's', 0, total, 'lin', { min: 0, max: 0.005 })
    expect('rango' in c && c.rango.desde).toBeLessThan(0.005)
    expect('rango' in c && c.rango.hasta).toBe(0.005)
  })
  it('cuenta desde el origen de lo capturado', () => {
    const t = tramoDeCampo('1m', 0, 's', -0.001, { min: -0.001, max: 0.009 }, 'lin', { min: -0.001, max: 0.009 })
    expect('rango' in t && t.rango.desde).toBeCloseTo(0, 12)
  })
  it('es de ida y vuelta con el deslizador', () => {
    const r = extremoMovido(total, 'lin', completo, 0, 0.25)
    const texto = textoDeExtremo(r.desde, 's')
    const t = tramoDeCampo(texto, 0, 's', 0, total, 'lin', completo)
    expect('rango' in t && t.rango.desde).toBeCloseTo(r.desde, 9)
  })
})

describe('valores del tramo con los decimales del eje', () => {
  it('con 2 decimales el campo lleva dos, con auto los necesarios y el cero se queda en 0', () => {
    expect(textoDeExtremo(9.6024106, 's', 2)).toBe('9.60')
    expect(textoDeExtremo(0.0025, 's', 2)).toBe('2.50m')
    expect(textoDeExtremo(9.6024106, 's', 'auto')).toBe('9.6024106')
    expect(textoDeExtremo(0, 's', 2)).toBe(textoDeExtremo(0, 's'))
    expect(textoDeExtremo(1.234, '°', 1)).toBe('1.2')
  })
})

import { describe, expect, it } from 'vitest'
import { marcasLineales, marcasLog, pasoBonito, subdivisionesLineales, subdivisionesLog, textoMarca } from './ticks'

describe('paso bonito', () => {
  it('redondea a 1, 2 o 5 por una potencia de diez', () => {
    expect(pasoBonito(0.8)).toBe(1)
    expect(pasoBonito(1.5)).toBe(2)
    expect(pasoBonito(3.2)).toBe(5)
    expect(pasoBonito(7)).toBe(10)
    expect(pasoBonito(0.0013)).toBeCloseTo(0.002, 12)
  })
})

describe('marcas lineales', () => {
  it('de 0 a 10 con unas seis marcas da pasos de 2', () => {
    expect(marcasLineales(0, 10, 6)).toEqual([0, 2, 4, 6, 8, 10])
  })
  it('de 0 a 1 da décimas sin ruido de coma flotante', () => {
    expect(marcasLineales(0, 1, 5)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1])
    const m = marcasLineales(0, 0.3, 6)
    expect(m).toEqual([0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3])
  })
  it('con límites negativos incluye el cero y no se sale del intervalo', () => {
    const m = marcasLineales(-2.3, 4.1, 6)
    expect(m).toContain(0)
    expect(Math.min(...m)).toBeGreaterThanOrEqual(-2.3)
    expect(Math.max(...m)).toBeLessThanOrEqual(4.1)
  })
  it('un intervalo vacío o inválido da una sola marca o ninguna', () => {
    expect(marcasLineales(3, 3, 5)).toEqual([3])
    expect(marcasLineales(Number.NaN, 3, 5)).toEqual([])
    expect(marcasLineales(5, 1, 5)).toEqual([])
  })
})

describe('marcas logarítmicas', () => {
  it('de 1 a 1000 las mayores son las décadas', () => {
    const m = marcasLog(1, 1000)
    expect(m.filter((x) => x.mayor).map((x) => x.valor)).toEqual([1, 10, 100, 1000])
  })
  it('las menores son 2 a 9 de cada década dentro del intervalo', () => {
    const m = marcasLog(1.5, 40)
    expect(m.map((x) => x.valor)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 30, 40])
    expect(m.find((x) => x.valor === 10)?.mayor).toBe(true)
    expect(m.find((x) => x.valor === 30)?.mayor).toBe(false)
  })
  it('con muchas décadas solo salen las mayores', () => {
    const m = marcasLog(1, 1e8)
    expect(m.every((x) => x.mayor)).toBe(true)
    expect(m).toHaveLength(9)
  })
  it('un límite no positivo no tiene escala logarítmica', () => {
    expect(marcasLog(0, 10)).toEqual([])
    expect(marcasLog(-1, 10)).toEqual([])
  })
  it('no se queda sin rótulos en una sola década', () => {
    const m = marcasLog(2, 8)
    expect(m.filter((x) => x.etiquetar).length).toBeGreaterThanOrEqual(2)
  })
  it('rotula las marcas 2 y 5 en cualquier década, también por debajo de 1', () => {
    for (const e of [-9, -6, -3, -2, -1, 0, 1, 3, 6]) {
      const k = 10 ** e
      const m = marcasLog(1.5 * k, 9.5 * k)
      const rotuladas = m.filter((x) => x.etiquetar).map((x) => Math.round(x.valor / k))
      expect(rotuladas, `década 1e${e}`).toEqual([2, 5])
    }
  })
})

describe('texto de una marca', () => {
  it('usa el prefijo SI del valor y el menos tipográfico', () => {
    expect(textoMarca(0, 'Hz')).toBe('0')
    expect(textoMarca(1000, 'Hz')).toBe('1 kHz')
    expect(textoMarca(0.0005, 's')).toBe('500 µs')
    expect(textoMarca(-0.25, 'V')).toBe('−250 mV')
    expect(textoMarca(1.5e6, 'Hz')).toBe('1.5 MHz')
  })
  it('sin unidad escribe solo el número con prefijo', () => {
    expect(textoMarca(-20, '')).toBe('−20')
    expect(textoMarca(2500, '')).toBe('2.5 k')
  })
})

describe('subdivisiones entre las marcas con número', () => {
  it('lineales: n partes iguales entre cada par de marcas, sin repetir las marcas', () => {
    expect(subdivisionesLineales([0, 1, 2], 4)).toEqual([0.25, 0.5, 0.75, 1.25, 1.5, 1.75])
    expect(subdivisionesLineales([0, 10, 20], 5)).toEqual([2, 4, 6, 8, 12, 14, 16, 18])
    expect(subdivisionesLineales([-1, 0], 2)).toEqual([-0.5])
  })
  it('lineales: con los extremos del eje cubren también antes de la primera marca y después de la última', () => {
    expect(subdivisionesLineales([-30, -20, -10, 0], 2, -45, 5)).toEqual([-25, -15, -5, -35, -40, -45, 5])
    // Toda el área tiene menores: entre cualquier par de marcas menores o con número hay a lo más un paso.
    const marcas = marcasLineales(-47, 83, 6)
    const todas = [...marcas, ...subdivisionesLineales(marcas, 5, -47, 83)].sort((a, b) => a - b)
    const paso = (marcas[1] - marcas[0]) / 5
    expect(todas[0] - -47).toBeLessThan(paso + 1e-9)
    expect(83 - todas[todas.length - 1]).toBeLessThan(paso + 1e-9)
    for (let i = 1; i < todas.length; i++) expect(todas[i] - todas[i - 1]).toBeCloseTo(paso, 9)
  })
  it('lineales: sin extremos solo llena entre las marcas (como antes)', () => {
    expect(subdivisionesLineales([0, 10], 5)).toEqual([2, 4, 6, 8])
  })
  it('lineales: 1 o menos, una sola marca o valores no válidos no dan nada', () => {
    expect(subdivisionesLineales([0, 1, 2], 1)).toEqual([])
    expect(subdivisionesLineales([3], 4)).toEqual([])
    expect(subdivisionesLineales([], 4)).toEqual([])
    expect(subdivisionesLineales([0, 1], 0)).toEqual([])
    expect(subdivisionesLineales([0, Number.NaN, 2], 2)).toEqual([])
  })
  it('lineales: no acumula ruido de coma flotante', () => {
    expect(subdivisionesLineales([0, 0.3], 3)).toEqual([0.1, 0.2])
  })
  it('logarítmicas: 2 a 9 de cada década dentro del intervalo, sin las décadas', () => {
    expect(subdivisionesLog(10, 1000)).toEqual([20, 30, 40, 50, 60, 70, 80, 90, 200, 300, 400, 500, 600, 700, 800, 900])
  })
  it('logarítmicas: recorta las décadas de los extremos y sirve con muchas décadas', () => {
    expect(subdivisionesLog(35, 250)).toEqual([40, 50, 60, 70, 80, 90, 200])
    expect(subdivisionesLog(1, 1e9).length).toBe(8 * 9)
    expect(subdivisionesLog(0.01, 0.1)).toEqual([0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08, 0.09])
  })
  it('logarítmicas: un intervalo no válido no da nada', () => {
    expect(subdivisionesLog(0, 10)).toEqual([])
    expect(subdivisionesLog(10, 1)).toEqual([])
  })
})

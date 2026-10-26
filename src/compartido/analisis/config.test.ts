import { describe, expect, it } from 'vitest'
import { validarAnalisis, validarConfig, valoresDeParametro } from './config'

const ok = (x: unknown) => {
  const r = validarConfig(x)
  if (!r.ok) throw new Error(r.error)
  return r.valor
}
const error = (x: unknown): string => {
  const r = validarConfig(x)
  if (r.ok) throw new Error('debia fallar')
  return r.error
}

describe('configuracion de los analisis', () => {
  it('acepta los cinco analisis validos', () => {
    expect(ok({ tipo: 'op' })).toEqual({ tipo: 'op' })
    expect(ok({ tipo: 'dc', fuente: 'v1', desde: 0, hasta: 5, paso: 0.1, segunda: { fuente: 'v2', desde: 0, hasta: 1, paso: 0.5 } }).tipo).toBe('dc')
    expect(ok({ tipo: 'ac', barrido: 'oct', puntos: 5, desde: 1, hasta: 1e6, fuente: 'v1', magnitud: 2 }).tipo).toBe('ac')
    expect(ok({ tipo: 'tran', fin: 1e-3, maximo: 1e-6, inicio: 5e-4, uic: true })).toEqual({ tipo: 'tran', fin: 1e-3, maximo: 1e-6, inicio: 5e-4, uic: true })
    expect(ok({ tipo: 'fourier', fundamental: 1e3, armonicos: 9, periodos: 2 })).toMatchObject({ descarte: 0, ventana: 'rectangular' })
  })
  it('rechaza con mensajes claros', () => {
    expect(error({ tipo: 'nada' })).toMatch(/no existe/)
    expect(error({ tipo: 'tran', fin: 0 })).toMatch(/mayor que cero \(s\)/)
    expect(error({ tipo: 'tran', fin: 1, inicio: 2 })).toMatch(/entre 0 y el tiempo final/)
    expect(error({ tipo: 'ac', barrido: 'dec', puntos: 10, desde: 100, hasta: 10, fuente: 'v', magnitud: 1 })).toMatch(/final debe ser mayor/)
    expect(error({ tipo: 'ac', barrido: 'dec', puntos: 1.5, desde: 1, hasta: 10, fuente: 'v', magnitud: 1 })).toMatch(/entero/)
    expect(error({ tipo: 'dc', fuente: 'v1', desde: 1, hasta: 1, paso: 1 })).toMatch(/distintos/)
    expect(error({ tipo: 'dc', fuente: 'v1', desde: 0, hasta: 1, paso: 1, segunda: { fuente: 'v1', desde: 0, hasta: 1, paso: 1 } })).toMatch(/distinta/)
    expect(error({ tipo: 'dc', fuente: '__proto__', desde: 0, hasta: 1, paso: 1 })).toMatch(/no es válida/)
    expect(error({ tipo: 'fourier', fundamental: 1e3, armonicos: 0, periodos: 1 })).toMatch(/armónicos/)
    expect(error({ tipo: 'tran', fin: Number.NaN })).toMatch(/número/)
  })
  it('topes de puntos', () => {
    const grande = (c: unknown) => {
      const r = validarAnalisis({ id: 'a', nombre: 'x', config: c })
      return r.ok ? 'ok' : r.error
    }
    expect(grande({ tipo: 'tran', fin: 1, maximo: 1e-7 })).toMatch(/tope/)
    expect(grande({ tipo: 'dc', fuente: 'v', desde: 0, hasta: 1e6, paso: 0.1 })).toMatch(/tope/)
    expect(grande({ tipo: 'ac', barrido: 'dec', puntos: 100000, desde: 1, hasta: 1e25, fuente: 'v', magnitud: 1 })).toMatch(/tope/)
    expect(grande({ tipo: 'tran', fin: 1, maximo: 1e-3 })).toBe('ok')
    const r = validarAnalisis({ id: 'a', nombre: 'x', config: { tipo: 'tran', fin: 1, maximo: 1e-4 }, parametro: { pieza: 'r', modo: 'lineal', desde: 1, hasta: 2, puntos: 200 } })
    expect(!r.ok && r.error).toMatch(/corridas/)
  })
  it('valores del parametro', () => {
    expect(valoresDeParametro({ pieza: 'r', modo: 'lineal', desde: 0, hasta: 10, puntos: 3 })).toEqual([0, 5, 10])
    expect(valoresDeParametro({ pieza: 'r', modo: 'log', desde: 1, hasta: 100, puntos: 3 }).map((v) => Math.round(v))).toEqual([1, 10, 100])
    const r = validarAnalisis({ id: 'a', nombre: 'x', config: { tipo: 'op' }, parametro: { pieza: 'r', modo: 'log', desde: 0, hasta: 1, puntos: 3 } })
    expect(r.ok).toBe(false)
  })
})

describe('trazas elegidas y gráfica de un análisis', () => {
  const base = { id: 'a', nombre: 'x', config: { tipo: 'op' } }
  it('guarda las redes por nombre y las piezas por id, sin repetidos', () => {
    const r = validarAnalisis({ ...base, trazas: { redes: ['salida', 'salida', ' N3 '], piezas: ['p_r1', 'p_r1'] } })
    expect(r).toMatchObject({ ok: true, valor: { trazas: { redes: ['salida', 'N3'], piezas: ['p_r1'] } } })
  })
  it('una selección vacía no se guarda', () => {
    const r = validarAnalisis({ ...base, trazas: { redes: [], piezas: [] } })
    expect(r.ok && 'trazas' in r.valor).toBe(false)
  })
  it('rechaza piezas con id raro, demasiadas trazas y formas equivocadas', () => {
    expect(validarAnalisis({ ...base, trazas: { piezas: ['__proto__'] } }).ok).toBe(false)
    expect(validarAnalisis({ ...base, trazas: { redes: Array.from({ length: 300 }, (_, i) => `n${i}`) } }).ok).toBe(false)
    expect(validarAnalisis({ ...base, trazas: 'x' }).ok).toBe(false)
    expect(validarAnalisis({ ...base, trazas: { redes: [3] } }).ok).toBe(false)
  })
  it('la gráfica se valida y solo conserva lo que difiere de lo de omisión', () => {
    const r = validarAnalisis({ ...base, grafica: { tema: 'oscuro', grosor: 3, trazas: [{ id: 'V(a)', lado: 'derecha', color: 'negro' }] } })
    expect(r).toMatchObject({ ok: true, valor: { grafica: { tema: 'oscuro', grosor: 3, trazas: [{ id: 'V(a)', lado: 'derecha', color: 'negro' }] } } })
    // Los decimales de los ejes viajan con la gráfica; un lector anterior los ignora, así que no piden formato nuevo.
    const dec = validarAnalisis({ ...base, grafica: { decimalesX: 3, trazas: [{ id: 'V(a)', decimales: 0 }] } })
    expect(dec).toMatchObject({ ok: true, valor: { grafica: { decimalesX: 3, trazas: [{ id: 'V(a)', decimales: 0 }] } } })
    expect(validarAnalisis({ ...base, grafica: { decimalesX: 9 } }).ok).toBe(false)
    const igual = validarAnalisis({ ...base, grafica: { rejilla: true } })
    expect(igual.ok && 'grafica' in igual.valor).toBe(false)
    expect(validarAnalisis({ ...base, grafica: { tema: 'rosa' } }).ok).toBe(false)
  })
  it('un análisis sin estas claves queda igual que antes (los .kir viejos no cambian)', () => {
    const r = validarAnalisis(base)
    expect(r).toEqual({ ok: true, valor: { id: 'a', nombre: 'x', config: { tipo: 'op' } } })
  })
})

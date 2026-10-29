import { describe, expect, it } from 'vitest'
import type { DirectivaAjena, InstrumentoAjeno } from './ajeno'
import { analisisDe, piezaDeGenerador, textoNumero } from './instrumentos'

type G = Extract<InstrumentoAjeno, { tipo: 'generador' }>
const gen = (forma: G['forma'], parametros: G['parametros']): G => ({ tipo: 'generador', forma, nombre: 'V1', red: 'a', parametros })
type A = Extract<DirectivaAjena, { tipo: 'analisis' }>
const ctx = { refDe: (n: string) => (n.toLowerCase() === 'vb' ? 'Vb' : undefined), trazaDeRed: (n: string) => (n === 'out' ? 'R2.2' : undefined), fuenteAc: () => ({ ref: 'Vs', magnitud: 2 }) }

describe('textoNumero', () => {
  it('escribe en ingeniería cuando es exacto y completo cuando no', () => {
    expect(textoNumero(4700)).toBe('4.7k')
    expect(textoNumero(1e-6)).toBe('1u')
    expect(textoNumero(1234.5678)).toBe('1234.5678')
  })
})

describe('piezaDeGenerador', () => {
  it('una senoidal sin offset es la fuente de CA con amplitud pico', () => {
    const r = piezaDeGenerador(gen('senoidal', { vo: 0, va: 1, freq: 1000 }))
    expect(r).toMatchObject({ tipo: 'fuente-ac', props: { amplitud: '1', frecuencia: '1k' } })
  })
  it('una senoidal con offset es el generador de funciones, a pico a pico', () => {
    const r = piezaDeGenerador(gen('senoidal', { forma: 'senoidal', frecuencia: 100, amplitud: 2.5, offset: 1, fase: 0 }))
    expect(r.tipo).toBe('generador')
    expect(r.props).toMatchObject({ forma: 'Senoidal', frecuencia: '100', amplitud: '5', desplazamiento: '1' })
  })
  it('un pulso que parte de 0 V es la fuente de pulso con sus tiempos', () => {
    const r = piezaDeGenerador(gen('pulso', { v1: 0, v2: 5, td: 1e-3, tr: 1e-5, tf: 1e-5, pw: 4e-3, per: 1e-2 }))
    expect(r).toMatchObject({ tipo: 'fuente-pulso', props: { alto: '5', frecuencia: '100', ancho: '4m', subida: '10u', bajada: '10u', retardo: '1m' } })
  })
  it('un pulso que no parte de 0 V usa el generador, redondea el ciclo y avisa', () => {
    const r = piezaDeGenerador(gen('pulso', { v1: -1, v2: 3, per: 1e-3, pw: 0.3e-3 }))
    expect(r.tipo).toBe('generador')
    expect(r.props).toMatchObject({ forma: 'Pulso', amplitud: '4', desplazamiento: '1', ciclo: '30 %' })
    expect(r.avisos).toHaveLength(1)
  })
  it('las formas de Falstad se nombran como las del generador', () => {
    expect(piezaDeGenerador(gen('otra', { forma: 'diente', frecuencia: 50, amplitud: 1, offset: 0, fase: 0 })).props.forma).toBe('Diente de sierra')
  })

  it('un nombre de forma que coincide con una propiedad de Object no cuenta como forma conocida', () => {
    const r = piezaDeGenerador(gen('otra', { forma: 'constructor', frecuencia: 50, amplitud: 1, offset: 0, fase: 0 }))
    expect(r.props.forma).toBe('Senoidal')
    expect(r.avisos.join(' ')).toContain('no existe en Kirchi')
  })
})

describe('analisisDe', () => {
  const d = (analisis: A['analisis'], parametros: A['parametros'], trazas: string[] = []): A => ({ tipo: 'analisis', analisis, parametros, trazas })
  it('un transitorio lleva fin, paso máximo y trazas por pin', () => {
    const r = analisisDe(d('tran', { paso: 1e-5, fin: 0.03 }, ['v(out)', 'i(Vb)', '0']), ctx)
    expect(r.entrada).toMatchObject({ nombre: 'Transitorio importado', config: { tipo: 'tran', fin: 0.03, maximo: 1e-5 }, trazas: ['R2.2'], corrientes: ['Vb'] })
  })
  it('CA toma la fuente de entrada y su amplitud', () => {
    expect(analisisDe(d('ac', { tipo: 'dec', puntos: 20, fi: 10, ff: 1e5 }), ctx).entrada?.config).toEqual({ tipo: 'ac', barrido: 'dec', puntos: 20, desde: 10, hasta: 1e5, fuente: 'Vs', magnitud: 2 })
  })
  it('un barrido de CD busca su fuente por nombre y, si no existe, avisa y no se convierte', () => {
    expect(analisisDe(d('dc', { fuente: 'VB', inicio: 0, fin: 1, paso: 0.1 }), ctx).entrada?.config).toMatchObject({ tipo: 'dc', fuente: 'Vb' })
    const r = analisisDe(d('dc', { fuente: 'Vz', inicio: 0, fin: 1, paso: 0.1 }), ctx)
    expect(r.entrada).toBeUndefined()
    expect(r.avisos[0]).toContain('Vz')
  })
  it('el punto de operación no necesita parámetros', () => {
    expect(analisisDe(d('op', {}), ctx).entrada).toMatchObject({ nombre: 'Punto de operación importado', config: { tipo: 'op' } })
  })
})

import { describe, expect, it } from 'vitest'
import { leerValor } from '../valores/valores'
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
  it('un pulso que no parte de 0 V es una fuente por tramos con sus flancos, ancho y retardo', () => {
    const r = piezaDeGenerador(gen('pulso', { v1: 6, v2: 0, td: 1e-6, tr: 1e-9, tf: 1e-9, pw: 0.5e-6, per: 5e-6 }))
    expect(r).toMatchObject({ tipo: 'fuente-pwl', props: { puntos: '0 6, 1u 6, 1.001u 0, 1.501u 0, 1.502u 6, 5u 6', repetir: 'Sí' } })
    expect(r.avisos).toEqual([])
  })
  it('un pulso con flancos de cero usa el flanco mínimo y conserva el ciclo exacto', () => {
    const r = piezaDeGenerador(gen('pulso', { v1: -1.6, v2: -1.2, td: 10e-9, tr: 400e-9, tf: 400e-9, pw: 100e-9, per: 10e-6 }))
    expect(r.tipo).toBe('fuente-pwl')
    expect(r.props.puntos).toBe('0 -1.6, 10n -1.6, 410n -1.2, 510n -1.2, 910n -1.6, 10u -1.6')
  })
  it('un pulso cuyo retardo no cabe en el periodo cae al generador y avisa', () => {
    const r = piezaDeGenerador(gen('pulso', { v1: -1, v2: 3, td: 0.9e-3, per: 1e-3, pw: 0.3e-3 }))
    expect(r.tipo).toBe('generador')
    expect(r.props).toMatchObject({ forma: 'Pulso', amplitud: '4', desplazamiento: '1', ciclo: '30 %' })
    expect(r.avisos).toHaveLength(1)
  })
  it('un pulso desde 0 V cuyo retardo no cabe conserva su ancho y avisa', () => {
    const r = piezaDeGenerador(gen('pulso', { v1: 0, v2: 5, td: 0.9e-3, per: 1e-3, pw: 0.3e-3 }))
    expect(r.tipo).toBe('fuente-pulso')
    expect(r.props.ancho).toBe('300u')
    expect(r.avisos[0]).toContain('retardo')
  })
  it('un pulso desde 0 V cuyos flancos y ancho no caben en el periodo cae al generador y avisa', () => {
    const r = piezaDeGenerador(gen('pulso', { v1: 0, v2: 5, per: 1e-3, pw: 0.8e-3, tr: 0.2e-3, tf: 0.2e-3 }))
    expect(r.tipo).toBe('generador')
    expect(r.avisos.join(' ')).toContain('no cabe en su periodo')
  })
  it('la cuadrada de Falstad con ciclo desde 0 V es la fuente de pulso con ese ciclo', () => {
    const r = piezaDeGenerador(gen('otra', { forma: 'cuadrada', frecuencia: 1000, amplitud: 5, offset: 5, fase: 0, ciclo: 0.68 }))
    expect(r).toMatchObject({ tipo: 'fuente-pulso', props: { alto: '10', frecuencia: '1k', ciclo: '68 %' } })
    expect(r.avisos).toEqual([])
  })
  it('la cuadrada de Falstad con ciclo y offset distinto empieza arriba por tramos', () => {
    const r = piezaDeGenerador(gen('otra', { forma: 'cuadrada', frecuencia: 1000, amplitud: 1, offset: 0, fase: 0, ciclo: 0.25 }))
    expect(r).toMatchObject({ tipo: 'fuente-pwl', props: { puntos: '0 1, 250u 1, 250.001u -1, 1m -1', repetir: 'Sí' } })
  })
  it('una fuente PWL conserva sus puntos', () => {
    const r = piezaDeGenerador(gen('otra', { forma: 'pwl', puntos: '0 0, 1e-9 -10' }))
    expect(r).toMatchObject({ tipo: 'fuente-pwl', props: { puntos: '0 0, 1n -10', repetir: 'No' } })
  })
  it('una exponencial se muestrea por tramos y avisa', () => {
    const r = piezaDeGenerador(gen('otra', { forma: 'exp', v1: 0, v2: 5, td1: 1e-3, tau1: 1e-3, td2: 5e-3, tau2: 2e-3 }))
    expect(r.tipo).toBe('fuente-pwl')
    expect(r.avisos[0]).toContain('tramos')
    const pts = r.props.puntos!.split(', ')
    expect(pts[0]).toBe('0 0')
    expect(leerValor(pts[pts.length - 1]!.split(' ')[1]!)!.valor).toBeLessThan(0.1)
  })
  it('una fuente de corriente senoidal desde 0 A es la fuente de corriente AC', () => {
    const r = piezaDeGenerador(gen('senoidal', { vo: 0, va: 1e-3, freq: 1e5, corriente: 1 }))
    expect(r).toMatchObject({ tipo: 'fuente-corriente-ac', props: { amplitud: '1m', frecuencia: '100k' }, avisos: [] })
  })
  it('una fuente de corriente de pulso desde 0 A es la de pulso y una forma sin pieza queda en su nivel de CD y avisa', () => {
    expect(piezaDeGenerador(gen('pulso', { v1: 0, v2: 2e-3, per: 1e-3, pw: 4e-4, corriente: 1 }))).toMatchObject({ tipo: 'fuente-corriente-pulso', props: { alto: '2m', frecuencia: '1k' } })
    const r = piezaDeGenerador(gen('senoidal', { vo: 1e-3, va: 1e-3, freq: 1e5, corriente: 1 }))
    expect(r).toMatchObject({ tipo: 'fuente-corriente', props: { corriente: '1m' } })
    expect(r.avisos[0]).toContain('no convierte')
  })
  it('una senoidal sin frecuencia avisa y queda a 1 kHz', () => {
    const r = piezaDeGenerador(gen('senoidal', { vo: 0, va: 1 }))
    expect(r.props.frecuencia).toBe('1k')
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

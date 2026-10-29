import { describe, expect, it } from 'vitest'
import { conAvance, resumenDeCapitulo, siguienteCapitulo } from './avance'
import { CAPITULO_1 } from './capitulo1'
import { CAPITULOS, minutosTotales } from './capitulos'

describe('avance del tutorial', () => {
  it('sin avance, cada capítulo se empieza con sus pasos', () => {
    const n = CAPITULO_1.pasos.length
    expect(resumenDeCapitulo(CAPITULO_1, {})).toMatchObject({ estado: 'nuevo', etiqueta: 'Sin empezar', accion: 'Empezar', fraccion: 0, total: n })
    expect(CAPITULOS.map((c) => resumenDeCapitulo(c, {}).total)).toEqual([11, 19, 20, 25])
    for (const c of CAPITULOS) expect(resumenDeCapitulo(c, {}), c.id).toMatchObject({ estado: 'nuevo', accion: 'Empezar' })
  })

  it('el total de cada capítulo coincide con sus pasos y todos traen una descripción de una frase', () => {
    for (const c of CAPITULOS) {
      expect(c.totalPasos, c.id).toBe(c.pasos.length)
      expect(c.descripcion.length, c.id).toBeGreaterThan(30)
      expect(c.descripcion.endsWith('.'), c.id).toBe(true)
    }
  })

  it('un capítulo sin pasos se muestra como próximamente y no se puede empezar', () => {
    expect(resumenDeCapitulo({ ...CAPITULOS[1], pasos: [] }, {})).toMatchObject({ estado: 'pronto', etiqueta: 'Próximamente', accion: null, total: 19 })
  })

  it('con pasos hechos está en curso y se continúa; terminado, se repite', () => {
    expect(resumenDeCapitulo(CAPITULO_1, { conoce: { paso: 3, hecho: false } })).toMatchObject({ estado: 'curso', etiqueta: 'En curso: 3 de 11', accion: 'Continuar', fraccion: 3 / 11 })
    expect(resumenDeCapitulo(CAPITULO_1, { conoce: { paso: 11, hecho: true } })).toMatchObject({ estado: 'hecho', etiqueta: 'Hecho', accion: 'Repetir', fraccion: 1 })
  })

  it('un avance fuera de rango se acota a los pasos del capítulo', () => {
    expect(resumenDeCapitulo(CAPITULO_1, { conoce: { paso: 40, hecho: false } }).paso).toBe(11)
  })

  it('el avance de un capítulo que ya no existe (ids de antes) no cuenta y no estorba', () => {
    const viejo = { 'primer-circuito': { paso: 9, hecho: true }, medir: { paso: 4, hecho: true }, senales: { paso: 8, hecho: true }, archivo: { paso: 4, hecho: true }, trucos: { paso: 4, hecho: true } }
    for (const c of CAPITULOS) expect(resumenDeCapitulo(c, viejo), c.id).toMatchObject({ estado: 'nuevo', accion: 'Empezar', paso: 0 })
    expect(siguienteCapitulo(CAPITULOS, viejo)?.id).toBe('conoce')
  })

  it('repetir un capítulo hecho no le quita lo hecho', () => {
    const a = conAvance({ conoce: { paso: 11, hecho: true } }, 'conoce', { paso: 0 })
    expect(a.conoce).toEqual({ paso: 0, hecho: true })
    expect(resumenDeCapitulo(CAPITULO_1, a).estado).toBe('hecho')
  })

  it('conAvance no modifica el original', () => {
    const base = { conoce: { paso: 1, hecho: false } }
    const nuevo = conAvance(base, 'circuito', { paso: 2 })
    expect(base).toEqual({ conoce: { paso: 1, hecho: false } })
    expect(nuevo.circuito).toEqual({ paso: 2, hecho: false })
  })

  it('la oferta propone el primer capítulo sin terminar que ya tiene pasos', () => {
    expect(siguienteCapitulo(CAPITULOS, {})?.id).toBe('conoce')
    expect(siguienteCapitulo(CAPITULOS, { conoce: { paso: 11, hecho: true } })?.id).toBe('circuito')
    const todos = Object.fromEntries(CAPITULOS.map((c) => [c.id, { paso: c.pasos.length, hecho: true }]))
    expect(siguienteCapitulo(CAPITULOS, todos)).toBeUndefined()
    expect(siguienteCapitulo([{ ...CAPITULOS[1], pasos: [] }], {})).toBeUndefined()
  })

  it('son cuatro capítulos con ids propios y 31 minutos en total', () => {
    expect(CAPITULOS.map((c) => c.numero)).toEqual([1, 2, 3, 4])
    expect(CAPITULOS.map((c) => c.id)).toEqual(['conoce', 'circuito', 'medir-senales', 'analizar'])
    expect(minutosTotales()).toBe(31)
  })
})

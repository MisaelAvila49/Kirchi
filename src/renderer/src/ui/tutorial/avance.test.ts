import { describe, expect, it } from 'vitest'
import { conAvance, resumenDeCapitulo, siguienteCapitulo } from './avance'
import { CAPITULO_1 } from './capitulo1'
import { CAPITULOS, minutosTotales } from './capitulos'

describe('avance del tutorial', () => {
  it('sin avance, cada capítulo se empieza con sus pasos', () => {
    expect(resumenDeCapitulo(CAPITULO_1, {})).toMatchObject({ estado: 'nuevo', etiqueta: 'Sin empezar', accion: 'Empezar', fraccion: 0, total: 9 })
    expect(CAPITULOS.map((c) => resumenDeCapitulo(c, {}).total)).toEqual([9, 9, 10, 5, 10])
    for (const c of CAPITULOS) expect(resumenDeCapitulo(c, {}), c.id).toMatchObject({ estado: 'nuevo', accion: 'Empezar' })
  })

  it('un capítulo sin pasos se muestra como próximamente y no se puede empezar', () => {
    expect(resumenDeCapitulo({ ...CAPITULOS[1], pasos: [] }, {})).toMatchObject({ estado: 'pronto', etiqueta: 'Próximamente', accion: null, total: 9 })
  })

  it('con pasos hechos está en curso y se continúa; terminado, se repite', () => {
    expect(resumenDeCapitulo(CAPITULO_1, { 'primer-circuito': { paso: 3, hecho: false } })).toMatchObject({ estado: 'curso', etiqueta: 'En curso: 3 de 9', accion: 'Continuar', fraccion: 3 / 9 })
    expect(resumenDeCapitulo(CAPITULO_1, { 'primer-circuito': { paso: 9, hecho: true } })).toMatchObject({ estado: 'hecho', etiqueta: 'Hecho', accion: 'Repetir', fraccion: 1 })
  })

  it('un avance fuera de rango se acota a los pasos del capítulo', () => {
    expect(resumenDeCapitulo(CAPITULO_1, { 'primer-circuito': { paso: 40, hecho: false } }).paso).toBe(9)
  })

  it('repetir un capítulo hecho no le quita lo hecho', () => {
    const a = conAvance({ 'primer-circuito': { paso: 9, hecho: true } }, 'primer-circuito', { paso: 0 })
    expect(a['primer-circuito']).toEqual({ paso: 0, hecho: true })
    expect(resumenDeCapitulo(CAPITULO_1, a).estado).toBe('hecho')
  })

  it('conAvance no modifica el original', () => {
    const base = { medir: { paso: 1, hecho: false } }
    const nuevo = conAvance(base, 'senales', { paso: 2 })
    expect(base).toEqual({ medir: { paso: 1, hecho: false } })
    expect(nuevo.senales).toEqual({ paso: 2, hecho: false })
  })

  it('la oferta propone el primer capítulo sin terminar que ya tiene pasos', () => {
    expect(siguienteCapitulo(CAPITULOS, {})?.id).toBe('primer-circuito')
    expect(siguienteCapitulo(CAPITULOS, { 'primer-circuito': { paso: 9, hecho: true } })?.id).toBe('medir')
    const todos = Object.fromEntries(CAPITULOS.map((c) => [c.id, { paso: c.pasos.length, hecho: true }]))
    expect(siguienteCapitulo(CAPITULOS, todos)).toBeUndefined()
    expect(siguienteCapitulo([{ ...CAPITULOS[1], pasos: [] }], {})).toBeUndefined()
  })

  it('son cinco capítulos con 28 minutos en total', () => {
    expect(CAPITULOS.map((c) => c.numero)).toEqual([1, 2, 3, 4, 5])
    expect(minutosTotales()).toBe(28)
  })
})

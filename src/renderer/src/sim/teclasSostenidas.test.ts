import { afterEach, describe, expect, it } from 'vitest'
import { teclasPulsadas } from '../lienzo/contactos'
import { TeclasSostenidas } from './teclasSostenidas'

afterEach(() => teclasPulsadas.clear())

describe('teclas sostenidas', () => {
  const armar = () => {
    const envios: [string, number, boolean][] = []
    return { t: new TeclasSostenidas((id, k, c) => envios.push([id, k, c])), envios }
  }

  it('apretar cierra el canal una vez y soltar lo abre; la tecla pulsada se publica para el dibujo', () => {
    const { t, envios } = armar()
    expect(t.apretar('puntero', 'p1', 5)).toBe(true)
    expect(t.apretar('puntero', 'p1', 5)).toBe(false)
    expect(teclasPulsadas.get('p1')).toEqual(new Set([5]))
    expect(t.soltarVia('puntero')).toBe(true)
    expect(envios).toEqual([['p1', 5, true], ['p1', 5, false]])
    expect(teclasPulsadas.has('p1')).toBe(false)
  })

  it('dos vías sobre la misma tecla la sueltan al soltar la última', () => {
    const { t, envios } = armar()
    t.apretar('puntero', 'p1', 2)
    t.apretar('tecla:5', 'p1', 2)
    expect(envios).toEqual([['p1', 2, true]])
    t.soltarVia('puntero')
    expect(teclasPulsadas.get('p1')).toEqual(new Set([2]))
    t.soltarVia('tecla:5')
    expect(envios).toEqual([['p1', 2, true], ['p1', 2, false]])
  })

  it('soltar por prefijo y soltar todas abren las que corresponden', () => {
    const { t, envios } = armar()
    t.apretar('puntero', 'p1', 0)
    t.apretar('tecla:A', 'p1', 3)
    t.apretar('tecla:#', 'p1', 14)
    expect(t.soltarPrefijo('tecla:')).toBe(true)
    expect(t.hay()).toBe(true)
    expect(t.soltarTodas()).toBe(true)
    expect(t.hay()).toBe(false)
    expect(envios.filter((e) => !e[2]).map((e) => e[1]).sort((a, b) => a - b)).toEqual([0, 3, 14])
    expect(t.soltarTodas()).toBe(false)
  })
})

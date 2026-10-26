import { describe, expect, it } from 'vitest'
import { ZOOM_MAX, ZOOM_MIN } from '../canvas/camera'
import { leerPorcentaje, porcentajeAZoom, porcentajeZoom, siguientePasoZoom, zoomAPorcentaje } from './medidas'

const MIN = zoomAPorcentaje(ZOOM_MIN), MAX = zoomAPorcentaje(ZOOM_MAX)

describe('siguientePasoZoom', () => {
  it.each([
    [200, 1, 250],
    [200, -1, 150],
    [847, -1, 800],
    [900, -1, 850],
    [803, 1, 850],
    [100, -1, 50],
    [50, 1, 100],
    [50, -1, 40],
    [45, 1, 50],
    [45, -1, 40],
    [40, 1, 50],
    [12, 1, 20],
    [10, -1, MIN],
    [55, -1, 50],
    [149.9999999, 1, 200],
    [150.0000001, -1, 100]
  ])('%d con dirección %d da %d', (actual, dir, esperado) => {
    expect(siguientePasoZoom(actual, dir as 1 | -1, MIN, MAX)).toBeCloseTo(esperado, 4)
  })

  it('se acota al mínimo y al máximo de la cámara y no se mueve en el límite', () => {
    expect(siguientePasoZoom(MAX, 1, MIN, MAX)).toBe(MAX)
    expect(siguientePasoZoom(850, 1, MIN, MAX)).toBeCloseTo(MAX, 6)
    expect(siguientePasoZoom(MIN, -1, MIN, MAX)).toBe(MIN)
    expect(siguientePasoZoom(5, -1, MIN, MAX)).toBeCloseTo(MIN, 6)
  })

  it('el tope es exactamente 900 %', () => {
    expect(MAX).toBeCloseTo(900, 9)
    expect(porcentajeZoom(ZOOM_MAX)).toBe(900)
    expect(siguientePasoZoom(850, 1, MIN, MAX)).toBeCloseTo(900, 6)
    expect(siguientePasoZoom(900, 1, MIN, MAX)).toBe(MAX)
  })

  it('el porcentaje y el zoom son inversos', () => {
    expect(zoomAPorcentaje(porcentajeAZoom(137))).toBeCloseTo(137, 9)
  })
})

describe('leerPorcentaje', () => {
  it.each([
    ['150', 150],
    ['150 %', 150],
    ['150%', 150],
    ['  75.5 % ', 75.5],
    ['12,5', 12.5]
  ])('«%s» → %d', (t, v) => expect(leerPorcentaje(t)).toBe(v))
  it.each(['', 'abc', '0', '0 %', '-5', '15 0', '%', '1e3'])('«%s» no es válido', (t) => expect(leerPorcentaje(t)).toBeNull())
})

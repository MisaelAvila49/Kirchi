import { describe, expect, it } from 'vitest'
import { leerPuntosPwl } from './pwl'

describe('leerPuntosPwl', () => {
  it('lee pares con prefijos y unidades', () => {
    expect(leerPuntosPwl('0 0, 1m 5, 2m 5V, 3m 0')).toEqual({ ok: true, puntos: [[0, 0], [1e-3, 5], [2e-3, 5], [3e-3, 0]] })
  })
  it('rechaza lo que el motor rechazaría', () => {
    expect(leerPuntosPwl('')).toMatchObject({ ok: false })
    expect(leerPuntosPwl('1m 0, 2m 1')).toMatchObject({ ok: false, error: 'el primer tiempo debe ser 0.' })
    expect(leerPuntosPwl('0 0, 2m 1, 1m 2')).toMatchObject({ ok: false, error: 'el tiempo del punto 3 debe ser mayor que el anterior.' })
    expect(leerPuntosPwl('0 0, 1m')).toMatchObject({ ok: false })
    expect(leerPuntosPwl('0 0, 1m 5Hz')).toMatchObject({ ok: false })
  })
  it('acepta hasta 1,000 puntos', () => {
    const t = (n: number) => Array.from({ length: n }, (_, k) => `${k} 1`).join(', ')
    expect(leerPuntosPwl(t(1000)).ok).toBe(true)
    expect(leerPuntosPwl(t(1001))).toMatchObject({ ok: false })
  })
})

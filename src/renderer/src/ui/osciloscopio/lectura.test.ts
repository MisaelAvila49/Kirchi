import { describe, expect, it } from 'vitest'
import type { AjustesOsciloscopio } from '../../instrumentos/ajustes'
import { CANALES_PANTALLA, CIFRAS_COLUMNA, type PantallaSab } from '../../sim/protocoloInstrumentos'
import { lecturaPantalla } from './lectura'
import { marcoDePantalla } from './marco'

const ajustes = (o: Partial<AjustesOsciloscopio> = {}): AjustesOsciloscopio => ({
  canales: (['A', 'B', 'C', 'D'] as const).map((canal, k) => ({ canal, on: k < 2, vdiv: 1, pos: 0, acople: 'DC' as const })),
  matematico: false, base: 1e-3, disparoCentro: false, disparo: { fuente: 'A', subida: true, nivel: 0, modo: 'auto' }, medidas: [], ideal: false, ...o
})

/** Una pantalla de `n` columnas: A vale `va(j)`, B vale `vb(j)`; `vacias` deja esas columnas de A sin datos. */
function pantalla(n: number, va: (j: number) => number, vb: (j: number) => number, vacias: number[] = [], tDisparo = 1e-3): PantallaSab {
  const columnas = new Float32Array(CANALES_PANTALLA * n * CIFRAS_COLUMNA)
  for (let c = 0; c < CANALES_PANTALLA; c++)
    for (let j = 0; j < n; j++) {
      const x = c === 0 ? va(j) : c === 1 ? vb(j) : 0
      columnas.set([x, x, x, x, c === 0 && vacias.includes(j) ? 8 : 0], (c * n + j) * CIFRAS_COLUMNA)
    }
  return { version: 1, t0: 0, dt: 1e-2 / n, ncol: n, tDisparo, estado: 'disparado', tCaptura: 1e-2, csv: { t0: 0, dt: 0, n: 0 }, completoHasta: Array(CANALES_PANTALLA).fill(1e-2), medidas: [], columnas, muestras: new Float32Array(0) }
}

const marco = (a = ajustes()) => marcoDePantalla(a, 1000, 480, 1)

describe('lectura al pasar el ratón sobre el osciloscopio', () => {
  it('fuera de la retícula o sin captura no lee nada', () => {
    const m = marco()
    const p = pantalla(100, () => 1, () => 2)
    expect(lecturaPantalla(p, ajustes(), m, m.x - 5)).toBeNull()
    expect(lecturaPantalla(p, ajustes(), m, m.x + m.w + 5)).toBeNull()
    expect(lecturaPantalla({ ...p, ncol: 0 }, ajustes(), m, m.x + 10)).toBeNull()
  })
  it('lee el voltaje de cada canal encendido en la columna bajo el puntero, con su prefijo', () => {
    const m = marco()
    const p = pantalla(100, () => 1.5, (j) => (j < 50 ? 0.25 : 0.5))
    const l = lecturaPantalla(p, ajustes(), m, m.x + m.w * 0.75)!
    expect(l.filas.map((f) => f.canal)).toEqual(['A', 'B'])
    expect(l.filas[0].texto).toBe('1.5 V')
    expect(l.filas[1].texto).toBe('500 mV')
    const antes = lecturaPantalla(p, ajustes(), m, m.x + m.w * 0.25)!
    expect(antes.filas[1].texto).toBe('250 mV')
  })
  it('el instante va respecto al disparo y con el prefijo del tiempo', () => {
    const m = marco()
    const p = pantalla(100, () => 0, () => 0)
    // La pantalla va de 0 a 10 ms; el disparo está a 1 ms; a la mitad (5 ms) son 4 ms después.
    expect(lecturaPantalla(p, ajustes(), m, m.x + m.w / 2)!.encabezado).toBe('t = 4 ms')
    expect(lecturaPantalla(p, ajustes(), m, m.x + m.w / 2, {}, 'u')!.encabezado).toBe('t = 4000 µs')
    expect(lecturaPantalla(pantalla(100, () => 0, () => 0, [], Number.NaN), ajustes(), m, m.x + m.w / 2)!.encabezado).toBe('t = 5 ms')
  })
  it('el prefijo elegido de un canal manda sobre el automático', () => {
    const m = marco()
    const p = pantalla(100, () => 1.5, () => 0.25)
    const l = lecturaPantalla(p, ajustes(), m, m.x + 10, { A: 'm', B: 'base' })!
    expect(l.filas[0].texto).toBe('1500 mV')
    expect(l.filas[1].texto).toBe('0.25 V')
  })
  it('una columna sin datos de un canal no lo lee, y el punto cae donde está la traza (con su posición)', () => {
    const a = ajustes({ canales: ajustes().canales.map((c) => (c.canal === 'A' ? { ...c, pos: 1 } : c)) })
    const m = marco(a)
    const p = pantalla(100, () => 2, () => 0, [10])
    expect(lecturaPantalla(p, a, m, m.x + m.w * 0.105)!.filas.map((f) => f.canal)).toEqual(['B'])
    const l = lecturaPantalla(p, a, m, m.x + m.w * 0.5)!
    const esperado = m.y + m.h / 2 - (2 / 1 + 1) * (m.h / 8)
    expect(l.filas[0].yPx).toBeCloseTo(esperado, 6)
  })
})

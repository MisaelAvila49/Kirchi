import { describe, expect, it } from 'vitest'
import type { AjustesOsciloscopio } from '../../instrumentos/ajustes'
import { CANALES_PANTALLA, CIFRAS_COLUMNA, type PantallaSab } from '../../sim/protocoloInstrumentos'
import { acoplarVista, acoplesDistintos, notasDeAcople } from './acopleVista'

const ajustes = (acoples: string[], on = [true, true, true, true]): AjustesOsciloscopio => ({
  canales: (['A', 'B', 'C', 'D'] as const).map((canal, k) => ({ canal, on: on[k], vdiv: 1, pos: 0, acople: acoples[k] as 'DC' })),
  matematico: false, base: 1e-3, disparoCentro: false, disparo: { fuente: 'A', subida: true, nivel: 0, modo: 'auto' }, medidas: [], ideal: false
})

describe('el acoplamiento dicho en palabras', () => {
  it('en DC no dice nada', () => {
    expect(notasDeAcople(ajustes(['DC', 'DC', 'DC', 'DC']))).toEqual([])
  })

  it('AC y GND de los canales encendidos, con lo que se ve y lo que no', () => {
    expect(notasDeAcople(ajustes(['AC', 'GND', 'AC', 'DC'], [true, true, false, true]))).toEqual([
      'A en AC: no muestra la parte continua (pasa lo que cambia más rápido que 10 Hz), y un escalón se ve como un pico que vuelve a 0 V.',
      'B en GND: la entrada va a tierra y la traza queda en 0 V.'
    ])
  })
})

describe('el filtro del acoplamiento AC', () => {
  it('la frecuencia de corte es la del motor', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const { FRECUENCIA_AC } = await import('../../instrumentos/ajustes')
    const rs = readFileSync(join(import.meta.dirname, '../../../../../engine/src/sonda.rs'), 'utf8')
    expect(rs).toContain(`pub const FRECUENCIA_AC: f64 = ${FRECUENCIA_AC.toFixed(1)};`)
  })
})

describe('el acoplamiento sobre lo capturado en pausa', () => {
  const ncol = 4
  const pantalla = (): PantallaSab => {
    const columnas = new Float32Array(CANALES_PANTALLA * ncol * CIFRAS_COLUMNA)
    for (let i = 0; i < ncol; i++) columnas.set([2 + i, 3 + i, 2 + i, 3 + i, 0], i * CIFRAS_COLUMNA)
    return { version: 1, t0: 0, dt: 1, ncol, tDisparo: 0, estado: 'congelado', tCaptura: 4, csv: { t0: 0, dt: 1, n: 0 }, completoHasta: [], medidas: [], columnas, muestras: new Float32Array(0) }
  }
  it('DC a AC quita el promedio y GND lleva la traza a 0 V', () => {
    const dc = ajustes(['DC', 'DC', 'DC', 'DC'])
    const ac = acoplarVista(pantalla(), dc, ajustes(['AC', 'DC', 'DC', 'DC']))
    expect(Array.from(ac.columnas.subarray(0, 2))).toEqual([-2, -1])
    const gnd = acoplarVista(pantalla(), dc, ajustes(['GND', 'DC', 'DC', 'DC']))
    expect(Array.from(gnd.columnas.subarray(0, 4))).toEqual([0, 0, 0, 0])
  })
  it('sin cambio, o de AC a DC, devuelve la misma pantalla', () => {
    const p = pantalla()
    expect(acoplarVista(p, ajustes(['DC', 'DC', 'DC', 'DC']), ajustes(['DC', 'DC', 'DC', 'DC']))).toBe(p)
    expect(acoplarVista(p, ajustes(['AC', 'DC', 'DC', 'DC']), ajustes(['DC', 'DC', 'DC', 'DC']))).toBe(p)
    expect(acoplesDistintos(ajustes(['AC', 'DC', 'DC', 'DC']), ajustes(['DC', 'DC', 'DC', 'DC']))).toBe(true)
  })
})

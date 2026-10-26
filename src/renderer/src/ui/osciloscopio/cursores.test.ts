import { describe, expect, it } from 'vitest'
import type { AjustesOsciloscopio } from '../../instrumentos/ajustes'
import { cursoresIniciales, cursorCercano, cursorDeTecla, lecturaCursores, moverCursor, ponerCursor, punteroDeCursor, tiempoDeX, voltajeDeY } from './cursores'

const a: AjustesOsciloscopio = {
  canales: (['A', 'B', 'C', 'D'] as const).map((canal) => ({ canal, on: true, vdiv: canal === 'B' ? 0.5 : 1, pos: canal === 'B' ? 1 : 0, acople: 'DC' as const })),
  matematico: false, base: 1e-3, disparoCentro: false, disparo: { fuente: 'A', subida: true, nivel: 0, modo: 'auto' }, medidas: [], ideal: false
}

describe('cursores del osciloscopio', () => {
  it('el puntero sobre un cursor dice hacia dónde se arrastra', () => {
    expect(punteroDeCursor('t1')).toBe('ew-resize')
    expect(punteroDeCursor('t2')).toBe('ew-resize')
    expect(punteroDeCursor('v1')).toBe('ns-resize')
    expect(punteroDeCursor('v2')).toBe('ns-resize')
    expect(punteroDeCursor(null)).toBeNull()
  })

  it('con el foco en la pantalla las flechas mueven el cursor activo y 1 y 2 lo eligen', () => {
    const c = { canal: 'A' as const, t: [0.01, 0.02] as const, v: [-1, 1] as const }
    expect(cursorDeTecla('ArrowRight', 0, c)).toEqual({ cual: 't1', dir: 1 })
    expect(cursorDeTecla('ArrowLeft', 1, c)).toEqual({ cual: 't2', dir: -1 })
    expect(cursorDeTecla('ArrowUp', 1, c)).toEqual({ cual: 'v2', dir: 1 })
    expect(cursorDeTecla('ArrowDown', 0, c)).toEqual({ cual: 'v1', dir: -1 })
    expect(cursorDeTecla('a', 0, c)).toBeNull()
    // Sin el par que la flecha mueve, no hace nada.
    expect(cursorDeTecla('ArrowLeft', 0, { ...c, t: null })).toBeNull()
    expect(cursorDeTecla('ArrowUp', 0, { ...c, v: null })).toBeNull()
  })

  it('empiezan a dos y ocho divisiones y a ±2 divisiones del canal', () => {
    const c = cursoresIniciales(a, 0.01, 'B')
    expect(c.t![0]).toBeCloseTo(0.012, 12)
    expect(c.t![1]).toBeCloseTo(0.018, 12)
    expect(c.v).toEqual([-1, 1])
  })

  it('Δt, 1/Δt y ΔV con cuatro cifras', () => {
    expect(lecturaCursores({ canal: 'A', t: [0.01, 0.0125], v: [-0.5, 1.5] })).toMatchObject({ dt: '2.500 ms', inv: '400.0 Hz', dv: '2.000 V' })
    expect(lecturaCursores({ canal: 'A', t: [0.01, 0.01], v: null })).toMatchObject({ dt: '0.000 s', inv: 'sin dato', dv: null, v1: null, v2: null })
  })

  it('el detalle de los cursores trae el valor de cada uno', () => {
    expect(lecturaCursores({ canal: 'A', t: [0.01, 0.0125], v: [-0.5, 1.5] })).toMatchObject({ t1: '10.00 ms', t2: '12.50 ms', v1: '−500.0 mV', v2: '1.500 V' })
  })

  it('con el teclado: 0.1 división por flecha, una con Shift', () => {
    const c = { canal: 'B' as const, t: [0.012, 0.018] as [number, number], v: [-1, 1] as [number, number] }
    expect(moverCursor(c, 't1', 1, false, a).t![0]).toBeCloseTo(0.0121, 12)
    expect(moverCursor(c, 'v2', -1, true, a).v![1]).toBeCloseTo(0.5, 12)
  })

  it('de la pantalla a tiempo y voltaje, y el cursor que se toma con el ratón', () => {
    expect(tiempoDeX(250, 1000, 0.01, a)).toBeCloseTo(0.0125, 12)
    // B con 0.5 V/div y la posición en +1: el centro de la pantalla es −0.5 V.
    expect(voltajeDeY(400, 800, a, 'B')).toBeCloseTo(-0.5, 12)
    const c = { canal: 'B' as const, t: [0.012, 0.018] as [number, number], v: [-1, 1] as [number, number] }
    expect(cursorCercano(c, 203, 600, 1000, 800, 0.01, a, 8)).toBe('t1')
    expect(cursorCercano(c, 500, 500, 1000, 800, 0.01, a, 8)).toBe('v1')
    expect(cursorCercano(c, 500, 640, 1000, 800, 0.01, a, 8)).toBeNull()
    expect(ponerCursor(c, 't2', 0.015).t).toEqual([0.012, 0.015])
  })
})

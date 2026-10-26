import { describe, expect, it, vi } from 'vitest'
import type { ComandoOsc } from '../../../../compartido/ventanaOsc'
import type { PantallaSab } from '../../sim/protocoloInstrumentos'
import { copiarPantalla, cursoresAOsc, cursoresDeOsc, despacharComando, memoPorClave, type AccionesOsc } from './traspasoOsc'

const sab = (): PantallaSab => {
  const memoria = new SharedArrayBuffer(8 * 4)
  const columnas = new Float32Array(memoria, 0, 4)
  columnas.set([1, 2, 3, 4])
  return {
    version: 5, t0: 0, dt: 1e-5, ncol: 1, tDisparo: 0.001, estado: 'disparado', tCaptura: 0.01, csv: { t0: 0, dt: 1e-5, n: 2 },
    completoHasta: [0.01, 0.01, 0, 0, 0.01], medidas: [[{ valor: 2, razon: '' }], [], [], [], []], columnas, muestras: new Float32Array([7, 8])
  }
}

describe('memoPorClave', () => {
  it('solo calcula cuando la clave cambia', () => {
    const memo = memoPorClave<number>()
    let n = 0
    expect(memo('a', () => ++n)).toBe(1)
    expect(memo('a', () => ++n)).toBe(1)
    expect(memo('b', () => ++n)).toBe(2)
  })
})

describe('traspaso del osciloscopio a su ventana', () => {
  it('la copia de una pantalla sale de la memoria compartida y no cambia cuando el worker escribe', () => {
    const p = sab()
    const c = copiarPantalla(p)
    expect(c.columnas.buffer instanceof SharedArrayBuffer).toBe(false)
    expect(Array.from(c.columnas)).toEqual([1, 2, 3, 4])
    p.columnas[0] = 99
    expect(c.columnas[0]).toBe(1)
    expect(c.medidas[0][0]).toEqual({ valor: 2, razon: '' })
    expect(c.csv).toEqual({ t0: 0, dt: 1e-5, n: 2 })
  })

  it('los cursores van y vuelven sin perder nada ni compartir los pares', () => {
    const c = { canal: 'A' as const, t: [0.001, 0.004] as const, v: null }
    const ida = cursoresAOsc(c)!
    expect(ida).toEqual({ canal: 'A', t: [0.001, 0.004], v: null })
    expect(ida.t).not.toBe(c.t)
    expect(cursoresDeOsc(ida)).toEqual(c)
    expect(cursoresAOsc(null)).toBeNull()
    expect(cursoresDeOsc(null)).toBeNull()
  })

  it('cada orden de la ventana llega a su acción del editor con sus datos', () => {
    const a: AccionesOsc = {
      pausar: vi.fn(), reanudar: vi.fn(), forzar: vi.fn(), auto: vi.fn(), rearmar: vi.fn(), exportar: vi.fn(), elegir: vi.fn(),
      columnas: vi.fn(), cursores: vi.fn(), escala: vi.fn(), posicion: vi.fn(), ajuste: vi.fn()
    }
    const ordenes: ComandoOsc[] = [
      { tipo: 'pausar' }, { tipo: 'reanudar' }, { tipo: 'forzar' }, { tipo: 'auto' }, { tipo: 'rearmar' }, { tipo: 'exportar' },
      { tipo: 'elegir', id: 'p2' }, { tipo: 'columnas', id: 'p1', n: 640 }, { tipo: 'cursores', cursores: { canal: 'B', t: [1, 2], v: [3, 4] } },
      { tipo: 'escala', eje: { tipo: 'tiempo' }, dir: -1 }, { tipo: 'escala', eje: { tipo: 'canal', canal: 'C' }, dir: 1 },
      { tipo: 'posicion', canal: 'A', pos: 1.5, gesto: 'a_pos' }, { tipo: 'ajuste', prop: 'base', texto: '2 ms', gesto: 'g' }
    ]
    for (const o of ordenes) despacharComando(o, a)
    expect(a.pausar).toHaveBeenCalledTimes(1)
    expect(a.reanudar).toHaveBeenCalledTimes(1)
    expect(a.forzar).toHaveBeenCalledTimes(1)
    expect(a.auto).toHaveBeenCalledTimes(1)
    expect(a.rearmar).toHaveBeenCalledTimes(1)
    expect(a.exportar).toHaveBeenCalledTimes(1)
    expect(a.elegir).toHaveBeenCalledWith('p2')
    expect(a.columnas).toHaveBeenCalledWith('p1', 640)
    expect(a.cursores).toHaveBeenCalledWith({ canal: 'B', t: [1, 2], v: [3, 4] })
    expect(a.escala).toHaveBeenNthCalledWith(1, { tipo: 'tiempo' }, -1)
    expect(a.escala).toHaveBeenNthCalledWith(2, { tipo: 'canal', canal: 'C' }, 1)
    expect(a.posicion).toHaveBeenCalledWith('A', 1.5, 'a_pos')
    expect(a.ajuste).toHaveBeenCalledWith('base', '2 ms', 'g')
  })
})

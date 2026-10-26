import { describe, expect, it } from 'vitest'
import { CANALES_PANTALLA, CIFRAS_COLUMNA, type PantallaSab, type RegistroFino } from '../../sim/protocoloInstrumentos'
import { BANDERA_VACIA } from './dibujar'
import { acotarInicio, dxDeTecla, inicioTrasRegistro, limitesDeRecorrido, ventanaDeRegistro } from './recorrido'

/** Una captura de 1 s de una senoidal de 5 Hz y amplitud 1 en columnas finas de 100 µs (10,000), en el canal A. */
function registro(dt = 1e-4, n = 10000): RegistroFino {
  const columnas = new Float32Array(CANALES_PANTALLA * n * CIFRAS_COLUMNA)
  const v = (t: number) => Math.sin(2 * Math.PI * 5 * t)
  for (let j = 0; j < n; j++) {
    const [a, b] = [j * dt, (j + 1) * dt]
    columnas.set([Math.min(v(a), v(b)), Math.max(v(a), v(b)), v(a), v(b), 0], j * CIFRAS_COLUMNA)
  }
  for (let c = 1; c < CANALES_PANTALLA; c++) for (let j = 0; j < n; j++) columnas[(c * n + j) * CIFRAS_COLUMNA + 4] = BANDERA_VACIA
  return { t0: 0, dt, n, tCaptura: n * dt, columnas }
}
const modelo: PantallaSab = {
  version: 7, t0: 0.9, dt: 1e-5, ncol: 100, tDisparo: 0.9, estado: 'disparado', tCaptura: 1, csv: { t0: 0, dt: 1e-3, n: 5 },
  completoHasta: Array(CANALES_PANTALLA).fill(1), medidas: [[{ valor: 1, razon: '' }]], columnas: new Float32Array(0), muestras: new Float32Array(5)
}
const col = (p: PantallaSab, i: number) => Array.from(p.columnas.subarray(i * CIFRAS_COLUMNA, (i + 1) * CIFRAS_COLUMNA))

describe('desplazarse por lo capturado', () => {
  it('los límites van del principio de lo capturado a lo último que cabe completo, y el inicio se acota', () => {
    const r = registro()
    expect(limitesDeRecorrido(r, 0.01)).toEqual({ min: 0, max: 0.99 })
    expect(limitesDeRecorrido(r, 5)).toEqual({ min: 0, max: 0 })
    expect(acotarInicio(r, 0.01, -3)).toBe(0)
    expect(acotarInicio(r, 0.01, 7)).toBeCloseTo(0.99, 12)
    expect(acotarInicio(r, 0.01, Number.NaN)).toBe(0)
  })

  it('una ventana de un tramo cualquiera tiene los valores de la señal de ese tramo, no los de la última pantalla', () => {
    const r = registro()
    const p = ventanaDeRegistro(r, 2e-2, 400, 0.3, modelo)
    expect(p.t0).toBe(0.3)
    expect(p.dt).toBeCloseTo(0.2 / 400, 12)
    expect(p.ncol).toBe(400)
    // Cada columna de 500 µs junta cinco finas: su primero y su último son los de la señal en sus bordes.
    for (const i of [0, 57, 399]) {
      const [mn, mx, pr, ul, b] = col(p, i)
      const [a, z] = [0.3 + i * p.dt, 0.3 + (i + 1) * p.dt]
      expect(b).toBe(0)
      expect(pr).toBeCloseTo(Math.sin(2 * Math.PI * 5 * a), 3)
      expect(ul).toBeCloseTo(Math.sin(2 * Math.PI * 5 * z), 3)
      expect(mn).toBeLessThanOrEqual(Math.min(pr, ul) + 1e-6)
      expect(mx).toBeGreaterThanOrEqual(Math.max(pr, ul) - 1e-6)
    }
    // El eje cuenta el tiempo de la simulación (sin disparo) y las medidas de la última pantalla no valen aquí.
    expect(Number.isNaN(p.tDisparo)).toBe(true)
    expect(p.medidas[0][0]).toEqual({ valor: Number.NaN, razon: 'sin-datos' })
  })

  it('las columnas fuera de lo capturado y los canales sin dato van vacíos', () => {
    const r = registro()
    const p = ventanaDeRegistro(r, 1e-2, 100, 0.95, modelo)
    // De 0.95 a 1.05 s: la mitad de la ventana ya no tiene dato.
    expect(col(p, 10)[4]).toBe(0)
    expect(col(p, 90)[4]).toBe(BANDERA_VACIA)
    expect(p.columnas[(1 * 100 + 10) * CIFRAS_COLUMNA + 4]).toBe(BANDERA_VACIA)
    const antes = ventanaDeRegistro(r, 1e-2, 100, -0.05, modelo)
    expect(col(antes, 10)[4]).toBe(BANDERA_VACIA)
    expect(col(antes, 90)[4]).toBe(0)
  })

  it('una ventana de columnas más angostas que las finas las interpola sin volver crestas las espigas', () => {
    const r = registro(1e-3, 1000)
    const p = ventanaDeRegistro(r, 1e-3, 1000, 0.1, modelo)
    // 10 µs por columna sobre columnas finas de 1 ms: el primero y el último avanzan en línea recta dentro de cada fina.
    const a = col(p, 0)
    const b = col(p, 1)
    expect(b[2]).toBeCloseTo(a[3], 6)
    expect(a[0]).toBeLessThanOrEqual(a[1])
    for (let i = 0; i < 1000; i++) {
      const [mn, mx, pr, ul] = col(p, i)
      expect(mn).toBeCloseTo(Math.min(pr, ul), 6)
      expect(mx).toBeCloseTo(Math.max(pr, ul), 6)
    }
  })

  it('el desplazamiento no deja una columna vacía entre dos con dato', () => {
    const r = registro()
    for (const t0 of [0, 0.1234567, 0.5, 0.97]) {
      const p = ventanaDeRegistro(r, 1e-2, 733, t0, modelo)
      for (let i = 0; i < 733; i++) if (t0 + (i + 1) * p.dt <= 1 && t0 + i * p.dt >= 0) expect(col(p, i)[4]).toBe(0)
    }
  })

  it('las teclas: flechas (una décima de pantalla; con Mayús, una entera), AvPág y RePág, Inicio y Fin; con cursores las flechas son suyas', () => {
    expect(dxDeTecla('ArrowRight', false, false)).toBe(0.1)
    expect(dxDeTecla('ArrowLeft', true, false)).toBe(-1)
    expect(dxDeTecla('PageDown', false, true)).toBe(1)
    expect(dxDeTecla('Home', false, true)).toBe(Number.NEGATIVE_INFINITY)
    expect(dxDeTecla('End', false, false)).toBe(Number.POSITIVE_INFINITY)
    expect(dxDeTecla('ArrowLeft', false, true)).toBeNull()
    expect(dxDeTecla('a', false, false)).toBeNull()
  })
})

describe('inicio tras un registro nuevo (arrastre en pausa)', () => {
  const r = { t0: 0, dt: 0.001, n: 1000 }
  it('quien no recorrió sigue en el final', () => expect(inicioTrasRegistro(null, r, 0.1)).toBeNull())
  it('quien recorrió conserva su posición si cabe', () => expect(inicioTrasRegistro(0.3, { ...r, n: 2000 }, 0.1)).toBe(0.3))
  it('si el registro se acortó (Retroceder), queda en el último inicio posible', () => expect(inicioTrasRegistro(0.9, r, 0.1)).toBeCloseTo(0.9, 12))
  it('si ya no cabe se acota', () => expect(inicioTrasRegistro(5, r, 0.1)).toBeCloseTo(0.9, 12))
})

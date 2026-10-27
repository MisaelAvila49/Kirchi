import { describe, expect, it } from 'vitest'
import type { AjustesOsciloscopio } from '../../instrumentos/ajustes'
import { CANALES_PANTALLA, CIFRAS_COLUMNA, type PantallaSab } from '../../sim/protocoloInstrumentos'
import { cursoresDelModo } from './cursores'
import { marcaHorizontalEn, marcaHorizontalXY, marcasDeCero, marcoDePantalla, posicionDeX } from './marco'
import { conversorXY, cursoresInicialesXY, cursorXYCercano, lecturaCursoresXY, lecturaXY, moverCursorXYTecla, ponerCursorXY } from './xy'

const ajustes = (o: Partial<AjustesOsciloscopio> = {}): AjustesOsciloscopio => ({
  canales: (['A', 'B', 'C', 'D'] as const).map((canal, k) => ({ canal, on: k < 2, vdiv: 1, pos: 0, acople: 'DC' as const })),
  matematico: false, base: 1e-3, disparoCentro: false, disparo: { fuente: 'A', subida: true, nivel: 0, modo: 'auto' }, medidas: [], ideal: false, modoXY: 'ba', ...o
})

/** Una pantalla de `n` columnas donde A vale `va(j)` y B vale `vb(j)`. */
function pantalla(n: number, va: (j: number) => number, vb: (j: number) => number): PantallaSab {
  const columnas = new Float32Array(CANALES_PANTALLA * n * CIFRAS_COLUMNA)
  for (let c = 0; c < CANALES_PANTALLA; c++)
    for (let j = 0; j < n; j++) {
      const x = c === 0 ? va(j) : c === 1 ? vb(j) : 0
      columnas.set([x, x, x, x, 0], (c * n + j) * CIFRAS_COLUMNA)
    }
  return { version: 1, t0: 0, dt: 1e-2 / n, ncol: n, tDisparo: 1e-3, estado: 'disparado', tCaptura: 1e-2, csv: { t0: 0, dt: 0, n: 0 }, completoHasta: Array(CANALES_PANTALLA).fill(1e-2), medidas: [], columnas, muestras: new Float32Array(0) }
}

const marco = (a = ajustes()) => marcoDePantalla(a, 1000, 480, 1)
// A es la horizontal y B la vertical (B/A). Con 1 V por división y 10 divisiones, la pantalla abarca ±5 V a lo ancho y ±4 V a lo alto.
const recta = pantalla(400, (j) => -2 + (4 * j) / 399, (j) => -14 * (-2 + (4 * j) / 399) / 7)
const lissajous = pantalla(720, (j) => 3 * Math.cos((2 * Math.PI * j) / 720), (j) => 3 * Math.sin((2 * Math.PI * j) / 720))

describe('lectura X-Y bajo el puntero', () => {
  it('en una circunferencia da el voltaje vertical del lado donde está el puntero', () => {
    const a = ajustes()
    const m = marco(a)
    const conv = conversorXY(a, m)
    const [px, pyArriba] = conv(1.5, 2.6)
    const [, pyAbajo] = conv(1.5, -2.6)
    const arriba = lecturaXY(lissajous, a, m, px + 1, pyArriba)!
    const abajo = lecturaXY(lissajous, a, m, px + 1, pyAbajo)!
    expect(arriba.filas[0].canal).toBe('B')
    expect(arriba.filas[0].voltaje).toBeCloseTo(Math.sqrt(9 - 2.25), 1)
    expect(abajo.filas[0].voltaje).toBeCloseTo(-Math.sqrt(9 - 2.25), 1)
    expect(arriba.encabezado.startsWith('A = ')).toBe(true)
  })
})

describe('cursores X-Y', () => {
  it('la pendiente entre dos puntos de y = −2x lee −2 con error menor a 1 %', () => {
    const a = ajustes()
    const m = marco(a)
    const conv = conversorXY(a, m)
    let c = cursoresInicialesXY(recta, a)!
    c = ponerCursorXY(c, 0, recta, a, m, ...conv(-1.4, 2))
    c = ponerCursorXY(c, 1, recta, a, m, ...conv(1.2, 2))
    const linea = lecturaCursoresXY(c, a).find((l) => l.startsWith('Pendiente'))!
    const s = Number(linea.replace('Pendiente ', '').replace('−', '-'))
    expect(Math.abs(s + 2) / 2).toBeLessThan(0.01)
  })

  it('un cursor se toma por distancia al punto y las flechas lo llevan a lo largo de la curva', () => {
    const a = ajustes()
    const m = marco(a)
    const conv = conversorXY(a, m)
    const c = { canal: 'B' as const, t: null, v: null, xy: [{ x: 3, y: 0 }, { x: -3, y: 0 }] as const }
    expect(cursorXYCercano(c, a, m, ...conv(3, 0), 8)).toBe(0)
    expect(cursorXYCercano(c, a, m, ...conv(-3, 0), 8)).toBe(1)
    expect(cursorXYCercano(c, a, m, ...conv(0, 0), 8)).toBeNull()
    const movido = moverCursorXYTecla(c, 0, 1, true, lissajous, a, m)
    // Diez por ciento más de 720 vértices: 72 vértices, es decir, 36 grados.
    expect(movido.xy![0].x).toBeCloseTo(3 * Math.cos((36 * Math.PI) / 180), 1)
    expect(movido.xy![0].y).toBeGreaterThan(0)
    expect(movido.xy![1]).toEqual({ x: -3, y: 0 })
  })

  it('solo valen en el modo de pantalla en que se pusieron', () => {
    const xy = { canal: 'B' as const, t: null, v: null, xy: [{ x: 0, y: 0 }, { x: 1, y: 1 }] as const }
    const yt = { canal: 'A' as const, t: [0, 1] as const, v: [0, 1] as const }
    expect(cursoresDelModo(xy, ajustes())).toBe(xy)
    expect(cursoresDelModo(xy, ajustes({ modoXY: 'yt' }))).toBeNull()
    expect(cursoresDelModo(yt, ajustes())).toBeNull()
    expect(cursoresDelModo(yt, ajustes({ modoXY: 'yt' }))).toBe(yt)
  })
})

describe('marca de 0 V en X-Y', () => {
  it('el canal horizontal arrastra su marca por la horizontal y el vertical conserva la suya a la izquierda', () => {
    const a = ajustes()
    const m = marco(a)
    expect(marcasDeCero(m, a).map((q) => q.canal)).toEqual(['B'])
    const h = marcaHorizontalXY(m, a)!
    expect(h.canal).toBe('A')
    expect(h.x).toBeCloseTo(m.x + m.w / 2, 6)
    expect(marcaHorizontalEn(m, a, h.x + 2, h.y - 6, 8)).toBe('A')
    expect(marcaHorizontalEn(m, a, h.x + 200, h.y - 6, 8)).toBeNull()
    // Dos divisiones a la derecha del centro (el ancho abarca diez divisiones).
    expect(posicionDeX(m, m.x + m.w / 2 + 2 * (m.w / 10))).toBe(2)
    expect(posicionDeX(m, m.x - 500)).toBe(-4)
    expect(marcaHorizontalXY(marco(ajustes({ modoXY: 'yt' })), ajustes({ modoXY: 'yt' }))).toBeNull()
  })

  it('con la posición corrida la marca sigue al canal', () => {
    const a = ajustes({ canales: ajustes().canales.map((c) => (c.canal === 'A' ? { ...c, pos: 1.4 } : c)) })
    const m = marco(a)
    expect(marcaHorizontalXY(m, a)!.x).toBeCloseTo(m.x + m.w / 2 + 1.4 * (m.w / 10), 6)
  })
})

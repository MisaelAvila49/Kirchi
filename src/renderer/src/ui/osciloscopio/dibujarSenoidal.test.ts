import { describe, expect, it } from 'vitest'
import type { AjustesOsciloscopio } from '../../instrumentos/ajustes'
import { CANALES_PANTALLA, CIFRAS_COLUMNA, type PantallaSab } from '../../sim/protocoloInstrumentos'
import { colorDeCanal } from '../colores'
import { coloresPantalla, dibujarPantalla, type Lienzo2D } from './dibujar'

/** La figura exportada de una senoidal traía espigas que la pantalla no tiene. */
function contexto() {
  const pts: { op: string; y: number; estilo: string }[] = []
  const ctx = {
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: 'left', textBaseline: 'alphabetic',
    fillRect: () => {}, beginPath: () => {}, closePath: () => {}, rect: () => {}, clip: () => {}, save: () => {}, restore: () => {}, translate: () => {},
    setLineDash: () => {}, stroke: () => {}, fill: () => {}, fillText: () => {}, measureText: (t: string) => ({ width: t.length * 7 }),
    moveTo: (_x: number, y: number) => pts.push({ op: 'm', y, estilo: String(ctx.strokeStyle) }),
    lineTo: (_x: number, y: number) => pts.push({ op: 'l', y, estilo: String(ctx.strokeStyle) })
  }
  return { ctx: ctx as unknown as Lienzo2D, pts }
}

const ajustes = (base: number): AjustesOsciloscopio => ({
  canales: (['A', 'B', 'C', 'D'] as const).map((canal, k) => ({ canal, on: k === 0, vdiv: 1, pos: 0, acople: 'DC' as const })),
  matematico: false, base, disparoCentro: false, disparo: { fuente: 'A', subida: true, nivel: 0.5, modo: 'auto' }, medidas: [], ideal: false
})

/** `ncol` columnas sobre `periodos` periodos de una senoidal de amplitud 1 (como las arma el motor: primero, último, mínimo y máximo). */
function seno(ncol: number, periodos: number): PantallaSab {
  const columnas = new Float32Array(CANALES_PANTALLA * ncol * CIFRAS_COLUMNA)
  for (let j = 0; j < ncol; j++) {
    const [a, b] = [(j / ncol) * periodos, ((j + 1) / ncol) * periodos]
    let mn = Infinity, mx = -Infinity
    for (let k = 0; k <= 64; k++) {
      const v = Math.sin(2 * Math.PI * (a + ((b - a) * k) / 64))
      mn = Math.min(mn, v)
      mx = Math.max(mx, v)
    }
    columnas.set([mn, mx, Math.sin(2 * Math.PI * a), Math.sin(2 * Math.PI * b), 0], j * CIFRAS_COLUMNA)
  }
  return { version: 1, t0: 0, dt: 1e-2 / ncol, ncol, tDisparo: Number.NaN, estado: 'congelado', tCaptura: 1e-2, csv: { t0: 0, dt: 0, n: 0 }, completoHasta: Array(CANALES_PANTALLA).fill(1e-2), medidas: [], columnas, muestras: new Float32Array(0) }
}

describe('una senoidal sin espigas de envolvente', () => {
  // Con columnas más angostas que el periodo (de 4 a 80 por periodo) y a varios anchos, incluidos más de 2,048 columnas.
  for (const ncol of [640, 1500, 2000, 2100, 4096])
    for (const porPeriodo of [4, 7, 20, 80]) {
      it(`${ncol} columnas, ${porPeriodo} por periodo: la traza solo da la vuelta en las crestas`, () => {
        const periodos = ncol / porPeriodo
        const { ctx, pts } = contexto()
        dibujarPantalla(ctx, seno(ncol, periodos), ajustes(1e-3), 800, 640, coloresPantalla('claro', true), { dpr: 1 })
        const y = pts.filter((p) => p.estilo === colorDeCanal('claro', 'A')).map((p) => p.y)
        expect(y.length).toBeGreaterThan(ncol)
        // Un cambio de sentido de más de medio píxel: una crestas y un valle por periodo, nunca una espiga dentro de la columna.
        let vueltas = 0
        let sentido = 0
        for (let i = 1; i < y.length; i++) {
          const d = y[i] - y[i - 1]
          if (Math.abs(d) <= 0.5) continue
          if (sentido !== 0 && Math.sign(d) !== sentido) vueltas++
          sentido = Math.sign(d)
        }
        expect(vueltas).toBeLessThanOrEqual(2 * periodos + 2)
      })
    }
})

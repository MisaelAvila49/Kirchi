import { CANALES, type AjustesOsciloscopio } from '../../instrumentos/ajustes'
import { CANALES_PANTALLA, CIFRAS_COLUMNA, MUESTRAS_CSV, type PantallaSab } from '../../sim/protocoloInstrumentos'
import { coloresPantalla, dibujarPantalla, type Lienzo2D } from './dibujar'

/** Una pantalla de `ncol` columnas con una senoidal de 3 V de pico en cada canal (distinta fase) y A − B. */
export function pantallaSintetica(ncol: number): PantallaSab {
  const columnas = new Float32Array(CANALES_PANTALLA * ncol * CIFRAS_COLUMNA)
  for (let c = 0; c < CANALES_PANTALLA; c++)
    for (let j = 0; j < ncol; j++) {
      const v = (x: number) => 3 * Math.sin((2 * Math.PI * 4 * x) / ncol + c)
      const [a, b] = [v(j), v(j + 1)]
      columnas.set([Math.min(a, b), Math.max(a, b), a, b, 0], (c * ncol + j) * CIFRAS_COLUMNA)
    }
  return {
    version: 1, t0: 0, dt: 1e-2 / ncol, ncol, tDisparo: 1e-3, estado: 'disparado', tCaptura: 1e-2, csv: { t0: 0, dt: 0, n: 0 },
    completoHasta: Array(CANALES_PANTALLA).fill(1e-2), medidas: [], columnas, muestras: new Float32Array(CANALES_PANTALLA * MUESTRAS_CSV)
  }
}

export const ajustesSinteticos = (): AjustesOsciloscopio => ({
  canales: CANALES.map((canal) => ({ canal, on: true, vdiv: 1, pos: 0, acople: 'DC' as const })),
  matematico: true, base: 1e-3, disparoCentro: false, disparo: { fuente: 'A', subida: true, nivel: 0, modo: 'auto' }, medidas: [], ideal: false
})

/** El mínimo de `n` dibujos (ms) de cuatro canales y A − B a todo el ancho de `ctx`. */
export function medirDibujo(ctx: Lienzo2D, W: number, H: number, n = 30): number {
  const p = pantallaSintetica(W)
  const a = ajustesSinteticos()
  const c = coloresPantalla('claro')
  let minimo = Number.POSITIVE_INFINITY
  for (let k = 0; k < n + 5; k++) {
    const t = performance.now()
    dibujarPantalla(ctx, p, a, W, H, c, { dpr: 2, ejes: true })
    if (k >= 5) minimo = Math.min(minimo, performance.now() - t)
  }
  return minimo
}

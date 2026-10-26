// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { calcularConexiones } from '../conexiones/conexiones'
import { documentoVacio, type Documento, type Sonda } from '../doc/tipos'
import { CANALES, type AjustesOsciloscopio } from '../instrumentos/ajustes'
import { libreriaDePrueba } from '../prueba/libreria'
import { minimoDe } from '../prueba/medir'
import { CANALES_PANTALLA, CIFRAS_COLUMNA, type PantallaSab } from '../sim/protocoloInstrumentos'
import { coloresPantalla, dibujarPantalla, type Lienzo2D } from '../ui/osciloscopio/dibujar'
import { construirEscena } from './escena'
import { PALETA_CLARA } from './paleta'

const lib = libreriaDePrueba().piezas

/** 5,000 resistencias con su cable y, con `sondas`, 64 sondas de voltaje repartidas sobre los cables. */
function grande(sondas: boolean): Documento {
  const d = documentoVacio()
  for (let k = 0; k < 5000; k++) {
    const x = (k % 100) * 20, y = Math.floor(k / 100) * 20
    d.piezas[`r${k}`] = { id: `r${k}`, tipo: 'resistencia', ref: `R${k + 1}`, x, y, rot: 0, espejo: false, props: {} }
    d.cables[`c${k}`] = { id: `c${k}`, puntos: [{ x: x + 4, y }, { x: x + 8, y }, { x: x + 8, y: y + 8 }, { x: x + 12, y: y + 8 }] }
  }
  if (sondas) {
    const s: Record<string, Sonda> = {}
    for (let i = 0; i < 64; i++) {
      const k = i * 78
      s[`s${i}`] = { id: `s${i}`, tipo: 'voltaje', x: (k % 100) * 20 + 8, y: Math.floor(k / 100) * 20 + 4 }
    }
    d.sondas = s
  }
  return d
}

describe('las sondas no encarecen el lienzo', () => {
  it('la escena de 5,000 resistencias con 64 sondas cabe en el límite de la escena (50 ms)', () => {
    const sin = grande(false), con = grande(true)
    const cSin = calcularConexiones(sin, lib), cCon = calcularConexiones(con, lib)
    // Cada vuelta, un documento nuevo (como tras una edición): las banderas no salen de lo guardado. Los dos igual.
    const a = minimoDe(() => construirEscena({ ...sin }, lib, cSin, PALETA_CLARA))
    const b = minimoDe(() => construirEscena({ ...con }, lib, cCon, PALETA_CLARA))
    console.log(`escena de 5,000 resistencias: ${a.toFixed(1)} ms sin sondas y ${b.toFixed(1)} ms con 64 (${(b - a).toFixed(1)} ms más)`)
    expect(b).toBeLessThan(50)
  }, 60_000)

  it('las conexiones con 64 sondas cuestan a lo más 10 % más', () => {
    const sin = grande(false), con = grande(true)
    const a = minimoDe(() => calcularConexiones(sin, lib))
    const b = minimoDe(() => calcularConexiones(con, lib))
    console.log(`conexiones de 5,000 resistencias: ${a.toFixed(1)} ms sin sondas y ${b.toFixed(1)} ms con 64 (${(b - a).toFixed(1)} ms más)`)
    expect(b / a - 1).toBeLessThan(0.1)
  }, 60_000)

  it('dibujar la pantalla con sus ejes, cuatro canales y A − B a 2,560 columnas cabe en 2 ms', () => {
    const nada = () => {}
    const ctx = {
      fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: 'left', textBaseline: 'alphabetic',
      fillRect: nada, beginPath: nada, moveTo: nada, lineTo: nada, stroke: nada, fill: nada, closePath: nada, rect: nada, clip: nada,
      save: nada, restore: nada, setLineDash: nada, fillText: nada, translate: nada, measureText: (t: string) => ({ width: t.length * 7 })
    } as unknown as Lienzo2D
    const n = 2560
    const columnas = new Float32Array(CANALES_PANTALLA * n * CIFRAS_COLUMNA)
    for (let c = 0; c < CANALES_PANTALLA; c++) for (let j = 0; j < n; j++) columnas.set([-1, 1, Math.sin(j / 40), Math.sin((j + 1) / 40), 0], (c * n + j) * CIFRAS_COLUMNA)
    const p: PantallaSab = { version: 1, t0: 0, dt: 1e-6, ncol: n, tDisparo: 1e-3, estado: 'disparado', tCaptura: 1e-2, csv: { t0: 0, dt: 0, n: 0 }, completoHasta: Array(CANALES_PANTALLA).fill(1e-2), medidas: [], columnas, muestras: new Float32Array(0) }
    const a: AjustesOsciloscopio = {
      canales: CANALES.map((canal) => ({ canal, on: true, vdiv: 1, pos: 0, acople: 'DC' as const })),
      matematico: true, base: 1e-3, disparoCentro: false, disparo: { fuente: 'A', subida: true, nivel: 0, modo: 'auto' }, medidas: [], ideal: false
    }
    const ms = minimoDe(() => dibujarPantalla(ctx, p, a, 2560 + 400, 2048, coloresPantalla('claro'), { dpr: 2, ejes: true }))
    console.log(`dibujar la pantalla con ejes a 2,560 columnas (sin canvas): ${ms.toFixed(2)} ms`)
    expect(ms).toBeLessThan(2)
  })
})

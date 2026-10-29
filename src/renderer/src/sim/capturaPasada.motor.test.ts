// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { calcularConexiones } from '../conexiones/conexiones'
import type { AjustesOsciloscopio } from '../instrumentos/ajustes'
import { compilarNetlist } from '../netlist/netlist'
import { conEtiquetas, type Parte } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import { coloresPantalla, dibujarPantalla, type Lienzo2D } from '../ui/osciloscopio/dibujar'
import { ventanaDeRegistro } from '../ui/osciloscopio/recorrido'
import { configDeInstrumentos, InstrumentosEnWorker } from './instrumentosWorker'
import { basesDeTiempo, pasoDeVistaPrevia } from './lectura'
import init, { Simulator } from './pkg/kirchi_engine.js'
import { bytesSabInstrumentos, CIFRAS_COLUMNA, crearVistas, leerInstrumentos, type PantallaSab, type RegistroFino } from './protocoloInstrumentos'

/** Recorrer lo capturado (pausa y arrastre, tras detener, exportar un tramo) arma la pantalla desde las columnas finas del worker.
 * Una senoidal tiene que verse senoidal ahí también, a la base de la captura y a una más fina, y no en escalones ni como cuadrada. */
const lib = libreriaDePrueba().piezas
let memoria: WebAssembly.Memory
beforeAll(async () => {
  memoria = (await init({ module_or_path: readFileSync(join(import.meta.dirname, 'pkg/kirchi_engine_bg.wasm')) })).memory
})

const AMPLITUD = 2

/** Una senoidal de `f` Hz sobre una resistencia con el osciloscopio en A, `segundos` simulados en cuadros de `cuadro` segundos (el ritmo
 * del worker) con el paso de la vista previa y una pantalla de `ncol` columnas (píxeles de dispositivo: el doble en una Retina); da
 * la última pantalla y el registro fino como lo pide el worker. */
function capturar(f: number, base: string, segundos: number, ncol: number, cuadro: number): { pantalla: PantallaSab; fino: RegistroFino } {
  const partes: Parte[] = [
    { tipo: 'fuente-ac', ref: 'V1', props: { amplitud: String(AMPLITUD), frecuencia: String(f) }, pines: { '+': 'e', '-': '0' } },
    { tipo: 'resistencia', ref: 'R1', props: { valor: '1k' }, pines: { '1': 'e', '2': '0' } },
    { tipo: 'osciloscopio', ref: 'XSC1', props: { base, a_vdiv: '1', b_vdiv: '1' }, pines: { A: 'e', B: '0', C: '0', D: '0' } }
  ]
  const d = conEtiquetas(lib, partes)
  const r = compilarNetlist(d, lib, calcularConexiones(d, lib))
  if (!r.netlist) throw new Error(r.errores.join(' '))
  const h = pasoDeVistaPrevia(r.netlist, basesDeTiempo(r))
  const sim = new Simulator(JSON.stringify(r.netlist), h)
  const vistas = crearVistas(new SharedArrayBuffer(bytesSabInstrumentos(1, 0)), 1, 0)
  let reloj = 0
  const inst = new InstrumentosEnWorker(sim, () => memoria.buffer, vistas, structuredClone(configDeInstrumentos(r.instrumentos).config), reloj)
  inst.columnas(0, ncol)
  for (let k = 0; k < Math.round(segundos / cuadro); k++) {
    sim.advance_to(sim.time() + cuadro, 1e9)
    reloj += 1000 * cuadro
    inst.publicar(reloj)
  }
  inst.publicar(reloj + 1, true)
  const pantalla = leerInstrumentos(vistas, { osciloscopio: 0 }).pantalla!
  // Lo que pide el worker de la vista previa: con su paso máximo.
  const fino = inst.capturaFina(0, undefined, h)!
  sim.free()
  return { pantalla: { ...pantalla, columnas: pantalla.columnas.slice() }, fino }
}

const ajustes = (base: number): AjustesOsciloscopio => ({
  canales: (['A', 'B', 'C', 'D'] as const).map((canal, k) => ({ canal, on: k === 0, vdiv: 1, pos: 0, acople: 'DC' as const })),
  matematico: false, base, disparoCentro: false, disparo: { fuente: 'A', subida: true, nivel: 0, modo: 'auto' }, medidas: [], ideal: false
})

/** El mayor alejamiento de la senoidal en los bordes de cada columna (primero y último) y entre columnas vecinas (un escalón). */
function errores(p: PantallaSab, f: number): { borde: number; salto: number } {
  const seno = (t: number) => AMPLITUD * Math.sin(2 * Math.PI * f * t)
  let borde = 0
  let salto = 0
  let anterior = Number.NaN
  for (let j = 0; j < p.ncol; j++) {
    const q = j * CIFRAS_COLUMNA
    if (p.columnas[q + 4] & 8) {
      anterior = Number.NaN
      continue
    }
    const a = p.t0 + j * p.dt
    borde = Math.max(borde, Math.abs(p.columnas[q + 2] - seno(a)), Math.abs(p.columnas[q + 3] - seno(a + p.dt)))
    if (!Number.isNaN(anterior)) salto = Math.max(salto, Math.abs(p.columnas[q + 2] - anterior))
    anterior = p.columnas[q + 3]
  }
  return { borde, salto }
}

/** El trazo dibujado del canal A (hasta que termina el de las trazas, antes de las marcas): cada punto, de vuelta a tiempo y voltaje, contra la senoidal. */
function errorDelTrazo(p: PantallaSab, base: number, f: number): number {
  const [W, H] = [p.ncol, 640]
  const colores = coloresPantalla('claro', true)
  const trazo = colores.canal.A
  const pts: { x: number; y: number }[] = []
  let grabando = true
  const ctx = {
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: 'left', textBaseline: 'alphabetic',
    fillRect: () => {}, beginPath: () => {}, closePath: () => {}, rect: () => {}, clip: () => {}, save: () => {}, restore: () => void (pts.length && (grabando = false)), translate: () => {},
    setLineDash: () => {}, stroke: () => {}, fill: () => {}, fillText: () => {}, measureText: (t: string) => ({ width: t.length * 7 }),
    moveTo: (x: number, y: number) => void (grabando && ctx.strokeStyle === trazo && pts.push({ x, y })),
    lineTo: (x: number, y: number) => void (grabando && ctx.strokeStyle === trazo && pts.push({ x, y }))
  }
  dibujarPantalla(ctx as unknown as Lienzo2D, p, ajustes(base), W, H, colores, { dpr: 1, sinReticula: true })
  expect(pts.length).toBeGreaterThan(p.ncol)
  let peor = 0
  for (const { x, y } of pts) {
    const t = p.t0 + (x / W) * 10 * base
    const v = (H / 2 - y) / (H / 8)
    peor = Math.max(peor, Math.abs(v - AMPLITUD * Math.sin(2 * Math.PI * f * t)))
  }
  return peor
}

// Lo que se aleja una recta entre dos puntos de la senoidal a 40 µs (dos pasos del motor a 1 kHz) es 16 mV: con 20 mV (1 % de la
// amplitud) pasa una traza continua y no un escalón de 50 mV ni una cuadrada.
const TOLERANCIA = 0.02

describe('una senoidal en lo capturado se ve como senoidal', () => {
  for (const { f, base, vista, segundos, ncol = 1000, cuadro = 1 / 60 } of [
    // Arrastrar en pausa con la misma base, tras más de 1.3 s (las columnas finas ya son más anchas que las de la pantalla).
    { f: 1000, base: '1m', vista: 1e-3, segundos: 3 },
    { f: 50, base: '5m', vista: 5e-3, segundos: 3 },
    // Capturada con una base lenta y vista más de cerca (tras detener, o con la pantalla congelada): antes, una columna fina por periodo.
    { f: 1000, base: '100m', vista: 1e-3, segundos: 2 },
    { f: 1000, base: '10m', vista: 1e-4, segundos: 2 },
    { f: 50, base: '100m', vista: 2e-3, segundos: 3 },
    // Una Retina (el doble de columnas) y otros ritmos del worker: más lento y más rápido que 60 cuadros por segundo.
    { f: 1000, base: '1m', vista: 1e-3, segundos: 3, ncol: 2800 },
    { f: 50, base: '5m', vista: 5e-3, segundos: 3, ncol: 2800, cuadro: 1 / 24 },
    { f: 1000, base: '100m', vista: 1e-3, segundos: 2, ncol: 2800, cuadro: 1 / 240 },
    { f: 1000, base: '1m', vista: 1e-4, segundos: 3, ncol: 4096, cuadro: 0.1 }
  ]) {
    it(`${f} Hz capturada a ${base}s/div y vista a ${vista} s/div con ${ncol} columnas y cuadros de ${(cuadro * 1000).toFixed(1)} ms, una y diez pantallas atrás`, () => {
      const { pantalla, fino } = capturar(f, base, segundos, ncol, cuadro)
      const fin = fino.t0 + fino.n * fino.dt
      for (const atras of [1, 10]) {
        const t0 = fin - (atras + 1) * 10 * vista
        const v = ventanaDeRegistro(fino, vista, ncol, t0, pantalla)
        const e = errores(v, f)
        expect(e.borde, `primero y último, ${atras} atrás`).toBeLessThan(TOLERANCIA)
        expect(e.salto, `escalón entre columnas, ${atras} atrás`).toBeLessThan(TOLERANCIA)
        expect(errorDelTrazo(v, vista, f), `trazo dibujado, ${atras} atrás`).toBeLessThan(TOLERANCIA)
      }
    })
  }
})

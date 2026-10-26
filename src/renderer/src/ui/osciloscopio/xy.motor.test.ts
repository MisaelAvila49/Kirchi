// @vitest-environment happy-dom
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { leerKir } from '../../archivo/kir'
import { calcularConexiones } from '../../conexiones/conexiones'
import { compilarNetlist } from '../../netlist/netlist'
import { libreriaDePrueba } from '../../prueba/libreria'
import { configDeInstrumentos, InstrumentosEnWorker } from '../../sim/instrumentosWorker'
import { basesDeTiempo, pasoDeSimulacion } from '../../sim/lectura'
import init, { Simulator } from '../../sim/pkg/kirchi_engine.js'
import { bytesSabInstrumentos, crearVistas, CIFRAS_COLUMNA, leerInstrumentos } from '../../sim/protocoloInstrumentos'
import { coloresPantalla, dibujarPantalla, type Lienzo2D } from './dibujar'

/** El amplificador con bocina de las pruebas manuales (generador de 20 mVpp ideal): en B/A debe salir una recta de pendiente negativa. */
const RUTA = join(import.meta.dirname, '../../../../../PruebasManualesKirchi/Amplificadorbocina.kir')
let memoria: WebAssembly.Memory
beforeAll(async () => {
  memoria = (await init({ module_or_path: readFileSync(join(import.meta.dirname, '../../sim/pkg/kirchi_engine_bg.wasm')) })).memory
})

describe.skipIf(!existsSync(RUTA))('la pantalla X-Y con el amplificador de las pruebas manuales', () => {
  it('B/A dibuja una recta de pendiente negativa (ganancia cercana a −14)', () => {
    const lectura = leerKir(new Uint8Array(readFileSync(RUTA)))
    if (!lectura.ok) throw new Error(lectura.error)
    const lib = libreriaDePrueba().piezas
    const doc = lectura.doc
    const r = compilarNetlist(doc, lib, calcularConexiones(doc, lib))
    if (!r.netlist) throw new Error(r.errores.join(' '))
    const sim = new Simulator(JSON.stringify(r.netlist), pasoDeSimulacion(r.netlist, basesDeTiempo(r)))
    const ci = configDeInstrumentos(r.instrumentos)
    const vistas = crearVistas(new SharedArrayBuffer(bytesSabInstrumentos(1, 0)), 1, 0)
    let reloj = 0
    const inst = new InstrumentosEnWorker(sim, () => memoria.buffer, vistas, structuredClone(ci.config), reloj)
    for (let k = 0; k < 400; k++) {
      sim.advance_to(sim.time() + 1e-4, 1e9)
      reloj += 25
      inst.publicar(reloj)
    }
    inst.publicar(reloj + 1, true)
    const p = leerInstrumentos(vistas, { osciloscopio: 0 }).pantalla!
    expect(p.ncol).toBeGreaterThan(0)
    // Los datos: B contra A en la segunda mitad (ya en régimen) por regresión.
    const pares: [number, number][] = []
    for (let j = Math.floor(p.ncol / 2); j < p.ncol; j++) {
      const [a, b] = [p.columnas[j * CIFRAS_COLUMNA + 2], p.columnas[(p.ncol + j) * CIFRAS_COLUMNA + 2]]
      if (Number.isFinite(a) && Number.isFinite(b)) pares.push([a, b])
    }
    expect(pares.length).toBeGreaterThan(50)
    const n = pares.length
    const [mx, my] = [pares.reduce((s, q) => s + q[0], 0) / n, pares.reduce((s, q) => s + q[1], 0) / n]
    const sxy = pares.reduce((s, q) => s + (q[0] - mx) * (q[1] - my), 0)
    const sxx = pares.reduce((s, q) => s + (q[0] - mx) ** 2, 0)
    const syy = pares.reduce((s, q) => s + (q[1] - my) ** 2, 0)
    const pendiente = sxy / sxx
    expect(pendiente).toBeLessThan(-8)
    expect(pendiente).toBeGreaterThan(-20)
    expect(Math.abs(sxy / Math.sqrt(sxx * syy))).toBeGreaterThan(0.95)
    // El dibujo B/A: los puntos suben en la pantalla (y baja) cuando x crece, así que la pendiente en píxeles es positiva.
    const puntos: [number, number][] = []
    const ctx = {
      fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: 'left', textBaseline: 'alphabetic',
      fillRect() {}, beginPath() {}, stroke() {}, fill() {}, closePath() {}, rect() {}, clip() {}, save() {}, restore() {}, setLineDash() {}, translate() {},
      measureText: (t: string) => ({ width: t.length * 7 }), fillText() {},
      moveTo: (x: number, y: number) => puntos.push([x, y]),
      lineTo: (x: number, y: number) => puntos.push([x, y])
    } as unknown as Lienzo2D
    const a = structuredClone(ci.config.osciloscopios[0].ajustes)
    a.modoXY = 'ba'
    a.canales[0].vdiv = 0.01
    dibujarPantalla(ctx, p, a, 800, 480, coloresPantalla('claro'), { dpr: 1, ejes: false })
    const trazo = puntos.slice(-2 * p.ncol)
    expect(trazo.length).toBeGreaterThan(50)
    const [px, py] = [trazo.map((q) => q[0]), trazo.map((q) => q[1])]
    const [cx, cy] = [px.reduce((s, v) => s + v, 0) / px.length, py.reduce((s, v) => s + v, 0) / py.length]
    expect(px.reduce((s, v, i) => s + (v - cx) * (py[i] - cy), 0)).toBeGreaterThan(0)
    sim.free()
  })
})

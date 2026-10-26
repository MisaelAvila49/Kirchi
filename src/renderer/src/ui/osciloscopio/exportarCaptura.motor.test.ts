// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { calcularConexiones } from '../../conexiones/conexiones'
import { compilarNetlist } from '../../netlist/netlist'
import { conEtiquetas, type Parte } from '../../prueba/circuitos'
import { libreriaDePrueba } from '../../prueba/libreria'
import { configDeInstrumentos, InstrumentosEnWorker } from '../../sim/instrumentosWorker'
import { basesDeTiempo, pasoDeSimulacion } from '../../sim/lectura'
import init, { Simulator } from '../../sim/pkg/kirchi_engine.js'
import { bytesSabInstrumentos, crearVistas, leerInstrumentos, MUESTRAS_CSV } from '../../sim/protocoloInstrumentos'
import { csvDeCaptura } from './exportarCaptura'

/**
 * Con el motor de verdad: el CSV de una captura no debe traer tiempos negativos, empezar después de 0 ni filas con tiempo y sin valores.
 */
const lib = libreriaDePrueba().piezas
let memoria: WebAssembly.Memory
beforeAll(async () => {
  memoria = (await init({ module_or_path: readFileSync(join(import.meta.dirname, '../../sim/pkg/kirchi_engine_bg.wasm')) })).memory
})

const partes: Parte[] = [
  { tipo: 'generador', ref: 'XFG1', props: {}, pines: { '+': 's', COM: '0' } },
  { tipo: 'resistencia', ref: 'R1', props: { valor: '1k' }, pines: { '1': 's', '2': '0' } },
  { tipo: 'osciloscopio', ref: 'XSC1', props: { disp_modo: 'Automático' }, pines: { A: 's', B: 's', C: '0', D: '0' } }
]

function armar(props: Record<string, string> = {}, pinB = 's') {
  const d = conEtiquetas(lib, partes.map((p) => (p.tipo === 'osciloscopio' ? { ...p, props: { disp_modo: 'Automático', ...props }, pines: { ...p.pines, B: pinB } } : p)))
  const r = compilarNetlist(d, lib, calcularConexiones(d, lib))
  if (!r.netlist) throw new Error(r.errores.join(' '))
  const sim = new Simulator(JSON.stringify(r.netlist), pasoDeSimulacion(r.netlist, basesDeTiempo(r)))
  const ci = configDeInstrumentos(r.instrumentos)
  const vistas = crearVistas(new SharedArrayBuffer(bytesSabInstrumentos(1, 0)), 1, 0)
  let reloj = 0
  const inst = new InstrumentosEnWorker(sim, () => memoria.buffer, vistas, structuredClone(ci.config), reloj)
  const correr = (n: number, dt: number) => {
    for (let k = 0; k < n; k++) {
      sim.advance_to(sim.time() + dt, 1e9)
      reloj += 25
      inst.publicar(reloj)
    }
  }
  const csv = () => {
    inst.publicar(reloj + 1, true)
    const p = leerInstrumentos(vistas, { osciloscopio: 0 }).pantalla!
    return { p, texto: csvDeCaptura('XSC1', ci.config.osciloscopios[0].ajustes, p) }
  }
  return { sim, ci, inst, correr, csv, reloj: () => reloj }
}
const filas = (texto: string) => texto.trimEnd().split('\n').filter((l) => !l.startsWith('#')).slice(1).map((l) => l.split(','))

describe('el CSV de una captura con el motor', () => {
  const sano = (texto: string, esperaCeldasLlenas = true) => {
    const f = filas(texto)
    const t = f.map((x) => Number(x[0]))
    expect(f.length).toBeGreaterThan(100)
    expect(t[0]).toBe(0)
    expect(Math.min(...t)).toBeGreaterThanOrEqual(0)
    for (let k = 1; k < t.length; k++) expect(t[k]).toBeGreaterThan(t[k - 1])
    if (esperaCeldasLlenas) expect(f.every((x) => x.every((c) => c !== ''))).toBe(true)
    return f
  }

  it('una captura normal parte de 0 con todas las columnas llenas', () => {
    const { correr, csv, sim } = armar()
    correr(150, 1e-4)
    sano(csv().texto)
    sim.free()
  })

  it('con el disparo al centro, el primer disparo es temprano: la pantalla arranca antes de t = 0 y el CSV no trae negativos ni renglones sin valores', () => {
    const { correr, csv, sim } = armar({ posh: 'Centro' })
    correr(65, 1e-4)
    const { p, texto } = csv()
    // La causa: la pantalla arranca 5 ms antes del disparo (t0 < 0) y ahí el motor no tiene muestras (NaN).
    expect(p.csv.t0).toBeLessThan(0)
    const f = sano(texto)
    // Lo anterior a t = 0 se quedó fuera: menos de los 2,001 instantes de la pantalla, y el comentario dice a qué tiempo equivale el 0.
    expect(f.length).toBeLessThan(MUESTRAS_CSV)
    expect(texto).toMatch(/# t = 0 es el inicio de la captura \(t simulado = /)
    sim.free()
  })

  it('sin disparo todavía (esperando) no hay renglones: la cabecera lo dice, no filas con tiempo NaN', () => {
    const { correr, csv, sim } = armar()
    correr(5, 1e-4)
    const { texto } = csv()
    expect(texto).not.toContain('NaN')
    expect(filas(texto)).toEqual([])
    expect(texto).toContain('# Sin captura')
    sim.free()
  })

  it('tras cambiar la base de tiempo, la captura empieza en 0 con lo posterior al cambio y sin muestras viejas', () => {
    const { correr, csv, inst, ci, reloj, sim } = armar()
    correr(40, 1e-3)
    const cfg = structuredClone(ci.config)
    cfg.osciloscopios[0].ajustes.base = 2e-3
    inst.configurar(cfg, reloj())
    correr(5, 1e-3)
    const { p, texto } = csv()
    // Entrando: la pantalla lleva más tiempo del simulado desde el cambio, lo anterior está vacío.
    expect(p.estado).toBe('rodillo')
    const f = sano(texto)
    expect(f.length).toBeLessThan(MUESTRAS_CSV)
    sim.free()
  })

  it('un canal sin cable sale con su columna vacía y su razón, sin desalinear las demás', () => {
    // B con su propia red (sin cable).
    const { correr, csv, sim } = armar({}, 'suelta')
    correr(150, 1e-4)
    const { texto } = csv()
    const f = sano(texto, false)
    expect(f.every((x) => x.length === 3 && x[1] !== '' && x[2] === '')).toBe(true)
    expect(texto).toContain('# B: sin datos en esta captura')
    sim.free()
  })
})

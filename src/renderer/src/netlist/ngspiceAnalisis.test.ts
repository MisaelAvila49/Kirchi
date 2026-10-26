// @vitest-environment happy-dom
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { valoresDeParametro, type AnalisisDoc } from '../../../compartido/analisis/config'
import { peticionDe } from '../../../compartido/analisis/peticion'
import { mapearResultados, type Nombres, type ResultadoMapeado } from '../../../compartido/analisis/resultados'
import { carpetaHerramientas } from '../../../main/recursos'
import { localizarNgspice, ServicioNgspice } from '../../../main/servicioNgspice'
import { calcularConexiones } from '../conexiones/conexiones'
import type { Id } from '../doc/tipos'
import { conEtiquetas, type Parte } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import { leerResultados, type Lectura } from '../sim/lectura'
import init, { Simulator } from '../sim/pkg/kirchi_engine.js'
import { CASOS } from './casosReferencia'
import { compilarNetlist } from './netlist'

// Criterios de aceptación de los análisis contra el ngspice 47 real (a través del servicio del proceso
// principal) y, en el punto de operación, contra la solución de CD del motor propio. Sin `herramientas/ngspice` se omiten.

const raiz = join(import.meta.dirname, '../../../..')
const ejecutable = localizarNgspice({ empaquetado: false, carpetaHerramientas: carpetaHerramientas({ empaquetado: false, resourcesPath: '', appPath: raiz }), appPath: raiz })
const hay = (() => {
  if (!ejecutable) return false
  const r = spawnSync(ejecutable, ['-n', '-v'], { encoding: 'utf8', windowsHide: true })
  return /ngspice-47\b/.test(`${r.stdout}${r.stderr}`)
})()
if (!hay) console.warn('ngspice 47 no está en herramientas/ngspice (node scripts/referencias-ngspice.mjs lo descarga): se omiten las pruebas de análisis.')
const si = hay ? describe : describe.skip

const lib = libreriaDePrueba().piezas
const servicio = new ServicioNgspice({ ejecutable: ejecutable ?? 'ngspice', limiteMs: 120_000 })
let memoria: WebAssembly.Memory
beforeAll(async () => {
  memoria = (await init({ module_or_path: readFileSync(join(import.meta.dirname, '../sim/pkg/kirchi_engine_bg.wasm')) })).memory
})

const R = (ref: string, valor: string, a: string, b: string): Parte => ({ tipo: 'resistencia', ref, props: { valor }, pines: { '1': a, '2': b } })
const C = (ref: string, valor: string, a: string, b: string): Parte => ({ tipo: 'capacitor', ref, props: { valor }, pines: { '1': a, '2': b } })
const DC = (ref: string, voltaje: string, mas: string): Parte => ({ tipo: 'fuente-dc', ref, props: { voltaje }, pines: { '+': mas, '-': '0' } })

/** Un circuito compilado con lo que hace falta para pedir y leer un análisis. */
function armar(partes: Parte[]) {
  const d = conEtiquetas(lib, partes)
  const con = calcularConexiones(d, lib)
  const r = compilarNetlist(d, lib, con)
  expect(r.errores).toEqual([])
  const idDe = (ref: string): Id => Object.values(d.piezas).find((p) => p.ref === ref)!.id
  const redes = new Map<number, string>()
  con.redes.forEach((red, i) => {
    const n = r.nodoDeRed.get(i)
    if (n !== undefined && n !== 0 && red.nombre) redes.set(n, red.nombre)
  })
  const nodoDe = (nombre: string): number => [...redes].find(([, v]) => v === nombre)![0]
  const nombres: Nombres = {
    redes,
    elementos: r.piezaDeElemento.map((id) => d.piezas[id]?.ref),
    sondas: [],
    pieza: (id) => d.piezas[id]?.ref ?? id
  }
  return { d, con, r, idDe, redes, nodoDe, nombres }
}
type Circuito = ReturnType<typeof armar>

async function analizar(c: Circuito, a: AnalisisDoc, parametroEtiqueta?: { etiqueta: string; unidad: string }): Promise<ResultadoMapeado> {
  const p = peticionDe(a, { netlist: c.r.netlist!, piezaDeElemento: c.r.piezaDeElemento, nombreDePieza: c.nombres.pieza })
  if (!p.ok) throw new Error(p.error)
  const res = await servicio.ejecutar(1, p.peticion)
  if (!res.ok) throw new Error(res.error)
  const valores = a.parametro ? valoresDeParametro(a.parametro) : []
  return mapearResultados(a, res.graficos, { ...c.nombres, ...(parametroEtiqueta ? { parametro: parametroEtiqueta } : {}) }, valores)
}
const serie = (r: ResultadoMapeado, nodo: number, corrida = 0) => r.corridas[corrida].series.find((s) => s.id === `v:${nodo}`)!

/** La solución de CD del motor propio: voltajes de las redes y corriente de cada pieza. */
function motorDc(c: Circuito, fin: number, hmax: number): Lectura {
  const sim = new Simulator(JSON.stringify(c.r.netlist), hmax)
  sim.set_tolerances(1e-4, 1e-12, 1e-7)
  sim.advance_to(fin, 10_000_000)
  const n = sim.element_count()
  const f64 = (p: number, k = n) => new Float64Array(memoria.buffer, p, k).slice()
  const g = sim.digital_count()
  const l = leerResultados(c.r, { time: sim.time(), ratio: 1, capacity: 1, seq: 0, consistente: true, voltages: sim.voltages(), currents: f64(sim.currents_ptr()), aux: f64(sim.aux_ptr()), estado: f64(sim.estado_ptr()), niveles: f64(sim.niveles_ptr(), g), medidas: f64(sim.medidas_ptr(), 3 * g) })
  sim.free()
  return l
}
const redDe = (c: Circuito, nombre: string) => c.con.redes.findIndex((x) => x.nombre === nombre)

si('análisis contra ngspice 47', () => {
  it('Bode de un RC de 1 kΩ y 159.15 nF: fc de 1 kHz y -3.01 dB', async () => {
    const c = armar([DC('V1', '1', 'in'), R('R1', '1k', 'in', 'out'), C('C1', '159.15n', 'out', '0')])
    const res = await analizar(c, { id: 'a', nombre: 'Bode', config: { tipo: 'ac', barrido: 'dec', puntos: 100, desde: 10, hasta: 1e5, fuente: c.idDe('V1'), magnitud: 1 } })
    const s = serie(res, c.nodoDe('out'))
    const f = res.corridas[0].eje
    expect(res.ejeUnidad).toBe('Hz')
    expect(res.logX).toBe(true)
    expect(s.unidad).toBe('dB')
    // Corte: donde cruza -3.0103 dB, interpolando en log f.
    let fc = NaN
    for (let i = 1; i < f.length; i++) {
      if (s.valores[i - 1] > -3.0103 && s.valores[i] <= -3.0103) {
        const t = (-3.0103 - s.valores[i - 1]) / (s.valores[i] - s.valores[i - 1])
        fc = Math.pow(10, Math.log10(f[i - 1]) + t * (Math.log10(f[i]) - Math.log10(f[i - 1])))
      }
    }
    console.info(`RC: fc = ${fc.toFixed(2)} Hz`)
    expect(Math.abs(fc - 1000) / 1000).toBeLessThan(0.01)
    const iFc = Array.from(f).findIndex((x) => Math.abs(x - 1000) / 1000 < 1e-6)
    console.info(`RC: ganancia en 1 kHz = ${s.valores[iFc].toFixed(3)} dB, fase ${s.fase![iFc].toFixed(2)} grados`)
    expect(s.valores[iFc]).toBeCloseTo(-3.01, 1)
    expect(s.fase![iFc]).toBeCloseTo(-45, 0)
  })

  it('punto de operación del divisor y del emisor común igual al del motor propio', async () => {
    const casos: [string, Parte[], number, number][] = [
      ['divisor', [DC('V1', '5', '1'), R('R1', '1k', '1', '2'), R('R2', '1k', '2', '0')], 1e-3, 1e-5],
      ['emisor común', CASOS.npn_2n3904.partes, CASOS.npn_2n3904.fin, CASOS.npn_2n3904.hmax]
    ]
    for (const [nombre, partes, fin, hmax] of casos) {
      const c = armar(partes)
      const res = await analizar(c, { id: 'a', nombre, config: { tipo: 'op' } })
      const motor = motorDc(c, fin, hmax)
      let peor = 0
      for (const [nodo, red] of c.redes) {
        if (!serie(res, nodo)) throw new Error(`${nombre}: sin serie de ${red} (nodo ${nodo}): ${res.corridas[0].series.map((s) => s.id)} ${res.avisos}`)
        const v = serie(res, nodo).valores[0]
        const ref = motor.redes.get(redDe(c, red))!
        peor = Math.max(peor, Math.abs(v - ref) / (0.01 * Math.abs(ref) + 1e-6))
      }
      console.info(`${nombre}: peor diferencia con el motor = ${peor.toFixed(3)} del 1 %`)
      expect(peor, nombre).toBeLessThan(1)
    }
  })

  it('Fourier de una cuadrada: armónicos impares 1/n y THD cercano a 48.3 %', async () => {
    const c = armar([{ tipo: 'fuente-pulso', ref: 'V1', props: { alto: '1', frecuencia: '1k', ciclo: '50 %' }, pines: { '+': 'in', '-': '0' } }, R('R1', '1k', 'in', '0')])
    const res = await analizar(c, { id: 'a', nombre: 'F', config: { tipo: 'fourier', fundamental: 1000, armonicos: 199, periodos: 2, descarte: 1, ventana: 'rectangular' } })
    const f = res.corridas[0].fourier!.find((x) => x.id === `v:${c.nodoDe('in')}`)!
    const m1 = f.armonicos[0].magnitud
    expect(m1).toBeCloseTo(2 / Math.PI, 2)
    const razones: string[] = []
    for (const n of [3, 5, 7, 9]) {
      const r = f.armonicos[n - 1].magnitud / m1
      razones.push(`${n}: ${(r * n).toFixed(4)}`)
      expect(Math.abs(r * n - 1), `armónico ${n}`).toBeLessThan(0.02)
    }
    for (const n of [2, 4, 6, 8]) expect(f.armonicos[n - 1].magnitud / m1).toBeLessThan(0.01)
    console.info(`Fourier: m_n*n/m_1 ${razones.join(', ')}; THD = ${f.thd!.toFixed(2)} %`)
    expect(Math.abs(f.thd! - 48.3) / 48.3).toBeLessThan(0.02)
  })

  it('barrido de R en un divisor da la curva esperada', async () => {
    const c = armar([DC('V1', '5', '1'), R('R1', '1k', '1', '2'), R('R2', '1k', '2', '0')])
    const res = await analizar(c, { id: 'a', nombre: 'P', config: { tipo: 'op' }, parametro: { pieza: c.idDe('R1'), modo: 'lista', valores: [500, 1000, 2000, 4000] } }, { etiqueta: 'R1', unidad: 'Ω' })
    const s = serie(res, c.nodoDe('2'))
    expect(Array.from(res.corridas[0].eje)).toEqual([500, 1000, 2000, 4000])
    const esperado = [500, 1000, 2000, 4000].map((r) => (5 * 1000) / (r + 1000))
    esperado.forEach((e, i) => expect(s.valores[i]).toBeCloseTo(e, 6))
  })

  it('barrido de CD de un diodo da su curva I-V consistente con el motor', async () => {
    const diodo = (v: string): Parte[] => [DC('V1', v, '1'), R('R1', '10', '1', '2'), { tipo: 'diodo', ref: 'D1', pines: { A: '2', K: '0' } }]
    const c = armar(diodo('0'))
    const analisis: AnalisisDoc = { id: 'a', nombre: 'IV', config: { tipo: 'dc', fuente: c.idDe('V1'), desde: 0, hasta: 0.75, paso: 0.05 } }
    const kd = c.r.piezaDeElemento.findIndex((id) => id === c.idDe('D1'))
    const p = peticionDe(analisis, { netlist: c.r.netlist!, piezaDeElemento: c.r.piezaDeElemento }, { corrientes: [kd] })
    if (!p.ok) throw new Error(p.error)
    const out = await servicio.ejecutar(1, p.peticion)
    if (!out.ok) throw new Error(out.error)
    const res = mapearResultados(analisis, out.graficos, c.nombres, [], { corrientes: [kd] })
    const id = res.corridas[0].series.find((s) => s.id.startsWith('i:'))!
    const eje = res.corridas[0].eje
    let peor = 0
    for (const v of [0.5, 0.6, 0.65, 0.7, 0.75]) {
      const k = Array.from(eje).findIndex((x) => Math.abs(x - v) < 1e-9)
      const cm = armar(diodo(String(v)))
      const motor = motorDc(cm, 1e-3, 1e-5).piezas.get(cm.idDe('D1'))!.i
      peor = Math.max(peor, Math.abs(Math.abs(id.valores[k]) - Math.abs(motor)) / (0.01 * Math.abs(motor) + 1e-9))
    }
    console.info(`Diodo: peor diferencia con el motor = ${peor.toFixed(3)} del 1 %`)
    expect(peor).toBeLessThan(1)
  })
})

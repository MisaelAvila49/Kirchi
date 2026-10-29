// @vitest-environment happy-dom
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { carpetaHerramientas } from '../../../main/recursos'
import { localizarNgspice, ServicioNgspice } from '../../../main/servicioNgspice'
import { calcularConexiones } from '../conexiones/conexiones'
import { conEtiquetas, type Parte } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import type { ElementoMotor, NetlistMotor, Onda } from '../../../compartido/netlistMotor'
import { compilarNetlist } from './netlist'

// La netlist exportada de cada pieza (todas sus opciones de lista) la acepta el ngspice 47 real y un transitorio
// corto llega hasta el final. Sin `herramientas/ngspice` se omite (ngspice no se distribuye ni está en CI).

const raiz = join(import.meta.dirname, '../../../..')
const ejecutable = localizarNgspice({ empaquetado: false, carpetaHerramientas: carpetaHerramientas({ empaquetado: false, resourcesPath: '', appPath: raiz }), appPath: raiz })
const hay = (() => {
  if (!ejecutable) return false
  const r = spawnSync(ejecutable, ['-n', '-v'], { encoding: 'utf8', windowsHide: true })
  return /ngspice-47\b/.test(`${r.stdout}${r.stderr}`)
})()
if (!hay) console.warn('ngspice 47 no está en herramientas/ngspice: se omite la prueba de las piezas contra ngspice.')

const lib = libreriaDePrueba().piezas
const servicio = new ServicioNgspice({ ejecutable: ejecutable ?? 'ngspice', limiteMs: 60_000 })

function armar(tipo: string, props: Record<string, string>): Parte[] {
  const def = lib.get(tipo)!
  const pines = Object.fromEntries(def.pines.map((p) => [p.id, tipo === 'tierra' ? '0' : `r_${p.id}`]))
  const resistencias = tipo === 'tierra' ? [] : def.pines.map((p, i): Parte => ({ tipo: 'resistencia', ref: `R${i + 1}`, props: { valor: '1k' }, pines: { '1': `r_${p.id}`, '2': '0' } }))
  return [{ tipo, ref: 'U1', props, pines }, ...resistencias]
}

function variantes(tipo: string): Record<string, string>[] {
  const def = lib.get(tipo)!
  const out: Record<string, string>[] = [{}]
  for (const p of def.props) for (const o of p.opciones ?? []) if (o !== p.defecto) out.push({ [p.id]: o })
  return out
}

describe.skipIf(!hay)('ngspice acepta la netlist exportada de cada pieza', () => {
  it.each([...lib.keys()].filter((t) => t !== 'tierra' && t !== 'sin-equivalencia').sort())('%s', async (tipo) => {
    let corridas = 0
    for (const props of variantes(tipo)) {
      const d = conEtiquetas(lib, armar(tipo, props))
      const con = calcularConexiones(d, lib)
      const r = compilarNetlist(d, lib, con)
      if (!r.netlist || r.errores.length > 0) continue
      const res = await servicio.ejecutar(1, { netlist: r.netlist, analisis: { tipo: 'tran', paso: 1e-6, fin: 1e-4, uic: true } })
      if (!res.ok) throw new Error(`${tipo} ${JSON.stringify(props)}: ${res.error}`)
      expect(res.graficos[0].puntos, `${tipo} ${JSON.stringify(props)}`).toBeGreaterThan(2)
      corridas++
    }
    expect(corridas).toBeGreaterThan(0)
  }, 120_000)
})

describe.skipIf(!hay)('ngspice acepta la exportación de JFET, fuentes controladas y fuente por tramos', () => {
  const R = (a: number, b: number, ohms = 1000): ElementoMotor => ({ type: 'R', a, b, ohms })
  const V = (a: number, wave: Onda): ElementoMotor => ({ type: 'V', a, b: 0, wave })
  const casos: Record<string, NetlistMotor> = {
    'J canal N': { nodes: 4, elements: [V(1, { kind: 'dc', v: 5 }), V(2, { kind: 'dc', v: -1 }), R(1, 3), { type: 'J', d: 3, g: 2, s: 0, pjf: false, model: { vto: -2, beta: 1e-3, lambda: 0.01, is: 1e-14, n: 1, cgs: 1e-12, cgd: 1e-12, pb: 1, fc: 0.5, rd: 1, rs: 1, b: 1 } }] },
    'J canal P': { nodes: 4, elements: [V(1, { kind: 'dc', v: -5 }), V(2, { kind: 'dc', v: 1 }), R(1, 3), { type: 'J', d: 3, g: 2, s: 0, pjf: true, model: { vto: 2, beta: 1e-3 } }] },
    'E y G': { nodes: 5, elements: [V(1, { kind: 'dc', v: 1 }), R(1, 0), { type: 'E', p: 2, n: 0, cp: 1, cn: 0, ganancia: 3 }, R(2, 0), { type: 'G', p: 0, n: 3, cp: 1, cn: 0, gm: 1e-3 }, R(3, 0)] },
    'H y F': { nodes: 6, elements: [V(1, { kind: 'dc', v: 1 }), { type: 'R', a: 1, b: 2, ohms: 1000 }, { type: 'H', p: 3, n: 0, cp: 2, cn: 5, r: 500 }, R(3, 0), { type: 'F', p: 0, n: 4, cp: 5, cn: 0, ganancia: 2 }, R(4, 0)] },
    'PWL con r=0': { nodes: 2, elements: [V(1, { kind: 'pwl', puntos: [[0, 0], [5e-5, 5], [1e-4, 0]], repetir: true }), R(1, 0)] }
  }
  it.each(Object.keys(casos))('%s', async (nombre) => {
    const res = await servicio.ejecutar(1, { netlist: casos[nombre], analisis: { tipo: 'tran', paso: 1e-6, fin: 1e-4, uic: true } })
    if (!res.ok) throw new Error(`${nombre}: ${res.error}`)
    expect(res.graficos[0].puntos, nombre).toBeGreaterThan(2)
  }, 60_000)
})

describe.skipIf(!hay)('ngspice acepta termistor, fotorresistencia, motor a pasos y fuente externa y da el valor del motor', () => {
  const I = (b: number, amps: number): ElementoMotor => ({ type: 'I', a: 0, b, amps })
  const TERM = (): ElementoMotor => ({ type: 'TERM', a: 1, b: 0, tipo: 'ntc', r25: 10000, beta: 3950, delta: 1, tau: 10, canal: 0, tmax: 150 })
  const LDR: ElementoMotor = { type: 'LDR', a: 1, b: 0, r10: 14142, gamma: 0.6, roscuro: 1e6, tau_sube: 0.02, tau_baja: 0.05, canal: 0 }
  const PASOS = (unipolar: boolean): ElementoMotor => ({ type: 'PASOS', nodos: unipolar ? [2, 0, 3, 0, 4, 5] : [2, 0, 3, 0], unipolar, r: 10, l: 0.01, km: 0.1, dientes: 50, td: 1e-3, j: 1e-5, bm: 1e-4 })

  /** Voltaje de un nodo en el punto de operación. */
  async function operacion(netlist: NetlistMotor, nodo: string): Promise<number> {
    const res = await servicio.ejecutar(1, { netlist, analisis: { tipo: 'op' } })
    if (!res.ok) throw new Error(res.error)
    const v = res.graficos[0].vectores.find((x) => x.nombre.toLowerCase().replace(/^v\((.*)\)$/, '$1') === nodo)
    if (!v) throw new Error(`sin ${nodo} en ${res.graficos[0].vectores.map((x) => x.nombre).join(' ')}`)
    return v.re[0]
  }

  it('el termistor da R a 25 y a 50 °C del valor de su canal', async () => {
    // 10 µA: el autocalentamiento (1 µW sobre 1 W/K) no mueve la resistencia.
    for (const [t, r] of [[25, 10000], [50, 10000 * Math.exp(3950 * (1 / 323.15 - 1 / 298.15))]]) {
      const v = await operacion({ nodes: 2, canales: [{ inicial: t }], elements: [I(1, 1e-5), TERM()] }, 'n1')
      expect(v / 1e-5, `${t} °C`).toBeCloseTo(r, -Math.ceil(Math.log10(r * 1e-3)))
    }
  }, 60_000)

  it('la fotorresistencia da r10 a 10 lx y la fórmula a 1000 lx', async () => {
    const v10 = await operacion({ nodes: 2, canales: [{ inicial: 10 }], elements: [I(1, 1e-4), LDR] }, 'n1')
    expect(v10 / 1e-4).toBeCloseTo(14142, 0)
    const v1000 = await operacion({ nodes: 2, canales: [{ inicial: 1000 }], elements: [I(1, 1e-4), LDR] }, 'n1')
    expect(v1000 / 1e-4).toBeCloseTo(14142 / 100 ** 0.6, 0)
  }, 60_000)

  it.each(['TERM', 'LDR', 'PASOS bipolar', 'PASOS unipolar'])('%s corre un transitorio con arranque forzado', async (nombre) => {
    const pieza = nombre === 'TERM' ? TERM() : nombre === 'LDR' ? LDR : PASOS(nombre.endsWith('unipolar'))
    const pasos = nombre.startsWith('PASOS')
    const elementos: ElementoMotor[] = [{ type: 'V', a: 1, b: 0, wave: { kind: 'pulse', low: 0, high: 5, freq: 500, rise: 1e-5, fall: 1e-5, width: 1e-3 } }, { type: 'R', a: 1, b: 2, ohms: 100 }, pasos ? pieza : { ...(pieza as Extract<ElementoMotor, { type: 'TERM' | 'LDR' }>), a: 2, b: 0 }]
    const res = await servicio.ejecutar(1, { netlist: { nodes: 6, canales: [{ inicial: 100 }], elements: elementos }, analisis: { tipo: 'tran', paso: 1e-5, fin: 2e-3, uic: true } })
    if (!res.ok) throw new Error(nombre + ': ' + res.error)
    expect(res.graficos[0].puntos, nombre).toBeGreaterThan(20)
  }, 60_000)

  it('la fuente externa de voltaje da k por el canal más c', async () => {
    const v = await operacion({ nodes: 3, canales: [{ inicial: 250 }], elements: [{ type: 'EXT', a: 1, b: 0, modo: 'v', canal: 0, k: 0.01, c: 0.5 }, { type: 'R', a: 1, b: 0, ohms: 1000 }] }, 'n1')
    expect(v).toBeCloseTo(3, 6)
  }, 60_000)

  it.each([false, true])('el motor a pasos con unipolar=%s sujeto toma V/R en la fase energizada', async (unipolar) => {
    // 5 V por 1 Ω a la fase A con el rotor en θ = 0 (sin par ni fuerza contraelectromotriz): el bipolar tiene 10 Ω y el unipolar, sus dos mitades en serie, 20 Ω.
    const elementos: ElementoMotor[] = [{ type: 'V', a: 1, b: 0, wave: { kind: 'dc', v: 5 } }, { type: 'R', a: 1, b: 2, ohms: 1 }, PASOS(unipolar)]
    const v = await operacion({ nodes: 6, canales: [], elements: elementos }, 'n2')
    const r = unipolar ? 20 : 10
    expect(v).toBeCloseTo((5 * r) / (r + 1), 3)
  }, 60_000)
})

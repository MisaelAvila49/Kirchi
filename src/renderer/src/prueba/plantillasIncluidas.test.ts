// @vitest-environment happy-dom
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { serializarDocumento } from '../archivo/kir'
import { calcularConexiones } from '../conexiones/conexiones'
import type { Documento } from '../doc/tipos'
import { colisiona, cuerpoEnMundo } from '../editor/colision'
import { conflictoDeTocados, tramoCruzaCaja } from '../editor/conflictos'
import { cajaNota } from '../lienzo/medidas'
import { compilarNetlist } from '../netlist/netlist'
import init, { Simulator } from '../sim/pkg/kirchi_engine.js'
import { avisosDelCircuito } from '../ui/proyecto'
import { libreriaDePrueba, RAIZ_COMPONENTES } from './libreria'
import { construir, DEFINICIONES, type DefPlantilla } from './plantillasIncluidas'

const lib = libreriaDePrueba().piezas
const CARPETA = join(RAIZ_COMPONENTES, 'plantillas')

beforeAll(async () => {
  await init({ module_or_path: readFileSync(join(import.meta.dirname, '../sim/pkg/kirchi_engine_bg.wasm')) })
})

/** El archivo que se publica: la ficha y el circuito tal como lo escribe el editor. */
export function archivoDe(def: DefPlantilla, doc: Documento): string {
  return JSON.stringify({ id: def.id, nombre: def.nombre, descripcion: def.descripcion, circuito: JSON.parse(serializarDocumento(doc)) }, null, 2) + '\n'
}

/** Simula y devuelve los voltajes de las redes de los pines pedidos (`clave.pin`) tras `t` segundos. */
export function voltajes(doc: Documento, pines: string[], t: number, paso = 1e-6): Record<string, number> {
  const con = calcularConexiones(doc, lib)
  const r = compilarNetlist(doc, lib, con)
  expect(r.errores).toEqual([])
  const sim = new Simulator(JSON.stringify(r.netlist), paso)
  sim.advance_to(t, 200000)
  const v = sim.voltages()
  sim.free()
  const out: Record<string, number> = {}
  for (const clave of pines) {
    const [pieza, pin] = clave.split('.')
    const red = con.redDePin.get(`p_${pieza}:${pin}`)
    if (red === undefined) throw new Error(`${clave}: sin red`)
    out[clave] = v[r.nodoDeRed.get(red)!]
  }
  return out
}

/** Voltaje de un pin cada `cada` segundos entre `desde` y `hasta` (el simulador avanza de a pasos hasta cada instante). */
export function traza(doc: Documento, pin: string, desde: number, hasta: number, cada: number, paso = 1e-6): { t: number; v: number }[] {
  const con = calcularConexiones(doc, lib)
  const r = compilarNetlist(doc, lib, con)
  expect(r.errores).toEqual([])
  const [pieza, id] = pin.split('.')
  const nodo = r.nodoDeRed.get(con.redDePin.get(`p_${pieza}:${id}`)!)!
  const sim = new Simulator(JSON.stringify(r.netlist), paso)
  const out: { t: number; v: number }[] = []
  for (let t = desde; t <= hasta + 1e-12; t += cada) {
    sim.advance_to(t, 400000)
    out.push({ t, v: sim.voltages()[nodo] })
  }
  sim.free()
  return out
}

describe('plantillas incluidas: reglas del editor', () => {
  it.each(DEFINICIONES.map((d) => [d.id, d] as const))('%s: sin piezas encimadas, cables limpios, todas las conexiones unidas y ningún aviso', (_id, def) => {
    const d = construir(def, lib)
    for (const p of Object.values(d.piezas)) expect(colisiona(d, lib, p), p.ref).toBeNull()
    expect(conflictoDeTocados(d, lib, { piezas: Object.keys(d.piezas), cables: Object.keys(d.cables) })).toBeNull()
    expect(avisosDelCircuito(d, calcularConexiones(d, lib), lib)).toEqual([])
    const con = calcularConexiones(d, lib)
    for (const [a, b] of def.conexiones) {
      const red = (c: string) => con.redDePin.get(`p_${c.split('.')[0]}:${c.split('.')[1]}`)
      expect(red(a), `${a} - ${b}`).toBeDefined()
      expect(red(a), `${a} - ${b}`).toBe(red(b))
    }
    // La nota queda aparte: no cubre ninguna pieza ni cruza ningún cable.
    for (const n of Object.values(d.notas)) {
      const c = cajaNota(n)
      for (const p of Object.values(d.piezas)) {
        const q = cuerpoEnMundo(p, lib.get(p.tipo), 1)
        expect(c.minX < q.maxX && q.minX < c.maxX && c.minY < q.maxY && q.minY < c.maxY, `la nota cubre ${p.ref}`).toBe(false)
      }
      for (const k of Object.values(d.cables))
        for (let i = 1; i < k.puntos.length; i++) expect(tramoCruzaCaja(k.puntos[i - 1], k.puntos[i], c), 'la nota cruza un cable').toBe(false)
    }
    expect(def.descripcion.length).toBeLessThanOrEqual(160)
    expect(`${def.nombre}${def.descripcion}`).not.toMatch(/—/)
  })

  it('los ids son únicos y cada archivo del disco es exactamente lo que arma el código (KIRCHI_PLANTILLAS=1 los reescribe)', () => {
    expect(new Set(DEFINICIONES.map((d) => d.id)).size).toBe(DEFINICIONES.length)
    if (process.env.KIRCHI_PLANTILLAS) mkdirSync(CARPETA, { recursive: true })
    for (const def of DEFINICIONES) {
      const texto = archivoDe(def, construir(def, lib))
      const ruta = join(CARPETA, `${def.id}.json`)
      if (process.env.KIRCHI_PLANTILLAS) writeFileSync(ruta, texto)
      expect(existsSync(ruta), `${ruta}: falta (corre con KIRCHI_PLANTILLAS=1)`).toBe(true)
      expect(readFileSync(ruta, 'utf8').split(String.fromCharCode(13, 10)).join(String.fromCharCode(10)), def.id).toBe(texto)
    }
  })
})

describe('plantillas incluidas: simulación', () => {
  const doc = (id: string) => construir(DEFINICIONES.find((d) => d.id === id)!, lib)

  it('divisor de voltaje: 9 V · 4.7k / (10k + 4.7k)', () => {
    const v = voltajes(doc('divisor-de-voltaje'), ['r1.1', 'r1.2', 'r2.2'], 1e-3)
    expect(v['r1.1']).toBeCloseTo(9, 3)
    expect(v['r1.2']).toBeCloseTo((9 * 4700) / 14700, 3)
    expect(v['r2.2']).toBeCloseTo(0, 6)
  })

  it('LED con resistencia: unos 9 mA, el LED cae cerca de 2 V', () => {
    const v = voltajes(doc('led-con-resistencia'), ['r1.2'], 5e-3)
    expect(v['r1.2']).toBeGreaterThan(1.6)
    expect(v['r1.2']).toBeLessThan(2.3)
    const i = (5 - v['r1.2']) / 330
    expect(i).toBeGreaterThan(0.008)
    expect(i).toBeLessThan(0.011)
  })
  it('filtro paso bajas: a 1 kHz pasa el 84.7 % de la señal (fc = 1.59 kHz)', () => {
    const v = traza(doc('filtro-rc-paso-bajas'), 'c1.1', 8e-3, 10e-3, 5e-6).map((m) => m.v)
    expect((Math.max(...v) - Math.min(...v)) / 2).toBeCloseTo(0.847, 1)
  })

  it('filtro paso altas: a 1 kHz pasa el 53.2 % de la señal', () => {
    const v = traza(doc('filtro-rc-paso-altas'), 'r1.1', 8e-3, 10e-3, 5e-6).map((m) => m.v)
    expect((Math.max(...v) - Math.min(...v)) / 2).toBeCloseTo(0.532, 1)
  })

  it('555 astable: oscila cerca de 686 Hz', () => {
    const m = traza(doc('555-astable'), 'u1.3', 0, 30e-3, 10e-6)
    const subidas = m.filter((x, i) => i > 0 && x.v >= 2.5 && m[i - 1].v < 2.5).map((x) => x.t)
    expect(subidas.length).toBeGreaterThan(10)
    const f = (subidas.length - 1) / (subidas.at(-1)! - subidas[0])
    expect(f).toBeGreaterThan(640)
    expect(f).toBeLessThan(730)
  })

  it('555 monoestable: en reposo la salida está baja y el disparo la sube unos 0.11 s', () => {
    const m = traza(doc('555-monoestable'), 'u1.3', 0, 1.2, 2e-3, 2e-6)
    const altas = m.filter((x) => x.v > 2.5)
    expect(altas.length).toBeGreaterThan(0)
    // Cada pulso dura T = 1.1 · R1 · C1 = 0.11 s (la fuente de disparo repite cada 0.5 s).
    const dur: number[] = []
    let ini: number | null = null
    for (let i = 0; i < m.length; i++) {
      if (m[i].v > 2.5 && ini === null) ini = m[i].t
      if (m[i].v <= 2.5 && ini !== null) {
        dur.push(m[i].t - ini)
        ini = null
      }
    }
    expect(dur.length).toBeGreaterThan(0)
    for (const d of dur) {
      expect(d).toBeGreaterThan(0.09)
      expect(d).toBeLessThan(0.135)
    }
  })

  it('emisor común: base cerca de 2 V, emisor cerca de 1.4 V y colector cerca de 9 V', () => {
    const v = voltajes(doc('emisor-comun'), ['q1.B', 'q1.E', 'q1.C'], 0.3)
    expect(v['q1.B']).toBeGreaterThan(1.7)
    expect(v['q1.B']).toBeLessThan(2.3)
    expect(v['q1.B'] - v['q1.E']).toBeGreaterThan(0.55)
    expect(v['q1.B'] - v['q1.E']).toBeLessThan(0.8)
    expect(v['q1.C']).toBeGreaterThan(8.3)
    expect(v['q1.C']).toBeLessThan(9.6)
  })

  it('amplificador inversor: 0.5 V a la entrada dan −5 V', () => {
    const v = voltajes(doc('amplificador-inversor'), ['u1.OUT'], 5e-3)
    expect(v['u1.OUT']).toBeCloseTo(-5, 1)
  })

  it('amplificador no inversor: 0.5 V a la entrada dan 5.5 V', () => {
    const v = voltajes(doc('amplificador-no-inversor'), ['u1.OUT'], 5e-3)
    expect(v['u1.OUT']).toBeCloseTo(5.5, 1)
  })

  it('puente rectificador: la salida queda entre 10 y 11 V con un rizo menor de 0.6 V', () => {
    const v = traza(doc('puente-rectificador'), 'c1.+', 0.2, 0.2167, 2e-4).map((m) => m.v)
    expect(Math.min(...v)).toBeGreaterThan(10)
    expect(Math.max(...v)).toBeLessThan(11)
    expect(Math.max(...v) - Math.min(...v)).toBeLessThan(0.6)
  })
})

/** Amplitud (pico) en un pin con el generador `g1` a la frecuencia `f`, tras asentarse el transitorio. */
function amplitudEn(doc: Documento, pin: string, f: number, periodosAsentar = 25): number {
  const d: Documento = JSON.parse(JSON.stringify(doc))
  d.piezas.p_g1.props.frecuencia = String(f)
  const T = 1 / f
  const v = traza(d, pin, periodosAsentar * T, (periodosAsentar + 2) * T, T / 100, Math.min(1e-5, T / 200)).map((m) => m.v)
  return (Math.max(...v) - Math.min(...v)) / 2
}

describe('plantillas incluidas: filtros de banda', () => {
  const doc = (id: string) => construir(DEFINICIONES.find((d) => d.id === id)!, lib)

  it('pasa banda: pasa casi todo en el centro (1 kHz) y poco a 10 Hz y a 1 MHz', () => {
    const d = doc('filtro-pasa-banda')
    expect(amplitudEn(d, 'c2.1', 1000)).toBeGreaterThan(0.95)
    expect(amplitudEn(d, 'c2.1', 1000)).toBeLessThan(1.001)
    expect(amplitudEn(d, 'c2.1', 10, 3)).toBeLessThan(0.15)
    expect(amplitudEn(d, 'c2.1', 1e6)).toBeLessThan(0.1)
  })
  it('rechaza banda: el centro cae por debajo de 0.1 y la banda baja pasa con 0.9', () => {
    const d = doc('filtro-rechaza-banda')
    expect(amplitudEn(d, 'u1.OUT', 1000)).toBeLessThan(0.1)
    expect(amplitudEn(d, 'u1.OUT', 10, 3)).toBeGreaterThan(0.85)
    expect(amplitudEn(d, 'u1.OUT', 10, 3)).toBeLessThan(0.95)
  })
  it('notch de doble T: anula 60 Hz (cae a menos de 0.03) y deja pasar una década antes con 0.927', () => {
    const d = doc('filtro-notch-doble-t')
    const f0 = 1 / (2 * Math.PI * 27e3 * 100e-9)
    expect(f0).toBeCloseTo(58.95, 1)
    expect(amplitudEn(d, 'c2.2', f0, 40)).toBeLessThan(0.03)
    expect(amplitudEn(d, 'c2.2', f0 / 10, 4)).toBeCloseTo(0.927, 1)
  })
})

describe('plantillas incluidas: lógica MSI', () => {
  it('contador de 0 a 99: cada flanco del reloj suma uno en los displays, arrastra de 9 a 10 y vuelve a 00 después de 99', () => {
    const d = construir(DEFINICIONES.find((x) => x.id === 'contador-0-a-99')!, lib)
    // El reloj de 2 Hz se acelera a 1 kHz para no simular medio minuto.
    d.piezas.p_v1.props = { ...d.piezas.p_v1.props, frecuencia: '1k', retardo: '400u' }
    const con = calcularConexiones(d, lib)
    const r = compilarNetlist(d, lib, con)
    expect(r.errores).toEqual([])
    const sim = new Simulator(JSON.stringify(r.netlist), 2e-6)
    const nodo = (clave: string) => r.nodoDeRed.get(con.redDePin.get(`p_${clave.split('.')[0]}:${clave.split('.')[1]}`)!)!
    const tabla = ['abcdef', 'bc', 'abdeg', 'abcdg', 'bcfg', 'acdfg', 'cdefg', 'abc', 'abcdefg', 'abcdfg']
    // Un segmento encendido está a menos de 0.5 V; uno apagado queda cerca de 1 V.
    const digito = (display: string) => {
      const v = sim.voltages()
      return String(tabla.indexOf([...'abcdefg'].filter((s) => v[nodo(`${display}.${s}`)] < 0.5).join('')))
    }
    const leidos: Record<number, string> = {}
    const pedidos = [1, 2, 9, 10, 11, 19, 20, 99, 100, 101]
    for (const k of pedidos) {
      // El k-ésimo flanco de subida cae en 0.4 ms + (k - 1) ms; se lee 0.25 ms después.
      sim.advance_to(0.65e-3 + (k - 1) * 1e-3, 400000)
      leidos[k] = `${digito('d2')}${digito('d1')}`
    }
    sim.free()
    expect(leidos).toEqual({ 1: '01', 2: '02', 9: '09', 10: '10', 11: '11', 19: '19', 20: '20', 99: '99', 100: '00', 101: '01' })
  })
})

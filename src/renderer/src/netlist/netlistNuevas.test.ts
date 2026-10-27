// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { calcularConexiones } from '../conexiones/conexiones'
import type { Documento } from '../doc/tipos'
import { conEtiquetas, type Parte } from '../prueba/circuitos'
import { conPiezas, perilla, piezaDePrueba } from '../prueba/piezasNuevas'
import type { ModeloDef, PiezaDef } from '../piezas/tipos'
import { compilarNetlist, type ElementoMotor } from './netlist'

// Las piezas nuevas se prueban aquí con definiciones en línea.
const opciones = (...ids: string[]) => ({ id: 'modelo', nombre: 'Modelo', defecto: ids[0], opciones: ids })
const V = (ref: string, v: string, mas: string, menos = '0'): Parte => ({ tipo: 'fuente-dc', ref, props: { voltaje: v }, pines: { '+': mas, '-': menos } })
const R = (ref: string, valor: string, a: string, b: string): Parte => ({ tipo: 'resistencia', ref, props: { valor }, pines: { '1': a, '2': b } })

const compilar = (lib: Map<string, PiezaDef>, partes: Parte[]) => {
  const d: Documento = conEtiquetas(lib, partes)
  return compilarNetlist(d, lib, calcularConexiones(d, lib))
}
const de = <T extends ElementoMotor['type']>(els: ElementoMotor[], tipo: T) => els.filter((e) => e.type === tipo) as Extract<ElementoMotor, { type: T }>[]

const jfet = piezaDePrueba('jfet-t', ['D', 'G', 'S'], [opciones('J201', '2N5457')], {
  tipo: 'jfet', d: 'D', g: 'G', s: 'S', pjf: false, prop: 'modelo', modelos: { J201: { vto: -1, beta: 1e-3 }, '2N5457': { vto: -2, beta: 2e-3 } }
})
const ntc: ModeloDef = { tipo: 'termistor', a: '1', b: '2', prop: 'modelo', temperatura: 'temp', modelos: { '10k': { r25: 1e4, beta: 3950, delta: 1.5e-3, tau: 10, tmax: 150 } } }
const ntcDef = piezaDePrueba('ntc-t', ['1', '2'], [opciones('10k'), perilla('temp', 'Temperatura', '°C', '25', -40, 150)], ntc, 'TH')
const ldrDef = piezaDePrueba('ldr-t', ['1', '2'], [opciones('GL5528'), perilla('luz', 'Luz', 'lx', '300', 0.1, 1e5, 'log')], {
  tipo: 'ldr', a: '1', b: '2', prop: 'modelo', luz: 'luz', modelos: { GL5528: { r10: 2e4, gamma: 0.7, roscuro: 1e6, tau_sube: 0.02, tau_baja: 0.03 } }
}, 'LDR')

describe('netlist de las piezas nuevas', () => {
  it('un JFET llega al motor con el modelo de su opción y su canal', () => {
    const lib = conPiezas(jfet)
    const r = compilar(lib, [V('V1', '5', 'd'), R('R1', '1k', 'd', 'dr'), { tipo: 'jfet-t', ref: 'J1', props: { modelo: '2N5457' }, pines: { D: 'dr', G: '0', S: '0' } }])
    expect(r.errores).toEqual([])
    const [j] = de(r.netlist!.elements, 'J')
    expect(j).toMatchObject({ pjf: false, model: { vto: -2, beta: 2e-3 } })
    expect(r.netlist!.canales).toBeUndefined()
  })

  it('un termistor lee su temperatura de un canal con el valor del documento y la perilla sabe cuál', () => {
    const lib = conPiezas(ntcDef)
    const r = compilar(lib, [V('V1', '5', 'a'), { tipo: 'ntc-t', ref: 'TH1', props: { temp: '40' }, pines: { '1': 'a', '2': 'b' } }, R('R1', '1k', 'b', '0')])
    expect(r.errores).toEqual([])
    expect(r.netlist!.canales).toEqual([{ inicial: 40 }])
    expect(r.canalDe.get('p_1:temp')).toBe(0)
    expect(de(r.netlist!.elements, 'TERM')[0]).toMatchObject({ tipo: 'ntc', r25: 1e4, beta: 3950, delta: 1.5e-3, tau: 10, tmax: 150, canal: 0 })
    expect(de(r.netlist!.elements, 'TERM')[0].rt).toBeUndefined()
  })

  it('un PTC con tabla manda la tabla de su opción', () => {
    const tabla: [number, number][] = [[-20, 500], [25, 1000], [120, 20000]]
    const def = piezaDePrueba('ptc-t', ['1', '2'], [opciones('P'), perilla('temp', 'Temperatura', '°C', '25', -40, 150)], { ...ntc, ptc: true, modelos: { P: { r25: 1e3, beta: 3000, delta: 1e-3, tau: 5, tmax: 150 } }, tablas: { P: tabla } } as ModeloDef, 'TH')
    const r = compilar(conPiezas(def), [V('V1', '5', 'a'), { tipo: 'ptc-t', ref: 'TH1', props: {}, pines: { '1': 'a', '2': '0' } }, R('R1', '1k', 'a', '0')])
    expect(r.errores).toEqual([])
    expect(de(r.netlist!.elements, 'TERM')[0]).toMatchObject({ tipo: 'ptc', rt: tabla })
  })

  it('cada perilla tiene su canal, en el orden de las piezas, y el valor sale del documento', () => {
    const lib = conPiezas(ntcDef, ldrDef)
    const r = compilar(lib, [
      V('V1', '5', 'a'),
      { tipo: 'ntc-t', ref: 'TH1', props: { temp: '-10' }, pines: { '1': 'a', '2': 'b' } },
      { tipo: 'ldr-t', ref: 'LDR1', props: {}, pines: { '1': 'b', '2': 'c' } },
      R('R1', '1k', 'c', '0')
    ])
    expect(r.errores).toEqual([])
    expect(r.netlist!.canales).toEqual([{ inicial: -10 }, { inicial: 300 }])
    expect([...r.canalDe]).toEqual([['p_1:temp', 0], ['p_2:luz', 1]])
    expect(de(r.netlist!.elements, 'LDR')[0]).toMatchObject({ r10: 2e4, gamma: 0.7, roscuro: 1e6, tau_sube: 0.02, tau_baja: 0.03, canal: 1 })
  })

  it('un valor de perilla fuera de su rango o ilegible se dice con la pieza', () => {
    const lib = conPiezas(ntcDef)
    const armar = (temp: string) => compilar(lib, [V('V1', '5', 'a'), { tipo: 'ntc-t', ref: 'TH1', props: { temp }, pines: { '1': 'a', '2': '0' } }])
    expect(armar('200').errores).toContain('El valor de Temperatura de TH1 debe estar entre -40 y 150 °C.')
    expect(armar('abc').errores).toContain('El valor «abc» de TH1 no es válido.')
    expect(armar('200').netlist).toBeNull()
  })

  it('el motor a pasos bipolar lleva sus cuatro nodos y el unipolar los seis con la toma central repetida', () => {
    const pasos = (nodos: string[], pines: string[], unipolar: boolean) =>
      piezaDePrueba('motor-t', pines, [opciones('M'), perilla('carga', 'Carga', 'N·m', '0', 0, 1)], {
        tipo: 'pasos', nodos, ...(unipolar ? { unipolar: true as const } : {}), prop: 'modelo', carga: 'carga',
        modelos: { M: { r: 1.5, l: 2.8e-3, km: 0.17, dientes: 50, td: 0.02, j: 5.4e-6, bm: 1e-4, ...(unipolar ? { k_mutua: 0.95, reduccion: 64 } : {}) } }
      } as ModeloDef, 'M')
    const bi = compilar(conPiezas(pasos(['A1', 'A2', 'B1', 'B2'], ['A1', 'A2', 'B1', 'B2'], false)), [
      V('V1', '5', 'a'), R('R1', '10', 'a', 'a1'), R('R2', '10', 'a', 'b1'), R('R3', '1', 'a2', '0'), R('R4', '1', 'b2', '0'),
      { tipo: 'motor-t', ref: 'M1', props: { carga: '0.01' }, pines: { A1: 'a1', A2: 'a2', B1: 'b1', B2: 'b2' } }
    ])
    expect(bi.errores).toEqual([])
    const [m] = de(bi.netlist!.elements, 'PASOS')
    expect(m.nodos).toHaveLength(4)
    expect(m).toMatchObject({ r: 1.5, dientes: 50, canal_carga: 0 })
    expect(m.unipolar).toBeUndefined()
    expect(bi.netlist!.canales).toEqual([{ inicial: 0.01 }])
    const uni = compilar(conPiezas(pasos(['A', 'C', 'A2', 'B', 'C', 'B2'], ['A', 'C', 'A2', 'B', 'B2'], true)), [
      V('V1', '5', 'c'), R('R1', '10', 'a', '0'), R('R2', '10', 'a2', '0'), R('R3', '10', 'b', '0'), R('R4', '10', 'b2', '0'),
      { tipo: 'motor-t', ref: 'M1', props: {}, pines: { A: 'a', C: 'c', A2: 'a2', B: 'b', B2: 'b2' } }
    ])
    expect(uni.errores).toEqual([])
    const [u] = de(uni.netlist!.elements, 'PASOS')
    expect(u.nodos).toHaveLength(6)
    expect(u.nodos[1]).toBe(u.nodos[4])
    expect(u).toMatchObject({ unipolar: true, k_mutua: 0.95, reduccion: 64, canal_carga: 0 })
  })

  it('las cuatro fuentes controladas llevan su ganancia', () => {
    const forma = (f: 'E' | 'G' | 'H' | 'F', prop: string) =>
      piezaDePrueba(`ctl-${f}`, ['P', 'N', 'CP', 'CN'], [{ id: prop, nombre: 'Ganancia', defecto: '1' }], { tipo: 'controlada', forma: f, p: 'P', n: 'N', cp: 'CP', cn: 'CN', prop }, f)
    const lib = conPiezas(forma('E', 'k'), forma('G', 'k'), forma('H', 'k'), forma('F', 'k'))
    const r = compilar(lib, [
      V('V1', '1', 'c'), R('R1', '1k', 'c', 'x'), R('R1b', '1k', 'c', 'y'),
      ...(['E', 'G', 'H', 'F'] as const).flatMap((f, k) => [
        { tipo: `ctl-${f}`, ref: `${f}1`, props: { k: String(k + 2) }, pines: { P: `o${f}`, N: '0', CP: f === 'F' ? 'y' : 'x', CN: '0' } },
        R(`RL${f}`, '1k', `o${f}`, '0')
      ])
    ])
    expect(r.errores).toEqual([])
    const els = r.netlist!.elements
    expect(de(els, 'E')[0]).toMatchObject({ ganancia: 2 })
    expect(de(els, 'G')[0]).toMatchObject({ gm: 3 })
    expect(de(els, 'H')[0]).toMatchObject({ r: 4 })
    expect(de(els, 'F')[0]).toMatchObject({ ganancia: 5 })
  })

  describe('fuente por tramos', () => {
    const pwl = piezaDePrueba('pwl-t', ['A', 'B'], [
      { id: 'puntos', nombre: 'Puntos', defecto: '0 0, 1m 5, 2m 5, 3m 0', texto: true, largoMax: 8000 },
      { id: 'repetir', nombre: 'Repetir', defecto: 'No', opciones: ['No', 'Sí'], casilla: true },
      { id: 'modo', nombre: 'Modo', defecto: 'Voltaje', opciones: ['Voltaje', 'Corriente'] }
    ], { tipo: 'pwl', a: 'A', b: 'B', puntos: 'puntos', repetir: 'repetir', modo: 'modo' }, 'V')
    const armar = (props: Record<string, string>) => compilar(conPiezas(pwl), [{ tipo: 'pwl-t', ref: 'V1', props, pines: { A: 'a', B: '0' } }, R('R1', '1k', 'a', '0')])

    it('llega como una fuente de voltaje con sus puntos, y repite si se pide', () => {
      const r = armar({})
      expect(r.errores).toEqual([])
      expect(de(r.netlist!.elements, 'V')[0].wave).toEqual({ kind: 'pwl', puntos: [[0, 0], [1e-3, 5], [2e-3, 5], [3e-3, 0]] })
      expect(de(armar({ repetir: 'Sí' }).netlist!.elements, 'V')[0].wave).toMatchObject({ kind: 'pwl', repetir: true })
    })

    it('unos puntos mal escritos se dicen con la pieza, y el modo corriente avisa que aún no se simula', () => {
      expect(armar({ puntos: '1m 0, 2m 1' }).errores).toEqual(['Los puntos de V1 no son válidos: el primer tiempo debe ser 0.'])
      expect(armar({ modo: 'Corriente' }).errores).toEqual(['V1 en modo corriente aún no se simula.'])
    })
  })

  describe('compuesto con perilla, valor lineal y transistores de efecto de campo', () => {
    const sensor = piezaDePrueba('sensor-t', ['OUT', 'GND', 'G'], [perilla('temp', 'Temperatura', '°C', '25', -55, 150)], {
      tipo: 'compuesto', medida: { mas: 'OUT', menos: 'GND', i: 1 }, terminales: ['OUT', 'GND', 'G'], internas: ['X'],
      elementos: [
        { t: 'EXT', a: 'OUT', b: 'X', modo: 'v', canal: 'temp', k: 0.01, c: 0.5 },
        { t: 'R', a: 'X', b: 'GND', ohms: { prop: 'temp', por: 10, mas: 100 } },
        { t: 'M', d: 'OUT', g: 'G', s: 'GND', params: { vto: 1 } },
        { t: 'J', d: 'OUT', g: 'G', s: 'GND', params: { vto: -1 } }
      ]
    } as ModeloDef)
    it('la EXT toma el canal de su perilla y el valor lineal se resuelve con la temperatura del documento', () => {
      const r = compilar(conPiezas(sensor), [{ tipo: 'sensor-t', ref: 'U1', props: { temp: '30' }, pines: { OUT: 'o', GND: '0', G: 'g' } }, R('R1', '1k', 'o', '0'), R('R2', '1k', 'g', '0')])
      expect(r.errores).toEqual([])
      expect(de(r.netlist!.elements, 'EXT')[0]).toMatchObject({ modo: 'v', canal: 0, k: 0.01, c: 0.5 })
      expect(de(r.netlist!.elements, 'R').some((e) => e.ohms === 400)).toBe(true)
      expect(tipos(r.netlist!.elements)).toEqual(expect.arrayContaining(['EXT', 'M', 'J']))
      expect(r.canalDe.get('p_0:temp')).toBe(0)
      expect(r.netlist!.canales).toEqual([{ inicial: 30 }])
    })
    it('una EXT que nombra una perilla que la pieza no tiene da error', () => {
      const m = sensor.modelo as Extract<ModeloDef, { tipo: 'compuesto' }>
      const malo = { ...sensor, props: [], modelo: { ...m, elementos: m.elementos.map((e) => (e.t === 'R' ? { ...e, ohms: 100 } : e)) } }
      const r = compilar(conPiezas(malo), [{ tipo: 'sensor-t', ref: 'U1', props: {}, pines: { OUT: 'o', GND: '0', G: 'g' } }, R('R1', '1k', 'o', '0')])
      expect(r.errores).toContain('La perilla «temp» de U1 no existe o no se pudo leer.')
    })
  })
})

const tipos = (els: ElementoMotor[]) => els.map((e) => e.type)

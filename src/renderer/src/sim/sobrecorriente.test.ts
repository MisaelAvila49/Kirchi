// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { calcularConexiones } from '../conexiones/conexiones'
import type { Documento, Id } from '../doc/tipos'
import { seleccionDe } from '../editor/seleccion'
import { compilarNetlist } from '../netlist/netlist'
import { validarPieza } from '../piezas/validar'
import { conEtiquetas } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import { medicionDeSeleccion } from '../ui/medicion'
import { leerResultados, type Lectura, type MedicionPieza } from './lectura'
import init, { Simulator } from './pkg/kirchi_engine.js'
import { corrienteNominal, mensajeDeSobrecorriente, VigiaDeSobrecorriente } from './sobrecorriente'

const lib = libreriaDePrueba().piezas
let memoria: WebAssembly.Memory
beforeAll(async () => {
  memoria = (await init({ module_or_path: readFileSync(join(import.meta.dirname, 'pkg/kirchi_engine_bg.wasm')) })).memory
})

/** El circuito del usuario: VCC 5 V a un potenciómetro de 10 kΩ, el cursor al ánodo de un LED rojo y el cátodo a tierra. */
const potConLed = (posicion: string): Documento =>
  conEtiquetas(lib, [
    { tipo: 'alimentacion', ref: 'PWR1', props: { nombre: 'VCC' }, pines: { '1': 'vcc' } },
    { tipo: 'potenciometro', ref: 'RV1', props: { valor: '10k', posicion }, pines: { '1': 'vcc', '2': '0', '3': 'cur' } },
    { tipo: 'led', ref: 'D1', props: { color: 'rojo' }, pines: { A: 'cur', K: '0' } }
  ])

/** Simula 1 ms y lee como la vista previa; el LED es `p_2`. */
function simular(d: Documento): { lectura: Lectura; errores: string[] } {
  const r = compilarNetlist(d, lib, calcularConexiones(d, lib))
  const sim = new Simulator(JSON.stringify(r.netlist), 1e-5)
  sim.advance_to(1e-3, 100000)
  const n = sim.element_count()
  const leer = (p: number) => new Float64Array(memoria.buffer, p, n).slice()
  const lectura = leerResultados(r, { time: sim.time(), ratio: 1, capacity: 1, seq: 1, consistente: true, voltages: sim.voltages(), currents: sim.currents(), aux: leer(sim.aux_ptr()), estado: leer(sim.estado_ptr()), niveles: new Float64Array(0), medidas: new Float64Array(0) })
  sim.free()
  return { lectura, errores: r.errores }
}

describe('corriente nominal del LED', () => {
  it('cada color del LED tiene 20 mA nominales; el diodo rectificador no tiene', () => {
    const led = lib.get('led')!
    for (const color of led.props[0].opciones!) {
      const p = { id: 'd', tipo: 'led', ref: 'D1', x: 0, y: 0, rot: 0 as const, espejo: false, props: { color } }
      expect(corrienteNominal(p, led), color).toBe(0.02)
    }
    const diodo = lib.get('diodo')!
    expect(corrienteNominal({ id: 'd', tipo: 'diodo', ref: 'D2', x: 0, y: 0, rot: 0, espejo: false, props: {} }, diodo)).toBeNull()
  })

  it('el validador pide una corriente nominal positiva, en el modelo o por opción', () => {
    const base = JSON.parse(readFileSync(join(import.meta.dirname, '../../../../componentes/semiconductores/led/pieza.json'), 'utf8'))
    const errores = (o: unknown) => {
      const v = validarPieza(JSON.stringify(o), 'x/pieza.json')
      return v.ok ? [] : v.errores
    }
    expect(errores(base)).toEqual([])
    expect(errores({ ...base, modelo: { ...base.modelo, inom: 0 } })).toContain('x/pieza.json: modelo.inom debe ser una corriente positiva en A')
    expect(errores({ ...base, modelo: { ...base.modelo, inom: '20m' } })).toContain('x/pieza.json: modelo.inom debe ser una corriente positiva en A')
    const porColor = { ...base.modelo, por: { ...base.modelo.por, valores: { ...base.modelo.por.valores, azul: { ...base.modelo.por.valores.azul, inom: -1 } } } }
    expect(errores({ ...base, modelo: porColor })).toContain('x/pieza.json: modelo.por.valores.azul.inom debe ser una corriente positiva en A')
  })

  it('la netlist no le pasa la corriente nominal al motor: el elemento del LED lleva solo is y n', () => {
    const d = potConLed('50 %')
    const r = compilarNetlist(d, lib, calcularConexiones(d, lib))
    expect(r.netlist!.elements.find((e) => e.type === 'D')).toEqual({ type: 'D', a: expect.any(Number), b: expect.any(Number), is: expect.any(Number), n: expect.any(Number) })
  })
})

describe('el potenciómetro en un extremo con un LED sin resistencia', () => {
  it('al 0 % simula: el tramo de 10 Ω deja unos 0.3 A en el LED, y la lectura dice que pasa de sus 20 mA', () => {
    const { lectura, errores } = simular(potConLed('0 %'))
    expect(errores).toEqual([])
    const led = lectura.piezas.get('p_2')!
    expect(led.i).toBeGreaterThan(0.25)
    expect(led.i).toBeLessThan(0.35)
    expect(led.extra).toEqual({ tipo: 'led', inom: 0.02, excedida: true })
  })

  it('al 50 % el LED va dentro de lo nominal', () => {
    const led = simular(potConLed('50 %')).lectura.piezas.get('p_2')!
    expect(led.i).toBeLessThan(0.02)
    expect(led.extra).toEqual({ tipo: 'led', inom: 0.02, excedida: false })
  })

  it('el inspector y el Multímetro lo dicen con palabras, en una fila marcada', () => {
    const d = potConLed('1 %')
    const { lectura } = simular(d)
    const filas = medicionDeSeleccion(seleccionDe('piezas', 'p_2'), calcularConexiones(d, lib), lectura)!
    expect(filas.map((f) => f.nombre)).toEqual(['Voltaje', 'Corriente', 'Potencia', 'Estado'])
    expect(filas[1].valor).toBe('31.6 mA')
    expect(filas[3]).toEqual({ nombre: 'Estado', valor: 'más de sus 20 mA nominales', alerta: true })
    const bien = medicionDeSeleccion(seleccionDe('piezas', 'p_2'), calcularConexiones(d, lib), simular(potConLed('50 %')).lectura)!
    expect(bien[3]).toEqual({ nombre: 'Estado', valor: 'dentro de sus 20 mA nominales' })
  })
})

describe('aviso de sobrecorriente en el Registro', () => {
  const lectura = (corrientes: Record<Id, number>): Lectura => ({
    t: 0, ratio: 1, redes: new Map(),
    piezas: new Map(Object.entries(corrientes).map(([id, i]): [Id, MedicionPieza] => [id, { v: 2, i, p: 2 * i, extra: { tipo: 'led', inom: 0.02, excedida: i > 0.02 } }]))
  })
  const ref = (id: Id) => id.toUpperCase()

  it('el mensaje dice la corriente, la nominal y qué hacer', () => {
    expect(mensajeDeSobrecorriente('D1', 0.031564, 0.02)).toBe('D1 lleva 31.6 mA, más de sus 20 mA nominales: agrega una resistencia en serie.')
  })

  it('una sola línea por LED en cada vista previa, aunque baje y vuelva a cruzar (una fuente de pulsos lo haría en cada periodo)', () => {
    const v = new VigiaDeSobrecorriente()
    const pasos = [0.01, 0.03, 0.025, 0.017, 0.03, 0.001, 0.05]
    const dichos = pasos.map((i) => v.revisar(lectura({ d1: i }), ref))
    expect(dichos).toEqual([[], ['D1 lleva 30.0 mA, más de sus 20 mA nominales: agrega una resistencia en serie.'], [], [], [], [], []])
  })

  it('cada LED lleva su cuenta, y al reiniciar (detener la vista previa) se vuelve a avisar', () => {
    const v = new VigiaDeSobrecorriente()
    expect(v.revisar(lectura({ d1: 0.03, d2: 0.01 }), ref)).toHaveLength(1)
    expect(v.revisar(lectura({ d1: 0.03, d2: 0.05 }), ref)).toEqual(['D2 lleva 50.0 mA, más de sus 20 mA nominales: agrega una resistencia en serie.'])
    expect(v.revisar(lectura({ d1: 0.03, d2: 0.05 }), ref)).toEqual([])
    v.reiniciar()
    expect(v.revisar(lectura({ d1: 0.03, d2: 0.05 }), ref)).toHaveLength(2)
  })

  it('un 555 alimentado fuera de su intervalo lo dice una vez, sin detener nada, y no al arrancar', () => {
    const t555 = (t: number, alimentacion: number): Lectura => ({
      t,
      ratio: 1,
      redes: new Map(),
      piezas: new Map([['u1', { v: 0, i: 0, p: 0, extra: { tipo: '555', salida: '1', f: 0, ciclo: 0, thr: 0, trig: 0, alimentacion, vmin: 4.5, vmax: 16, modelo: 'NE555' } }]])
    })
    const v = new VigiaDeSobrecorriente()
    // En el primer milisegundo la alimentación todavía puede estar subiendo: no se avisa.
    expect(v.revisar(t555(0, 0), ref)).toEqual([])
    expect(v.revisar(t555(0.01, 9), ref)).toEqual([])
    expect(v.revisar(t555(0.02, 18), ref)).toEqual(['U1 (NE555) tiene 18 V de alimentación, fuera de los 4.5 a 16 V que admite: la hoja de datos no garantiza cómo funciona.'])
    expect(v.revisar(t555(0.03, 18), ref)).toEqual([])
  })

  it('una corriente en inversa no cuenta', () => {
    expect(new VigiaDeSobrecorriente().revisar(lectura({ d1: -0.5 }), ref)).toEqual([])
  })
})

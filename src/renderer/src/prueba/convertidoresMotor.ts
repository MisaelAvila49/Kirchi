import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect } from 'vitest'
import { calcularConexiones } from '../conexiones/conexiones'
import { compilarNetlist, type ElementoMotor, type ResultadoNetlist } from '../netlist/netlist'
import { basesDeTiempo, pasoDeSimulacion } from '../sim/lectura'
import { Simulator } from '../sim/pkg/kirchi_engine.js'
import { conEtiquetas, type Parte } from './circuitos'
import { libreriaDePrueba } from './libreria'

// Ayudas de las pruebas del ADC0804 y el DAC0808 en el motor: circuitos armados con fuentes de continua cuyas ondas se sustituyen.

export const lib = libreriaDePrueba().piezas
export let memoria: WebAssembly.Memory
export const fijarMemoria = (m: WebAssembly.Memory) => (memoria = m)

export const leerCsv = (nombre: string) =>
  readFileSync(join(import.meta.dirname, '../../../../engine/referencias', nombre), 'utf8').trim().split(/\r?\n/).slice(1).map((l) => l.split(',').map(Number))
export const V = (ref: string, v: string, mas: string): Parte => ({ tipo: 'fuente-dc', ref, props: { voltaje: v }, pines: { '+': mas, '-': '0' } })
export const R = (ref: string, valor: string, a: string, b: string): Parte => ({ tipo: 'resistencia', ref, props: { valor }, pines: { '1': a, '2': b } })
export const C = (ref: string, valor: string, a: string, b: string): Parte => ({ tipo: 'capacitor', ref, props: { valor }, pines: { '1': a, '2': b } })
export const DB = Array.from({ length: 8 }, (_, k) => `DB${k}`)
export const A = Array.from({ length: 8 }, (_, k) => `A${k + 1}`)
export type Msi = Extract<ElementoMotor, { type: 'MSI' }>

/** Una fuente continua de la netlist con el voltaje `marca` pasa a la onda dada (puntos [t, v]): así un circuito armado con fuentes de
 * continua cambia en el tiempo sin una pieza de señal en la Librería. */
export function conOnda(r: ResultadoNetlist, marca: number, puntos: [number, number][]): void {
  const e = r.netlist!.elements.find((x) => x.type === 'V' && (x.wave as { kind: string; v: number }).kind === 'dc' && (x.wave as { v: number }).v === marca)
  if (!e) throw new Error(`no hay una fuente de ${marca} V`)
  ;(e as { wave: unknown }).wave = { kind: 'pwl', puntos }
}

export function compilar(partes: Parte[]) {
  const d = conEtiquetas(lib, partes)
  const con = calcularConexiones(d, lib)
  const r = compilarNetlist(d, lib, con)
  expect(r.errores).toEqual([])
  const msi = r.netlist!.elements.find((e) => e.type === 'MSI') as Msi | undefined
  return { r, msi, nodo: (nombre: string) => r.nodoDeRed.get(con.redes.find((x) => x.nombre === nombre)!.id)! }
}

export const adc = (pines: Record<string, string>): Parte => ({
  tipo: 'adc0804', ref: 'U1', props: {},
  pines: { CS: '0', RD: '0', WR: 'wr', CLK_IN: 'clkin', CLK_R: 'clkr', 'VIN+': 'vin', 'VIN-': '0', 'VREF/2': 'vref2', AGND: '0', DGND: '0', VCC: 'vcc', INTR: 'intr', ...Object.fromEntries(DB.map((p) => [p, p.toLowerCase()])), ...pines }
})
export const relojRc = [R('R1', '10k', 'clkr', 'clkin'), C('C1', '150p', 'clkin', '0')]
/** Marcas de las fuentes que `conOnda` sustituye. */
export const MARCA_WR = 3.3
export const MARCA_VIN = 1.2345

export function corrida(r: ResultadoNetlist) {
  const sim = new Simulator(JSON.stringify(r.netlist), pasoDeSimulacion(r.netlist!, basesDeTiempo(r)))
  sim.set_tolerances(1e-4, 1e-12, 1e-7)
  return sim
}
export const niveles = (sim: Simulator) => new Float64Array(memoria.buffer, sim.niveles_ptr(), sim.digital_count()).slice()
export const codigoDe = (n: Float64Array, msi: Msi) => msi.salidas.slice(8, 16).reduce((c, red, k) => c | ((n[red] === 1 ? 1 : 0) << k), 0)

/** Una conversión por caso, de a 200 por compilación (una onda por tramos admite 1000 puntos): VIN cambia 10 µs antes del pulso de WR
 * (300 ns en bajo) y el código se lee 125 µs después. */
export function convertir(partes: Parte[], vins: number[]): number[] {
  const PERIODO = 140e-6
  const codigos: number[] = []
  for (let desde = 0; desde < vins.length; desde += 200) {
    const tramo = vins.slice(desde, desde + 200)
    const { r, msi } = compilar(partes)
    const vin: [number, number][] = [[0, 0]]
    const wr: [number, number][] = [[0, 5]]
    tramo.forEach((v, k) => {
      const t0 = 20e-6 + k * PERIODO
      vin.push([t0 - 10e-6, k ? tramo[k - 1] : 0], [t0 - 10e-6 + 1e-9, v])
      wr.push([t0, 5], [t0 + 1e-9, 0], [t0 + 301e-9, 0], [t0 + 302e-9, 5])
    })
    conOnda(r, MARCA_VIN, vin)
    conOnda(r, MARCA_WR, wr)
    const sim = corrida(r)
    tramo.forEach((_, k) => {
      sim.advance_to(20e-6 + k * PERIODO + 125e-6, 1e9)
      codigos.push(codigoDe(niveles(sim), msi!))
    })
    sim.free()
  }
  return codigos
}


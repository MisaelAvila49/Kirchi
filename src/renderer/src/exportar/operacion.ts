import { armarReparto } from '../conexiones/corrientes'
import type { Conexiones } from '../conexiones/conexiones'
import type { Documento } from '../doc/tipos'
import type { ElementoMotor, NetlistMotor, Onda, ResultadoNetlist } from '../netlist/netlist'
import type { PiezaDef } from '../piezas/tipos'
import { leerResultados, pasoDeSimulacion, type Lectura } from '../sim/lectura'
import type { SimReading } from '../sim/protocol'

/** Punto de operación con la vista previa detenida: el motor resuelve el instante 0 en continua en un trabajo de un solo
 * uso y de ahí sale una `Lectura`, para que las etiquetas exportadas midan sin simular. */
export const T_OPERACION = 1e-4

/** Lo que se usa de un `Simulator` (el del WASM o uno de pruebas). */
export interface MotorOperacion {
  activar_terminales(si: boolean): void
  advance_to(t: number, maxPasos: number): number
  reiniciar_promedios(): void
  casillas_terminales(): number
  terminales_ptr(): number
  voltages_ptr(): number
  currents_ptr(): number
  aux_ptr(): number
  estado_ptr(): number
  niveles_ptr(): number
  medidas_ptr(): number
  time(): number
  free(): void
}

/** Lo que sale del motor, en arreglos planos que viajan entre el worker y la ventana. */
export interface CrudoOperacion {
  time: number
  voltages: Float64Array
  currents: Float64Array
  aux: Float64Array
  estado: Float64Array
  niveles: Float64Array
  medidas: Float64Array
  medias: Float64Array
  absolutas: Float64Array
}

export interface TamañosNetlist {
  nodos: number
  elementos: number
  digitales: number
}

/** Valor en continua de una fuente: offset de la senoidal, nivel bajo del pulso y la escalera, alto de la cuadrada, primer valor de la de tramos. Así el
 * punto de operación no depende del instante de medida. */
export function ondaEnContinua(w: Onda): Onda {
  switch (w.kind) {
    case 'dc':
      return w
    case 'sine':
      return { kind: 'dc', v: w.offset }
    case 'square':
      return { kind: 'dc', v: w.duty > 0 ? w.high : w.low }
    case 'pulse':
    case 'stair':
      return { kind: 'dc', v: w.low }
    case 'pwl':
      return { kind: 'dc', v: w.puntos[0][1] }
  }
}

/** En continua un capacitor es un circuito abierto, un inductor un corto y una fuente su valor de reposo; los índices de la netlist no cambian. */
export function netlistEnContinua(n: NetlistMotor): NetlistMotor {
  const elements = n.elements.map((e): ElementoMotor =>
    e.type === 'C' ? { type: 'R', a: e.a, b: e.b, ohms: 1e12 } : e.type === 'L' ? { type: 'R', a: e.a, b: e.b, ohms: 1e-6 } : e.type === 'V' ? { ...e, wave: ondaEnContinua(e.wave) } : e
  )
  return { ...n, elements }
}

export function tamañosDe(n: NetlistMotor): TamañosNetlist {
  return { nodos: n.nodes, elementos: n.elements.length, digitales: n.digital_nets ?? 0 }
}

/** Resuelve el instante de operación con un motor ya creado; lo libera al terminar. */
export function resolverOperacion(sim: MotorOperacion, memoria: WebAssembly.Memory, t: TamañosNetlist): CrudoOperacion {
  try {
    sim.activar_terminales(true)
    sim.advance_to(T_OPERACION, 1_000_000)
    sim.reiniciar_promedios()
    sim.advance_to(2 * T_OPERACION, 1_000_000)
    const casillas = sim.casillas_terminales()
    // Las direcciones primero y los búferes después: pedir una puede mover la memoria del WASM.
    const dir = {
      v: sim.voltages_ptr(),
      i: sim.currents_ptr(),
      a: sim.aux_ptr(),
      e: sim.estado_ptr(),
      n: sim.niveles_ptr(),
      m: sim.medidas_ptr(),
      t: sim.terminales_ptr()
    }
    const f = (p: number, n: number) => new Float64Array(memoria.buffer, p, n).slice()
    const term = f(dir.t, 1 + 2 * casillas)
    return {
      time: sim.time(),
      voltages: f(dir.v, t.nodos),
      currents: f(dir.i, t.elementos),
      aux: f(dir.a, t.elementos),
      estado: f(dir.e, t.elementos),
      niveles: f(dir.n, t.digitales),
      medidas: f(dir.m, 3 * t.digitales),
      medias: term.slice(1, 1 + casillas),
      absolutas: term.slice(1 + casillas)
    }
  } finally {
    sim.free()
  }
}

/** La netlist (en continua) y su paso para resolver el punto de operación; null si el documento no se puede simular. */
export function pedidoOperacion(r: ResultadoNetlist): { netlist: NetlistMotor; h: number } | null {
  if (!r.netlist) return null
  return { netlist: netlistEnContinua(r.netlist), h: pasoDeSimulacion(r.netlist) }
}

/** La `Lectura` del punto de operación, con las corrientes de los tramos de cable. */
export function lecturaDeOperacion(doc: Documento, lib: Map<string, PiezaDef>, con: Conexiones, r: ResultadoNetlist, c: CrudoOperacion): Lectura {
  const s: SimReading = { consistente: true, time: c.time, ratio: 1, capacity: 0, seq: 0, voltages: c.voltages, currents: c.currents, aux: c.aux, estado: c.estado, niveles: c.niveles, medidas: c.medidas }
  const l = leerResultados(r, s)
  const rep = armarReparto(doc, lib, con, r.puertos)
  const media = new Float64Array(rep.tramos.length)
  const absoluta = new Float64Array(rep.tramos.length)
  rep.repartir(c.medias, c.absolutas, media, absoluta, c.currents)
  l.corrientes = { tramos: rep.tramos, media, absoluta, sinFlechas: rep.sinFlechas }
  return l
}

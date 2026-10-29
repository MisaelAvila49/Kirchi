import type { Conexiones } from '../conexiones/conexiones'
import type { Documento } from '../doc/tipos'
import type { PiezaDef } from '../piezas/tipos'
import { medidoresDe } from '../doc/sondas'
import { CIFRAS_VENTANA } from '../instrumentos/medidas'
import { eficazDeVentana, lecturaMultimetro, MS_LECTURA, textoMultimetro } from '../instrumentos/multimetro'
import type { ResultadoNetlist } from '../netlist/netlist'
import { leerResultados, type Lectura } from '../sim/lectura'
import { lecturaDeMedidor } from '../sim/medidor'
import type { SimReading } from '../sim/protocol'
import { nombresDeRedes } from '../conexiones/listaDeRedes'
import { memoriaDelMotor, type Simulator } from './motor'

export interface CanalResumen {
  canal: string
  /** Por qué no hay señal: entrada a tierra, al aire o sin sonda. */
  sinSenal?: 'tierra' | 'al aire'
  /** De todo lo simulado. */
  min?: number
  max?: number
  /** Media, valor eficaz y frecuencia: de los periodos completos de la segunda mitad de lo simulado, sin el arranque. */
  media?: number
  rms?: number
  /** Hz por cruces; null si la segunda mitad no abarca un ciclo. */
  frecuencia?: number | null
  /** Hasta `muestras` valores repartidos en la ventana. */
  muestras?: number[]
}

export interface LecturaSinVentana {
  /** Segundos simulados alcanzados. */
  t: number
  /** Voltaje de cada red por su nombre (tierra incluida). */
  redes: Record<string, number>
  /** Voltaje, corriente y potencia de cada pieza simulada por su referencia. */
  piezas: Record<string, { v: number; i: number; p: number; region?: string }>
  multimetros: { ref: string; modo: string; texto: string; valor: number }[]
  medidores: { ref: string; texto: string }[]
  /** Cada perilla en vivo con el valor que tiene el motor ahora; sin el campo si el circuito no tiene perillas. */
  perillas?: { ref: string; prop: string; valor: number; unidad?: string }[]
  osciloscopios: { ref: string; canales: CanalResumen[] }[]
  avisos: string[]
}

export const MAX_MUESTRAS = 2000

export const redondear = (x: number): number => (Number.isFinite(x) ? Number(x.toPrecision(10)) : x)

/** Lo que el motor tiene ahora, en la forma que la ventana pasa a `leerResultados`. */
export function lecturaDelMotor(sim: Simulator, memoria: WebAssembly.Memory, nodos: number, elementos: number, digitales: number): SimReading {
  const pv = sim.voltages_ptr(), pc = sim.currents_ptr(), pa = sim.aux_ptr(), pe = sim.estado_ptr(), pn = sim.niveles_ptr(), pm = sim.medidas_ptr()
  const f = (p: number, n: number) => new Float64Array(memoria.buffer, p, n).slice()
  return {
    consistente: true,
    time: sim.time(),
    ratio: 1,
    capacity: 0,
    seq: 0,
    voltages: f(pv, nodos),
    currents: f(pc, elementos),
    aux: f(pa, elementos),
    estado: f(pe, elementos),
    niveles: f(pn, digitales),
    medidas: f(pm, 3 * digitales)
  }
}

/** Las 13 cifras de la ventana de la sonda `k` entre `t0` y `t1`. */
function ventanaDe(sim: Simulator, k: number, t0: number, t1: number): Float64Array {
  return new Float64Array(memoriaDelMotor().buffer, sim.sonda_ventana(k, t0, t1), CIFRAS_VENTANA).slice()
}

function resumenDeCanal(sim: Simulator, k: number, t: number, muestras: number): Omit<CanalResumen, 'canal'> {
  const cubre = sim.sonda_cubre(k)
  const desde = Math.max(0, Number.isFinite(cubre) ? cubre : 0)
  const w = ventanaDe(sim, k, desde, t)
  const dur = Number.isFinite(w[12]) ? w[12] : w[1] - w[0]
  if (!(dur > 0)) return {}
  // Con el arranque dentro, un nivel medio que se mueve deja ciclos sin cruzar y la frecuencia sale baja (859 Hz por 1 kHz).
  const e = ventanaDe(sim, k, desde + 0.5 * (t - desde), t)
  const [periodos, p0, p1, ivP, iv2P] = [e[6], e[7], e[8], e[9], e[10]]
  const de = Number.isFinite(e[12]) ? e[12] : e[1] - e[0]
  const conPeriodos = periodos >= 1 && p1 > p0
  const media = conPeriodos ? ivP / (p1 - p0) : de > 0 ? e[2] / de : w[2] / dur
  const cuadrado = conPeriodos ? iv2P / (p1 - p0) : de > 0 ? e[3] / de : w[3] / dur
  const { frecuencia } = eficazDeVentana(e)
  const r: Omit<CanalResumen, 'canal'> = {
    min: redondear(w[4]),
    max: redondear(w[5]),
    media: redondear(media),
    rms: redondear(Math.sqrt(Math.max(0, cuadrado))),
    frecuencia: Number.isFinite(frecuencia) ? redondear(frecuencia) : null
  }
  if (muestras > 0) {
    const n = Math.min(muestras, MAX_MUESTRAS)
    const dt = (w[1] - w[0]) / n
    r.muestras = Array.from(new Float64Array(memoriaDelMotor().buffer, sim.sonda_muestras(k, w[0], dt, n), n)).map(redondear)
  }
  return r
}

/** Las lecturas que la ventana muestra en Redes, Mediciones, el Multímetro y el medidor rápido, más el resumen del osciloscopio. */
export function leerTodo(
  doc: Documento,
  lib: Map<string, PiezaDef>,
  con: Conexiones,
  r: ResultadoNetlist,
  sim: Simulator,
  opciones: { muestras?: number } = {}
): LecturaSinVentana {
  const t = sim.time()
  const s = lecturaDelMotor(sim, memoriaDelMotor(), sim.node_count(), sim.element_count(), sim.digital_count())
  const l: Lectura = leerResultados(r, s)
  const nombres = nombresDeRedes(doc, con)
  const redes: Record<string, number> = {}
  for (const [red, v] of l.redes) {
    const n = nombres.get(red)
    if (n !== undefined) redes[n] = redondear(v)
  }
  for (const red of con.redes) if (red.tierra && nombres.has(red.id)) redes[nombres.get(red.id)!] = 0
  const piezas: LecturaSinVentana['piezas'] = {}
  for (const [id, m] of l.piezas) {
    const ref = doc.piezas[id]?.ref
    if (ref && (m.extra === undefined || m.extra.tipo === 'compuesto' || m.i !== 0 || m.v !== 0 || m.p !== 0)) piezas[ref] = { v: redondear(m.v), i: redondear(m.i), p: redondear(m.p), ...(m.extra && 'region' in m.extra ? { region: m.extra.region } : {}) }
  }
  // La ventana del multímetro: un cuarto de segundo simulado o la mitad de lo corrido si es menos.
  const ancho = Math.min(MS_LECTURA / 1000, t / 2)
  const avisos: string[] = []
  const multimetros: LecturaSinVentana['multimetros'] = []
  for (const [id, mm] of r.instrumentos.multimetros) {
    const ref = doc.piezas[id]?.ref ?? id
    const wv = ventanaDe(sim, mm.sondaV, t - ancho, t)
    const wi = ventanaDe(sim, mm.sondaI, t - ancho, t)
    const lm = lecturaMultimetro(mm.ajustes.modo, wv, wi, mm.rangoOhm)
    multimetros.push({ ref, modo: mm.ajustes.modo, texto: textoMultimetro(mm.ajustes.modo, lm), valor: redondear(lm.valor) })
  }
  for (const id of r.instrumentos.sueltos) avisos.push(`${doc.piezas[id]?.ref ?? id} tiene una terminal sin conectar.`)
  const medidores: LecturaSinVentana['medidores'] = []
  for (const m of medidoresDe(doc)) {
    const sonda = r.instrumentos.medidores.get(m.id)?.sonda
    const ac = sonda !== undefined ? eficazDeVentana(ventanaDe(sim, sonda, t - ancho, t)) : undefined
    const lm = lecturaDeMedidor(m, con, l, ac)
    medidores.push({ ref: m.ref ?? m.id, texto: lm.estado === 'ok' ? `${redondear(lm.valor)} ${lm.unidad}` : `sin dato (${lm.motivo})` })
  }
  const osciloscopios: LecturaSinVentana['osciloscopios'] = []
  for (const [id, o] of r.instrumentos.osciloscopios) {
    const on = new Set(o.ajustes.canales.filter((c) => c.on).map((c) => c.canal))
    const canales: CanalResumen[] = []
    for (const c of o.canales) {
      if (!on.has(c.canal)) continue
      if (c.alAire) canales.push({ canal: c.canal, sinSenal: 'al aire' })
      else if (c.sonda === null) canales.push({ canal: c.canal, sinSenal: 'tierra' })
      else canales.push({ canal: c.canal, ...resumenDeCanal(sim, c.sonda, t, opciones.muestras ?? 0) })
    }
    osciloscopios.push({ ref: doc.piezas[id]?.ref ?? id, canales })
  }
  const perillas = perillasDelMotor(doc, lib, r, sim)
  return { t, redes, piezas, multimetros, medidores, ...(perillas.length ? { perillas } : {}), osciloscopios, avisos }
}

/** El valor de cada perilla en el canal del motor, por pieza y propiedad. */
function perillasDelMotor(doc: Documento, lib: Map<string, PiezaDef>, r: ResultadoNetlist, sim: Simulator): NonNullable<LecturaSinVentana['perillas']> {
  const salida: NonNullable<LecturaSinVentana['perillas']> = []
  for (const [clave, canal] of r.canalDe) {
    const [id, prop] = clave.split(':')
    const pieza = doc.piezas[id]
    const def = pieza ? lib.get(pieza.tipo)?.props.find((d) => d.id === prop) : undefined
    const valor = sim.valor_canal(canal)
    if (pieza && def && Number.isFinite(valor)) salida.push({ ref: pieza.ref, prop, valor: redondear(valor), ...(def.unidad ? { unidad: def.unidad } : {}) })
  }
  return salida.sort((a, b) => a.ref.localeCompare(b.ref, 'es') || a.prop.localeCompare(b.prop, 'es'))
}

/** Memoria compartida de los instrumentos: la crea el cliente con el tamaño de los instrumentos de la netlist (sin
 * instrumentos no existe), la escribe el worker con su propio seqlock y la lee la interfaz. */

import { MAX_OSC_VENTANA } from '../../../compartido/ventanaOsc'

export const MAX_OSCILOSCOPIOS = MAX_OSC_VENTANA
export const MAX_MULTIMETROS = 16
/** Los medidores rápidos en AC (cada uno ocupa una ventana de la memoria de instrumentos, aparte de los multímetros). */
export const MAX_MEDIDORES_AC = 8
/** A, B, C, D y A − B. */
export const CANALES_PANTALLA = 5
export const COLUMNAS_PANTALLA = 4096
/** Mínimo, máximo, primero, último y banderas (las de `engine/src/sonda.rs`). */
export const CIFRAS_COLUMNA = 5
/** 2,000 intervalos iguales por pantalla. */
export const MUESTRAS_CSV = 2001
export const N_MEDIDAS = 8

export const ESTADOS_DISPARO = ['esperando', 'disparado', 'libre', 'congelado', 'rodillo', 'sin-disparo'] as const
export type EstadoDisparo = (typeof ESTADOS_DISPARO)[number]
export const ESTADOS_MULTIMETRO = ['ok', 'OL', 'voltaje', 'sin-medida', 'sin-conectar'] as const
export type EstadoMultimetro = (typeof ESTADOS_MULTIMETRO)[number]
/** Por qué una medida no tiene valor (el globo lo dice en palabras). */
export const RAZONES = ['', 'sin-periodos', 'menos-de-un-ciclo', 'apagado', 'sin-datos'] as const
export type RazonSinMedida = (typeof RAZONES)[number]

const CABECERA = 4
const CIFRAS_MM = 10
const CIFRAS_OSC = 15 + 2 * CANALES_PANTALLA * N_MEDIDAS
const F32_POR_OSC = CANALES_PANTALLA * COLUMNAS_PANTALLA * CIFRAS_COLUMNA + CANALES_PANTALLA * MUESTRAS_CSV
const INTENTOS = 4

const decimales = (nOsc: number, nMm: number) => CABECERA + nMm * CIFRAS_MM + nOsc * CIFRAS_OSC

/** Bytes de la memoria de `nOsc` osciloscopios y `nMm` multímetros; 0 sin ninguno (no se crea). */
export function bytesSabInstrumentos(nOsc: number, nMm: number): number {
  if (nOsc + nMm === 0) return 0
  return decimales(nOsc, nMm) * 8 + nOsc * F32_POR_OSC * 4
}

export interface VistasInstrumentos {
  f64: Float64Array
  f32: Float32Array
  seq: Int32Array
  nOsc: number
  nMm: number
}

export function crearVistas(sab: SharedArrayBuffer, nOsc: number, nMm: number): VistasInstrumentos {
  const n = decimales(nOsc, nMm)
  const v = { f64: new Float64Array(sab, 0, n), f32: new Float32Array(sab, n * 8, nOsc * F32_POR_OSC), seq: new Int32Array(sab, 0, 2), nOsc, nMm }
  v.f64[1] = nOsc
  v.f64[2] = nMm
  return v
}

export interface LecturaMultimetroSab {
  lecturas: number
  t: number
  ventana: number
  valor: number
  frecuencia: number
  rango: number
  estado: EstadoMultimetro
  /** Índice en `MODOS_MULTIMETRO`. */
  modo: number
  fundido: boolean
  periodos: number
}

export interface MedidaSab {
  valor: number
  razon: RazonSinMedida
}

/** Todo lo que conservan las sondas de un osciloscopio como columnas finas e iguales, de donde se arma cualquier ventana
 * de la captura al desplazarse con la vista previa detenida o en pausa. Por canal (A a D y A − B), `n` columnas de cinco
 * cifras como las de la pantalla, la primera en `t0` y cada una de `dt` segundos. */
export interface RegistroFino {
  t0: number
  dt: number
  n: number
  /** Hasta dónde llega lo capturado. */
  tCaptura: number
  columnas: Float32Array
}

export interface PantallaSab {
  /** Sube con cada pantalla nueva; 0 si todavía no hay. */
  version: number
  t0: number
  dt: number
  ncol: number
  tDisparo: number
  estado: EstadoDisparo
  /** El tiempo simulado de la captura (el final de la pantalla o lo último dibujado en rodillo). */
  tCaptura: number
  csv: { t0: number; dt: number; n: number }
  /** Por canal (A a D y A − B): hasta qué instante tiene datos. */
  completoHasta: number[]
  /** Por canal, las ocho medidas en el orden de `MEDIDAS`. */
  medidas: MedidaSab[][]
  /** Por canal, `ncol` columnas de cinco decimales. */
  columnas: Float32Array
  /** Por canal, `csv.n` muestras. */
  muestras: Float32Array
  /** Solo al exportar: todo lo capturado en columnas finas, de donde sale el tramo elegido con su resolución plena (no de `columnas`). */
  fino?: RegistroFino
}

const baseMm = (k: number) => CABECERA + k * CIFRAS_MM
const baseOsc = (v: VistasInstrumentos, k: number) => CABECERA + v.nMm * CIFRAS_MM + k * CIFRAS_OSC
const baseF32 = (k: number) => k * F32_POR_OSC

function escribiendo(v: VistasInstrumentos, f: () => void): void {
  Atomics.add(v.seq, 0, 1) // impar: escribiendo
  f()
  Atomics.add(v.seq, 0, 1) // par: completa
}

export function escribirMultimetro(v: VistasInstrumentos, k: number, l: LecturaMultimetroSab): void {
  escribiendo(v, () => {
    const b = baseMm(k)
    v.f64.set([l.lecturas, l.t, l.ventana, l.valor, l.frecuencia, l.rango, ESTADOS_MULTIMETRO.indexOf(l.estado), l.modo, l.fundido ? 1 : 0, l.periodos], b)
  })
}

export function escribirPantalla(v: VistasInstrumentos, k: number, p: PantallaSab): void {
  escribiendo(v, () => {
    const b = baseOsc(v, k)
    v.f64.set([p.version, p.t0, p.dt, p.ncol, p.tDisparo, ESTADOS_DISPARO.indexOf(p.estado), p.tCaptura, p.csv.t0, p.csv.dt, p.csv.n, ...p.completoHasta], b)
    const m = b + 15
    p.medidas.forEach((canal, c) =>
      canal.forEach((x, i) => {
        v.f64[m + c * N_MEDIDAS + i] = x.valor
        v.f64[m + CANALES_PANTALLA * N_MEDIDAS + c * N_MEDIDAS + i] = RAZONES.indexOf(x.razon)
      })
    )
    const f = baseF32(k)
    v.f32.set(p.columnas.subarray(0, CANALES_PANTALLA * p.ncol * CIFRAS_COLUMNA), f)
    v.f32.set(p.muestras.subarray(0, CANALES_PANTALLA * p.csv.n), f + CANALES_PANTALLA * COLUMNAS_PANTALLA * CIFRAS_COLUMNA)
  })
}

function leerMm(v: VistasInstrumentos, k: number): LecturaMultimetroSab {
  const x = v.f64.subarray(baseMm(k), baseMm(k) + CIFRAS_MM)
  return { lecturas: x[0], t: x[1], ventana: x[2], valor: x[3], frecuencia: x[4], rango: x[5], estado: ESTADOS_MULTIMETRO[x[6]] ?? 'sin-medida', modo: x[7], fundido: x[8] > 0, periodos: x[9] }
}

function leerOsc(v: VistasInstrumentos, k: number): PantallaSab {
  const b = baseOsc(v, k)
  const x = v.f64.slice(b, b + CIFRAS_OSC)
  const ncol = Math.min(COLUMNAS_PANTALLA, x[3])
  const n = Math.min(MUESTRAS_CSV, x[9])
  const f = baseF32(k)
  const medidas = Array.from({ length: CANALES_PANTALLA }, (_, c) =>
    Array.from({ length: N_MEDIDAS }, (_, i) => ({ valor: x[15 + c * N_MEDIDAS + i], razon: RAZONES[x[15 + CANALES_PANTALLA * N_MEDIDAS + c * N_MEDIDAS + i]] ?? '' }))
  )
  return {
    version: x[0], t0: x[1], dt: x[2], ncol, tDisparo: x[4], estado: ESTADOS_DISPARO[x[5]] ?? 'esperando', tCaptura: x[6], csv: { t0: x[7], dt: x[8], n },
    completoHasta: Array.from(x.subarray(10, 15)), medidas,
    columnas: v.f32.slice(f, f + CANALES_PANTALLA * ncol * CIFRAS_COLUMNA),
    muestras: v.f32.slice(f + CANALES_PANTALLA * COLUMNAS_PANTALLA * CIFRAS_COLUMNA, f + CANALES_PANTALLA * COLUMNAS_PANTALLA * CIFRAS_COLUMNA + CANALES_PANTALLA * n)
  }
}

/** Lee los multímetros y, si se pide, la pantalla de un osciloscopio (copias; reintenta si el worker escribía). */
export function leerInstrumentos(v: VistasInstrumentos, o: { osciloscopio?: number } = {}): { consistente: boolean; multimetros: LecturaMultimetroSab[]; pantalla?: PantallaSab } {
  let r: { consistente: boolean; multimetros: LecturaMultimetroSab[]; pantalla?: PantallaSab } = { consistente: false, multimetros: [] }
  for (let i = 0; i < INTENTOS; i++) {
    const antes = Atomics.load(v.seq, 0)
    r = { consistente: false, multimetros: Array.from({ length: v.nMm }, (_, k) => leerMm(v, k)) }
    if (o.osciloscopio !== undefined && o.osciloscopio < v.nOsc) r.pantalla = leerOsc(v, o.osciloscopio)
    if (antes % 2 === 0 && Atomics.load(v.seq, 0) === antes) {
      r.consistente = true
      break
    }
  }
  return r
}


/** El número de versión de la pantalla `k` (el primer decimal de su bloque), sin copiar columnas: la interfaz lo mira en cada cuadro. */
export function versionDePantalla(v: VistasInstrumentos, k: number): number {
  return k >= 0 && k < v.nOsc ? v.f64[baseOsc(v, k)] : 0
}

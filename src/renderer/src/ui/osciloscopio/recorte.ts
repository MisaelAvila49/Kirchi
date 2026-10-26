import { DIVISIONES_H, type AjustesOsciloscopio } from '../../instrumentos/ajustes'
import { CANALES_PANTALLA, CIFRAS_COLUMNA, type PantallaSab, type RegistroFino } from '../../sim/protocoloInstrumentos'
import { marcasLineales } from '../../../../compartido/grafica/ticks'
import { rangoEfectivo, type RangoExportar } from '../exportar/rango'
import type { Dominio } from '../grafica/vista'
import { ventanaDeRegistro } from './recorrido'

/**
 * Recortar una captura a un tramo de su eje del tiempo. El eje cuenta desde el disparo si lo hay, desde 0 si no, y el recorte usa ese mismo eje.
 */

/** El instante que vale 0 en el eje de la figura: el disparo, o el origen de la simulación si la pantalla no está disparada. */
export const referenciaDelTiempo = (p: Pick<PantallaSab, 'tDisparo'>): number => (Number.isFinite(p.tDisparo) ? p.tDisparo : 0)

/** Lo que abarca el eje del tiempo de la pantalla, en el eje de la figura. */
export function ejeDeCaptura(a: Pick<AjustesOsciloscopio, 'base'>, p: Pick<PantallaSab, 't0' | 'tDisparo'>): Dominio {
  const inicio = p.t0 - referenciaDelTiempo(p)
  return { min: inicio, max: inicio + DIVISIONES_H * a.base }
}

/**
 * Marcas redondas (paso 1, 2 o 5 por potencia de diez) DENTRO del tramo exportado, que no cambia. Con 1.8156 a 1.8229 s: 1.816 … 1.822. Null si no cabe ninguna.
 */
export function marcasRedondas(vista: Dominio): { paso: number; valores: number[] } | null {
  const valores = marcasLineales(vista.min, vista.max, 8)
  if (valores.length < 2) return null
  return { paso: Number((valores[1] - valores[0]).toPrecision(6)), valores }
}

/** Píxeles de salida de la figura exportada (800 px de figura a 2×): con más columnas finas que esto, cada píxel junta las que le tocan. */
export const PX_EXPORTACION = 1600

export interface CapturaRecortada {
  a: AjustesOsciloscopio
  p: PantallaSab
  /** Lo que abarca el eje completo y lo que queda a la vista. */
  total: Dominio
  vista: Dominio
  /** Cuántas columnas quedaron y si hubo recorte. */
  recortada: boolean
}

/**
 * Captura con solo el tramo `r`: sus columnas y una base de tiempo que reparte lo que queda en diez divisiones. Sin recorte (o menos de dos columnas), la misma captura.
 */
export function recortarCaptura(a: AjustesOsciloscopio, p: PantallaSab, r: RangoExportar | null | undefined): CapturaRecortada {
  const total = ejeDeCaptura(a, p)
  const e = p.ncol > 1 && p.dt > 0 && Number.isFinite(p.t0) ? rangoEfectivo(r, total) : null
  const ref = referenciaDelTiempo(p)
  const fino = e && p.fino ? recorteFino(a, p, p.fino, e, ref, total) : null
  if (fino) return fino
  const i0 = e ? Math.max(0, Math.ceil((ref + e.min - p.t0) / p.dt - 1e-9)) : 0
  const i1 = e ? Math.min(p.ncol, Math.floor((ref + e.max - p.t0) / p.dt + 1e-9)) : p.ncol
  if (!e || i1 - i0 < 2) return { a, p, total, vista: total, recortada: false }
  const n = i1 - i0
  const columnas = new Float32Array(CANALES_PANTALLA * n * CIFRAS_COLUMNA)
  for (let c = 0; c < CANALES_PANTALLA; c++) columnas.set(p.columnas.subarray((c * p.ncol + i0) * CIFRAS_COLUMNA, (c * p.ncol + i1) * CIFRAS_COLUMNA), c * n * CIFRAS_COLUMNA)
  const t0 = p.t0 + i0 * p.dt
  // El disparo que queda fuera del tramo no se marca.
  const tDisparo = Number.isFinite(p.tDisparo) && p.tDisparo >= t0 && p.tDisparo <= t0 + n * p.dt ? p.tDisparo : Number.NaN
  const vista = { min: t0 - ref, max: t0 - ref + n * p.dt }
  return { a: { ...a, base: (n * p.dt) / DIVISIONES_H }, p: { ...p, t0, ncol: n, columnas, tDisparo }, total, vista, recortada: true }
}

/**
 * Tramo `e` tomado de las columnas finas y no de las de la pantalla: todas si caben en `PX_EXPORTACION`, si no el mínimo y máximo por píxel de salida. Conserva la resolución guardada. Null con menos de dos finas.
 */
function recorteFino(a: AjustesOsciloscopio, p: PantallaSab, f: RegistroFino, e: Dominio, ref: number, total: Dominio): CapturaRecortada | null {
  if (!(f.dt > 0) || f.n < 2) return null
  const i0 = Math.max(0, Math.ceil((ref + e.min - f.t0) / f.dt - 1e-9))
  const i1 = Math.min(f.n, Math.floor((ref + e.max - f.t0) / f.dt + 1e-9))
  const m = i1 - i0
  if (m < 2) return null
  const t0 = f.t0 + i0 * f.dt
  const span = m * f.dt
  const q = ventanaDeRegistro(f, span / DIVISIONES_H, Math.min(m, PX_EXPORTACION), t0, p)
  const tDisparo = Number.isFinite(p.tDisparo) && p.tDisparo >= t0 && p.tDisparo <= t0 + span ? p.tDisparo : Number.NaN
  const pantalla: PantallaSab = { ...q, tDisparo, estado: p.estado, completoHasta: p.completoHasta, medidas: p.medidas, version: p.version, muestras: p.muestras, csv: p.csv, fino: undefined }
  return { a: { ...a, base: span / DIVISIONES_H }, p: pantalla, total, vista: { min: t0 - ref, max: t0 - ref + span }, recortada: true }
}

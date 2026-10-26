import type { Conexiones } from '../conexiones/conexiones'
import { eficazDeVentana } from '../instrumentos/multimetro'
import type { Sonda } from '../doc/tipos'
import { paraTexto, type Lectura } from './lectura'

/** Lo que dice un medidor rápido: su valor en V o A, o por qué no hay dato. La corriente y el voltaje alternos necesitan
 * la ventana de su punto (las cifras por sonda del motor, las del multímetro); sin ella no hay dato. */
export type LecturaMedidor =
  | { estado: 'ok'; valor: number; unidad: 'V' | 'A'; /** Solo en AC y con la lectura en vivo: Hz de la señal, NaN si no se ve un ciclo. */ frecuencia?: number }
  | { estado: 'sin-dato'; motivo: 'sin-red' | 'flotante' | 'sin-tramo' | 'esperando' | 'sin-ventana' | 'no-disponible' }

/** Lo que el worker lee de la ventana de un medidor en AC (la misma lectura de un multímetro en V AC). */
export interface LecturaAc {
  valor: number
  frecuencia: number
}

/** Lo que traen las corrientes de una lectura (`Lectura.corrientes`). */
type Corrientes = NonNullable<Lectura['corrientes']>

/** El índice del tramo de cable que contiene el punto (x, y) en su interior, o -1. */
export function tramoEn(c: Corrientes, x: number, y: number): number {
  return c.tramos.findIndex((t) => (t.y0 === t.y1 ? y === t.y0 && x > Math.min(t.x0, t.x1) && x < Math.max(t.x0, t.x1) : x === t.x0 && y > Math.min(t.y0, t.y1) && y < Math.max(t.y0, t.y1)))
}

/** Corriente media del tramo `k`, positiva hacia la derecha en uno horizontal y hacia abajo en uno vertical (con
 * `haciaMas`) o al revés. La media de cada tramo va de su punto 0 al 1. */
export function corrienteDelTramo(c: Corrientes, k: number, haciaMas: boolean): number {
  const t = c.tramos[k]
  const delTramo = t.y0 === t.y1 ? t.x1 > t.x0 : t.y1 > t.y0
  return c.media[k] * (haciaMas === delTramo ? 1 : -1)
}

/** Lectura de un medidor rápido: voltaje de la red de su punto respecto de tierra, o corriente del cable donde está
 * (positiva a la derecha o hacia abajo), en DC con las cifras estables de Mediciones y en AC con el eficaz de la ventana
 * `ventana`, que el motor lleva por sonda. */
export function lecturaDeMedidor(s: Sonda, con: Conexiones, l: Lectura, ventana?: ArrayLike<number> | LecturaAc): LecturaMedidor {
  const unidad = s.magnitud === 'corriente' ? 'A' : 'V'
  // La tierra no tiene sonda ni ventana en el motor (la netlist la omite): su voltaje es cero por definición, en DC y en AC.
  if (s.magnitud === 'voltaje') {
    const rt = con.redDeSonda.get(s.id)
    if (rt !== undefined && con.redes[rt]?.tierra) return { estado: 'ok', valor: 0, unidad: 'V' }
  }
  if (s.modo === 'ac') {
    // La corriente alterna de un cable no se combina todavía en el motor: no hay ventana que esperar.
    if (!ventana) return { estado: 'sin-dato', motivo: s.magnitud === 'corriente' ? 'no-disponible' : 'sin-ventana' }
    // En vivo llega la lectura del multímetro del worker (`{ valor, frecuencia }`); una ventana cruda se reduce con la misma cuenta.
    const { valor, frecuencia } = 'length' in ventana ? eficazDeVentana(ventana) : ventana
    return Number.isFinite(valor) ? { estado: 'ok', valor, unidad, frecuencia } : { estado: 'sin-dato', motivo: 'sin-ventana' }
  }
  if (s.magnitud === 'corriente') {
    const c = l.corrientes
    if (!c) return { estado: 'sin-dato', motivo: 'esperando' }
    const k = tramoEn(c, s.x, s.y)
    if (k < 0) return { estado: 'sin-dato', motivo: c.sinFlechas.has(con.redDeSonda.get(s.id) ?? -1) ? 'flotante' : 'sin-tramo' }
    return { estado: 'ok', valor: corrienteDelTramo(c, k, true), unidad }
  }
  const red = con.redDeSonda.get(s.id)
  if (red === undefined) return { estado: 'sin-dato', motivo: 'sin-red' }
  const v = paraTexto(l).redes.get(red)
  return v === undefined ? { estado: 'sin-dato', motivo: 'flotante' } : { estado: 'ok', valor: v, unidad }
}

import { formatearValor } from '../valores/valores'
import { propModelo } from '../editor/colocar'
import type { PiezaDef } from './tipos'

/** La tabla de modelos de una pieza: un renglón por modelo con unas cifras de su hoja de datos. */
export interface TablaModelos {
  columnas: string[]
  filas: { modelo: string; celdas: string[] }[]
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const cifra = (v: number | null, unidad: string): string => (v === null ? 'sin dato' : formatearValor(v, unidad))

/** La corriente máxima que declara `limites.por` para un modelo (la de su fuente citada en el JSON). */
function corrienteMax(def: PiezaDef, modelo: string): number | null {
  const por = (def.limites as { por?: { valores?: Record<string, { corriente?: number }> } } | undefined)?.por
  return num(por?.valores?.[modelo]?.corriente)
}

/** Columnas que se leen de los parámetros de cada modelo: Bf e Ic máx (bipolar), Vto e Id máx (MOSFET), GBW y velocidad de
 * cambio (amplificador). Sin esas cifras (el 555, una pieza sin modelos) no hay tabla y la ficha usa botones. */
export function columnasDeModelos(def: PiezaDef): TablaModelos | null {
  const prop = propModelo(def)
  const m = def.modelo
  if (!prop || !m || !('modelos' in m) || !m.modelos) return null
  const modelos = m.modelos
  const p = (modelo: string) => modelos[modelo] as Record<string, unknown> | undefined
  const nombres = prop.opciones!
  if (m.tipo === 'bjt')
    return { columnas: ['Bf', 'Ic máx'], filas: nombres.map((n) => ({ modelo: n, celdas: [num(p(n)?.bf) === null ? 'sin dato' : String(Math.round(num(p(n)?.bf)!)), cifra(corrienteMax(def, n), 'A')] })) }
  if (m.tipo === 'mosfet') return { columnas: ['Vto', 'Id máx'], filas: nombres.map((n) => ({ modelo: n, celdas: [cifra(num(p(n)?.vto), 'V'), cifra(corrienteMax(def, n), 'A')] })) }
  if (m.tipo === 'ampop') {
    const sr = (n: string) => {
      const v = num(p(n)?.sr)
      return v === null ? 'sin dato' : `${Number((v / 1e6).toPrecision(3))} V/µs`
    }
    return { columnas: ['GBW', 'SR'], filas: nombres.map((n) => ({ modelo: n, celdas: [cifra(num(p(n)?.gbw), 'Hz'), sr(n)] })) }
  }
  return null
}

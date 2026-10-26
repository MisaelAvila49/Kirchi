/** Cuántos puntos produce cada análisis y sus topes. Los comparte la validación de la configuración y la de la petición en el proceso principal, que no se fía de la primera. */

/** Puntos que puede producir un análisis completo (todas sus corridas): unos pocos millones, no más. */
export const TOPE_PUNTOS = 2_000_000
/** Corridas de un barrido de parámetro. */
export const MAX_CORRIDAS = 200
/** Puntos por década, octava o en total de un barrido de CA. */
export const MAX_PUNTOS_AC = 100_000

/** Puntos del barrido de CD de una fuente (inclusive en los dos extremos). */
export function puntosDc(desde: number, hasta: number, paso: number): number {
  return Math.floor(Math.abs(hasta - desde) / paso + 1e-9) + 1
}

/** Puntos de un barrido de CA de ngspice (`dec`, `oct` o `lin` con ese número de puntos). */
export function puntosAc(barrido: 'dec' | 'oct' | 'lin', puntos: number, desde: number, hasta: number): number {
  if (barrido === 'lin') return puntos
  const cuantas = barrido === 'dec' ? Math.log10(hasta / desde) : Math.log2(hasta / desde)
  return Math.ceil(puntos * cuantas) + 1
}

/** Pasos de un transitorio: el paso más largo que se permite fija el mínimo (ngspice puede dar más en un flanco). */
export function puntosTran(fin: number, paso: number, maximo?: number): number {
  return Math.ceil(fin / Math.min(paso, maximo ?? Infinity)) + 1
}

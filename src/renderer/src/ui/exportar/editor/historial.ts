/**
 * Historial de deshacer y rehacer: estados inmutables. Dos cambios seguidos con la misma `clave` cuentan como uno.
 */
export interface Historial<T> {
  readonly pasado: readonly T[]
  readonly presente: T
  readonly futuro: readonly T[]
  /** La clave del último cambio, para juntarlo con el siguiente si es la misma. */
  readonly clave: string | null
}

export const LIMITE_HISTORIAL = 100

export const crearHistorial = <T>(inicial: T): Historial<T> => ({ pasado: [], presente: inicial, futuro: [], clave: null })

export function confirmar<T>(h: Historial<T>, nuevo: T, clave: string | null = null, limite = LIMITE_HISTORIAL): Historial<T> {
  if (Object.is(nuevo, h.presente)) return h
  // Mismo gesto: el estado de antes del gesto se queda como único paso atrás.
  if (clave !== null && clave === h.clave) return { pasado: h.pasado, presente: nuevo, futuro: [], clave }
  const pasado = [...h.pasado, h.presente]
  return { pasado: pasado.length > limite ? pasado.slice(pasado.length - limite) : pasado, presente: nuevo, futuro: [], clave }
}

/** Corta el gesto en curso: el cambio siguiente, aunque tenga la misma clave, es un paso nuevo. */
export const cerrarGesto = <T>(h: Historial<T>): Historial<T> => (h.clave === null ? h : { ...h, clave: null })

export const puedeDeshacer = <T>(h: Historial<T>): boolean => h.pasado.length > 0
export const puedeRehacer = <T>(h: Historial<T>): boolean => h.futuro.length > 0

export function deshacer<T>(h: Historial<T>): Historial<T> {
  if (h.pasado.length === 0) return h
  return { pasado: h.pasado.slice(0, -1), presente: h.pasado[h.pasado.length - 1], futuro: [h.presente, ...h.futuro], clave: null }
}

export function rehacer<T>(h: Historial<T>): Historial<T> {
  if (h.futuro.length === 0) return h
  return { pasado: [...h.pasado, h.presente], presente: h.futuro[0], futuro: h.futuro.slice(1), clave: null }
}

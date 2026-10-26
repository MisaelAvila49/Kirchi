/** Lo que se mide de una función: el mínimo (con el que se prueba un límite) y la mediana (qué tan estable fue). */
export interface Medida {
  mediana: number
  minimo: number
  muestras: number
}

export interface OpcionesMedir {
  /** Número de muestras (30 por omisión). */
  muestras?: number
  /** Tiempo mínimo de calentamiento en ms (300 por omisión): el compilador just-in-time y las cachés tardan en asentarse. */
  calentarMs?: number
  /** Llamadas mínimas de calentamiento (20 por omisión). */
  minLlamadas?: number
  /** El reloj en ms (`performance.now` por omisión): las pruebas de `medir` le pasan uno falso para tener números exactos. */
  ahora?: () => number
}

declare const gc: (() => void) | undefined

/** Mide `fn` en ms: calienta por tiempo, fuerza el recolector UNA vez al terminar (`--expose-gc`) y toma `muestras`
 * seguidas. Se compara contra el MÍNIMO: el ruido del equipo solo suma tiempo. Forzar el recolector antes de cada muestra
 * deja fría la caché y duplica el tiempo (escena 28 a 59 ms). */
export function medir(fn: () => void, { muestras = 30, calentarMs = 300, minLlamadas = 20, ahora = () => performance.now() }: OpcionesMedir = {}): Medida {
  const t0 = ahora()
  let llamadas = 0
  while (llamadas < minLlamadas || ahora() - t0 < calentarMs) {
    fn()
    llamadas++
  }
  if (typeof gc === 'function') gc()
  const tiempos: number[] = []
  for (let i = 0; i < muestras; i++) {
    const a = ahora()
    fn()
    tiempos.push(ahora() - a)
  }
  tiempos.sort((x, y) => x - y)
  const medio = tiempos.length >> 1
  const mediana = tiempos.length % 2 ? tiempos[medio] : (tiempos[medio - 1] + tiempos[medio]) / 2
  return { mediana, minimo: tiempos[0], muestras }
}

/** El mínimo de `medir`. */
export function minimoDe(fn: () => void, opciones?: OpcionesMedir): number {
  return medir(fn, opciones).minimo
}

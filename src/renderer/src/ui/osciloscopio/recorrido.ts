import { DIVISIONES_H } from '../../instrumentos/ajustes'
import { CANALES_PANTALLA, CIFRAS_COLUMNA, type PantallaSab, type RegistroFino } from '../../sim/protocoloInstrumentos'
import { BANDERA_VACIA } from './dibujar'

/**
 * Desplazarse por lo capturado con el osciloscopio detenido. Con las columnas finas del worker (`RegistroFino`) se arma la pantalla de diez divisiones desde cualquier inicio, como la arma el motor en vivo.
 */

const BANDERAS_DE_NIVEL = 3

/** Dónde puede empezar una ventana de `span` segundos: del principio de lo capturado a lo último que cabe completo. */
export function limitesDeRecorrido(r: Pick<RegistroFino, 't0' | 'dt' | 'n'>, span: number): { min: number; max: number } {
  return { min: r.t0, max: Math.max(r.t0, r.t0 + r.n * r.dt - span) }
}

/** `t0` dentro de los límites (un inicio que no es número vuelve al principio). */
export function acotarInicio(r: Pick<RegistroFino, 't0' | 'dt' | 'n'>, span: number, t0: number): number {
  const { min, max } = limitesDeRecorrido(r, span)
  return Number.isFinite(t0) ? Math.min(max, Math.max(min, t0)) : min
}

/**
 * Inicio de la vista tras llegar un registro nuevo: quien no ha recorrido (null) sigue en el final, quien sí conserva su posición o la más cercana que cabe.
 */
export const inicioTrasRegistro = (inicio: number | null, r: Pick<RegistroFino, 't0' | 'dt' | 'n'>, span: number): number | null => (inicio === null ? null : acotarInicio(r, span, inicio))

/** Por qué no se puede recorrer lo capturado, dicho para la pista bajo la pantalla (registro nulo o no leído). */
export const SIN_REGISTRO = 'Todavía no hay nada capturado que recorrer. Simula un momento y pausa.'
export const ERROR_REGISTRO = 'No se pudo leer lo capturado, así que no se puede recorrer. Pausa o detén de nuevo.'

/**
 * Pantalla de `ncol` columnas desde `t0` que abarca `DIVISIONES_H · base`. Cada columna junta las finas cuyo punto medio cae en ella. Si es más angosta que las finas, interpola como la rejilla del motor (una cresta no sale como espiga). `modelo` aporta lo que no cambia con el desplazamiento; disparo y medidas se quitan.
 */
export function ventanaDeRegistro(r: RegistroFino, base: number, ncol: number, t0: number, modelo: PantallaSab): PantallaSab {
  const span = DIVISIONES_H * base
  const dt = span / ncol
  const columnas = new Float32Array(CANALES_PANTALLA * ncol * CIFRAS_COLUMNA)
  const ancha = dt >= r.dt * (1 - 1e-9)
  const fin = r.t0 + r.n * r.dt
  for (let c = 0; c < CANALES_PANTALLA; c++) {
    const delCanal = c * r.n * CIFRAS_COLUMNA
    for (let i = 0; i < ncol; i++) {
      const [a, b] = [t0 + i * dt, t0 + (i + 1) * dt]
      const o = (c * ncol + i) * CIFRAS_COLUMNA
      if (b <= r.t0 || a >= fin) {
        columnas[o + 4] = BANDERA_VACIA
        continue
      }
      let mn = Infinity, mx = -Infinity, pr = Number.NaN, ul = Number.NaN, banderas = 0
      let j0 = Math.ceil((a - r.t0) / r.dt - 0.5)
      let j1 = Math.ceil((b - r.t0) / r.dt - 0.5) - 1
      if (ancha && j1 >= j0) {
        j0 = Math.max(0, j0)
        j1 = Math.min(r.n - 1, j1)
        for (let j = j0; j <= j1; j++) {
          const q = delCanal + j * CIFRAS_COLUMNA
          if (r.columnas[q + 4] & BANDERA_VACIA) continue
          mn = Math.min(mn, r.columnas[q])
          mx = Math.max(mx, r.columnas[q + 1])
          if (Number.isNaN(pr)) pr = r.columnas[q + 2]
          ul = r.columnas[q + 3]
          banderas |= r.columnas[q + 4] & BANDERAS_DE_NIVEL
        }
      } else {
        // Cada borde sale de la fina que lo contiene: con la fina del punto medio para los dos, la parte de la columna que caía
        // en la vecina quedaba fija en su primero o su último, y la traza subía en escalones. Un borde de finas dentro de la
        // columna entra al mínimo y al máximo (ahí dobla la recta).
        const fina = (t: number) => Math.min(r.n - 1, Math.max(0, Math.floor((t - r.t0) / r.dt)))
        const en = (t: number, j: number) => {
          const q = delCanal + j * CIFRAS_COLUMNA
          if (r.columnas[q + 4] & BANDERA_VACIA) return Number.NaN
          const f = r.columnas[q + 2]
          return f + (r.columnas[q + 3] - f) * Math.min(1, Math.max(0, (t - (r.t0 + j * r.dt)) / r.dt))
        }
        const [ja, jb] = [fina(a), fina(b)]
        const [va, vb] = [en(a, ja), en(b, jb)]
        pr = Number.isNaN(va) ? vb : va
        ul = Number.isNaN(vb) ? va : vb
        if (!Number.isNaN(pr)) {
          mn = Math.min(pr, ul)
          mx = Math.max(pr, ul)
          for (let j = ja; j < jb; j++) {
            const v = en(r.t0 + (j + 1) * r.dt, j)
            if (Number.isNaN(v)) continue
            mn = Math.min(mn, v)
            mx = Math.max(mx, v)
          }
          for (let j = ja; j <= jb; j++) banderas |= r.columnas[delCanal + j * CIFRAS_COLUMNA + 4] & BANDERAS_DE_NIVEL
        }
      }
      if (Number.isNaN(pr)) columnas[o + 4] = BANDERA_VACIA
      else columnas.set([mn, mx, pr, ul, banderas], o)
    }
  }
  return {
    ...modelo,
    version: modelo.version + 1,
    t0,
    dt,
    ncol,
    tDisparo: Number.NaN,
    estado: 'congelado',
    tCaptura: r.tCaptura,
    completoHasta: Array(CANALES_PANTALLA).fill(r.tCaptura),
    medidas: modelo.medidas.map((m) => m.map((x) => ({ valor: Number.NaN, razon: 'sin-datos' as const }))),
    columnas
  }
}

/** Lo que mueve una tecla al recorrer lo capturado, en pantallas completas (null si no es de recorrer). */
export function dxDeTecla(tecla: string, mayus: boolean, conCursores: boolean): number | null {
  if (tecla === 'Home') return Number.NEGATIVE_INFINITY
  if (tecla === 'End') return Number.POSITIVE_INFINITY
  if (tecla === 'PageUp') return -1
  if (tecla === 'PageDown') return 1
  if (conCursores) return null
  if (tecla === 'ArrowLeft') return mayus ? -1 : -0.1
  if (tecla === 'ArrowRight') return mayus ? 1 : 0.1
  return null
}

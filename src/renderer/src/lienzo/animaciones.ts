import type { Id } from '../doc/tipos'
import type { Caja } from '../piezas/tipos'

/** Efectos breves de confirmación en la superposición. Solo mientras hay alguno vivo el lienzo redibuja cada cuadro; el
 * resto del tiempo dibuja bajo demanda. */
export type Efecto =
  /** Anillo alrededor del cuerpo de una pieza recién colocada. */
  | { tipo: 'pulso'; caja: Caja }
  /** Cables recién terminados (el cable nuevo puede quedar partido o fundido con otros). */
  | { tipo: 'brillo'; cables: Id[] }
  /** Colocación, arrastre o cable rechazado; `fantasma` y `en-curso` son el fantasma y el cable en curso. */
  | { tipo: 'sacudida'; piezas: Id[]; cables?: Id[] }

export interface Animacion {
  efecto: Efecto
  /** Instante de inicio en milisegundos (`performance.now()`). */
  inicio: number
  /** prefers-reduced-motion: reduce al pedirla. */
  reducido: boolean
}

/** Estado de los efectos vivos en un instante, listo para dibujar. */
export interface Muestra {
  pulsos: { caja: Caja; escala: number; alfa: number }[]
  brillos: { cables: Id[]; ancho: number; alfa: number }[]
  /** Desplazamiento en x por pieza o cable que se sacude; también se dibuja en color inválido. */
  sacudidas: Map<Id, number>
}

export const DURACION = { pulso: 220, brillo: 250, sacudida: 180 }
/** Con movimiento reducido cada efecto es un resalte fijo de esta duración. */
export const DURACION_REDUCIDA = 200
export const ESCALA_PULSO = 1.6
export const ANCHO_BRILLO = 1.5
export const AMPLITUD_SACUDIDA = 0.6
/** Oscilaciones completas de la sacudida. */
const CICLOS_SACUDIDA = 3

const acotar01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t)

/** Curva cúbica de salida: rápida al principio y suave al final. */
export const salida = (t: number): number => {
  const u = acotar01(t)
  return 1 - (1 - u) ** 3
}

/** Fracción transcurrida, o null si ya terminó. */
function avance(ms: number, duracion: number): number | null {
  const t = Math.max(0, ms)
  return t >= duracion ? null : t / duracion
}

export function pulso(ms: number, reducido: boolean): { escala: number; alfa: number } | null {
  if (reducido) return avance(ms, DURACION_REDUCIDA) === null ? null : { escala: 1, alfa: 1 }
  const p = avance(ms, DURACION.pulso)
  if (p === null) return null
  const e = salida(p)
  return { escala: 1 + (ESCALA_PULSO - 1) * e, alfa: 1 - e }
}

export function brillo(ms: number, reducido: boolean): { ancho: number; alfa: number } | null {
  if (reducido) return avance(ms, DURACION_REDUCIDA) === null ? null : { ancho: ANCHO_BRILLO, alfa: 1 }
  const p = avance(ms, DURACION.brillo)
  if (p === null) return null
  const e = salida(p)
  return { ancho: ANCHO_BRILLO - (ANCHO_BRILLO - 1) * e, alfa: 1 - e }
}

export function sacudida(ms: number, reducido: boolean): { dx: number } | null {
  if (reducido) return avance(ms, DURACION_REDUCIDA) === null ? null : { dx: 0 }
  const p = avance(ms, DURACION.sacudida)
  if (p === null) return null
  // + 0 evita devolver -0 en el primer cuadro.
  return { dx: AMPLITUD_SACUDIDA * Math.sin(2 * Math.PI * CICLOS_SACUDIDA * p) + 0 }
}

/** Muestra los efectos en `ahora` y devuelve los que siguen vivos. */
export function muestrear(anims: Animacion[], ahora: number): { muestra: Muestra; vivas: Animacion[] } {
  const muestra: Muestra = { pulsos: [], brillos: [], sacudidas: new Map() }
  const vivas: Animacion[] = []
  for (const a of anims) {
    const ms = ahora - a.inicio
    const e = a.efecto
    if (e.tipo === 'pulso') {
      const m = pulso(ms, a.reducido)
      if (!m) continue
      muestra.pulsos.push({ caja: e.caja, ...m })
    } else if (e.tipo === 'brillo') {
      const m = brillo(ms, a.reducido)
      if (!m) continue
      muestra.brillos.push({ cables: e.cables, ...m })
    } else {
      const m = sacudida(ms, a.reducido)
      if (!m) continue
      for (const id of e.piezas) muestra.sacudidas.set(id, m.dx)
      for (const id of e.cables ?? []) muestra.sacudidas.set(id, m.dx)
    }
    vivas.push(a)
  }
  return { muestra, vivas }
}

export const muestraVacia = (): Muestra => ({ pulsos: [], brillos: [], sacudidas: new Map() })

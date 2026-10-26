import { pasoBonito } from '../../../../compartido/grafica/ticks'
import type { Dominio } from './vista'

/**
 * Divisiones de la pantalla «Instrumento»: `n` divisiones iguales con paso 1, 2 o 5 por décadas y el borde de abajo en múltiplo del paso.
 */

const MANTISAS = [1, 2, 5, 10] as const
/** La fase se lee mejor en pasos de grados «de reloj». */
const PASOS_GRADOS = [1, 2, 5, 10, 15, 30, 45, 90, 180, 360] as const

function siguientePaso(minimo: number, unidad: string): number {
  if (unidad === '°') return PASOS_GRADOS.find((p) => p >= minimo - 1e-12) ?? 360 * Math.ceil(minimo / 360)
  const e = Math.floor(Math.log10(minimo))
  for (let k = e - 1; k <= e + 1; k++) for (const m of MANTISAS) if (m * 10 ** k >= minimo * (1 - 1e-12)) return m * 10 ** k
  return 10 ** (e + 1)
}

/** El paso por división más chico, entre los de la serie, con el que `n` divisiones cubren de `lo` a `hi` empezando en un múltiplo del paso. */
export function pasoPorDivision(lo: number, hi: number, n: number, unidad: string): number {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return 1
  if (hi - lo < 1e-30) hi = lo + (Math.abs(lo) || 1) * 0.2
  let paso = siguientePaso((hi - lo) / n, unidad)
  // Si al arrancar en el múltiplo anterior ya no llega arriba, el siguiente paso de la serie.
  for (let i = 0; i < 12 && Math.floor(lo / paso + 1e-9) * paso + n * paso < hi - paso * 1e-9; i++) paso = siguientePaso(paso * 1.0001, unidad)
  return paso
}

/**
 * Dominio repartido en `n` divisiones. `holgura` (fracción del rango, 0 por omisión) evita gastar una división por una décima de más.
 */
export function dominioEnDivisiones(d: Dominio, n: number, unidad: string, holgura = 0): Dominio {
  let lo = d.min
  let hi = Number.isFinite(d.max) ? d.max : lo + 1
  if (hi - lo < 1e-30) hi = lo + (Math.abs(lo) || 1) * 0.2
  if (holgura > 0) {
    const r = hi - lo
    lo += holgura * r
    hi -= holgura * r
  }
  const paso = pasoPorDivision(lo, hi, n, unidad)
  // De los arranques que aún cubren los datos, el que deja la ventana más centrada en ellos (±140 mV en ocho divisiones de 50 queda de −200 a 200, no de −150 a 250).
  const k0 = Math.floor(lo / paso + 1e-9)
  const medio = (lo + hi) / 2
  let mejor = k0
  // Solo con datos más o menos simétricos respecto de 0: una ganancia que toca el fondo de la pantalla se queda pegada a él.
  const simetrico = Math.abs(medio) < 0.25 * (hi - lo)
  for (let k = k0; simetrico && k >= k0 - n && (k + n) * paso >= hi - paso * 1e-9; k--) if (Math.abs((k + n / 2) * paso - medio) < Math.abs((mejor + n / 2) * paso - medio) - paso * 1e-9) mejor = k
  const min = Number((mejor * paso).toPrecision(12))
  return { min, max: Number((min + n * paso).toPrecision(12)) }
}

/** Límites «bonitos» de un rango automático: hasta la siguiente marca redonda (±9.6 mV pasa a ±10 mV). */
export function dominioBonito(d: Dominio, objetivo = 8): Dominio {
  if (!Number.isFinite(d.min) || !Number.isFinite(d.max) || d.max - d.min < 1e-30) return d
  const paso = pasoBonito((d.max - d.min) / Math.max(1, objetivo))
  return { min: Number((Math.floor(d.min / paso + 1e-9) * paso).toPrecision(12)), max: Number((Math.ceil(d.max / paso - 1e-9) * paso).toPrecision(12)) }
}

/** Las `n + 1` marcas de un dominio repartido en `n` divisiones. */
export function ticksDeDivisiones(d: Dominio, n: number): number[] {
  const paso = (d.max - d.min) / n
  return Array.from({ length: n + 1 }, (_, i) => Number((d.min + i * paso).toPrecision(12)))
}

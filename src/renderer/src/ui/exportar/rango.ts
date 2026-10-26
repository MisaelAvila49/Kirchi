import { aPixel, deValor, type Dominio, type Escala } from '../grafica/vista'
import { leerEnUnidad } from '../../valores/valores'
import { opcionesDeUnidad, partirValor, textoDeCampo } from '../../valores/unidades'

/** Recorte del eje horizontal al exportar: imágenes y CSV salen solo con el tramo. Cuentas sin DOM. */
export interface RangoExportar {
  desde: number
  hasta: number
}

/** El tramo que queda de `r` dentro de `total`, o null si no recorta nada, no es válido o es más angosto que `minimo` (fracción del total). */
export function rangoEfectivo(r: RangoExportar | null | undefined, total: Dominio, minimo = 1e-6): Dominio | null {
  if (!r || !Number.isFinite(r.desde) || !Number.isFinite(r.hasta)) return null
  const min = Math.max(total.min, Math.min(r.desde, r.hasta))
  const max = Math.min(total.max, Math.max(r.desde, r.hasta))
  const ancho = total.max - total.min
  if (!(max - min > ancho * minimo)) return null
  if (min - total.min <= ancho * 1e-9 && total.max - max <= ancho * 1e-9) return null
  return { min, max }
}

/** Cómo pasar de un píxel de la figura (a 1×) a un valor del eje: el tramo de píxeles de la retícula y lo que muestra. */
export interface MapaX {
  px0: number
  px1: number
  dom: Dominio
  escala: Escala
}

/** Un valor de un campo de rango escrito por el lector (punto o coma decimal); null si no es un número. */
export function leerNumero(texto: string): number | null {
  const t = texto.trim().replace(',', '.').replace('−', '-')
  if (t === '' || !/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/** Un valor del eje escrito en el campo: seis cifras significativas, sin ceros de más. */
export const escribirNumero = (v: number): string => String(Number(v.toPrecision(6))).replace('-', '−')

/** Lo más angosto que puede quedar un tramo al mover una asa (fracción del eje completo): prácticamente cualquiera, sin tope que estorbe. */
export const TRAMO_MINIMO = 1e-6

/** La fracción (0 a 1) del deslizador donde cae `v` sobre el eje `total`; fuera del eje se acota a su borde. */
export function aFraccion(v: number, total: Dominio, escala: Escala): number {
  const f = aPixel(v, total, escala, 0, 1)
  return Number.isFinite(f) ? Math.max(0, Math.min(1, f)) : 0
}

/** El valor del eje en la fracción `f` (0 a 1) del deslizador. */
export const deFraccion = (f: number, total: Dominio, escala: Escala): number => deValor(Math.max(0, Math.min(1, f)), total, escala, 0, 1)

/**
 * Tramo al llevar el extremo `cual` (0 inicio, 1 final) a la fracción `f`: dentro del eje y a `TRAMO_MINIMO` del otro extremo.
 */
export function extremoMovido(total: Dominio, escala: Escala, actual: Dominio, cual: 0 | 1, f: number): RangoExportar {
  const fa = aFraccion(actual.min, total, escala)
  const fb = aFraccion(actual.max, total, escala)
  const x = Math.max(0, Math.min(1, Number.isFinite(f) ? f : cual === 0 ? fa : fb))
  if (cual === 0) {
    const g = Math.min(x, fb - TRAMO_MINIMO)
    return { desde: g <= 0 ? total.min : deFraccion(g, total, escala), hasta: actual.max }
  }
  const g = Math.max(x, fa + TRAMO_MINIMO)
  return { desde: actual.min, hasta: g >= 1 ? total.max : deFraccion(g, total, escala) }
}

/** El texto de un extremo para el campo «Desde» o «Hasta»: «2.5m» si la unidad lleva prefijos (s, Hz, V...), el número tal cual si no. */
export function textoDeExtremo(v: number, unidad: string, decimales?: number | 'auto'): string {
  if (!Number.isFinite(v)) return ''
  const fijar = (n: string): string => (typeof decimales === 'number' && Number(n) !== 0 ? Number(n.replace('−', '-')).toFixed(decimales) : n)
  if (!opcionesDeUnidad(unidad)) return typeof decimales === 'number' && v !== 0 ? v.toFixed(decimales).replace('-', '−') : escribirNumero(v)
  const p = partirValor(v, unidad)
  return textoDeCampo(fijar(p.numero), p.prefijo)
}

/**
 * Lo escrito en «Desde» (cual 0) o «Hasta» (cual 1), contado desde `origen`: el tramo nuevo acotado a los datos, o el motivo por el que no se lee.
 */
export function tramoDeCampo(texto: string, cual: 0 | 1, unidad: string, origen: number, total: Dominio, escala: Escala, actual: Dominio): { rango: RangoExportar } | { error: string } {
  const v = leerEnUnidad(texto, unidad)
  if (v === null) return { error: `Escribe un valor en ${unidad || 'la unidad del eje'}.` }
  const f = aFraccion(v + origen, total, escala)
  return { rango: extremoMovido(total, escala, actual, cual, f) }
}

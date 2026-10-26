import type { Acople, Canal } from '../../instrumentos/ajustes'
import { leerEnUnidad } from '../../valores/valores'

/** Lo que dicen los mandos del osciloscopio (`MandosOsciloscopio.tsx`), aparte para probarlo sin montar la interfaz. */

const ORDEN_ACOPLE: readonly Acople[] = ['DC', 'AC', 'GND']

/** El botón del acoplamiento rota DC → AC → GND → DC. */
export const siguienteAcople = (a: Acople): Acople => ORDEN_ACOPLE[(ORDEN_ACOPLE.indexOf(a) + 1) % ORDEN_ACOPLE.length]

/** El nombre del botón: el acoplamiento que tiene y al que cambia (contiene el texto visible, WCAG 2.5.3). */
export const textoAcople = (c: Canal, a: Acople): string => `Acoplamiento del canal ${c}: ${a}. Cambia a ${siguienteAcople(a)}`

/** «Encender C o D», «Encender B, C o D». */
export function encenderOtros(apagados: readonly Canal[]): string {
  if (apagados.length <= 1) return `Encender ${apagados.join('')}`
  return `Encender ${apagados.slice(0, -1).join(', ')} o ${apagados[apagados.length - 1]}`
}

/** «+1.0 div», «−3.0 div», «0.0 div». */
export function textoPosicion(pos: number): string {
  const v = Math.abs(pos).toFixed(1)
  return pos > 0 ? `+${v} div` : pos < 0 ? `−${v} div` : `${v} div`
}

/** «← R1:2» o «sin conectar». */
export const textoFuente = (f: string | null): string => (f ? `← ${f}` : 'sin conectar')

/** Lo escrito en un campo numérico con unidad («1.5 V», «200m», «-2»), acotado a [min, max] como los botones; null si no se lee. */
export function leerEscrito(texto: string, unidad: string, min: number, max: number): number | null {
  const v = leerEnUnidad(texto, unidad)
  return v === null ? null : Math.min(max, Math.max(min, Number(v.toPrecision(12))))
}

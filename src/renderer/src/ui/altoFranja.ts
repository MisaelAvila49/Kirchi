import { ALTO_FRANJA_MIN } from '../../../compartido/ajustes'

export { ALTO_FRANJA_MIN }
/** El panel de la franja llega a lo más al 60 % del alto de la ventana. */
export const FRACCION_FRANJA_MAX = 0.6
/** El alto con que se abre el osciloscopio la primera vez (mientras el borde nunca se arrastró). */
export const ALTO_FRANJA_OSCILOSCOPIO = 320
export const PASO_TECLA_FRANJA = 10
export const PASO_TECLA_FRANJA_GRANDE = 50

export const altoFranjaMax = (altoVentana: number): number => Math.max(ALTO_FRANJA_MIN, Math.floor(FRACCION_FRANJA_MAX * altoVentana))

export const acotarAltoFranja = (alto: number, altoVentana: number): number => Math.min(altoFranjaMax(altoVentana), Math.max(ALTO_FRANJA_MIN, Math.round(alto)))

/** El alto nuevo con una tecla del separador (las flechas lo suben o lo bajan), o null si la tecla no es suya. */
export function altoConTecla(alto: number, e: { key: string; shiftKey: boolean }, altoVentana: number): number | null {
  const paso = e.shiftKey ? PASO_TECLA_FRANJA_GRANDE : PASO_TECLA_FRANJA
  switch (e.key) {
    case 'ArrowUp':
      return acotarAltoFranja(alto + paso, altoVentana)
    case 'ArrowDown':
      return acotarAltoFranja(alto - paso, altoVentana)
    case 'Home':
      return ALTO_FRANJA_MIN
    case 'End':
      return altoFranjaMax(altoVentana)
    default:
      return null
  }
}

/** El alto con que se abre la franja: el guardado o, si el borde nunca se arrastró, 150 px (320 con el osciloscopio). */
export const altoAlAbrir = (guardado: number | null, osciloscopio: boolean): number => guardado ?? (osciloscopio ? ALTO_FRANJA_OSCILOSCOPIO : ALTO_FRANJA_MIN)

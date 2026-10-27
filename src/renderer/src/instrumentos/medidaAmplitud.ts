import type { Forma } from './ajustes'

/** Cómo se da la amplitud en pantalla. El documento guarda siempre el pico a pico (Vpp). */
export type MedidaAmplitud = 'pp' | 'pico' | 'rms'

export const TITULO_MEDIDA: Record<MedidaAmplitud, string> = { pp: 'Amplitud pico a pico', pico: 'Amplitud pico', rms: 'Amplitud (rms)' }
export const UNIDAD_MEDIDA: Record<MedidaAmplitud, string> = { pp: 'Vpp', pico: 'Vp', rms: 'Vrms' }

/** El globo de cada medida: qué amplitud es. */
export const AYUDA_MEDIDA: Record<MedidaAmplitud, string> = {
  pp: 'Del valor más bajo al más alto de la señal, el doble del pico.',
  pico: 'La señal va de offset − Vp a offset + Vp.',
  rms: 'Valor eficaz de la parte alterna, sin contar el offset.'
}

/** Vrms entre Vp de una forma con valor medio cero, o null si el rms depende del ciclo, del retardo o de los pasos. */
export function factorRms(forma: Forma): number | null {
  switch (forma) {
    case 'Senoidal':
      return 1 / Math.SQRT2
    case 'Cuadrada':
      return 1
    case 'Triangular':
    case 'Diente de sierra':
      return 1 / Math.sqrt(3)
    default:
      return null
  }
}

export const admiteRms = (forma: Forma): boolean => factorRms(forma) !== null

export const EXPLICACION_SIN_RMS = 'El rms de un pulso, un escalón o una escalera depende del ciclo, del retardo y de los pasos, y no tiene una sola equivalencia con el pico.'

/** La medida que de verdad se usa: rms cae a pico a pico en las formas que no lo admiten. */
export const medidaEfectiva = (forma: Forma, m: MedidaAmplitud): MedidaAmplitud => (m === 'rms' && !admiteRms(forma) ? 'pp' : m)

/** De Vpp a la medida mostrada (rms sin componente continua, es decir, de la parte alterna). */
export function vppAMedida(forma: Forma, m: MedidaAmplitud, vpp: number): number {
  const e = medidaEfectiva(forma, m)
  if (e === 'pp') return vpp
  if (e === 'pico') return vpp / 2
  return (vpp / 2) * factorRms(forma)!
}

/** De la medida escrita a Vpp. */
export function medidaAVpp(forma: Forma, m: MedidaAmplitud, valor: number): number {
  const e = medidaEfectiva(forma, m)
  if (e === 'pp') return valor
  if (e === 'pico') return valor * 2
  return (valor * 2) / factorRms(forma)!
}

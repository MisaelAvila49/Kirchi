import { createSignal } from 'solid-js'
import type { MedidaAmplitud } from '../instrumentos/medidaAmplitud'

/**
 * Cómo se escribe y muestra el generador. El documento guarda siempre frecuencia, Vpp y offset. Viven en el módulo para que inspector, pestaña Multímetro y doble clic coincidan.
 */
export const [modoTiempo, setModoTiempo] = createSignal<'frecuencia' | 'periodo'>('frecuencia')
export const [modoAmplitud, setModoAmplitud] = createSignal<'vpp' | 'extremos'>('vpp')
/** Pico a pico, pico o rms: la amplitud se escribe y se muestra así, pero el documento guarda Vpp. */
export const [medidaAmplitud, setMedidaAmplitud] = createSignal<MedidaAmplitud>('pp')

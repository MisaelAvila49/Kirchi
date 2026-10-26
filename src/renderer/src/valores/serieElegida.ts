import { createSignal } from 'solid-js'
import type { SerieComercial } from '../../../compartido/ajustes'

/** Serie comercial vigente: la de Configuración, que la ventana copia aquí desde los ajustes. El inspector y el doble clic
 * la leen y, al cambiarla desde la ficha, la guardan por el gancho de la ventana. */
const [serie, poner] = createSignal<SerieComercial>('E12')
let persistir: ((s: SerieComercial) => void) | undefined

export const serieElegida = serie
/** La ventana la sincroniza con los ajustes. */
export const sincronizarSerie = (s: SerieComercial): void => void poner(s)
/** La ventana dice cómo se guarda un cambio hecho desde la ficha. */
export const alElegirSerie = (f: ((s: SerieComercial) => void) | undefined): void => void (persistir = f)
/** Un cambio desde la ficha: se ve al momento y se guarda. */
export function elegirSerie(s: SerieComercial): void {
  poner(s)
  persistir?.(s)
}

import { CAMPO_VOLTAJE } from '../netlist/alimentaciones'
import type { PiezaDef } from '../piezas/tipos'

/** Lo que dice un campo que no se edita mientras corre la vista previa. */
export const MENSAJE_SOLO_EN_CALIENTE = 'Mientras corre la vista previa solo cambian los valores de fuentes y resistencias: detenla para cambiar este.'

/** Propiedades que cambian sin detener la vista previa: valor de resistencia, potenciómetro y fuente (voltaje, corriente,
 * amplitud, frecuencia, ciclo) y voltaje de riel. El cursor del potenciómetro tiene su control. */
export function editableEnCaliente(def: PiezaDef | undefined, propId: string): boolean {
  const m = def?.modelo
  switch (m?.tipo) {
    case 'R':
    case 'V':
    case 'I':
    case 'pot':
      return propId === m.prop
    case 'senoidal':
      return propId === m.amplitud || propId === m.frecuencia
    case 'pulso':
      // El periodo no es una propiedad: la ficha lo escribe como la frecuencia (`Editor.cambiarPropiedad`).
      return propId === m.alto || propId === m.frecuencia || propId === m.ciclo || propId === 'periodo' || propId === m.ancho || propId === m.subida || propId === m.bajada || propId === m.retardo
    case 'alimentacion':
      return propId === CAMPO_VOLTAJE
    // Todo ajuste de un instrumento se cambia simulando, como la posición del potenciómetro.
    case 'multimetro':
    case 'osciloscopio':
    case 'generador':
    case 'fuente-variable':
      return true
    default:
      return false
  }
}

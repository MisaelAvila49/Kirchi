import { CAMPO_VOLTAJE } from '../netlist/alimentaciones'
import type { PiezaDef } from '../piezas/tipos'

/** Lo que dice un campo que no se edita mientras corre la vista previa. */
export const MENSAJE_SOLO_EN_CALIENTE = 'Este ajuste no cambia mientras corre la vista previa: detenla para cambiarlo.'

/** Propiedades que cambian sin detener la vista previa: valor de resistencia, potenciómetro y fuente (voltaje, corriente,
 * amplitud, frecuencia, ciclo), voltaje de riel y toda perilla en vivo (`enVivo`). El cursor del potenciómetro tiene su control. */
export function editableEnCaliente(def: PiezaDef | undefined, propId: string): boolean {
  if (def?.props.find((d) => d.id === propId)?.enVivo) return true
  const m = def?.modelo
  switch (m?.tipo) {
    case 'I':
      // La corriente variable también cambia su frecuencia y los tiempos del pulso.
      return propId === m.prop || (m.onda !== undefined && Object.entries(m.onda).some(([k, id]) => k !== 'forma' && id === propId))
    case 'R':
    case 'V':
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

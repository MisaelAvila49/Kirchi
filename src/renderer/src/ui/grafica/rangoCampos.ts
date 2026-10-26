import type { RangoEje } from '../../../../compartido/grafica/aspecto'
import { leerValor } from '../../valores/valores'

/** Lo que dice un texto de un campo con unidad como número en las unidades base del eje; null si no se lee (o es de otra unidad). */
export function numeroDeCampo(texto: string, unidad: string): number | null {
  const v = leerValor(texto)
  return v && (v.unidad === '' || v.unidad === unidad) && Number.isFinite(v.valor) ? v.valor : null
}

/** El rango que forman un «desde» y un «hasta» escritos; null mientras falte uno, no se lea o el desde no sea menor que el hasta. */
export function rangoDeTextos(desde: string, hasta: string, unidad: string): RangoEje | null {
  const a = numeroDeCampo(desde, unidad)
  const b = numeroDeCampo(hasta, unidad)
  return a !== null && b !== null && a < b ? { min: a, max: b } : null
}

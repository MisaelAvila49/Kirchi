import type { SerieComercial } from '../../../compartido/ajustes'
import { esComercial, TOLERANCIA, textoDeIngenieria, valoresEnRango, vecinosEnSerie, type Serie } from './series'
import { formatearValor, leerValor } from './valores'

/** Un botón de valor: lo que se escribe en la propiedad, lo que se lee y si es el valor actual. */
export interface OpcionValor {
  texto: string
  etiqueta: string
  activo: boolean
}

export interface NotaSerie {
  tipo: 'ok' | 'aviso'
  texto: string
  /** El valor comercial que propone un aviso. */
  usar?: { texto: string; etiqueta: string }
}

export interface VistaSerie {
  vecinos: OpcionValor[]
  nota: NotaSerie
}

const iguales = (a: number, b: number) => Math.abs(a / b - 1) < 1e-9

/** Lo que la ficha de una resistencia o capacitor dice del valor: vecinos de la serie como botones y una nota que avisa,
 * sin bloquear, si no es comercial. Con serie «libre» no hay botones ni aviso. Un texto ilegible, cero o negativo no
 * tiene vista: el campo ya dice su error. */
export function vistaSerie(texto: string, unidad: string, serie: SerieComercial): VistaSerie | null {
  const v = leerValor(texto)
  if (!v || !(v.valor > 0)) return null
  const et = (x: number) => formatearValor(x, unidad)
  if (serie === 'libre') return { vecinos: [], nota: { tipo: 'ok', texto: 'Valor libre. Cualquier número sirve en la simulación, aunque no se consiga en tienda.' } }
  const s: Serie = serie
  const vec = vecinosEnSerie(v.valor, s)
  if (!vec) return null
  const vecinos = [...new Set(vec)].map((x): OpcionValor => ({ texto: textoDeIngenieria(x), etiqueta: et(x), activo: iguales(x, v.valor) }))
  if (esComercial(v.valor, s)) return { vecinos, nota: { tipo: 'ok', texto: `${et(v.valor)} es comercial en ${s} (tolerancia ${TOLERANCIA[s]}).` } }
  const cercano = vec[1]
  return {
    vecinos,
    nota: { tipo: 'aviso', texto: `${et(v.valor)} no es comercial, el más cercano en ${s} es ${et(cercano)}.`, usar: { texto: textoDeIngenieria(cercano), etiqueta: `Usar ${et(cercano)}` } }
  }
}

export interface VistaCatalogo {
  opciones: OpcionValor[]
  /** El valor no es del catálogo (o no se lee): la ficha lo muestra como «Personalizado» en «Más ajustes». */
  personalizado: boolean
}

/** Los valores del catálogo de una propiedad (el Zener) y si el actual es uno de ellos o uno libre. */
export function vistaCatalogo(texto: string, unidad: string, comunes: readonly string[]): VistaCatalogo {
  const v = leerValor(texto)
  const opciones = comunes.map((c): OpcionValor => {
    const x = leerValor(c)!
    return { texto: c, etiqueta: formatearValor(x.valor, unidad), activo: !!v && iguales(x.valor, v.valor) }
  })
  return { opciones, personalizado: !opciones.some((o) => o.activo) }
}

/** Un rango de la lista de valores comerciales: lo que se lee en el conmutador y de dónde a dónde llega (en la unidad base). */
export interface RangoValores {
  etiqueta: string
  min: number
  /** Excluido. */
  max: number
}

/** Rangos de la lista de valores comerciales de una resistencia (mΩ a MΩ), capacitor (pF a mF) e inductor (nH a H): cada
 * uno es el tramo donde la unidad de ingeniería no cambia, con tope práctico arriba (68 mF, 82 MΩ) y abajo hasta 1 mΩ
 * para resistencias de medición de corriente. */
export const RANGOS_DE_UNIDAD: Record<string, readonly RangoValores[]> = {
  Ω: [
    { etiqueta: 'mΩ', min: 1e-3, max: 1 },
    { etiqueta: 'Ω', min: 1, max: 1e3 },
    { etiqueta: 'kΩ', min: 1e3, max: 1e6 },
    { etiqueta: 'MΩ', min: 1e6, max: 1e8 }
  ],
  F: [
    { etiqueta: 'pF', min: 1e-12, max: 1e-9 },
    { etiqueta: 'nF', min: 1e-9, max: 1e-6 },
    { etiqueta: 'µF', min: 1e-6, max: 1e-3 },
    { etiqueta: 'mF', min: 1e-3, max: 1e-1 }
  ],
  H: [
    { etiqueta: 'nH', min: 1e-9, max: 1e-6 },
    { etiqueta: 'µH', min: 1e-6, max: 1e-3 },
    { etiqueta: 'mH', min: 1e-3, max: 1 },
    { etiqueta: 'H', min: 1, max: 1e2 }
  ]
}

/** El rango que contiene al valor (el más cercano si cae fuera de todos); null si la unidad no tiene rangos. */
export function rangoDeValor(valor: number, unidad: string): string | null {
  const rangos = RANGOS_DE_UNIDAD[unidad]
  if (!rangos || !(valor > 0)) return null
  const dentro = rangos.find((r) => valor >= r.min * (1 - 1e-9) && valor < r.max * (1 - 1e-9))
  if (dentro) return dentro.etiqueta
  return valor < rangos[0].min ? rangos[0].etiqueta : rangos[rangos.length - 1].etiqueta
}

/** Los botones de la serie en un rango, con el valor actual marcado. */
export function valoresDeRango(serie: Serie, unidad: string, rango: string, actual: string): OpcionValor[] {
  const r = RANGOS_DE_UNIDAD[unidad]?.find((x) => x.etiqueta === rango)
  if (!r) return []
  const v = leerValor(actual)
  return valoresEnRango(serie, r.min, r.max).map((x): OpcionValor => ({ texto: textoDeIngenieria(x), etiqueta: formatearValor(x, unidad), activo: !!v && iguales(x, v.valor) }))
}

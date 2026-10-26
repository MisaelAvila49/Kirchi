import type { Magnitud } from './colores'
import type { FilaMedicion } from './medicion'

/** Una lectura como ficha: el nombre, la cifra y su unidad aparte, la magnitud que le da color y si va a todo el ancho. */
export interface Ficha {
  nombre: string
  numero: string
  unidad: string
  magnitud?: Magnitud
  ancha: boolean
  alerta: boolean
}

/** La región de trabajo de un transistor como pasos, con el actual. */
export interface RegionTrabajo {
  pasos: readonly string[]
  actual: number
  /** La región en palabras, para el nombre accesible del grupo. */
  texto: string
}

export interface Lecturas {
  region: RegionTrabajo | null
  fichas: Ficha[]
}

/** Una cifra que no es magnitud y pasa de este largo («conduce en directo») va a todo el ancho. */
const LARGO_ANCHA = 9

/**
 * Separa cifra y unidad de una lectura («14.9 mA» → 14.9 y mA). Lo que no empieza con cifra queda entero y sin unidad. Cifra, espacio y unidad vuelven a dar el texto.
 */
export function partirCifra(valor: string): { numero: string; unidad: string } {
  const m = /^([−-]?[\d.,]+(?:×10[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+)?) (\S.*)$/.exec(valor)
  return m ? { numero: m[1], unidad: m[2] } : { numero: valor, unidad: '' }
}

/** Voltios, amperes o watts, con o sin prefijo SI; lo demás no es una magnitud de las fichas. */
export function magnitudDe(unidad: string): Magnitud | undefined {
  const u = unidad.split(' ')[0]
  if (/^[fpnµmkMGT]?V$/.test(u)) return 'v'
  if (/^[fpnµmkMGT]?A$/.test(u)) return 'i'
  if (/^[fpnµmkMGT]?W$/.test(u)) return 'p'
  return undefined
}

/** Las filas de la medición como región de trabajo (si es un transistor) y fichas, en su orden. */
export function lecturas(filas: readonly FilaMedicion[]): Lecturas {
  // La fila con pasos es la región de un transistor (medicion.ts dice cuáles según el tipo de su modelo).
  const i = filas.findIndex((f) => f.pasos !== undefined)
  const pasos = i < 0 ? undefined : filas[i].pasos
  const region = pasos ? { pasos, actual: pasos.indexOf(filas[i].valor), texto: filas[i].valor } : null
  // «Activa inversa» no es uno de los pasos: la barra se queda sin paso marcado (el diseño no salta) y la palabra va en una ficha.
  const fichas = filas
    .filter((_, k) => !(region && region.actual >= 0 && k === i))
    .map((f): Ficha => {
      const { numero, unidad } = partirCifra(f.valor)
      const alerta = !!f.alerta
      const magnitud = alerta ? undefined : magnitudDe(unidad)
      return { nombre: f.nombre, numero, unidad, magnitud, ancha: alerta || magnitud === 'p' || (!magnitud && f.valor.length > LARGO_ANCHA), alerta }
    })
  return { region, fichas }
}

/** «saturación» → «Saturación». */
export const nombrePaso = (p: string): string => p.charAt(0).toUpperCase() + p.slice(1)

import type { Fuente } from '../doc/tipos'
import tabla from './metricas.json'

/** Avance de cada carácter de las tres fuentes incluidas (milésimas de em, sin interletraje), medido por
 * `scripts/metricas-fuentes.mjs`, para repartir igual los renglones en lienzo, selección y exportación. */
export interface EstiloLetra {
  fuente: Fuente
  negrita: boolean
  cursiva: boolean
}

type Variante = 'normal' | 'negrita' | 'cursiva' | 'negritaCursiva'

/** Avance (en em) de un carácter que la fuente no tiene: el navegador lo toma de una fuente del sistema. */
export const AVANCE_RESPALDO = 0.6

const posicion = new Map<string, number>()
Array.from(tabla.caracteres).forEach((c, i) => posicion.set(c, i))
// El signo ohm (U+2126) es canónicamente equivalente a la omega griega: se dibuja con su glifo.
posicion.set('Ω', posicion.get('Ω') as number)
const fuentes = tabla.fuentes as Record<Fuente, Record<Variante, (number | null)[]>>

const variante = (e: EstiloLetra): Variante => (e.negrita ? (e.cursiva ? 'negritaCursiva' : 'negrita') : e.cursiva ? 'cursiva' : 'normal')

/** Avance de un carácter en em. */
export function avance(c: string, e: EstiloLetra): number {
  const i = posicion.get(c)
  const v = i === undefined ? null : fuentes[e.fuente][variante(e)][i]
  return v === null ? (sinAvance(c) ? 0 : AVANCE_RESPALDO) : v / 1000
}

/** Marcas combinantes y caracteres de ancho cero: se dibujan sobre la letra anterior y no avanzan. */
const SIN_AVANCE = /^[\p{M}\p{Cf}]$/u
const sinAvance = (c: string): boolean => SIN_AVANCE.test(c)

/** Ancho de un texto de un renglón en em: la suma de los avances de sus caracteres. */
export function anchoEnEm(texto: string, e: EstiloLetra): number {
  const fila = fuentes[e.fuente][variante(e)]
  let w = 0
  for (const c of texto) {
    const i = posicion.get(c)
    const v = i === undefined ? null : fila[i]
    w += v === null ? (sinAvance(c) ? 0 : AVANCE_RESPALDO * 1000) : v
  }
  return w / 1000
}

import type { Tema } from '../../../../compartido/ajustes'
import { TONOS_FIGURA, type TonoFigura } from '../../../../compartido/ajustes'
import type { TemaGrafica } from '../../../../compartido/grafica/aspecto'
import { tokensDeTema } from '../../lienzo/paleta'
import { coloresDeTema } from '../colores'

/**
 * Colores de una gráfica, de la tabla de colores según el tema DE LA GRÁFICA (puede diferir del de la aplicación). Nunca un color escrito aquí.
 */
export interface ColoresGrafica {
  tema: Tema
  fondo: string
  reticula: string
  ejes: string
  texto: string
  /** El color de una línea de este tono. */
  linea(t: TonoFigura): string
  /** El color de las cifras y letras de este tono (4.5:1 sobre el fondo). */
  letra(t: TonoFigura): string
}

/** El tema con que se pinta: el fijo de la gráfica o, si es «app», el que se ve. */
export const temaEfectivo = (g: TemaGrafica, app: Tema): Tema => (g === 'app' ? app : g)

export function coloresGrafica(tema: Tema, exportar = false): ColoresGrafica {
  const L = tokensDeTema(tema)
  const T = coloresDeTema(tema)
  return {
    tema,
    fondo: exportar ? L.paneles : L.lienzo,
    reticula: L.rejillaMenor,
    ejes: L.rejillaMayor,
    texto: L.textoSecundario,
    linea: (t) => T[t],
    letra: (t) => T[`${t}-texto`]
  }
}

/** Los tonos que se reparten por orden a las trazas que no eligieron uno (los validados entre sí y dos más). */
export const TONOS_POR_OMISION: readonly TonoFigura[] = ['canal-a', 'canal-b', 'canal-c', 'canal-d', 'naranja', 'magenta']

export const tonoPorOmision = (i: number): TonoFigura => TONOS_POR_OMISION[i % TONOS_POR_OMISION.length]
export const esTonoFigura = (v: unknown): v is TonoFigura => typeof v === 'string' && (TONOS_FIGURA as readonly string[]).includes(v)

import type { TonoFigura } from '../../../../compartido/ajustes'
import type { Decimales, LadoEjeY, PrefijoEje } from '../../../../compartido/grafica/aspecto'
import type { Dominio, Escala } from './vista'

/** Lo que una gráfica sabe dibujar. No lleva colores ni aspecto: los pone quien dibuja (`dibujo.ts`). */
export interface TrazaGrafica {
  /** Nombre único de la traza: con él se guardan su eje y su tono en el documento. */
  clave: string
  etiqueta: string
  unidad: string
  x: Float64Array
  y: Float64Array
  /** El panel (0 arriba): el Bode tiene dos, magnitud y fase. */
  panel: number
  tono: TonoFigura
  lado: LadoEjeY
  discontinua?: boolean
  /** Grosor propio de la línea en px; ausente, el de la gráfica. */
  grosor?: number | null
  /** Prefijo elegido para los números de su eje vertical; ausente, el automático. */
  prefijo?: PrefijoEje | null
  /** Decimales elegidos para las cifras de su eje vertical; ausente, 1. */
  decimales?: Decimales
  /** Desde y hasta escritos a mano para su eje vertical; ausente, los automáticos. */
  rango?: { min: number; max: number }
}

export interface PanelGrafica {
  titulo: string
}

export interface BarrasGrafica {
  /** Una categoría por armónico. */
  categorias: string[]
  series: { clave: string; etiqueta: string; tono: TonoFigura; unidad: string; valores: Float64Array }[]
  /** Las unidades de las series, sin repetir y unidas con « y » (el rótulo del eje). */
  unidad: string
  /** Frecuencia de cada armónico (Hz), para el CSV. */
  frecuencias: Float64Array
  /** Texto de pie (el THD). */
  nota: string
}

export interface ModeloGrafica {
  tipo: 'lineas' | 'barras'
  ejeX: { nombre: string; unidad: string; escala: Escala; datos: Dominio }
  paneles: PanelGrafica[]
  trazas: TrazaGrafica[]
  barras?: BarrasGrafica
  /** Es una gráfica X-Y: el eje horizontal es otra traza y no el tiempo ni la frecuencia (sin lectura por columna ni cursores). */
  xy?: boolean
}

/** Lo que el lector movió: el tramo visible del eje x, la fracción visible de cada eje y, y los dos cursores del eje x. */
export interface VistaGrafica {
  x: Dominio | null
  /** Fracción [0, 1] visible del rango automático de cada panel; null es todo. */
  y: readonly ([number, number] | null)[]
  cursores: [number, number] | null
  /** Trazas apagadas por el lector (por clave). */
  ocultas: ReadonlySet<string>
}

export const VISTA_COMPLETA: VistaGrafica = { x: null, y: [], cursores: null, ocultas: new Set() }

/** Una traza por clave, la primera: la magnitud y la fase de una misma serie comparten clave (y leyenda), y la leyenda lleva el tono de la magnitud. */
export function trazasUnicas(trazas: readonly TrazaGrafica[]): TrazaGrafica[] {
  const vistas = new Set<string>()
  return trazas.filter((t) => !vistas.has(t.clave) && !!vistas.add(t.clave))
}

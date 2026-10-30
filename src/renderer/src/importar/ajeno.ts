/** Descripción común de un circuito de otro programa: lo único que produce cada lector y consume el convertidor. */

/** `spice` no tiene columna de equivalencias en las piezas: usa una tabla de familias aparte. */
export type FormatoAjeno = 'falstad' | 'ltspice' | 'spice' | 'kicad' | 'proteus'

export interface PinAjeno {
  nombre?: string
  numero?: string
  /** Posición absoluta en unidades del origen, si el archivo o el símbolo la dan. */
  x?: number
  y?: number
}

export interface PiezaAjena {
  ref: string
  /** Tipo en el programa de origen (`Device:R`, `res`, `r`, `RES`). */
  tipo: string
  valor?: string
  modelo?: string
  props: Record<string, string>
  /** Unidad de un símbolo multiunidad (A, B...). */
  unidad?: string
  x?: number
  y?: number
  /** Grados, positivo antihorario, medido en el sistema de coordenadas del origen (antes de invertir Y). */
  giro?: number
  espejoX?: boolean
  espejoY?: boolean
  pines: PinAjeno[]
}

export interface RedAjena {
  nombre?: string
  /** `pin` es el número o el nombre, el que el origen use. */
  pines: { ref: string; pin: string }[]
}

export interface PuntoAjeno {
  x: number
  y: number
}

export interface TerminalAjena {
  nombre: string
  tipo: 'tierra' | 'alimentacion' | 'entrada' | 'salida' | 'otra'
  x: number
  y: number
  giro?: number
}

export interface DibujoAjeno {
  cables: PuntoAjeno[][]
  uniones: PuntoAjeno[]
  /** `giro`: hacia dónde crece la etiqueta, en grados antihorarios, si el origen lo dice. */
  etiquetas: { nombre: string; x: number; y: number; giro?: number }[]
  terminales: TerminalAjena[]
  textos: { texto: string; x: number; y: number }[]
}

export type InstrumentoAjeno =
  | { tipo: 'sonda'; magnitud: 'voltaje' | 'corriente'; nombre: string; red?: string; x?: number; y?: number }
  | { tipo: 'generador'; forma: 'pulso' | 'senoidal' | 'cd' | 'otra'; nombre: string; red: string; referencia?: string; parametros: Record<string, number | string>; x?: number; y?: number }
  | {
      tipo: 'virtual'
      clase: 'voltimetro' | 'amperimetro' | 'osciloscopio'
      nombre: string
      redes: string[]
      /** Dónde estaba el instrumento (o la gráfica) en el origen. */
      x?: number
      y?: number
      /** Una gráfica del origen vuelta osciloscopio: el tiempo que muestra y el rango de su eje vertical. */
      ventana?: [number, number]
      rangoY?: [number, number]
    }

export type DirectivaAjena =
  | { tipo: 'analisis'; analisis: 'op' | 'dc' | 'tran' | 'ac' | 'fourier'; parametros: Record<string, number | string>; trazas: string[]; nombre?: string }
  | { tipo: 'modelo'; nombre: string; clase: string; parametros: Record<string, number | string> }
  | { tipo: 'subcircuito'; nombre: string; nodos: string[]; cuerpo: string }
  | { tipo: 'otra'; texto: string }

export interface CircuitoAjeno {
  formato: FormatoAjeno
  version?: string
  nombre: string
  /** Unidades del origen que caben en un milímetro, si el formato las fija. */
  unidadesPorMm?: number
  /** El eje Y del origen crece hacia arriba (Proteus), al revés que en Kirchi. */
  yHaciaArriba?: boolean
  piezas: PiezaAjena[]
  redes: RedAjena[]
  dibujo?: DibujoAjeno
  instrumentos: InstrumentoAjeno[]
  directivas: DirectivaAjena[]
  /** Parámetros globales del origen (`.param` de SPICE), sin evaluar. */
  params?: Record<string, string>
  avisos: string[]
}

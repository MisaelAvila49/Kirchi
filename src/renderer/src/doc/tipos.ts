import type { AnalisisDoc } from '../../../compartido/analisis/config'
export type Id = string

/** Coordenadas enteras en unidades de rejilla fina: 1 = 1.25 mm. */
export interface Punto {
  x: number
  y: number
}

export type Rotacion = 0 | 90 | 180 | 270

/** Lugar de un texto movido a mano: uno de ocho en el marco del símbolo, así gira y se refleja con la pieza (el texto
 * siempre se lee derecho). */
export type LugarTexto = 'arriba' | 'arriba-derecha' | 'derecha' | 'abajo-derecha' | 'abajo' | 'abajo-izquierda' | 'izquierda' | 'arriba-izquierda'
/** Un lugar alrededor del cuerpo o, movido con Alt, el centro del texto en unidades del símbolo (antes de girar). */
export type PosicionTexto = { lugar: LugarTexto } | { x: number; y: number }
/** Los textos de una pieza que se mueven: su referencia, su valor (el voltaje de un terminal) y, en las piezas que se ajustan, el ajuste. */
export type CualTexto = 'ref' | 'valor' | 'ajuste'

export interface Pieza {
  id: Id
  tipo: string
  ref: string
  x: number
  y: number
  rot: Rotacion
  espejo: boolean
  props: Record<string, string>
  /** Textos movidos a mano: mandan sobre el reparto automático (`lienzo/apartar.ts`). Sin el campo, todos automáticos. */
  textos?: Partial<Record<CualTexto, PosicionTexto>>
  /** Modelo «Personalizado»: parámetros SPICE propios en lugar de los de la lista (`doc/spice.ts`). Sin el campo se usa el
   * modelo. */
  spice?: Record<string, number>
}

export interface Cable {
  id: Id
  puntos: Punto[]
}

export type Fuente = 'sans' | 'serif' | 'mono'
export type Tinta = 'tinta' | 'gris' | 'rojo' | 'azul' | 'verde'
export type Alinear = 'centro' | 'der' | 'just'

/** Formato de una nota o etiqueta: solo lo que difiere del valor por omisión (`doc/formato.ts`). */
export interface FormatoTexto {
  fuente?: Fuente
  /** Alto de la letra en mm, de 1 a 20, con un decimal. */
  tam?: number
  negrita?: true
  cursiva?: true
  subrayado?: true
  /** Nombre de la tinta, nunca un color: cada tema la pinta con su tono. */
  tinta?: Tinta
  /** Solo en notas; sin él, a la izquierda. */
  alinear?: Alinear
  /** Contorno del texto: caja de nota o bandera de etiqueta. Nombre de una de las cinco tintas o «ninguno»; sin él, gris
   * en notas y trazo de pieza en etiquetas. */
  contorno?: Tinta | 'ninguno'
}

export interface Etiqueta {
  id: Id
  nombre: string
  x: number
  y: number
  rot: Rotacion
  formato?: FormatoTexto
}

export interface Nota {
  id: Id
  x: number
  y: number
  /** Ancho de la caja en unidades de rejilla fina; los renglones se reparten dentro de él. */
  ancho: number
  texto: string
  formato?: FormatoTexto
  /** El usuario fijó el ancho con las asas: ya no sigue al texto ni al formato. */
  anchoFijo?: true
  /** Alto mínimo fijado con las asas, en unidades de rejilla fina. La caja mide el mayor entre este alto y el del texto,
   * que queda arriba. */
  alto?: number
}

/** Voltaje de un riel (VCC, VDD, VEE o cualquier nombre que no sea voltaje), compartido por sus terminales. El documento
 * guarda solo los que difieren (`netlist/alimentaciones.ts`). */
export interface Alimentacion {
  id: Id
  nombre: string
  /** Tal como se escribió, en V («15», «-12», «3.3 V»). */
  voltaje: string
}

/** Figuras de dibujo: no son parte del circuito. Netlist, conexiones, choques y reparto de textos no las ven, y se dibujan
 * detrás de todo. */
export type TipoFigura = 'linea' | 'rectangulo' | 'elipse' | 'flecha'
/** Grosores de pluma ISO 128, en mm. */
export type Grosor = 0.25 | 0.35 | 0.5 | 0.7
export type Trazo = 'continuo' | 'guiones' | 'puntos'
export type Punta = 'llena' | 'abierta' | 'dos'
/** Opacidad de una figura en por ciento. */
export type Opacidad = 100 | 75 | 50 | 25

export interface Figura {
  id: Id
  tipo: TipoFigura
  /** Dos puntos enteros de la rejilla fina. Línea y flecha: (x1, y1) a (x2, y2), con la punta en el segundo. Rectángulo y
   * elipse: esquinas en orden (x1 < x2, y1 < y2). */
  x1: number
  y1: number
  x2: number
  y2: number
  /** Orden de dibujo entre las figuras (entero): la de menor orden queda al fondo. */
  orden: number
  /** Solo lo que difiere de lo de omisión (`doc/figuras.ts`): gris, 0.25 mm, continuo, sin relleno y punta llena. */
  tinta?: Tinta
  grosor?: Grosor
  trazo?: Trazo
  /** Solo en rectángulo y elipse. */
  relleno?: true
  /** Solo en la flecha. */
  punta?: Exclude<Punta, 'llena'>
  /** Por ciento; sin el campo, 100. */
  opacidad?: Exclude<Opacidad, 100>
}

/** Sondas de medición: un punto donde se mide sin cablear. Las de instrumento unen su entrada con la red como un cable;
 * las de voltaje y corriente solo leen. */
export type TipoSonda = 'osciloscopio' | 'multimetro' | 'voltaje' | 'corriente' | 'medidor'
/** El sentido positivo de una sonda de corriente, a lo largo de su tramo. */
export type SentidoSonda = 'derecha' | 'izquierda' | 'abajo' | 'arriba'

export interface Sonda {
  id: Id
  tipo: TipoSonda
  /** El punto que mide, en la rejilla fina: sobre un cable, un pin o el ancla de una etiqueta. */
  x: number
  y: number
  /** Osciloscopio y multímetro: la pieza del instrumento y su entrada («A» a «D», «+» o «COM»). */
  instrumento?: Id
  entrada?: string
  /** Corriente: hacia dónde es positiva. */
  sentido?: SentidoSonda
  /** Medidor rápido: qué lee del punto y cómo, dónde queda su pantalla (unidades de rejilla desde el punto, hasta 8) y su referencia («M1»). */
  magnitud?: 'voltaje' | 'corriente'
  modo?: 'dc' | 'ac'
  pantalla?: { dx: number; dy: number }
  ref?: string
}

export interface Documento {
  piezas: Record<Id, Pieza>
  cables: Record<Id, Cable>
  etiquetas: Record<Id, Etiqueta>
  notas: Record<Id, Nota>
  /** Rieles con un voltaje distinto del de omisión; sin el campo (o vacío), todos tienen el suyo. */
  alimentaciones?: Record<Id, Alimentacion>
  /** Figuras de dibujo; sin el campo (o vacío), no hay ninguna y el archivo queda como antes de que existieran. */
  figuras?: Record<Id, Figura>
  /** Sondas de medición; sin el campo (o vacío), no hay ninguna y el archivo queda como antes de que existieran. */
  sondas?: Record<Id, Sonda>
  /** Análisis de ngspice configurados; sin el campo (o vacío), no hay ninguno y el archivo queda como antes de que existieran. */
  analisis?: Record<Id, AnalisisDoc>
}

/** Lo que se dibuja y se selecciona. */
export type Coleccion = 'piezas' | 'cables' | 'etiquetas' | 'notas' | 'figuras' | 'sondas'
/** Todo lo que guarda el documento: lo dibujado y la tabla de alimentaciones. */
export type ColeccionDoc = Coleccion | 'alimentaciones' | 'analisis'

export const MM_POR_UNIDAD = 1.25

export function documentoVacio(): Documento {
  return { piezas: {}, cables: {}, etiquetas: {}, notas: {} }
}

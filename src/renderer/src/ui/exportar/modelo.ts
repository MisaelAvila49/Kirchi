import type { FormatoFigura, TonoFigura } from '../../../../compartido/ajustes'

/** Los nombres y reglas del diálogo de exportar una figura que no dependen de la interfaz. */
export const NOMBRE_FORMATO_FIGURA: Readonly<Record<FormatoFigura, string>> = { png: 'PNG', svg: 'SVG', pdf: 'PDF', csv: 'CSV' }
/** La palabra bajo el nombre del formato en su casilla. */
export const SUB_FORMATO: Readonly<Record<FormatoFigura, string>> = { png: 'imagen', svg: 'vectorial', pdf: 'documento', csv: 'datos' }
export const AYUDA_FORMATO: Readonly<Record<FormatoFigura, string>> = {
  png: 'Imagen con la resolución que elijas.',
  svg: 'Dibujo vectorial: se puede ampliar sin perder calidad.',
  pdf: 'Hoja del tamaño de la figura, en vectores.',
  csv: 'Los datos como tabla, para una hoja de cálculo.'
}
export const NOMBRE_FAMILIA_FIGURA = { interfaz: 'Mona Sans', cifras: 'Geist Mono', serif: 'Source Serif 4' } as const
export const NOMBRE_TONO_FIGURA: Readonly<Record<TonoFigura, string>> = {
  'canal-a': 'Verde azulado',
  'canal-b': 'Azul',
  'canal-c': 'Ocre',
  'canal-d': 'Ciruela',
  naranja: 'Naranja',
  magenta: 'Magenta',
  gris: 'Gris',
  negro: 'Negro'
}

/** Las series de la figura con el nombre que ve quien exporta («Canal A», «A − B»). */
export interface SerieFigura {
  id: string
  nombre: string
}

/** Qué opciones le tocan a una figura en un formato; las que no, no se muestran. */
export interface VisiblesFigura {
  escala: boolean
  letra: boolean
  ejes: boolean
  rejilla: boolean
  colores: boolean
}

/** Por formato: el PNG trae resolución; el CSV, ninguna opción de aspecto; el SVG y el PDF, todo salvo la resolución. */
export function visiblesDe(formato: FormatoFigura): VisiblesFigura {
  if (formato === 'csv') return { escala: false, letra: false, ejes: false, rejilla: false, colores: false }
  return { escala: formato === 'png', letra: true, ejes: true, rejilla: true, colores: true }
}


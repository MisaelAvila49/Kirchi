import { calcularConexiones } from '../../renderer/src/conexiones/conexiones'
import type { Documento } from '../../renderer/src/doc/tipos'
import { svgEnPixeles } from '../../renderer/src/exportar/png'
import { svgDeEscena } from '../../renderer/src/exportar/svg'
import { construirEscena } from '../../renderer/src/lienzo/escena'
import { hexARgba, PALETA_CLARA } from '../../renderer/src/lienzo/paleta'
import type { PiezaDef } from '../../renderer/src/piezas/tipos'

/** Lado mayor máximo de la imagen que se devuelve. */
export const LADO_MAXIMO_IMAGEN = 2048
export const LADO_POR_OMISION = 1200
const PX_POR_MM = 96 / 25.4

export interface ImagenSvg {
  svg: string
  /** Medidas en píxeles del PNG que sale de este SVG. */
  ancho: number
  alto: number
}

/** El esquema como SVG sobre fondo blanco, sin DOM ni canvas: la base de los textos es fija y las fuentes son las del
 * visor. Null si el circuito está vacío. `lado` es el lado mayor deseado, con tope en `LADO_MAXIMO_IMAGEN`. */
export function imagenSvgDe(doc: Documento, lib: Map<string, PiezaDef>, titulo: string, lado = LADO_POR_OMISION): ImagenSvg | null {
  const esc = construirEscena(doc, lib, calcularConexiones(doc, lib), PALETA_CLARA, {})
  const fuentes = { interfaz: 'sans-serif', cifras: 'monospace', serif: 'serif' }
  const lamina = svgDeEscena(esc, { paleta: PALETA_CLARA, fondo: hexARgba('#FFFFFF'), rejilla: false, fuentes, titulo, base: () => 0.27 })
  if (!lamina) return null
  const nativo = { ancho: lamina.anchoMm * PX_POR_MM, alto: lamina.altoMm * PX_POR_MM }
  const escala = Math.min(Math.min(lado, LADO_MAXIMO_IMAGEN) / Math.max(nativo.ancho, nativo.alto), 4)
  const ancho = Math.max(1, Math.round(nativo.ancho * escala)), alto = Math.max(1, Math.round(nativo.alto * escala))
  return { svg: lamina.svg, ancho, alto }
}

/** El SVG con sus medidas en píxeles, listo para pintarse a ese tamaño. */
export const svgParaPantalla = (i: ImagenSvg): string => svgEnPixeles(i.svg, i.ancho, i.alto)

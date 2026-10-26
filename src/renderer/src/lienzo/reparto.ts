import type { Alineacion } from '../doc/formato'
import { anchoEnEm, type EstiloLetra } from './metricas'

/** Reparto de un texto en renglones con las métricas de las fuentes incluidas. Es la única medida del texto de notas y
 * etiquetas (lienzo, caja de selección, índice de clics y exportación), así los cortes son idénticos en pantalla, SVG y
 * PDF. */

export interface Palabra {
  texto: string
  /** Desde el inicio del renglón, sin justificar, en unidades de mundo. */
  x: number
  ancho: number
}

export interface Renglon {
  texto: string
  /** Ancho natural (sin justificar) en unidades de mundo. */
  ancho: number
  palabras: Palabra[]
  /** Último renglón de su párrafo: el justificado lo deja a la izquierda. */
  finDeParrafo: boolean
}

/** Un trozo de renglón listo para dibujar: `x` desde el borde izquierdo del área de texto. */
export interface Trozo {
  texto: string
  x: number
  ancho: number
}

const EPS = 1e-9

/** Saltos de línea de cualquier sistema: LF, CRLF o CR suelto. */
export const SALTO = /\r\n?|\n/

/** El texto como se mide y se dibuja: composición canónica (NFC) y tabuladores como espacios. */
export const normalizar = (t: string): string => t.normalize('NFC').replace(/\t/g, ' ')

const segmentador = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null
/** Los grafemas de un texto: un emoji con modificadores o una letra con marcas sueltas es un solo carácter para cortar. */
export const grafemas = (t: string): string[] => (segmentador ? Array.from(segmentador.segment(t), (s) => s.segment) : Array.from(t))

/** Parte una palabra más larga que `max` por caracteres: los trozos llenos y el resto. */
function partirPalabra(p: string, estilo: EstiloLetra, em: number, max: number): string[] {
  const trozos: string[] = []
  let actual = ''
  for (const c of grafemas(p)) {
    if (actual && anchoEnEm(actual + c, estilo) * em > max + EPS) {
      trozos.push(actual)
      actual = c
    } else actual += c
  }
  trozos.push(actual)
  return trozos
}

/** Renglones de `texto` con letra de alto `em` (mundo) que caben en `anchoMax`. Un salto escrito siempre corta; se corta
 * en espacios y una palabra más larga que la caja se parte por caracteres. Con `anchoMax` infinito solo cortan los saltos
 * escritos. */
export function repartir(texto: string, estilo: EstiloLetra, em: number, anchoMax = Infinity): Renglon[] {
  const espacio = anchoEnEm(' ', estilo) * em
  const ancho = (t: string) => anchoEnEm(t, estilo) * em
  const out: Renglon[] = []
  for (const parrafo of normalizar(texto).split(SALTO)) {
    const propios: Renglon[] = []
    let palabras: Palabra[] = []
    let x = 0
    const cerrar = () => {
      // Los espacios al final del renglón no cuentan: ni en su ancho ni al alinear.
      while (palabras.length && palabras[palabras.length - 1].texto === '') palabras.pop()
      const ultima = palabras[palabras.length - 1]
      propios.push({ texto: palabras.map((p) => p.texto).join(' '), ancho: ultima ? ultima.x + ultima.ancho : 0, palabras, finDeParrafo: false })
      palabras = []
      x = 0
    }
    for (const p of parrafo.split(' ')) {
      const w = ancho(p)
      // Un espacio de más no provoca un corte ni abre un renglón de continuación: los renglones no empiezan con espacios.
      if (p === '' && propios.length > 0 && !palabras.length) continue
      if (p !== '' && palabras.length && x + espacio + w > anchoMax + EPS) cerrar()
      if (!palabras.length && w > anchoMax + EPS && p.length > 1 && grafemas(p).length > 1) {
        const trozos = partirPalabra(p, estilo, em, anchoMax)
        for (const t of trozos.slice(0, -1)) {
          palabras = [{ texto: t, x: 0, ancho: ancho(t) }]
          x = palabras[0].ancho
          cerrar()
        }
        const resto = trozos[trozos.length - 1]
        palabras = [{ texto: resto, x: 0, ancho: ancho(resto) }]
        x = palabras[0].ancho
        continue
      }
      const px = palabras.length ? x + espacio : 0
      palabras.push({ texto: p, x: px, ancho: w })
      x = px + w
    }
    cerrar()
    propios[propios.length - 1].finDeParrafo = true
    out.push(...propios)
  }
  return out
}

/** El renglón más ancho sin cortar más que en los saltos escritos. */
export function anchoNatural(texto: string, estilo: EstiloLetra, em: number): number {
  return Math.max(0, ...normalizar(texto).split(SALTO).map((l) => anchoEnEm(l.replace(/ +$/, ''), estilo) * em))
}

/** La palabra más ancha: la caja de una nota no se angosta más. */
export function palabraMasAncha(texto: string, estilo: EstiloLetra, em: number): number {
  return Math.max(0, ...normalizar(texto).split(/[\r\n ]/).map((p) => anchoEnEm(p, estilo) * em))
}

/** Dónde va cada trozo de un renglón en un área de `anchoArea`: el renglón entero según la alineación o, justificado, cada
 * palabra con el espacio sobrante repartido (el último renglón del párrafo queda a la izquierda). */
export function colocarRenglon(r: Renglon, alinear: Alineacion, anchoArea: number): Trozo[] {
  if (alinear === 'just' && !r.finDeParrafo && r.palabras.length > 1) {
    const extra = Math.max(0, anchoArea - r.ancho) / (r.palabras.length - 1)
    return r.palabras.filter((p) => p.texto !== '').map((p) => ({ texto: p.texto, x: p.x + extra * r.palabras.indexOf(p), ancho: p.ancho }))
  }
  const x = alinear === 'centro' ? (anchoArea - r.ancho) / 2 : alinear === 'der' ? anchoArea - r.ancho : 0
  return r.texto === '' ? [] : [{ texto: r.texto, x, ancho: r.ancho }]
}

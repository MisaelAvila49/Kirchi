import { normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PAGINAS, type PaginaPdf, type TipoPagina } from '../compartido/archivos'

/** PDF a partir del SVG exportado, impreso en una ventana oculta de Chromium sin red. Aquí solo lo puro (la página y el HTML); la ventana la pone `ipcArchivos.ts`. */

/** Tamaño de las hojas en mm, en vertical. */
export const HOJAS: Record<Exclude<TipoPagina, 'ajustar'>, [number, number]> = { a4: [210, 297], carta: [215.9, 279.4] }
/** Margen de la hoja en A4 y carta (el dibujo ya trae sus 5 mm propios). */
export const MARGEN_HOJA_MM = 10
/** Un dibujo de más de esto (5 m) no es un esquema: se rechaza en lugar de pedir una página absurda. */
const MAXIMO_MM = 5000

export interface Hoja {
  anchoMm: number
  altoMm: number
  /** Tamaño del dibujo en la hoja: igual al real si cabe; si no, reducido para caber (nunca ampliado). */
  dibujoAnchoMm: number
  dibujoAltoMm: number
  horizontal: boolean
}

/** Página válida que llega por IPC: tipo conocido y medidas razonables. */
export function paginaValida(p: unknown): p is PaginaPdf {
  const q = p as Partial<PaginaPdf> | null
  const mm = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= MAXIMO_MM
  return !!q && typeof q === 'object' && PAGINAS.includes(q.tipo as TipoPagina) && mm(q.anchoMm) && mm(q.altoMm)
}

/** Hoja de un dibujo: «ajustar» es del tamaño del dibujo, A4 y carta van horizontales si el dibujo es más ancho y se escala si no cabe. */
export function hojaPara(p: PaginaPdf): Hoja {
  if (p.tipo === 'ajustar') return { anchoMm: p.anchoMm, altoMm: p.altoMm, dibujoAnchoMm: p.anchoMm, dibujoAltoMm: p.altoMm, horizontal: p.anchoMm > p.altoMm }
  const horizontal = p.anchoMm > p.altoMm
  const [a, b] = HOJAS[p.tipo]
  const anchoMm = horizontal ? b : a, altoMm = horizontal ? a : b
  const escala = Math.min(1, (anchoMm - 2 * MARGEN_HOJA_MM) / p.anchoMm, (altoMm - 2 * MARGEN_HOJA_MM) / p.altoMm)
  return { anchoMm, altoMm, dibujoAnchoMm: p.anchoMm * escala, dibujoAltoMm: p.altoMm * escala, horizontal }
}

/** Política de la página que se imprime: sin guiones y sin red; solo estilos en línea y fuentes e imágenes incrustadas. */
const POLITICA = "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; font-src data: blob:"

const mm = (v: number) => `${Math.round(v * 1000) / 1000}mm`

/** El HTML que se imprime: la hoja con `@page` y el SVG en línea, centrado, sin la declaración XML. */
export function htmlParaPdf(svg: string, p: PaginaPdf): string {
  const h = hojaPara(p)
  const cuerpo = svg.replace(/^\s*<\?xml[^>]*\?>\s*/, '')
  return [
    '<!doctype html>',
    '<html lang="es"><head><meta charset="utf-8"><title>Kirchi</title>',
    `<meta http-equiv="Content-Security-Policy" content="${POLITICA}">`,
    `<style>@page{size:${mm(h.anchoMm)} ${mm(h.altoMm)};margin:0}html,body{margin:0;padding:0}`,
    `body{width:${mm(h.anchoMm)};height:${mm(h.altoMm)};display:flex;align-items:center;justify-content:center;overflow:hidden}`,
    `body>svg{display:block;width:${mm(h.dibujoAnchoMm)};height:${mm(h.dibujoAltoMm)};flex:none}</style>`,
    `</head><body>${cuerpo}</body></html>`
  ].join('\n')
}

/** Un error de la impresión con un mensaje que se puede mostrar (sin rutas ni detalles de Chromium). */
export class ErrorPdf extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'ErrorPdf'
  }
}

/** Tiempo máximo para cargar e imprimir un PDF; al vencer se destruye la ventana. */
export const LIMITE_PDF_MS = 30_000

/** `p` con tiempo límite: pasados `ms` se llama `alVencer` y se rechaza con `ErrorPdf`. */
export function conLimite<T>(p: Promise<T>, ms: number, alVencer: () => void): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined
  const vence = new Promise<never>((_, rechazar) => {
    t = setTimeout(() => {
      alVencer()
      rechazar(new ErrorPdf(`tardó más de ${Math.round(ms / 1000)} s`))
    }, ms)
  })
  return Promise.race([p, vence]).finally(() => clearTimeout(t))
}

/** Lo único que puede cargar la ventana que imprime: su temporal (comparado como ruta) y lo incrustado (`data:`, `blob:`). Un `file:` con servidor es de red. */
export function peticionPdfPermitida(url: string, permitida: string | null): boolean {
  if (/^(data|blob):/i.test(url)) return true
  if (!permitida || !/^file:/i.test(url)) return false
  try {
    const u = new URL(url)
    if (u.host !== '') return false
    const clave = (r: string) => (process.platform === 'linux' ? normalize(r) : normalize(r).toLowerCase())
    return clave(fileURLToPath(u)) === clave(permitida)
  } catch {
    return false
  }
}

/*
 * Lista blanca del SVG que se imprime: se valida su forma en vez de buscar lo prohibido. Sin comentarios, DTD, CDATA ni entidades, CSS sin escapes ni `@import`, y `url()` solo a fuentes incrustadas.
 * Sin etiquetas dentro de title y desc: en HTML son puntos de integración y se leen como HTML.
 */
const ELEMENTOS = new Set(['svg', 'title', 'desc', 'style', 'defs', 'pattern', 'g', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'path', 'text', 'tspan', 'clipPath', 'linearGradient', 'radialGradient', 'stop'])
/** Elementos que solo llevan texto (o, en `text`, `tspan`). */
const SOLO_TEXTO = new Set(['title', 'desc', 'style', 'text', 'tspan'])
const ATRIBUTOS = new Set([
  'xmlns', 'xml:space', 'version', 'id', 'width', 'height', 'viewBox', 'preserveAspectRatio',
  'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'dx', 'dy', 'd', 'points', 'transform',
  'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap', 'stroke-linejoin',
  'stroke-dasharray', 'stroke-dashoffset', 'stroke-miterlimit', 'opacity', 'clip-path', 'clipPathUnits', 'vector-effect', 'shape-rendering', 'paint-order',
  'font-family', 'font-size', 'font-weight', 'font-style', 'font-stretch', 'text-anchor', 'dominant-baseline', 'textLength', 'lengthAdjust', 'letter-spacing', 'word-spacing',
  'patternUnits', 'patternContentUnits', 'patternTransform', 'gradientUnits', 'gradientTransform', 'offset', 'stop-color', 'stop-opacity'
])
const NS_SVG = 'http://www.w3.org/2000/svg'
const MAX_PROFUNDIDAD = 64
const ENTIDAD = /&(?:amp|lt|gt|quot|apos|#[0-9]{1,7}|#x[0-9a-fA-F]{1,6});/y

/** Texto o valor de atributo: sin `<` y con `&` solo en entidades predefinidas o numéricas. */
function textoValido(s: string): boolean {
  if (s.includes('<')) return false
  for (let i = s.indexOf('&'); i >= 0; i = s.indexOf('&', i + 1)) {
    ENTIDAD.lastIndex = i
    if (!ENTIDAD.test(s)) return false
  }
  return true
}

/** Un valor de atributo: texto válido y, si lleva `url(`, solo a un id del mismo documento. */
function valorValido(nombre: string, v: string): boolean {
  if (!textoValido(v)) return false
  if (nombre === 'xmlns') return v === NS_SVG
  if (nombre === 'xml:space') return v === 'preserve' || v === 'default'
  return !/url\s*\(/i.test(v.replace(/url\(#[A-Za-z_][\w.-]*\)/g, ''))
}

const FUNCIONES_CSS = new Set(['url', 'format', 'local', 'rgb', 'rgba', 'hsl', 'hsla'])

/** El CSS del `<style>`: solo @font-face, funciones conocidas y `url()` a fuentes incrustadas. */
function cssValido(css: string): boolean {
  if (/[<&\\]/.test(css)) return false
  for (const m of css.matchAll(/@([\w-]*)/g)) if (m[1].toLowerCase() !== 'font-face') return false
  for (const m of css.matchAll(/([\w-]*)\s*\(/g)) if (!FUNCIONES_CSS.has(m[1].toLowerCase())) return false
  for (const m of css.matchAll(/url\s*\(([^)]*)\)/gi)) if (!/^\s*(['"]?)data:(font\/(woff2?|ttf|otf)|application\/font-woff2?);base64,[A-Za-z0-9+/=]*\1\s*$/i.test(m[1])) return false
  return true
}

const DECLARACION = /\s*<\?xml\s[^<>?]*\?>/y
const ETIQUETA = /<([A-Za-z][\w:-]*)((?:\s+[A-Za-z_:][\w:.-]*="[^"<]*")*)\s*(\/?)>/y
const CIERRE = /<\/([A-Za-z][\w:-]*)\s*>/y
const ATRIBUTO = /\s+([A-Za-z_:][\w:.-]*)="([^"<]*)"/g

/** ¿Es el SVG de la exportación? Además de la política de la página y de que la ventana solo carga su temporal, se valida con la lista blanca. */
export function svgValido(svg: unknown, limite: number): svg is string {
  if (typeof svg !== 'string' || svg.length > limite) return false
  let i = 0
  DECLARACION.lastIndex = 0
  if (DECLARACION.test(svg)) i = DECLARACION.lastIndex
  const pila: string[] = []
  let raizCerrada = false
  while (i < svg.length) {
    const lt = svg.indexOf('<', i)
    const fin = lt < 0 ? svg.length : lt
    if (fin > i) {
      const texto = svg.slice(i, fin)
      const padre = pila[pila.length - 1]
      // Fuera de la raíz, o en un elemento que no lleva texto, solo espacios.
      if (!padre || !SOLO_TEXTO.has(padre) ? texto.trim() !== '' : padre === 'style' ? !cssValido(texto) : !textoValido(texto)) return false
      i = fin
      continue
    }
    if (svg.startsWith('</', i)) {
      CIERRE.lastIndex = i
      const m = CIERRE.exec(svg)
      if (!m || pila.pop() !== m[1]) return false
      if (pila.length === 0) raizCerrada = true
      i = CIERRE.lastIndex
      continue
    }
    ETIQUETA.lastIndex = i
    const m = ETIQUETA.exec(svg)
    if (!m || raizCerrada) return false
    const [, nombre, attrs, cerrada] = m
    const padre = pila[pila.length - 1]
    if (!ELEMENTOS.has(nombre) || (pila.length === 0) !== (nombre === 'svg')) return false
    if (padre && SOLO_TEXTO.has(padre) && !(padre === 'text' && nombre === 'tspan')) return false
    for (const a of attrs.matchAll(ATRIBUTO)) if (/^on/i.test(a[1]) || !ATRIBUTOS.has(a[1]) || !valorValido(a[1], a[2])) return false
    if (!cerrada) {
      if (pila.length >= MAX_PROFUNDIDAD) return false
      pila.push(nombre)
    } else if (pila.length === 0) raizCerrada = true
    i = ETIQUETA.lastIndex
  }
  return raizCerrada && pila.length === 0
}

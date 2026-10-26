import type { LadoEjeY, PosicionEjeX } from '../../../../compartido/grafica/aspecto'

/**
 * Dónde va cada cosa de una gráfica (retícula, columnas de ejes verticales, banda del horizontal). Entrada en píxeles CSS, salida en píxeles de dispositivo.
 */

export interface EntradaColocacion {
  /** Tamaño del lienzo en píxeles de dispositivo. */
  W: number
  H: number
  dpr: number
  /** Los lados de los ejes verticales, en el orden en que se reparten las columnas de cada lado. */
  lados: readonly LadoEjeY[]
  /** Dónde va el eje horizontal; «ninguno» lo omite (el panel de arriba de un Bode: comparte el de abajo). */
  ejeX: PosicionEjeX | 'ninguno'
  /** Ancho de la columna de un eje vertical. */
  columna: number
  /** Ancho propio de cada columna (px CSS, en el orden de `lados`): el que pide el texto de sus cifras. Sin él, todas miden `columna`. */
  anchos?: readonly number[]
  /** Donde empieza la primera columna de la izquierda. */
  inicioIzq: number
  /** Distancia del borde del lienzo al inicio de la retícula sin columnas a la izquierda; `extraIzq` se suma (marcas de 0 V apiladas). */
  aireIzq: number
  extraIzq?: number
  /** Espacio entre la retícula y la primera columna de la derecha (o el borde). */
  aireDer: number
  /** Alto de la banda del eje horizontal cuando va arriba o abajo. */
  banda: number
  /** Margen arriba cuando el eje horizontal no va arriba (da lugar al título de cada columna). */
  arribaLibre: number
  /** Margen abajo cuando el eje horizontal no va abajo. */
  abajoLibre: number
}

export interface ColumnaColocada {
  /** Índice en `lados`. */
  i: number
  lado: LadoEjeY
  x0: number
  x1: number
  /** Donde corre la línea del eje: el borde de la retícula, o su centro. */
  linea: number
}

export interface Colocacion {
  /** La retícula. */
  x: number
  y: number
  w: number
  h: number
  columnas: ColumnaColocada[]
  /** La banda del eje horizontal y la altura de su línea. */
  eje: { y0: number; y1: number; linea: number; posicion: PosicionEjeX | 'ninguno' }
  dpr: number
}

/** Lo que ocupan arriba y abajo los márgenes y la banda del eje horizontal (px CSS): sirve para repartir el alto entre paneles. */
export function margenesVerticales(e: Pick<EntradaColocacion, 'ejeX' | 'banda' | 'arribaLibre' | 'abajoLibre'>): { arriba: number; abajo: number } {
  return { arriba: e.ejeX === 'arriba' ? e.banda : e.arribaLibre, abajo: e.ejeX === 'abajo' ? e.banda : e.abajoLibre }
}

/** Lo que mide un carácter de la letra de las cifras (Geist Mono) respecto de su tamaño: sirve para reservar el ancho de una columna sin dibujar. */
export const ANCHO_CARACTER = 0.6
/** Aire entre el texto de una columna y su borde (la rayita de la marca y un respiro), en px CSS. */
export const AIRE_COLUMNA = 12

/** El ancho de columna (px CSS) que piden estos textos (las cifras y el título de la unidad) a `px` de tamaño de letra. */
export function anchoDeColumna(textos: readonly string[], px: number): number {
  const mayor = Math.max(0, ...textos.map((t) => [...t].length))
  return Math.ceil(mayor * ANCHO_CARACTER * px) + AIRE_COLUMNA
}

export function colocar(e: EntradaColocacion): Colocacion {
  const d = e.dpr
  const ancho = (i: number): number => e.anchos?.[i] ?? e.columna
  const suma = (lado: LadoEjeY): number => e.lados.reduce((s, l, i) => (l === lado ? s + ancho(i) : s), 0)
  const nCen = e.lados.filter((l) => l === 'centro').length
  // El borde izquierdo de la retícula: `aireIzq` (medido desde el borde del lienzo, como en la pantalla) más las columnas de la izquierda.
  const xr = (e.aireIzq + (e.extraIzq ?? 0) + suma('izquierda')) * d
  const anchoDerecha = (e.aireDer + suma('derecha')) * d
  const w = Math.max(1, e.W - xr - anchoDerecha)
  const { arriba, abajo } = margenesVerticales(e)
  const y = arriba * d
  const h = Math.max(1, e.H - y - abajo * d)
  const cx = xr + w / 2
  const previo = { izquierda: 0, derecha: 0, centro: 0 }
  const centros = e.lados.flatMap((l, i) => (l === 'centro' ? [ancho(i)] : []))
  let kc = 0
  const columnas: ColumnaColocada[] = e.lados.map((lado, i) => {
    const wi = ancho(i) * d
    if (lado === 'izquierda') {
      const x0 = e.inicioIzq * d + previo.izquierda
      previo.izquierda += wi
      return { i, lado, x0, x1: x0 + wi, linea: xr }
    }
    if (lado === 'derecha') {
      const x0 = xr + w + e.aireDer * d + previo.derecha
      previo.derecha += wi
      return { i, lado, x0, x1: x0 + wi, linea: xr + w }
    }
    // En medio: las columnas se acomodan a la izquierda de su línea; la última queda sobre el centro de la retícula.
    const despues = centros.slice(kc + 1).reduce((s, q) => s + q, 0) * d
    kc++
    const x1 = cx - despues
    return { i, lado, x0: x1 - wi, x1, linea: x1 }
  })
  const eje =
    e.ejeX === 'arriba'
      ? { y0: 0, y1: y, linea: y, posicion: e.ejeX }
      : e.ejeX === 'abajo'
        ? { y0: y + h, y1: e.H, linea: y + h, posicion: e.ejeX }
        : e.ejeX === 'ninguno'
          ? { y0: y + h, y1: y + h, linea: y + h, posicion: e.ejeX }
          : { y0: 0, y1: y, linea: y + h / 2, posicion: e.ejeX }
  return { x: xr, y, w, h, columnas, eje, dpr: d }
}

/** Qué hay en (x, y): la columna de un eje vertical, el eje horizontal, la retícula o nada. */
export type ZonaColocada = { tipo: 'columna'; i: number } | { tipo: 'ejeX' } | { tipo: 'reticula' } | null

export function zonaColocada(c: Colocacion, x: number, y: number): ZonaColocada {
  const d = c.dpr
  const dentroY = y >= c.y - 4 * d && y <= c.y + c.h + 4 * d
  const enLaReticula = x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h
  // Una columna en medio vive sobre la retícula: se toma antes que ella, pero solo en su franja.
  const col = c.columnas.find((k) => x >= k.x0 && x < k.x1 && dentroY && (k.lado !== 'centro' || enLaReticula))
  if (col) return { tipo: 'columna', i: col.i }
  if (c.eje.posicion === 'centro') {
    if (y < c.eje.y1 && x >= c.x - 6 * d && x <= c.x + c.w + 6 * d) return { tipo: 'ejeX' }
    if (Math.abs(y - c.eje.linea) <= 12 * d && enLaReticula) return { tipo: 'ejeX' }
  } else if (y >= c.eje.y0 && y < c.eje.y1 && x >= c.x - 6 * d && x <= c.x + c.w + 6 * d) return { tipo: 'ejeX' }
  return enLaReticula ? { tipo: 'reticula' } : null
}

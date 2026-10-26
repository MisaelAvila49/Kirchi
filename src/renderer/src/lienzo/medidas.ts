import { ANCHO_NOTA_MAX, ANCHO_NOTA_MIN, formatoCompleto, type FormatoCompleto } from '../doc/formato'
import { MM_POR_UNIDAD, type Etiqueta, type FormatoTexto, type Nota } from '../doc/tipos'
import { transformar } from '../piezas/transformar'
import type { Caja } from '../piezas/tipos'
import { anchoEnEm, type EstiloLetra } from './metricas'
import { anchoNatural, normalizar, palabraMasAncha, repartir, type Renglon } from './reparto'

/** Grosores y radios en unidades de mundo (1 = 1.25 mm). */
export const ANCHO_TRAZO = 0.25
export const ANCHO_CABLE = 0.25
/** La caja de un símbolo mide la línea central; selección e índice la amplían medio grosor. */
export const MARGEN_CAJA = ANCHO_TRAZO / 2
/** El punto de unión mide 3.2 veces el grosor del cable (0.8 unidades, 1 mm), siempre el mismo sin importar cuántos cables lleguen. */
export const RADIO_UNION = 0.4
export const RADIO_SALTO = 0.8
/** Alto del texto en unidades de mundo. */
export const TAM_ETIQUETA = 1.6
export const TAM_NOTA = 1.6
export const LINEA_NOTA = 2
/** Ancho estimado de un carácter como fracción del alto (fuentes monoespaciadas de cifras). */
export const ANCHO_CARACTER = 0.6
export const CAJA_DESCONOCIDA: Caja = { minX: -4, minY: -2, maxX: 4, maxY: 2 }

/** Rejilla de puntos: el claro en cada celda de esquema (2 unidades, 2.5 mm) y el oscuro cada 6 celdas (15 mm: una pieza
 * de 10 mm deja un punto claro libre a cada lado). Al alejar el zoom los niveles gruesos conservan la razón de 6 (72 y
 * 432 unidades). */
export const PASO_REJILLA_MENOR = 2
export const CELDAS_POR_PUNTO_OSCURO = 6
export const PASO_REJILLA_MAYOR = PASO_REJILLA_MENOR * CELDAS_POR_PUNTO_OSCURO

/** Píxeles CSS por unidad a tamaño real: 96 ppp, 25.4 mm por pulgada, 1.25 mm por unidad. */
export const ZOOM_100 = (96 / 25.4) * 1.25
export const ZOOM_INICIAL = 2 * ZOOM_100
/** Zoom máximo del encuadre (F y el encuadre al cargar): 500 %; la rueda llega más lejos. */
export const ZOOM_ENCUADRE_MAX = 5 * ZOOM_100
/** El encuadre cae en múltiplos de 50 % (el más alto que cabe); por debajo de 50 % ajusta exacto. */
export const PASO_ZOOM_ENCUADRE = ZOOM_100 / 2
export const porcentajeZoom = (zoom: number): number => Math.round((zoom / ZOOM_100) * 100)
/** Zoom exacto en porcentaje (sin redondear) y su inverso. */
export const zoomAPorcentaje = (zoom: number): number => (zoom / ZOOM_100) * 100
export const porcentajeAZoom = (pct: number): number => (pct / 100) * ZOOM_100

/** «150», «150 %», «150%» o «150.5» → 150; null si no es un número positivo. */
export function leerPorcentaje(texto: string): number | null {
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*%?\s*$/.exec(texto)
  if (!m) return null
  const v = Number(m[1].replace(',', '.'))
  return v > 0 ? v : null
}

/** Siguiente paso de − y + en porcentaje: el múltiplo de 50 siguiente (850 → 900 o 800) y de 10 en 10 por debajo de 50 (50
 * → 40; 45 → 50 al subir). Acotado a [min, max]; en el límite devuelve `actual`. */
export function siguientePasoZoom(actual: number, dir: 1 | -1, min: number, max: number): number {
  const a = Math.round(actual * 1e6) / 1e6
  let pasos: number
  if (dir > 0) pasos = a < 50 ? Math.min(50, (Math.floor(a / 10 + 1e-9) + 1) * 10) : (Math.floor(a / 50 + 1e-9) + 1) * 50
  else pasos = a <= 50 ? (Math.ceil(a / 10 - 1e-9) - 1) * 10 : (Math.ceil(a / 50 - 1e-9) - 1) * 50
  const r = Math.min(max, Math.max(min, pasos))
  return dir > 0 ? Math.max(r, Math.min(a, max)) : Math.min(r, Math.max(a, min))
}

export type Alineacion = 'izq' | 'der' | 'centro'
/** El texto empieza en el punto si queda a la derecha del origen, termina en él si queda a la izquierda. */
export const alineacionPorX = (x: number): Alineacion => (x > 0 ? 'izq' : x < 0 ? 'der' : 'centro')
export const anchoTexto = (texto: string, tam: number): number => texto.length * tam * ANCHO_CARACTER

export function cajaDePuntos(pts: ArrayLike<number>): Caja {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (let i = 0; i + 1 < pts.length; i += 2) {
    if (pts[i] < minX) minX = pts[i]
    if (pts[i] > maxX) maxX = pts[i]
    if (pts[i + 1] < minY) minY = pts[i + 1]
    if (pts[i + 1] > maxY) maxY = pts[i + 1]
  }
  return { minX, minY, maxX, maxY }
}

export const desplazarCaja = (c: Caja, dx: number, dy: number): Caja => ({ minX: c.minX + dx, minY: c.minY + dy, maxX: c.maxX + dx, maxY: c.maxY + dy })

/** Alto de la letra en unidades de mundo para un tamaño en mm (2 mm → 1.6). */
export const emDeTam = (mm: number): number => mm / MM_POR_UNIDAD
export const estiloDe = (f: FormatoCompleto): EstiloLetra => ({ fuente: f.fuente, negrita: f.negrita, cursiva: f.cursiva })

/** Ancho del nombre de una etiqueta de red con su formato, en unidades de mundo. */
export function anchoNombreEtiqueta(e: Pick<Etiqueta, 'nombre' | 'formato'>): number {
  const f = formatoCompleto(e.formato, 'etiqueta')
  return anchoEnEm(normalizar(e.nombre) || ' ', estiloDe(f)) * emDeTam(f.tam)
}

/** La bandera crece con la letra: con 2 mm (la de siempre) mide 1 unidad de alto a cada lado. */
const escalaEtiqueta = (e: Pick<Etiqueta, 'formato'>) => emDeTam(formatoCompleto(e.formato, 'etiqueta').tam) / TAM_ETIQUETA
const largoEtiqueta = (e: Etiqueta) => {
  const k = escalaEtiqueta(e)
  return k + anchoNombreEtiqueta(e) + 0.8 * k
}

/** Bandera de la etiqueta de red como polilínea cerrada plana; la punta es el punto de conexión. */
export function formaEtiqueta(e: Etiqueta): number[] {
  const l = largoEtiqueta(e)
  const k = escalaEtiqueta(e)
  const local = [0, 0, k, -k, l, -k, l, k, k, k, 0, 0]
  const out: number[] = []
  for (let i = 0; i < local.length; i += 2) {
    const [x, y] = transformar(local[i], local[i + 1], e.rot, false)
    out.push(e.x + x, e.y + y)
  }
  return out
}


/** Caja de la etiqueta: la bandera. El nombre va dentro y no ensancha la caja (se toca, aparta y encuadra con la bandera). */
export function cajaEtiqueta(e: Etiqueta): Caja {
  return cajaDePuntos(formaEtiqueta(e))
}

/** El nombre va dentro de la bandera, desde 1.4 veces su media altura a partir de la punta. Horizontal se lee de izquierda
 * a derecha; vertical gira un cuarto (`giro`) y se lee de arriba abajo. El reflejo es otra orientación (simétrica), así
 * que basta el giro. `alinear`: de qué lado del ancla crece el texto. */
export function anclaTextoEtiqueta(e: Etiqueta): { x: number; y: number; alinear: Alineacion; giro?: 90 } {
  const k = escalaEtiqueta(e)
  const [x, y] = transformar(1.4 * k, 0, e.rot, false)
  if (e.rot === 0 || e.rot === 180) return { x: e.x + x, y: e.y + y, alinear: alineacionPorX(x) }
  return { x: e.x + x, y: e.y + y, alinear: alineacionPorX(y), giro: 90 }
}

/** Margen de la caja de una nota alrededor de su texto, en unidades. */
export const PAD_NOTA_X = 0.8
export const PAD_NOTA_Y = 0.6
/** El margen crece con la letra: la cursiva y el serif sobresalen de su avance y con 10 mm pasarian de la caja. */
export const padNotaX = (em: number): number => Math.max(PAD_NOTA_X, 0.2 * em)
export const padNotaY = (em: number): number => Math.max(PAD_NOTA_Y, 0.15 * em)
/** Interlineado como múltiplo del alto de la letra: 2 unidades con la letra de 1.6. */
export const INTERLINEA = LINEA_NOTA / TAM_NOTA
export { ANCHO_NOTA_MAX, ANCHO_NOTA_MIN }
/** Una nota nueva nunca es más angosta que 10 mm. */
export const ANCHO_NOTA_AUTO_MIN = 8

export interface DisposicionNota {
  formato: FormatoCompleto
  /** Alto de la letra y del renglón, en unidades. */
  em: number
  linea: number
  /** Ancho disponible para el texto dentro de la caja. */
  anchoArea: number
  /** Ancho de la caja: el guardado, o el del texto si la nota no tiene el ancho fijado. */
  anchoCaja: number
  /** Margen horizontal y vertical de la caja con esta letra. */
  padX: number
  padY: number
  renglones: Renglon[]
}

// La disposición solo depende del texto, el ancho, si está fijado y el formato (no de la posición): se recuerda por objeto,
// que es lo más rápido, y por contenido, para que arrastrar una nota (un objeto nuevo en cada paso) no la vuelva a repartir.
const disposiciones = new WeakMap<Nota, DisposicionNota>()
const porContenido = new Map<string, DisposicionNota>()
const MAX_DISPOSICIONES = 20000
const claveNota = (n: Nota): string => `${n.ancho}|${n.anchoFijo ? 1 : 0}|${n.formato ? JSON.stringify(n.formato) : ''}|${n.texto}`

/** Renglones de una nota repartidos en el ancho de su caja (la misma medida para dibujar, seleccionar y exportar). */
export function disposicionNota(n: Nota): DisposicionNota {
  const hecha = disposiciones.get(n)
  if (hecha) return hecha
  const clave = claveNota(n)
  const igual = porContenido.get(clave)
  if (igual) {
    disposiciones.set(n, igual)
    return igual
  }
  const formato = formatoCompleto(n.formato, 'nota')
  const em = emDeTam(formato.tam)
  const estilo = estiloDe(formato)
  const padX = padNotaX(em), padY = padNotaY(em)
  // Un ancho de archivo menor que el mínimo (a mano o de otra versión) se dibuja con el mínimo.
  let anchoArea = Math.max(0, Math.max(n.ancho, ANCHO_NOTA_MIN) - 2 * padX)
  // Una nota sin el ancho fijado sigue a su texto: así las notas de archivos anteriores (con el ancho estimado de entonces) no cambian de forma.
  if (!n.anchoFijo) anchoArea = Math.max(anchoArea, Math.min(anchoNatural(n.texto, estilo, em), ANCHO_NOTA_MAX - 2 * padX))
  const d = { formato, em, linea: em * INTERLINEA, anchoArea, anchoCaja: anchoArea + 2 * padX, padX, padY, renglones: repartir(n.texto, estilo, em, anchoArea) }
  disposiciones.set(n, d)
  if (porContenido.size >= MAX_DISPOSICIONES) porContenido.clear()
  porContenido.set(clave, d)
  return d
}

/** Alto que pide el texto de la nota (sin contar el alto fijado con las asas). */
export const altoTextoNota = (n: Nota): number => {
  const d = disposicionNota(n)
  return 2 * d.padY + d.renglones.length * d.linea
}
/** Alto de la caja: el mayor entre el fijado con las asas (`alto`) y el del texto, que queda arriba. */
export const altoNota = (n: Nota): number => Math.max(n.alto ?? 0, altoTextoNota(n))
export const cajaNota = (n: Nota): Caja => ({ minX: n.x, minY: n.y, maxX: n.x + disposicionNota(n).anchoCaja, maxY: n.y + altoNota(n) })

const enRejillaFina = (v: number) => Math.ceil(v - 1e-9)

export type LadoAsa = 'izq' | 'der'
export type LadoVertical = 'arriba' | 'abajo'
/** Medio lado del cuadrito de cada asa, en unidades. */
export const RADIO_ASA = 0.35

/** Las siete asas de la caja de una nota: cuatro esquinas, mitad de los bordes laterales y mitad del inferior. `lado` dice
 * qué borde vertical mueve (null: ninguno) y `vert` qué borde horizontal. */
export function asasDeNota(n: Nota): { x: number; y: number; lado: LadoAsa | null; vert: LadoVertical | null }[] {
  const c = cajaNota(n)
  const my = (c.minY + c.maxY) / 2, mx = (c.minX + c.maxX) / 2
  return [
    { x: c.minX, y: c.minY, lado: 'izq', vert: 'arriba' }, { x: c.minX, y: my, lado: 'izq', vert: null }, { x: c.minX, y: c.maxY, lado: 'izq', vert: 'abajo' },
    { x: c.maxX, y: c.minY, lado: 'der', vert: 'arriba' }, { x: c.maxX, y: my, lado: 'der', vert: null }, { x: c.maxX, y: c.maxY, lado: 'der', vert: 'abajo' },
    { x: mx, y: c.maxY, lado: null, vert: 'abajo' }
  ]
}

/** Cursor de redimensión de un asa: horizontal, vertical o en diagonal según los bordes que mueve. */
export function cursorDeAsa(a: { lado: LadoAsa | null; vert: LadoVertical | null }): string {
  if (a.lado && a.vert) return (a.lado === 'izq') === (a.vert === 'arriba') ? 'nwse-resize' : 'nesw-resize'
  return a.vert ? 'ns-resize' : 'ew-resize'
}

/** Lo más bajo que puede quedar la caja al arrastrar sus asas: lo que pide el texto, en la rejilla fina. */
export const altoNotaMinimo = (n: Nota): number => enRejillaFina(altoTextoNota(n))

/** Ancho de una nota que el usuario no ha fijado: el de su renglón más largo, de 10 mm a 400 mm. */
export function anchoNotaAuto(texto: string, formato?: FormatoTexto): number {
  const f = formatoCompleto(formato, 'nota')
  return Math.min(ANCHO_NOTA_MAX, Math.max(ANCHO_NOTA_AUTO_MIN, enRejillaFina(anchoNatural(texto, estiloDe(f), emDeTam(f.tam)) + 2 * padNotaX(emDeTam(f.tam)))))
}

/** Lo más angosta que puede quedar la caja al arrastrar sus asas: 5 mm o su palabra más larga. */
export function anchoNotaMinimo(n: Pick<Nota, 'texto' | 'formato'>): number {
  const f = formatoCompleto(n.formato, 'nota')
  return Math.min(ANCHO_NOTA_MAX, Math.max(ANCHO_NOTA_MIN, enRejillaFina(palabraMasAncha(n.texto, estiloDe(f), emDeTam(f.tam)) + 2 * padNotaX(emDeTam(f.tam)))))
}

/** El ancho de la nota sigue a su texto (y a su formato) mientras el usuario no lo fije con las asas. */
export const anchoSigueAlTexto = (n: Pick<Nota, 'anchoFijo'>): boolean => !n.anchoFijo

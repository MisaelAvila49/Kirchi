import { FACTOR_PREFIJO, SIMBOLO_PREFIJO, type Decimales, type LadoEjeY, type PosicionEjeX, type PrefijoEje } from '../../../../compartido/grafica/aspecto'
import { decimalesPorOmision, etiquetaEnPrefijo, prefijoParaRango, textoCifraEje } from '../../../../compartido/grafica/ejes'
import { anchoDeColumna, colocar } from '../grafica/colocacion'
import { DIVISIONES_H, DIVISIONES_V, POS_RANGO, type AjustesCanal, type AjustesOsciloscopio, type Canal } from '../../instrumentos/ajustes'

/**
 * Escalas de voltios de cada canal a la izquierda y eje del tiempo ARRIBA de la retícula, para que no se pierda al agregar canales. Medidas en píxeles CSS, `marcoDePantalla` las pasa a dispositivo.
 */
export const MARCO = { columna: 40, aire: 20, ejeTiempo: 40, derecha: 22, abajo: 8 } as const

export interface ColumnaEje {
  canal: Canal
  x0: number
  x1: number
  /** De qué lado va su escala (a la izquierda salvo que el aspecto diga otra cosa). */
  lado: LadoEjeY
}

/** Lo que cambia el marco según el aspecto: de qué lado va la escala de cada canal y dónde va el eje del tiempo. */
export interface OpcionesMarco {
  ejeX?: PosicionEjeX
  lados?: Readonly<Partial<Record<Canal, LadoEjeY>>>
  /** Cuánto crecen las columnas y bandas con el tamaño del texto de los ejes (1 es el diseño base). */
  escalaTexto?: number
  /**
   * Cada columna mide lo que piden sus cifras (la más ancha, con letra, decimales y título de unidad) más un aire fijo.
   */
  estiloCifras?: EstiloCifras
}

/** El tamaño de letra de las cifras y, por canal, el prefijo y los decimales elegidos. */
export interface EstiloCifras {
  px: number
  canales?: Readonly<Partial<Record<string, { prefijo?: PrefijoEje | null; decimales?: Decimales }>>>
}

export interface Marco {
  /** La retícula. */
  x: number
  y: number
  w: number
  h: number
  /** La columna de la escala de cada canal encendido, de izquierda a derecha en el orden A a D. */
  columnas: ColumnaEje[]
  /** El eje del tiempo (todo el ancho, arriba de la retícula). */
  eje: { y0: number; y1: number }
  /** Dónde va el eje del tiempo y la altura de su línea (para las rayitas y las cifras en medio). */
  ejePos: PosicionEjeX
  lineaEje: number
  dpr: number
}

/** Margen de arriba cuando el eje del tiempo no va arriba: lugar del título de cada columna y del acoplamiento. */
const ARRIBA_LIBRE = 24

/** Ancho de una marca de 0 V y alto en que dos marcas se encimarían, en píxeles CSS. */
const ANCHO_MARCA = 16
const ALTO_MARCA = 14

/** En qué lugar (0 junto a la retícula, 1 a su izquierda…) va la marca de cada canal encendido, según las alturas `ys`. */
function nivelesDeMarcas(ys: readonly number[], dpr: number): number[] {
  const niveles: number[] = []
  ys.forEach((y, k) => {
    let n = 0
    for (let j = 0; j < k; j++) if (Math.abs(ys[j] - y) < ALTO_MARCA * dpr) n = Math.max(n, niveles[j] + 1)
    niveles.push(n)
  })
  return niveles
}

export function marcoDePantalla(a: AjustesOsciloscopio, W: number, H: number, dpr: number, o: OpcionesMarco = {}): Marco {
  const on = a.canales.filter((c) => c.on)
  const lados = on.map((c) => o.lados?.[c.canal] ?? 'izquierda')
  const ejeX = o.ejeX ?? 'arriba'
  const esc = o.escalaTexto ?? 1
  const anchos = o.estiloCifras ? on.map((c) => anchoDeColumna(textosDeColumna(c, o.estiloCifras!.canales?.[c.canal]), o.estiloCifras!.px)) : undefined
  const fijos = { W, H, dpr, lados, ejeX, ...(anchos ? { anchos } : {}), columna: MARCO.columna * esc, inicioIzq: 4, aireIzq: MARCO.aire, aireDer: MARCO.derecha, banda: MARCO.ejeTiempo * esc, arribaLibre: ARRIBA_LIBRE * esc, abajoLibre: MARCO.abajo }
  // El alto de la retícula no depende de lo que se apile a la izquierda: se mide primero para ubicar las marcas de 0 V.
  const { y, h } = colocar(fijos)
  // Dos marcas de 0 V a la misma altura van una junto a la otra: el aire crece para que ninguna tape las cifras de una columna.
  const ys = on.map((c) => Math.max(y, Math.min(y + h, y + h / 2 - c.pos * (h / DIVISIONES_V))))
  const apiladas = Math.max(0, ...nivelesDeMarcas(ys, dpr))
  const col = colocar({ ...fijos, extraIzq: apiladas * ANCHO_MARCA })
  const columnas = col.columnas.map((k) => ({ canal: on[k.i].canal, x0: k.x0, x1: k.x1, lado: k.lado }))
  return { x: col.x, y: col.y, w: col.w, h: col.h, columnas, eje: { y0: col.eje.y0, y1: col.eje.y1 }, ejePos: ejeX, lineaEje: col.eje.linea, dpr }
}

/** Los textos que una columna de canal tiene que alojar: sus nueve cifras y el título con la unidad. */
export function textosDeColumna(c: AjustesCanal, e?: { prefijo?: PrefijoEje | null; decimales?: Decimales }): string[] {
  const r = rotulosVoltaje(c, e?.prefijo, e?.decimales)
  return [...r.valores, `${c.canal} ${r.unidad}`]
}

/** Cada marca de 0 V de un canal encendido: su altura y su punta (x1), con las que están a la misma altura una junto a la otra. */
export function marcasDeCero(m: Marco, a: AjustesOsciloscopio): { canal: Canal; y: number; x1: number }[] {
  // En X-Y solo el canal vertical tiene su 0 V a la izquierda; el horizontal lo tiene en el borde de abajo.
  const vertical = canalVerticalXY(a)
  const on = a.canales.filter((c) => c.on && (vertical === null || c.canal === vertical))
  const ys = on.map((c) => yDeCero(m, c))
  const niveles = nivelesDeMarcas(ys, m.dpr)
  return on.map((c, k) => ({ canal: c.canal, y: ys[k], x1: m.x - m.dpr - niveles[k] * ANCHO_MARCA * m.dpr }))
}

const MENOS = '−'
const PREFIJOS: readonly (readonly [number, string])[] = [[1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n']]
/** El prefijo de una escala: el de su paso por división (2 mV/div da mV aunque arriba diga 8). */
const prefijo = (v: number): readonly [number, string] => PREFIJOS.find(([f]) => Math.abs(v) >= f * 0.9999) ?? PREFIJOS[PREFIJOS.length - 1]

/** Tres cifras significativas, sin ceros de más, con el signo menos tipográfico. */
export function cifraEje(v: number): string {
  const t = String(Number((Math.abs(v) < 1e-12 ? 0 : v).toPrecision(3)))
  return t.replace('-', MENOS)
}

/**
 * Nueve cifras de la columna de un canal y su unidad. Con `elegido` se escriben en ese prefijo (500 mV/div en V da 2.0, 1.5, 1.0, 0.5, 0…).
 */
export function rotulosVoltaje(c: Pick<AjustesCanal, 'vdiv' | 'pos'>, elegido?: PrefijoEje | null, decimales?: Decimales): { unidad: string; valores: string[] } {
  const valores: string[] = []
  // Sin prefijo elegido, el que deja la cifra mayor de la columna entre 1 y 999 (2 V por división con la traza abajo se lee 14.0, no 14000.0 mV).
  const mayor = (DIVISIONES_V / 2 + Math.abs(c.pos)) * c.vdiv
  const pref = elegido ?? prefijoParaRango(mayor, 'V')
  const f = FACTOR_PREFIJO[pref]
  // Con la marca de 0 V corrida (de a 0.2 divisiones) las cifras necesitan un decimal más.
  const paso = Math.abs(c.pos * 5 - Math.round(c.pos * 5)) < 1e-9 && Math.abs(c.pos - Math.round(c.pos)) < 1e-9 ? c.vdiv : c.vdiv * 0.2
  for (let j = 0; j <= DIVISIONES_V; j++) valores.push(textoCifraEje((((DIVISIONES_V / 2 - j) - c.pos) * c.vdiv) / f, paso / f, decimales, decimalesPorOmision('V')))
  return { unidad: `${SIMBOLO_PREFIJO[pref]}V`, valores }
}

/** Las once cifras del eje horizontal de la pantalla X-Y (un canal con su escala y su posición) y sus dos títulos. */
export function rotulosHorizontal(c: Pick<AjustesCanal, 'vdiv' | 'pos'>, canal: string, elegido?: PrefijoEje | null, decimales?: Decimales): { valores: string[]; titulo: string; porDivision: string; unidad: string } {
  const pref = elegido ?? prefijoParaRango((DIVISIONES_H / 2 + Math.abs(c.pos)) * c.vdiv, 'V')
  const f = FACTOR_PREFIJO[pref]
  const paso = Math.abs(c.pos * 5 - Math.round(c.pos * 5)) < 1e-9 && Math.abs(c.pos - Math.round(c.pos)) < 1e-9 ? c.vdiv : c.vdiv * 0.2
  const valores: string[] = []
  for (let i = 0; i <= DIVISIONES_H; i++) valores.push(textoCifraEje(((i - DIVISIONES_H / 2 - c.pos) * c.vdiv) / f, paso / f, decimales, decimalesPorOmision('V')))
  const [fd, pd] = prefijo(c.vdiv)
  return { valores, titulo: `Canal ${canal} en horizontal, en ${SIMBOLO_PREFIJO[pref]}V`, porDivision: `${cifraEje(c.vdiv / fd)} ${pd}V por división`, unidad: `${SIMBOLO_PREFIJO[pref]}V` }
}

/**
 * Cifras de un eje del tiempo con marcas redondas (tramo exportado), en el prefijo de la cifra mayor (o el elegido) con solo los decimales que pide el paso.
 */
export function rotulosMarcas(valores: readonly number[], paso: number, alDisparo: boolean, elegido?: PrefijoEje | null, decimales?: Decimales): { valores: string[]; titulo: string; porDivision: string; unidad: string } {
  const [fp, prep] = prefijo(paso)
  const mayor = Math.max(paso, ...valores.map((v) => Math.abs(v)))
  const [fa, prea] = elegido ? ([FACTOR_PREFIJO[elegido], SIMBOLO_PREFIJO[elegido]] as const) : prefijo(mayor)
  return {
    valores: valores.map((v) => textoCifraEje(v / fa, paso / fa, decimales, decimalesPorOmision('s'))),
    titulo: alDisparo ? `Tiempo desde el disparo, en ${prea}s` : `Tiempo de la simulación, en ${prea}s`,
    porDivision: `${elegido ? etiquetaEnPrefijo(paso, elegido, paso) : cifraEje(paso / fp)} ${elegido ? SIMBOLO_PREFIJO[elegido] : prep}s por división`,
    unidad: `${prea}s`
  }
}

/** Las once cifras del eje del tiempo (en el prefijo de la cifra mayor, o el elegido) y sus dos títulos. */
export function rotulosTiempo(
  a: Pick<AjustesOsciloscopio, 'base' | 'disparoCentro'>,
  p: { t0: number; tDisparo: number } | null,
  elegido?: PrefijoEje | null,
  /** Un tramo recortado de la pantalla (al exportar): el eje parte de `valor`, contado desde el disparo si `alDisparo`. */
  recorte?: { valor: number; alDisparo: boolean } | null,
  /** Decimales de las cifras; ausente, 2. */
  decimales?: Decimales
): { valores: string[]; titulo: string; porDivision: string; unidad: string } {
  const [f, pre] = elegido ? ([FACTOR_PREFIJO[elegido], SIMBOLO_PREFIJO[elegido]] as const) : prefijo(a.base)
  const conDisparo = !p || Number.isFinite(p.tDisparo)
  // Con disparo (o sin pantalla), desde su lugar nominal: el barrido lo pone al 10 % o al centro, y la resta de dos instantes
  // grandes (t0 − tDisparo a 3.42 s con 1 ns por división) daba ruido de coma flotante en el 0. Sin disparo, desde el borde.
  // Sin disparo (rodillo o barrido libre) la ventana sigue al tiempo simulado: las cifras parten de su inicio `t0`.
  const sigue = !conDisparo && p !== null && Number.isFinite(p.t0) && p.t0 > 1e-12
  const desde = recorte ? recorte.valor : conDisparo ? -(a.disparoCentro ? DIVISIONES_H / 2 : 1) * a.base : sigue ? p!.t0 : 0
  const alDisparo = recorte ? recorte.alDisparo : conDisparo
  // Sin prefijo elegido, el que deja la cifra mayor del eje entre 1 y 999: un tiempo absoluto (la simulación lleva 2.58 s con 500 µs por
  // división) en µs serían siete cifras por rótulo y se encimarían, y 500 µs por división de 0 a 4500 µs se lee mejor 0 a 4.50 ms.
  const mayor = Math.max(a.base, Math.abs(desde), Math.abs(desde + DIVISIONES_H * a.base))
  const [fa, prea] = elegido ? [f, pre] : prefijo(mayor)
  // El paso de un tramo exportado es una fracción cualquiera (0.4090262 s): se redondea a una cifra para que no pida decimales de más.
  const paso0 = recorte ? Number((a.base / fa).toPrecision(2)) : a.base / fa
  // Un inicio que no es múltiplo del paso (la ventana que sigue al tiempo simulado, un tramo sin redondear) pide dos decimales más para no redondear las cifras.
  const alineado = Math.abs(desde / fa / paso0 - Math.round(desde / fa / paso0)) < 1e-6
  const paso = alineado ? paso0 : Math.min(paso0, 0.01)
  const valores: string[] = []
  for (let i = 0; i <= DIVISIONES_H; i++) valores.push(textoCifraEje((desde + i * a.base) / fa, paso, decimales, decimalesPorOmision('s')))
  return {
    valores,
    titulo: alDisparo ? `Tiempo desde el disparo, en ${prea}s` : sigue || recorte ? `Tiempo de la simulación, en ${prea}s` : `Tiempo en la pantalla, en ${prea}s`,
    porDivision: `${elegido && !recorte ? etiquetaEnPrefijo(a.base, elegido, a.base) : cifraEje(a.base / f)} ${pre}s por división`,
    unidad: `${prea}s`
  }
}

export type Zona = { tipo: 'canal'; canal: Canal } | { tipo: 'tiempo' } | { tipo: 'pantalla' } | null

/** Lo que hay bajo (x, y): la columna de un canal, el eje del tiempo, la retícula o nada (los márgenes). */
export function zonaEn(m: Marco, x: number, y: number): Zona {
  const enPantalla = x >= m.x && x <= m.x + m.w && y >= m.y && y <= m.y + m.h
  // Una escala en medio vive sobre la retícula: se toma solo dentro de ella.
  const col = m.columnas.find((c) => x >= c.x0 && x < c.x1 && (c.lado !== 'centro' || enPantalla))
  if (col && y >= m.y - 4 * m.dpr) return { tipo: 'canal', canal: col.canal }
  const enAncho = x >= m.x - 6 * m.dpr && x <= m.x + m.w + 6 * m.dpr
  if (m.ejePos === 'centro') {
    if ((y < m.eje.y1 || Math.abs(y - m.lineaEje) <= 12 * m.dpr) && enAncho) return { tipo: 'tiempo' }
  } else if (y >= m.eje.y0 && y < m.eje.y1 && enAncho) return { tipo: 'tiempo' }
  if (enPantalla) return { tipo: 'pantalla' }
  return null
}

/** El canal de la vertical en la pantalla X-Y (B/A: B; A/B: A); null en el modo de tiempo. */
export const canalVerticalXY = (a: Pick<AjustesOsciloscopio, 'modoXY'>): Canal | null => (a.modoXY === 'ba' ? 'B' : a.modoXY === 'ab' ? 'A' : null)
/** El canal de la horizontal en la pantalla X-Y (B/A: A; A/B: B); null en el modo de tiempo. */
export const canalHorizontalXY = (a: Pick<AjustesOsciloscopio, 'modoXY'>): Canal | null => (a.modoXY === 'ba' ? 'A' : a.modoXY === 'ab' ? 'B' : null)

/** La marca de 0 V del canal horizontal en X-Y: su columna, la punta sobre el borde de la retícula (abajo, o arriba si el eje va abajo) y hacia dónde apunta. */
export function marcaHorizontalXY(m: Marco, a: AjustesOsciloscopio): { canal: Canal; x: number; y: number; abajo: boolean } | null {
  const canal = canalHorizontalXY(a)
  const c = canal && a.canales.find((k) => k.canal === canal)
  if (!canal || !c) return null
  const x = Math.max(m.x, Math.min(m.x + m.w, m.x + m.w / 2 + c.pos * (m.w / DIVISIONES_H)))
  const abajo = m.ejePos !== 'abajo'
  return { canal, x, y: abajo ? m.y + m.h : m.y, abajo }
}

/** La marca horizontal bajo (x, y) a `tol` píxeles o menos; se toma dentro de la retícula, pegada a su borde. */
export function marcaHorizontalEn(m: Marco, a: AjustesOsciloscopio, x: number, y: number, tol: number): Canal | null {
  const q = marcaHorizontalXY(m, a)
  if (!q) return null
  const dentro = q.abajo ? y <= q.y + 5 * m.dpr && y >= q.y - (ALTO_MARCA + 8) * m.dpr : y >= q.y - 5 * m.dpr && y <= q.y + (ALTO_MARCA + 8) * m.dpr
  return dentro && Math.abs(q.x - x) <= Math.max(tol, ANCHO_MARCA * m.dpr * 0.6) ? q.canal : null
}

/** La posición (divisiones desde el centro) para la marca horizontal en la columna `x`: pasos de 0.2 y dentro de ±4. */
export function posicionDeX(m: Marco, x: number): number {
  const div = (x - (m.x + m.w / 2)) / (m.w / DIVISIONES_H)
  return Math.max(POS_RANGO[0], Math.min(POS_RANGO[1], Number((Math.round(div * 5) / 5).toFixed(1))))
}

/** La altura del 0 V de un canal, dentro de la retícula. */
export function yDeCero(m: Marco, c: Pick<AjustesCanal, 'pos'>): number {
  const y = m.y + m.h / 2 - c.pos * (m.h / DIVISIONES_V)
  return Math.max(m.y, Math.min(m.y + m.h, y))
}

/** La marca de 0 V bajo (x, y) a `tol` píxeles o menos (la más cercana si hay dos), o null. Se toma por fuera de la retícula y en su borde. */
export function marcaEn(m: Marco, a: AjustesOsciloscopio, x: number, y: number, tol: number): Canal | null {
  let mejor: Canal | null = null
  let d = Infinity
  for (const q of marcasDeCero(m, a)) {
    if (x < q.x1 - (ANCHO_MARCA + 2) * m.dpr || x > q.x1 + 5 * m.dpr) continue
    const dy = Math.abs(q.y - y)
    if (dy <= tol && dy < d) [mejor, d] = [q.canal, dy]
  }
  return mejor
}

/** La posición (divisiones desde el centro) para la marca a la altura `y`: pasos de 0.2 y dentro de ±4. */
export function posicionDeY(m: Marco, y: number): number {
  const div = (m.y + m.h / 2 - y) / (m.h / DIVISIONES_V)
  const p = Math.round(div * 5) / 5
  return Math.max(POS_RANGO[0], Math.min(POS_RANGO[1], Number(p.toFixed(1))))
}

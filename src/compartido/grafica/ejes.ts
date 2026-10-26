/** Cuentas de los ejes de una gráfica (lado de un eje arrastrado, prefijo de sus números, punto más cercano al puntero), sin dibujo ni DOM. */
import { FACTOR_PREFIJO, PREFIJOS_EJE, SIMBOLO_PREFIJO, type Decimales, type LadoEjeY, type PosicionEjeX, type PrefijoEje } from './aspecto'

const acotar01 = (f: number, vacio: number): number => (Number.isNaN(f) ? vacio : Math.max(0, Math.min(1, f)))

/** Lado de un eje vertical arrastrado a la fracción `f` del ancho (0 izquierda, 1 derecha). Con histéresis (entra al centro pasando de 0.3 o 0.7, sale pasando de 0.2 u 0.8) para que no salte al rozar el límite. */
export function ladoPorArrastre(f: number, actual: LadoEjeY): LadoEjeY {
  const v = acotar01(f, actual === 'izquierda' ? 0 : actual === 'derecha' ? 1 : 0.5)
  if (actual === 'centro') return v < 0.2 ? 'izquierda' : v > 0.8 ? 'derecha' : 'centro'
  if (actual === 'izquierda') return v > 0.8 ? 'derecha' : v >= 0.3 ? 'centro' : 'izquierda'
  return v < 0.2 ? 'izquierda' : v <= 0.7 ? 'centro' : 'derecha'
}

/** Lo mismo para el eje horizontal arrastrado a la fracción `f` (0 arriba, 1 abajo) del alto. */
export function posicionXPorArrastre(f: number, actual: PosicionEjeX): PosicionEjeX {
  const lado = ladoPorArrastre(f, actual === 'arriba' ? 'izquierda' : actual === 'abajo' ? 'derecha' : 'centro')
  return lado === 'izquierda' ? 'arriba' : lado === 'derecha' ? 'abajo' : 'centro'
}

/** Cuántos decimales pide un paso entre marcas (0.5 pide 1, 0.025 pide 3, 2 pide 0). */
export function decimalesDePaso(paso: number): number {
  if (!(paso > 0) || !Number.isFinite(paso)) return 0
  for (let d = 0; d < 9; d++) {
    const s = paso * 10 ** d
    if (Math.abs(s - Math.round(s)) < 1e-6 * Math.max(1, s)) return d
  }
  return 9
}

/** Los decimales de un eje cuando el lector no eligió: 2 en el tiempo (`s`) y 1 en voltaje, corriente, frecuencia, dB y fase. */
export const decimalesPorOmision = (unidad: string): number => (unidad === 's' ? 2 : 1)

/** Lo más que una cifra de «auto» o de la omisión crece para distinguir una marca de la siguiente. */
const MAX_PEDIDOS = 6

/** Decimales de una marca, ya en el prefijo del eje. Un número 0 a 4 se respeta; «auto» usa los que pide el paso; sin elección, los de omisión, que suben si el paso lo pide. Ninguno pasa de 6. */
export function decimalesDeCifra(pasoEnPrefijo: number, decimales?: Decimales, omision?: number): number {
  const pedidos = decimalesDePaso(pasoEnPrefijo)
  // Un número elegido se escribe tal cual, con sus ceros (3 decimales dan 150.000): así todos los ejes comparten estilo. Solo «auto» o sin elección siguen al paso.
  if (typeof decimales === 'number') return decimales
  if (decimales === 'auto') return Math.min(MAX_PEDIDOS, pedidos)
  // Sin elección las cifras siguen al paso (500 mV por división en mV se escribe 0, 500, 1000): `omision` ya no pone un mínimo.
  void omision
  return Math.min(MAX_PEDIDOS, pedidos)
}

/** Lo más que puede guardarse como decimales elegidos (el selector llega a 4). */
const MAX_GUARDADOS = 4

/** Decimales que el selector debe marcar para un paso entre marcas, o null si lo marcado ya es lo que se usa. Un número elegido solo sube cuando el paso pide más; «auto» nunca se toca. */
export function decimalesAjustados(pasoEnPrefijo: number, decimales: Decimales | undefined, omision: number): Decimales | null {
  // Sin elección las cifras ya siguen al paso: no se guarda nada.
  if (decimales === 'auto' || decimales === undefined) return null
  const pedidos = decimalesDePaso(pasoEnPrefijo)
  const actual = decimales
  if (pedidos <= actual) return null
  const nuevo = Math.min(MAX_GUARDADOS, pedidos)
  return nuevo > actual ? (nuevo as Decimales) : null
}

/** Cómo se escribe un valor sobre un eje: su prefijo y sus decimales (ausente, los de omisión). */
export interface FormatoEje {
  prefijo: PrefijoEje
  decimales?: Decimales
  omision: number
}

/** El formato de un valor de etiqueta: el del eje con los decimales propios de las etiquetas encima (ausentes, los del eje). */
export function formatoConDecimales(f: FormatoEje | undefined, d?: Decimales): FormatoEje | undefined {
  return f && d !== undefined ? { ...f, decimales: d } : f
}

/** El texto de una cifra de eje ya dividida por el factor de su prefijo (el cero se escribe «0» y el menos es el tipográfico). */
export function textoCifraEje(valorEnPrefijo: number, pasoEnPrefijo: number, decimales?: Decimales, omision?: number): string {
  if (!Number.isFinite(valorEnPrefijo)) return ''
  if (Math.abs(valorEnPrefijo) < Math.abs(pasoEnPrefijo) * 1e-6 || Math.abs(valorEnPrefijo) < 1e-18) return '0'
  const t = valorEnPrefijo.toFixed(decimalesDeCifra(pasoEnPrefijo, decimales, omision))
  // Un valor que redondea a cero (0.004 con 2 decimales) no lleva signo.
  return (/^-?0(\.0*)?$/.test(t) ? t.replace('-', '') : t).replace('-', '−')
}

/** Número de una marca en el prefijo elegido. `paso` está en unidades base: 500 mV por división mostrado en V da 0, 0.5, 1.0; en mV, 0, 500, 1000. */
export function etiquetaEnPrefijo(valor: number, prefijo: PrefijoEje, paso: number, decimales?: Decimales, omision?: number): string {
  if (!Number.isFinite(valor)) return ''
  const f = FACTOR_PREFIJO[prefijo]
  return textoCifraEje(valor / f, paso / f, decimales, omision)
}

/** Unidades a las que no se les pone prefijo SI. */
const SIN_PREFIJO = new Set(['dB', 'dBV', '°', '%', ''])
export const admitePrefijo = (unidad: string): boolean => !SIN_PREFIJO.has(unidad)

/** La unidad con su prefijo escrito una sola vez (`mV`, `µs`, `kHz`); sin cambios si no admite prefijo. */
export function unidadConPrefijo(unidad: string, prefijo: PrefijoEje): string {
  return admitePrefijo(unidad) ? `${SIMBOLO_PREFIJO[prefijo]}${unidad}` : unidad
}

/** El prefijo con que el mayor valor del eje queda entre 1 y 999 (la unidad sola si no admite prefijo o el valor es 0). */
export function prefijoParaRango(maxAbs: number, unidad: string): PrefijoEje {
  if (!admitePrefijo(unidad) || !(maxAbs > 0) || !Number.isFinite(maxAbs)) return 'base'
  let mejor: PrefijoEje = 'base'
  for (const p of PREFIJOS_EJE) if (maxAbs >= FACTOR_PREFIJO[p] * 0.9999) mejor = p
  return mejor
}

/** El prefijo y la unidad rotulada de un eje: el que eligió el lector o, si no, el automático para `maxAbs`. */
export function rotuloDeEje(unidad: string, maxAbs: number, elegido: PrefijoEje | null | undefined): { prefijo: PrefijoEje; unidad: string } {
  const prefijo = !admitePrefijo(unidad) ? 'base' : (elegido ?? prefijoParaRango(maxAbs, unidad))
  return { prefijo, unidad: unidadConPrefijo(unidad, prefijo) }
}

/** El índice del punto de `x` (monótona, creciente o decreciente) más cercano a `v`; en un eje logarítmico, el más cercano en décadas. −1 sin datos. */
export function indiceMasCercano(x: Float64Array, v: number, escala: 'lin' | 'log'): number {
  const n = x.length
  if (n === 0) return -1
  const t = (u: number) => (escala === 'log' ? Math.log10(u) : u)
  const objetivo = t(v)
  const dec = x[0] > x[n - 1]
  if (!Number.isFinite(objetivo)) return dec ? n - 1 : 0
  let lo = 0
  let hi = n - 1
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1
    if (dec ? x[m] >= v : x[m] <= v) lo = m
    else hi = m
  }
  return Math.abs(t(x[lo]) - objetivo) <= Math.abs(t(x[hi]) - objetivo) ? lo : hi
}

/** El valor en el prefijo dado con `cifras` cifras significativas y sin ceros de más (para la lectura al pasar el ratón). */
export function valorEnPrefijo(valor: number, prefijo: PrefijoEje, cifras = 4): string {
  if (!Number.isFinite(valor)) return ''
  if (Math.abs(valor) < 1e-18) return '0'
  const x = Number((valor / FACTOR_PREFIJO[prefijo]).toPrecision(cifras))
  // Notación fija siempre: String() escribiría «1e-7» para valores muy chicos.
  const decimales = Math.min(20, Math.max(0, cifras - 1 - Math.floor(Math.log10(Math.abs(x)))))
  const texto = x.toFixed(decimales)
  return (texto.includes('.') ? texto.replace(/\.?0+$/, '') : texto).replace('-', '−')
}

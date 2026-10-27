import { leerValor } from './valores'

/** Unidades con selector: un valor con unidad se escribe como número más lista con prefijo y unidad juntos (mΩ, Ω, kΩ,
 * MΩ). Lo guardado no cambia («4.7k», «100u»). Solo la parte pura; `ui/CampoValor.tsx` la pinta. */

export interface OpcionUnidad {
  /** El prefijo que se muestra: '', 'm', 'µ' (U+00B5), 'n', 'p', 'k' o 'M'. */
  prefijo: string
  exp: number
}

const P = (prefijo: string, exp: number): OpcionUnidad => ({ prefijo, exp })

/** Los prefijos de cada unidad, de menor a mayor. */
const OPCIONES: Record<string, OpcionUnidad[]> = {
  'Ω': [P('m', -3), P('', 0), P('k', 3), P('M', 6)],
  F: [P('p', -12), P('n', -9), P('µ', -6), P('m', -3)],
  H: [P('n', -9), P('µ', -6), P('m', -3), P('', 0)],
  V: [P('m', -3), P('', 0), P('k', 3)],
  A: [P('µ', -6), P('m', -3), P('', 0)],
  Hz: [P('', 0), P('k', 3), P('M', 6)],
  s: [P('n', -9), P('µ', -6), P('m', -3), P('', 0)],
  // Magnitudes de las perillas en vivo: los °C no llevan prefijos y por eso no están aquí.
  lx: [P('', 0), P('k', 3)],
  'N·m': [P('µ', -6), P('m', -3), P('', 0)]
}
/** Donde cae un cero, que no dice nada de la escala: el prefijo con que se suele escribir cada unidad. */
const DE_CERO: Record<string, string> = { 'Ω': '', F: 'n', H: 'm', V: '', A: 'm', Hz: '', s: 'm', lx: '', 'N·m': 'm' }

/** Las opciones del selector de una unidad, o null si la unidad no lleva prefijos (%, grados, sin unidad, W). */
export const opcionesDeUnidad = (unidad: string): OpcionUnidad[] | null => OPCIONES[unidad] ?? null

/** Lo que dice una opción: el prefijo y la unidad juntos («kΩ»). */
export const etiquetaUnidad = (o: OpcionUnidad, unidad: string): string => `${o.prefijo}${unidad}`

const opcion = (unidad: string, prefijo: string): OpcionUnidad => OPCIONES[unidad].find((o) => o.prefijo === prefijo) ?? OPCIONES[unidad].find((o) => o.prefijo === '') ?? OPCIONES[unidad][0]

/** Un número sin ruido de coma flotante y sin notación científica (que `leerValor` no entiende). */
function cifra(n: number): string {
  const t = Number(n.toPrecision(10))
  const s = String(t)
  if (!/e/i.test(s)) return s
  return t.toFixed(12).replace(/0+$/, '').replace(/\.$/, '') || '0'
}

const aNumero = (n: number, exp: number): number => (exp < 0 ? n / 10 ** -exp : n * 10 ** exp)
const deNumero = (v: number, exp: number): number => (exp < 0 ? v * 10 ** -exp : v / 10 ** exp)

/** El mismo valor escrito con un prefijo dado de la lista. */
export function cambiarUnidad(valor: number, unidad: string, prefijo: string): { numero: string; prefijo: string } {
  const o = opcion(unidad, prefijo)
  return { numero: cifra(deNumero(valor, o.exp)), prefijo: o.prefijo }
}

/** Valor con el prefijo que lo deja legible: el mayor de la lista que no pasa del valor (4700 Ω → 4.7 kΩ); si ninguno
 * cabe, el menor (0.1 pF) y si se pasa de todos, el mayor (2 F → 2000 mF). El cero toma el prefijo común de la unidad. */
export function partirValor(valor: number, unidad: string): { numero: string; prefijo: string } {
  const lista = OPCIONES[unidad]
  const abs = Math.abs(valor)
  if (abs === 0 || !Number.isFinite(valor)) return cambiarUnidad(0, unidad, DE_CERO[unidad] ?? '')
  let elegida = lista[0]
  for (const o of lista) if (abs >= 10 ** o.exp * (1 - 1e-9)) elegida = o
  return cambiarUnidad(valor, unidad, elegida.prefijo)
}

const SOLO_NUMERO = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/
/** Lo mismo que lee `leerValor`, para saber qué prefijo y qué unidad escribió quien tecleó. */
const CON_PREFIJO = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)\s*([fpnuµμmRkKMGT]?)\d*\s*([A-Za-zΩ°·]*)$/

const NORMAL: Record<string, string> = { u: 'µ', 'μ': 'µ', K: 'k', R: '' }

/** Qué quiere decir lo escrito en el campo del número. Un número solo toma el prefijo de la lista (4.7 con kΩ son 4700 Ω);
 * con prefijo o unidad escritos («4k7», «4.7 kΩ») manda lo escrito y el prefijo devuelto es el que se deja en la lista.
 * null si no se lee o es de otra unidad. */
export function leerCampo(texto: string, prefijo: string, unidad: string): { valor: number; prefijo: string } | null {
  const t = texto.normalize('NFKC').trim()
  if (SOLO_NUMERO.test(t)) {
    const o = opcion(unidad, prefijo)
    return { valor: aNumero(Number(t), o.exp), prefijo: o.prefijo }
  }
  const v = leerValor(t)
  if (!v || (v.unidad !== '' && v.unidad !== unidad)) return null
  const m = CON_PREFIJO.exec(t)
  const escrito = m ? (NORMAL[m[1]] ?? m[1]) : ''
  // Un prefijo que la lista no tiene (G, T, f) se muestra con el más cercano que sí tiene.
  if (OPCIONES[unidad].some((o) => o.prefijo === escrito)) return { valor: v.valor, prefijo: escrito }
  return { valor: v.valor, prefijo: partirValor(v.valor, unidad).prefijo }
}

/** El texto de la propiedad para un número y un prefijo de la lista: «4.7k», «100u», «4700». */
export function textoDeCampo(numero: string, prefijo: string): string {
  return `${numero.trim()}${prefijo === 'µ' ? 'u' : prefijo}`
}

/** Elegir otra unidad en la lista: el número escrito se queda y cambia el valor (4.7 kΩ pasa a 4.7 Ω). Un texto que no es
 * número solo («4k7») se lee primero y se muestra como número (4.7). null si no se lee. */
export function conservarNumero(texto: string, prefijo: string, unidad: string, nuevo: string): { numero: string; prefijo: string; texto: string } | null {
  const t = texto.normalize('NFKC').trim()
  let numero = t
  if (!SOLO_NUMERO.test(t)) {
    const l = leerCampo(t, prefijo, unidad)
    if (!l) return null
    numero = cambiarUnidad(l.valor, unidad, l.prefijo).numero
  }
  const p = opcion(unidad, nuevo).prefijo
  return { numero, prefijo: p, texto: textoDeCampo(numero, p) }
}

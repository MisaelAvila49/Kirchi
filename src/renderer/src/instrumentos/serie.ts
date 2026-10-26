/** La serie 1, 2 y 5 de los voltios por división y de la base de tiempo, como la de un osciloscopio de banco. */
export const SERIE_125 = [1, 2, 5] as const

/** Las mantisas de una década, redondeadas a 12 cifras: 0.1 · 3 no es 0.3 en coma flotante. */
const limpio = (v: number) => Number(v.toPrecision(12))

/** Todos los valores de la serie entre `min` y `max`, incluidos. */
export function valoresSerie(min: number, max: number): number[] {
  const out: number[] = []
  for (let e = Math.floor(Math.log10(min)) - 1; e <= Math.ceil(Math.log10(max)) + 1; e++)
    for (const m of SERIE_125) {
      const v = limpio(m * 10 ** e)
      if (v >= min * (1 - 1e-9) && v <= max * (1 + 1e-9)) out.push(v)
    }
  return out
}

/** El valor de la serie más cercano a `v` en escala logarítmica. */
export function cercanoSerie(v: number): number {
  const e = Math.floor(Math.log10(v))
  const candidatos = [-1, 0, 1].flatMap((d) => SERIE_125.map((m) => limpio(m * 10 ** (e + d))))
  return candidatos.reduce((a, b) => (Math.abs(Math.log(b / v)) < Math.abs(Math.log(a / v)) ? b : a))
}

/** `v` es de la serie (dentro de una milmillonésima relativa). */
export function esDeSerie(v: number): boolean {
  return Number.isFinite(v) && v > 0 && Math.abs(cercanoSerie(v) / v - 1) < 1e-9
}

/** El valor siguiente (`dir` 1) o anterior (−1) de la serie desde `v`, acotado a [min, max]. */
export function pasoSerie(v: number, dir: 1 | -1, min: number, max: number): number {
  const serie = valoresSerie(min, max)
  const i = serie.findIndex((x) => Math.abs(x / v - 1) < 1e-9)
  const k = i < 0 ? serie.findIndex((x) => x > v) - (dir > 0 ? 0 : 1) : i + dir
  return serie[Math.min(serie.length - 1, Math.max(0, k))]
}

const PREFIJOS: [number, string, string][] = [
  [1, '', ''],
  [1e-3, 'mili', 'm'],
  [1e-6, 'micro', 'µ'],
  [1e-9, 'nano', 'n']
]

/** «2 voltios por división», «500 milisegundos por división»: el valor de un control de la serie para un lector de pantalla. */
export function enPalabras(v: number, unidad: 'V' | 's'): string {
  const [escala, prefijo] = PREFIJOS.find(([e]) => v >= e * (1 - 1e-9)) ?? PREFIJOS[PREFIJOS.length - 1]
  const n = limpio(v / escala)
  const nombre = unidad === 'V' ? (n === 1 ? 'voltio' : 'voltios') : n === 1 ? 'segundo' : 'segundos'
  return `${n} ${prefijo}${nombre} por división`
}

const MANTISAS_BASE = [1, 1.2, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 10]

/** Base de tiempo para dibujar una captura entera de `span` segundos: la primera de una serie de pasos redondos (1, 1.2,
 * 1.5, 2, 2.5…) que cabe en diez divisiones, para marcas limpias (0.25 s/div y no 0.2469).
 * Sobra a lo más un cuarto de pantalla en blanco. */
export function baseDeCapturaAmplia(span: number): number {
  if (!(span > 0) || !Number.isFinite(span)) return span
  const base = span / 10
  const e = Math.floor(Math.log10(base) + 1e-9)
  const mantisa = base / 10 ** e
  const m = MANTISAS_BASE.find((x) => x >= mantisa * (1 - 1e-9)) ?? 10
  return Number((m * 10 ** e).toPrecision(12))
}

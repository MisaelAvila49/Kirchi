/** Las series de valores comerciales (IEC 60063) y su redondeo al más cercano por década. */

export type Serie = 'E6' | 'E12' | 'E24' | 'E96'

const E24 = [1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0, 3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1]
const E96 = [
  1.0, 1.02, 1.05, 1.07, 1.1, 1.13, 1.15, 1.18, 1.21, 1.24, 1.27, 1.3, 1.33, 1.37, 1.4, 1.43, 1.47, 1.5, 1.54, 1.58, 1.62, 1.65, 1.69, 1.74, 1.78, 1.82, 1.87, 1.91, 1.96, 2.0,
  2.05, 2.1, 2.15, 2.21, 2.26, 2.32, 2.37, 2.43, 2.49, 2.55, 2.61, 2.67, 2.74, 2.8, 2.87, 2.94, 3.01, 3.09, 3.16, 3.24, 3.32, 3.4, 3.48, 3.57, 3.65, 3.74, 3.83, 3.92, 4.02, 4.12,
  4.22, 4.32, 4.42, 4.53, 4.64, 4.75, 4.87, 4.99, 5.11, 5.23, 5.36, 5.49, 5.62, 5.76, 5.9, 6.04, 6.19, 6.34, 6.49, 6.65, 6.81, 6.98, 7.15, 7.32, 7.5, 7.68, 7.87, 8.06, 8.25, 8.45,
  8.66, 8.87, 9.09, 9.31, 9.53, 9.76
]

/** Las mantisas de cada serie dentro de una década (de 1 a menos de 10). E96 va solo como dato (no hay conmutador para ella). */
export const MANTISAS: Record<Serie, readonly number[]> = {
  E6: [1.0, 1.5, 2.2, 3.3, 4.7, 6.8],
  E12: [1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2],
  E24,
  E96
}

/** Tolerancia típica de cada serie, para decirla junto al valor. */
export const TOLERANCIA: Record<Serie, string> = { E6: '20 %', E12: '10 %', E24: '5 %', E96: '1 %' }

/** Todos los valores de la serie en las décadas 10^e0 a 10^e1 (de 0.1 pF a 10 G, que cubre lo comercial). */
function valoresDeSerie(serie: Serie, e0 = -13, e1 = 9): number[] {
  const out: number[] = []
  for (let e = e0; e <= e1; e++) for (const m of MANTISAS[serie]) out.push(Number((m * 10 ** e).toPrecision(3)))
  return out
}

const CACHE = new Map<Serie, number[]>()
const lista = (serie: Serie): number[] => {
  let l = CACHE.get(serie)
  if (!l) CACHE.set(serie, (l = valoresDeSerie(serie)))
  return l
}

/** Los valores de la serie desde `min` (incluido) hasta `max` (excluido), de menor a mayor. */
export function valoresEnRango(serie: Serie, min: number, max: number): number[] {
  const tol = 1 - 1e-9
  return lista(serie).filter((x) => x >= min * tol && x < max * tol)
}

/** El valor de la serie más cercano (por razón, no por diferencia: 9.7 k está más cerca de 10 k que de 8.2 k); null si no es positivo. */
export function masCercano(valor: number, serie: Serie): number | null {
  if (!(valor > 0) || !Number.isFinite(valor)) return null
  const l = lista(serie)
  let mejor = l[0]
  for (const x of l) if (Math.abs(Math.log(x / valor)) < Math.abs(Math.log(mejor / valor))) mejor = x
  return mejor
}

/** El valor es de la serie (con el error de coma flotante de «100n», 1e-7). */
export function esComercial(valor: number, serie: Serie): boolean {
  const c = masCercano(valor, serie)
  return c !== null && Math.abs(c / valor - 1) < 1e-9
}

/** El anterior, el más cercano y el siguiente de la serie, para ofrecerlos como botones. */
export function vecinosEnSerie(valor: number, serie: Serie): [number, number, number] | null {
  const c = masCercano(valor, serie)
  if (c === null) return null
  const l = lista(serie)
  const i = l.indexOf(c)
  return [l[Math.max(0, i - 1)], c, l[Math.min(l.length - 1, i + 1)]]
}

/** Los `k` valores de la serie bajo el más cercano, él mismo y los `k` de arriba (de menor a mayor), para buscar la mejor pareja. */
export function vecinosHasta(valor: number, serie: Serie, k: number): number[] {
  const c = masCercano(valor, serie)
  if (c === null) return []
  const l = lista(serie)
  const i = l.indexOf(c)
  return l.slice(Math.max(0, i - k), Math.min(l.length, i + k + 1))
}

const PREFIJOS: [number, string][] = [[12, 'T'], [9, 'G'], [6, 'M'], [3, 'k'], [0, ''], [-3, 'm'], [-6, 'u'], [-9, 'n'], [-12, 'p'], [-15, 'f']]

/** El valor como se escribe en una propiedad, con 3 cifras como mucho y sin unidad: 4700 → «4.7k», 1e-7 → «100n». */
export function textoDeIngenieria(valor: number): string {
  if (valor === 0) return '0'
  const abs = Math.abs(valor)
  let i = PREFIJOS.findIndex(([e]) => abs >= 10 ** e * (1 - 1e-12))
  if (i === -1) i = PREFIJOS.length - 1
  for (;;) {
    const [e, p] = PREFIJOS[i]
    const m = Number((e < 0 ? valor * 10 ** -e : valor / 10 ** e).toPrecision(3))
    if (Math.abs(m) >= 1000 && i > 0) {
      i--
      continue
    }
    return `${m}${p}`
  }
}

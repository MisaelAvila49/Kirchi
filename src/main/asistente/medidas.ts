import type { Corrida, ResultadoMapeado, Serie } from '../../compartido/analisis/resultados'

/** Medidas de un análisis sin devolver las muestras: mínimo y máximo con su x, el valor en las x pedidas y, en CA, la banda
 * de −3 dB y la frecuencia del pico o de la muesca. La resolución es la de la rejilla del barrido (con «incluir» en el
 * análisis, una frecuencia exacta). */

export interface PuntoMedido {
  x: number
  valor: number
}
export interface ValorEn {
  x: number
  /** null si la x queda fuera del rango del análisis. */
  valor: number | null
  fase?: number | null
}
export interface MedidasAc {
  /** El máximo de la curva en dB, contra el que se miden los −3 dB. */
  referenciaDb: number
  /** Frecuencias donde la curva cae 3 dB bajo la referencia, a los lados del máximo; null si llega al borde del barrido sin caer. */
  menos3dB: { desdeHz: number | null; hastaHz: number | null }
  /** El máximo, si no está en un extremo del barrido. */
  pico?: { f: number; db: number }
  /** El mínimo, si no está en un extremo y cae más de 3 dB bajo la referencia. */
  muesca?: { f: number; db: number; profundidadDb: number; desdeHz: number | null; hastaHz: number | null }
}
export interface MedidasTraza {
  corrida: string
  traza: string
  unidad: string
  puntos: number
  min: PuntoMedido
  max: PuntoMedido
  picoAPico: number
  en?: ValorEn[]
  ac?: MedidasAc
}
export interface Medidas {
  tipo: string
  ejeNombre: string
  ejeUnidad: string
  trazas: MedidasTraza[]
}

const cifras = (v: number): number => (Number.isFinite(v) ? Number(v.toPrecision(7)) : v)

/** Interpola en x (en log de x si el eje es logarítmico). */
function interpolar(eje: Float64Array, y: Float64Array, x: number, logX: boolean): number | null {
  const n = eje.length
  if (n === 0) return null
  const creciente = eje[n - 1] >= eje[0]
  const [a, b] = creciente ? [eje[0], eje[n - 1]] : [eje[n - 1], eje[0]]
  if (!(x >= a * (1 - 1e-12) && x <= b * (1 + 1e-12)) && !(x >= a - 1e-12 * Math.abs(a) && x <= b + 1e-12 * Math.abs(b))) return null
  for (let i = 1; i < n; i++) {
    const x0 = eje[i - 1], x1 = eje[i]
    if ((x - x0) * (x - x1) > 0 && Math.abs(x - x0) > 1e-12 * Math.abs(x0) && Math.abs(x - x1) > 1e-12 * Math.abs(x1)) continue
    if (x1 === x0) return y[i]
    const t = logX && x0 > 0 && x1 > 0 && x > 0 ? Math.log(x / x0) / Math.log(x1 / x0) : (x - x0) / (x1 - x0)
    return y[i - 1] + (y[i] - y[i - 1]) * Math.min(1, Math.max(0, t))
  }
  return y[0]
}

/** La x donde la curva cruza `nivel` entre los puntos i y j (adyacentes), interpolando en log de x. */
function cruce(eje: Float64Array, y: Float64Array, i: number, j: number, nivel: number, logX: boolean): number {
  const [x0, x1, y0, y1] = [eje[i], eje[j], y[i], y[j]]
  const t = y1 === y0 ? 0 : (nivel - y0) / (y1 - y0)
  return logX && x0 > 0 && x1 > 0 ? x0 * Math.pow(x1 / x0, t) : x0 + (x1 - x0) * t
}

/** Los bordes, hacia cada lado de `centro`, de la región contigua donde `dentro(y)` se cumple; null si llega al extremo. */
function bordes(eje: Float64Array, y: Float64Array, centro: number, nivel: number, dentro: (v: number) => boolean, logX: boolean): { desdeHz: number | null; hastaHz: number | null } {
  const n = y.length
  let i = centro
  while (i > 0 && dentro(y[i - 1])) i--
  let j = centro
  while (j < n - 1 && dentro(y[j + 1])) j++
  return {
    desdeHz: i === 0 ? null : cifras(cruce(eje, y, i - 1, i, nivel, logX)),
    hastaHz: j === n - 1 ? null : cifras(cruce(eje, y, j, j + 1, nivel, logX))
  }
}

function medidasAc(eje: Float64Array, db: Float64Array, iMin: number, iMax: number, logX: boolean): MedidasAc {
  const n = db.length
  const ref = db[iMax]
  const r: MedidasAc = {
    referenciaDb: cifras(ref),
    menos3dB: bordes(eje, db, iMax, ref - 3, (v) => v >= ref - 3, logX)
  }
  if (iMax > 0 && iMax < n - 1) r.pico = { f: cifras(eje[iMax]), db: cifras(ref) }
  if (iMin > 0 && iMin < n - 1 && db[iMin] < ref - 3) {
    const nivel = ref - 3
    r.muesca = { f: cifras(eje[iMin]), db: cifras(db[iMin]), profundidadDb: cifras(ref - db[iMin]), ...bordes(eje, db, iMin, nivel, (v) => v <= nivel, logX) }
  }
  return r
}

function medirTraza(c: Corrida, s: Serie, tipo: string, logX: boolean, en: readonly number[]): MedidasTraza | null {
  const n = s.valores.length
  if (n === 0 || c.eje.length !== n) return null
  let iMin = 0, iMax = 0
  for (let i = 1; i < n; i++) {
    if (s.valores[i] < s.valores[iMin]) iMin = i
    if (s.valores[i] > s.valores[iMax]) iMax = i
  }
  const t: MedidasTraza = {
    corrida: c.etiqueta,
    traza: s.etiqueta,
    unidad: s.unidad,
    puntos: n,
    min: { x: cifras(c.eje[iMin]), valor: cifras(s.valores[iMin]) },
    max: { x: cifras(c.eje[iMax]), valor: cifras(s.valores[iMax]) },
    picoAPico: cifras(s.valores[iMax] - s.valores[iMin])
  }
  if (en.length > 0)
    t.en = en.map((x): ValorEn => {
      const v = interpolar(c.eje, s.valores, x, logX)
      const f = s.fase ? interpolar(c.eje, s.fase, x, logX) : undefined
      return { x, valor: v === null ? null : cifras(v), ...(f !== undefined ? { fase: f === null ? null : cifras(f) } : {}) }
    })
  if (tipo === 'ac') t.ac = medidasAc(c.eje, s.valores, iMin, iMax, logX)
  return t
}

/** Las medidas de cada traza de cada corrida; null si el análisis no tiene curvas (punto de operación, Fourier). */
export function medirResultado(m: ResultadoMapeado, en: readonly number[] = []): Medidas | null {
  if (m.tipo === 'op' || m.tipo === 'fourier') return null
  const trazas = m.corridas.flatMap((c) => c.series.map((s) => medirTraza(c, s, m.tipo, m.logX, en)).filter((t): t is MedidasTraza => t !== null))
  return { tipo: m.tipo, ejeNombre: m.ejeNombre, ejeUnidad: m.ejeUnidad, trazas }
}

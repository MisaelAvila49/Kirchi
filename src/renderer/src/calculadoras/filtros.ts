import { formatearValor } from '../valores/valores'
import { type Calculo, type Falla, type Redondeo, SIN_REDONDEO } from './formulas'

/** Filtros pasivos: pasa banda, rechaza banda y notch de doble T. Se evalúa la respuesta EXACTA del circuito con los
 * valores comerciales (con la carga entre secciones), para que la ficha diga lo que medirá el motor. */

/** Cuánto mayor que la resistencia de la sección anterior es la que sigue: carga a la anterior en pocos por ciento. */
export const RAZON_CARGA = 10

type Cx = { re: number; im: number }
const cx = (re: number, im = 0): Cx => ({ re, im })
const suma = (a: Cx, b: Cx): Cx => cx(a.re + b.re, a.im + b.im)
const mul = (a: Cx, b: Cx): Cx => cx(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re)
const inv = (a: Cx): Cx => {
  const d = a.re * a.re + a.im * a.im
  return cx(a.re / d, -a.im / d)
}
const div = (a: Cx, b: Cx): Cx => mul(a, inv(b))
const mod = (a: Cx): number => Math.hypot(a.re, a.im)
/** Impedancia de un capacitor a la frecuencia f. */
const zC = (c: number, f: number): Cx => cx(0, -1 / (2 * Math.PI * f * c))
const paralelo = (a: Cx, b: Cx): Cx => div(mul(a, b), suma(a, b))

const falla = (error: string): Falla => ({ ok: false, error })
const positivo = (x: number) => Number.isFinite(x) && x > 0
const R = (x: number) => formatearValor(x, 'Ω')
const Hz = (x: number) => formatearValor(x, 'Hz')
/** Una ganancia en decibelios con el menos tipográfico. */
export const enDecibeles = (g: number): string => `${g >= 1e-6 ? (20 * Math.log10(g)).toFixed(1) : '-120'} dB`.replace('-', '−')

/** Frecuencias de barrido: `n` puntos repartidos en escala logarítmica. */
function barrido(desde: number, hasta: number, n = 1500): number[] {
  const out: number[] = []
  for (let i = 0; i < n; i++) out.push(desde * (hasta / desde) ** (i / (n - 1)))
  return out
}

// ------------------------------------------------------------------------------------------------------------ Pasa banda

export interface EntradaPasaBanda {
  /** Corte inferior (pasa altas) y superior (pasa bajas) en Hz. */
  fl: number
  fh: number
  /** Capacitor del pasa altas (F). */
  c: number
}

export interface ResultadoPasaBanda {
  /** Pasa altas: C1 y R1. Pasa bajas: R2 y C2. Exactos y comerciales. */
  r1: number
  r1c: number
  c1c: number
  r2: number
  r2c: number
  c2: number
  c2c: number
  /** Cortes de cada sección sola, con los valores comerciales. */
  flReal: number
  fhReal: number
  /** Frecuencia central √(fL · fH) y ganancia del circuito completo ahí. */
  f0: number
  gCentro: number
  /** Pico de la respuesta con carga y dónde cae. */
  gPico: number
  fPico: number
  /** Cortes a −3 dB respecto del pico, con la carga entre secciones. */
  fl3: number
  fh3: number
  avisos: string[]
  nota: string
}

/** Ganancia compleja del pasa banda RC-RC con la carga de la segunda sección sobre la primera. */
export function respuestaPasaBanda(f: number, r1: number, c1: number, r2: number, c2: number): Cx {
  const rama2 = suma(cx(r2), zC(c2, f))
  const zp = paralelo(cx(r1), rama2)
  const va = div(zp, suma(zp, zC(c1, f)))
  // Divisor de la segunda sección: el capacitor C2 contra R2.
  return mul(va, div(zC(c2, f), rama2))
}

export function pasaBanda(e: EntradaPasaBanda, red: Redondeo = SIN_REDONDEO): Calculo<ResultadoPasaBanda> {
  if (!positivo(e.fl)) return falla('El corte inferior debe ser mayor que cero.')
  if (!positivo(e.fh)) return falla('El corte superior debe ser mayor que cero.')
  if (!positivo(e.c)) return falla('La capacitancia debe ser mayor que cero.')
  if (e.fh <= e.fl) return falla(`El corte superior (${Hz(e.fh)}) tiene que ser mayor que el inferior (${Hz(e.fl)}): entre los dos queda la banda que pasa.`)
  const w = (f: number) => 2 * Math.PI * f
  const c1c = red.c(e.c)
  const r1 = 1 / (w(e.fl) * c1c)
  const r1c = red.r(r1)
  // La segunda sección es RAZON_CARGA veces más resistiva: así casi no carga a la primera. Su capacitor sale del corte superior.
  const r2 = RAZON_CARGA * r1c
  const r2c = red.r(r2)
  const c2 = 1 / (w(e.fh) * r2c)
  const c2c = red.c(c2)
  const flReal = 1 / (w(1) * r1c * c1c)
  const fhReal = 1 / (w(1) * r2c * c2c)
  const f0 = Math.sqrt(flReal * fhReal)
  const H = (f: number) => mod(respuestaPasaBanda(f, r1c, c1c, r2c, c2c))
  const fs = barrido(flReal / 100, fhReal * 100)
  let gPico = 0, fPico = f0
  for (const f of fs) {
    const g = H(f)
    if (g > gPico) {
      gPico = g
      fPico = f
    }
  }
  // El barrido es una malla: el centro geométrico puede caer entre dos puntos y ser un poco más alto que cualquiera.
  const gCentro = H(f0)
  if (gCentro > gPico) {
    gPico = gCentro
    fPico = f0
  }
  const objetivo = gPico / Math.SQRT2
  const cruce = (a: number, b: number): number => {
    // Bisección en escala logarítmica entre dos frecuencias donde la ganancia cruza el objetivo.
    let lo = a, hi = b
    for (let k = 0; k < 80; k++) {
      const mid = Math.sqrt(lo * hi)
      if ((H(mid) - objetivo) * (H(lo) - objetivo) > 0) lo = mid
      else hi = mid
    }
    return Math.sqrt(lo * hi)
  }
  let fl3 = NaN, fh3 = NaN
  for (let i = 1; i < fs.length; i++) {
    const cruza = (H(fs[i - 1]) - objetivo) * (H(fs[i]) - objetivo) <= 0
    if (Number.isNaN(fl3) && fs[i] <= fPico && cruza) fl3 = cruce(fs[i - 1], fs[i])
    if (Number.isNaN(fh3) && fs[i - 1] >= fPico && cruza) fh3 = cruce(fs[i - 1], fs[i])
  }
  const avisos: string[] = []
  if (e.fh < 10 * e.fl) avisos.push(`Con cortes tan juntos (${Hz(e.fl)} y ${Hz(e.fh)}) las dos secciones de primer orden se estorban: el pico baja a ${gPico.toFixed(2)} (${enDecibeles(gPico)}). Separa los cortes al menos 10 veces.`)
  if (Math.min(r1c, r2c) < 100) avisos.push(`Una resistencia de ${R(Math.min(r1c, r2c))} carga mucho a la fuente de señal. Elige un capacitor más chico.`)
  if (r2c > 1e6) avisos.push(`R2 de ${R(r2c)} es muy alta: lo que se conecte a la salida carga al filtro. Elige un capacitor más grande.`)
  const nota = `La segunda sección es ${RAZON_CARGA} veces más resistiva para no cargar la primera, y por eso la banda queda un poco más angosta. Los cortes de la ficha valen sin carga.`
  return { ok: true, r1, r1c, c1c, r2, r2c, c2, c2c, flReal, fhReal, f0, gCentro, gPico, fPico, fl3, fh3, avisos, nota }
}

// ---------------------------------------------------------------------------------------------------------- Rechaza banda

export interface EntradaRechazaBanda {
  /** El pasa bajas corta en fl y el pasa altas en fh (fl < fh): entre los dos queda la banda que se rechaza. */
  fl: number
  fh: number
  /** Capacitor de las dos secciones (F). */
  c: number
}

export interface ResultadoRechazaBanda {
  /** Pasa bajas R1 · C y pasa altas C · R2, exactos y comerciales. */
  r1: number
  r1c: number
  r2: number
  r2c: number
  cc: number
  /** Resistencias iguales del sumador (entradas y realimentación). */
  rs: number
  flReal: number
  fhReal: number
  /** Frecuencia central √(fL · fH) donde se prueba el circuito generado. */
  f0: number
  /** Ganancia (magnitud) mínima de la banda rechazada y dónde cae. */
  gMin: number
  fMin: number
  /** Ganancia en la banda baja (desde cero) y en la alta. */
  gBaja: number
  gAlta: number
  avisos: string[]
  nota: string
}

/** Respuesta exacta del rechaza banda con sumador inversor de resistencias iguales (con la inversión incluida). */
export function respuestaRechazaBanda(f: number, r1: number, r2: number, c: number, rs: number): Cx {
  // Pasa bajas cargado por la entrada del sumador (tierra virtual) y pasa altas igual.
  const zpa = paralelo(zC(c, f), cx(rs))
  const va = div(zpa, suma(cx(r1), zpa))
  const zq = paralelo(cx(r2), cx(rs))
  const vb = div(zq, suma(zq, zC(c, f)))
  const s = suma(va, vb)
  return cx(-s.re, -s.im)
}

export function rechazaBanda(e: EntradaRechazaBanda, red: Redondeo = SIN_REDONDEO): Calculo<ResultadoRechazaBanda> {
  if (!positivo(e.fl)) return falla('El corte del pasa bajas debe ser mayor que cero.')
  if (!positivo(e.fh)) return falla('El corte del pasa altas debe ser mayor que cero.')
  if (!positivo(e.c)) return falla('La capacitancia debe ser mayor que cero.')
  if (e.fh <= e.fl) return falla(`El corte del pasa altas (${Hz(e.fh)}) tiene que ser mayor que el del pasa bajas (${Hz(e.fl)}): entre los dos queda la banda que se rechaza.`)
  const w = (f: number) => 2 * Math.PI * f
  const cc = red.c(e.c)
  const r1 = 1 / (w(e.fl) * cc)
  const r2 = 1 / (w(e.fh) * cc)
  const r1c = red.r(r1)
  const r2c = red.r(r2)
  // El sumador pesa RAZON_CARGA veces la resistencia más alta: carga poco a las dos secciones.
  const rs = red.r(RAZON_CARGA * Math.max(r1c, r2c))
  const flReal = 1 / (w(1) * r1c * cc)
  const fhReal = 1 / (w(1) * r2c * cc)
  const f0 = Math.sqrt(flReal * fhReal)
  const H = (f: number) => mod(respuestaRechazaBanda(f, r1c, r2c, cc, rs))
  let gMin = Infinity, fMin = f0
  for (const f of barrido(flReal, fhReal, 1200)) {
    const g = H(f)
    if (g < gMin) {
      gMin = g
      fMin = f
    }
  }
  const gBaja = rs / (rs + r1c)
  const gAlta = H(fhReal * 1e3)
  const avisos: string[] = []
  if (gMin > 0.1) avisos.push(`Con cortes tan juntos (${Hz(flReal)} y ${Hz(fhReal)}) la muesca solo baja a ${gMin.toFixed(2)} (${enDecibeles(gMin)}). Separa los cortes al menos 10 veces.`)
  if (rs > 1e6) avisos.push(`El sumador pide resistencias de ${R(rs)}: la corriente de entrada del amplificador pesa. Elige un capacitor más grande.`)
  if (Math.min(r1c, r2c) < 100) avisos.push(`Una resistencia de ${R(Math.min(r1c, r2c))} carga mucho a la fuente de señal. Elige un capacitor más chico.`)
  const nota = `El amplificador suma las dos secciones e invierte la señal. La banda baja pasa con ganancia ${gBaja.toFixed(2)} y no 1.`
  return { ok: true, r1, r1c, r2, r2c, cc, rs, flReal, fhReal, f0, gMin, fMin, gBaja, gAlta, avisos, nota }
}

// ------------------------------------------------------------------------------------------------------------------ Notch

export interface EntradaNotch {
  f0: number
  c: number
}

export interface ResultadoNotch {
  r: number
  rc: number
  cc: number
  f0Real: number
  /** Ganancia una década por debajo y por encima del muesco (la misma por simetría de la doble T). */
  gDecada: number
  /** Factor de calidad de la doble T sola. */
  q: number
  avisos: string[]
  nota: string
}

/** Ganancia compleja de la doble T sin carga a la frecuencia relativa x = f / f0: (1 − x²) / (1 − x² + j · 4x). */
export function respuestaNotch(x: number): Cx {
  return div(cx(1 - x * x), cx(1 - x * x, 4 * x))
}

export function notchDobleT(e: EntradaNotch, red: Redondeo = SIN_REDONDEO): Calculo<ResultadoNotch> {
  if (!positivo(e.f0)) return falla('La frecuencia del muesco debe ser mayor que cero.')
  if (!positivo(e.c)) return falla('La capacitancia debe ser mayor que cero.')
  const cc = red.c(e.c)
  const r = 1 / (2 * Math.PI * e.f0 * cc)
  const rc = red.r(r)
  const f0Real = 1 / (2 * Math.PI * rc * cc)
  const avisos: string[] = []
  if (rc < 1000) avisos.push(`${R(rc)} carga mucho a la fuente de señal. Elige un capacitor más chico para que R suba.`)
  if (rc > 1e6) avisos.push(`${R(rc)} es muy alta: lo que se conecte a la salida carga al filtro y desafina el muesco. Elige un capacitor más grande.`)
  const nota = 'La doble T sola tiene Q de 0.25, un muesco ancho. Los 2C y los R/2 se arman con dos piezas iguales en paralelo.'
  return { ok: true, r, rc, cc, f0Real, gDecada: mod(respuestaNotch(0.1)), q: 0.25, avisos, nota }
}

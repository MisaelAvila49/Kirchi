import { formatearMedida, formatearValor } from '../valores/valores'

/** Fórmulas de las calculadoras, en SI y sin interfaz. Cada una calcula el valor exacto, lo redondea a comerciales y
 * recalcula con ellos.
 * Una entrada sin sentido devuelve `{ ok: false, error }`, nunca NaN. */

/** Cómo se llevan los valores exactos a los comerciales de la serie elegida (la identidad con la serie «libre»). */
export interface Redondeo {
  /** Resistencia comercial más cercana. */
  r(ohmios: number): number
  /** Capacitor comercial más cercano. */
  c(faradios: number): number
  /** La resistencia comercial más cercana y sus `k` vecinas de cada lado (de menor a mayor), para buscar la mejor pareja. */
  rVecinas(ohmios: number, k: number): number[]
  /** Paso de la serie (E6 0.2, E12 0.1, E24 0.05, E96 0.01): cuánto puede alejarse una pareja de lo pedido. Sin él, no se acota. */
  tol?: number
}

export const SIN_REDONDEO: Redondeo = { r: (x) => x, c: (x) => x, rVecinas: (x) => [x] }

/** Cuántas resistencias de cada lado se prueban al buscar una pareja. */
const VECINAS = 3

/** La pareja (a, b) con menor costo. El costo es una lista: se compara por el primer elemento y, si empatan (1e-9
 * relativo), por el siguiente. */
function mejorPareja(as: number[], bs: number[], costo: (a: number, b: number) => number[], valida: (a: number, b: number) => boolean = () => true, respaldo?: [number, number]): [number, number] {
  let mejor: [number, number] = respaldo ?? [as[0], bs[0]]
  let cm: number[] | null = null
  for (const a of as) {
    for (const b of bs) {
      if (!valida(a, b)) continue
      const c = costo(a, b)
      if (cm === null || menor(c, cm)) {
        mejor = [a, b]
        cm = c
      }
    }
  }
  return mejor
}
const menor = (a: number[], b: number[]): boolean => {
  for (let i = 0; i < a.length; i++) {
    const tol = 1e-9 * Math.max(Math.abs(a[i]), Math.abs(b[i]), 1e-300)
    if (Math.abs(a[i] - b[i]) > tol) return a[i] < b[i]
  }
  return false
}

export type Falla = { ok: false; error: string }
export type Calculo<T> = ({ ok: true } & T) | Falla

/** kT/q a 300.15 K: el mismo voltaje térmico del motor (`engine/src/devices/mod.rs`). */
export const VT = (1.380_648_52e-23 / 1.602_176_620_8e-19) * 300.15
/** Potencia de las resistencias que Kirchi coloca por omisión (W). */
export const POTENCIA_R = 0.25

/** Las potencias nominales que ofrece la resistencia de la librería, de menor a mayor (la de omisión es 1/4 W). */
export const POTENCIAS_R = [0.125, 0.25, 0.5, 1, 2, 5] as const

/** La potencia nominal que se le pone a una resistencia que disipa `p` (W): null si la de omisión (1/4 W) alcanza o si ni 5 W alcanzan. */
export function potenciaNominal(p: number): string | null {
  if (p <= POTENCIA_R) return null
  const n = POTENCIAS_R.find((x) => x >= p)
  return n === undefined ? null : `${n} W`
}

/** Lo que sigue a «disipa X, más de 1/4 W»: qué hace el circuito generado. */
const remedio = (p: number): string => {
  const n = potenciaNominal(p)
  return n ? `el circuito generado le pone una de ${n}.` : 'ninguna resistencia de la librería lo aguanta: reparte la potencia en varias o baja el voltaje.'
}

const falla = (error: string): Falla => ({ ok: false, error })
const positivo = (x: number) => Number.isFinite(x) && x > 0
/** El menos de una cifra negativa es el tipográfico (U+2212), como en las mediciones. */
const V = (x: number) => formatearValor(x, 'V').replace(/^-/, '−')
const R = (x: number) => formatearValor(x, 'Ω')
const W = (x: number) => formatearMedida(x, 'W')
const A = (x: number) => formatearMedida(x, 'A')

// ---------------------------------------------------------------------------------------------------------------- Divisor

export interface EntradaDivisor {
  vin: number
  vout: number
  /** `corriente`: la que debe pasar por el divisor; `resistencia`: R1 + R2. */
  modo: 'corriente' | 'resistencia'
  valor: number
}

export interface ResultadoDivisor {
  r1: number
  r2: number
  r1c: number
  r2c: number
  voutReal: number
  /** (real − pedido) / pedido. */
  desvio: number
  corriente: number
  potencia: number
  p1: number
  p2: number
  avisos: string[]
  /** Lo que conviene saber siempre, sin que sea un problema. */
  nota: string
}

export function divisor(e: EntradaDivisor, red: Redondeo = SIN_REDONDEO): Calculo<ResultadoDivisor> {
  if (!positivo(e.vin)) return falla('Vin debe ser mayor que cero.')
  if (!positivo(e.vout)) return falla('Vout debe ser mayor que cero.')
  if (e.vout >= e.vin) return falla(`Un divisor solo baja el voltaje: Vout (${V(e.vout)}) tiene que ser menor que Vin (${V(e.vin)}).`)
  if (!positivo(e.valor)) return falla(e.modo === 'corriente' ? 'La corriente debe ser mayor que cero.' : 'La resistencia total debe ser mayor que cero.')
  const rt = e.modo === 'corriente' ? e.vin / e.valor : e.valor
  const r2 = (rt * e.vout) / e.vin
  const r1 = rt - r2
  // Redondear cada una por separado puede mover Vout hasta 5 %: se prueban las vecinas y gana la pareja más cercana a
  // Vout (y a la resistencia total pedida).
  // Solo cuentan las que quedan dentro del paso de la serie; si ninguna, se redondea por separado.
  const tol = red.tol ?? Infinity
  const desvioPedido = (a: number, b: number) => (e.modo === 'corriente' ? Math.abs(rt / (a + b) - 1) : Math.abs((a + b) / rt - 1))
  const [r1c, r2c] = mejorPareja(
    red.rVecinas(r1, VECINAS),
    red.rVecinas(r2, VECINAS),
    (a, b) => [Math.abs((e.vin * b) / (a + b) - e.vout), Math.abs(a + b - rt)],
    (a, b) => desvioPedido(a, b) <= tol + 1e-9,
    [red.r(r1), red.r(r2)]
  )
  const total = r1c + r2c
  const corriente = e.vin / total
  const voutReal = (e.vin * r2c) / total
  const p1 = corriente ** 2 * r1c, p2 = corriente ** 2 * r2c
  const avisos: string[] = []
  const pmax = Math.max(p1, p2)
  if (pmax > POTENCIA_R) avisos.push(`${p1 >= p2 ? 'R1' : 'R2'} disipa ${W(pmax)}, más de 1/4 W: ${remedio(pmax)}`)
  if (rt < 100) avisos.push(`Con ${R(rt)} en total la fuente entrega ${A(corriente)}: un divisor tan bajo gasta mucha energía.`)
  const nota = 'Es el voltaje sin carga. Con una carga de al menos 10 veces R2 cambia poco.'
  return { ok: true, r1, r2, r1c, r2c, voutReal, desvio: (voutReal - e.vout) / e.vout, corriente, potencia: e.vin * corriente, p1, p2, avisos, nota }
}

// ------------------------------------------------------------------------------------------------------------------- LED

/** Lo del modelo de diodo del LED que usa la fórmula (`is` y `n` de su `pieza.json`). */
export interface ModeloLed {
  is: number
  n: number
}

/** Voltaje del LED con la corriente `i`, según el modelo del motor: n · VT · ln(i / is + 1). */
export const vfLed = (m: ModeloLed, i: number): number => m.n * VT * Math.log(i / m.is + 1)

export interface EntradaLed {
  vs: number
  /** Corriente que se busca (A). */
  i: number
  modelo: ModeloLed
  /** Corriente nominal del LED (A); más allá se avisa. */
  inom?: number
}

export interface ResultadoLed {
  vf: number
  r: number
  rc: number
  /** Corriente y voltaje del LED con la resistencia comercial. */
  iReal: number
  vfReal: number
  /** Potencia de la resistencia (W). */
  potencia: number
  avisos: string[]
}

export function led(e: EntradaLed, red: Redondeo = SIN_REDONDEO): Calculo<ResultadoLed> {
  if (!positivo(e.vs)) return falla('La fuente debe ser mayor que cero.')
  if (!positivo(e.i)) return falla('La corriente debe ser mayor que cero.')
  const vf = vfLed(e.modelo, e.i)
  if (e.vs <= vf + 0.05) return falla(`Una fuente de ${V(e.vs)} no alcanza: este LED cae ${V(vf)} a ${A(e.i)} y a la resistencia le tienen que quedar unas décimas de volt. Usa una fuente mayor o menos corriente.`)
  const r = (e.vs - vf) / e.i
  const rc = red.r(r)
  // Con la resistencia comercial la corriente cambia, y con ella el voltaje del LED: se resuelve vs = vf(i) + i · rc por bisección.
  let lo = 0, hi = e.vs / rc
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2
    if (vfLed(e.modelo, mid) + mid * rc > e.vs) hi = mid
    else lo = mid
  }
  const iReal = (lo + hi) / 2
  const potencia = iReal ** 2 * rc
  const avisos: string[] = []
  const inom = e.inom ?? 0.02
  if (iReal > inom) avisos.push(`${A(iReal)} pasa de los ${A(inom)} nominales del LED: se calienta y dura menos.`)
  if (potencia > POTENCIA_R) avisos.push(`La resistencia disipa ${W(potencia)}, más de 1/4 W: ${remedio(potencia)}`)
  if (e.vs - vf < 0.5) avisos.push(`A la resistencia solo le quedan ${V(e.vs - vf)}: la corriente cambia mucho con pequeñas variaciones de la fuente o del valor comercial.`)
  return { ok: true, vf, r, rc, iReal, vfReal: vfLed(e.modelo, iReal), potencia, avisos }
}

// ------------------------------------------------------------------------------------------------------------------ Filtro RC

export interface EntradaFiltro {
  tipo: 'bajas' | 'altas'
  fc: number
  /** Cuál de los dos valores se elige; el otro se calcula. */
  dado: 'R' | 'C'
  valor: number
}

export interface ResultadoFiltro {
  /** Valores exactos (el elegido tal cual) y comerciales. */
  r: number
  c: number
  rc: number
  cc: number
  fcReal: number
  /** Constante de tiempo R · C con los valores comerciales (s). */
  tau: number
  avisos: string[]
  nota: string
}

export function filtroRC(e: EntradaFiltro, red: Redondeo = SIN_REDONDEO): Calculo<ResultadoFiltro> {
  if (!positivo(e.fc)) return falla('La frecuencia de corte debe ser mayor que cero.')
  if (!positivo(e.valor)) return falla(e.dado === 'R' ? 'La resistencia debe ser mayor que cero.' : 'La capacitancia debe ser mayor que cero.')
  const w = 2 * Math.PI * e.fc
  let r: number, c: number, rc: number, cc: number
  if (e.dado === 'R') {
    // El elegido se lleva primero a su comercial y el otro se calcula con ese: así los errores no se suman.
    r = e.valor
    rc = red.r(r)
    c = 1 / (w * rc)
    cc = red.c(c)
  } else {
    c = e.valor
    cc = red.c(c)
    r = 1 / (w * cc)
    rc = red.r(r)
  }
  const tau = rc * cc
  const avisos: string[] = []
  if (rc < 100) avisos.push(`${R(rc)} carga mucho a la fuente de señal. Elige un capacitor más chico para que R suba.`)
  if (rc > 1e6) avisos.push(`${R(rc)} es muy alta: lo que se conecte a la salida carga al filtro y mueve la frecuencia de corte. Elige un capacitor más grande.`)
  const nota = 'Vale si lo que sigue no carga al filtro.'
  return { ok: true, r, c, rc, cc, fcReal: 1 / (2 * Math.PI * tau), tau, avisos, nota }
}

// ------------------------------------------------------------------------------------------------------------------ 555

/** Resistencia más baja que se admite en R1 del astable: por ella se descarga el capacitor directo a la alimentación. */
export const R1_MINIMA = 100
const LN2 = Math.LN2
const LN3 = Math.log(3)

export interface EntradaAstable {
  f: number
  /** Ciclo de trabajo, de 0 a 1 (tiempo en alto sobre el periodo). */
  d: number
  c: number
}

export interface ResultadoAstable {
  r1: number
  r2: number
  r1c: number
  r2c: number
  cc: number
  fReal: number
  dReal: number
  /** Tiempos reales en alto y en bajo (s). */
  tAlto: number
  tBajo: number
  avisos: string[]
}

export function astable555(e: EntradaAstable, red: Redondeo = SIN_REDONDEO): Calculo<ResultadoAstable> {
  if (!positivo(e.f)) return falla('La frecuencia debe ser mayor que cero.')
  if (!positivo(e.c)) return falla('La capacitancia debe ser mayor que cero.')
  if (!Number.isFinite(e.d) || e.d <= 0 || e.d >= 1) return falla('El ciclo de trabajo tiene que estar entre 0 y 100 %.')
  if (Math.abs(e.d - 0.5) < 1e-9) return falla('El 50 % exacto necesita R1 = 0, y el 555 pide al menos 100 Ω en R1. Con un diodo en paralelo con R2 (cátodo hacia el capacitor) la carga sube solo por R1 y R1 = R2 da 50 %. Sin diodo, sube un poco el ciclo de trabajo.')
  if (e.d < 0.5) return falla(`El 555 astable clásico no baja de 50 %: el capacitor sube por R1 + R2 y baja solo por R2, así que el tiempo en alto siempre es mayor. Para ${(e.d * 100).toFixed(0)} % se agrega un diodo en paralelo con R2 (cátodo hacia el capacitor), que hace subir la carga solo por R1.`)
  const cc = red.c(e.c)
  const T = 1 / e.f
  // Las resistencias se calculan con el capacitor ya comercial: redondear antes C evita sumar su error al de R.
  const r2 = ((1 - e.d) * T) / (LN2 * cc)
  const r1 = ((2 * e.d - 1) * T) / (LN2 * cc)
  if (r1 < R1_MINIMA) return falla(`Con ese ciclo R1 sale de ${R(Math.max(r1, 0))}: el 555 descargaría el capacitor casi directo contra la alimentación. Sube el ciclo de trabajo o usa un capacitor más grande.`)
  const c1 = red.rVecinas(r1, VECINAS).filter((x) => x >= R1_MINIMA)
  // La suma R1 + R2 fija el periodo con C: solo se aceptan parejas cuya suma queda dentro del paso de la serie de la exacta.
  const tolA = red.tol ?? Infinity
  const r1n = Math.max(red.r(r1), R1_MINIMA)
  const [r1c, r2c] = mejorPareja(c1.length > 0 ? c1 : [r1n], red.rVecinas(r2, VECINAS), (a, b) => {
    const alto = LN2 * (a + b) * cc, bajo = LN2 * b * cc
    const fr = 1 / (alto + bajo), dr = alto / (alto + bajo)
    // Un solo costo para frecuencia (relativa) y ciclo (fracción): los dos son números chicos y del mismo orden.
    return [Math.hypot(fr / e.f - 1, dr - e.d)]
  }, (a, b) => Math.abs((a + b) / (r1 + r2) - 1) <= tolA + 1e-9, [r1n, red.r(r2)])
  const tAlto = LN2 * (r1c + r2c) * cc
  const tBajo = LN2 * r2c * cc
  const avisos: string[] = []
  if (Math.min(r1c, r2c) < 1000) avisos.push(`Una resistencia de ${R(Math.min(r1c, r2c))} exige mucha corriente al 555 al descargar. Con un capacitor más chico las resistencias suben.`)
  if (Math.max(r1c, r2c) > 1e7) avisos.push('Con más de 10 MΩ la fuga del capacitor y la entrada del 555 cambian la frecuencia. Usa un capacitor más grande.')
  if (e.f > 2e5) avisos.push('Arriba de 200 kHz el NE555 ya no sigue las fórmulas: sus retardos internos pesan.')
  return { ok: true, r1, r2, r1c, r2c, cc, fReal: 1 / (tAlto + tBajo), dReal: tAlto / (tAlto + tBajo), tAlto, tBajo, avisos }
}

export interface EntradaMonoestable {
  /** Duración del pulso (s). */
  t: number
  c: number
}

export interface ResultadoMonoestable {
  r: number
  rc: number
  cc: number
  tReal: number
  avisos: string[]
  nota: string
}

export function monoestable555(e: EntradaMonoestable, red: Redondeo = SIN_REDONDEO): Calculo<ResultadoMonoestable> {
  if (!positivo(e.t)) return falla('La duración debe ser mayor que cero.')
  if (!positivo(e.c)) return falla('La capacitancia debe ser mayor que cero.')
  const cc = red.c(e.c)
  const r = e.t / (LN3 * cc)
  const rc = red.r(r)
  const avisos: string[] = []
  if (rc < 1000) avisos.push(`${R(rc)} es muy baja para el 555: el capacitor se carga con mucha corriente. Elige un capacitor más chico.`)
  if (rc > 1e7) avisos.push(`${R(rc)} es muy alta: la fuga del capacitor cambia la duración. Elige un capacitor más grande.`)
  if (cc >= 1e-6) avisos.push('Un electrolítico tiene tolerancia de 20 % o más: la duración varía en la misma proporción.')
  const nota = 'El disparo tiene que durar menos que el pulso de salida.'
  return { ok: true, r, rc, cc, tReal: LN3 * rc * cc, avisos, nota }
}

// ------------------------------------------------------------------------------------------------------------- Amplificador

/** Lo del modelo del amplificador operacional que usa la calculadora (`dhi`, `dlo` y `gbw` de su `pieza.json`). */
export interface ModeloAmpOp {
  /** Cuánto antes del riel positivo se queda la salida (V). */
  dhi: number
  /** Cuánto antes del riel negativo (V). */
  dlo: number
  gbw: number
}

export interface EntradaAmplificador {
  tipo: 'inversor' | 'no-inversor'
  /** Magnitud de la ganancia (positiva); el inversor la invierte. */
  g: number
  rin: number
  /** Fuente simétrica ±vs (V). */
  vs: number
  /** Señal de entrada con la que se revisa la saturación (V, pico). */
  vin: number
  modelo: ModeloAmpOp
}

export interface ResultadoAmplificador {
  rf: number
  rfc: number
  rinc: number
  /** Ganancia con las resistencias comerciales, con su signo. */
  gReal: number
  /** Hasta dónde llega la salida arriba y abajo (V, positivos). */
  vsatMas: number
  vsatMenos: number
  /** Salida que pediría la señal y si la fuente la deja pasar. */
  vout: number
  satura: boolean
  /** Entrada máxima (pico) sin recortar. */
  vinMax: number
  /** Ancho de banda aproximado GBW / ganancia de ruido (Hz). */
  ancho: number
  avisos: string[]
}

export function amplificador(e: EntradaAmplificador, red: Redondeo = SIN_REDONDEO): Calculo<ResultadoAmplificador> {
  if (!positivo(e.g)) return falla('La ganancia debe ser mayor que cero.')
  if (!positivo(e.rin)) return falla('Rin debe ser mayor que cero.')
  if (!positivo(e.vs)) return falla('La fuente debe ser mayor que cero.')
  if (!Number.isFinite(e.vin) || e.vin < 0) return falla('La señal de entrada no puede ser negativa.')
  if (e.tipo === 'no-inversor' && e.g < 1) return falla('El no inversor no baja la señal: su ganancia es 1 o más. Para menos de 1 usa el inversor o un divisor.')
  if (e.tipo === 'no-inversor' && e.g === 1) return falla('Con ganancia 1 no hace falta Rf: es un seguidor, con la salida unida a la entrada inversora.')
  const rinc = red.r(e.rin)
  const rf = e.tipo === 'inversor' ? e.g * rinc : (e.g - 1) * rinc
  const rfc = red.r(rf)
  const gReal = e.tipo === 'inversor' ? -rfc / rinc : 1 + rfc / rinc
  const vsatMas = e.vs - e.modelo.dhi
  const vsatMenos = e.vs - e.modelo.dlo
  const vout = gReal * e.vin
  const satura = vout > vsatMas || vout < -vsatMenos
  const vinMax = Math.min(vsatMas, vsatMenos) / Math.abs(gReal)
  const ruido = e.tipo === 'inversor' ? 1 + Math.abs(gReal) : gReal
  const avisos: string[] = []
  if (satura) {
    avisos.push(`Con ${V(e.vin)} de entrada la salida pediría ${V(vout)}, pero con ±${V(e.vs)} este amplificador llega a ${V(vsatMas)} arriba y ${V(vsatMenos)} abajo: la señal se recorta. La entrada máxima sin recorte es ${V(vinMax)}.`)
  }
  if (rinc < 1000) avisos.push(`Rin de ${R(rinc)} carga a la fuente de señal. Sube Rin y Rf en la misma proporción.`)
  if (rfc > 1e6) avisos.push(`Rf de ${R(rfc)} es muy alta: el ruido y la corriente de entrada del amplificador pesan. Baja Rin y Rf en la misma proporción.`)
  return { ok: true, rf, rfc, rinc, gReal, vsatMas, vsatMenos, vout, satura, vinMax, ancho: e.modelo.gbw / ruido, avisos }
}

// ------------------------------------------------------------------------------------------ Integrador, derivador, sumador e instrumentación

const Hz = (x: number) => formatearValor(x, 'Hz')
const Cap = (x: number) => formatearValor(x, 'F')
const DOS_PI = 2 * Math.PI

/** Hasta dónde llega la salida de un modelo con una fuente simétrica ±vs: arriba y abajo (V, positivos). */
const rieles = (vs: number, m: ModeloAmpOp): { vsatMas: number; vsatMenos: number } => ({ vsatMas: vs - m.dhi, vsatMenos: vs - m.dlo })

const avisoRecorte = (vin: string, vsal: number, vs: number, r: { vsatMas: number; vsatMenos: number }, vinMax: string): string =>
  `Con ${vin} de entrada la salida pediría ${V(vsal)}, pero con ±${V(vs)} este amplificador llega a ${V(r.vsatMas)} arriba y ${V(r.vsatMenos)} abajo: la señal se recorta. La entrada máxima sin recorte es ${vinMax}.`

export interface EntradaIntegrador {
  rin: number
  /** Frecuencia en que la ganancia vale 1 (Hz). */
  fu: number
  /** Ganancia máxima en continua que fija Rf en paralelo con C; sin ella no hay Rf. */
  gdc?: number
  /** Señal senoidal de prueba: pico (V) y frecuencia (Hz). */
  vin: number
  f: number
  vs: number
  modelo: ModeloAmpOp
}

export interface ResultadoIntegrador {
  c: number
  cc: number
  rinc: number
  rf?: number
  rfc?: number
  fuReal: number
  /** Frecuencia de corte de Rf con C: por debajo de ella deja de integrar. */
  fp?: number
  tau: number
  /** Ganancia (magnitud) a la frecuencia de la señal. */
  gSenal: number
  /** Pico de la salida con la señal de prueba. */
  vpico: number
  vsatMas: number
  vsatMenos: number
  satura: boolean
  vinMax: number
  avisos: string[]
}

export function integrador(e: EntradaIntegrador, red: Redondeo = SIN_REDONDEO): Calculo<ResultadoIntegrador> {
  if (!positivo(e.rin)) return falla('Rin debe ser mayor que cero.')
  if (!positivo(e.fu)) return falla('La frecuencia de ganancia 1 debe ser mayor que cero.')
  if (!positivo(e.f)) return falla('La frecuencia de la señal debe ser mayor que cero.')
  if (!positivo(e.vs)) return falla('La fuente debe ser mayor que cero.')
  if (!Number.isFinite(e.vin) || e.vin < 0) return falla('La señal de entrada no puede ser negativa.')
  if (e.gdc !== undefined && !(e.gdc >= 1)) return falla('La ganancia máxima en continua es 1 o más: Rf no puede ser menor que Rin.')
  const rinc = red.r(e.rin)
  // C se calcula con la Rin ya comercial: así el error de la serie no se suma al del capacitor.
  const c = 1 / (DOS_PI * rinc * e.fu)
  const cc = red.c(c)
  const fuReal = 1 / (DOS_PI * rinc * cc)
  const rf = e.gdc === undefined ? undefined : e.gdc * rinc
  const rfc = rf === undefined ? undefined : red.r(rf)
  const fp = rfc === undefined ? undefined : 1 / (DOS_PI * rfc * cc)
  const gSenal = rfc === undefined || fp === undefined ? fuReal / e.f : rfc / rinc / Math.sqrt(1 + (e.f / fp) ** 2)
  const vpico = e.vin * gSenal
  const r = rieles(e.vs, e.modelo)
  const lim = Math.min(r.vsatMas, r.vsatMenos)
  const vinMax = lim / gSenal
  const satura = vpico > lim
  const avisos: string[] = []
  if (satura) avisos.push(avisoRecorte(V(e.vin), vpico, e.vs, r, V(vinMax)))
  if (rfc === undefined) avisos.push('Sin Rf, cualquier voltaje continuo en la entrada o desvío del amplificador se integra sin parar y la salida acaba en un riel. Agrega una ganancia máxima en continua para ponerle Rf.')
  else if (fp !== undefined && e.f < 3 * fp) avisos.push(`A ${Hz(e.f)} la señal queda cerca o debajo de fp = ${Hz(fp)}: el circuito amplifica en vez de integrar. Para integrar, deja fp una década por debajo de la frecuencia de la señal.`)
  if (rinc < 1000) avisos.push(`Rin de ${R(rinc)} carga a la fuente de señal. Sube Rin y baja C en la misma proporción.`)
  if (cc >= 1e-6) avisos.push(`Un capacitor de ${Cap(cc)} suele ser electrolítico, con polaridad y fuga. Para integrar conviene uno de película: sube Rin y baja C.`)
  if (fuReal > e.modelo.gbw / 10) avisos.push(`La ganancia 1 en ${Hz(fuReal)} queda cerca del producto ganancia-ancho de banda del amplificador (${Hz(e.modelo.gbw)}): el integrador real se aleja del ideal.`)
  return { ok: true, c, cc, rinc, rf, rfc, fuReal, fp, tau: rinc * cc, gSenal, vpico, ...r, satura, vinMax, avisos }
}

export interface EntradaDerivador {
  cap: number
  /** Frecuencia en que la ganancia vale 1 (Hz). */
  fu: number
  /** Resistencia en serie con el capacitor de entrada, que limita la ganancia en alta frecuencia; sin ella no hay Rs. */
  rs?: number
  vin: number
  f: number
  vs: number
  modelo: ModeloAmpOp
}

export interface ResultadoDerivador {
  rf: number
  rfc: number
  cc: number
  rsc?: number
  fuReal: number
  /** Frecuencia de corte de Rs con C: por encima de ella la ganancia se frena. */
  fs?: number
  /** Ganancia máxima en alta frecuencia, Rf / Rs. */
  gAlta?: number
  tau: number
  gSenal: number
  vpico: number
  vsatMas: number
  vsatMenos: number
  satura: boolean
  vinMax: number
  avisos: string[]
}

export function derivador(e: EntradaDerivador, red: Redondeo = SIN_REDONDEO): Calculo<ResultadoDerivador> {
  if (!positivo(e.cap)) return falla('La capacitancia debe ser mayor que cero.')
  if (!positivo(e.fu)) return falla('La frecuencia de ganancia 1 debe ser mayor que cero.')
  if (!positivo(e.f)) return falla('La frecuencia de la señal debe ser mayor que cero.')
  if (!positivo(e.vs)) return falla('La fuente debe ser mayor que cero.')
  if (!Number.isFinite(e.vin) || e.vin < 0) return falla('La señal de entrada no puede ser negativa.')
  const cc = red.c(e.cap)
  const rf = 1 / (DOS_PI * e.fu * cc)
  const rfc = red.r(rf)
  const fuReal = 1 / (DOS_PI * rfc * cc)
  const rsc = e.rs === undefined ? undefined : red.r(e.rs)
  const fs = rsc === undefined ? undefined : 1 / (DOS_PI * rsc * cc)
  const gAlta = rsc === undefined ? undefined : rfc / rsc
  const gSenal = e.f / fuReal / (fs === undefined ? 1 : Math.sqrt(1 + (e.f / fs) ** 2))
  const vpico = e.vin * gSenal
  const r = rieles(e.vs, e.modelo)
  const lim = Math.min(r.vsatMas, r.vsatMenos)
  const vinMax = lim / gSenal
  const satura = vpico > lim
  const avisos: string[] = []
  if (satura) avisos.push(avisoRecorte(V(e.vin), vpico, e.vs, r, V(vinMax)))
  if (rsc === undefined) avisos.push('Sin Rs la ganancia sube sin límite con la frecuencia: el ruido se amplifica y el circuito puede oscilar. Una Rs en serie con C la limita a Rf / Rs.')
  else if (fs !== undefined && e.f > fs / 3) avisos.push(`A ${Hz(e.f)} la señal queda cerca o arriba de fs = ${Hz(fs)}: el circuito deja de derivar y se comporta como un inversor de ganancia ${(gAlta ?? 0).toPrecision(3)}.`)
  if (gSenal > e.modelo.gbw / e.f) avisos.push(`A ${Hz(e.f)} pide una ganancia de ${gSenal.toPrecision(3)} y el amplificador solo da unas ${(e.modelo.gbw / e.f).toPrecision(3)} (su producto ganancia-ancho de banda es ${Hz(e.modelo.gbw)}): la salida real será menor.`)
  if (rfc > 1e6) avisos.push(`Rf de ${R(rfc)} es muy alta: el ruido y la corriente de entrada del amplificador pesan. Sube C o la frecuencia de ganancia 1.`)
  if (rfc < 1000) avisos.push(`Rf de ${R(rfc)} es muy baja: la salida del amplificador la excita con mucha corriente. Baja C.`)
  return { ok: true, rf, rfc, cc, rsc, fuReal, fs, gAlta, tau: rfc * cc, gSenal, vpico, ...r, satura, vinMax, avisos }
}

export interface EntradaSumador {
  rf: number
  /** Ganancia (magnitud) de cada entrada, de 2 a 4. */
  g: number[]
  /** Voltaje continuo de cada entrada (V, con signo). */
  v: number[]
  vs: number
  modelo: ModeloAmpOp
}

export interface ResultadoSumador {
  rfc: number
  /** Resistencia exacta y comercial de cada entrada. */
  ri: number[]
  ric: number[]
  /** Ganancia de cada entrada con las resistencias comerciales (magnitud). */
  gReal: number[]
  vout: number
  vsatMas: number
  vsatMenos: number
  satura: boolean
  /** Cuántas veces pueden crecer todas las señales a la vez antes de recortar. */
  escala: number
  ancho: number
  avisos: string[]
}

export function sumador(e: EntradaSumador, red: Redondeo = SIN_REDONDEO): Calculo<ResultadoSumador> {
  if (e.g.length < 2 || e.g.length > 4 || e.v.length !== e.g.length) return falla('El sumador lleva de 2 a 4 entradas.')
  if (!positivo(e.rf)) return falla('Rf debe ser mayor que cero.')
  if (!positivo(e.vs)) return falla('La fuente debe ser mayor que cero.')
  if (e.g.some((x) => !positivo(x))) return falla('Cada ganancia debe ser mayor que cero.')
  if (e.v.some((x) => !Number.isFinite(x))) return falla('Cada señal debe ser un número.')
  const rfc = red.r(e.rf)
  const ri = e.g.map((g) => rfc / g)
  const ric = ri.map((x) => red.r(x))
  const gReal = ric.map((x) => rfc / x)
  const vout = -gReal.reduce((s, g, i) => s + g * e.v[i], 0)
  const r = rieles(e.vs, e.modelo)
  const satura = vout > r.vsatMas || vout < -r.vsatMenos
  const escala = vout === 0 ? Infinity : (vout > 0 ? r.vsatMas : r.vsatMenos) / Math.abs(vout)
  const ruido = 1 + gReal.reduce((s, g) => s + g, 0)
  const avisos: string[] = []
  if (satura) {
    avisos.push(`Con esas señales la salida pediría ${V(vout)}, pero con ±${V(e.vs)} este amplificador llega a ${V(r.vsatMas)} arriba y ${V(r.vsatMenos)} abajo: la suma se recorta. Las señales pueden crecer ${escala.toPrecision(2)} veces, no más.`)
  }
  const chica = Math.min(...ric)
  if (chica < 1000) avisos.push(`Una entrada de ${R(chica)} carga a su fuente de señal. Sube Rf y las resistencias de entrada en la misma proporción.`)
  if (rfc > 1e6) avisos.push(`Rf de ${R(rfc)} es muy alta: el ruido y la corriente de entrada del amplificador pesan. Baja Rf y las resistencias de entrada en la misma proporción.`)
  return { ok: true, rfc, ri, ric, gReal, vout, ...r, satura, escala, ancho: e.modelo.gbw / ruido, avisos }
}

export interface EntradaInstrumentacion {
  /** Ganancia pedida, mayor que 1. */
  g: number
  /** Las dos resistencias iguales de la etapa de entrada. */
  r: number
  /** Las cuatro resistencias iguales de la etapa diferencial. */
  rd: number
  /** Señal diferencial de prueba, V1 − V2 (V, pico), y modo común (V). */
  vd: number
  vcm: number
  vs: number
  modelo: ModeloAmpOp
}

export interface ResultadoInstrumentacion {
  rg: number
  rgc: number
  rc: number
  rdc: number
  gReal: number
  vout: number
  /** Salida de cada amplificador de entrada (el de V1 y el de V2), con la señal de prueba. */
  vu1: number
  vu2: number
  vsatMas: number
  vsatMenos: number
  satura: boolean
  /** Mayor señal diferencial (pico) que no recorta ninguna de las tres salidas. */
  vdMax: number
  ancho: number
  avisos: string[]
  nota: string
}

export function instrumentacion(e: EntradaInstrumentacion, red: Redondeo = SIN_REDONDEO): Calculo<ResultadoInstrumentacion> {
  if (!positivo(e.g)) return falla('La ganancia debe ser mayor que cero.')
  if (!(e.g > 1)) return falla('La ganancia es mayor que 1: con 1 no hace falta Rg y la etapa de entrada son dos seguidores.')
  if (!positivo(e.r)) return falla('R debe ser mayor que cero.')
  if (!positivo(e.rd)) return falla('La R de la etapa diferencial debe ser mayor que cero.')
  if (!positivo(e.vs)) return falla('La fuente debe ser mayor que cero.')
  if (!Number.isFinite(e.vd) || e.vd < 0) return falla('La señal diferencial no puede ser negativa.')
  if (!Number.isFinite(e.vcm)) return falla('El modo común debe ser un número.')
  const rc = red.r(e.r)
  const rdc = red.r(e.rd)
  const rg = (2 * rc) / (e.g - 1)
  const rgc = red.r(rg)
  const gReal = 1 + (2 * rc) / rgc
  const vout = gReal * e.vd
  const vu1 = e.vcm + (gReal * e.vd) / 2
  const vu2 = e.vcm - (gReal * e.vd) / 2
  const r = rieles(e.vs, e.modelo)
  const fuera = (x: number) => x > r.vsatMas || x < -r.vsatMenos
  const satura = fuera(vout) || fuera(vu1) || fuera(vu2)
  const vdMax = Math.max(0, Math.min(Math.min(r.vsatMas, r.vsatMenos) / gReal, (2 * (r.vsatMas - e.vcm)) / gReal, (2 * (r.vsatMenos + e.vcm)) / gReal))
  const avisos: string[] = []
  if (satura) {
    const quien = fuera(vout) ? `la salida pediría ${V(vout)}` : `un amplificador de entrada pediría ${V(fuera(vu1) ? vu1 : vu2)}`
    avisos.push(`Con ${V(e.vd)} diferencial y ${V(e.vcm)} de modo común ${quien}, pero con ±${V(e.vs)} este amplificador llega a ${V(r.vsatMas)} arriba y ${V(r.vsatMenos)} abajo: la señal se recorta. La señal diferencial máxima sin recorte es ${V(vdMax)}.`)
  }
  if (rgc < 100) avisos.push(`Rg de ${R(rgc)} exige mucha corriente a los amplificadores de entrada. Baja la ganancia o sube R.`)
  if (rc < 1000) avisos.push(`R de ${R(rc)} carga a las salidas de los amplificadores de entrada. Sube R y Rg en la misma proporción.`)
  if (rc > 1e6) avisos.push(`R de ${R(rc)} es muy alta: el ruido y la corriente de entrada pesan. Baja R y Rg en la misma proporción.`)
  const nota = 'El rechazo del modo común depende de que las cuatro resistencias de la etapa diferencial coincidan: en un montaje real conviene 0.1 % o un arreglo de resistencias.'
  return { ok: true, rg, rgc, rc, rdc, gReal, vout, vu1, vu2, ...r, satura, vdMax, ancho: e.modelo.gbw / gReal, avisos, nota }
}

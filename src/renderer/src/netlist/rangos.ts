import { formatearValor } from '../valores/valores'
import type { ElementoMotor } from './netlist'

/** Rangos que acepta el motor (`engine/src/netlist.rs`, constantes `*_RANGO`), para decir un valor fuera de ellos con el
 * nombre de la pieza y no «elemento 7». `rangos.test.ts` compara cada cota con el motor real. */
export interface Rango {
  campo: string
  nombre: string
  unidad: string
  lo: number
  hi: number
  /** El extremo de abajo no entra (un duty de 0, una corriente de saturación de 0). */
  sinLo?: boolean
  sinHi?: boolean
}

const R: [number, number] = [1e-6, 1e12]
const L: [number, number] = [1e-12, 1e6]
const TAU: [number, number] = [1e-6, 1e6]
const FUENTE = 1e6
const IS: [number, number] = [0, 1e-3]
const N: [number, number] = [0.1, 100]
const R_SERIE: [number, number] = [0, 1e12]
const CAP_MODELO: [number, number] = [0, 1e-3]
/** Sin tope superior: el motor solo pide que sea positivo (o no negativo). */
const POSITIVO: [number, number] = [0, Infinity]
/** Una fracción que no incluye ni 0 ni 1 (un exponente de gradación) o que incluye 0 pero no 1 (el coeficiente de capacitancia). */
const ENTRE_0_Y_1: [number, number] = [0, 1]

const r = (campo: string, nombre: string, unidad: string, [lo, hi]: [number, number], extra: Partial<Rango> = {}): Rango => ({ campo, nombre, unidad, lo, hi, ...extra })

/** Retardos y transiciones de los elementos digitales (s), umbrales y niveles de los puentes (V) y conductancias del 555 (S). */
const RETARDO: [number, number] = [1e-12, 1e-3]
const UMBRAL: [number, number] = [-1e3, 1e3]
const CONDUCTANCIA: [number, number] = [1e-12, 1e6]
const retardos = (): Rango[] => [r('rise_delay', 'su retardo de subida', 's', RETARDO), r('fall_delay', 'su retardo de bajada', 's', RETARDO)]
const salida = (): Rango[] => [
  r('v_lo', 'su nivel de salida en bajo', 'V', UMBRAL),
  r('v_hi', 'su nivel de salida en alto', 'V', UMBRAL),
  r('r_lo', 'su resistencia de salida en bajo', 'Ω', R),
  r('r_hi', 'su resistencia de salida en alto', 'Ω', R),
  r('t_rise', 'su tiempo de subida', 's', RETARDO),
  r('t_fall', 'su tiempo de bajada', 's', RETARDO)
]

/** Cotas de los elementos nuevos del motor (las constantes de `engine/src/netlist.rs`). */
const GANANCIA: [number, number] = [-1e9, 1e9]
const FUENTE_EXT: [number, number] = [-1e9, 1e9]
const PWL_MAX_PUNTOS = 1000
const TERM_MAX_PUNTOS = 256

/** Valores de los elementos con parámetros propios (sin modelo de SPICE). */
export const DIRECTOS: Partial<Record<ElementoMotor['type'], Rango[]>> = {
  GATE: retardos(),
  DFF: retardos(),
  JKFF: retardos(),
  COUNTER: retardos(),
  DECODER: retardos(),
  LATCH555: [r('delay', 'el retardo de su biestable', 's', RETARDO)],
  DACM: [r('t_asentamiento', 'su tiempo de asentamiento', 's', RETARDO)],
  INTC: [r('r_on', 'su resistencia cerrado', 'Ω', R), r('r_off', 'su resistencia abierto', 'Ω', R)],
  ADC: [r('in_low', 'su umbral bajo', 'V', UMBRAL), r('in_high', 'su umbral alto', 'V', UMBRAL)],
  DAC: salida(),
  OUT555: [...salida(), r('g_on', 'la conductancia de su descarga cerrada', 'S', CONDUCTANCIA), r('g_off', 'la conductancia de su descarga abierta', 'S', CONDUCTANCIA)],
  R: [r('ohms', 'su resistencia', 'Ω', R)],
  BUZZER: [r('ohms', 'su resistencia', 'Ω', R), r('umbral', 'su voltaje para sonar', 'V', [1e-6, UMBRAL[1]])],
  C: [r('farads', 'su capacitancia', 'F', [1e-18, 1e3])],
  L: [r('henries', 'su inductancia', 'H', L)],
  I: [r('amps', 'su corriente', 'A', [-FUENTE, FUENTE])],
  LAMP: [r('rfrio', 'su resistencia en frío', 'Ω', R), r('k', 'su aumento de resistencia al calentarse', '', [0, 1e3]), r('pnom', 'su potencia', 'W', [1e-6, 1e6]), r('tau', 'su inercia térmica', 's', TAU)],
  MOTOR: [
    r('r', 'su resistencia', 'Ω', R),
    r('l', 'su inductancia', 'H', L),
    r('ke', 'su constante', 'V·s/rad', [1e-6, 1e3]),
    r('j', 'su inercia', 'kg·m²', [1e-12, 1e6]),
    r('bm', 'su fricción', 'N·m·s/rad', [1e-12, 1e6])
  ],
  FUSE: [r('ohms', 'su resistencia', 'Ω', R), r('inom', 'su corriente nominal', 'A', [1e-6, 1e5]), r('ifusion', 'su corriente de fusión', 'A', [1e-6, 1e5]), r('tau', 'su inercia térmica', 's', TAU)],
  E: [r('ganancia', 'su ganancia', 'V/V', GANANCIA)],
  F: [r('ganancia', 'su ganancia', 'A/A', GANANCIA)],
  G: [r('gm', 'su transconductancia', 'S', [-1e6, 1e6])],
  H: [r('r', 'su transresistencia', 'Ω', [-1e12, 1e12])],
  TERM: [
    r('r25', 'su resistencia a 25 °C', 'Ω', R),
    r('beta', 'su constante beta', 'K', [1, 1e5]),
    r('delta', 'su constante de disipación', 'W/K', [1e-6, 1e3]),
    r('tau', 'su constante térmica', 's', TAU),
    r('tmax', 'su temperatura de quema', '°C', [1, 2000])
  ],
  LDR: [
    r('r10', 'su resistencia a 10 lx', 'Ω', R),
    r('gamma', 'su pendiente (gamma)', '', [0.05, 5]),
    r('roscuro', 'su resistencia en oscuridad', 'Ω', R),
    r('tau_sube', 'su tiempo de subida', 's', TAU),
    r('tau_baja', 'su tiempo de bajada', 's', TAU)
  ],
  PASOS: [
    r('r', 'la resistencia de cada fase', 'Ω', R),
    r('l', 'la inductancia de cada fase', 'H', L),
    r('km', 'su constante de par', 'V·s/rad', [1e-6, 1e3]),
    r('dientes', 'los dientes de su rotor', '', [1, 1000]),
    r('td', 'su par de retén', 'N·m', [0, 1e3]),
    r('j', 'su inercia', 'kg·m²', [1e-12, 1e6]),
    r('bm', 'su fricción', 'N·m·s/rad', [1e-12, 1e6])
  ],
  EXT: [r('k', 'su factor', '', FUENTE_EXT), r('c', 'su desplazamiento', '', [-FUENTE, FUENTE])],
  XFMR: [r('l1', 'la inductancia de su primario', 'H', L), r('l2', 'la inductancia de su secundario', 'H', L), r('k', 'su acoplamiento (k)', '', [0, 0.9999])],
  RELAY: [r('r', 'la resistencia de su bobina', 'Ω', R), r('l', 'la inductancia de su bobina', 'H', L), r('ion', 'su corriente de operación', 'A', [1e-9, 1e3]), r('ioff', 'su corriente de liberación', 'A', [0, 1e3])]
}

/** Parámetros de cada modelo, con los nombres de ngspice. */
export const MODELOS: Partial<Record<ElementoMotor['type'], Rango[]>> = {
  D: [
    r('is', 'la corriente de saturación (is)', 'A', IS, { sinLo: true }),
    r('n', 'el coeficiente de emisión (n)', '', N),
    r('rs', 'la resistencia en serie (rs)', 'Ω', R_SERIE),
    r('bv', 'el voltaje de ruptura (bv)', 'V', [0, 1e6], { sinLo: true }),
    r('nbv', 'el coeficiente de la ruptura (nbv)', '', [0.1, 1e3]),
    r('ibv', 'la corriente de ruptura (ibv)', 'A', POSITIVO, { sinLo: true }),
    r('cjo', 'la capacitancia de unión (cjo)', 'F', POSITIVO),
    r('vj', 'el potencial de unión (vj)', 'V', POSITIVO, { sinLo: true }),
    r('m', 'el exponente de gradación (m)', '', ENTRE_0_Y_1, { sinLo: true, sinHi: true }),
    r('tt', 'el tiempo de tránsito (tt)', 's', POSITIVO),
    r('fc', 'el coeficiente de capacitancia en directo (fc)', '', ENTRE_0_Y_1, { sinHi: true })
  ],
  Q: [
    r('is', 'la corriente de saturación (is)', 'A', IS, { sinLo: true }),
    r('ise', 'la fuga de base (ise)', 'A', IS),
    r('isc', 'la fuga de colector (isc)', 'A', IS),
    r('nf', 'el coeficiente de emisión directo (nf)', '', N),
    r('nr', 'el coeficiente de emisión inverso (nr)', '', N),
    r('ne', 'el coeficiente de la fuga de base (ne)', '', N),
    r('nc', 'el coeficiente de la fuga de colector (nc)', '', N),
    r('rb', 'la resistencia de base (rb)', 'Ω', R_SERIE),
    r('rbm', 'la resistencia de base mínima (rbm)', 'Ω', R_SERIE),
    r('re', 'la resistencia de emisor (re)', 'Ω', R_SERIE),
    r('rc', 'la resistencia de colector (rc)', 'Ω', R_SERIE),
    r('bf', 'la ganancia directa (bf)', '', POSITIVO, { sinLo: true }),
    r('br', 'la ganancia inversa (br)', '', POSITIVO, { sinLo: true }),
    r('ikf', 'la corriente de rodilla directa (ikf)', 'A', POSITIVO),
    r('ikr', 'la corriente de rodilla inversa (ikr)', 'A', POSITIVO),
    r('irb', 'la corriente de la mitad de rb (irb)', 'A', POSITIVO),
    r('cje', 'la capacitancia base-emisor (cje)', 'F', POSITIVO),
    r('cjc', 'la capacitancia base-colector (cjc)', 'F', POSITIVO),
    r('tf', 'el tiempo de tránsito directo (tf)', 's', POSITIVO),
    r('tr', 'el tiempo de tránsito inverso (tr)', 's', POSITIVO),
    r('xtf', 'la modulación de tf (xtf)', '', POSITIVO),
    r('vtf', 'el voltaje de modulación de tf (vtf)', 'V', POSITIVO),
    r('itf', 'la corriente de modulación de tf (itf)', 'A', POSITIVO),
    r('vje', 'el potencial de la unión base-emisor (vje)', 'V', POSITIVO, { sinLo: true }),
    r('vjc', 'el potencial de la unión base-colector (vjc)', 'V', POSITIVO, { sinLo: true }),
    r('mje', 'el exponente de la unión base-emisor (mje)', '', ENTRE_0_Y_1, { sinLo: true, sinHi: true }),
    r('mjc', 'el exponente de la unión base-colector (mjc)', '', ENTRE_0_Y_1, { sinLo: true, sinHi: true }),
    r('xcjc', 'la fracción de cjc hacia la base interna (xcjc)', '', ENTRE_0_Y_1),
    r('fc', 'el coeficiente de capacitancia en directo (fc)', '', ENTRE_0_Y_1, { sinHi: true })
  ],
  J: [
    r('vto', 'el voltaje de corte (vto)', 'V', [-100, 100]),
    r('beta', 'la transconductancia (beta)', 'A/V²', [1e-9, 1e4]),
    r('lambda', 'la modulación del canal (lambda)', '1/V', [0, 10]),
    r('is', 'la corriente de saturación (is)', 'A', IS, { sinLo: true }),
    r('n', 'el coeficiente de emisión (n)', '', N),
    r('pb', 'el potencial de unión (pb)', 'V', [0.1, 10]),
    r('rd', 'la resistencia de drenador (rd)', 'Ω', R_SERIE),
    r('rs', 'la resistencia de fuente (rs)', 'Ω', R_SERIE),
    r('cgs', 'la capacitancia compuerta-fuente (cgs)', 'F', CAP_MODELO),
    r('cgd', 'la capacitancia compuerta-drenador (cgd)', 'F', CAP_MODELO),
    r('b', 'el parámetro de la compuerta (b)', '', [1e-3, 1e3]),
    r('fc', 'el coeficiente de capacitancia en directo (fc)', '', ENTRE_0_Y_1, { sinHi: true })
  ],
  M: [
    r('vto', 'el voltaje de umbral (vto)', 'V', [-100, 100]),
    r('kp', 'la transconductancia (kp)', 'A/V²', [1e-9, 1e4]),
    r('lambda', 'la modulación del canal (lambda)', '1/V', [0, 10]),
    r('is', 'la corriente de saturación (is)', 'A', IS, { sinLo: true }),
    r('pb', 'el potencial de unión (pb)', 'V', [0.1, 10]),
    r('w', 'el ancho (w)', 'm', [1e-9, 1e3]),
    r('l', 'el largo (l)', 'm', [1e-9, 1e3]),
    r('rd', 'la resistencia de drenador (rd)', 'Ω', R_SERIE),
    r('rs', 'la resistencia de fuente (rs)', 'Ω', R_SERIE),
    r('cbd', 'la capacitancia drenador-sustrato (cbd)', 'F', CAP_MODELO),
    r('cbs', 'la capacitancia fuente-sustrato (cbs)', 'F', CAP_MODELO),
    r('cgso', 'la capacitancia compuerta-fuente (cgso)', 'F', CAP_MODELO),
    r('cgdo', 'la capacitancia compuerta-drenador (cgdo)', 'F', CAP_MODELO),
    r('mj', 'el exponente de gradación (mj)', '', ENTRE_0_Y_1, { sinLo: true, sinHi: true }),
    r('fc', 'el coeficiente de capacitancia en directo (fc)', '', ENTRE_0_Y_1, { sinHi: true })
  ],
  OA: [
    r('a0', 'su ganancia (a0)', 'V/V', [1, 1e9]),
    r('gbw', 'su producto ganancia-ancho de banda (gbw)', 'Hz', [1e-3, 1e12]),
    r('sr', 'su velocidad de subida (sr)', 'V/s', [1e-3, 1e15]),
    r('rin', 'su resistencia de entrada (rin)', 'Ω', [1, 1e13]),
    r('rout', 'su resistencia de salida (rout)', 'Ω', [1e-3, 1e9]),
    r('ilim', 'su corriente de salida máxima (ilim)', 'A', [1e-9, 1e3]),
    r('dhi', 'la distancia de su salida a V+ (dhi)', 'V', [0, 100]),
    r('dlo', 'la distancia de su salida a V− (dlo)', 'V', [0, 100]),
    r('rq', 'su resistencia en reposo (rq)', 'Ω', [1, 1e12])
  ]
}

const RANGO_DE_LA_FUENTE: Rango[] = [r('v', 'su voltaje', 'V', [-FUENTE, FUENTE])]

export function dentro(v: number, g: Rango): boolean {
  if (!(v >= g.lo) || !(v <= g.hi)) return false
  return !(g.sinLo && v === g.lo) && !(g.sinHi && v === g.hi)
}

/** «vale 1 nΩ, fuera de lo que admite la vista previa (de 1 µΩ a 1 TΩ)». */
function queDice(g: Rango, v: number): string {
  const num = Number.isFinite(v) ? formatearValor(v, g.unidad) : 'un valor que no es un número'
  const lo = formatearValor(g.lo, g.unidad)
  const admite = !Number.isFinite(g.hi)
    ? g.sinLo
      ? `mayor que ${lo}`
      : `${lo} o más`
    : g.sinLo || g.sinHi
      ? `entre ${lo}${g.sinLo ? ' (sin incluirlo)' : ''} y ${formatearValor(g.hi, g.unidad)}${g.sinHi ? ' (sin incluirlo)' : ''}`
      : `de ${lo} a ${formatearValor(g.hi, g.unidad)}`
  return `vale ${num}, fuera de lo que admite la vista previa (${admite})`
}

function texto(ref: string, g: Rango, v: number): string {
  return `${ref}: ${g.nombre} ${queDice(g, v)}.`
}

const EARLY = [['vaf', 'el voltaje de Early directo (vaf)'], ['var', 'el voltaje de Early inverso (var)']] as const
const queDiceEarly = (v: number) => `vale ${formatearValor(v, 'V')}, fuera de lo que admite la vista previa (0 para infinito, o 1 V o más)`

/** Las que no se reducen a un rango: vaf y var son 0 (infinito) o de 1 V en adelante; el umbral bajo de un puente no pasa del alto. */
function especiales(ref: string, e: ElementoMotor): string | null {
  if (e.type === 'ADC') {
    if (!(e.in_low <= e.in_high)) return `${ref}: su umbral bajo (${formatearValor(e.in_low, 'V')}) debe ser menor o igual que el alto (${formatearValor(e.in_high, 'V')}).`
    const rin = r('r_in', 'la resistencia de su entrada', 'Ω', R)
    if (e.r_in !== undefined && !dentro(e.r_in, rin)) return texto(ref, rin, e.r_in)
  }
  if (e.type === 'DACM' && e.r_out !== undefined) {
    const rs = r('r_out', 'su resistencia de salida', 'Ω', R)
    if (!dentro(e.r_out, rs)) return texto(ref, rs, e.r_out)
  }
  if (e.type === 'LUT' || e.type === 'MSI') {
    // Un par [subida, bajada] por salida.
    const retardo = r('retardos', 'un retardo suyo', 's', RETARDO)
    for (const par of e.retardos) for (const v of par) if (!dentro(v, retardo)) return texto(ref, retardo, v)
  }
  if (e.type === 'EXT' && e.r !== undefined) {
    const rs = r('r', 'su resistencia en serie', 'Ω', R)
    if (!dentro(e.r, rs)) return texto(ref, rs, e.r)
  }
  if (e.type === 'PASOS') {
    const mutua = r('k_mutua', 'su acoplamiento entre mitades (k_mutua)', '', [0, 0.9999])
    if (e.k_mutua !== undefined && !dentro(e.k_mutua, mutua)) return texto(ref, mutua, e.k_mutua)
    const reduccion = r('reduccion', 'su reducción', '', [1, 1e6])
    if (e.reduccion !== undefined && !dentro(e.reduccion, reduccion)) return texto(ref, reduccion, e.reduccion)
    const esperados = e.unipolar ? 6 : 4
    if (e.nodos.length !== esperados) return `${ref}: debe tener ${esperados} terminales y tiene ${e.nodos.length}.`
  }
  if (e.type === 'TERM' && e.rt !== undefined) {
    const resistencia = r('rt', 'una resistencia de su tabla', 'Ω', R)
    if (e.rt.length < 2 || e.rt.length > TERM_MAX_PUNTOS) return `${ref}: su tabla de resistencia debe tener de 2 a ${TERM_MAX_PUNTOS} puntos.`
    for (const [i, [t, ohms]] of e.rt.entries()) {
      if (!Number.isFinite(t) || (i > 0 && !(t > e.rt[i - 1][0]))) return `${ref}: las temperaturas de su tabla deben ser crecientes.`
      if (!dentro(ohms, resistencia)) return texto(ref, resistencia, ohms)
    }
  }
  if (e.type === 'RELAY' && !(e.ioff < e.ion)) {
    return `${ref}: su corriente de liberación (${formatearValor(e.ioff, 'A')}) debe ser menor que la de operación (${formatearValor(e.ion, 'A')}).`
  }
  if (e.type === 'Q') {
    for (const [campo, nombre] of EARLY) {
      const v = e.model[campo]
      if (v !== undefined && !(v === 0 || v >= 1)) return `${ref}: ${nombre} ${queDiceEarly(v)}.`
    }
  }
  return null
}

/** Nombres de los parámetros de cada modelo de SPICE que lee el motor, y cómo se llama la pieza en el mensaje. */
export type FamiliaParametros = 'bjt' | 'mosfet' | 'ampop' | 'jfet' | 'termistor' | 'ldr' | 'pasos'
export const PARAMETROS: Record<FamiliaParametros, { nombres: string[]; pieza: string }> = {
  bjt: { pieza: 'un transistor', nombres: ['is', 'bf', 'nf', 'vaf', 'ikf', 'ise', 'ne', 'br', 'nr', 'var', 'ikr', 'isc', 'nc', 'rb', 'irb', 'rbm', 're', 'rc', 'cje', 'vje', 'mje', 'tf', 'xtf', 'vtf', 'itf', 'cjc', 'vjc', 'mjc', 'xcjc', 'tr', 'fc'] },
  mosfet: { pieza: 'un MOSFET', nombres: ['vto', 'kp', 'lambda', 'rd', 'rs', 'cbd', 'cbs', 'is', 'pb', 'mj', 'fc', 'cgso', 'cgdo', 'w', 'l'] },
  ampop: { pieza: 'un amplificador', nombres: ['a0', 'gbw', 'sr', 'rin', 'rout', 'ilim', 'dhi', 'dlo', 'rq'] },
  jfet: { pieza: 'un JFET', nombres: ['vto', 'beta', 'lambda', 'is', 'n', 'pb', 'rd', 'rs', 'cgs', 'cgd', 'b', 'fc'] },
  termistor: { pieza: 'un termistor', nombres: ['r25', 'beta', 'delta', 'tau', 'tmax'] },
  ldr: { pieza: 'una fotorresistencia', nombres: ['r10', 'gamma', 'roscuro', 'tau_sube', 'tau_baja'] },
  pasos: { pieza: 'un motor a pasos', nombres: ['r', 'l', 'km', 'dientes', 'td', 'j', 'bm', 'k_mutua', 'reduccion'] }
}

/** Lo que está mal con el parámetro `campo` de un modelo SPICE (nombre que el motor no lee o valor fuera de rango), para validar `pieza.json`; null si está bien. */
/** Distancia de edición entre dos textos cortos: insertar, borrar o cambiar una letra, o intercambiar dos vecinas, cuesta 1. */
export function distanciaDeEdicion(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
    }
  }
  return d[a.length][b.length]
}

/** El nombre conocido más parecido a `texto` (a lo más a 2 letras de distancia, sin distinguir mayúsculas ni espacios), o undefined. */
export function nombreParecido(texto: string, conocidos: readonly string[]): string | undefined {
  const limpio = texto.trim().toLowerCase()
  let mejor: string | undefined
  let dist = 3
  for (const n of conocidos) {
    // Un nombre de una o dos letras (a, b, k) estaría a dos letras de casi cualquier cosa: solo se sugiere si es exacto.
    if (n.length < 3 && n !== limpio) continue
    const d = distanciaDeEdicion(limpio, n)
    if (d < dist) {
      dist = d
      mejor = n
    }
  }
  return mejor
}

export function problemaDeParametro(modelo: FamiliaParametros, campo: string, valor: number): string | null {
  const { nombres, pieza } = PARAMETROS[modelo]
  if (!nombres.includes(campo)) {
    const parecido = nombreParecido(campo, nombres)
    if (parecido) return `parámetro desconocido, ¿quisiste decir «${parecido}»?`
    const lista = `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`
    return `parámetro desconocido (los de ${pieza} son ${lista})`
  }
  if (modelo === 'bjt') {
    if (EARLY.some(([c]) => c === campo)) return valor === 0 || valor >= 1 ? null : queDiceEarly(valor)
    const g = MODELOS.Q?.find((x) => x.campo === campo)
    return g && !dentro(valor, g) ? queDice(g, valor) : null
  }
  const grupo = modelo === 'mosfet' ? MODELOS.M : modelo === 'ampop' ? MODELOS.OA : modelo === 'jfet' ? MODELOS.J : modelo === 'termistor' ? DIRECTOS.TERM : modelo === 'ldr' ? DIRECTOS.LDR : DIRECTOS.PASOS
  const g = grupo?.find((x) => x.campo === campo)
  return g && !dentro(valor, g) ? queDice(g, valor) : null
}

/** Si algún valor del elemento queda fuera de lo que acepta el motor, una oración en español que nombra la pieza (`ref`);
 * si no, null. Es lo que el motor rechazaría con «elemento N: un valor está fuera del rango admitido». */
export function errorDeRango(e: ElementoMotor, ref: string): string | null {
  if (e.type === 'V') {
    const w = e.wave
    const lista: [Rango, number][] = []
    if (w.kind === 'dc') lista.push([RANGO_DE_LA_FUENTE[0], w.v])
    else if (w.kind === 'sine') lista.push([r('offset', 'su nivel', 'V', [-FUENTE, FUENTE]), w.offset], [r('amp', 'su amplitud', 'V', [-FUENTE, FUENTE]), w.amp], [r('freq', 'su frecuencia', 'Hz', [-1e9, 1e9]), w.freq])
    else if (w.kind === 'square') lista.push([r('low', 'su nivel bajo', 'V', [-FUENTE, FUENTE]), w.low], [r('high', 'su nivel alto', 'V', [-FUENTE, FUENTE]), w.high], [r('freq', 'su frecuencia', 'Hz', [1e-6, 1e9]), w.freq], [r('duty', 'su ciclo de trabajo', '', [0, 1], { sinLo: true, sinHi: true }), w.duty])
    else if (w.kind === 'stair') lista.push([r('low', 'su nivel bajo', 'V', [-FUENTE, FUENTE]), w.low], [r('high', 'su nivel alto', 'V', [-FUENTE, FUENTE]), w.high], [r('freq', 'su frecuencia', 'Hz', [1e-6, 1e9]), w.freq], [r('steps', 'sus pasos', '', [2, 256]), w.steps])
    else if (w.kind === 'pwl') {
      const valor = r('v', 'un valor de su forma de onda', 'V', [-FUENTE, FUENTE])
      if (w.puntos.length < 1 || w.puntos.length > PWL_MAX_PUNTOS) return `${ref}: su forma de onda debe tener de 1 a ${PWL_MAX_PUNTOS} puntos.`
      if (w.puntos[0][0] !== 0 || w.puntos.some(([t], i) => !Number.isFinite(t) || (i > 0 && !(t > w.puntos[i - 1][0])))) {
        return `${ref}: los tiempos de su forma de onda deben empezar en 0 y ser crecientes.`
      }
      for (const [, v] of w.puntos) lista.push([valor, v])
    } else lista.push([r('low', 'su nivel bajo', 'V', [-FUENTE, FUENTE]), w.low], [r('high', 'su nivel alto', 'V', [-FUENTE, FUENTE]), w.high], [r('freq', 'su frecuencia', 'Hz', [1e-6, 1e9]), w.freq], [r('rise', 'su tiempo de subida', 's', [0, 1e3]), w.rise], [r('fall', 'su tiempo de bajada', 's', [0, 1e3]), w.fall], [r('width', 'su ancho', 's', [0, 1e3]), w.width])
    for (const [g, v] of lista) if (!dentro(v, g)) return texto(ref, g, v)
    return null
  }
  const campos = DIRECTOS[e.type]
  if (campos) {
    const datos = e as unknown as Record<string, number>
    for (const g of campos) if (!dentro(datos[g.campo], g)) return texto(ref, g, datos[g.campo])
  }
  const modelo = MODELOS[e.type]
  if (modelo) {
    // El diodo lleva sus parámetros directo en el elemento; los demás, en `model`.
    const datos = ('model' in e ? e.model : e) as unknown as Record<string, number | undefined>
    for (const g of modelo) {
      const v = datos[g.campo]
      if (v !== undefined && !dentro(v, g)) return texto(ref, g, v)
    }
  }
  return especiales(ref, e)
}

import type { SerieComercial } from '../../../compartido/ajustes'
import type { PiezaDef } from '../piezas/tipos'
import { formatearMedida, formatearValor, leerValor } from '../valores/valores'
import { circuitoAmplificador, circuitoAstable, circuitoDivisor, circuitoFiltro, circuitoLed, circuitoMonoestable, circuitoNotch, circuitoPasaBanda, circuitoRechazaBanda, type Armado } from './circuitos'
import type { Ecuacion } from './ecuacion'
import { enDecibeles, notchDobleT, pasaBanda, rechazaBanda } from './filtros'
import { amplificador, astable555, divisor, filtroRC, led, monoestable555, type Calculo } from './formulas'
import { coloresLed, modeloAmpOp, modeloLed, modelosAmpOp } from './modelosPieza'
import { redondeoDe } from './redondeo'

/** Las seis calculadoras como datos: campos, lectura y ficha. Las fórmulas viven en `formulas.ts`; aquí se llama a la
 * fórmula y se escriben cifras con unidad. */

export type IdCalculadora = 'divisor' | 'led' | 'filtro' | 'astable' | 'monoestable' | 'amplificador'
export const IDS_CALCULADORAS: readonly IdCalculadora[] = ['divisor', 'led', 'filtro', 'astable', 'monoestable', 'amplificador']

/** Lo que hay escrito en cada campo, por id de campo. */
export type EstadoCalc = Record<string, string>

export interface Contexto {
  serie: SerieComercial
  lib: Map<string, PiezaDef>
}

export interface OpcionCalc {
  valor: string
  texto: string
  /** Un color de LED: la muestra junto al nombre. */
  muestra?: string
}

interface Base {
  id: string
  rotulo: string
  /** Un campo que depende de otro solo se ve si esto da verdadero. */
  visible?: (e: EstadoCalc) => boolean
}
export type CampoCalc =
  | (Base & { tipo: 'num'; unidad: string; defecto: string })
  | (Base & { tipo: 'conmutador' | 'lista'; defecto: string; opciones: (c: Contexto) => OpcionCalc[] })

/** Un valor calculado: el exacto, el comercial de la serie y lo que se aleja el comercial. */
export interface FilaValor {
  rotulo: string
  exacto: string
  /** Sin comercial cuando la serie es «libre» o el valor es el elegido a mano. */
  comercial?: string
  desvio?: string
  /** Lo que se aleja el comercial del exacto, como fracción con signo (+0.058 es 5.8 % de más): la ficha marca su estado. */
  desvioNum?: number
  /** Es una frase («tres de 10 kΩ», «dos piezas iguales») y no un valor: la ficha la escribe en un renglón sin columnas. */
  frase?: boolean
}

/** Lo que resulta con los valores comerciales. */
export interface FilaReal {
  rotulo: string
  valor: string
  detalle?: string
}

export interface Salida {
  valores: FilaValor[]
  reales: FilaReal[]
  avisos: string[]
  /** Lo que conviene saber aunque no haya problema. */
  nota?: string
  /** La ecuación y, debajo, la sustitución con los valores de la ficha y el resultado (una pareja por fórmula). */
  ecuaciones: Ecuacion[]
  armado: Armado
}

export interface Evaluacion {
  /** Texto de un campo que no se lee, por id de campo. */
  erroresCampo: Record<string, string>
  /** La fórmula no tiene resultado con esos datos: la explicación. */
  error?: string
  salida?: Salida
}

export interface DefCalculadora {
  id: IdCalculadora
  /** El nombre corto de la lista. */
  corto: string
  nombre: string
  /** Una línea que dice para qué sirve. */
  resumen: string
  /** Lo que se escribe en Ctrl+K para encontrarla. */
  palabras: string
  campos: CampoCalc[]
  evaluar(e: EstadoCalc, c: Contexto): Evaluacion
}

// ----------------------------------------------------------------------------------------------------------------- lectura

type Lectura = { valor: number } | { error: string }
const UNIDADES_ESPERADAS: Record<string, string> = { V: 'voltios (V)', A: 'amperios (A)', 'Ω': 'ohmios (Ω)', F: 'faradios (F)', Hz: 'hertz (Hz)', s: 'segundos (s)', '': 'un número' }

/** Un número en notación de ingeniería («4k7», «100n», «2.5 ms») con la unidad que corresponde o sin ella. */
function leerNumero(texto: string, unidad: string, opciones: { cero?: boolean } = {}): Lectura {
  const v = leerValor(texto)
  if (!v) return { error: `Escribe ${UNIDADES_ESPERADAS[unidad] ?? 'un número'}, por ejemplo ${EJEMPLO[unidad] ?? '10'}.` }
  if (v.unidad !== '' && v.unidad !== unidad) return { error: `Aquí va ${UNIDADES_ESPERADAS[unidad] ?? 'un número'}.` }
  if (opciones.cero ? v.valor < 0 : !(v.valor > 0)) return { error: opciones.cero ? 'No puede ser negativo.' : 'Tiene que ser mayor que cero.' }
  const lim = LIMITES[unidad]
  // Con `cero` el mínimo es 0 (una señal nula es válida); sin él, lo de abajo del mínimo no se admite.
  if (lim && (v.valor > lim[1] || (v.valor < lim[0] && !(opciones.cero && v.valor === 0)))) {
    return { error: `Fuera de rango: va de ${textoLimite(lim[0], unidad)} a ${textoLimite(lim[1], unidad)}.` }
  }
  return { valor: v.valor }
}
/** Lo que tiene sentido en un circuito, por unidad: fuera de esto el cálculo da números que ninguna pieza real tiene. */
const LIMITES: Record<string, [number, number]> = { V: [1e-6, 1e3], A: [1e-9, 100], 'Ω': [1, 1e8], F: [1e-12, 1], Hz: [1e-3, 1e8], s: [1e-6, 1e6], '': [1e-3, 1e5] }
const textoLimite = (x: number, unidad: string): string => (unidad === '' ? String(x) : formatearValor(x, unidad))
const EJEMPLO: Record<string, string> = { V: '5', A: '10m', 'Ω': '4k7', F: '100n', Hz: '1k', s: '500m', '': '10' }

/** «60» o «60 %»: el ciclo de trabajo como fracción. */
function leerPorcentaje(texto: string): Lectura {
  const v = leerValor(texto.replace('%', ''))
  if (!v || v.unidad !== '' || !(v.valor > 0 && v.valor < 100)) return { error: 'Escribe un porcentaje entre 0 y 100, por ejemplo 60.' }
  return { valor: v.valor / 100 }
}

/** Lee varios campos a la vez: junta los errores por campo y entrega los números cuando no hay ninguno. */
function leer<K extends string>(e: EstadoCalc, pedidos: Record<K, { unidad: string; cero?: boolean; porcentaje?: boolean }>): { v: Record<K, number> } | { errores: Record<string, string> } {
  const v = {} as Record<K, number>
  const errores: Record<string, string> = {}
  for (const id of Object.keys(pedidos) as K[]) {
    const p = pedidos[id]
    const l = p.porcentaje ? leerPorcentaje(e[id] ?? '') : leerNumero(e[id] ?? '', p.unidad, { cero: p.cero })
    if ('error' in l) errores[id] = l.error
    else v[id] = l.valor
  }
  return Object.keys(errores).length > 0 ? { errores } : { v }
}

// ----------------------------------------------------------------------------------------------------------------- escritura

/** El menos de una cifra negativa es el tipográfico (U+2212), como en las mediciones. */
const menos = (t: string): string => t.replace(/^-/, '−')
const V = (x: number) => menos(formatearValor(x, 'V'))
const R = (x: number) => formatearValor(x, 'Ω')
const Cap = (x: number) => formatearValor(x, 'F')
const Hz = (x: number) => formatearValor(x, 'Hz')
const S = (x: number) => formatearValor(x, 's')
const M = formatearMedida
/** «+5.7 %» o «−2.1 %» (menos tipográfico). */
const pct = (x: number): string => (Math.abs(x * 100) < 0.05 ? '0.0 %' : `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(1)} %`)
/** «+0.4 puntos» o «−1.2 puntos»: la diferencia entre dos porcentajes. */
const puntos = (x: number): string => (Math.abs(x * 100) < 0.05 ? '0.0 puntos' : `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(1)} puntos`)
const iguales = (a: number, b: number) => Math.abs(a / b - 1) < 1e-9

/** Una fila de valor con su comercial; sin comercial si la serie es libre o no cambia nada. */
function fila(rotulo: string, exacto: number, comercial: number, f: (x: number) => string, c: Contexto): FilaValor {
  if (c.serie === 'libre' || iguales(exacto, comercial)) return { rotulo, exacto: f(exacto) }
  return { rotulo, exacto: f(exacto), comercial: f(comercial), desvio: pct(comercial / exacto - 1), desvioNum: comercial / exacto - 1 }
}

const ok = <T extends object>(r: Calculo<T>): ({ ok: true } & T) | string => (r.ok ? r : r.error)

function conLectura<K extends string>(
  e: EstadoCalc,
  pedidos: Record<K, { unidad: string; cero?: boolean; porcentaje?: boolean }>,
  seguir: (v: Record<K, number>) => Evaluacion
): Evaluacion {
  const l = leer(e, pedidos)
  return 'errores' in l ? { erroresCampo: l.errores } : seguir(l.v)
}
const sinSalida = (error: string): Evaluacion => ({ erroresCampo: {}, error })

// ------------------------------------------------------------------------------------------------------------- calculadoras

const divisorCalc: DefCalculadora = {
  id: 'divisor',
  corto: 'Divisor',
  nombre: 'Divisor de voltaje',
  resumen: 'Dos resistencias que bajan un voltaje al valor que se pide.',
  palabras: 'divisor voltaje tension resistencias vout',
  campos: [
    { tipo: 'num', id: 'vin', rotulo: 'Vin', unidad: 'V', defecto: '9' },
    { tipo: 'num', id: 'vout', rotulo: 'Vout', unidad: 'V', defecto: '5' },
    { tipo: 'conmutador', id: 'modo', rotulo: 'Se conoce', defecto: 'resistencia', opciones: () => [{ valor: 'resistencia', texto: 'R total' }, { valor: 'corriente', texto: 'Corriente' }] },
    { tipo: 'num', id: 'rtotal', rotulo: 'R1 + R2', unidad: 'Ω', defecto: '10k', visible: (e) => e.modo !== 'corriente' },
    { tipo: 'num', id: 'corriente', rotulo: 'Corriente', unidad: 'A', defecto: '1m', visible: (e) => e.modo === 'corriente' }
  ],
  evaluar(e, c) {
    const corriente = e.modo === 'corriente'
    return conLectura(e, { vin: { unidad: 'V' }, vout: { unidad: 'V' }, ...(corriente ? { corriente: { unidad: 'A' } } : { rtotal: { unidad: 'Ω' } }) } as Record<string, { unidad: string }>, (v) => {
      const red = redondeoDe(c.serie)
      const entrada = { vin: v.vin, vout: v.vout, modo: corriente ? ('corriente' as const) : ('resistencia' as const), valor: corriente ? v.corriente : v.rtotal }
      const r = ok(divisor(entrada, red))
      if (typeof r === 'string') return sinSalida(r)
      return {
        erroresCampo: {},
        salida: {
          valores: [fila('R1', r.r1, r.r1c, R, c), fila('R2', r.r2, r.r2c, R, c)],
          reales: [
            { rotulo: 'Vout real', valor: V(r.voutReal), detalle: `${pct(r.desvio)} de lo pedido` },
            { rotulo: 'Corriente', valor: M(r.corriente, 'A') },
            { rotulo: 'Potencia', valor: M(r.potencia, 'W'), detalle: `R1 ${M(r.p1, 'W')}, R2 ${M(r.p2, 'W')}` }
          ],
          avisos: r.avisos,
          nota: r.nota,
          ecuaciones: [{
            ecuacion: 'Vsalida = Vin · R2 / (R1 + R2)',
            sustitucion: `Vsalida = ${V(v.vin)} · ${R(r.r2c)} / (${R(r.r1c)} + ${R(r.r2c)}) = ${V(r.voutReal)}`
          }],
          armado: circuitoDivisor(entrada, r)
        }
      }
    })
  }
}

const ledCalc: DefCalculadora = {
  id: 'led',
  corto: 'LED',
  nombre: 'LED con resistencia',
  resumen: 'La resistencia que limita la corriente de un LED, con el voltaje de su modelo.',
  palabras: 'led resistencia limitadora corriente diodo emisor',
  campos: [
    { tipo: 'num', id: 'vs', rotulo: 'Fuente', unidad: 'V', defecto: '5' },
    { tipo: 'lista', id: 'color', rotulo: 'Color', defecto: 'rojo', opciones: (c) => coloresLed(c.lib).map((x) => ({ valor: x, texto: x[0].toUpperCase() + x.slice(1), muestra: `led-${x}` })) },
    { tipo: 'num', id: 'i', rotulo: 'Corriente', unidad: 'A', defecto: '10m' }
  ],
  evaluar(e, c) {
    const color = e.color ?? 'rojo'
    const modelo = modeloLed(c.lib, color)
    if (!modelo) return sinSalida('La librería no trae el LED.')
    return conLectura(e, { vs: { unidad: 'V' }, i: { unidad: 'A' } }, (v) => {
      const red = redondeoDe(c.serie)
      const entrada = { vs: v.vs, i: v.i, modelo, inom: modelo.inom }
      const r = ok(led(entrada, red))
      if (typeof r === 'string') return sinSalida(r)
      return {
        erroresCampo: {},
        salida: {
          valores: [fila('Resistencia', r.r, r.rc, R, c)],
          reales: [
            { rotulo: 'Corriente real', valor: M(r.iReal, 'A'), detalle: `${pct(r.iReal / v.i - 1)} de lo pedido` },
            { rotulo: 'Voltaje del LED', valor: V(r.vfReal), detalle: `Vf de su modelo, ${color}` },
            { rotulo: 'Potencia en R', valor: M(r.potencia, 'W') }
          ],
          avisos: r.avisos,
          ecuaciones: [{
            ecuacion: 'R = (Vfuente − Vled) / I',
            sustitucion: `R = (${V(v.vs)} − ${V(r.vf)}) / ${formatearValor(v.i, 'A')} = ${R(r.r)}`
          }],
          armado: circuitoLed(entrada, r, color)
        }
      }
    })
  }
}

// Los filtros: una sola calculadora con un selector de tipo. Cada tipo conserva su cálculo y su circuito.
function evaluarFiltroRC(e: EstadoCalc, c: Contexto): Evaluacion {
  const dadoR = e.dado === 'R'
  return conLectura(e, { fc: { unidad: 'Hz' }, ...(dadoR ? { r: { unidad: 'Ω' } } : { cap: { unidad: 'F' } }) } as Record<string, { unidad: string }>, (v) => {
    const red = redondeoDe(c.serie)
    const entrada = { tipo: e.tipo === 'altas' ? ('altas' as const) : ('bajas' as const), fc: v.fc, dado: dadoR ? ('R' as const) : ('C' as const), valor: dadoR ? v.r : v.cap }
    const r = ok(filtroRC(entrada, red))
    if (typeof r === 'string') return sinSalida(r)
    return {
      erroresCampo: {},
      salida: {
        valores: dadoR ? [fila('Capacitor', r.c, r.cc, Cap, c), fila('Resistencia', r.r, r.rc, R, c)] : [fila('Resistencia', r.r, r.rc, R, c), fila('Capacitor', r.c, r.cc, Cap, c)],
        reales: [
          { rotulo: 'Frecuencia de corte real', valor: Hz(r.fcReal), detalle: `${pct(r.fcReal / v.fc - 1)} de lo pedido` },
          { rotulo: 'Constante de tiempo', valor: S(r.tau) },
          { rotulo: 'En la frecuencia de corte', valor: '70.7 % (−3 dB)' }
        ],
        avisos: r.avisos,
        nota: r.nota,
        ecuaciones: [{
          ecuacion: 'fc = 1 / (2π · R · C)',
          sustitucion: `fc = 1 / (2π · ${R(r.rc)} · ${Cap(r.cc)}) = ${Hz(r.fcReal)}`
        }],
        armado: circuitoFiltro(entrada, r)
      }
    }
  })
}

function evaluarPasaBanda(e: EstadoCalc, c: Contexto): Evaluacion {
  return conLectura(e, { fl: { unidad: 'Hz' }, fh: { unidad: 'Hz' }, cap: { unidad: 'F' } }, (v) => {
    const red = redondeoDe(c.serie)
    const r = ok(pasaBanda({ fl: v.fl, fh: v.fh, c: v.cap }, red))
    if (typeof r === 'string') return sinSalida(r)
    return {
      erroresCampo: {},
      salida: {
        valores: [fila('R1', r.r1, r.r1c, R, c), fila('C1', v.cap, r.c1c, Cap, c), fila('R2', r.r2, r.r2c, R, c), fila('C2', r.c2, r.c2c, Cap, c)],
        reales: [
          { rotulo: 'Corte inferior', valor: Hz(r.flReal), detalle: `${pct(r.flReal / v.fl - 1)} de lo pedido` },
          { rotulo: 'Corte superior', valor: Hz(r.fhReal), detalle: `${pct(r.fhReal / v.fh - 1)} de lo pedido` },
          { rotulo: 'Frecuencia central', valor: Hz(r.f0), detalle: 'media geométrica de los cortes' },
          { rotulo: 'Ganancia en el centro', valor: `${r.gCentro.toFixed(2)} (${enDecibeles(r.gCentro)})` },
          { rotulo: 'Cortes de −3 dB con carga', valor: `${Hz(r.fl3)} a ${Hz(r.fh3)}` }
        ],
        avisos: r.avisos,
        nota: r.nota,
        ecuaciones: [
          { ecuacion: 'fL = 1 / (2π · R1 · C1)', sustitucion: `fL = 1 / (2π · ${R(r.r1c)} · ${Cap(r.c1c)}) = ${Hz(r.flReal)}` },
          { ecuacion: 'fH = 1 / (2π · R2 · C2)', sustitucion: `fH = 1 / (2π · ${R(r.r2c)} · ${Cap(r.c2c)}) = ${Hz(r.fhReal)}` },
          { ecuacion: 'f0 = √(fL · fH)', sustitucion: `f0 = √(${Hz(r.flReal)} · ${Hz(r.fhReal)}) = ${Hz(r.f0)}` }
        ],
        armado: circuitoPasaBanda(r)
      }
    }
  })
}

function evaluarRechazaBanda(e: EstadoCalc, c: Contexto): Evaluacion {
  return conLectura(e, { fl: { unidad: 'Hz' }, fh: { unidad: 'Hz' }, cap: { unidad: 'F' } }, (v) => {
    const red = redondeoDe(c.serie)
    const r = ok(rechazaBanda({ fl: v.fl, fh: v.fh, c: v.cap }, red))
    if (typeof r === 'string') return sinSalida(r)
    return {
      erroresCampo: {},
      salida: {
        valores: [fila('R1', r.r1, r.r1c, R, c), fila('R2', r.r2, r.r2c, R, c), fila('Capacitor', v.cap, r.cc, Cap, c), { rotulo: 'Sumador', exacto: `${R(r.rs)} las tres`, frase: true }],
        reales: [
          { rotulo: 'Corte pasa bajas', valor: Hz(r.flReal), detalle: `${pct(r.flReal / v.fl - 1)} de lo pedido` },
          { rotulo: 'Corte pasa altas', valor: Hz(r.fhReal), detalle: `${pct(r.fhReal / v.fh - 1)} de lo pedido` },
          { rotulo: 'Frecuencia central', valor: Hz(r.f0), detalle: 'media geométrica de los cortes' },
          { rotulo: 'Ganancia mínima', valor: `${r.gMin.toFixed(3)} (${enDecibeles(r.gMin)})`, detalle: `cerca de ${Hz(r.fMin)}` },
          { rotulo: 'Ganancia en la banda baja', valor: r.gBaja.toFixed(2) }
        ],
        avisos: r.avisos,
        nota: r.nota,
        ecuaciones: [
          { ecuacion: 'fL = 1 / (2π · R1 · C)', sustitucion: `fL = 1 / (2π · ${R(r.r1c)} · ${Cap(r.cc)}) = ${Hz(r.flReal)}` },
          { ecuacion: 'fH = 1 / (2π · R2 · C)', sustitucion: `fH = 1 / (2π · ${R(r.r2c)} · ${Cap(r.cc)}) = ${Hz(r.fhReal)}` },
          { ecuacion: 'f0 = √(fL · fH)', sustitucion: `f0 = √(${Hz(r.flReal)} · ${Hz(r.fhReal)}) = ${Hz(r.f0)}` }
        ],
        armado: circuitoRechazaBanda(r)
      }
    }
  })
}

function evaluarNotch(e: EstadoCalc, c: Contexto): Evaluacion {
  return conLectura(e, { f0: { unidad: 'Hz' }, cap: { unidad: 'F' } }, (v) => {
    const red = redondeoDe(c.serie)
    const r = ok(notchDobleT({ f0: v.f0, c: v.cap }, red))
    if (typeof r === 'string') return sinSalida(r)
    return {
      erroresCampo: {},
      salida: {
        valores: [fila('R', r.r, r.rc, R, c), fila('Capacitor', v.cap, r.cc, Cap, c), { rotulo: '2C y R/2', exacto: 'dos piezas iguales en paralelo', frase: true }],
        reales: [
          { rotulo: 'Frecuencia del muesco', valor: Hz(r.f0Real), detalle: `${pct(r.f0Real / v.f0 - 1)} de lo pedido` },
          { rotulo: 'Q de la doble T', valor: String(r.q), detalle: 'muesco ancho' },
          { rotulo: 'Ganancia una década antes y después', valor: `${r.gDecada.toFixed(3)} (${enDecibeles(r.gDecada)})` }
        ],
        avisos: r.avisos,
        nota: r.nota,
        ecuaciones: [{ ecuacion: 'f0 = 1 / (2π · R · C)', sustitucion: `f0 = 1 / (2π · ${R(r.rc)} · ${Cap(r.cc)}) = ${Hz(r.f0Real)}` }],
        armado: circuitoNotch(r)
      }
    }
  })
}

const esFiltroRC = (e: EstadoCalc): boolean => e.tipo !== 'pasabanda' && e.tipo !== 'rechazabanda' && e.tipo !== 'notch'

const filtrosCalc: DefCalculadora = {
  id: 'filtro',
  corto: 'Filtros',
  nombre: 'Filtros',
  resumen: 'RC de primer orden, pasa banda, rechaza banda y notch de doble T.',
  palabras: 'filtro filtros rc paso bajas altas frecuencia corte pasa banda pasabanda banda cortes frecuencia central rechaza rechazabanda supresor eliminador stop reject notch doble t twin muesco rechazo zumbido 60 hz',
  campos: [
    {
      tipo: 'lista',
      id: 'tipo',
      rotulo: 'Tipo',
      defecto: 'bajas',
      opciones: () => [
        { valor: 'bajas', texto: 'RC paso bajas' },
        { valor: 'altas', texto: 'RC paso altas' },
        { valor: 'pasabanda', texto: 'Pasa banda' },
        { valor: 'rechazabanda', texto: 'Rechaza banda' },
        { valor: 'notch', texto: 'Notch de doble T' }
      ]
    },
    { tipo: 'num', id: 'fc', rotulo: 'Frecuencia de corte', unidad: 'Hz', defecto: '1k', visible: esFiltroRC },
    { tipo: 'conmutador', id: 'dado', rotulo: 'Se elige', defecto: 'C', opciones: () => [{ valor: 'R', texto: 'R' }, { valor: 'C', texto: 'C' }], visible: esFiltroRC },
    { tipo: 'num', id: 'r', rotulo: 'Resistencia', unidad: 'Ω', defecto: '1k', visible: (e) => esFiltroRC(e) && e.dado === 'R' },
    { tipo: 'num', id: 'fl', rotulo: 'Corte inferior', unidad: 'Hz', defecto: '100', visible: (e) => e.tipo === 'pasabanda' },
    { tipo: 'num', id: 'fh', rotulo: 'Corte superior', unidad: 'Hz', defecto: '10k', visible: (e) => e.tipo === 'pasabanda' },
    { tipo: 'num', id: 'flr', rotulo: 'Corte pasa bajas', unidad: 'Hz', defecto: '100', visible: (e) => e.tipo === 'rechazabanda' },
    { tipo: 'num', id: 'fhr', rotulo: 'Corte pasa altas', unidad: 'Hz', defecto: '10k', visible: (e) => e.tipo === 'rechazabanda' },
    { tipo: 'num', id: 'f0', rotulo: 'Frecuencia del muesco', unidad: 'Hz', defecto: '60', visible: (e) => e.tipo === 'notch' },
    { tipo: 'num', id: 'cap', rotulo: 'Capacitor', unidad: 'F', defecto: '100n', visible: (e) => !esFiltroRC(e) || e.dado !== 'R' }
  ],
  evaluar(e, c) {
    if (e.tipo === 'pasabanda') return evaluarPasaBanda(e, c)
    if (e.tipo === 'notch') return evaluarNotch(e, c)
    if (e.tipo === 'rechazabanda') {
      // Sus cortes tienen otro rótulo, así que otros campos: se le pasan con los nombres que lee.
      const ev = evaluarRechazaBanda({ ...e, fl: e.flr ?? '', fh: e.fhr ?? '' }, c)
      const { fl, fh, ...resto } = ev.erroresCampo
      return { ...ev, erroresCampo: { ...resto, ...(fl ? { flr: fl } : {}), ...(fh ? { fhr: fh } : {}) } }
    }
    return evaluarFiltroRC(e, c)
  }
}

const astableCalc: DefCalculadora = {
  id: 'astable',
  corto: '555 astable',
  nombre: '555 astable',
  resumen: 'Un 555 que oscila solo: frecuencia, ciclo de trabajo y el capacitor que se elige.',
  palabras: '555 astable oscilador temporizador timer frecuencia ciclo',
  campos: [
    { tipo: 'num', id: 'f', rotulo: 'Frecuencia', unidad: 'Hz', defecto: '1k' },
    { tipo: 'num', id: 'd', rotulo: 'Ciclo de trabajo', unidad: '%', defecto: '60' },
    { tipo: 'num', id: 'cap', rotulo: 'Capacitor', unidad: 'F', defecto: '100n' }
  ],
  evaluar(e, c) {
    return conLectura(e, { f: { unidad: 'Hz' }, d: { unidad: '%', porcentaje: true }, cap: { unidad: 'F' } }, (v) => {
      const red = redondeoDe(c.serie)
      const entrada = { f: v.f, d: v.d, c: v.cap }
      const r = ok(astable555(entrada, red))
      if (typeof r === 'string') return sinSalida(r)
      return {
        erroresCampo: {},
        salida: {
          valores: [fila('R1', r.r1, r.r1c, R, c), fila('R2', r.r2, r.r2c, R, c), fila('Capacitor', v.cap, r.cc, Cap, c)],
          reales: [
            { rotulo: 'Frecuencia real', valor: Hz(r.fReal), detalle: `${pct(r.fReal / v.f - 1)} de lo pedido` },
            { rotulo: 'Ciclo de trabajo real', valor: `${(r.dReal * 100).toFixed(1)} %`, detalle: `${puntos(r.dReal - v.d)} de lo pedido` },
            { rotulo: 'Tiempos', valor: `${S(r.tAlto)} alto, ${S(r.tBajo)} bajo` }
          ],
          avisos: r.avisos,
          ecuaciones: [
            {
              ecuacion: 'f = 1 / (ln 2 · (R1 + 2 · R2) · C)',
              sustitucion: `f = 1 / (ln 2 · (${R(r.r1c)} + 2 · ${R(r.r2c)}) · ${Cap(r.cc)}) = ${Hz(r.fReal)}`
            },
            {
              ecuacion: 'D = (R1 + R2) / (R1 + 2 · R2)',
              sustitucion: `D = (${R(r.r1c)} + ${R(r.r2c)}) / (${R(r.r1c)} + 2 · ${R(r.r2c)}) = ${(r.dReal * 100).toFixed(1)} %`
            }
          ],
          armado: circuitoAstable(entrada, r)
        }
      }
    })
  }
}

const monoestableCalc: DefCalculadora = {
  id: 'monoestable',
  corto: '555 monoestable',
  nombre: '555 monoestable',
  resumen: 'Un 555 que da un pulso de duración fija cada vez que se dispara.',
  palabras: '555 monoestable pulso temporizador timer duracion retardo',
  campos: [
    { tipo: 'num', id: 't', rotulo: 'Duración', unidad: 's', defecto: '500m' },
    { tipo: 'num', id: 'cap', rotulo: 'Capacitor', unidad: 'F', defecto: '10u' }
  ],
  evaluar(e, c) {
    return conLectura(e, { t: { unidad: 's' }, cap: { unidad: 'F' } }, (v) => {
      const red = redondeoDe(c.serie)
      const entrada = { t: v.t, c: v.cap }
      const r = ok(monoestable555(entrada, red))
      if (typeof r === 'string') return sinSalida(r)
      return {
        erroresCampo: {},
        salida: {
          valores: [fila('Resistencia', r.r, r.rc, R, c), fila('Capacitor', v.cap, r.cc, Cap, c)],
          reales: [{ rotulo: 'Duración real', valor: S(r.tReal), detalle: `${pct(r.tReal / v.t - 1)} de lo pedido` }],
          avisos: r.avisos,
          nota: r.nota,
          ecuaciones: [{
            ecuacion: 'T = ln 3 · R · C',
            sustitucion: `T = ln 3 · ${R(r.rc)} · ${Cap(r.cc)} = ${S(r.tReal)}`
          }],
          armado: circuitoMonoestable(entrada, r)
        }
      }
    })
  }
}

const amplificadorCalc: DefCalculadora = {
  id: 'amplificador',
  corto: 'Amplificador',
  nombre: 'Amplificador inversor y no inversor',
  resumen: 'Rf para la ganancia que se pide, y si la salida se recorta con la fuente que hay.',
  palabras: 'amplificador operacional inversor no inversor ganancia opamp rf',
  campos: [
    { tipo: 'conmutador', id: 'tipo', rotulo: 'Tipo', defecto: 'inversor', opciones: () => [{ valor: 'inversor', texto: 'Inversor' }, { valor: 'no-inversor', texto: 'No inversor' }] },
    { tipo: 'num', id: 'g', rotulo: 'Ganancia', unidad: '', defecto: '10' },
    { tipo: 'num', id: 'rin', rotulo: 'Rin', unidad: 'Ω', defecto: '1k' },
    { tipo: 'num', id: 'vs', rotulo: 'Fuente ±', unidad: 'V', defecto: '15' },
    { tipo: 'num', id: 'vin', rotulo: 'Señal de entrada', unidad: 'V', defecto: '0.5' },
    { tipo: 'lista', id: 'modelo', rotulo: 'Amplificador', defecto: 'LM741', opciones: (c) => modelosAmpOp(c.lib).map((x) => ({ valor: x, texto: x })) }
  ],
  evaluar(e, c) {
    const modeloNombre = e.modelo ?? 'LM741'
    const modelo = modeloAmpOp(c.lib, modeloNombre)
    if (!modelo) return sinSalida('La librería no trae ese amplificador.')
    return conLectura(e, { g: { unidad: '' }, rin: { unidad: 'Ω' }, vs: { unidad: 'V' }, vin: { unidad: 'V', cero: true } }, (v) => {
      const red = redondeoDe(c.serie)
      const inv = e.tipo !== 'no-inversor'
      const entrada = { tipo: inv ? ('inversor' as const) : ('no-inversor' as const), g: v.g, rin: v.rin, vs: v.vs, vin: v.vin, modelo }
      const r = ok(amplificador(entrada, red))
      if (typeof r === 'string') return sinSalida(r)
      const g = (x: number) => menos(String(Number(x.toPrecision(3))))
      return {
        erroresCampo: {},
        salida: {
          valores: [fila('Rf', r.rf, r.rfc, R, c), ...(iguales(r.rinc, v.rin) ? [] : [fila('Rin', v.rin, r.rinc, R, c)])],
          reales: [
            { rotulo: 'Ganancia real', valor: g(r.gReal), detalle: `${pct(Math.abs(r.gReal) / v.g - 1)} de lo pedido` },
            { rotulo: `Salida con ${V(v.vin)}`, valor: r.satura ? `${V(r.vout >= 0 ? r.vsatMas : -r.vsatMenos)} (recortada)` : V(r.vout), detalle: r.satura ? `pedía ${V(r.vout)}` : undefined },
            { rotulo: 'Entrada máxima sin recorte', valor: V(r.vinMax) },
            { rotulo: 'Ancho de banda', valor: Hz(r.ancho), detalle: 'GBW entre la ganancia de ruido' }
          ],
          avisos: r.avisos,
          ecuaciones: [
            {
              ecuacion: inv ? 'Ganancia = −Rf / Rin' : 'Ganancia = 1 + Rf / Rin',
              sustitucion: inv ? `Ganancia = −${R(r.rfc)} / ${R(r.rinc)} = ${g(r.gReal)}` : `Ganancia = 1 + ${R(r.rfc)} / ${R(r.rinc)} = ${g(r.gReal)}`
            },
            { ecuacion: 'Vsalida = Ganancia · Vin', sustitucion: `Vsalida = ${g(r.gReal)} · ${V(v.vin)} = ${V(r.vout)}` }
          ],
          armado: circuitoAmplificador(entrada, r, modeloNombre)
        }
      }
    })
  }
}

/** Lo único que anuncia el lector de pantalla al teclear: una frase con el resultado principal o el error. Cada campo con
 * error lo dice por `aria-describedby`. */
export function resumenParaLector(ev: Evaluacion): string {
  const campos = Object.values(ev.erroresCampo)
  if (campos.length > 0) return campos.length === 1 ? 'Hay un campo con error.' : `Hay ${campos.length} campos con error.`
  if (ev.error) return ev.error
  const s = ev.salida
  if (!s) return ''
  const v = s.valores.map((f) => `${f.rotulo} ${f.comercial ?? f.exacto}`).join(', ')
  const avisos = s.avisos.length > 0 ? `. ${s.avisos.length === 1 ? 'Un aviso' : `${s.avisos.length} avisos`}` : ''
  return `${v}. ${s.reales[0].rotulo} ${s.reales[0].valor}${avisos}`
}

export const CALCULADORAS: readonly DefCalculadora[] = [divisorCalc, ledCalc, filtrosCalc, astableCalc, monoestableCalc, amplificadorCalc]
export const calculadoraDe = (id: IdCalculadora): DefCalculadora => CALCULADORAS.find((d) => d.id === id)!

/** Lo que dice cada campo al abrir la calculadora. */
export const estadoInicial = (def: DefCalculadora): EstadoCalc => Object.fromEntries(def.campos.map((k) => [k.id, k.defecto]))

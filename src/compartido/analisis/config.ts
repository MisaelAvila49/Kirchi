/** Configuración de los seis análisis y su validación, en unidades SI y con las piezas por id del documento. `validarAnalisis` trata lo que trae un `.kir` como no confiable y devuelve una copia limpia o un mensaje. */
import { validarGrafica, type GraficaDoc } from '../grafica/aspecto'
import { MAX_CORRIDAS, MAX_PUNTOS_AC, puntosAc, puntosDc, puntosTran, TOPE_PUNTOS } from './puntos'

export type Id = string

export interface BarridoDeFuente {
  /** La fuente de voltaje que se barre. */
  fuente: Id
  desde: number
  hasta: number
  paso: number
}

export type VentanaFourier = 'rectangular' | 'hann'

export type ConfigAnalisis =
  | { tipo: 'op' }
  /** Barrido de CD de una fuente, con una segunda anidada (la primera recorre todo su rango por cada valor de la segunda). */
  | ({ tipo: 'dc' } & BarridoDeFuente & { segunda?: BarridoDeFuente })
  /** Respuesta en frecuencia: `fuente` es la entrada de CA y `magnitud` su amplitud en volts. */
  | { tipo: 'ac'; barrido: 'dec' | 'oct' | 'lin'; puntos: number; desde: number; hasta: number; fuente: Id; magnitud: number }
  /** Transitorio largo. `maximo` es el paso más largo (por omisión, fin / 1000); `inicio` el instante desde el que se guarda. */
  | { tipo: 'tran'; fin: number; maximo?: number; inicio?: number; uic?: boolean }
  /** Fourier de un transitorio: `periodos` es la ventana analizada (los últimos) y `descarte` los periodos que se dejan pasar antes. */
  | { tipo: 'fourier'; fundamental: number; armonicos: number; periodos: number; descarte: number; ventana: VentanaFourier }

export type TipoAnalisis = ConfigAnalisis['tipo']
export const TIPOS_ANALISIS: readonly TipoAnalisis[] = ['op', 'dc', 'ac', 'tran', 'fourier']

/** Barrido del valor de una pieza (R, C, L o fuente) alrededor de cualquiera de los otros análisis. */
export type ParametroBarrido = { pieza: Id } & (
  | { modo: 'lista'; valores: number[] }
  | { modo: 'lineal' | 'log'; desde: number; hasta: number; puntos: number }
)

/** Lo que el lector eligió graficar además de lo de omisión: redes por su nombre (el nodo del motor cambia con cada edición) y piezas cuya corriente se pide. */
export interface TrazasElegidas {
  redes: string[]
  piezas: Id[]
}

export interface AnalisisDoc {
  id: Id
  nombre: string
  config: ConfigAnalisis
  parametro?: ParametroBarrido
  /** Las trazas extra elegidas en la ficha (se guardan con el análisis, no solo en la sesión). */
  trazas?: TrazasElegidas
  /** El aspecto de su gráfica: tema, grosor, rejilla, marcas, eje del tiempo y el eje y el tono de cada traza. */
  grafica?: GraficaDoc
}

export const MAX_TRAZAS_ELEGIDAS = 200
export const MAX_NOMBRE_RED = 80

/** Análisis guardados en un documento. */
export const MAX_ANALISIS = 64
export const MAX_NOMBRE_ANALISIS = 80
export const MAX_ARMONICOS = 200
export const MAX_PERIODOS = 100
export const MAX_DESCARTE = 1000

/** Puntos por periodo del Fourier: los que resuelven el armónico más alto con holgura. */
export const puntosPorPeriodo = (armonicos: number): number => Math.max(256, 20 * armonicos)

const ID = /^[A-Za-z0-9_-]{1,64}$/
const ID_RESERVADO = new Set(['__proto__', 'constructor', 'prototype'])
/** Más allá de esto un número no es una magnitud de circuito (y su cuadrado se desborda). */
const MAGNITUD_MAX = 1e30

export type Validacion<T> = { ok: true; valor: T } | { ok: false; error: string }
const bien = <T>(valor: T): Validacion<T> => ({ ok: true, valor })
const mal = (error: string): { ok: false; error: string } => ({ ok: false, error })

const esObjeto = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const idValido = (v: unknown): v is string => typeof v === 'string' && ID.test(v) && !ID_RESERVADO.has(v)

function numeroDe(v: unknown, que: string, unidad: string): number | string {
  if (typeof v !== 'number' || !Number.isFinite(v)) return `${que} no es un número (${unidad}).`
  if (Math.abs(v) > MAGNITUD_MAX) return `${que} es demasiado grande.`
  return v
}
function positivoDe(v: unknown, que: string, unidad: string): number | string {
  const n = numeroDe(v, que, unidad)
  return typeof n === 'string' ? n : n > 0 ? n : `${que} debe ser mayor que cero (${unidad}).`
}
function enteroDe(v: unknown, que: string, min: number, max: number): number | string {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : `${que} debe ser un entero entre ${min} y ${max}.`
}

/** Puntos que produce un análisis en una corrida. */
export function puntosDeConfig(c: ConfigAnalisis): number {
  switch (c.tipo) {
    case 'op':
      return 1
    case 'dc':
      return puntosDc(c.desde, c.hasta, c.paso) * (c.segunda ? puntosDc(c.segunda.desde, c.segunda.hasta, c.segunda.paso) : 1)
    case 'ac':
      return puntosAc(c.barrido, c.puntos, c.desde, c.hasta)
    case 'tran':
      return puntosTran(c.fin, c.maximo ?? c.fin / 1000)
    case 'fourier':
      return Math.ceil((c.descarte + c.periodos) * puntosPorPeriodo(c.armonicos)) + 1
  }
}

/** Los valores que recorre el barrido de un parámetro. */
export function valoresDeParametro(p: ParametroBarrido): number[] {
  if (p.modo === 'lista') return [...p.valores]
  const n = p.puntos
  const valores: number[] = []
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1)
    valores.push(p.modo === 'lineal' ? p.desde + (p.hasta - p.desde) * t : p.desde * Math.pow(p.hasta / p.desde, t))
  }
  return valores
}

function barridoDeFuente(x: unknown, quien: string): Validacion<BarridoDeFuente> {
  if (!esObjeto(x)) return mal(`El barrido de ${quien} no tiene la forma esperada.`)
  if (!idValido(x.fuente)) return mal(`La fuente de ${quien} no es válida.`)
  const desde = numeroDe(x.desde, `El valor inicial de ${quien}`, 'V')
  if (typeof desde === 'string') return mal(desde)
  const hasta = numeroDe(x.hasta, `El valor final de ${quien}`, 'V')
  if (typeof hasta === 'string') return mal(hasta)
  const paso = positivoDe(x.paso, `El paso de ${quien}`, 'V')
  if (typeof paso === 'string') return mal(paso)
  if (desde === hasta) return mal(`El valor inicial y el final de ${quien} deben ser distintos.`)
  return bien({ fuente: x.fuente, desde, hasta, paso })
}

/** Revisa la configuración de un análisis. */
export function validarConfig(x: unknown): Validacion<ConfigAnalisis> {
  if (!esObjeto(x)) return mal('La configuración del análisis no tiene la forma esperada.')
  switch (x.tipo) {
    case 'op':
      return bien({ tipo: 'op' })
    case 'dc': {
      const a = barridoDeFuente(x, 'la primera fuente')
      if (!a.ok) return a
      let segunda: BarridoDeFuente | undefined
      if (x.segunda !== undefined) {
        const b = barridoDeFuente(x.segunda, 'la segunda fuente')
        if (!b.ok) return b
        if (b.valor.fuente === a.valor.fuente) return mal('La segunda fuente debe ser distinta de la primera.')
        segunda = b.valor
      }
      return bien({ tipo: 'dc', ...a.valor, ...(segunda ? { segunda } : {}) })
    }
    case 'ac': {
      if (x.barrido !== 'dec' && x.barrido !== 'oct' && x.barrido !== 'lin') return mal('El barrido de CA debe ser por década, por octava o lineal.')
      const puntos = enteroDe(x.puntos, 'El número de puntos', 1, MAX_PUNTOS_AC)
      if (typeof puntos === 'string') return mal(puntos)
      const desde = positivoDe(x.desde, 'La frecuencia inicial', 'Hz')
      if (typeof desde === 'string') return mal(desde)
      const hasta = positivoDe(x.hasta, 'La frecuencia final', 'Hz')
      if (typeof hasta === 'string') return mal(hasta)
      if (hasta <= desde) return mal('La frecuencia final debe ser mayor que la inicial.')
      if (!idValido(x.fuente)) return mal('La fuente de entrada de CA no es válida.')
      const magnitud = positivoDe(x.magnitud, 'La magnitud de la entrada de CA', 'V')
      if (typeof magnitud === 'string') return mal(magnitud)
      return bien({ tipo: 'ac', barrido: x.barrido, puntos, desde, hasta, fuente: x.fuente, magnitud })
    }
    case 'tran': {
      const fin = positivoDe(x.fin, 'El tiempo final', 's')
      if (typeof fin === 'string') return mal(fin)
      let maximo: number | undefined
      if (x.maximo !== undefined) {
        const m = positivoDe(x.maximo, 'El paso máximo', 's')
        if (typeof m === 'string') return mal(m)
        if (m > fin) return mal('El paso máximo no puede ser mayor que el tiempo final.')
        maximo = m
      }
      let inicio: number | undefined
      if (x.inicio !== undefined) {
        const i = numeroDe(x.inicio, 'El tiempo inicial de guardado', 's')
        if (typeof i === 'string') return mal(i)
        if (i < 0 || i >= fin) return mal('El tiempo inicial de guardado debe estar entre 0 y el tiempo final (s).')
        inicio = i
      }
      return bien({ tipo: 'tran', fin, ...(maximo !== undefined ? { maximo } : {}), ...(inicio !== undefined ? { inicio } : {}), ...(x.uic === true ? { uic: true } : {}) })
    }
    case 'fourier': {
      const fundamental = positivoDe(x.fundamental, 'La frecuencia fundamental', 'Hz')
      if (typeof fundamental === 'string') return mal(fundamental)
      const armonicos = enteroDe(x.armonicos, 'El número de armónicos', 1, MAX_ARMONICOS)
      if (typeof armonicos === 'string') return mal(armonicos)
      const periodos = enteroDe(x.periodos, 'La ventana (en periodos)', 1, MAX_PERIODOS)
      if (typeof periodos === 'string') return mal(periodos)
      const descarte = enteroDe(x.descarte ?? 0, 'Los periodos que se dejan pasar', 0, MAX_DESCARTE)
      if (typeof descarte === 'string') return mal(descarte)
      const ventana = x.ventana ?? 'rectangular'
      if (ventana !== 'rectangular' && ventana !== 'hann') return mal('La ventana debe ser rectangular o de Hann.')
      return bien({ tipo: 'fourier', fundamental, armonicos, periodos, descarte, ventana })
    }
    default:
      return mal('El tipo de análisis no existe.')
  }
}

/** Revisa el barrido de un parámetro. */
export function validarParametro(x: unknown): Validacion<ParametroBarrido> {
  if (!esObjeto(x)) return mal('El barrido de parámetro no tiene la forma esperada.')
  if (!idValido(x.pieza)) return mal('La pieza que se barre no es válida.')
  const pieza = x.pieza
  if (x.modo === 'lista') {
    if (!Array.isArray(x.valores) || x.valores.length < 1) return mal('La lista de valores del barrido está vacía.')
    if (x.valores.length > MAX_CORRIDAS) return mal(`La lista tiene ${x.valores.length} valores y el tope es ${MAX_CORRIDAS}.`)
    const valores: number[] = []
    for (const v of x.valores) {
      const n = numeroDe(v, 'Un valor de la lista', 'unidades SI')
      if (typeof n === 'string') return mal(n)
      valores.push(n)
    }
    return bien({ pieza, modo: 'lista', valores })
  }
  if (x.modo !== 'lineal' && x.modo !== 'log') return mal('El barrido de parámetro debe ser una lista, lineal o logarítmico.')
  const n = enteroDe(x.puntos, 'El número de valores del barrido', 2, MAX_CORRIDAS)
  if (typeof n === 'string') return mal(n)
  const desde = x.modo === 'log' ? positivoDe(x.desde, 'El valor inicial del barrido logarítmico', 'unidades SI') : numeroDe(x.desde, 'El valor inicial del barrido', 'unidades SI')
  if (typeof desde === 'string') return mal(desde)
  const hasta = x.modo === 'log' ? positivoDe(x.hasta, 'El valor final del barrido logarítmico', 'unidades SI') : numeroDe(x.hasta, 'El valor final del barrido', 'unidades SI')
  if (typeof hasta === 'string') return mal(hasta)
  if (desde === hasta) return mal('El valor inicial y el final del barrido deben ser distintos.')
  return bien({ pieza, modo: x.modo, desde, hasta, puntos: n })
}

function validarTrazasElegidas(x: unknown): Validacion<TrazasElegidas> {
  if (!esObjeto(x)) return mal('Las trazas elegidas no tienen la forma esperada.')
  const redes: string[] = []
  const piezas: Id[] = []
  if (x.redes !== undefined) {
    if (!Array.isArray(x.redes)) return mal('Las redes elegidas no tienen la forma esperada.')
    if (x.redes.length > MAX_TRAZAS_ELEGIDAS) return mal(`Hay ${x.redes.length} redes elegidas y el tope es ${MAX_TRAZAS_ELEGIDAS}.`)
    for (const r of x.redes) {
      if (typeof r !== 'string') return mal('El nombre de una red elegida no es texto.')
      const n = r.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_NOMBRE_RED)
      if (n && !redes.includes(n)) redes.push(n)
    }
  }
  if (x.piezas !== undefined) {
    if (!Array.isArray(x.piezas)) return mal('Las piezas elegidas no tienen la forma esperada.')
    if (x.piezas.length > MAX_TRAZAS_ELEGIDAS) return mal(`Hay ${x.piezas.length} piezas elegidas y el tope es ${MAX_TRAZAS_ELEGIDAS}.`)
    for (const p of x.piezas) {
      if (!idValido(p)) return mal('Una pieza elegida no tiene un identificador válido.')
      if (!piezas.includes(p)) piezas.push(p)
    }
  }
  return bien({ redes, piezas })
}

/** Revisa un análisis completo (configuración, parámetro y topes de puntos). El nombre se recorta, pero limpiarlo de caracteres de control lo hace quien lo guarda. */
export function validarAnalisis(x: unknown): Validacion<AnalisisDoc> {
  if (!esObjeto(x)) return mal('El análisis no tiene la forma esperada.')
  if (!idValido(x.id)) return mal('El identificador del análisis no es válido.')
  if (typeof x.nombre !== 'string') return mal('El análisis no tiene nombre.')
  const nombre = x.nombre.trim().slice(0, MAX_NOMBRE_ANALISIS)
  const c = validarConfig(x.config)
  if (!c.ok) return c
  let parametro: ParametroBarrido | undefined
  if (x.parametro !== undefined) {
    const p = validarParametro(x.parametro)
    if (!p.ok) return p
    parametro = p.valor
  }
  let trazas: TrazasElegidas | undefined
  if (x.trazas !== undefined) {
    const t = validarTrazasElegidas(x.trazas)
    if (!t.ok) return t
    if (t.valor.redes.length > 0 || t.valor.piezas.length > 0) trazas = t.valor
  }
  let grafica: GraficaDoc | undefined
  if (x.grafica !== undefined) {
    const g = validarGrafica(x.grafica)
    if (!g.ok) return g
    if (Object.keys(g.valor).length > 0) grafica = g.valor
  }
  const corridas = parametro ? valoresDeParametro(parametro).length : 1
  const puntos = puntosDeConfig(c.valor)
  const miles = (n: number): string => Math.round(n).toLocaleString('es-MX')
  if (puntos > TOPE_PUNTOS) return mal(`El análisis pediría unos ${miles(puntos)} puntos y el tope es ${miles(TOPE_PUNTOS)}: sube el paso o acota el rango.`)
  if (puntos * corridas > TOPE_PUNTOS) {
    return mal(`Las ${corridas} corridas del barrido pedirían unos ${miles(puntos * corridas)} puntos en total y el tope es ${miles(TOPE_PUNTOS)}: baja las corridas o los puntos de cada una.`)
  }
  return bien({ id: x.id, nombre, config: c.valor, ...(parametro ? { parametro } : {}), ...(trazas ? { trazas } : {}), ...(grafica ? { grafica } : {}) })
}

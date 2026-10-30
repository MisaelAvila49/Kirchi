/** Petición de análisis (datos de la interfaz) y su traducción a un mazo de ngspice: la netlist más una tarjeta de control con solo números y nombres generados, sin texto, rutas ni órdenes de la interfaz. */
import type { NetlistMotor } from '../netlistMotor'
import { ErrorExportacion, exportarSpice, numero, type Exportacion, type OpcionesExportar } from './exportar'
import { MAX_CORRIDAS, MAX_INCLUIR_AC, MAX_PUNTOS_AC, puntosAc, puntosDc, puntosTran, TOPE_PUNTOS } from '../analisis/puntos'

/** Nombre del archivo de resultados que escribe el mazo en la carpeta de trabajo. */
export const ARCHIVO_RAW = 'salida.raw'
export const ARCHIVO_MAZO = 'mazo.cir'
export const ARCHIVO_REGISTRO = 'registro.txt'

export type AnalisisSpice =
  | { tipo: 'op' }
  /** `paso` es el paso sugerido, `maximo` el paso más largo que se permite, `inicio` el instante desde el que se guarda; `uic` parte de cero. */
  | { tipo: 'tran'; paso: number; fin: number; inicio?: number; maximo?: number; uic?: boolean }
  /** `fuente`: el índice del elemento `V` que lleva la excitación (por omisión la primera) y `magnitud` su amplitud en volts (por omisión 1). */
  | { tipo: 'ac'; barrido: 'dec' | 'oct' | 'lin'; puntos: number; desde: number; hasta: number; fuente?: number; magnitud?: number; /** Frecuencias (Hz) que el resultado contiene exactamente además de la rejilla del barrido. */ incluir?: number[] }
  /** `fuente`: el índice del elemento `V` que se barre; `segunda`, otra fuente anidada (la primera recorre su rango por cada valor de la segunda). */
  | { tipo: 'dc'; fuente: number; desde: number; hasta: number; paso: number; segunda?: { fuente: number; desde: number; hasta: number; paso: number } }

export interface OpcionesSolver {
  reltol?: number
  abstol?: number
  vntol?: number
  /** Iteraciones por paso de un transitorio y conductancia mínima: lo que se afloja para que un circuito difícil converja. */
  itl4?: number
  gmin?: number
}
const OPCIONES_SOLVER = ['reltol', 'abstol', 'vntol', 'itl4', 'gmin'] as const

/** Barrido del valor de un elemento (`R`, `C`, `L`, `V` de CD o `I`) alrededor del análisis: un `alter` dentro de un bucle de control. */
export interface ParametroSpice {
  elemento: number
  valores: number[]
}

export interface PeticionAnalisis {
  netlist: NetlistMotor
  analisis: AnalisisSpice
  solver?: OpcionesSolver
  parametro?: ParametroSpice
  /** Elementos (índices de la netlist) cuya corriente se pide además de las sondas; los que ngspice no expone se avisan. */
  corrientes?: number[]
}

/** Máximo de corrientes de elemento que se piden en una corrida. */
export const MAX_CORRIENTES = 512

const falla = (texto: string): never => {
  throw new ErrorExportacion(texto)
}

function indice(v: unknown, que: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 200_000) return falla(`${que} no es válida.`)
  return v
}

function finito(v: unknown, que: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return falla(`${que} no es un número finito.`)
  return v
}
function positivo(v: unknown, que: string): number {
  const n = finito(v, que)
  return n > 0 ? n : falla(`${que} debe ser mayor que cero.`)
}

/** Revisa la forma de lo que llegó por IPC; los valores finos los revisa el exportador. */
export function validarPeticion(x: unknown): PeticionAnalisis {
  if (typeof x !== 'object' || x === null) return falla('La petición de análisis no tiene la forma esperada.')
  const p = x as Record<string, unknown>
  if (typeof p.netlist !== 'object' || p.netlist === null) return falla('La petición no trae la netlist.')
  if (typeof p.analisis !== 'object' || p.analisis === null) return falla('La petición no trae el análisis.')
  const a = p.analisis as Record<string, unknown>
  let analisis: AnalisisSpice
  switch (a.tipo) {
    case 'op':
      analisis = { tipo: 'op' }
      break
    case 'tran': {
      const paso = positivo(a.paso, 'El paso del transitorio')
      const fin = positivo(a.fin, 'El tiempo final')
      const inicio = a.inicio === undefined ? 0 : finito(a.inicio, 'El tiempo inicial')
      if (inicio < 0 || inicio >= fin) return falla('El tiempo inicial debe estar entre 0 y el final.')
      const maximo = a.maximo === undefined ? undefined : positivo(a.maximo, 'El paso máximo')
      // Un tope de lo que el análisis puede producir: la respuesta cabe en los topes del lector.
      const puntos = puntosTran(fin, paso, maximo)
      if (puntos > TOPE_PUNTOS) return falla(`El transitorio pide unos ${Math.round(puntos)} puntos y el tope es ${TOPE_PUNTOS}: sube el paso.`)
      analisis = { tipo: 'tran', paso, fin, ...(a.inicio !== undefined ? { inicio } : {}), ...(maximo !== undefined ? { maximo } : {}), uic: a.uic === true }
      break
    }
    case 'ac': {
      if (a.barrido !== 'dec' && a.barrido !== 'oct' && a.barrido !== 'lin') return falla('El barrido de CA debe ser dec, oct o lin.')
      const puntos = positivo(a.puntos, 'El número de puntos')
      if (!Number.isInteger(puntos) || puntos > MAX_PUNTOS_AC) return falla(`El número de puntos por barrido debe ser un entero hasta ${MAX_PUNTOS_AC}.`)
      const desde = positivo(a.desde, 'La frecuencia inicial')
      const hasta = positivo(a.hasta, 'La frecuencia final')
      if (hasta <= desde) return falla('La frecuencia final debe ser mayor que la inicial.')
      let incluir: number[] | undefined
      if (a.incluir !== undefined) {
        if (!Array.isArray(a.incluir) || a.incluir.length > MAX_INCLUIR_AC) return falla(`Las frecuencias incluidas son una lista de hasta ${MAX_INCLUIR_AC}.`)
        incluir = [...new Set(a.incluir.map((f) => positivo(f, 'Una frecuencia incluida')))].sort((x, y) => x - y)
        if (incluir.some((f) => f < desde || f > hasta)) return falla('Una frecuencia incluida queda fuera del barrido.')
        if (incluir.length === 0) incluir = undefined
      }
      if (puntosAc(a.barrido, puntos, desde, hasta, incluir?.length ?? 0) > TOPE_PUNTOS) return falla('El barrido de CA pide demasiados puntos.')
      const fuente = a.fuente === undefined ? undefined : indice(a.fuente, 'La fuente de entrada de CA')
      const magnitud = a.magnitud === undefined ? undefined : positivo(a.magnitud, 'La magnitud de la entrada de CA')
      analisis = { tipo: 'ac', barrido: a.barrido, puntos, desde, hasta, ...(fuente !== undefined ? { fuente } : {}), ...(magnitud !== undefined ? { magnitud } : {}), ...(incluir ? { incluir } : {}) }
      break
    }
    case 'dc': {
      const barrido = (b: Record<string, unknown>, quien: string) => {
        const fuente = indice(b.fuente, `La fuente ${quien}`)
        const [desde, hasta, paso] = [finito(b.desde, 'El valor inicial'), finito(b.hasta, 'El valor final'), positivo(b.paso, 'El paso del barrido')]
        if (desde === hasta) return falla('El valor inicial y el final del barrido deben ser distintos.')
        return { fuente, desde, hasta, paso }
      }
      const primera = barrido(a, 'que se barre')
      let segunda: ReturnType<typeof barrido> | undefined
      if (a.segunda !== undefined) {
        if (typeof a.segunda !== 'object' || a.segunda === null) return falla('El segundo barrido de CD no tiene la forma esperada.')
        segunda = barrido(a.segunda as Record<string, unknown>, 'del segundo barrido')
        if (segunda.fuente === primera.fuente) return falla('El segundo barrido debe ser de otra fuente.')
      }
      const total = puntosDc(primera.desde, primera.hasta, primera.paso) * (segunda ? puntosDc(segunda.desde, segunda.hasta, segunda.paso) : 1)
      if (total > TOPE_PUNTOS) return falla('El barrido de CD pide demasiados puntos.')
      analisis = { tipo: 'dc', ...primera, ...(segunda ? { segunda } : {}) }
      break
    }
    default:
      return falla('El tipo de análisis no existe.')
  }
  let solver: OpcionesSolver | undefined
  if (p.solver !== undefined) {
    if (typeof p.solver !== 'object' || p.solver === null) return falla('Las opciones del solucionador no tienen la forma esperada.')
    const s = p.solver as Record<string, unknown>
    solver = {}
    for (const c of OPCIONES_SOLVER) if (s[c] !== undefined) solver[c] = positivo(s[c], `La opción ${c}`)
  }
  let parametro: ParametroSpice | undefined
  if (p.parametro !== undefined) {
    if (typeof p.parametro !== 'object' || p.parametro === null) return falla('El barrido de parámetro no tiene la forma esperada.')
    const q = p.parametro as Record<string, unknown>
    const elemento = indice(q.elemento, 'La pieza que se barre')
    if (!Array.isArray(q.valores) || q.valores.length < 1) return falla('El barrido de parámetro no trae valores.')
    if (q.valores.length > MAX_CORRIDAS) return falla(`El barrido de parámetro pide ${q.valores.length} corridas y el tope es ${MAX_CORRIDAS}.`)
    parametro = { elemento, valores: q.valores.map((v) => finito(v, 'Un valor del barrido')) }
    if (puntosDeAnalisis(analisis) * parametro.valores.length > TOPE_PUNTOS) return falla('El barrido de parámetro pide demasiados puntos en total: baja las corridas o los puntos de cada una.')
  }
  let corrientes: number[] | undefined
  if (p.corrientes !== undefined) {
    if (!Array.isArray(p.corrientes) || p.corrientes.length > MAX_CORRIENTES) return falla(`Las corrientes que se piden deben ser una lista de hasta ${MAX_CORRIENTES}.`)
    corrientes = [...new Set(p.corrientes.map((c) => indice(c, 'Un elemento de las corrientes')))]
  }
  return { netlist: p.netlist as NetlistMotor, analisis, ...(solver ? { solver } : {}), ...(parametro ? { parametro } : {}), ...(corrientes ? { corrientes } : {}) }
}

/** Puntos que produce una corrida del análisis. */
export function puntosDeAnalisis(a: AnalisisSpice): number {
  switch (a.tipo) {
    case 'op':
      return 1
    case 'tran':
      return puntosTran(a.fin, a.paso, a.maximo)
    case 'ac':
      return puntosAc(a.barrido, a.puntos, a.desde, a.hasta, a.incluir?.length ?? 0)
    case 'dc':
      return puntosDc(a.desde, a.hasta, a.paso) * (a.segunda ? puntosDc(a.segunda.desde, a.segunda.hasta, a.segunda.paso) : 1)
  }
}

export interface Mazo {
  /** El texto de `mazo.cir`. */
  texto: string
  /** Archivos que el mazo lee, junto a él. */
  archivos: Record<string, string>
  exportacion: Exportacion
}

/** El nombre en la netlist de un elemento que se puede barrer, o por qué no. */
function elementoBarrible(netlist: NetlistMotor, k: number): { nombre: string; positivo: boolean } {
  const e = netlist.elements[k] as unknown as { type?: unknown; wave?: { kind?: unknown } } | undefined
  if (!e) return falla('La pieza que se barre no está en el circuito.')
  switch (e.type) {
    case 'R':
      return { nombre: `r${k}`, positivo: true }
    case 'C':
      return { nombre: `c${k}`, positivo: true }
    case 'L':
      return { nombre: `l${k}`, positivo: true }
    case 'V':
      if (e.wave?.kind !== 'dc') return falla('Solo se barre el valor de una fuente de voltaje de CD.')
      return { nombre: `v${k}`, positivo: false }
    case 'I':
      return { nombre: `i${k}`, positivo: false }
    default:
      return falla('Solo se barre el valor de una resistencia, un capacitor, un inductor o una fuente.')
  }
}

function fuenteDeVoltaje(netlist: NetlistMotor, k: number, que: string): string {
  const el = netlist.elements[k] as unknown as { type?: unknown } | undefined
  if (!el || el.type !== 'V') return falla(`${que} no es una fuente de voltaje.`)
  return `v${k}`
}

/** Algún capacitor o inductor trae condición inicial: ngspice solo la respeta con `uic`. */
function conCondicionesIniciales(netlist: NetlistMotor): boolean {
  return netlist.elements.some((e) => (e.type === 'C' || e.type === 'L') && e.ic !== undefined)
}

/** Arma el mazo de ngspice de una petición ya validada: netlist, opciones, tarjeta de análisis, sondas y escritura del `raw` ASCII. */
export function armarMazo(p: PeticionAnalisis, opciones: OpcionesExportar = {}): Mazo {
  const a = p.analisis
  const fuenteAc = a.tipo === 'ac' ? (a.fuente ?? opciones.fuenteAc ?? primeraFuente(p.netlist)) : undefined
  if (a.tipo === 'ac' && fuenteAc === undefined) falla('El análisis de CA necesita una fuente de voltaje que lo excite.')
  if (a.tipo === 'ac') fuenteDeVoltaje(p.netlist, fuenteAc!, 'La entrada de CA')
  const exportacion = exportarSpice(p.netlist, { ...opciones, ...(fuenteAc !== undefined ? { fuenteAc, magnitudAc: a.tipo === 'ac' ? (a.magnitud ?? 1) : 1 } : {}) })
  const s: OpcionesSolver = { reltol: 1e-4, abstol: 1e-12, vntol: 1e-7, ...p.solver }
  const ops = [...OPCIONES_SOLVER.filter((c) => s[c] !== undefined).map((c) => `${c}=${numero(s[c]!)}`), ...exportacion.opciones]
  const paso = (desde: number, hasta: number, tam: number): string => numero(hasta < desde ? -tam : tam)
  let tarjeta: string
  switch (a.tipo) {
    case 'op':
      tarjeta = 'op'
      break
    case 'tran':
      tarjeta = `tran ${numero(a.paso)} ${numero(a.fin)} ${numero(a.inicio ?? 0)} ${numero(a.maximo ?? a.paso)}${a.uic || conCondicionesIniciales(p.netlist) ? ' uic' : ''}`
      break
    case 'ac':
      tarjeta = `ac ${a.barrido} ${numero(a.puntos)} ${numero(a.desde)} ${numero(a.hasta)}`
      break
    case 'dc': {
      const n1 = fuenteDeVoltaje(p.netlist, a.fuente, 'La fuente que se barre')
      tarjeta = `dc ${n1} ${numero(a.desde)} ${numero(a.hasta)} ${paso(a.desde, a.hasta, a.paso)}`
      if (a.segunda) {
        const n2 = fuenteDeVoltaje(p.netlist, a.segunda.fuente, 'La segunda fuente que se barre')
        tarjeta += ` ${n2} ${numero(a.segunda.desde)} ${numero(a.segunda.hasta)} ${paso(a.segunda.desde, a.segunda.hasta, a.segunda.paso)}`
      }
      break
    }
  }
  const guardar = exportacion.sondas.flatMap((x) => x.guardar)
  const avisos = [...exportacion.avisos]
  const lets = exportacion.sondas.filter((x) => x.expresion !== null).map((x) => `let ${x.nombre} = ${x.expresion}`)
  for (const k of p.corrientes ?? []) {
    const expresion = exportacion.corrienteDeElemento.get(k)
    if (expresion === undefined) {
      avisos.push(`La corriente del elemento ${k + 1} no se puede medir con ngspice.`)
      continue
    }
    if (expresion.startsWith('@')) guardar.push(expresion)
    lets.push(`let corr${k} = ${expresion}`)
  }
  // Con frecuencias incluidas, además de la rejilla se corre un punto exacto por cada una (ngspice no tiene barrido por lista)
  // y el servicio une los gráficos en uno solo (`unirBarridosAc`).
  const tarjetas = a.tipo === 'ac' && a.incluir?.length ? [tarjeta, ...a.incluir.map((f) => `ac lin 1 ${numero(f)} ${numero(f)}`)] : [tarjeta]
  const corrida = tarjetas.flatMap((t) => [t, ...lets, `write ${ARCHIVO_RAW}`])
  let cuerpoControl: string[]
  if (p.parametro) {
    const b = elementoBarrible(p.netlist, p.parametro.elemento)
    for (const v of p.parametro.valores) if (b.positivo && !(v > 0)) falla('El valor de una resistencia, un capacitor o un inductor debe ser mayor que cero.')
    // Un gráfico por valor, todos en el mismo archivo.
    cuerpoControl = [`foreach par ${p.parametro.valores.map((v) => numero(v)).join(' ')}`, `alter ${b.nombre} = $par`, ...corrida, 'end']
  } else {
    cuerpoControl = corrida
  }
  const lineas = [
    '* mazo de Kirchi',
    exportacion.cuerpo.trimEnd(),
    `.options ${ops.join(' ')}`,
    '.control',
    'set filetype=ascii',
    ...(p.parametro || tarjetas.length > 1 ? ['set appendwrite'] : []),
    guardar.length > 0 ? `save all ${guardar.join(' ')}` : 'save all',
    ...cuerpoControl,
    '.endc',
    '.end'
  ]
  return { texto: lineas.join('\n') + '\n', archivos: exportacion.archivos, exportacion: { ...exportacion, avisos } }
}

function primeraFuente(n: NetlistMotor): number | undefined {
  const i = n.elements.findIndex((e) => (e as { type?: unknown }).type === 'V')
  return i < 0 ? undefined : i
}

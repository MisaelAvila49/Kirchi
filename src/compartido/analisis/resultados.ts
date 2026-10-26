/** De los vectores de ngspice a series con nombres y unidades de Kirchi. CA sale como magnitud en dB y fase en grados, y Fourier como magnitudes y fases de los armónicos con su THD. */
import type { GraficoResultado, VectorResultado } from '../ngspice'
import { puntosPorPeriodo, type AnalisisDoc, type ConfigAnalisis } from './config'
import { puntosDc } from './puntos'
import { fourier, TOPE_OPERACIONES_FOURIER, type ResultadoFourier } from './fourier'

export interface Nombres {
  /** Redes con nombre del documento: nodo del motor → nombre. */
  redes: ReadonlyMap<number, string>
  /** Nodos que son rieles de alimentación: aunque tengan nombre, no salen por omisión (sí si se piden). */
  rieles?: ReadonlySet<number>
  /** Todas las redes (con su nombre automático) para pedirlas a mano. */
  todasLasRedes?: ReadonlyMap<number, string>
  /** Referencia de la pieza de cada elemento de la netlist (`R1`). */
  elementos: readonly (string | undefined)[]
  /** Las sondas de `netlist.sondas`, en orden: nombre que les puso el usuario y qué miden. */
  sondas: readonly { nombre: string; tipo: 'v' | 'i' | 'd' }[]
  /** Referencia de una pieza por id (para rotular los ejes de un barrido). */
  pieza?: (id: string) => string
  /** Qué barre el parámetro: el rótulo de la pieza (`R1`) y su unidad SI (`Ω`). */
  parametro?: { etiqueta: string; unidad: string }
}

export interface Seleccion {
  /** Nodos del motor cuyo voltaje se pide además de los de omisión. */
  redes?: number[]
  /** Elementos de la netlist (índices) cuya corriente se pide. */
  corrientes?: number[]
}

export interface Serie {
  /** `v:<nodo>`, `i:<elemento>` o `s:<sonda>`. */
  id: string
  etiqueta: string
  /** Lo que se grafica: `V`, `A` o `dB` en CA. */
  unidad: string
  /** Lo que mide, sea cual sea la unidad en que se grafica: `V` o `A`. */
  magnitud: 'V' | 'A'
  valores: Float64Array
  /** Solo en CA: la fase en grados, continua (sin saltos de 360). */
  fase?: Float64Array
}

export interface SerieFourier extends ResultadoFourier {
  id: string
  etiqueta: string
  unidad: string
}

export interface Corrida {
  /** Qué distingue esta corrida (`R1 = 2 kΩ`); vacío si es la única. */
  etiqueta: string
  eje: Float64Array
  series: Serie[]
  fourier?: SerieFourier[]
}

export interface ResultadoMapeado {
  tipo: ConfigAnalisis['tipo']
  ejeNombre: string
  ejeUnidad: string
  /** El eje x es logarítmico por naturaleza (CA por décadas u octavas, barrido logarítmico de parámetro). */
  logX: boolean
  /** Solo en CA: la magnitud de la fuente que excita el circuito (V); la ganancia en dB se mide respecto a ella. */
  magnitudAc?: number
  corridas: Corrida[]
  avisos: string[]
}

const PREFIJOS: [number, string][] = [[1e12, 'T'], [1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p'], [1e-15, 'f']]

/** Un valor con prefijo SI (`2 kΩ`, `159.15 nF`). */
export function conUnidad(v: number, unidad: string): string {
  if (v === 0 || !Number.isFinite(v)) return `${v} ${unidad}`
  const a = Math.abs(v)
  const [escala, prefijo] = PREFIJOS.find(([e]) => a >= e * 0.9995) ?? PREFIJOS[PREFIJOS.length - 1]
  return `${Number((v / escala).toPrecision(4))} ${prefijo}${unidad}`
}

const unidadFisica = (u: string): 'V' | 'A' => (u === 'current' ? 'A' : 'V')

interface Elegido {
  id: string
  etiqueta: string
  magnitud: 'V' | 'A'
  vector: VectorResultado
}

/** Los vectores de un gráfico que se mapean, en orden: redes con nombre, sondas, luego lo pedido. */
function elegir(g: GraficoResultado, nombres: Nombres, sel: Seleccion, avisos: string[]): Elegido[] {
  const porId = new Map<string, Elegido>()
  const nodos: Elegido[] = []
  const sondas: Elegido[] = []
  const elementos: Elegido[] = []
  const redPedida = new Set(sel.redes ?? [])
  const corrientePedida = new Set(sel.corrientes ?? [])
  const nombreRed = (n: number): string => nombres.redes.get(n) ?? nombres.todasLasRedes?.get(n) ?? `Red ${n}`
  const candidatosAlternos: Elegido[] = []
  for (const vector of g.vectores) {
    const r = vector.referencia
    if (r.tipo === 'nodo') {
      const e: Elegido = { id: `v:${r.nodo}`, etiqueta: `V(${nombreRed(r.nodo)})`, magnitud: 'V', vector }
      // Un riel de alimentación con nombre (+15V, VCC) no es lo que se quiere ver: solo sale si se pide.
      if ((nombres.redes.has(r.nodo) && !nombres.rieles?.has(r.nodo)) || redPedida.has(r.nodo)) nodos.push(e)
      else candidatosAlternos.push(e)
    } else if (r.tipo === 'sonda') {
      const s = nombres.sondas[r.indice]
      if (s && s.tipo !== 'd') sondas.push({ id: `s:${r.indice}`, etiqueta: s.nombre, magnitud: s.tipo === 'i' ? 'A' : 'V', vector })
    } else if (r.tipo === 'elemento') {
      const ref = nombres.elementos[r.indice] ?? `elemento ${r.indice + 1}`
      if (corrientePedida.has(r.indice)) elementos.push({ id: `i:${r.indice}`, etiqueta: `I(${ref})`, magnitud: 'A', vector })
    }
  }
  const todos = [...nodos, ...sondas, ...elementos]
  if (todos.length === 0 && candidatosAlternos.length > 0) {
    // Sin redes con nombre ni sondas: las redes que no son rieles (pocas) o, si todas lo son, todas.
    const sinRieles = candidatosAlternos.filter((e) => !nombres.rieles?.has(Number(e.id.slice(2))))
    const base = sinRieles.length > 0 ? sinRieles : candidatosAlternos
    const aviso = base.length > TOPE_SIN_NOMBRES ? AVISO_MUCHAS_REDES : AVISO_SIN_NOMBRES
    if (!avisos.includes(aviso)) avisos.push(aviso)
    todos.push(...base.slice(0, TOPE_SIN_NOMBRES))
  }
  for (const e of todos) if (!porId.has(e.id)) porId.set(e.id, e)
  return [...porId.values()]
}
const AVISO_SIN_NOMBRES = 'El circuito no tiene redes con nombre ni sondas: se muestran todas las redes.'
const TOPE_SIN_NOMBRES = 8
const AVISO_MUCHAS_REDES = 'El circuito no tiene redes con nombre ni sondas y tiene muchas redes: se muestran las primeras ocho. Pon una etiqueta «Salida» o elige las trazas.'

/** Magnitud en dB (con piso de -400 dB) y fase en grados continua. */
function aDbYFase(v: VectorResultado): { db: Float64Array; fase: Float64Array } {
  const n = v.re.length
  const db = new Float64Array(n)
  const fase = new Float64Array(n)
  let anterior = 0
  let desfase = 0
  for (let i = 0; i < n; i++) {
    const re = v.re[i]
    const im = v.im ? v.im[i] : 0
    db[i] = Math.max(-400, 20 * Math.log10(Math.hypot(re, im) || 1e-20))
    let f = (Math.atan2(im, re) * 180) / Math.PI
    if (i > 0) {
      while (f + desfase - anterior > 180) desfase -= 360
      while (f + desfase - anterior < -180) desfase += 360
    }
    fase[i] = f + desfase
    anterior = fase[i]
  }
  return { db, fase }
}

function series(g: GraficoResultado, nombres: Nombres, sel: Seleccion, ac: boolean, avisos: string[]): Serie[] {
  return elegir(g, nombres, sel, avisos).map((e) => {
    if (ac) {
      const { db, fase } = aDbYFase(e.vector)
      return { id: e.id, etiqueta: e.etiqueta, unidad: 'dB', magnitud: e.magnitud, valores: db, fase }
    }
    return { id: e.id, etiqueta: e.etiqueta, unidad: e.magnitud, magnitud: e.magnitud, valores: e.vector.re }
  })
}

const escalaDe = (g: GraficoResultado): Float64Array => g.vectores.find((v) => v.referencia.tipo === 'escala')?.re ?? g.vectores[0].re

/** Los valores de una fuente barrida, con el signo del barrido. */
function valoresDeBarrido(desde: number, hasta: number, paso: number): number[] {
  const n = Math.floor(Math.abs(hasta - desde) / paso + 1e-9) + 1
  const signo = hasta < desde ? -1 : 1
  return Array.from({ length: n }, (_, i) => desde + signo * paso * i)
}

/** Mapea los gráficos de ngspice de un análisis. `valoresParametro` son los del barrido de parámetro, en el orden de las corridas. */
export function mapearResultados(a: AnalisisDoc, graficos: GraficoResultado[], nombres: Nombres, valoresParametro: readonly number[] = [], sel: Seleccion = {}): ResultadoMapeado {
  const c = a.config
  const avisos: string[] = []
  const ac = c.tipo === 'ac'
  const logX = (ac && c.barrido !== 'lin') || (a.parametro?.modo === 'log' && c.tipo === 'op')
  const base = { tipo: c.tipo, avisos }
  const etiquetaParametro = (i: number): string => (nombres.parametro && valoresParametro[i] !== undefined ? `${nombres.parametro.etiqueta} = ${conUnidad(valoresParametro[i], nombres.parametro.unidad)}` : '')

  if (a.parametro && graficos.length !== valoresParametro.length) avisos.push(`ngspice entregó ${graficos.length} corridas y se pidieron ${valoresParametro.length}.`)

  // Punto de operación con barrido de parámetro: una sola curva contra el valor de la pieza.
  if (c.tipo === 'op' && a.parametro) {
    const porId = new Map<string, Serie>()
    const n = graficos.length
    graficos.forEach((g, i) => {
      for (const s of series(g, nombres, sel, false, avisos)) {
        let acumulada = porId.get(s.id)
        if (!acumulada) {
          acumulada = { ...s, valores: new Float64Array(n) }
          porId.set(s.id, acumulada)
        }
        acumulada.valores[i] = s.valores[0]
      }
    })
    return { ...base, tipo: c.tipo, ejeNombre: nombres.parametro?.etiqueta ?? 'Parámetro', ejeUnidad: nombres.parametro?.unidad ?? '', logX, corridas: [{ etiqueta: '', eje: Float64Array.from(valoresParametro.slice(0, n)), series: [...porId.values()] }] }
  }

  const corridas: Corrida[] = []
  graficos.forEach((g, i) => {
    const eje = c.tipo === 'op' ? new Float64Array(1) : escalaDe(g)
    const ss = series(g, nombres, sel, ac, avisos)
    const etiqueta = a.parametro ? etiquetaParametro(i) : ''
    if (c.tipo === 'dc' && c.segunda) {
      const segundos = valoresDeBarrido(c.segunda.desde, c.segunda.hasta, c.segunda.paso)
      // Cada corrida es un barrido completo de la primera fuente: sus puntos salen de su configuración, no de dividir el eje.
      const interior = puntosDc(c.desde, c.hasta, c.paso)
      const esperado = interior * segundos.length
      const aviso = `El barrido anidado entregó ${eje.length} puntos y se esperaban ${esperado} (${interior} por cada valor de la segunda fuente): las curvas pueden estar incompletas.`
      if (eje.length !== esperado && !avisos.includes(aviso)) avisos.push(aviso)
      const rotulo = nombres.pieza?.(c.segunda.fuente) ?? 'segunda fuente'
      segundos.forEach((v, j) => {
        const desde = j * interior
        if (desde >= eje.length) return
        corridas.push({
          etiqueta: [etiqueta, `${rotulo} = ${conUnidad(v, 'V')}`].filter(Boolean).join(', '),
          eje: eje.slice(desde, desde + interior),
          series: ss.map((s) => ({ ...s, valores: s.valores.slice(desde, desde + interior) }))
        })
      })
      return
    }
    const corrida: Corrida = { etiqueta, eje, series: ss }
    if (c.tipo === 'fourier') {
      const ppp = puntosPorPeriodo(c.armonicos)
      corrida.fourier = []
      let presupuesto = 4 * TOPE_OPERACIONES_FOURIER
      for (const s of ss) {
        const costo = c.armonicos * c.periodos * ppp
        presupuesto -= costo
        if (presupuesto < 0) {
          avisos.push(`${s.etiqueta}: no se calculó el Fourier porque el total de señales pide demasiado cálculo. Elige menos señales.`)
          continue
        }
        try {
          corrida.fourier.push({ id: s.id, etiqueta: s.etiqueta, unidad: s.unidad, ...fourier(eje, s.valores, { fundamental: c.fundamental, armonicos: c.armonicos, periodos: c.periodos, ventana: c.ventana, puntosPorPeriodo: ppp }) })
        } catch (e) {
          avisos.push(`${s.etiqueta}: ${e instanceof Error ? e.message : String(e)}`)
        }
      }
    }
    corridas.push(corrida)
  })

  const eje: Record<ConfigAnalisis['tipo'], [string, string]> = {
    op: ['', ''],
    dc: [c.tipo === 'dc' ? `Voltaje de ${nombres.pieza?.(c.fuente) ?? 'la fuente'}` : '', 'V'],
    ac: ['Frecuencia', 'Hz'],
    tran: ['Tiempo', 's'],
    fourier: ['Tiempo', 's']
  }
  return { ...base, tipo: c.tipo, ejeNombre: eje[c.tipo][0], ejeUnidad: eje[c.tipo][1], logX, ...(c.tipo === 'ac' ? { magnitudAc: c.magnitud } : {}), corridas }
}

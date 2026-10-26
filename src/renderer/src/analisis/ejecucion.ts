/** Corre un análisis de ngspice por el IPC (la única vía). Todo error vuelve como resultado con mensaje: nunca lanza ni
 * espera lo que el IPC no contestará. */
import { valoresDeParametro, type AnalisisDoc, type TrazasElegidas } from '../../../compartido/analisis/config'
import { peticionDe } from '../../../compartido/analisis/peticion'
import { mapearResultados, type ResultadoMapeado, type Seleccion } from '../../../compartido/analisis/resultados'
import type { ApiNgspice, ResultadoAnalisis } from '../../../compartido/ngspice'
import type { Id } from '../doc/tipos'
import { salePorOmision, terminalesDe, type ContextoAnalisis } from './contexto'

/** Lo que el lector eligió graficar además de lo que sale por omisión: nodos de la netlist y piezas cuya corriente se pide. */
export interface SeleccionTrazas {
  redes: ReadonlySet<number>
  piezas: ReadonlySet<Id>
}
export const SIN_TRAZAS: SeleccionTrazas = { redes: new Set(), piezas: new Set() }

/** Las trazas guardadas en el análisis (redes por nombre) a nodos del circuito actual; una red que ya no existe se ignora. */
export function seleccionDeGuardadas(t: TrazasElegidas | undefined, ctx: Pick<ContextoAnalisis, 'redes'> | null): SeleccionTrazas {
  if (!t || !ctx) return SIN_TRAZAS
  const nombres = new Set(t.redes)
  return { redes: new Set(ctx.redes.filter((r) => nombres.has(r.nombre)).map((r) => r.nodo)), piezas: new Set(t.piezas) }
}

/** La selección a lo que se guarda en el documento: redes por nombre (el nodo del motor cambia con cada edición), sin las que ya salen por omisión. */
export function guardadasDeSeleccion(sel: SeleccionTrazas, ctx: Pick<ContextoAnalisis, 'redes'>): TrazasElegidas | undefined {
  const redes = ctx.redes.filter((r) => sel.redes.has(r.nodo) && !salePorOmision(r)).map((r) => r.nombre)
  const piezas = [...sel.piezas]
  return redes.length === 0 && piezas.length === 0 ? undefined : { redes, piezas }
}

export interface FilaRed {
  nodo: number
  nombre: string
  conNombre: boolean
  voltaje: number
}
export interface FilaPieza {
  pieza: Id
  ref: string
  /** Sentido de ngspice: positiva si entra por el terminal a (o por el + de una fuente). */
  corriente: number
  /** Potencia absorbida (V × I); negativa si la pieza entrega. null si no se puede calcular. */
  potencia: number | null
}
export interface TablaOperacion {
  redes: FilaRed[]
  piezas: FilaPieza[]
  /** Voltaje de cada red del documento (id de red → V), para los chips del lienzo. */
  voltajePorRed: Map<number, number>
}

export type ClaseError = 'cancelado' | 'tiempo' | 'convergencia' | 'ausente' | 'pieza' | 'otro'

export type ResultadoEjecucion =
  | { ok: true; mapeado: ResultadoMapeado; tabla: TablaOperacion | null; avisos: string[]; duracionMs: number }
  | { ok: false; error: string; clase: ClaseError }

const PATRON_CONVERGENCIA = /singular matrix|timestep too small|doanalyses|no convergence|iteration limit|gmin stepping|source stepping/i

/** El mensaje que ve el usuario para un fallo del IPC, y de qué clase es. */
export function explicarFallo(r: Extract<ResultadoAnalisis, { ok: false }>): { error: string; clase: ClaseError } {
  if (r.cancelado) return { error: 'Análisis cancelado.', clase: 'cancelado' }
  if (r.tiempoAgotado) return { error: r.error, clase: 'tiempo' }
  if (/no está instalado|no se encontró ngspice|no se pudo (iniciar|ejecutar) ngspice|ENOENT/i.test(r.error)) return { error: r.error, clase: 'ausente' }
  if (PATRON_CONVERGENCIA.test(r.error)) {
    const detalle = [...new Set(r.error.replace(/^ngspice no produjo resultados:\s*/i, '').replace(/\.$/, '').split(/\s*\|\s*/))].slice(0, 2).join('; ')
    return { error: `El análisis no converge (${detalle}). Revisa que haya una tierra y un camino de CD en cada red, o prueba con otro paso.`, clase: 'convergencia' }
  }
  return { error: r.error, clase: 'otro' }
}

/** La tabla del punto de operación: voltaje de cada red y corriente y potencia de cada pieza. */
export function tablaOperacion(m: ResultadoMapeado, ctx: ContextoAnalisis): TablaOperacion {
  const series = new Map(m.corridas[0]?.series.map((s) => [s.id, s.valores[0]]) ?? [])
  const voltaje = (nodo: number): number | undefined => (nodo === 0 ? 0 : series.get(`v:${nodo}`))
  const redes: FilaRed[] = []
  const voltajePorRed = new Map<number, number>()
  for (const r of ctx.redes) {
    const v = voltaje(r.nodo)
    if (v === undefined) continue
    redes.push({ nodo: r.nodo, nombre: r.nombre, conNombre: r.conNombre, voltaje: v })
    voltajePorRed.set(r.red, v)
  }
  for (const [red, nodo] of ctx.nodoDeRed) if (nodo === 0) voltajePorRed.set(red, 0)
  const piezas: FilaPieza[] = []
  for (const c of ctx.corrientes) {
    const i = series.get(`i:${c.elemento}`)
    if (i === undefined) continue
    const t = terminalesDe(ctx.netlist.elements[c.elemento])
    const va = t ? voltaje(t[0]) : undefined
    const vb = t ? voltaje(t[1]) : undefined
    piezas.push({ pieza: c.pieza, ref: c.ref, corriente: i, potencia: va !== undefined && vb !== undefined ? (va - vb) * i : null })
  }
  return { redes, piezas, voltajePorRed }
}

/** Qué redes y corrientes se piden a ngspice para este análisis. */
export function seleccionDe(a: AnalisisDoc, ctx: ContextoAnalisis, sel: SeleccionTrazas): { mapeo: Seleccion; corrientes: number[] } {
  const completo = a.config.tipo === 'op' && !a.parametro
  if (completo) {
    return { mapeo: { redes: ctx.redes.map((r) => r.nodo), corrientes: ctx.corrientes.map((c) => c.elemento) }, corrientes: ctx.corrientes.map((c) => c.elemento) }
  }
  const corrientes = ctx.corrientes.filter((c) => sel.piezas.has(c.pieza)).map((c) => c.elemento)
  return { mapeo: { redes: [...sel.redes], corrientes }, corrientes }
}

export async function correrAnalisis(a: AnalisisDoc, ctx: ContextoAnalisis, sel: SeleccionTrazas, api: Pick<ApiNgspice, 'ejecutar'> | undefined): Promise<ResultadoEjecucion> {
  if (!api) return { ok: false, error: 'ngspice no está disponible en esta ventana: los análisis solo corren en la aplicación.', clase: 'ausente' }
  const inicio = Date.now()
  const { mapeo, corrientes } = seleccionDe(a, ctx, sel)
  const p = peticionDe(a, { netlist: ctx.netlist, piezaDeElemento: ctx.piezaDeElemento, nombreDePieza: ctx.nombres.pieza }, { corrientes })
  if (!p.ok) return { ok: false, error: p.error, clase: 'pieza' }
  let res: ResultadoAnalisis
  try {
    res = await api.ejecutar(p.peticion)
  } catch (e) {
    return { ok: false, error: `No se pudo hablar con ngspice: ${e instanceof Error ? e.message : String(e)}`, clase: 'otro' }
  }
  if (!res.ok) return { ok: false, ...explicarFallo(res) }
  try {
    const barrible = a.parametro ? ctx.barribles.find((b) => b.id === a.parametro!.pieza) : undefined
    const valores = a.parametro ? valoresDeParametro(a.parametro) : []
    const nombres = { ...ctx.nombres, ...(barrible ? { parametro: { etiqueta: barrible.ref, unidad: barrible.unidad } } : {}) }
    const mapeado = mapearResultados(a, res.graficos, nombres, valores, mapeo)
    const tabla = a.config.tipo === 'op' && !a.parametro ? tablaOperacion(mapeado, ctx) : null
    return { ok: true, mapeado, tabla, avisos: [...res.avisos, ...mapeado.avisos], duracionMs: res.duracionMs ?? Date.now() - inicio }
  } catch (e) {
    return { ok: false, error: `No se pudieron leer los resultados: ${e instanceof Error ? e.message : String(e)}`, clase: 'otro' }
  }
}

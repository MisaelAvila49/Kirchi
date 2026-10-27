import type { AnalisisDoc } from '../../../compartido/analisis/config'
import type { PeticionAnalisis, ResultadoAnalisis } from '../../../compartido/ngspice'
import type { Conexiones } from '../conexiones/conexiones'
import type { Documento } from '../doc/tipos'
import type { PiezaDef } from '../piezas/tipos'
import { armarContexto } from '../analisis/contexto'
import { correrAnalisis, seleccionDeGuardadas, type ResultadoEjecucion, type TablaOperacion } from '../analisis/ejecucion'

/** Quien corre ngspice: en Electron el servicio real con una ventana ficticia, en pruebas el mismo servicio. */
export type EjecutorAnalisis = (peticion: PeticionAnalisis) => Promise<ResultadoAnalisis>

export const MAX_PUNTOS_ANALISIS = 2000

export interface SerieResumen {
  nombre: string
  unidad: string
  min: number
  max: number
  /** Hasta `MAX_PUNTOS_ANALISIS` valores diezmados a paso fijo. */
  valores: number[]
  /** Solo en CA: fase en grados, con el mismo diezmado. */
  fase?: number[]
}

export interface CorridaResumen {
  etiqueta: string
  eje: { min: number; max: number; puntos: number; valores: number[] }
  series: SerieResumen[]
}

export type ResultadoResumen =
  | { ok: true; tipo: string; ejeNombre: string; ejeUnidad: string; corridas: CorridaResumen[]; tabla: TablaOperacion | null; avisos: string[] }
  | { ok: false; error: string }

function diezmar(x: ArrayLike<number>): number[] {
  const n = x.length
  if (n <= MAX_PUNTOS_ANALISIS) return Array.from(x, (v) => Number(v.toPrecision(8)))
  return Array.from({ length: MAX_PUNTOS_ANALISIS }, (_, k) => Number(x[Math.round((k * (n - 1)) / (MAX_PUNTOS_ANALISIS - 1))].toPrecision(8)))
}

function extremos(x: ArrayLike<number>): { min: number; max: number } {
  let min = Infinity, max = -Infinity
  for (let i = 0; i < x.length; i++) {
    if (x[i] < min) min = x[i]
    if (x[i] > max) max = x[i]
  }
  return { min, max }
}

/** Corre un análisis del documento y entrega el resultado completo (el que dibuja la gráfica). `etiquetas` rotula con un
 * texto legible, como «R2.2», las trazas de redes que no tienen nombre (red del documento a su rótulo). */
export async function ejecutarDocumento(doc: Documento, lib: Map<string, PiezaDef>, con: Conexiones, a: AnalisisDoc, ejecutor: EjecutorAnalisis | undefined, etiquetas?: ReadonlyMap<number, string>): Promise<ResultadoEjecucion> {
  const c = armarContexto(doc, lib, con)
  if (!c.ok) return { ok: false, error: c.error, clase: 'otro' }
  let ctx = c.ctx
  if (etiquetas && etiquetas.size > 0) {
    const todas = new Map(ctx.nombres.todasLasRedes ?? [])
    for (const [red, texto] of etiquetas) {
      const nodo = ctx.nodoDeRed.get(red)
      if (nodo !== undefined && nodo > 0) todas.set(nodo, texto)
    }
    ctx = { ...ctx, nombres: { ...ctx.nombres, todasLasRedes: todas } }
  }
  return correrAnalisis(a, ctx, seleccionDeGuardadas(a.trazas, ctx), ejecutor ? { ejecutar: ejecutor } : undefined)
}

/** Corre un análisis guardado del documento por el ejecutor inyectado y lo resume con nombres y unidades. */
export async function analizarDocumento(doc: Documento, lib: Map<string, PiezaDef>, con: Conexiones, a: AnalisisDoc, ejecutor: EjecutorAnalisis | undefined, etiquetas?: ReadonlyMap<number, string>): Promise<ResultadoResumen> {
  const r = await ejecutarDocumento(doc, lib, con, a, ejecutor, etiquetas)
  if (!r.ok) return { ok: false, error: r.error }
  const m = r.mapeado
  const corridas = m.corridas.map((q): CorridaResumen => ({
    etiqueta: q.etiqueta,
    eje: { ...extremos(q.eje), puntos: q.eje.length, valores: diezmar(q.eje) },
    series: q.series.map((s) => ({
      nombre: s.etiqueta,
      unidad: s.unidad,
      ...extremos(s.valores),
      valores: diezmar(s.valores),
      ...(s.fase ? { fase: diezmar(s.fase) } : {})
    }))
  }))
  return { ok: true, tipo: m.tipo, ejeNombre: m.ejeNombre, ejeUnidad: m.ejeUnidad, corridas, tabla: r.tabla, avisos: r.avisos }
}

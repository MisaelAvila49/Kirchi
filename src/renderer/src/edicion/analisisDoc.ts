import type { AnalisisDoc } from '../../../compartido/analisis/config'
import type { Conexiones } from '../conexiones/conexiones'
import { leerAnalisis } from '../doc/analisis'
import type { GeneradorId } from '../doc/ids'
import type { Documento } from '../doc/tipos'
import type { PiezaDef } from '../piezas/tipos'
import { nombresDeRedes } from '../conexiones/listaDeRedes'
import { piezaPorRef, resolverRed, sinPieza } from './referencias'

/** Un análisis como lo pide el asistente: las fuentes y piezas por referencia (V1) y las trazas por patilla, red o nombre. */
export interface EntradaAnalisis {
  id?: string
  nombre: string
  config: unknown
  parametro?: unknown
  /** Redes a graficar: «R2.2», «U1.OUT», «red de R1.1» o el nombre de una red, con o sin nombre puesto. */
  trazas?: string[]
  /** Piezas cuya corriente se grafica, por referencia. */
  corrientes?: string[]
}

export type ArmadoAnalisis = { ok: true; analisis: AnalisisDoc; etiquetas: Map<number, string>; avisos: string[] } | { ok: false; motivo: string }

type Campos = Record<string, unknown>
const esObjeto = (x: unknown): x is Campos => typeof x === 'object' && x !== null && !Array.isArray(x)

/** El análisis del documento con ids en lugar de referencias, las trazas pedidas resueltas a redes y, por cada red sin
 * nombre, la etiqueta legible («R2.2») con que se rotula su traza. */
export function armarAnalisis(est: { doc: Documento; lib: Map<string, PiezaDef>; con: Conexiones; gen: GeneradorId }, e: EntradaAnalisis): ArmadoAnalisis {
  const { doc } = est
  const idDe = (ref: unknown): string | { motivo: string } => {
    const p = typeof ref === 'string' ? piezaPorRef(doc, ref) : undefined
    return p ? p.id : { motivo: typeof ref === 'string' ? sinPieza(ref.slice(0, 40)) : 'Falta la referencia de una pieza.' }
  }
  const traducir = (o: unknown, campo: string): { valor: Campos } | { motivo: string } => {
    if (!esObjeto(o)) return { motivo: 'El análisis no tiene la forma esperada.' }
    const c = { ...o }
    if (campo in c) {
      const id = idDe(c[campo])
      if (typeof id !== 'string') return id
      c[campo] = id
    }
    return { valor: c }
  }
  const cfg = traducir(e.config, 'fuente')
  if ('motivo' in cfg) return { ok: false, motivo: cfg.motivo }
  const config = cfg.valor
  if (esObjeto(config.segunda)) {
    const s = traducir(config.segunda, 'fuente')
    if ('motivo' in s) return { ok: false, motivo: s.motivo }
    config.segunda = s.valor
  }
  let parametro: Campos | undefined
  if (e.parametro !== undefined) {
    const p = traducir(e.parametro, 'pieza')
    if ('motivo' in p) return { ok: false, motivo: p.motivo }
    parametro = p.valor
  }

  const t = resolverTrazas(est, e.trazas, e.corrientes)
  if ('motivo' in t) return { ok: false, motivo: t.motivo }
  const { redes, piezas, etiquetas, avisos } = t
  const crudo = { id: e.id ?? est.gen('a'), nombre: e.nombre, config, ...(parametro ? { parametro } : {}), ...(redes.length || piezas.length ? { trazas: { redes, piezas } } : {}) }
  const v = leerAnalisis(crudo)
  if ('error' in v) return { ok: false, motivo: `${v.error}.` }
  return { ok: true, analisis: v.valor, etiquetas, avisos }
}

export interface TrazasResueltas {
  /** Nombres de red como los guarda el documento. */
  redes: string[]
  /** Ids de las piezas cuya corriente se grafica. */
  piezas: string[]
  /** Red sin nombre a su rótulo legible («R2.2»). */
  etiquetas: Map<number, string>
  avisos: string[]
}

/** Las trazas que pide el asistente (patilla, «red de», nombre) y las corrientes (referencias), resueltas en el circuito. */
export function resolverTrazas(est: { doc: Documento; lib: Map<string, PiezaDef>; con: Conexiones }, trazas: readonly string[] = [], corrientes: readonly string[] = []): TrazasResueltas | { motivo: string } {
  const { doc } = est
  const nombres = nombresDeRedes(doc, est.con)
  const redes: string[] = []
  const etiquetas = new Map<number, string>()
  const avisos: string[] = []
  for (const texto of trazas) {
    const r = resolverRed(est, texto)
    if ('motivo' in r) return { motivo: r.motivo }
    if (r.red.tierra) return { motivo: `«${texto.slice(0, 40)}» es la tierra: vale 0 V y no se grafica.` }
    const nombre = nombres.get(r.red.id)
    if (nombre === undefined) return { motivo: `«${texto.slice(0, 40)}» no es una red del circuito.` }
    if (!redes.includes(nombre)) redes.push(nombre)
    if (r.red.nombre === undefined) {
      etiquetas.set(r.red.id, texto.trim().replace(/^red de /i, ''))
      avisos.push(`«${texto.slice(0, 40)}» no tiene nombre: en el documento se guarda como «${nombre}», que cambia si se edita el circuito. Con nombrar_red queda fija.`)
    }
  }
  const piezas: string[] = []
  for (const ref of corrientes) {
    const p = piezaPorRef(doc, ref)
    if (!p) return { motivo: sinPieza(ref.slice(0, 40)) }
    if (!piezas.includes(p.id)) piezas.push(p.id)
  }
  return { redes, piezas, etiquetas, avisos }
}

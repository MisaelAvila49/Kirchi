import { filaDe } from '../piezas/validarDatos'
import type { PiezaDef, Presentacion } from '../piezas/tipos'
import { MAX_REFERENCIA } from './referencias'
import type { Documento, Id, Pieza } from './tipos'

/** Propiedades que el documento guarda por pieza multiunidad: ninguna pieza las declara (`piezas/validar.ts`). */
export const PROPS_DE_DOCUMENTO = ['paquete', 'unidad'] as const

/** Lo que comparten todas las unidades de un encapsulado: cambiar una cambia las demás. */
export const PROPS_COMPARTIDAS = ['familia', 'alimentacion', 'entradas', 'modelo']

export const refDe = (paquete: string, unidad: string): string => paquete + unidad

/** `ref` debe ser el paquete seguido de la unidad; sin las dos propiedades no hay nada que comprobar. */
export function invarianteDePaquete(ref: string, props: Record<string, string>): boolean {
  const tiene = (k: string) => Object.hasOwn(props, k)
  if (!tiene('paquete') && !tiene('unidad')) return true
  return tiene('paquete') && tiene('unidad') && props.paquete !== '' && props.unidad !== '' && ref === refDe(props.paquete, props.unidad)
}

const lista = (v: string | string[]): string => (Array.isArray(v) ? v.join(', ') : v)
const presentacionDe = (def: PiezaDef, props: Record<string, string>): Presentacion | undefined => filaDe(def, props)?.fila.presentaciones?.[0]
const letra = (k: number): string => String.fromCharCode(65 + k)

/** Las unidades A, B, C… de la presentación de omisión de la fila que le toca a la pieza, y los pines que no están en ninguna
 * (V+ y V- del LM358, la misma patilla en todas). null si la pieza tiene una sola unidad. */
export function unidadesDe(def: PiezaDef, props: Record<string, string>): { nombres: string[]; compartidos: string[] } | null {
  const u = presentacionDe(def, props)?.unidades
  if (!u || u.length < 2) return null
  const propias = new Set(Object.keys(u[0].patillas))
  return { nombres: u.map((_, k) => letra(k)), compartidos: def.pines.map((p) => p.id).filter((id) => !propias.has(id)) }
}

/** Pin → patilla de una unidad, con las compartidas; null si la pieza no tiene esa unidad. */
export function patillasDeUnidad(def: PiezaDef, props: Record<string, string>, unidad: string): Record<string, string> | null {
  const pres = presentacionDe(def, props)
  const k = unidad.length === 1 ? unidad.charCodeAt(0) - 65 : -1
  const u = pres?.unidades
  if (!pres || !u || u.length < 2 || k < 0 || k >= u.length) return null
  const propias = new Set(Object.keys(u[0].patillas))
  const r: Record<string, string> = { ...u[k].patillas }
  for (const [pin, v] of Object.entries(pres.patillas)) if (!propias.has(pin)) r[pin] = lista(v)
  return r
}

/** Paquete y unidad guardados en la pieza, o null si no los tiene. */
export function paqueteDe(p: Pieza): { paquete: string; unidad: string } | null {
  const { paquete, unidad } = p.props
  return paquete && unidad ? { paquete, unidad } : null
}

/** Las piezas de un paquete, ordenadas por letra de unidad. */
export function unidadesDelPaquete(doc: Documento, paquete: string): Pieza[] {
  return Object.values(doc.piezas).filter((p) => p.props.paquete === paquete).sort((a, b) => (a.props.unidad ?? '').localeCompare(b.props.unidad ?? ''))
}

/** Valores de lo que comparten las unidades, con el de omisión de la definición, para saber si dos piezas caben en un paquete. */
function firmaDe(def: PiezaDef, props: Record<string, string>): string {
  return def.props.filter((d) => PROPS_COMPARTIDAS.includes(d.id)).map((d) => `${d.id}=${props[d.id] ?? d.defecto ?? ''}`).join('|')
}

const escapar = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Número siguiente al mayor que usan las referencias y los paquetes del prefijo, sin contar las piezas de `excluir`. */
export function siguienteNumero(doc: Documento, prefijo: string, excluir: ReadonlySet<Id> = new Set()): number {
  const re = new RegExp(`^${escapar(prefijo)}(\\d+)[A-Za-z]?$`, 'i')
  let max = 0
  for (const p of Object.values(doc.piezas)) {
    if (excluir.has(p.id)) continue
    for (const t of [p.ref, p.props.paquete]) {
      const m = t === undefined ? null : re.exec(t)
      if (m) max = Math.max(max, Number(m[1]))
    }
  }
  return max + 1
}

/** La unidad que toma una pieza nueva: la primera libre de un paquete del mismo tipo y familia (como Proteus) o, si no hay,
 * la A de un paquete con la siguiente referencia libre. null si la pieza no es multiunidad. */
export function siguienteUnidad(doc: Documento, lib: Map<string, PiezaDef>, tipo: string, props: Record<string, string>): { paquete: string; unidad: string } | null {
  const def = lib.get(tipo)
  const u = def ? unidadesDe(def, props) : null
  if (!def || !u) return null
  const firma = firmaDe(def, props)
  const usadas = new Map<string, Set<string>>()
  for (const p of Object.values(doc.piezas)) {
    const pu = paqueteDe(p)
    if (p.tipo !== tipo || !pu || firmaDe(def, p.props) !== firma) continue
    const s = usadas.get(pu.paquete) ?? new Set()
    s.add(pu.unidad)
    usadas.set(pu.paquete, s)
  }
  for (const paquete of [...usadas.keys()].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))) {
    const libre = u.nombres.find((n) => !usadas.get(paquete)!.has(n))
    if (libre) return { paquete, unidad: libre }
  }
  return { paquete: `${def.prefijo}${siguienteNumero(doc, def.prefijo)}`, unidad: u.nombres[0] }
}

export type ResultadoRenombrar = { ok: true; cambios: { id: Id; ref: string; paquete: string }[] } | { ok: false; error: string }

/** Cambios que renombran un paquete en todas sus unidades; el documento no se toca. */
export function renombrarPaquete(doc: Documento, paquete: string, nuevo: string): ResultadoRenombrar {
  const t = nuevo.trim()
  if (!t) return { ok: false, error: 'Escribe la referencia.' }
  if (/\s/.test(t)) return { ok: false, error: 'La referencia no lleva espacios.' }
  if (t.length + 1 > MAX_REFERENCIA) return { ok: false, error: `La referencia admite ${MAX_REFERENCIA - 1} caracteres como máximo, con la letra de la unidad.` }
  const propias = Object.values(doc.piezas).filter((p) => p.props.paquete === paquete).sort((a, b) => (a.props.unidad ?? '').localeCompare(b.props.unidad ?? ''))
  const ids = new Set(propias.map((p) => p.id))
  const k = t.toUpperCase()
  const nuevas = new Set(propias.map((p) => refDe(t, p.props.unidad).toUpperCase()))
  for (const p of Object.values(doc.piezas)) {
    if (ids.has(p.id)) continue
    if (p.ref.toUpperCase() === k || p.props.paquete?.toUpperCase() === k || nuevas.has(p.ref.toUpperCase())) return { ok: false, error: `Ya hay otra pieza con la referencia ${p.props.paquete?.toUpperCase() === k ? p.props.paquete : p.ref}.` }
  }
  return { ok: true, cambios: propias.map((p) => ({ id: p.id, ref: refDe(t, p.props.unidad), paquete: t })) }
}

/** Reparte las piezas multiunidad sueltas (sin paquete) por tipo y familia, en orden de lectura, en paquetes nuevos con la
 * siguiente referencia libre; no toca las ya agrupadas ni las demás. El documento no se toca. */
export function agrupar(doc: Documento, lib: Map<string, PiezaDef>): { id: Id; ref: string; paquete: string; unidad: string }[] {
  const sueltas = Object.values(doc.piezas)
    .filter((p) => !paqueteDe(p) && p.props.paquete === undefined && p.props.unidad === undefined)
    .map((p) => ({ p, def: lib.get(p.tipo) }))
    .filter((x): x is { p: Pieza; def: PiezaDef } => !!x.def && unidadesDe(x.def, x.p.props) !== null)
    .sort((a, b) => a.p.y - b.p.y || a.p.x - b.p.x || (a.p.id < b.p.id ? -1 : 1))
  const grupos = new Map<string, { p: Pieza; def: PiezaDef }[]>()
  for (const s of sueltas) {
    const llave = `${s.p.tipo}#${firmaDe(s.def, s.p.props)}`
    grupos.set(llave, [...(grupos.get(llave) ?? []), s])
  }
  const excluir = new Set(sueltas.map((s) => s.p.id))
  const siguiente = new Map<string, number>()
  const out: { id: Id; ref: string; paquete: string; unidad: string }[] = []
  for (const g of grupos.values()) {
    const { def } = g[0]
    const nombres = unidadesDe(def, g[0].p.props)!.nombres
    const n = siguiente.get(def.prefijo) ?? siguienteNumero(doc, def.prefijo, excluir)
    let usados = 0
    for (let i = 0; i < g.length; i += nombres.length) {
      const paquete = `${def.prefijo}${n + usados++}`
      g.slice(i, i + nombres.length).forEach((s, k) => out.push({ id: s.p.id, ref: refDe(paquete, nombres[k]), paquete, unidad: nombres[k] }))
    }
    siguiente.set(def.prefijo, n + usados)
  }
  return out
}

import { PARAMETROS, problemaDeParametro } from '../netlist/rangos'
import { leerValor } from '../valores/valores'
import type { ModeloDef, PiezaDef } from '../piezas/tipos'
import type { Documento, Pieza } from './tipos'

/** Modelo «Personalizado»: `Pieza.spice` guarda el juego completo de parámetros con nombres de ngspice; el que falte toma
 * el valor de ngspice.
 * Sin el campo, la pieza usa su modelo. */

export type FamiliaSpice = 'bjt' | 'mosfet' | 'ampop'

/** Tope de parámetros de un juego propio (el transistor de Gummel-Poon tiene 31). */
export const MAX_PARAMETROS_SPICE = 40

/** La familia de parámetros de un modelo, o null si la pieza no tiene modelo de SPICE editable. */
export function familiaSpice(m: ModeloDef | undefined): FamiliaSpice | null {
  return m?.tipo === 'bjt' || m?.tipo === 'mosfet' || m?.tipo === 'ampop' ? m.tipo : null
}

/** Un `.kir` a mano puede traer `spice` en una pieza sin familia SPICE: el netlist lo ignora pero subía el formato a 6.
 * Quita esos campos (mismo documento si no hay nada que quitar). */
export function sinSpiceSinFamilia(doc: Documento, lib: ReadonlyMap<string, PiezaDef>): { doc: Documento; descartadas: string[] } {
  const descartadas: string[] = []
  let piezas: Documento['piezas'] | null = null
  for (const id in doc.piezas) {
    const p = doc.piezas[id]
    const def = lib.get(p.tipo)
    if (p.spice === undefined || !def || familiaSpice(def.modelo) !== null) continue
    const { spice: _descartado, ...resto } = p
    piezas ??= { ...doc.piezas }
    piezas[id] = resto
    descartadas.push(p.ref)
  }
  return { doc: piezas ? { ...doc, piezas } : doc, descartadas }
}

/** El juego propio de la pieza, o null si usa su modelo (un `spice` vacío cuenta como ninguno). */
export function spiceVigente(p: Pieza): Record<string, number> | null {
  return p.spice && Object.keys(p.spice).length > 0 ? p.spice : null
}

/** El juego propio de la pieza como texto («bf = 200» por renglón); vacío si usa su modelo. */
export function textoSpiceDe(p: Pieza, def: PiezaDef): string {
  const familia = familiaSpice(def.modelo)
  const s = spiceVigente(p)
  return familia && s ? textoDeSpice(s, familia) : ''
}

/** Los parámetros del modelo elegido de la pieza como texto: lo que se escribe al activar «Personalizado». */
export function textoBaseSpice(p: Pieza, def: PiezaDef): string {
  const m = def.modelo
  const familia = familiaSpice(m)
  if (!familia || !m || !('modelos' in m) || !m.prop) return ''
  const opcion = p.props[m.prop] ?? def.props.find((d) => d.id === m.prop)?.defecto ?? ''
  const modelos = m.modelos as Record<string, Record<string, number>>
  const base = modelos[opcion] ?? Object.values(modelos)[0]
  return base ? textoDeSpice(base, familia) : ''
}

/** Lo que está mal con un parámetro propio (nombre que el motor no lee, o valor fuera de rango), o null. */
export function problemaDeSpice(familia: FamiliaSpice, nombre: string, valor: number): string | null {
  return problemaDeParametro(familia, nombre, valor)
}

/** Juego de un `.kir`: solo parámetros conocidos de valor finito, en un objeto nuevo (un `__proto__` del JSON no llega a
 * ningún prototipo). `descartados` cuenta lo inválido (−1 si no es objeto). */
export function leerSpice(v: unknown, familia: FamiliaSpice | null): { spice: Record<string, number> | null; descartados: number } {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { spice: null, descartados: -1 }
  const out: Record<string, number> = {}
  let descartados = 0
  const nombres = familia ? PARAMETROS[familia].nombres : null
  for (const k of Object.keys(v)) {
    const x = (v as Record<string, unknown>)[k]
    if (typeof x === 'number' && Number.isFinite(x) && Object.keys(out).length < MAX_PARAMETROS_SPICE && (nombres ? nombres.includes(k) : /^[a-z][a-z0-9]{0,7}$/.test(k))) out[k] = x
    else descartados++
  }
  return { spice: Object.keys(out).length ? out : null, descartados }
}

/** El texto de un juego: un parámetro por renglón («bf = 200»), en el orden de ngspice. */
export function textoDeSpice(spice: Readonly<Record<string, number>>, familia: FamiliaSpice): string {
  const orden = PARAMETROS[familia].nombres
  const claves = Object.keys(spice).sort((a, b) => (orden.indexOf(a) + 1 || 99) - (orden.indexOf(b) + 1 || 99))
  return claves.map((k) => `${k} = ${spice[k]}`).join('\n')
}

/** Un número escrito como «200», «1.434e-14», «10p» o «4k7»; null si no se lee. */
function leerNumero(texto: string): number | null {
  const t = texto.trim().replace(/,/g, '.')
  if (t === '') return null
  if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) return Number(t)
  const v = leerValor(t)
  return v && Number.isFinite(v.valor) ? v.valor : null
}

/** Campo «Personalizado»: renglones «nombre = valor» (o «nombre valor», sin importar mayúsculas). Vacío quita el modelo
 * propio; lo ilegible o fuera de rango se dice con el renglón. */
export function spiceDeTexto(texto: string, familia: FamiliaSpice): { ok: true; spice: Record<string, number> | null } | { ok: false; error: string } {
  const out: Record<string, number> = {}
  const renglones = texto.split(/\r?\n|;/)
  for (const [i, r] of renglones.entries()) {
    const limpio = r.trim()
    if (limpio === '') continue
    const m = /^([A-Za-z][A-Za-z0-9]*)\s*(?:=|\s)\s*(.+)$/.exec(limpio)
    if (!m) return { ok: false, error: `Renglón ${i + 1}: escribe «nombre = valor», por ejemplo «bf = 200».` }
    const nombre = m[1].toLowerCase()
    const valor = leerNumero(m[2])
    if (valor === null) return { ok: false, error: `Renglón ${i + 1}: «${m[2].trim()}» no es un número.` }
    const problema = problemaDeSpice(familia, nombre, valor)
    if (problema) return { ok: false, error: `Renglón ${i + 1} («${nombre}»): ${problema}.` }
    if (Object.hasOwn(out, nombre)) return { ok: false, error: `Renglón ${i + 1}: «${nombre}» está repetido.` }
    out[nombre] = valor
  }
  if (Object.keys(out).length > MAX_PARAMETROS_SPICE) return { ok: false, error: `Son demasiados parámetros (hasta ${MAX_PARAMETROS_SPICE}).` }
  return { ok: true, spice: Object.keys(out).length ? out : null }
}

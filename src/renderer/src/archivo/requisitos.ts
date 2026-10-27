import type { Documento } from '../doc/tipos'
import type { PiezaDef } from '../piezas/tipos'

/** Propiedades que eligen los parámetros del modelo: su valor entra en la lista de requisitos. */
export const PROPS_DE_REQUISITO = ['modelo', 'familia', 'color'] as const
export const MAX_REQUISITOS = 500
export const MAX_LARGO_REQUISITO = 120

const NOMBRE_PROP: Record<string, string> = { modelo: 'el modelo', familia: 'la familia', color: 'el color' }
const MAX_NOMBRADOS = 3

/** Lo que el circuito necesita de la librería, ordenado y sin repetir, solo a partir del documento. */
export function requisitosDe(doc: Documento): string[] {
  const out = new Set<string>()
  for (const id in doc.piezas) {
    const p = doc.piezas[id]
    out.add(`pieza:${p.tipo}`)
    for (const prop of PROPS_DE_REQUISITO) {
      const v = p.props[prop]
      if (typeof v === 'string' && v !== '') out.add(`opcion:${p.tipo}.${prop}=${v}`)
    }
  }
  return [...out].sort()
}

/** La lista del manifiesto si es válida; si no, vacía. */
export function requisitosLeidos(v: unknown): string[] {
  if (!Array.isArray(v) || v.length > MAX_REQUISITOS) return []
  return v.every((x) => typeof x === 'string' && x.length > 0 && x.length <= MAX_LARGO_REQUISITO) ? (v as string[]) : []
}

function refsDe(doc: Documento, tipo: string, prop?: string, valor?: string): string[] {
  const refs: string[] = []
  for (const id in doc.piezas) {
    const p = doc.piezas[id]
    if (p.tipo === tipo && (prop === undefined || p.props[prop] === valor)) refs.push(p.ref)
  }
  return refs.sort()
}

const conRefs = (nombre: string, refs: string[]) => (refs.length > 0 ? `${nombre} (${refs.join(', ')})` : nombre)

/** Las entradas de `requiere` que la librería cargada no tiene, y un solo aviso que las nombra (null si no falta nada). */
export function faltantesDe(requiere: string[], lib: Map<string, PiezaDef>, doc: Documento): { entradas: string[]; aviso: string | null } {
  const entradas: string[] = []
  const nombres: string[] = []
  const tiposFaltantes = new Set(requiere.filter((r) => r.startsWith('pieza:')).map((r) => r.slice(6)).filter((t) => !lib.has(t)))
  for (const r of requiere) {
    if (r.startsWith('pieza:')) {
      const tipo = r.slice(6)
      if (lib.has(tipo)) continue
      entradas.push(r)
      nombres.push(conRefs(`la pieza ${tipo}`, refsDe(doc, tipo)))
    } else if (r.startsWith('opcion:')) {
      const m = /^opcion:([^.=]+)\.([^=]+)=(.+)$/.exec(r)
      if (!m) {
        entradas.push(r)
        nombres.push('algo que no se reconoce')
        continue
      }
      const [, tipo, prop, valor] = m
      if (tiposFaltantes.has(tipo)) continue
      const def = lib.get(tipo)
      const opciones = def?.props.find((d) => d.id === prop)?.opciones
      if (def && (!opciones || opciones.includes(valor))) continue
      entradas.push(r)
      nombres.push(conRefs(`${NOMBRE_PROP[prop] ?? `la opción ${prop}`} ${valor}`, refsDe(doc, tipo, prop, valor)))
    } else {
      entradas.push(r)
      nombres.push('algo que no se reconoce')
    }
  }
  if (entradas.length === 0) return { entradas, aviso: null }
  const unicos = [...new Set(nombres)]
  const vistos = unicos.slice(0, MAX_NOMBRADOS)
  const resto = unicos.length - vistos.length
  const lista = vistos.length < 2 ? vistos.join('') : `${vistos.slice(0, -1).join(', ')} y ${vistos[vistos.length - 1]}`
  const cola = resto > 0 ? ` y ${resto} más` : ''
  return { entradas, aviso: `Este circuito usa lo que esta versión de Kirchi no tiene: ${resto > 0 ? vistos.join(', ') : lista}${cola}. Se conservan al guardar. Actualiza Kirchi para simularlos.` }
}

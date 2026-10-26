import { buscar } from '../buscador/buscar'
import type { PiezaDef } from '../piezas/tipos'
import { tonoDeCategoria, type TonoCategoria } from './colores'

/** Nombres de las categorías de `componentes/`, en el orden en que salen en la Librería. */
export const CATEGORIAS: readonly [string, string][] = [
  ['pasivos', 'Pasivos'],
  ['fuentes', 'Fuentes'],
  ['semiconductores', 'Semiconductores'],
  ['interruptores', 'Interruptores'],
  ['electromecanicos', 'Electromecánicos'],
  ['indicadores', 'Indicadores'],
  ['digitales', 'Digitales'],
  ['integrados', 'Circuitos integrados'],
  ['instrumentos', 'Instrumentos']
]

export interface EntradaCatalogo {
  def: PiezaDef
  /** Valor propuesto por la consulta («r 4k7» → 4k7), como en el buscador. */
  valor?: string
}

export interface Categoria {
  id: string
  nombre: string
  /** El tono de la categoría (muestra y fichas de símbolo); sin tono, gris. */
  tono?: TonoCategoria
  piezas: EntradaCatalogo[]
}

/** Nombre de una categoría; si no es de las conocidas, su id con mayúscula inicial. */
export const nombreCategoria = (id: string): string => CATEGORIAS.find(([c]) => c === id)?.[1] ?? id.charAt(0).toUpperCase() + id.slice(1)
const rangoCategoria = (id: string) => {
  const i = CATEGORIAS.findIndex(([c]) => c === id)
  return i < 0 ? CATEGORIAS.length : i
}

/** Librería por categorías. Con filtro, resultados del buscador por puntaje. */
export function catalogo(lib: Map<string, PiezaDef>, filtro = ''): Categoria[] {
  const entradas: EntradaCatalogo[] = filtro.trim()
    ? // Una pieza con varios modelos que empiezan igual sale una vez en la Librería (el buscador sí los lista uno a uno).
      buscar(filtro, lib, []).filter((r, i, todos) => todos.findIndex((x) => x.def === r.def) === i).map((r) => ({ def: r.def, valor: r.valor }))
    : [...lib.values()].sort((a, b) => a.nombre.es.localeCompare(b.nombre.es, 'es')).map((def) => ({ def }))
  const porId = new Map<string, Categoria>()
  for (const e of entradas) {
    const id = e.def.categoria
    let c = porId.get(id)
    if (!c) porId.set(id, (c = { id, nombre: nombreCategoria(id), tono: tonoDeCategoria(id), piezas: [] }))
    c.piezas.push(e)
  }
  return [...porId.values()].sort((a, b) => rangoCategoria(a.id) - rangoCategoria(b.id) || a.nombre.localeCompare(b.nombre, 'es'))
}

/** Las recientes que existen en la librería, en su orden. */
export const recientesDeLibreria = (lib: Map<string, PiezaDef>, recientes: string[]): PiezaDef[] =>
  recientes.map((id) => lib.get(id)).filter((d): d is PiezaDef => d !== undefined)

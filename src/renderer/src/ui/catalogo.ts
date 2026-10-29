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

/** Un grupo plegable dentro de una categoría (`grupo` del `pieza.json`). Su `id` lleva la categoría para recordar el plegado. */
export interface GrupoCatalogo {
  id: string
  nombre: string
  piezas: EntradaCatalogo[]
}

export interface Categoria {
  id: string
  nombre: string
  /** El tono de la categoría (muestra y fichas de símbolo); sin tono, gris. */
  tono?: TonoCategoria
  /** Todas las piezas de la categoría, con o sin grupo. */
  piezas: EntradaCatalogo[]
  /** Las piezas sin grupo (van arriba) y los grupos en su orden; solo sin filtro y si alguna pieza trae `grupo`. */
  sueltas?: EntradaCatalogo[]
  grupos?: GrupoCatalogo[]
}

/** El orden de los grupos de la Librería, categoría por categoría (sus nombres no se repiten entre categorías); uno que no está aquí va después, por nombre. */
export const GRUPOS_EN_ORDEN: readonly string[] = [
  // Pasivos
  'Resistencias', 'Sensores resistivos', 'Capacitores e inductores', 'Fusible y cristal',
  // Fuentes
  'Independientes', 'Controladas', 'Alimentación y tierra',
  // Semiconductores
  'Diodos y LED', 'Bipolares y UJT', 'Efecto de campo e IGBT', 'Tiristores',
  // Interruptores
  'Individuales', 'Bancos y teclados',
  // Digitales
  'Compuertas', 'Biestables y contadores', 'Decodificadores y multiplexores', 'Registros y búferes', 'Aritmética',
  // Circuitos integrados
  'Amplificadores y comparadores', 'Reguladores y referencias', 'Conversión y temporización', 'Sensores de temperatura', 'Interfaz y aislamiento'
]
const rangoGrupo = (nombre: string) => {
  const i = GRUPOS_EN_ORDEN.indexOf(nombre)
  return i < 0 ? GRUPOS_EN_ORDEN.length : i
}

/** Reparte las piezas de una categoría en sueltas y grupos; sin ninguna con `grupo`, la categoría queda plana. */
function agrupar(c: Categoria): void {
  if (!c.piezas.some((e) => e.def.grupo)) return
  const porNombre = new Map<string, EntradaCatalogo[]>()
  c.sueltas = []
  for (const e of c.piezas) {
    const g = e.def.grupo
    if (!g) c.sueltas.push(e)
    else porNombre.set(g, [...(porNombre.get(g) ?? []), e])
  }
  c.grupos = [...porNombre]
    .sort(([a], [b]) => rangoGrupo(a) - rangoGrupo(b) || a.localeCompare(b, 'es'))
    .map(([nombre, piezas]) => ({ id: `${c.id}/${nombre}`, nombre, piezas }))
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
    : [...lib.values()].filter((d) => !d.oculta).sort((a, b) => a.nombre.es.localeCompare(b.nombre.es, 'es')).map((def) => ({ def }))
  const porId = new Map<string, Categoria>()
  for (const e of entradas) {
    const id = e.def.categoria
    let c = porId.get(id)
    if (!c) porId.set(id, (c = { id, nombre: nombreCategoria(id), tono: tonoDeCategoria(id), piezas: [] }))
    c.piezas.push(e)
  }
  // Con filtro la lista es la de resultados por puntaje: los grupos no se usan.
  if (!filtro.trim()) for (const c of porId.values()) agrupar(c)
  // Con filtro, la categoría de la mejor coincidencia va primero (el orden de `entradas` es el del puntaje).
  if (filtro.trim()) return [...porId.values()]
  return [...porId.values()].sort((a, b) => rangoCategoria(a.id) - rangoCategoria(b.id) || a.nombre.localeCompare(b.nombre, 'es'))
}

/** Las recientes que existen en la librería, en su orden. */
export const recientesDeLibreria = (lib: Map<string, PiezaDef>, recientes: string[]): PiezaDef[] =>
  recientes.map((id) => lib.get(id)).filter((d): d is PiezaDef => d !== undefined)

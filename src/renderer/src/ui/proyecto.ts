import { instrumentoDe, nombreDeSonda } from '../doc/sondas'
import { normalizar } from '../buscador/buscar'
import { clavePin, porId, type Conexiones } from '../conexiones/conexiones'
import type { Documento, Id, Pieza } from '../doc/tipos'
import { textoDeValor } from '../lienzo/etiquetas'
import { unidadesDe } from '../doc/paquetes'
import { filaDe } from '../piezas/validarDatos'
import { rielesUsados } from '../netlist/alimentaciones'
import { formatearValor } from '../valores/valores'
import { UnionFind } from '../conexiones/unionFind'
import { anotarFuente, diodosDirectos, esTransformador, gruposDelModelo, leerPropiedad, numericasDelModelo, PISTA_TRANSFORMADOR, pinesQueDebenConectarse, terminalesDeAlimentacion, terminalesDelModelo, type PiezasDeFuentes } from '../netlist/netlist'
import { entradasAlAire, entradasTrasContactos, esModeloDigital, familiaDe, hayLogica, salidasATierra, salidasUnidas, textoEntradasTrasContactos } from '../netlist/digital'
import type { PiezaDef } from '../piezas/tipos'
import { CATEGORIAS, nombreCategoria } from './catalogo'
import { tonoDeCategoria, type TonoCategoria } from './colores'
import { avisosDeLosMultimetros } from '../netlist/multimetros'
import { avisosAbsolutosEstaticos } from '../sim/absolutos'
import { conexionesDeRed, ordenRef } from './redes'

export interface EntradaPieza {
  id: Id
  ref: string
  nombre: string
  valor: string
  /** El tipo de la pieza (su símbolo en la ficha). */
  tipo: string
  /** El tono de su categoría (el tinte de la ficha); sin categoría conocida, ninguno. */
  tono?: TonoCategoria
  /** El id de su categoría en la Librería («pasivos»); vacío si la pieza no se conoce (el panel la agrupa en «Otras»). */
  categoria: string
}

export interface EntradaRed {
  red: number
  nombre: string
  conexiones: number
}

/** Un riel (o nombre con voltaje) que usan los terminales del documento: la sección «Alimentaciones» del panel. */
export interface EntradaAlimentacion {
  nombre: string
  /** El voltaje tal como se escribió («12», «-15»). */
  texto: string
  /** El voltaje leído («12 V»); null si no se lee. */
  lectura: string | null
  /** El voltaje sale del nombre («+15V»): no se edita. */
  deNombre: boolean
  terminales: number
}

/** Un encapsulado con unidades: «U1 74HC00 (A, B y D; C libre)». */
export interface EntradaPaquete {
  paquete: string
  /** El chip (74HC00) o, sin hoja de datos, el nombre de la pieza. */
  chip: string
  /** Las unidades usadas y las libres: «A, B y D; C libre». */
  unidades: string
  /** Una pieza del paquete, la que selecciona el clic. */
  pieza: Id
}

export interface VistaProyecto {
  paquetes: EntradaPaquete[]
  piezas: EntradaPieza[]
  redes: EntradaRed[]
  alimentaciones: EntradaAlimentacion[]
  /** Totales sin filtro, para el encabezado del panel. */
  total: { piezas: number; redes: number }
}

/** Filas que cada lista del panel Proyecto pinta como máximo: acota el DOM y las paradas de tabulador. */
export const MAX_FILAS = 200

/** Las primeras `max` filas y cuántas quedaron fuera. */
export function recortar<T>(filas: T[], max = MAX_FILAS): { filas: T[]; resto: number } {
  return filas.length <= max ? { filas, resto: 0 } : { filas: filas.slice(0, max), resto: filas.length - max }
}

/**
 * Identidad estable para las filas de una lista: si la entrada nueva de una clave es igual a la anterior (`igual`), devuelve el MISMO objeto para que `For` conserve su elemento y su foco.
 */
export function reutilizar<K, T>(previas: Map<K, T>, nuevas: T[], clave: (t: T) => K, igual: (a: T, b: T) => boolean): T[] {
  const sig = new Map<K, T>()
  const salida = nuevas.map((n) => {
    const k = clave(n)
    const p = previas.get(k)
    const t = p !== undefined && igual(p, n) ? p : n
    sig.set(k, t)
    return t
  })
  previas.clear()
  for (const [k, t] of sig) previas.set(k, t)
  return salida
}

/** «1 pieza», «4 piezas», con separador de miles. */
export const plural = (n: number, uno: string, varios: string): string => `${n.toLocaleString('es-MX')} ${n === 1 ? uno : varios}`

/** Lo que se muestra junto a la referencia: el valor numérico, si no la primera opción (abierto, rojo), si no el nombre. */
export function resumenValor(p: Pieza, def: PiezaDef | undefined, doc?: Pick<Documento, 'alimentaciones'>): string {
  if (!def) return 'desconocida'
  const v = textoDeValor(p, def, doc)
  // Con una propiedad de texto (el nombre de un terminal) se antepone: «VCC, 5 V».
  const nombre = def.props.find((d) => d.texto)
  const texto = nombre ? (p.props[nombre.id] ?? nombre.defecto).trim() : ''
  if (v) return texto ? `${texto}, ${v}` : v
  // Un terminal con un nombre que ya es un voltaje («+15V») no repite el voltaje.
  if (texto) return texto
  const op = def.props.find((d) => d.opciones)
  return op ? (p.props[op.id] ?? op.defecto) : def.nombre.es
}

export { ordenRef }
export { avisosDelCircuito, enumerar, referenciasCortas, REFS_EN_AVISO, type Aviso } from '../conexiones/avisos'
import type { Aviso } from '../conexiones/avisos'

const listaY = (xs: string[]): string => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`)

/** Los encapsulados del documento, por referencia: qué unidades usa cada uno y cuáles quedan libres. */
export function paquetesDelProyecto(doc: Documento, lib: Map<string, PiezaDef>): EntradaPaquete[] {
  const por = new Map<string, Pieza[]>()
  for (const p of Object.values(doc.piezas)) if (p.props.paquete) por.set(p.props.paquete, [...(por.get(p.props.paquete) ?? []), p])
  const salida: EntradaPaquete[] = []
  for (const [paquete, ps] of por) {
    const primera = ps.sort((a, b) => (a.props.unidad ?? '').localeCompare(b.props.unidad ?? ''))[0]
    const def = lib.get(primera.tipo)
    const u = def ? unidadesDe(def, primera.props) : null
    if (!def || !u) continue
    const usadas = ps.map((p) => p.props.unidad)
    const libres = u.nombres.filter((n) => !usadas.includes(n))
    const chip = filaDe(def, primera.props)?.fila.parte ?? def.nombre.es
    salida.push({ paquete, chip, unidades: `${listaY(usadas)}${libres.length ? `; ${listaY(libres)} ${libres.length === 1 ? 'libre' : 'libres'}` : ''}`, pieza: primera.id })
  }
  return salida.sort((a, b) => ordenRef(a.paquete, b.paquete))
}

/** Panel Proyecto: piezas con su valor y redes con sus conexiones (los avisos, aparte); `filtro` acota piezas y redes. */
export function vistaProyecto(doc: Documento, lib: Map<string, PiezaDef>, con: Conexiones, nombres: Map<number, string>, filtro = ''): VistaProyecto {
  const f = normalizar(filtro)
  const pasa = (...textos: string[]) => !f || normalizar(textos.join(' ')).includes(f)
  const todas = Object.values(doc.piezas)
    .map((p) => {
      const def = lib.get(p.tipo)
      const tono = def ? tonoDeCategoria(def.categoria) : undefined
      return { id: p.id, ref: p.ref, nombre: def?.nombre.es ?? p.tipo, valor: resumenValor(p, def, doc), tipo: p.tipo, categoria: def?.categoria ?? '', ...(tono ? { tono } : {}) }
    })
    .sort((a, b) => ordenRef(a.ref, b.ref))
  // `nombres` está en el orden de listado: tierra, con etiqueta y luego las numeradas.
  const visibles = [...nombres].map(([id, nombre]) => ({ red: id, nombre, conexiones: conexionesDeRed(con.redes[id]) }))
  const alimentaciones = rielesUsados(doc, lib).map((r) => ({
    nombre: r.nombre, texto: r.texto, lectura: r.valor === null ? null : formatearValor(r.valor, 'V'), deNombre: r.deNombre, terminales: r.terminales.length
  }))
  return {
    alimentaciones,
    paquetes: paquetesDelProyecto(doc, lib).filter((q) => pasa(q.paquete, q.chip, q.unidades)),
    piezas: todas.filter((p) => pasa(p.ref, p.nombre, p.valor)),
    redes: visibles.filter((r) => pasa(r.nombre)),
    total: { piezas: todas.length, redes: visibles.length }
  }
}

/** Si la lista de piezas del panel Proyecto se muestra: abierta, o plegada pero con un filtro escrito, porque quien filtra quiere ver lo que coincide. */
export const piezasVisibles = (plegadas: boolean, filtro: string): boolean => !plegadas || filtro.trim() !== ''

/** Un grupo de piezas del panel Proyecto: una categoría de la Librería con sus filas y cuántas piezas la forman. */
export interface GrupoPiezas {
  id: string
  nombre: string
  tono?: TonoCategoria
  /** Las filas que se pintan (pueden estar recortadas). */
  piezas: EntradaPieza[]
  /** Cuántas piezas coinciden con el filtro en esa categoría, recortadas o no. */
  total: number
}

/** Id del grupo de las piezas cuyo tipo la Librería no conoce. */
export const CATEGORIA_OTRAS = 'otras'

/**
 * Piezas agrupadas por categoría en el orden de la Librería; las desconocidas en «Otras». `filas` son las que se pintan y `todas` las que coinciden con el filtro, para la cuenta del grupo.
 */
export function agruparPiezas(filas: readonly EntradaPieza[], todas: readonly EntradaPieza[]): GrupoPiezas[] {
  const id = (p: EntradaPieza) => (CATEGORIAS.some(([c]) => c === p.categoria) || p.categoria ? p.categoria : CATEGORIA_OTRAS)
  const totales = new Map<string, number>()
  for (const p of todas) totales.set(id(p), (totales.get(id(p)) ?? 0) + 1)
  const grupos = new Map<string, GrupoPiezas>()
  for (const p of filas) {
    const g = id(p)
    let x = grupos.get(g)
    if (!x) grupos.set(g, (x = { id: g, nombre: g === CATEGORIA_OTRAS ? 'Otras' : nombreCategoria(g), ...(p.tono ? { tono: p.tono } : {}), piezas: [], total: totales.get(g) ?? 0 }))
    x.piezas.push(p)
  }
  const rango = (g: string) => {
    if (g === CATEGORIA_OTRAS) return CATEGORIAS.length + 1
    const i = CATEGORIAS.findIndex(([c]) => c === g)
    return i < 0 ? CATEGORIAS.length : i
  }
  return [...grupos.values()].sort((a, b) => rango(a.id) - rango(b.id) || a.nombre.localeCompare(b.nombre, 'es'))
}

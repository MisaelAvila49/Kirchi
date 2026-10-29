/** Lo que una importación hizo con cada pieza, para mostrarlo al usuario y guardarlo en el `.kir`. */
import type { ConfigAnalisis } from '../../../compartido/analisis/config'
import { formatearSI } from '../valores/valores'
import type { FormatoAjeno } from './ajeno'

export interface Informe {
  origen: { formato: FormatoAjeno; version?: string; nombre: string }
  total: number
  convertidas: number
  /** `original` es el modelo o el tipo de la pieza ajena (BC548), para decir de qué se pasó a qué. */
  aproximadas: { id: string; ref: string; tipo: string; original?: string; pieza: string; modelo?: string }[]
  sinEquivalencia: { id: string; ref: string; tipo: string; original?: string }[]
  redesConEtiqueta: { nombre: string; ids: string[] }[]
  analisis: { nombre: string; de: string }[]
  omitidas: string[]
  avisos: string[]
}

const FORMATOS: readonly FormatoAjeno[] = ['falstad', 'ltspice', 'spice', 'kicad', 'proteus']
const NOMBRES: Record<FormatoAjeno, string> = { falstad: 'Falstad', ltspice: 'LTspice', spice: 'SPICE', kicad: 'KiCad', proteus: 'Proteus' }

/** Topes de un informe que viene de un archivo no confiable. */
const MAX_LISTA = 2000
const MAX_TEXTO = 300
const MAX_IDS = 200
const MAX_TOTAL = 100000

const esObjeto = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const texto = (x: unknown): string | null => (typeof x === 'string' ? x.slice(0, MAX_TEXTO) : null)
const entero = (x: unknown): number | null => (typeof x === 'number' && Number.isInteger(x) && x >= 0 && x <= MAX_TOTAL ? x : null)

/** Lista de objetos validados uno a uno; null si algo no tiene la forma. */
function lista<T>(x: unknown, uno: (e: Record<string, unknown>) => T | null): T[] | null {
  if (!Array.isArray(x) || x.length > MAX_LISTA) return null
  const r: T[] = []
  for (const e of x) {
    if (!esObjeto(e)) return null
    const v = uno(e)
    if (v === null) return null
    r.push(v)
  }
  return r
}

function listaTextos(x: unknown, tope = MAX_LISTA): string[] | null {
  if (!Array.isArray(x) || x.length > tope) return null
  const r: string[] = []
  for (const e of x) {
    const t = texto(e)
    if (t === null) return null
    r.push(t)
  }
  return r
}

/** Devuelve una copia limpia o null si lo recibido no es un informe. */
export function validarInforme(v: unknown): Informe | null {
  if (!esObjeto(v) || !esObjeto(v.origen)) return null
  const o = v.origen
  const formato = FORMATOS.find((f) => f === o.formato)
  const nombre = texto(o.nombre)
  if (!formato || nombre === null) return null
  let version: string | undefined
  if (o.version !== undefined) {
    const t = texto(o.version)
    if (t === null) return null
    version = t
  }
  const total = entero(v.total)
  const convertidas = entero(v.convertidas)
  if (total === null || convertidas === null) return null
  const aproximadas = lista(v.aproximadas, (e) => {
    const id = texto(e.id)
    const ref = texto(e.ref)
    const tipo = texto(e.tipo)
    const pieza = texto(e.pieza)
    if (id === null || ref === null || tipo === null || pieza === null) return null
    const original = e.original === undefined ? undefined : texto(e.original)
    const modelo = e.modelo === undefined ? undefined : texto(e.modelo)
    if (original === null || modelo === null) return null
    return { id, ref, tipo, ...(original !== undefined ? { original } : {}), pieza, ...(modelo !== undefined ? { modelo } : {}) }
  })
  const sinEquivalencia = lista(v.sinEquivalencia, (e) => {
    const id = texto(e.id)
    const ref = texto(e.ref)
    const tipo = texto(e.tipo)
    const original = e.original === undefined ? undefined : texto(e.original)
    return id === null || ref === null || tipo === null || original === null ? null : { id, ref, tipo, ...(original !== undefined ? { original } : {}) }
  })
  const redesConEtiqueta = lista(v.redesConEtiqueta, (e) => {
    const n = texto(e.nombre)
    const ids = listaTextos(e.ids, MAX_IDS)
    return n === null || ids === null ? null : { nombre: n, ids }
  })
  const analisis = lista(v.analisis, (e) => {
    const n = texto(e.nombre)
    const de = texto(e.de)
    return n === null || de === null ? null : { nombre: n, de }
  })
  const omitidas = listaTextos(v.omitidas)
  const avisos = listaTextos(v.avisos)
  if (!aproximadas || !sinEquivalencia || !redesConEtiqueta || !analisis || !omitidas || !avisos) return null
  return { origen: { formato, ...(version !== undefined ? { version } : {}), nombre }, total, convertidas, aproximadas, sinEquivalencia, redesConEtiqueta, analisis, omitidas, avisos }
}

/** Una línea para el Registro, sin las cuentas en cero. */
/** Deja a lo más `max` avisos de a lo más 300 caracteres; si hay más, una última línea dice cuántos faltan. */
export function recortarAvisos(avisos: readonly string[], max = 200): string[] {
  const corte = (a: string): string => a.slice(0, 300)
  if (avisos.length <= max) return avisos.map(corte)
  return [...avisos.slice(0, max - 1).map(corte), `y ${avisos.length - (max - 1)} avisos más.`]
}

export function resumenDeInforme(i: Informe): string {
  const o = i.origen
  const programa = o.version ? `${NOMBRES[o.formato]} ${o.version}` : NOMBRES[o.formato]
  const partes = [`${i.convertidas} de ${i.total} ${i.total === 1 ? 'pieza' : 'piezas'}`]
  const n = i.aproximadas.length
  if (n > 0) partes.push(`${n} ${n === 1 ? 'aproximada' : 'aproximadas'}`)
  const s = i.sinEquivalencia.length
  if (s > 0) partes.push(`${s} sin equivalencia`)
  const r = i.redesConEtiqueta.length
  if (r > 0) partes.push(`${r} ${r === 1 ? 'red' : 'redes'} con etiqueta`)
  const a = i.analisis.length
  if (a > 0) partes.push(`${a} ${a === 1 ? 'análisis convertido' : 'análisis convertidos'}`)
  return `Importado de ${programa}: ${partes.join(', ')}.`
}


/** «0 a 5 V»: la unidad una sola vez si las dos puntas la comparten, y el cero sin ella. */
function rango(a: number, b: number, unidad: string): string {
  const fb = formatearSI(b, unidad)
  const fa = a === 0 ? '0' : formatearSI(a, unidad)
  const sufijo = fb.slice(fb.lastIndexOf(' ') + 1)
  return `${fa.endsWith(` ${sufijo}`) ? fa.slice(0, -sufijo.length - 1) : fa} a ${fb}`
}

/** Lo que hace un análisis importado, en unidades SI legibles: «Transitorio de 0 a 1 ms». */
export function describirAnalisis(c: ConfigAnalisis): string {
  switch (c.tipo) {
    case 'op':
      return 'Punto de operación'
    case 'tran':
      return `Transitorio de ${rango(c.inicio ?? 0, c.fin, 's')}`
    case 'ac':
      return `CA de ${rango(c.desde, c.hasta, 'Hz')}`
    case 'dc':
      return `Barrido de CD de ${c.fuente}, ${rango(c.desde, c.hasta, c.fuente.startsWith('I') ? 'A' : 'V')}`
    case 'fourier':
      return `Fourier a ${formatearSI(c.fundamental, 'Hz')}`
  }
}

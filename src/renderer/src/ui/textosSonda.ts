import { partirClavePin, type Conexiones } from '../conexiones/conexiones'
import { claveDeNombre } from '../conexiones/nombres'
import type { Documento, Id, SentidoSonda, Sonda } from '../doc/tipos'
import { enumerar } from './proyecto'
import { ordenRef } from './redes'

/** Cómo se dice el sentido de una sonda de corriente. */
export const NOMBRE_SENTIDO: Readonly<Record<SentidoSonda, string>> = { derecha: 'hacia la derecha', izquierda: 'hacia la izquierda', abajo: 'hacia abajo', arriba: 'hacia arriba' }

/** «Sonda A de XSC1», «Sonda de voltaje», «Sonda de corriente hacia abajo». */
export function nombreLargoDeSonda(doc: Documento, s: Sonda): string {
  if (s.tipo === 'voltaje') return 'Sonda de voltaje'
  if (s.tipo === 'corriente') return `Sonda de corriente ${NOMBRE_SENTIDO[s.sentido ?? 'derecha']}`
  if (s.tipo === 'medidor') return `Medidor ${s.ref ?? ''}`.trim()
  const ref = s.instrumento && Object.hasOwn(doc.piezas, s.instrumento) ? doc.piezas[s.instrumento].ref : '?'
  return `Sonda ${s.entrada} de ${ref}`
}

/**
 * Diferencias en el inspector entre una sonda y un medidor rápido: el medidor no repite la fila «Mide» y nombra su botón de quitar.
 */
export function textosInspectorDeSonda(esMedidor: boolean): { mostrarMide: boolean; quitar: string } {
  return { mostrarMide: !esMedidor, quitar: esMedidor ? 'Quitar el medidor' : 'Quitar la sonda' }
}

/** Los pines de la red que mide la sonda, en orden natural («R1:2»), sin los de su propio instrumento. */
export function pinesQueMide(doc: Documento, con: Conexiones, s: Sonda): string[] {
  const red = con.redDeSonda.get(s.id)
  const r = red === undefined ? undefined : con.redes[red]
  if (!r) return []
  return r.pines
    .map(partirClavePin)
    .filter((q) => q.piezaId !== s.instrumento && Object.hasOwn(doc.piezas, q.piezaId))
    .map((q) => [doc.piezas[q.piezaId].ref, q.pinId] as const)
    .sort((a, b) => ordenRef(a[0], b[0]) || a[1].localeCompare(b[1], 'es', { numeric: true }))
    .map(([ref, pin]) => `${ref}:${pin}`)
}

/** El globo de la sonda bajo el ratón: qué es, qué mide y cómo se mueve; null si no existe. */
export function globoDeSonda(doc: Documento, con: Conexiones, id: Id): string | null {
  const s = doc.sondas?.[id]
  if (!s || !Object.hasOwn(doc.sondas!, id)) return null
  const nombre = nombreLargoDeSonda(doc, s)
  if (!con.redDeSonda.has(id)) return `${nombre} · No toca ningún cable ni pin: arrástrala a uno.`
  const pines = pinesQueMide(doc, con, s)
  const red = con.redes[con.redDeSonda.get(id)!]
  const que = pines.length > 4 ? `${pines.slice(0, 3).join(', ')} y ${pines.length - 3} más` : pines.length ? enumerar(pines) : (red?.nombre ?? 'un cable')
  return `${nombre} · Mide la red de ${que}. Arrástrala por la red; Supr la quita.`
}

/** Las otras etiquetas con la misma llave de nombre que `id` (las que se unen con ella sin cable), en orden de id. */
export function etiquetasHermanas(doc: Documento, id: Id): Id[] {
  const e = Object.hasOwn(doc.etiquetas, id) ? doc.etiquetas[id] : undefined
  if (!e || !e.nombre.trim()) return []
  const k = claveDeNombre(e.nombre)
  return Object.values(doc.etiquetas)
    .filter((x) => x.id !== id && x.nombre.trim() && claveDeNombre(x.nombre) === k)
    .map((x) => x.id)
    .sort()
}

/**
 * Globo de una etiqueta puesta a mano: nombre, cuántas tienen ese nombre (misma red), qué pines une y cómo cambiarlo.
 */
export function globoDeEtiqueta(doc: Documento, con: Conexiones, id: Id): string[] | null {
  const e = Object.hasOwn(doc.etiquetas, id) ? doc.etiquetas[id] : undefined
  if (!e) return null
  const n = etiquetasHermanas(doc, id).length + 1
  const lineas = [e.nombre]
  lineas.push(n > 1 ? `${n} etiquetas con este nombre: es la misma red.` : 'Una sola etiqueta con este nombre: otra igual la uniría sin cable.')
  const red = con.redDeEtiqueta.get(id)
  const r = red === undefined ? undefined : con.redes[red]
  if (r && n > 1) {
    const pines = r.pines
      .map(partirClavePin)
      .filter((q) => Object.hasOwn(doc.piezas, q.piezaId))
      .map((q) => [doc.piezas[q.piezaId].ref, q.pinId] as const)
      .sort((a, b) => ordenRef(a[0], b[0]) || a[1].localeCompare(b[1], 'es', { numeric: true }))
      .map(([ref, pin]) => `${ref}:${pin}`)
    if (pines.length) lineas.push(`Une ${pines.length > 4 ? `${pines.slice(0, 3).join(', ')} y ${pines.length - 3} más` : enumerar(pines)}.`)
  }
  lineas.push('Doble clic en el nombre para cambiarlo.')
  return lineas
}

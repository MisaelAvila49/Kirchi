import { CANALES } from '../instrumentos/ajustes'
import { coordenadaValida } from './limites'
import type { Documento, Id, SentidoSonda, Sonda, TipoSonda } from './tipos'

/** Sondas de medición compartidas por archivo y editor. La unión con la red está en `conexiones/conexiones.ts`, el dibujo
 * en `lienzo/sondas.ts` y la edición en `editor/sondas.ts`. */

/** Las sondas que admite un circuito al leerse (un `.kir` alterado puede traer miles): las demás se descartan con un aviso. */
export const MAX_SONDAS = 256
export const TIPOS_SONDA: readonly TipoSonda[] = ['osciloscopio', 'multimetro', 'voltaje', 'corriente', 'medidor']
/** Cuánto puede alejarse la pantalla de un medidor de su punto, en unidades de rejilla (como los chips de voltaje). */
export const MAX_PANTALLA_MEDIDOR = 8
const REF_MEDIDOR = /^M[0-9]{1,4}$/
export const esMedidor = (s: Sonda): boolean => s.tipo === 'medidor'
export const hayMedidores = (doc: Pick<Documento, 'sondas'>): boolean => Object.values(sondasDe(doc)).some(esMedidor)
/** Los medidores del documento, en orden de referencia. */
export const medidoresDe = (doc: Pick<Documento, 'sondas'>): Sonda[] => Object.values(sondasDe(doc)).filter(esMedidor)
export const SENTIDOS: readonly SentidoSonda[] = ['derecha', 'izquierda', 'abajo', 'arriba']
/** Las entradas de cada instrumento que admiten sonda. */
export const ENTRADAS_SONDA: Readonly<Record<'osciloscopio' | 'multimetro', readonly string[]>> = { osciloscopio: CANALES, multimetro: ['+', 'COM'] }
/** Un id de pieza como los que admite un `.kir`. */
const ID = /^[A-Za-z0-9_-]{1,64}$/
/** Llaves que, usadas como id, tocan el prototipo de un objeto común o se confunden con sus métodos (como en `archivo/kir.ts`). */
const ID_RESERVADO = new Set(['__proto__', 'constructor', 'prototype', 'toString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable', 'toLocaleString'])

export type SondaDeInstrumento = Sonda & { tipo: 'osciloscopio' | 'multimetro'; instrumento: Id; entrada: string }
export const esDeInstrumento = (s: Sonda): s is SondaDeInstrumento => s.tipo === 'osciloscopio' || s.tipo === 'multimetro'

const SIN_SONDAS: Readonly<Record<Id, Sonda>> = Object.freeze({})
/** Las sondas del documento (un objeto vacío y congelado si no tiene). */
export const sondasDe = (doc: Pick<Documento, 'sondas'>): Readonly<Record<Id, Sonda>> => doc.sondas ?? SIN_SONDAS
export const haySondas = (doc: Pick<Documento, 'sondas'>): boolean => !!doc.sondas && Object.keys(doc.sondas).length > 0
export const sondasDeInstrumento = (doc: Pick<Documento, 'sondas'>, id: Id): Sonda[] => Object.values(sondasDe(doc)).filter((s) => s.instrumento === id)
/** El instrumento de la sonda en `doc` (sin confundir un id con algo del prototipo de los objetos), o undefined. */
export const instrumentoDe = (doc: Pick<Documento, 'piezas'>, s: Sonda) => (s.instrumento !== undefined && Object.hasOwn(doc.piezas, s.instrumento) ? doc.piezas[s.instrumento] : undefined)
export const sondaDeEntrada = (doc: Pick<Documento, 'sondas'>, id: Id, entrada: string): Sonda | undefined =>
  Object.values(sondasDe(doc)).find((s) => s.instrumento === id && s.entrada === entrada)
export const haySondasDeCorriente = (doc: Pick<Documento, 'sondas'>): boolean => Object.values(sondasDe(doc)).some((s) => s.tipo === 'corriente' || (s.tipo === 'medidor' && s.magnitud === 'corriente'))

/** Lo que trae un `.kir` para una sonda: la sonda limpia (solo los campos de su tipo) o por qué se descarta. */
export function leerSonda(s: any, avisos?: string[]): { valor: Sonda } | { error: string } {
  if (!TIPOS_SONDA.includes(s?.tipo)) return { error: 'tipo de sonda desconocido' }
  if (!Number.isInteger(s.x) || !Number.isInteger(s.y)) return { error: 'posición no entera' }
  if (!coordenadaValida(s.x, s.y)) return { error: 'posición fuera de rango' }
  const base: Sonda = { id: s.id, tipo: s.tipo, x: s.x, y: s.y }
  if (s.tipo === 'voltaje') return { valor: base }
  if (s.tipo === 'medidor') {
    if (s.magnitud !== 'voltaje' && s.magnitud !== 'corriente') return { error: 'magnitud inválida' }
    if (s.modo !== 'dc' && s.modo !== 'ac') return { error: 'modo inválido' }
    if (typeof s.ref !== 'string' || !REF_MEDIDOR.test(s.ref)) return { error: 'referencia inválida' }
    // La pantalla puede estar fuera de la rejilla (Alt): cualquier número finito, a centésimas de unidad.
    if (!Number.isFinite(s.pantalla?.dx) || !Number.isFinite(s.pantalla?.dy)) return { error: 'pantalla inválida' }
    const acotar = (n: number) => Math.max(-MAX_PANTALLA_MEDIDOR, Math.min(MAX_PANTALLA_MEDIDOR, Math.round(n * 100) / 100 + 0))
    const pantalla = { dx: acotar(s.pantalla.dx), dy: acotar(s.pantalla.dy) }
    if (Math.abs(pantalla.dx - s.pantalla.dx) > 0.005 || Math.abs(pantalla.dy - s.pantalla.dy) > 0.005) avisos?.push(`Se acercó la pantalla de ${s.ref} a ${MAX_PANTALLA_MEDIDOR} unidades de su punto.`)
    return { valor: { ...base, magnitud: s.magnitud, modo: s.modo, pantalla, ref: s.ref } }
  }
  if (s.tipo === 'corriente') return SENTIDOS.includes(s.sentido) ? { valor: { ...base, sentido: s.sentido } } : { error: 'sentido inválido' }
  if (typeof s.instrumento !== 'string' || !ID.test(s.instrumento) || ID_RESERVADO.has(s.instrumento)) return { error: 'sin instrumento' }
  if (!ENTRADAS_SONDA[s.tipo as 'osciloscopio' | 'multimetro'].includes(s.entrada)) return { error: 'entrada inválida' }
  return { valor: { ...base, instrumento: s.instrumento, entrada: s.entrada } }
}

/** «la sonda A de XSC1», «una sonda de voltaje»: el sujeto de un aviso. */
export function nombreDeSonda(s: Partial<Sonda>, refInstrumento?: string): string {
  if (s.tipo === 'voltaje') return 'una sonda de voltaje'
  if (s.tipo === 'corriente') return 'una sonda de corriente'
  if (s.tipo === 'medidor') return s.ref ? `el medidor ${s.ref}` : 'un medidor'
  if (typeof s.entrada === 'string' && refInstrumento) return `la sonda ${s.entrada} de ${refInstrumento}`
  return 'una sonda'
}

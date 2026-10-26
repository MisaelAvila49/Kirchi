import { normalizar } from '../buscador/buscar'
import type { Documento, Id } from '../doc/tipos'
import { colorDeNivel } from '../lienzo/capaSim'
import { cssRgba, type Paleta } from '../lienzo/paleta'
import { colorDeVoltaje } from '../lienzo/voltajes'
import { textoNivelRed, type Lectura } from '../sim/lectura'
import { formatearMedida, SIN_DATO } from '../valores/valores'
import type { Magnitud } from './colores'
import { magnitudDe, partirCifra } from './lecturas'
import { cifra, estadoEnPalabras, textoPotencia } from './medicion'
import { ordenRef } from './redes'

export interface FilaRedMedida {
  red: number
  nombre: string
  voltaje: string
}

export interface FilaPiezaMedida {
  id: Id
  ref: string
  voltaje: string
  /** Solo en un potenciómetro: `voltaje` es entre extremos y esta es la del cursor. */
  cursor?: string
  corriente: string
  potencia: string
  /** Lo propio del modelo en palabras («activa», «saturado contra V+», «fundido», «9,000 rpm»). */
  estado?: string
  /** Una pieza digital, un 555 o un display: no tiene un voltaje de pieza y la fila solo lleva `estado`. */
  digital?: true
}

/** Las cifras de una fila, cada una una unidad que no se parte; un potenciómetro rotula las suyas. */
export const cifrasDe = (f: FilaPiezaMedida): string[] => (f.digital ? [f.estado ?? SIN_DATO] : [
  ...(f.cursor === undefined ? [f.voltaje, f.corriente, f.potencia] : [`extremos ${f.voltaje}`, `cursor ${f.cursor}`, f.corriente, f.potencia]),
  ...(f.estado === undefined ? [] : [f.estado])
])

export interface VistaMediciones {
  /** «t = 1.25 s · al 100 % del tiempo real». */
  encabezado: string
  redes: FilaRedMedida[]
  piezas: FilaPiezaMedida[]
}

/**
 * Panel Mediciones: redes en el orden de Proyecto con su voltaje y piezas simuladas con voltaje, corriente y potencia. El filtro es el de Proyecto. Sin lectura, null.
 */
export function vistaMediciones(doc: Documento, nombres: Map<number, string>, l: Lectura | null, filtro = ''): VistaMediciones | null {
  if (!l) return null
  const f = normalizar(filtro)
  const pasa = (...t: string[]) => !f || normalizar(t.join(' ')).includes(f)
  const redes: FilaRedMedida[] = []
  for (const [red, nombre] of nombres) {
    const v = l.redes.get(red)
    const d = l.digitales?.get(red)
    if (v === undefined && !d) continue
    const voltaje = v === undefined ? textoNivelRed(d!) : cifra(v, 'V')
    if (pasa(nombre, voltaje)) redes.push({ red, nombre, voltaje })
  }
  const piezas: FilaPiezaMedida[] = []
  for (const [id, m] of l.piezas) {
    const ref = doc.piezas[id]?.ref
    if (ref === undefined) continue
    const estado = estadoEnPalabras(m)
    const digital = m.extra?.tipo === 'digital' || m.extra?.tipo === '555' || m.extra?.tipo === 'display'
    const fila: FilaPiezaMedida = {
      id,
      ref,
      voltaje: cifra(m.v, 'V'),
      ...(m.cursor === undefined ? {} : { cursor: cifra(m.cursor, 'V') }),
      corriente: cifra(m.i, 'A'),
      potencia: textoPotencia(m.p),
      ...(estado === null ? {} : { estado }),
      ...(digital ? { digital: true as const } : {})
    }
    if (pasa(fila.ref, fila.voltaje, fila.cursor ?? '', fila.corriente, fila.potencia, fila.estado ?? '')) piezas.push(fila)
  }
  piezas.sort((a, b) => ordenRef(a.ref, b.ref))
  return { encabezado: `t = ${formatearMedida(l.t, 's')} · al ${Math.round(l.ratio * 100)} % del tiempo real`, redes, piezas }
}

/** Color de la muestra de una red: el de su cable en el lienzo. Se pide solo para las filas que se pintan. */
export function colorDeRed(red: number, l: Lectura, escala: number, paleta: Paleta): string {
  const v = l.redes.get(red)
  const d = l.digitales?.get(red)
  return cssRgba(d ? colorDeNivel(d, v, escala, paleta) : colorDeVoltaje(v ?? NaN, escala, paleta))
}

/** Cifras de una fila como fichas, cada una con su magnitud. Las dos del potenciómetro se miden sin su rótulo. */
export function fichasDe(f: FilaPiezaMedida): { texto: string; magnitud?: Magnitud }[] {
  return cifrasDe(f).map((texto) => {
    const magnitud = magnitudDe(partirCifra(texto.replace(/^(extremos|cursor) /, '')).unidad)
    return magnitud ? { texto, magnitud } : { texto }
  })
}

import { normalizar } from '../buscador/buscar'
import type { Documento, Id } from '../doc/tipos'
import { colorDeNivel } from '../lienzo/capaSim'
import { cssRgba, type Paleta } from '../lienzo/paleta'
import { colorDeVoltaje } from '../lienzo/voltajes'
import { nombreConModelo, propModelo } from '../editor/colocar'
import type { PiezaDef } from '../piezas/tipos'
import { textoNivelRed, type ExtraMedicion, type Lectura } from '../sim/lectura'
import { formatearMedida, SIN_DATO } from '../valores/valores'
import type { Magnitud } from './colores'
import { magnitudDe, partirCifra } from './lecturas'
import { cifra, estadoDeAdc, estadoEnPalabras, formasDeCodigo, textoPotencia, textoRelojAdc, textoRelojMsi, voltajeDeAdc } from './medicion'
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

/** La ficha de un MSI o de un convertidor: cifra grande, sus formas, los bits con su nombre y renglones rotulados. */
export interface FichaLogica {
  id: Id
  ref: string
  /** «Contador binario síncrono · 74HC161». */
  titulo: string
  /** Lo que es la cifra («cuenta», «almacén») o, en el DAC, el código. */
  rotulo: string
  /** El ADC0804: «listo», «convirtiendo» o «en espera», con `tono` para su pastilla. */
  estado?: { texto: string; tono: 'verdeazul' | 'ambar' | 'gris' }
  cifra?: string
  /** Hexadecimal, binario y las salidas sueltas del chip («0x9», «0b1001», «RCO 0»). */
  formas: string[]
  /** Del más al menos significativo. */
  bits: { nombre: string; valor: '0' | '1' }[]
  renglones: { rotulo: string; valor: string }[]
}

export interface VistaMediciones {
  /** «t = 1.25 s · al 100 % del tiempo real». */
  encabezado: string
  redes: FilaRedMedida[]
  piezas: FilaPiezaMedida[]
  /** Los MSI y los convertidores con su ficha; no están en `piezas`. */
  logica: FichaLogica[]
}

const SALIDAS_SUELTAS_MAX = 2

/** La ficha de una pieza con registro o convertidor; null si no es de las que la llevan. */
export function fichaLogica(id: Id, ref: string, titulo: string, x: ExtraMedicion | undefined): FichaLogica | null {
  if (x?.tipo === 'digital' && x.modelo === 'msi' && x.registro) {
    const r = x.registro
    const f = formasDeCodigo(r.valor, r.bits)
    const bits = r.nombres.map((nombre, b) => ({ nombre, valor: (r.valor !== null && (r.valor >> b) & 1 ? '1' : '0') as '0' | '1' })).reverse()
    // Las salidas que no son un bit del registro (RCO, QH') se dicen aparte, si son pocas.
    const sueltas = x.pines.filter((p) => p.salida && !r.nombres.includes(p.nombre ?? p.id))
    return {
      id, ref, titulo, rotulo: r.clase, cifra: f.decimal,
      formas: [...(r.valor === null ? [] : [f.hex, f.bin]), ...(sueltas.length <= SALIDAS_SUELTAS_MAX ? sueltas.map((p) => `${p.nombre ?? p.id} ${p.nivel}`) : [])],
      bits: r.valor === null ? [] : bits,
      renglones: r.reloj ? [{ rotulo: 'Reloj', valor: textoRelojMsi(r.reloj) }] : []
    }
  }
  if (x?.tipo === 'convertidor-ad') {
    const f = formasDeCodigo(x.codigo, x.bits)
    const v = voltajeDeAdc(x)
    const e = estadoDeAdc(x)
    return {
      id, ref, titulo, rotulo: '', estado: { texto: e, tono: e === 'listo' ? 'verdeazul' : e === 'convirtiendo' ? 'ambar' : 'gris' },
      cifra: f.decimal, formas: x.codigo === null ? [] : [f.hex, f.bin], bits: [],
      renglones: [
        { rotulo: 'Representa', valor: v === null ? SIN_DATO : `${cifra(v, 'V')} de ${cifra(x.vref!, 'V')}` },
        { rotulo: 'INTR', valor: x.intr },
        { rotulo: 'Reloj', valor: textoRelojAdc(x.reloj) }
      ]
    }
  }
  if (x?.tipo === 'convertidor-da') return { id, ref, titulo, rotulo: `código ${x.codigo}`, formas: [], bits: [], renglones: [{ rotulo: 'Corriente IO', valor: cifra(x.io, 'A') }] }
  return null
}

/**
 * Panel Mediciones: redes en el orden de Proyecto con su voltaje y piezas simuladas con voltaje, corriente y potencia. El filtro es el de Proyecto. Sin lectura, null.
 */
export function vistaMediciones(doc: Documento, nombres: Map<number, string>, l: Lectura | null, filtro = '', lib?: Map<string, PiezaDef>): VistaMediciones | null {
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
  const logica: FichaLogica[] = []
  for (const [id, m] of l.piezas) {
    const ref = doc.piezas[id]?.ref
    if (ref === undefined) continue
    const def = lib?.get(doc.piezas[id].tipo)
    const elegido = def ? doc.piezas[id].props[propModelo(def)?.id ?? ''] : undefined
    const ficha = fichaLogica(id, ref, def ? nombreConModelo(def, elegido) : ref, m.extra)
    if (ficha) {
      if (pasa(ref, ficha.titulo, ficha.cifra ?? '', ficha.rotulo, ficha.estado?.texto ?? '', ...ficha.formas, ...ficha.renglones.flatMap((r) => [r.rotulo, r.valor]))) logica.push(ficha)
      continue
    }
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
  logica.sort((a, b) => ordenRef(a.ref, b.ref))
  return { encabezado: `t = ${formatearMedida(l.t, 's')} · al ${Math.round(l.ratio * 100)} % del tiempo real`, redes, piezas, logica }
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

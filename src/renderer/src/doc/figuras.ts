import { TINTAS } from './formato'
import { coordenadaValida, LIMITE_COORDENADA } from './limites'
import type { Documento, Figura, Grosor, Id, Opacidad, Punta, Tinta, TipoFigura, Trazo } from './tipos'

/** Figuras de dibujo compartidas por archivo y editor: tipos, estilo de omisión, lectura de un `.kir` y orden. Dibujo en
 * `lienzo/figuras.ts`, edición en `editor/figuras.ts`. */

/** Tope de figuras al leer un `.kir` alterado: las que sobran se descartan con aviso. El dibujo tiene además su
 * presupuesto (`lienzo/figuras.ts`). */
export const MAX_FIGURAS = 5000

export const TIPOS_FIGURA: readonly TipoFigura[] = ['linea', 'rectangulo', 'elipse', 'flecha']
export const GROSORES: readonly Grosor[] = [0.25, 0.35, 0.5, 0.7]
export const TRAZOS_FIGURA: readonly Trazo[] = ['continuo', 'guiones', 'puntos']
export const PUNTAS: readonly Punta[] = ['llena', 'abierta', 'dos']
/** Del más opaco al más tenue, como en el inspector. */
export const OPACIDADES: readonly Opacidad[] = [100, 75, 50, 25]

export const NOMBRE_FIGURA: Readonly<Record<TipoFigura, string>> = { linea: 'Línea', rectangulo: 'Rectángulo', elipse: 'Elipse', flecha: 'Flecha' }
export const NOMBRE_TRAZO: Readonly<Record<Trazo, string>> = { continuo: 'Continuo', guiones: 'Guiones', puntos: 'Puntos' }
export const NOMBRE_PUNTA: Readonly<Record<Punta, string>> = { llena: 'Llena', abierta: 'Abierta', dos: 'Dos puntas' }

/** El estilo completo de una figura, con lo de omisión donde no trae nada. */
export interface EstiloFigura {
  tinta: Tinta
  grosor: Grosor
  trazo: Trazo
  relleno: boolean
  punta: Punta
  opacidad: Opacidad
}

/** Valores de omisión: gris, 0.25 mm, continuo, sin relleno, punta llena y opaca. */
export const ESTILO_POR_OMISION: Readonly<EstiloFigura> = Object.freeze({ tinta: 'gris', grosor: 0.25, trazo: 'continuo', relleno: false, punta: 'llena', opacidad: 100 })

/** El rectángulo y la elipse tienen caja (y admiten relleno); la línea y la flecha tienen dos extremos. */
export const conCaja = (t: TipoFigura): boolean => t === 'rectangulo' || t === 'elipse'

export function estiloDe(f: Figura): EstiloFigura {
  const o = ESTILO_POR_OMISION
  return { tinta: f.tinta ?? o.tinta, grosor: f.grosor ?? o.grosor, trazo: f.trazo ?? o.trazo, relleno: f.relleno === true, punta: f.punta ?? o.punta, opacidad: f.opacidad ?? o.opacidad }
}

/** La figura con `cambio` aplicado: guarda solo lo que difiere de lo de omisión y solo lo que admite su tipo. */
export function conEstilo(f: Figura, cambio: Partial<EstiloFigura>): Figura {
  const e = { ...estiloDe(f), ...cambio }
  const o = ESTILO_POR_OMISION
  const { tinta: _t, grosor: _g, trazo: _z, relleno: _r, punta: _p, opacidad: _o, ...base } = f
  return {
    ...base,
    ...(e.tinta !== o.tinta ? { tinta: e.tinta } : {}),
    ...(e.grosor !== o.grosor ? { grosor: e.grosor } : {}),
    ...(e.trazo !== o.trazo ? { trazo: e.trazo } : {}),
    ...(e.relleno && conCaja(f.tipo) ? { relleno: true as const } : {}),
    ...(e.punta !== 'llena' && f.tipo === 'flecha' ? { punta: e.punta } : {}),
    ...(e.opacidad !== 100 ? { opacidad: e.opacidad } : {})
  }
}

/** La caja del rectángulo o la elipse con sus esquinas en orden; la línea y la flecha (y una caja ya en orden) tal cual. */
export function normalizarCaja(f: Figura): Figura {
  if (!conCaja(f.tipo)) return f
  const x1 = Math.min(f.x1, f.x2), x2 = Math.max(f.x1, f.x2), y1 = Math.min(f.y1, f.y2), y2 = Math.max(f.y1, f.y2)
  return x1 === f.x1 && x2 === f.x2 && y1 === f.y1 && y2 === f.y2 ? f : { ...f, x1, y1, x2, y2 }
}

/** Una caja con ancho y alto, o una línea de dos puntos distintos. */
export function tieneTamaño(f: Pick<Figura, 'tipo' | 'x1' | 'y1' | 'x2' | 'y2'>): boolean {
  return conCaja(f.tipo) ? f.x1 !== f.x2 && f.y1 !== f.y2 : f.x1 !== f.x2 || f.y1 !== f.y2
}

const SIN_FIGURAS: Readonly<Record<Id, Figura>> = Object.freeze({})
/** Las figuras del documento (un objeto vacío y congelado si no tiene). */
export const figurasDe = (doc: Pick<Documento, 'figuras'>): Readonly<Record<Id, Figura>> => doc.figuras ?? SIN_FIGURAS
export const hayFiguras = (doc: Pick<Documento, 'figuras'>): boolean => !!doc.figuras && Object.keys(doc.figuras).length > 0

/** De la del fondo a la del frente; a igual orden, por id (el archivo ordena las llaves, así que el orden de alta no sirve). */
export const porOrden = (a: Figura, b: Figura): number => a.orden - b.orden || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
export const enOrden = (doc: Pick<Documento, 'figuras'>): Figura[] => Object.values(figurasDe(doc)).sort(porOrden)

/** El orden de una figura nueva: al frente de las que hay. */
export function siguienteOrden(doc: Pick<Documento, 'figuras'>): number {
  let m = -1
  const fs = figurasDe(doc)
  for (const id in fs) if (fs[id].orden > m) m = fs[id].orden
  return m + 1
}

/** Orden de la primera de `n` figuras nuevas al frente. Si pasara el límite del archivo (se descartaría al reabrir),
 * renumera desde 0 solo las que cambian. */
export function ordenesAlFrente(doc: Pick<Documento, 'figuras'>, n: number): { primero: number; renumeradas: Figura[] } {
  const primero = siguienteOrden(doc)
  if (primero + n - 1 <= LIMITE_COORDENADA) return { primero, renumeradas: [] }
  const todas = enOrden(doc)
  return { primero: todas.length, renumeradas: todas.flatMap((f, i) => (f.orden === i ? [] : [{ ...f, orden: i }])) }
}

const ent = Number.isInteger
const tiene = (o: object, k: string) => Object.hasOwn(o, k)

/** Una figura de un `.kir`. Tipo, extremos enteros dentro del mundo y tamaño son obligatorios; orden y estilo inválidos se
 * descartan con aviso. Lo de omisión escrito se lee como ausente. */
export function leerFigura(v: unknown): { figura: Figura; avisos: string[] } | { error: string } {
  if (typeof v !== 'object' || v === null) return { error: 'tipo de figura desconocido' }
  const f = v as Record<string, unknown>
  if (typeof f.tipo !== 'string' || !(TIPOS_FIGURA as readonly string[]).includes(f.tipo)) return { error: 'tipo de figura desconocido' }
  const tipo = f.tipo as TipoFigura
  // Con Alt se mueven fuera de la rejilla: números finitos, a centésimas de unidad.
  const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
  if (!fin(f.x1) || !fin(f.y1) || !fin(f.x2) || !fin(f.y2)) return { error: 'posición no válida' }
  const [x1, y1, x2, y2] = [f.x1, f.y1, f.x2, f.y2].map((v) => Math.round(v * 100) / 100 + 0)
  if (!coordenadaValida(x1, y1, x2, y2)) return { error: 'posición fuera de rango' }
  if (!tieneTamaño({ tipo, x1, y1, x2, y2 })) return { error: 'no tiene tamaño' }
  const avisos: string[] = []
  const descartar = (campo: string, motivo: string) => avisos.push(`Se descartó «${campo}» de una figura: ${motivo}.`)
  let orden = 0
  if (tiene(f, 'orden')) {
    const tope = LIMITE_COORDENADA.toLocaleString('en-US')
    if (ent(f.orden) && Math.abs(f.orden as number) <= LIMITE_COORDENADA) orden = f.orden as number
    else descartar('orden', ent(f.orden) ? `debe ser un entero de −${tope} a ${tope}` : 'debe ser un entero')
  }
  const estilo: Partial<EstiloFigura> = {}
  if (tiene(f, 'tinta')) {
    if ((TINTAS as readonly unknown[]).includes(f.tinta)) estilo.tinta = f.tinta as Tinta
    else descartar('tinta', 'debe ser una de las cinco tintas')
  }
  if (tiene(f, 'grosor')) {
    if ((GROSORES as readonly unknown[]).includes(f.grosor)) estilo.grosor = f.grosor as Grosor
    else descartar('grosor', 'debe ser 0.25, 0.35, 0.5 o 0.7')
  }
  if (tiene(f, 'trazo')) {
    if ((TRAZOS_FIGURA as readonly unknown[]).includes(f.trazo)) estilo.trazo = f.trazo as Trazo
    else descartar('trazo', 'debe ser continuo, guiones o puntos')
  }
  // `relleno: false` es lo de omisión escrito: pasa sin aviso.
  if (tiene(f, 'relleno') && f.relleno !== false) {
    if (f.relleno === true && conCaja(tipo)) estilo.relleno = true
    else descartar('relleno', 'solo admite true en un rectángulo o una elipse')
  }
  if (tiene(f, 'punta')) {
    if (tipo === 'flecha' && (PUNTAS as readonly unknown[]).includes(f.punta)) estilo.punta = f.punta as Punta
    else descartar('punta', 'solo va en una flecha')
  }
  if (tiene(f, 'opacidad')) {
    if ((OPACIDADES as readonly unknown[]).includes(f.opacidad)) estilo.opacidad = f.opacidad as Opacidad
    else descartar('opacidad', 'debe ser 25, 50, 75 o 100')
  }
  const base = normalizarCaja({ id: f.id as Id, tipo, x1, y1, x2, y2, orden })
  return { figura: conEstilo(base, estilo), avisos }
}

import { clavePin, type Conexiones } from '../conexiones/conexiones'
import type { Documento, Id, Pieza } from '../doc/tipos'
import { terminalesDeAlimentacion } from '../netlist/netlist'
import type { AbsolutoDef, PiezaDef } from '../piezas/tipos'
import { formatearMedida, formatearValor, leerValor } from '../valores/valores'
import type { MedicionPieza } from './lectura'

/** Máximos absolutos de la hoja de cada modelo (`limites.absolutos`): se resuelven a redes al cargar, se comparan con una
 * lectura y con los voltajes que fijan las fuentes antes de simular. Los de voltaje miran el último paso y la media (la
 * de una senoidal es cero y escondería un pico de 50 V); los demás, la media, que es lo que calienta. */

/** Cuánto más allá de su máximo tiene que estar una pieza para que, con «Las piezas se queman», se queme (veces su máximo). */
export const FACTOR_QUEMA_ABSOLUTOS = 1.25

/** Un máximo con sus pines ya convertidos en redes del documento (null es la tierra: 0 V). */
export interface AbsolutoResuelto {
  nombre: string
  consejo: string
  unidad: 'V' | 'A' | 'W'
  de?: (number | null)[]
  a?: number | null
  medida?: 'corriente' | 'potencia'
  abs: boolean
  /** Solo avisa: no cuenta para el quemado (el voltaje diferencial de entrada, que una señal real roza sin dañar la pieza). */
  sinQuema?: boolean
  min?: number
  max?: number
  escala: number
}

export interface AbsolutosDePieza {
  /** El nombre de lo que da los máximos («TL081»), para el Registro. */
  modelo: string
  lista: AbsolutoResuelto[]
}

/** El juego de máximos de la opción elegida de la pieza (o el único); undefined si la opción no tiene. */
export function juegoDe(p: Pieza, def: PiezaDef): { modelo: string; fuente: string; limites: AbsolutoDef[] } | undefined {
  const a = def.limites?.absolutos
  if (!a) return undefined
  if (a.prop === undefined) {
    const v = a.valores['*']
    return v ? { modelo: def.nombre.es, ...v } : undefined
  }
  const propDef = def.props.find((d) => d.id === a.prop)
  const guardada = p.props[a.prop]
  const opcion = guardada !== undefined && (!propDef?.opciones || propDef.opciones.includes(guardada)) ? guardada : (propDef?.defecto ?? '')
  return Object.hasOwn(a.valores, opcion) ? { modelo: opcion, ...a.valores[opcion] } : undefined
}

/** Los máximos de la pieza con sus pines en redes; undefined si no tiene o un pin no está en ninguna red. */
export function resolverAbsolutos(p: Pieza, def: PiezaDef, con: Conexiones): AbsolutosDePieza | undefined {
  const juego = juegoDe(p, def)
  if (!juego) return undefined
  const red = (pin: string): number | null | undefined => {
    if (pin === 'tierra') return null
    const r = con.redDePin.get(clavePin(p.id, pin))
    if (r === undefined) return undefined
    return con.redes[r]?.tierra ? null : r
  }
  const lista: AbsolutoResuelto[] = []
  for (const x of juego.limites) {
    const base = { nombre: x.nombre, consejo: x.consejo, abs: x.abs ?? false, ...(x.sinQuema ? { sinQuema: true } : {}), ...(x.min !== undefined ? { min: x.min } : {}), ...(x.max !== undefined ? { max: x.max } : {}), escala: x.escala ?? Math.abs(x.max ?? x.min ?? 1) }
    if (x.medida) {
      lista.push({ ...base, unidad: x.medida === 'corriente' ? 'A' : 'W', medida: x.medida })
      continue
    }
    const de = (Array.isArray(x.de) ? x.de : [x.de!]).map(red)
    const a = red(x.a!)
    // Un pin suelto no tiene red que medir.
    if (a === undefined || de.some((d) => d === undefined)) continue
    lista.push({ ...base, unidad: 'V', de: de as (number | null)[], a })
  }
  return lista.length ? { modelo: juego.modelo, lista } : undefined
}

/** Lo que se pasó de su máximo una pieza: el peor de sus máximos. */
export interface ExcesoAbsoluto {
  texto: string
  registro: (ref: string) => string
  /** Veces su máximo (con `escala`): lo que mide el quemado. */
  veces: number
}

const enRed = (redes: ReadonlyMap<number, number>, r: number | null | undefined): number | undefined => (r === null ? 0 : r === undefined ? undefined : redes.get(r))

/** Cuánto vale el máximo `x` en `redes` (con la medición `m` y la potencia media): su valor y, si lo pasa, cuántas veces
 * su máximo. undefined si no se puede medir (red que la simulación no leyó). */
export function medirAbsoluto(x: AbsolutoResuelto, redes: ReadonlyMap<number, number>, m: MedicionPieza | undefined, potencia: number | undefined): { valor: number; limite: number; arriba: boolean; veces: number } | undefined {
  let valores: number[]
  if (x.medida === 'corriente') {
    if (!m) return undefined
    valores = [m.i]
  } else if (x.medida === 'potencia') {
    const p = potencia ?? (m ? Math.abs(m.p) : undefined)
    if (p === undefined) return undefined
    valores = [p]
  } else {
    const a = enRed(redes, x.a)
    if (a === undefined) return undefined
    valores = []
    for (const d of x.de!) {
      const v = enRed(redes, d)
      if (v !== undefined) valores.push(v - a)
    }
    if (valores.length === 0) return undefined
  }
  let peor: { valor: number; limite: number; arriba: boolean; veces: number } | undefined
  for (const crudo of valores) {
    const valor = x.abs ? Math.abs(crudo) : crudo
    if (x.max !== undefined && valor > x.max) {
      const veces = 1 + (valor - x.max) / x.escala
      if (!peor || veces > peor.veces) peor = { valor, limite: x.max, arriba: true, veces }
    }
    if (x.min !== undefined && valor < x.min) {
      const veces = 1 + (x.min - valor) / x.escala
      if (!peor || veces > peor.veces) peor = { valor, limite: x.min, arriba: false, veces }
    }
  }
  return peor
}

const frase = (x: AbsolutoResuelto, valor: number, limite: number, arriba: boolean, modelo: string): ExcesoAbsoluto['registro'] => (ref) => {
  const unidad = x.unidad
  if (unidad === 'V') {
    return `${ref} tiene ${formatearMedida(valor, 'V')} de ${x.nombre}, ${arriba ? 'más' : 'menos'} de los ${formatearValor(limite, 'V')} que admite el ${modelo}: ${x.consejo}`
  }
  return `${ref} ${unidad === 'A' ? 'lleva' : 'disipa'} ${formatearMedida(valor, unidad)} (${x.nombre}), más de los ${formatearValor(limite, unidad)} que admite el ${modelo}: ${x.consejo}`
}

/** Peor máximo pasado de la pieza con las redes de la lectura media y, si la hay, las del último paso (solo en los de
 * voltaje). null si no pasa ninguno. */
export function excesoAbsoluto(a: AbsolutosDePieza, media: { redes: ReadonlyMap<number, number>; m: MedicionPieza | undefined }, potencia: number | undefined, instantaneas?: ReadonlyMap<number, number>): ExcesoAbsoluto | null {
  let peor: { x: AbsolutoResuelto; r: NonNullable<ReturnType<typeof medirAbsoluto>> } | null = null
  for (const x of a.lista) {
    const r1 = medirAbsoluto(x, media.redes, media.m, potencia)
    if (r1 && (!peor || r1.veces > peor.r.veces)) peor = { x, r: r1 }
    const r2 = instantaneas && x.unidad === 'V' ? medirAbsoluto(x, instantaneas, undefined, undefined) : undefined
    if (r2 && (!peor || r2.veces > peor.r.veces)) peor = { x, r: r2 }
  }
  if (!peor) return null
  const { x, r } = peor
  const unidad = x.unidad
  return { texto: `${x.nombre}: ${formatearMedida(r.valor, unidad)}, ${r.arriba ? 'máximo' : 'mínimo'} ${formatearValor(r.limite, unidad)}`, registro: frase(x, r.valor, r.limite, r.arriba, a.modelo), veces: r.veces }
}

/** Voltajes de redes que las fuentes ya fijan sin simular: tierra, terminales de alimentación y, desde ahí, fuentes de CC
 * y baterías (un extremo da el otro). Una red sin voltaje conocido no está. No es el punto de operación. */
export function voltajesEstaticos(doc: Documento, lib: Map<string, PiezaDef>, con: Conexiones): Map<number, number> {
  const v = new Map<number, number>()
  con.redes.forEach((r, k) => {
    if (r.tierra) v.set(k, 0)
  })
  // Los terminales de alimentación de una red con un solo voltaje fijan esa red; si dos difieren, el conflicto ya lo dice otro aviso.
  for (const [red, ts] of terminalesDeAlimentacion(doc, lib, con).grupos) {
    if (ts.length > 0 && ts.every((t) => t.voltaje === ts[0].voltaje) && !v.has(red)) v.set(red, ts[0].voltaje)
  }
  const fuentes: { a: number; b: number; volts: number }[] = []
  for (const p of Object.values(doc.piezas)) {
    const def = lib.get(p.tipo)
    const m = def?.modelo
    if (!def || m?.tipo !== 'V') continue
    const a = con.redDePin.get(clavePin(p.id, m.a)), b = con.redDePin.get(clavePin(p.id, m.b))
    const texto = p.props[m.prop] ?? def.props.find((d) => d.id === m.prop)?.defecto ?? ''
    const x = leerValor(texto)
    if (a === undefined || b === undefined || !x || !Number.isFinite(x.valor) || (x.unidad && x.unidad !== 'V')) continue
    fuentes.push({ a, b, volts: x.valor })
  }
  // Cada vuelta propaga un eslabón de una cadena de fuentes en serie.
  for (let vuelta = 0; vuelta < fuentes.length; vuelta++) {
    let cambio = false
    for (const f of fuentes) {
      const va = v.get(f.a), vb = v.get(f.b)
      if (va !== undefined && vb === undefined) (v.set(f.b, va - f.volts), (cambio = true))
      else if (vb !== undefined && va === undefined) (v.set(f.a, vb + f.volts), (cambio = true))
    }
    if (!cambio) break
  }
  return v
}

/** Máximos de voltaje que los voltajes fijos ya pasan (un amp-op con 50 V entre alimentaciones, un regulador con más
 * entrada de la que admite). Solo mira los de voltaje con pines en redes de voltaje conocido. */
export function avisosAbsolutosEstaticos(doc: Documento, lib: Map<string, PiezaDef>, con: Conexiones, piezas: readonly Pieza[]): { texto: string; piezas: Id[]; leve: true }[] {
  const conMaximos = piezas.filter((p) => lib.get(p.tipo)?.limites?.absolutos)
  if (conMaximos.length === 0) return []
  const estaticos = voltajesEstaticos(doc, lib, con)
  const salida: { texto: string; piezas: Id[]; leve: true }[] = []
  for (const p of conMaximos) {
    const a = resolverAbsolutos(p, lib.get(p.tipo)!, con)
    if (!a) continue
    for (const x of a.lista) {
      if (x.unidad !== 'V') continue
      const r = medirAbsoluto(x, estaticos, undefined, undefined)
      if (!r) continue
      salida.push({ texto: `${frase(x, r.valor, r.limite, r.arriba, a.modelo)(p.ref)}`.replace(/^(\S+) tiene /, '$1 quedaría con '), piezas: [p.id], leve: true })
      break
    }
  }
  return salida
}

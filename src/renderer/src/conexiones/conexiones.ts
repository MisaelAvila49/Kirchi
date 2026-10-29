import type { Documento, Id, Pieza, Punto } from '../doc/tipos'
import { pinesEnMundo } from '../piezas/transformar'
import type { PiezaDef } from '../piezas/tipos'
import { claveDeNombre } from './nombres'
import { UnionFind } from './unionFind'
import { pinesDe } from '../piezas/sinEquivalencia'

export interface Red {
  id: number
  nombre?: string
  tierra: boolean
  /** Claves «piezaId:pinId», en orden de pieza. */
  pines: string[]
  cables: Id[]
}

export interface Conexiones {
  redes: Red[]
  redDePin: Map<string, number>
  redDeCable: Map<Id, number>
  /** Red en que está cada etiqueta (aunque su nombre no sea el que tomó la red). */
  redDeEtiqueta: Map<Id, number>
  /** Red que mide cada sonda (la de lo que toca en su punto); una sonda en el aire no está. */
  redDeSonda: Map<Id, number>
  /** Sondas cuya entrada ya tiene cable, etiqueta u otro pin: no se unen (juntarían dos redes sin que se vea) y el
   * inspector lo avisa. */
  sondasSinUnir: Id[]
  /** Etiquetas a cuyo punto llega un cable o un pin: el lienzo dibuja su punto lleno; las demás, hueco. */
  etiquetaConectada: Set<Id>
  uniones: Punto[]
}

/** Nombre de un terminal de alimentación sin espacios en los extremos; '' si no es terminal o quedó vacío. Es con el que
 * se une a etiquetas y terminales. */
export function nombreDeTerminal(p: Pieza, def: PiezaDef): string {
  const m = def.modelo
  if (m?.tipo !== 'alimentacion') return ''
  const guardado = p.props[m.nombre]
  return (typeof guardado === 'string' ? guardado : (def.props.find((d) => d.id === m.nombre)?.defecto ?? '')).trim()
}

export const clavePin = (piezaId: Id, pinId: string) => `${piezaId}:${pinId}`
/** Inversa de `clavePin`: los ids de pieza no llevan «:», el id del pin puede llevarlo (se parte en el primero). */
export const partirClavePin = (clave: string): { piezaId: Id; pinId: string } => {
  const i = clave.indexOf(':')
  return i < 0 ? { piezaId: clave, pinId: '' } : { piezaId: clave.slice(0, i), pinId: clave.slice(i + 1) }
}
export const porId = <T extends { id: Id }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
/** Los puntos son enteros no negativos; el resto de los nodos del unión-búsqueda usan enteros negativos. */
const TIERRA = -1

/** Primer índice de `a` (ordenado) con a[i] > v. */
function primeroMayor(a: number[], v: number): number {
  let lo = 0, hi = a.length
  while (lo < hi) {
    const m = (lo + hi) >> 1
    if (a[m] > v) hi = m
    else lo = m + 1
  }
  return lo
}

/** Clave numérica de un punto relativa a la caja del documento, para que sea un entero pequeño (los Map son mucho más
 * rápidos). Con caja enorme, desplazamiento fijo de ±2^20. */
function cajaDeClaves(doc: Documento, lib: Map<string, PiezaDef>) {
  let margen = 0
  for (const d of lib.values()) for (const pin of d.pines) margen = Math.max(margen, Math.abs(pin.x), Math.abs(pin.y))
  // Los pines de una caja sin equivalencia viven en la pieza y pueden salirse del margen de la librería.
  for (const id in doc.piezas) {
    const p = doc.piezas[id], d = p.pines && lib.get(p.tipo)
    if (d) for (const pin of pinesDe(p, d)) margen = Math.max(margen, Math.abs(pin.x), Math.abs(pin.y))
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const ver = (x: number, y: number, m = 0) => {
    if (x - m < minX) minX = x - m
    if (x + m > maxX) maxX = x + m
    if (y - m < minY) minY = y - m
    if (y + m > maxY) maxY = y + m
  }
  for (const p of Object.values(doc.piezas)) ver(p.x, p.y, margen)
  for (const e of Object.values(doc.etiquetas)) ver(e.x, e.y)
  for (const c of Object.values(doc.cables)) for (const pt of c.puntos) ver(pt.x, pt.y)
  for (const s of Object.values(doc.sondas ?? {})) ver(s.x, s.y)
  if (minX <= maxX && (maxX - minX + 1) * (maxY - minY + 1) < 2 ** 30) return { minX, minY, alto: maxY - minY + 1 }
  return { minX: -(2 ** 20), minY: -(2 ** 20), alto: 2 ** 21 }
}

export function calcularConexiones(doc: Documento, lib: Map<string, PiezaDef>): Conexiones {
  const { minX, minY, alto } = cajaDeClaves(doc, lib)
  const clave = (x: number, y: number) => (x - minX) * alto + (y - minY)
  const puntoDe = (k: number): Punto => ({ x: Math.floor(k / alto) + minX, y: (k % alto) + minY })
  const uf = new UnionFind()
  const brazos = new Map<number, number>()
  const sumar = (k: number, n: number) => brazos.set(k, (brazos.get(k) ?? 0) + n)
  /** Puntos que se enganchan si un cable pasa por ellos: pines, etiquetas y extremos de cable. */
  const interes = new Set<number>()
  const pines: string[] = []
  const nodosPin: number[] = []
  let nuevo = -2
  let hayTierra = false
  /** Un nodo por nombre de red: lo comparten las etiquetas y los terminales de alimentación que se llaman igual. */
  const nodosNombre = new Map<string, number>()
  // Por la llave del nombre: «−15V» y «-15V», o «+15V» y «15 V», son la misma red (`claveDeNombre`).
  const nodoDeNombre = (nombre: string) => {
    const k = claveDeNombre(nombre)
    let nn = nodosNombre.get(k)
    if (nn === undefined) nodosNombre.set(k, (nn = nuevo--))
    return nn
  }
  /** Terminales de alimentación: su pin (índice en `pines`) y su nombre, para nombrar la red al final. */
  const terminales: { i: number; nombre: string }[] = []

  for (const p of Object.values(doc.piezas).sort(porId)) {
    const def = lib.get(p.tipo)
    if (!def) continue
    for (const pin of pinesEnMundo(p, def)) {
      const kp = clavePin(p.id, pin.id), k = clave(pin.x, pin.y)
      nodosPin.push(k)
      sumar(k, 1)
      interes.add(k)
      pines.push(kp)
      if (def.modelo?.tipo === 'tierra' && def.modelo.pin === pin.id) {
        uf.unir(k, TIERRA)
        hayTierra = true
      } else if (def.modelo?.tipo === 'alimentacion' && def.modelo.pin === pin.id) {
        const nombre = nombreDeTerminal(p, def)
        if (nombre) {
          uf.unir(k, nodoDeNombre(nombre))
          terminales.push({ i: pines.length - 1, nombre })
        }
      }
    }
  }

  // Las etiquetas conectan pero no suman brazos: no producen puntos de unión.
  const etiquetas = Object.values(doc.etiquetas).sort(porId)
  const nodosEtiqueta: number[] = []
  for (const e of etiquetas) {
    const k = clave(e.x, e.y)
    const ne = k
    nodosEtiqueta.push(ne)
    const nombre = e.nombre.trim()
    if (nombre) {
      uf.unir(ne, nodoDeNombre(nombre))
    }
    interes.add(k)
  }

  // Normaliza: sin puntos consecutivos repetidos; un cable con menos de 2 puntos distintos no existe.
  const cables: { id: Id; puntos: Punto[]; nodo: number }[] = []
  for (const c of Object.values(doc.cables).sort(porId)) {
    const puntos = c.puntos.filter((pt, i) => i === 0 || pt.x !== c.puntos[i - 1].x || pt.y !== c.puntos[i - 1].y)
    if (puntos.length >= 2) cables.push({ id: c.id, puntos, nodo: clave(puntos[0].x, puntos[0].y) })
  }
  for (const c of cables) {
    const ultimo = c.puntos.length - 1
    c.puntos.forEach((pt, i) => {
      const k = clave(pt.x, pt.y)
      uf.unir(c.nodo, k)
      if (i === 0 || i === ultimo) {
        sumar(k, 1)
        interes.add(k)
      } else sumar(k, 2)
    })
  }

  // Sondas: cada una se ancla a lo que toca en su punto, con la regla de `anclaDeSonda` (conexiones/anclas.ts):
  // un pin, el ancla de una etiqueta o un vértice de cable son ya un nodo; si no, el interior de un tramo, el del cable de
  // menor id. El punto NO entra a `interes`: dos cables que se cruzan sin unión donde hay una sonda siguen separados.
  const sondas = doc.sondas ? Object.values(doc.sondas).sort(porId) : []
  const anclaDe = new Map<Id, number>()
  const sondasFila = new Map<number, { v: number; id: Id }[]>()
  const sondasColumna = new Map<number, { v: number; id: Id }[]>()
  if (sondas.length) {
    // Los puntos de las sondas que ya son un nodo (un pin, un ancla o un vértice): se buscan en un mapa de pocas llaves, sin
    // armar el conjunto de todos los puntos del dibujo.
    const enPunto = new Map<number, Id[]>()
    for (const s of sondas) {
      const k = clave(s.x, s.y)
      const l = enPunto.get(k)
      if (l) l.push(s.id)
      else enPunto.set(k, [s.id])
    }
    const anclar = (k: number) => {
      const l = enPunto.get(k)
      if (l) for (const id of l) anclaDe.set(id, k)
    }
    for (const k of nodosPin) anclar(k)
    for (const k of nodosEtiqueta) anclar(k)
    for (const c of cables) for (const pt of c.puntos) anclar(clave(pt.x, pt.y))
    for (const s of sondas) {
      if (anclaDe.has(s.id)) continue
      const f = sondasFila.get(s.y)
      if (f) f.push({ v: s.x, id: s.id })
      else sondasFila.set(s.y, [{ v: s.x, id: s.id }])
      const col = sondasColumna.get(s.x)
      if (col) col.push({ v: s.y, id: s.id })
      else sondasColumna.set(s.x, [{ v: s.y, id: s.id }])
    }
    for (const a of sondasFila.values()) a.sort((p, q) => p.v - q.v)
    for (const a of sondasColumna.values()) a.sort((p, q) => p.v - q.v)
  }
  /** Las sondas en el interior del tramo de `desde` a `hasta` (sin los extremos) de la fila o columna `lista` quedan en `nodo`. */
  const anclarEnTramo = (lista: { v: number; id: Id }[] | undefined, desde: number, hasta: number, nodo: number) => {
    if (!lista) return
    let lo = 0, hi = lista.length
    while (lo < hi) {
      const m = (lo + hi) >> 1
      if (lista[m].v > desde) hi = m
      else lo = m + 1
    }
    for (let j = lo; j < lista.length && lista[j].v < hasta; j++) if (!anclaDe.has(lista[j].id)) anclaDe.set(lista[j].id, nodo)
  }

  // Puntos de interés por fila y por columna, ordenados, para buscar los que cada tramo atraviesa.
  const filas = new Map<number, number[]>()
  const columnas = new Map<number, number[]>()
  for (const k of interes) {
    const { x, y } = puntoDe(k)
    const f = filas.get(y)
    if (f) f.push(x)
    else filas.set(y, [x])
    const c = columnas.get(x)
    if (c) c.push(y)
    else columnas.set(x, [y])
  }
  for (const a of filas.values()) a.sort((p, q) => p - q)
  for (const a of columnas.values()) a.sort((p, q) => p - q)

  for (const c of cables) {
    for (let i = 1; i < c.puntos.length; i++) {
      const a = c.puntos[i - 1], b = c.puntos[i]
      let lista: number[] | undefined, desde: number, hasta: number
      const horizontal = a.y === b.y
      if (horizontal) {
        lista = filas.get(a.y)
        desde = Math.min(a.x, b.x)
        hasta = Math.max(a.x, b.x)
      } else if (a.x === b.x) {
        lista = columnas.get(a.x)
        desde = Math.min(a.y, b.y)
        hasta = Math.max(a.y, b.y)
      } else continue
      if (sondasFila.size) anclarEnTramo(horizontal ? sondasFila.get(a.y) : sondasColumna.get(a.x), desde, hasta, c.nodo)
      if (!lista) continue
      for (let j = primeroMayor(lista, desde); j < lista.length && lista[j] < hasta; j++) {
        const k = horizontal ? clave(lista[j], a.y) : clave(a.x, lista[j])
        uf.unir(c.nodo, k)
        sumar(k, 2)
      }
    }
  }

  // La entrada de cada instrumento con sonda queda en la red del punto, como si un cable las uniera. Solo la de un instrumento del
  // tipo de la sonda (un archivo alterado no cablea la entrada A de una compuerta) y solo si a la entrada no llega nada más.
  const sondasSinUnir: Id[] = []
  const anclasEtiqueta = sondas.length ? new Set(nodosEtiqueta) : null
  for (const s of sondas) {
    const ancla = anclaDe.get(s.id)
    if (ancla === undefined || (s.tipo !== 'osciloscopio' && s.tipo !== 'multimetro') || !s.instrumento || !Object.hasOwn(doc.piezas, s.instrumento)) continue
    const p = doc.piezas[s.instrumento]
    const def = lib.get(p.tipo)
    const m = def?.modelo
    const entradas = m?.tipo === 'osciloscopio' ? m.entradas : m?.tipo === 'multimetro' ? [m.mas, m.com] : []
    if (m?.tipo !== s.tipo || !entradas.includes(s.entrada ?? '')) continue
    const pin = pinesEnMundo(p, def!).find((q) => q.id === s.entrada)
    if (!pin) continue
    const kp = clave(pin.x, pin.y)
    if (kp !== ancla && ((brazos.get(kp) ?? 0) > 1 || anclasEtiqueta!.has(kp))) {
      sondasSinUnir.push(s.id)
      continue
    }
    uf.unir(kp, ancla)
  }

  const porRaiz = new Map<number, Red>()
  const redes: Red[] = []
  const red = (raiz: number) => {
    let r = porRaiz.get(raiz)
    if (!r) {
      r = { id: redes.length, tierra: false, pines: [], cables: [] }
      porRaiz.set(raiz, r)
      redes.push(r)
    }
    return r
  }
  const redDePin = new Map<string, number>()
  const redDeCable = new Map<Id, number>()
  for (let i = 0; i < pines.length; i++) {
    const kp = pines[i]
    const r = red(uf.buscar(nodosPin[i]))
    r.pines.push(kp)
    redDePin.set(kp, r.id)
  }
  for (const c of cables) {
    const r = red(uf.buscar(c.nodo))
    r.cables.push(c.id)
    redDeCable.set(c.id, r.id)
  }
  if (hayTierra) {
    const r = porRaiz.get(uf.buscar(TIERRA))
    if (r) r.tierra = true
  }
  const redDeEtiqueta = new Map<Id, number>()
  const etiquetaConectada = new Set<Id>()
  for (let i = 0; i < etiquetas.length; i++) {
    const e = etiquetas[i]
    if ((brazos.get(nodosEtiqueta[i]) ?? 0) > 0) etiquetaConectada.add(e.id)
    const nombre = e.nombre.trim()
    const r = porRaiz.get(uf.buscar(nodosEtiqueta[i]))
    if (r) redDeEtiqueta.set(e.id, r.id)
    if (nombre && r && (r.nombre === undefined || nombre < r.nombre)) r.nombre = nombre
  }

  // Un terminal nombra su red igual que una etiqueta: gana el menor de los nombres.
  for (const t of terminales) {
    const r = porRaiz.get(uf.buscar(nodosPin[t.i]))
    if (r && (r.nombre === undefined || t.nombre < r.nombre)) r.nombre = t.nombre
  }

  const redDeSonda = new Map<Id, number>()
  for (const [id, ancla] of anclaDe) {
    const r = porRaiz.get(uf.buscar(ancla))
    if (r) redDeSonda.set(id, r.id)
  }

  const uniones: Punto[] = []
  for (const [k, n] of brazos) {
    if (n < 3) continue
    uniones.push(puntoDe(k))
  }
  uniones.sort((a, b) => a.x - b.x || a.y - b.y)
  return { redes, redDePin, redDeCable, redDeEtiqueta, redDeSonda, sondasSinUnir, etiquetaConectada, uniones }
}

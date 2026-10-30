/** Trazado de una importación con dibujo: los cables del original llevados a la rejilla, sus terminales, tierras y etiquetas
 * en su lugar, y solo lo que falta se une con el enrutador o con una marca junto al pin. Así el esquema se reconoce. */
import { anclaDeSonda } from '../conexiones/anclas'
import { calcularConexiones, clavePin, nombreDeTerminal, type Conexiones } from '../conexiones/conexiones'
import { claveDeNombre } from '../conexiones/nombres'
import type { GeneradorId } from '../doc/ids'
import type { Cable, Documento, Etiqueta, Id, Pieza, Punto, Rotacion } from '../doc/tipos'
import { cuerpoEnMundo, SEPARACION } from '../editor/colision'
import { piezaCruzada, tramoCruzaCaja } from '../editor/conflictos'
import { giroDeEtiqueta, mejorGiro } from '../editor/etiquetaEnTramo'
import { cajasSeCruzan, cajaTexto } from '../lienzo/apartar'
import { rotulosDePieza } from '../lienzo/etiquetas'
import { cajaEtiqueta } from '../lienzo/medidas'
import { enrutar, rutaLibre } from '../editor/enrutar'
import { limpiarPolilinea, PASO_REJILLA } from '../editor/rutas'
import { pinesEnMundo } from '../piezas/transformar'
import type { PiezaDef } from '../piezas/tipos'
import type { PuntoAjeno } from './ajeno'

/** Cómo se nombra una red en el esquema: con tierras, con terminales de alimentación, con etiquetas o con nada. */
export type ClaseRed = 'tierra' | 'alimentacion' | 'etiqueta' | 'ninguna'

export interface RedTrazado {
  /** Nombre de etiqueta, único entre las redes. */
  nombre: string
  /** Nombre de los terminales de la red (clase alimentación). */
  marca: string
  clase: ClaseRed
  pines: { pieza: Pieza; pin: string }[]
}

/** Un pin de una pieza ya colocada, con el punto donde estaba en el origen. */
export interface PinOriginal {
  x: number
  y: number
  pieza: Pieza
  pin: string
  red: number
}

/** Terminal, tierra o etiqueta del origen; `pieza` si ya es una pieza de Kirchi (riel de Falstad). `red` -1: se ignora. */
export interface MarcaOriginal {
  x: number
  y: number
  red: number
  tipo: 'alimentacion' | 'tierra' | 'etiqueta'
  /** Hacia dónde crecía la etiqueta en el origen, en grados antihorarios. */
  giro?: number
  pieza?: Pieza
}

export interface EntradaTrazado {
  doc: Documento
  lib: Map<string, PiezaDef>
  gen: GeneradorId
  /** Del origen a unidades de Kirchi, ya a escala y desplazado, con decimales. */
  proyectar: (x: number, y: number) => Punto
  cables: PuntoAjeno[][]
  uniones: PuntoAjeno[]
  pines: PinOriginal[]
  marcas: MarcaOriginal[]
  redes: RedTrazado[]
  nuevaPieza: (tipo: 'tierra' | 'alimentacion', props: Record<string, string>) => Pieza
  presupuestoMs?: number
}

export interface ResultadoTrazado {
  cables: Cable[]
  etiquetas: Etiqueta[]
  /** Terminales y tierras puestos (los del origen ya en su lugar y los nuevos). */
  marcas: Pieza[]
  /** Piezas de marca del origen que no se pusieron (su trozo de dibujo no llevaba a ningún pin). */
  quitadas: Set<Id>
  conEtiqueta: { nombre: string; piezas: string[] }[]
  avisos: string[]
}

/** Un pin que en Kirchi quedó más lejos que esto del punto del original no usa el trozo de cable del original si su red se
 * nombra con marcas: lleva su propia marca junto al pin (el terminal V+ de un amp-op cuyo V+ quedó del otro lado). */
const DESPEGAR = 6
/** Distancia hasta la que un trozo sin marca de una red nombrada se une con cable; más lejos lleva su propia marca. */
const UNIR_NOMBRADA = 16
const PRESUPUESTO_MS = 20000
const FALLOS_SEGUIDOS = 3
/** Tramos oblicuos cuyos puntos se revisan uno a uno (cuadrático): más allá, un tramo oblicuo no une lo que cae sobre él. */
const MAX_OBLICUOS = 500
/** Hasta dónde se corre una etiqueta por su cable en busca de un lado libre, en unidades. */
const ALCANCE_ETIQUETA = 16
/** Largo que se reserva tras el nombre de un terminal para su voltaje ("-15 V"), en unidades. */
const VOLTAJE_TRAS_NOMBRE = 7
/** Un cable del origen que se aleja más que esto del esquema (unidades de Kirchi, 250 m) es un dato roto y se descarta. */
const LIMITE_COORDENADA = 1e5
/** Un cable del origen con más vértices que esto es un dato roto y se descarta. */
const MAX_VERTICES = 20000
const LARGOS_TRAMO = [2, 4, 6, 8, 12, 16]
const ROTACIONES: Rotacion[] = [0, 90, 180, 270]

const par = (v: number): number => Math.round(v / PASO_REJILLA) * PASO_REJILLA + 0
const kp = (p: Punto): string => `${p.x},${p.y}`
const igual = (a: Punto, b: Punto): boolean => a.x === b.x && a.y === b.y
const distancia = (a: Punto, b: Punto): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
const ko = (x: number, y: number): string => `${Math.round(x * 1000)},${Math.round(y * 1000)}`

/** El punto está en el tramo a→b (horizontal o vertical), extremos incluidos. */
function enTramo(p: Punto, a: Punto, b: Punto): boolean {
  if (a.y === b.y) return p.y === a.y && p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x)
  if (a.x === b.x) return p.x === a.x && p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y)
  return false
}
const enPolilinea = (p: Punto, pts: Punto[]): boolean => pts.some((a, i) => i > 0 && enTramo(p, pts[i - 1]!, a))

class Uniones {
  private padre = new Map<string, string>()
  raiz(k: string): string {
    let r = k
    while (this.padre.has(r) && this.padre.get(r) !== r) r = this.padre.get(r)!
    for (let c = k; c !== r; ) {
      const s = this.padre.get(c)!
      this.padre.set(c, r)
      c = s
    }
    return r
  }
  unir(a: string, b: string): void {
    const ra = this.raiz(a), rb = this.raiz(b)
    if (ra !== rb) this.padre.set(rb, ra)
  }
}

interface Isla {
  polis: number[]
  pines: PinOriginal[]
  marcas: MarcaOriginal[]
}

/** Trozos conectados del dibujo del origen: cables unidos por sus extremos (también sobre el interior de otro), uniones,
 * pines y marcas que caen en ellos. */
function islasDelOrigen(e: EntradaTrazado, sinTiempo: () => boolean): Isla[] {
  const uf = new Uniones()
  const puntos = new Map<string, PuntoAjeno>()
  const alta = (p: PuntoAjeno): string => {
    const k = ko(p.x, p.y)
    if (!puntos.has(k)) puntos.set(k, p)
    return k
  }
  e.cables.forEach((c) => {
    if (!c.length) return
    const k0 = alta(c[0]!)
    alta(c[c.length - 1]!)
    for (const v of c) uf.unir(k0, ko(v.x, v.y))
  })
  for (const u of e.uniones) alta(u)
  for (const p of e.pines) alta(p)
  for (const m of e.marcas) alta(m)
  // Puntos por fila y columna para hallar los que caen dentro de un tramo.
  const filas = new Map<number, PuntoAjeno[]>()
  const columnas = new Map<number, PuntoAjeno[]>()
  for (const p of puntos.values()) {
    const fy = Math.round(p.y * 1000), cx = Math.round(p.x * 1000)
    ;(filas.get(fy) ?? filas.set(fy, []).get(fy)!).push(p)
    ;(columnas.get(cx) ?? columnas.set(cx, []).get(cx)!).push(p)
  }
  const todos = [...puntos.values()]
  let oblicuos = 0
  for (const c of e.cables)
    for (let i = 1; i < c.length; i++) {
      const a = c[i - 1]!, b = c[i]!
      const ka = ko(a.x, a.y)
      const ya = Math.round(a.y * 1000), yb = Math.round(b.y * 1000), xa = Math.round(a.x * 1000), xb = Math.round(b.x * 1000)
      if (ya === yb) {
        for (const p of filas.get(ya) ?? []) if (p.x >= Math.min(a.x, b.x) - 1e-9 && p.x <= Math.max(a.x, b.x) + 1e-9) uf.unir(ka, ko(p.x, p.y))
      } else if (xa === xb) {
        for (const p of columnas.get(xa) ?? []) if (p.y >= Math.min(a.y, b.y) - 1e-9 && p.y <= Math.max(a.y, b.y) + 1e-9) uf.unir(ka, ko(p.x, p.y))
      } else if (oblicuos++ < MAX_OBLICUOS && !sinTiempo()) {
        const largo = Math.hypot(b.x - a.x, b.y - a.y)
        for (const p of todos) {
          const cruz = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)
          const t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (largo * largo)
          if (Math.abs(cruz) / largo < 1e-6 && t >= -1e-9 && t <= 1 + 1e-9) uf.unir(ka, ko(p.x, p.y))
        }
      }
    }
  const islas = new Map<string, Isla>()
  const isla = (x: number, y: number): Isla => {
    const r = uf.raiz(ko(x, y))
    let i = islas.get(r)
    if (!i) islas.set(r, (i = { polis: [], pines: [], marcas: [] }))
    return i
  }
  e.cables.forEach((c, i) => c.length && isla(c[0]!.x, c[0]!.y).polis.push(i))
  for (const p of e.pines) isla(p.x, p.y).pines.push(p)
  for (const m of e.marcas) isla(m.x, m.y).marcas.push(m)
  return [...islas.values()]
}

/** Polilínea ortogonal: un tramo inclinado del origen se vuelve una L. */
function ortogonal(pts: Punto[]): Punto[] {
  const out: Punto[] = []
  for (const p of pts) {
    const q = out[out.length - 1]
    if (q && q.x !== p.x && q.y !== p.y) out.push({ x: p.x, y: q.y })
    out.push(p)
  }
  return limpiarPolilinea(out)
}

/** Corta la polilínea en el punto `k` (que está en ella) y se queda con la parte que no llega al extremo `fin`. */
function cortarEn(pts: Punto[], k: Punto, alPrincipio: boolean): Punto[] {
  const p = alPrincipio ? pts : [...pts].reverse()
  for (let i = 1; i < p.length; i++)
    if (enTramo(k, p[i - 1]!, p[i]!)) {
      const resto = limpiarPolilinea([k, ...p.slice(i)])
      return alPrincipio ? resto : resto.reverse()
    }
  return pts
}

/** Elementos repartidos en celdas de la rejilla: en un esquema de miles de cables, buscar lo que toca un punto no los recorre todos.
 * Un cable se reparte por los tramos que toca (no por su caja). Lo que ocuparía más de `MAX_CELDAS` celdas o de rango no entero
 * (un cable de largo absurdo) no se reparte: va aparte y toda consulta lo revisa. */
type CajaC = { minX: number; minY: number; maxX: number; maxY: number }
export class Celdas<T> {
  private m = new Map<string, Set<T>>()
  private desmedidos = new Set<T>()
  /** Celdas con algo, para medir el reparto. */
  get ocupadas(): number {
    return this.m.size
  }
  private static readonly LADO = 16
  /** Tope de celdas por elemento y por consulta. */
  static readonly MAX_CELDAS = 2048
  private rango(c: CajaC): [number, number, number, number] | null {
    const l = Celdas.LADO
    const r: [number, number, number, number] = [Math.floor(c.minX / l), Math.floor(c.maxX / l), Math.floor(c.minY / l), Math.floor(c.maxY / l)]
    return r.every(Number.isSafeInteger) && (r[1] - r[0] + 1) * (r[3] - r[2] + 1) <= Celdas.MAX_CELDAS ? r : null
  }
  private claves(c: CajaC): string[] | null {
    const r = this.rango(c)
    if (!r) return null
    const out: string[] = []
    for (let x = r[0]; x <= r[1]; x++) for (let y = r[2]; y <= r[3]; y++) out.push(`${x},${y}`)
    return out
  }
  /** Celdas que toca una polilínea, tramo por tramo; null si pasan del tope. */
  private clavesDeLinea(pts: Punto[]): string[] | null {
    const out = new Set<string>()
    const un = pts.length === 1 ? 1 : pts.length - 1
    for (let i = 0; i < un; i++) {
      const a = pts[i]!, b = pts[Math.min(i + 1, pts.length - 1)]!
      const ks = this.claves({ minX: Math.min(a.x, b.x), minY: Math.min(a.y, b.y), maxX: Math.max(a.x, b.x), maxY: Math.max(a.y, b.y) })
      if (!ks) return null
      for (const k of ks) out.add(k)
      if (out.size > Celdas.MAX_CELDAS) return null
    }
    return [...out]
  }
  private ponerEn(ks: string[] | null, v: T): void {
    if (!ks) return void this.desmedidos.add(v)
    for (const k of ks) (this.m.get(k) ?? this.m.set(k, new Set()).get(k)!).add(v)
  }
  private quitarDe(ks: string[] | null, v: T): void {
    if (!ks) return void this.desmedidos.delete(v)
    for (const k of ks) this.m.get(k)?.delete(v)
  }
  poner(c: CajaC, v: T): void {
    this.ponerEn(this.claves(c), v)
  }
  quitar(c: CajaC, v: T): void {
    this.quitarDe(this.claves(c), v)
  }
  ponerLinea(pts: Punto[], v: T): void {
    this.ponerEn(this.clavesDeLinea(pts), v)
  }
  quitarLinea(pts: Punto[], v: T): void {
    this.quitarDe(this.clavesDeLinea(pts), v)
  }
  en(c: CajaC): Set<T> {
    const out = new Set<T>(this.desmedidos)
    const ks = this.claves(c)
    if (!ks) {
      for (const s of this.m.values()) for (const v of s) out.add(v)
      return out
    }
    for (const k of ks) for (const v of this.m.get(k) ?? []) out.add(v)
    return out
  }
}
const enPunto = (q: Punto): { minX: number; minY: number; maxX: number; maxY: number } => ({ minX: q.x, minY: q.y, maxX: q.x, maxY: q.y })

export function trazar(entrada: EntradaTrazado): ResultadoTrazado {
  // El presupuesto corre desde aquí: los primeros pasos también pueden tardar con un archivo hostil.
  const inicio = performance.now()
  const presupuesto = entrada.presupuestoMs ?? PRESUPUESTO_MS
  const sinTiempoAun = (): boolean => performance.now() - inicio > presupuesto
  const desmedido = (c: PuntoAjeno[]): boolean =>
    c.some((v) => {
      const p = entrada.proyectar(v.x, v.y)
      return !Number.isFinite(p.x) || !Number.isFinite(p.y) || Math.abs(p.x) > LIMITE_COORDENADA || Math.abs(p.y) > LIMITE_COORDENADA
    })
  // Un cable desmedido queda vacío (se ignora) y los índices de los demás no cambian.
  const e: EntradaTrazado = { ...entrada, cables: entrada.cables.map((c) => (c.length > MAX_VERTICES || desmedido(c) ? [] : c)) }
  const { doc, lib, gen } = e
  const res: ResultadoTrazado = { cables: [], etiquetas: [], marcas: [], quitadas: new Set(), conEtiqueta: [], avisos: [] }
  const largos = entrada.cables.filter((c) => c.length > MAX_VERTICES).length
  if (largos) res.avisos.push(`Se omitieron ${largos} cables del original con más de ${MAX_VERTICES} vértices.`)
  const ajustar = (x: number, y: number): Punto => {
    const p = e.proyectar(x, y)
    return { x: par(p.x), y: par(p.y) }
  }
  const llave = (red: number): string => {
    const r = e.redes[red]!
    return r.clase === 'tierra' ? 'T' : r.clase === 'alimentacion' ? `A:${claveDeNombre(r.marca)}` : `R${red}`
  }
  const posPin = (pieza: Pieza, pin: string): Punto | undefined => {
    const def = lib.get(pieza.tipo)
    const q = def ? pinesEnMundo(pieza, def).find((x) => x.id === pin) : undefined
    return q ? { x: q.x, y: q.y } : undefined
  }
  /** Llave de red que debe tener cada pin del documento. */
  const llaveDePin = new Map<string, string>()
  e.redes.forEach((r, k) => {
    for (const q of r.pines) llaveDePin.set(clavePin(q.pieza.id, q.pin), llave(k))
  })

  const cableDe = new Map<Id, string>()
  const celdasCables = new Celdas<Id>()
  const poner = (pts: Punto[], llaveRed?: string): Cable => {
    const c: Cable = { id: gen('c'), puntos: pts }
    doc.cables[c.id] = c
    celdasCables.ponerLinea(pts, c.id)
    if (llaveRed) cableDe.set(c.id, llaveRed)
    return c
  }
  const quitar = (id: Id): void => {
    const c = doc.cables[id]
    if (c) celdasCables.quitarLinea(c.puntos, id)
    delete doc.cables[id]
    cableDe.delete(id)
  }
  /** Cables que pasan por el punto. */
  /** Cables del índice que pueden tocar la caja, para orientar etiquetas sin recorrer todos. */
  const cablesCerca = (caja: CajaC): Cable[] => [...celdasCables.en(caja)].flatMap((id) => (doc.cables[id] ? [doc.cables[id]!] : []))
  const cablesEn = (q: Punto): Cable[] => [...celdasCables.en(enPunto(q))].flatMap((id) => (doc.cables[id] && enPolilinea(q, doc.cables[id]!.puntos) ? [doc.cables[id]!] : []))

  // 1. Islas del dibujo y a qué red pertenece cada una.
  const islas = islasDelOrigen(e, sinTiempoAun)
  const vivas: { isla: Isla; red: number }[] = []
  for (const isla of islas) {
    isla.marcas = isla.marcas.filter((m) => m.red >= 0)
    const llaves = new Set([...isla.pines.map((p) => llave(p.red)), ...isla.marcas.map((m) => llave(m.red))])
    if (llaves.size !== 1) continue
    const red = isla.pines[0]?.red ?? isla.marcas[0]!.red
    // Solo un trozo de un pin (terminal con su cable corto): si es de varios pines, como un bus de tierra, se conserva.
    if (e.redes[red]!.clase !== 'ninguna' && isla.pines.length === 1)
      isla.pines = isla.pines.filter((p) => {
        const k = posPin(p.pieza, p.pin)
        return k !== undefined && distancia(k, ajustar(p.x, p.y)) <= DESPEGAR
      })
    // Un trozo sin pines solo declaraba un nombre (el cable de un generador de CD a su terminal): no se dibuja.
    if (!isla.pines.length) continue
    vivas.push({ isla, red })
  }

  // 2. Cables del original: a la rejilla, cortados en el pin de Kirchi si este cae sobre ellos y sin tramos que crucen piezas.
  for (const { isla, red } of vivas) {
    const l = llave(red)
    for (const i of isla.polis) {
      let pts = ortogonal(e.cables[i]!.map((v) => ajustar(v.x, v.y)))
      if (pts.length < 2) continue
      for (const p of isla.pines) {
        const fin = ajustar(p.x, p.y), k = posPin(p.pieza, p.pin)
        if (!k || igual(k, fin)) continue
        if (igual(pts[0]!, fin) && enPolilinea(k, pts)) pts = cortarEn(pts, k, true)
        if (igual(pts[pts.length - 1]!, fin) && enPolilinea(k, pts)) pts = cortarEn(pts, k, false)
      }
      let tramo: Punto[] = [pts[0]!]
      for (let j = 1; j < pts.length; j++) {
        if (piezaCruzada(doc, lib, [pts[j - 1]!, pts[j]!]) === null) tramo.push(pts[j]!)
        else {
          if (tramo.length >= 2) res.cables.push(poner(tramo, l))
          tramo = [pts[j]!]
        }
      }
      if (tramo.length >= 2) res.cables.push(poner(tramo, l))
    }
  }

  // 3. Un cable que junta redes distintas (por el ajuste a la rejilla) se quita; primero los de la red minoritaria.
  const contaminadas = (con: Conexiones): number[] => {
    const malas: number[] = []
    con.redes.forEach((r) => {
      const ls = new Set([...r.pines.map((p) => llaveDePin.get(p)), ...r.cables.map((c) => cableDe.get(c))].filter((x): x is string => x !== undefined))
      if (ls.size > 1) malas.push(r.id)
    })
    return malas
  }
  for (let vuelta = 0; vuelta < 30; vuelta++) {
    const con = calcularConexiones(doc, lib)
    const malas = contaminadas(con)
    if (!malas.length) break
    for (const id of malas) {
      const r = con.redes[id]!
      const cuenta = new Map<string, number>()
      for (const p of r.pines) {
        const l = llaveDePin.get(p)
        if (l) cuenta.set(l, (cuenta.get(l) ?? 0) + 1)
      }
      if (!cuenta.size) for (const c of r.cables) if (cableDe.has(c)) cuenta.set(cableDe.get(c)!, (cuenta.get(cableDe.get(c)!) ?? 0) + 1)
      const mayor = [...cuenta].sort((a, b) => b[1] - a[1])[0]![0]
      let quitados = 0
      for (const c of r.cables) if (cableDe.has(c) && cableDe.get(c) !== mayor) (quitar(c), quitados++)
      if (quitados) continue
      // Un pin de otra red cae sobre un cable de la mayoritaria.
      const ajenos = r.pines.filter((p) => llaveDePin.has(p) && llaveDePin.get(p) !== mayor).map((p) => {
        const [pieza, pin] = [p.slice(0, p.indexOf(':')), p.slice(p.indexOf(':') + 1)]
        return doc.piezas[pieza] ? posPin(doc.piezas[pieza], pin) : undefined
      })
      for (const c of r.cables) {
        const cable = doc.cables[c]
        if (cable && cableDe.has(c) && ajenos.some((q) => q && enPolilinea(q, cable.puntos))) (quitar(c), quitados++)
      }
      if (!quitados) for (const c of r.cables) if (cableDe.has(c)) quitar(c)
    }
  }
  res.cables = res.cables.filter((c) => doc.cables[c.id])

  // 4. Marcas del original en su lugar, si su punto no toca otra red y su cuerpo cabe.
  const pinesDelDoc = (): { p: Punto; llave?: string; pieza: Id }[] =>
    Object.values(doc.piezas).flatMap((pz) => {
      const def = lib.get(pz.tipo)
      return def ? pinesEnMundo(pz, def).map((q) => ({ p: { x: q.x, y: q.y }, llave: llaveDePin.get(clavePin(pz.id, q.id)), pieza: pz.id })) : []
    })
  const celdasPines = new Celdas<{ p: Punto; llave?: string; pieza: Id }>()
  for (const x of pinesDelDoc()) celdasPines.poner(enPunto(x.p), x)
  const pinesEn = (q: Punto): { p: Punto; llave?: string; pieza: Id }[] => [...celdasPines.en(enPunto(q))].filter((x) => igual(x.p, q))
  const tocaOtraRed = (q: Punto, l: string): boolean =>
    pinesEn(q).some((x) => x.llave !== undefined && x.llave !== l) || cablesEn(q).some((c) => cableDe.get(c.id) !== undefined && cableDe.get(c.id) !== l)
  const celdasCuerpos = new Celdas<Id>()
  const celdasEtiquetas = new Celdas<Id>()
  for (const pz of Object.values(doc.piezas)) celdasCuerpos.poner(cuerpoEnMundo(pz, lib.get(pz.tipo)), pz.id)
  /** Los rótulos fijos del símbolo (el nombre de un terminal) no caen sobre cables, cuerpos, pines ni etiquetas. */
  const rotulosLibres = (cand: Pieza): boolean => {
    const def = lib.get(cand.tipo)
    if (!def?.rotulos?.length) return true
    for (const t of rotulosDePieza(cand, def)) {
      const caja = cajaTexto(t)
      // El voltaje de un terminal va tras su nombre, en el mismo renglón: se aparta también.
      if (def.modelo?.tipo === 'alimentacion') caja.maxX += VOLTAJE_TRAS_NOMBRE
      for (const id of celdasCables.en(caja)) {
        const c = doc.cables[id]
        if (c && c.puntos.some((a, i) => i > 0 && tramoCruzaCaja(c.puntos[i - 1]!, a, caja))) return false
      }
      for (const id of celdasCuerpos.en(caja)) {
        const o = doc.piezas[id]
        if (o && o.id !== cand.id && cajasSeCruzan(caja, cuerpoEnMundo(o, lib.get(o.tipo)))) return false
      }
      for (const id of celdasEtiquetas.en(caja)) if (doc.etiquetas[id] && cajasSeCruzan(cajaEtiqueta(doc.etiquetas[id]!), caja)) return false
      if ([...celdasPines.en(caja)].some((x) => x.pieza !== cand.id && x.p.x > caja.minX && x.p.x < caja.maxX && x.p.y > caja.minY && x.p.y < caja.maxY)) return false
    }
    return true
  }
  const cabe = (cand: Pieza, conRotulos = false): boolean => {
    const def = lib.get(cand.tipo)
    const cuerpo = cuerpoEnMundo(cand, def)
    // Con el mismo aire que pide el editor entre piezas (`colisiona`), mirando solo las piezas cercanas.
    const zona = cuerpoEnMundo(cand, def, 2 * SEPARACION)
    for (const id of celdasCuerpos.en(zona)) {
      const o = doc.piezas[id]
      if (o && o.id !== cand.id && cajasSeCruzan(zona, cuerpoEnMundo(o, lib.get(o.tipo)))) return false
    }
    for (const id of celdasCables.en(cuerpo)) {
      const c = doc.cables[id]
      if (c && c.puntos.some((a, i) => i > 0 && tramoCruzaCaja(c.puntos[i - 1]!, a, cuerpo))) return false
    }
    for (const id of celdasEtiquetas.en(cuerpo)) if (doc.etiquetas[id] && cajasSeCruzan(cajaEtiqueta(doc.etiquetas[id]!), cuerpo)) return false
    const [px, py] = [cand.x, cand.y]
    if (conRotulos && !rotulosLibres(cand)) return false
    return ![...celdasPines.en(cuerpo)].some((x) => x.pieza !== cand.id && !(x.p.x === px && x.p.y === py) && x.p.x > cuerpo.minX && x.p.x < cuerpo.maxX && x.p.y > cuerpo.minY && x.p.y < cuerpo.maxY)
  }
  /** Sentido en que el cuerpo de una marca en `q` se aleja de lo que llega a ella. */
  const sentidoLibre = (q: Punto, pieza?: Id): Punto => {
    let sx = 0, sy = 0
    for (const c of cablesEn(q)) {
      const pts = c.puntos
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1]!, b = pts[i]!
        if (!enTramo(q, a, b)) continue
        for (const o of [a, b]) if (!igual(o, q)) (sx -= Math.sign(o.x - q.x), sy -= Math.sign(o.y - q.y))
      }
    }
    if (sx === 0 && sy === 0)
      for (const x of pinesEn(q)) {
        const pz = doc.piezas[x.pieza]
        if (!pz || pz.id === pieza) continue
        const def = lib.get(pz.tipo)
        if (!def) continue
        const c = cuerpoEnMundo(pz, def)
        sx = Math.sign(q.x - (c.minX + c.maxX) / 2)
        sy = Math.sign(q.y - (c.minY + c.maxY) / 2)
        if (sx !== 0 && sy !== 0) Math.abs(q.x - (c.minX + c.maxX) / 2) > Math.abs(q.y - (c.minY + c.maxY) / 2) ? (sy = 0) : (sx = 0)
        break
      }
    return { x: Math.sign(sx), y: Math.sign(sy) }
  }
  /** Orientaciones de la marca en `q`, de la que mejor se aleja de `sentido` a la peor; la tierra prefiere colgar. */
  const orientaciones = (tipo: 'tierra' | 'alimentacion', q: Punto, sentido: Punto): Rotacion[] => {
    const def = lib.get(tipo)
    const puntaje = (rot: Rotacion): number => {
      const c = cuerpoEnMundo({ id: '', tipo, ref: '', x: q.x, y: q.y, rot, espejo: false, props: {} }, def)
      const vx = (c.minX + c.maxX) / 2 - q.x, vy = (c.minY + c.maxY) / 2 - q.y
      const n = Math.hypot(vx, vy) || 1
      return (vx * sentido.x + vy * sentido.y) / n + (tipo === 'tierra' ? (0.6 * vy) / n : 0) - (rot === 0 ? 0 : 0.01)
    }
    return [...ROTACIONES].sort((a, b) => puntaje(b) - puntaje(a))
  }
  const ponerMarca = (base: Pieza, q: Punto, rot: Rotacion): Pieza => {
    const p = { ...base, x: q.x, y: q.y, rot, espejo: false }
    doc.piezas[p.id] = p
    celdasCuerpos.poner(cuerpoEnMundo(p, lib.get(p.tipo)), p.id)
    res.marcas.push(p)
    celdasPines.poner(enPunto(q), { p: q, llave: undefined, pieza: p.id })
    return p
  }
  /** Giro que traía del origen cada etiqueta, para orientarlas al final con todo ya trazado. */
  const conGiro = new Map<Id, number>()
  const etiquetar = (nombre: string, q: Punto, giro?: number): void => {
    const et: Etiqueta = { id: gen('e'), nombre, x: q.x, y: q.y, rot: giroDeEtiqueta(doc, lib, q, nombre, giro, undefined, cablesCerca) }
    if (giro !== undefined) conGiro.set(et.id, giro)
    doc.etiquetas[et.id] = et
    celdasEtiquetas.poner(cajaEtiqueta(et), et.id)
    res.etiquetas.push(et)
  }
  const provisional = (tipo: 'tierra' | 'alimentacion'): Pieza => ({ id: '~marca', tipo, ref: '', x: 0, y: 0, rot: 0, espejo: false, props: {} })
  const marcasPuestas = new Set<Id>()
  for (const { isla, red } of vivas) {
    const r = e.redes[red]!
    const l = llave(red)
    for (const m of isla.marcas) {
      let q = ajustar(m.x, m.y)
      // Una marca puesta sobre un pin sin cable (bandera de LTspice) va al pin de Kirchi, que no cae justo donde el original.
      const pin = isla.pines.find((p) => ko(p.x, p.y) === ko(m.x, m.y))
      const k = pin && posPin(pin.pieza, pin.pin)
      if (k && !cablesEn(q).length) q = k
      if (tocaOtraRed(q, l)) continue
      if (m.tipo === 'etiqueta' && r.clase === 'etiqueta') {
        if (!Object.values(doc.etiquetas).some((x) => igual(x, q))) etiquetar(r.nombre, q, m.giro)
        continue
      }
      const tipo: 'tierra' | 'alimentacion' = r.clase === 'tierra' ? 'tierra' : r.clase === 'alimentacion' ? 'alimentacion' : m.tipo === 'tierra' ? 'tierra' : 'alimentacion'
      if (tipo !== m.tipo && !(tipo === 'alimentacion' && m.tipo === 'etiqueta')) continue
      // Dos marcas iguales en el mismo punto son una.
      if (res.marcas.some((x) => igual(x, q) && x.tipo === tipo)) continue
      const propia = m.pieza && m.pieza.tipo === tipo ? m.pieza : undefined
      const prueba = propia ?? provisional(tipo)
      const sentido = sentidoLibre(q, prueba.id)
      const posibles = orientaciones(tipo, q, sentido)
      const rot = posibles.find((o) => cabe({ ...prueba, x: q.x, y: q.y, rot: o, espejo: false }, true)) ?? posibles.find((o) => cabe({ ...prueba, x: q.x, y: q.y, rot: o, espejo: false }))
      if (rot === undefined) continue
      const base = propia ?? e.nuevaPieza(tipo, {})
      if (tipo === 'alimentacion') base.props = { ...base.props, nombre: r.marca }
      ponerMarca(base, q, rot)
      marcasPuestas.add(base.id)
    }
  }
  for (const m of e.marcas) if (m.pieza && !marcasPuestas.has(m.pieza.id)) res.quitadas.add(m.pieza.id)

  // 5. Lo que falta: cada trozo de una red sin unir se une con cable o, si la red se nombra con marcas y está lejos, con una
  // marca junto a su pin.
  const unir = (desde: Punto, hasta: Punto, l: string): Punto[] | null => {
    const ruta = enrutar(doc, lib, desde, hasta)
    if (ruta.length < 2 || !rutaLibre(doc, lib, ruta)) return null
    res.cables.push(poner(ruta, l))
    return ruta
  }
  /** Marca junto al pin `p` con un tramo corto; la tierra cuelga y el terminal sigue al tramo. */
  const marcaJunto = (tipo: 'tierra' | 'alimentacion', p: Punto, r: RedTrazado, l: string): boolean => {
    const fuera = sentidoLibre(p)
    const sentidos: Punto[] = [fuera, { x: 0, y: 1 }, { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: -1 }].filter((s, i, a) => (s.x || s.y) && a.findIndex((o) => o.x === s.x && o.y === s.y) === i)
    if (tipo === 'tierra') sentidos.sort((a, b) => Number(b.y === 1) - Number(a.y === 1))
    const base = provisional(tipo)
    // Primero con el nombre del terminal despejado; si no hay lugar así, donde quepa el cuerpo.
    for (const estricto of tipo === 'alimentacion' ? [true, false] : [false])
    for (const largo of LARGOS_TRAMO)
      for (const s of sentidos) {
        const q = { x: p.x + s.x * largo, y: p.y + s.y * largo }
        if (tocaOtraRed(q, l) || pinesEn(q).length || cablesEn(q).length) continue
        const rots = tipo === 'tierra' ? ([0] as Rotacion[]) : orientaciones(tipo, q, s)
        for (const rot of rots) {
          const cand = { ...base, x: q.x, y: q.y, rot, espejo: false }
          if (!cabe(cand, estricto)) continue
          // El tramo es recto: basta comprobarlo, sin buscar ruta.
          const ruta = [p, q]
          if (!rutaLibre(doc, lib, ruta)) continue
          doc.piezas[cand.id] = cand
          const cruza = piezaCruzada(doc, lib, ruta) !== null
          delete doc.piezas[cand.id]
          if (cruza) continue
          const nueva = e.nuevaPieza(tipo, tipo === 'alimentacion' ? { nombre: r.marca } : {})
          ponerMarca(nueva, q, rot)
          res.cables.push(poner(ruta, l))
          return true
        }
      }
    return false
  }

  /** Pin encerrado (filas de pines juntos): una tierra libre más lejos y una etiqueta en cada punto las une por nombre. */
  const tierraLejos = (p: Punto, r: RedTrazado, l: string): boolean => {
    for (let radio = 6; radio <= 40; radio += 2) {
      const anillo: Punto[] = []
      for (let dx = -radio; dx <= radio; dx += 2) for (let dy = -radio; dy <= radio; dy += 2) if (Math.max(Math.abs(dx), Math.abs(dy)) === radio) anillo.push({ x: p.x + dx, y: p.y + dy })
      anillo.sort((a, b) => distancia(a, p) - distancia(b, p))
      for (const q of anillo) {
        if (tocaOtraRed(q, l) || pinesEn(q).length || cablesEn(q).length) continue
        if (!cabe({ ...provisional('tierra'), x: q.x, y: q.y })) continue
        ponerMarca(e.nuevaPieza('tierra', {}), q, 0)
        etiquetar(r.nombre, q)
        etiquetar(r.nombre, p)
        res.conEtiqueta.push({ nombre: r.nombre, piezas: [] })
        return true
      }
    }
    return false
  }

  // Las redes se calculan una vez: lo que se agrega a una red no cambia cómo quedan agrupados los pines de las otras.
  const cn: Conexiones = calcularConexiones(doc, lib)
  let sinTiempo = 0
  const orden = e.redes.map((_, k) => k).sort((a, b) => Number(e.redes[a]!.clase === 'tierra') - Number(e.redes[b]!.clase === 'tierra'))
  for (const k of orden) {
    const r = e.redes[k]!
    const l = llave(k)
    const pines = r.pines.flatMap((q) => {
      const p = doc.piezas[q.pieza.id] ? posPin(doc.piezas[q.pieza.id]!, q.pin) : undefined
      return p ? [{ q, p }] : []
    })
    if (!pines.length) continue
    const nombrada = (rid: number): boolean => {
      const red = cn.redes[rid]!
      if (r.clase === 'tierra') return red.tierra
      if (r.clase === 'alimentacion') return red.nombre !== undefined && redTieneNombre(doc, lib, cn, rid, r.marca)
      return false
    }
    // Trozos: pines agrupados por la red de Kirchi donde ya están.
    const trozos = new Map<number, { pines: Punto[]; puntos: Punto[]; ref: string }>()
    for (const { q, p } of pines) {
      const rid = cn.redDePin.get(clavePin(q.pieza.id, q.pin))
      if (rid === undefined) continue
      let t = trozos.get(rid)
      if (!t) {
        const puntos = cn.redes[rid]!.cables.flatMap((c) => doc.cables[c]?.puntos ?? [])
        trozos.set(rid, (t = { pines: [], puntos, ref: `${doc.piezas[q.pieza.id]!.ref}.${q.pin}` }))
      }
      t.pines.push(p)
      t.puntos.push(p)
    }
    const conMarca = r.clase === 'tierra' || r.clase === 'alimentacion'
    if (!conMarca && trozos.size <= 1) continue
    if (conMarca && [...trozos.keys()].every(nombrada)) continue
    // Los cables del original que no llegaron a ningún pin también son trozos: los pines se unen a ellos con un tramo corto.
    for (const [id, ll] of cableDe) {
      const rid = cn.redDeCable.get(id)
      if (ll !== l || rid === undefined || trozos.has(rid)) continue
      trozos.set(rid, { pines: [], puntos: cn.redes[rid]!.cables.flatMap((c) => doc.cables[c]?.puntos ?? []), ref: '' })
    }
    const lista = [...trozos].map(([rid, t]) => ({ rid, ...t, nombrada: conMarca && nombrada(rid) }))
    if (conMarca) {
      // Grupos de trozos ya unidos entre sí; un grupo está nombrado si alguno de sus trozos lo está.
      const grupo = lista.map((_, i) => i)
      const raiz = (i: number): number => (grupo[i] === i ? i : (grupo[i] = raiz(grupo[i]!)))
      const nombrado = lista.map((t) => t.nombrada)
      const puntosRed = new Celdas<{ b: Punto; j: number; ib: number }>()
      lista.forEach((o, j) => o.puntos.forEach((b, ib) => puntosRed.poner(enPunto(b), { b, j, ib })))
      lista.forEach((t, i) => {
        if (!t.pines.length || nombrado[raiz(i)]) return
        // Sin tiempo, ni se intenta: la marca junto al pin es más barata que buscar ruta.
        if (sinTiempoAun()) return
        // Cerca de otro grupo de la misma red (primero uno nombrado): un cable corto. Solo se miran los puntos del índice a
        // menos de UNIR_NOMBRADA; el orden de empate es el de recorrer grupos, puntos propios y puntos ajenos.
        const pares: { a: Punto; b: Punto; j: number; d: number; ia: number; ib: number }[] = []
        t.puntos.forEach((a, ia) => {
          const caja = { minX: a.x - UNIR_NOMBRADA, minY: a.y - UNIR_NOMBRADA, maxX: a.x + UNIR_NOMBRADA, maxY: a.y + UNIR_NOMBRADA }
          for (const { b, j, ib } of puntosRed.en(caja)) {
            if (raiz(j) === raiz(i)) continue
            const d = distancia(a, b) - (nombrado[raiz(j)] ? 0.5 : 0)
            if (d <= UNIR_NOMBRADA) pares.push({ a, b, j, d, ia, ib })
          }
        })
        pares.sort((x, y) => x.d - y.d || x.j - y.j || x.ia - y.ia || x.ib - y.ib)
        pares.length = Math.min(pares.length, 4)
        for (const { a, b, j } of pares)
          if (unir(a, b, l)) {
            const ri = raiz(i), rj = raiz(j)
            grupo[ri] = rj
            nombrado[rj] = nombrado[rj]! || nombrado[ri]!
            break
          }
      })
      // Cada grupo sin nombre lleva su propia marca junto a un pin.
      lista.forEach((t, i) => {
        // Un grupo sin pines (cable del original que nada usa) se poda al final.
        const conPines = lista.some((o, j) => raiz(j) === i && o.pines.length)
        if (raiz(i) !== i || nombrado[i] || !conPines) return
        const t0 = lista.find((o, j) => raiz(j) === i && o.pines.length)!
        if (!marcaJunto(r.clase as 'tierra' | 'alimentacion', t0.pines[0]!, r, l)) {
          // Sin lugar para la marca: una etiqueta con el nombre del terminal.
          if (r.clase === 'alimentacion') etiquetar(r.marca, t0.pines[0]!)
          else if (!tierraLejos(t0.pines[0]!, r, l)) res.avisos.push(`No hubo lugar para una tierra junto a ${t0.ref}.`)
        }
        nombrado[i] = true
      })
      continue
    }
    // Sin marcas: árbol con el enrutador desde el trozo más grande; lo que no tenga ruta se nombra con etiquetas.
    lista.sort((a, b) => b.pines.length - a.pines.length || b.puntos.length - a.puntos.length)
    const conectados = [...lista[0]!.puntos]
    const pendientes = lista.slice(1)
    const sueltos: typeof lista = []
    let fallos = 0
    // Los trozos sin pines solo sirven de puente: cuando ya no quedan pines por unir, se dejan (y se podan).
    while (pendientes.some((t) => t.pines.length)) {
      if (fallos >= FALLOS_SEGUIDOS || performance.now() - inicio > presupuesto) {
        if (performance.now() - inicio > presupuesto) sinTiempo++
        sueltos.push(...pendientes.splice(0).filter((t) => t.pines.length))
        break
      }
      let mejor = { i: 0, d: Infinity }
      pendientes.forEach((t, i) => {
        for (const a of t.puntos) for (const c of conectados) if (distancia(a, c) < mejor.d) mejor = { i, d: distancia(a, c) }
      })
      const [t] = pendientes.splice(mejor.i, 1)
      // Un puente sin pines vale un intento; un trozo con pines, tres (como el enrutado sin dibujo).
      const pares = t!.puntos.flatMap((a) => conectados.map((b) => ({ a, b, d: distancia(a, b) }))).sort((x, y) => x.d - y.d).slice(0, t!.pines.length ? 3 : 1)
      let ruta: Punto[] | null = null
      for (const { a, b } of pares) if ((ruta = unir(a, b, l))) break
      if (ruta) (conectados.push(...t!.puntos, ...ruta), (fallos = 0))
      else {
        fallos++
        if (t!.pines.length) sueltos.push(t!)
      }
    }
    if (sueltos.length) {
      etiquetar(r.nombre, lista[0]!.pines[0]!)
      for (const t of sueltos) etiquetar(r.nombre, t.pines[0]!)
      res.conEtiqueta.push({ nombre: r.nombre, piezas: [...new Set(r.pines.map((q) => q.pieza.id))] })
    }
  }
  if (sinTiempo) res.avisos.push(`Por el tamaño del esquema, ${sinTiempo} ${sinTiempo === 1 ? 'red se nombró' : 'redes se nombraron'} con etiquetas sin trazar sus cables.`)

  /** Puntos de la red de la etiqueta, recorriendo sus cables paso a paso desde ella hasta `ALCANCE_ETIQUETA` unidades, del más
   * cercano al más lejano; donde pasa otra red no se ofrecen (la etiqueta uniría las dos). */
  const lugarLibreEnCable = (et: Etiqueta): { p: Punto; g: { rot: Rotacion; libre: boolean } } | null => {
    const mios = cablesEn(et)
    const redes = new Set(mios.map((c) => cableDe.get(c.id)))
    if (!mios.length || redes.has(undefined) || redes.size !== 1) return null
    const red = [...redes][0]
    const vecinos = (p: Punto): Punto[] => {
      const out: Punto[] = []
      for (const c of cablesEn(p)) {
        if (cableDe.get(c.id) !== red) continue
        for (let i = 1; i < c.puntos.length; i++) {
          const a = c.puntos[i - 1]!, b = c.puntos[i]!
          if (!enTramo(p, a, b)) continue
          for (const o of [a, b]) {
            if (igual(o, p)) continue
            const largo = Math.min(PASO_REJILLA, distancia(o, p))
            out.push({ x: p.x + Math.sign(o.x - p.x) * largo, y: p.y + Math.sign(o.y - p.y) * largo })
          }
        }
      }
      return out
    }
    const visto = new Set([kp(et)])
    let frontera: Punto[] = [{ x: et.x, y: et.y }]
    const etiquetas = Object.values(doc.etiquetas)
    for (let paso = 1; paso <= ALCANCE_ETIQUETA / PASO_REJILLA && frontera.length && !sinTiempoAun(); paso++) {
      const sig: Punto[] = []
      for (const p of frontera)
        for (const q of vecinos(p)) {
          if (visto.has(kp(q))) continue
          visto.add(kp(q))
          sig.push(q)
        }
      for (const q of sig) {
        if (pinesEn(q).length || etiquetas.some((x) => x.id !== et.id && igual(x, q))) continue
        // Donde cruza otra red, la etiqueta la uniría.
        if (cablesEn(q).some((c) => cableDe.get(c.id) !== red)) continue
        const g = mejorGiro(doc, lib, q, et.nombre, conGiro.get(et.id), et.id, cablesCerca)
        if (g.libre) return { p: q, g }
      }
      frontera = sig
    }
    return null
  }

  // 6. Sin cabos sueltos: los extremos de cable que no llegan a nada se recortan y las marcas que no tocan nada se quitan.
  podar(doc, lib, res)
  // Con todo trazado, cada etiqueta crece hacia su lado libre (el del original, si está libre); sin tiempo, se queda como va.
  let corridas = 0
  if (performance.now() - inicio <= presupuesto)
    for (const et of Object.values(doc.etiquetas)) {
      if (sinTiempoAun()) break
      let g = mejorGiro(doc, lib, et, et.nombre, conGiro.get(et.id), et.id, cablesCerca)
      let lugar: Punto = et
      // Sin lado libre, la etiqueta se corre por su cable hasta un punto donde sí lo haya.
      if (!g.libre) {
        const otro = lugarLibreEnCable(et)
        if (otro) (lugar = otro.p), (g = otro.g), corridas++
      }
      doc.etiquetas[et.id] = { ...et, x: lugar.x, y: lugar.y, rot: g.rot }
    }
  // El cable que quedó más allá de una etiqueta corrida es un cabo suelto.
  if (corridas) podar(doc, lib, res)
  res.cables = Object.values(doc.cables)
  res.etiquetas = Object.values(doc.etiquetas)
  for (const m of res.marcas) if (!doc.piezas[m.id] && m.id) res.quitadas.add(m.id)
  res.marcas = res.marcas.filter((m) => doc.piezas[m.id]).map((m) => doc.piezas[m.id]!)
  return res
}

/** La red tiene un terminal o una etiqueta con ese nombre. */
function redTieneNombre(doc: Documento, lib: Map<string, PiezaDef>, con: Conexiones, rid: number, nombre: string): boolean {
  const k = claveDeNombre(nombre)
  for (const [id, r] of con.redDeEtiqueta) if (r === rid && claveDeNombre(doc.etiquetas[id]!.nombre) === k) return true
  for (const clave of con.redes[rid]!.pines) {
    const pz = doc.piezas[clave.slice(0, clave.indexOf(':'))]
    const def = pz && lib.get(pz.tipo)
    if (pz && def && def.modelo?.tipo === 'alimentacion' && claveDeNombre(nombreDeTerminal(pz, def)) === k) return true
  }
  return false
}

/** Recorta cabos: un extremo de cable al que no llega pin, etiqueta ni otro cable retrocede hasta lo último que toca; una
 * marca o etiqueta que no toca nada se quita. */
function podar(doc: Documento, lib: Map<string, PiezaDef>, res: ResultadoTrazado): void {
  const marcas = new Set(res.marcas.map((m) => m.id))
  for (let vuelta = 0; vuelta < 50; vuelta++) {
    let cambio = false
    // Índices por punto, fila y columna: un esquema grande tiene miles de cables y recorrerlos por cada extremo es cuadrático.
    const fijos = new Map<string, Id[]>()
    const anotar = (q: Punto, quien: Id): void => void (fijos.get(kp(q)) ?? fijos.set(kp(q), []).get(kp(q))!).push(quien)
    for (const pz of Object.values(doc.piezas)) {
      const def = lib.get(pz.tipo)
      if (def) for (const q of pinesEnMundo(pz, def)) anotar(q, pz.id)
    }
    for (const et of Object.values(doc.etiquetas)) anotar(et, et.id)
    const vertices = new Map<string, Set<Id>>()
    const filas = new Map<number, { lo: number; hi: number; id: Id }[]>()
    const columnas = new Map<number, { lo: number; hi: number; id: Id }[]>()
    const puntosFila = new Map<number, { x: number; quien: Id }[]>()
    const puntosColumna = new Map<number, { y: number; quien: Id }[]>()
    const conPunto = (q: Punto, quien: Id): void => {
      ;(puntosFila.get(q.y) ?? puntosFila.set(q.y, []).get(q.y)!).push({ x: q.x, quien })
      ;(puntosColumna.get(q.x) ?? puntosColumna.set(q.x, []).get(q.x)!).push({ y: q.y, quien })
    }
    for (const [k, quienes] of fijos) {
      const [x, y] = k.split(',').map(Number) as [number, number]
      for (const q of quienes) conPunto({ x, y }, q)
    }
    const cables = Object.values(doc.cables)
    for (const c of cables) {
      c.puntos.forEach((q, i) => {
        ;(vertices.get(kp(q)) ?? vertices.set(kp(q), new Set()).get(kp(q))!).add(c.id)
        conPunto(q, c.id)
        const a = c.puntos[i - 1]
        if (!a) return
        if (a.y === q.y) (filas.get(q.y) ?? filas.set(q.y, []).get(q.y)!).push({ lo: Math.min(a.x, q.x), hi: Math.max(a.x, q.x), id: c.id })
        else if (a.x === q.x) (columnas.get(q.x) ?? columnas.set(q.x, []).get(q.x)!).push({ lo: Math.min(a.y, q.y), hi: Math.max(a.y, q.y), id: c.id })
      })
    }
    /** Algo distinto del cable `id` toca el punto: un pin, una etiqueta u otro cable. */
    const tocado = (q: Punto, id: Id): boolean =>
      fijos.has(kp(q)) ||
      [...(vertices.get(kp(q)) ?? [])].some((o) => o !== id) ||
      (filas.get(q.y) ?? []).some((t) => t.id !== id && q.x >= t.lo && q.x <= t.hi) ||
      (columnas.get(q.x) ?? []).some((t) => t.id !== id && q.y >= t.lo && q.y <= t.hi)
    for (const c of cables) {
      let pts = c.puntos
      for (const alPrincipio of [true, false]) {
        for (let n = 0; n < 50 && pts.length >= 2; n++) {
          const fin = alPrincipio ? pts[0]! : pts[pts.length - 1]!
          if (tocado(fin, c.id)) break
          const sig = alPrincipio ? pts[1]! : pts[pts.length - 2]!
          // Lo más cercano al extremo que toca algo dentro del último tramo.
          const enLinea: Punto[] =
            sig.y === fin.y
              ? (puntosFila.get(fin.y) ?? []).filter((o) => o.quien !== c.id).map((o) => ({ x: o.x, y: fin.y }))
              : (puntosColumna.get(fin.x) ?? []).filter((o) => o.quien !== c.id).map((o) => ({ x: fin.x, y: o.y }))
          const dentro = enLinea.filter((q) => enTramo(q, sig, fin) && !igual(q, fin) && !igual(q, sig))
          dentro.sort((a, b) => distancia(a, fin) - distancia(b, fin))
          const nuevo = dentro[0] ?? sig
          pts = alPrincipio ? [nuevo, ...pts.slice(dentro[0] ? 1 : 2)] : [...pts.slice(0, dentro[0] ? -1 : -2), nuevo]
          pts = limpiarPolilinea(pts)
          cambio = true
          if (dentro[0]) break
        }
      }
      if (pts.length < 2) delete doc.cables[c.id]
      else if (pts !== c.puntos) doc.cables[c.id] = { ...c, puntos: pts }
    }
    // Marcas y etiquetas sueltas: su punto no toca cable ni otro pin (la marca, además, ni etiqueta).
    const sobreCable = (q: Punto): boolean =>
      vertices.has(kp(q)) || (filas.get(q.y) ?? []).some((t) => q.x >= t.lo && q.x <= t.hi) || (columnas.get(q.x) ?? []).some((t) => q.y >= t.lo && q.y <= t.hi)
    const etiquetaEn = new Set(Object.values(doc.etiquetas).map((x) => kp(x)))
    const otroPin = (q: Punto, yo: Id): boolean => (fijos.get(kp(q)) ?? []).some((o) => o !== yo && !!doc.piezas[o])
    for (const id of marcas) {
      const m = doc.piezas[id]
      if (m && !sobreCable(m) && !etiquetaEn.has(kp(m)) && !otroPin(m, id)) (delete doc.piezas[id], (cambio = true))
    }
    for (const et of Object.values(doc.etiquetas)) if (!sobreCable(et) && !otroPin(et, et.id)) (delete doc.etiquetas[et.id], (cambio = true))
    if (!cambio) break
  }
}

/** Distancia de un punto a una caja (0 dentro o sobre su borde). */
const distanciaACaja = (p: Punto, c: { minX: number; minY: number; maxX: number; maxY: number }): number => Math.hypot(Math.max(0, c.minX - p.x, p.x - c.maxX), Math.max(0, c.minY - p.y, p.y - c.maxY))

/** Dónde poner la sonda de una red: el pin `base`, y si ahí queda pegada a un cuerpo o a una etiqueta, el punto de los cables
 * de la red con más aire alrededor (la bandera necesita lugar y, si no lo hay, tapa el texto de la pieza). `ocupados`: puntos
 * donde ya hay otra sonda. */
export function puntoParaSonda(doc: Documento, lib: Map<string, PiezaDef>, con: Conexiones, red: number | undefined, base: Punto, ocupados: Punto[] = []): Punto {
  const AIRE_BUENO = 4
  const cajas = [
    ...Object.values(doc.piezas).map((p) => cuerpoEnMundo(p, lib.get(p.tipo))),
    ...Object.values(doc.etiquetas).map(cajaEtiqueta)
  ]
  const holgura = (p: Punto): number => {
    let m = AIRE_BUENO * 2
    for (const c of cajas) m = Math.min(m, distanciaACaja(p, c))
    return m
  }
  const r = red === undefined ? undefined : con.redes[red]
  if (!r || holgura(base) >= AIRE_BUENO) return base
  const pines = new Set<string>()
  for (const p of Object.values(doc.piezas)) {
    const def = lib.get(p.tipo)
    if (def) for (const q of pinesEnMundo(p, def)) pines.add(kp(q))
  }
  const hbase = holgura(base)
  const cand: { q: Punto; h: number }[] = []
  for (const id of r.cables) {
    const pts = doc.cables[id]?.puntos ?? []
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!, b = pts[i]!
      const n = Math.min(300, Math.round(distancia(a, b) / PASO_REJILLA))
      for (let k = 0; k <= n; k++) {
        const q = { x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n }
        if (pines.has(kp(q)) || ocupados.some((o) => distancia(o, q) < 4)) continue
        const h = holgura(q)
        if (h > hbase + 1e-9) cand.push({ q, h })
      }
    }
  }
  cand.sort((a, b) => b.h - a.h)
  // El punto tiene que anclar en un cable de esta red: donde cruza otra red, la sonda mediría la equivocada.
  for (const { q } of cand.slice(0, 20)) {
    const ancla = anclaDeSonda(doc, lib, q.x, q.y)
    if (ancla?.tipo === 'cable' && con.redDeCable.get(ancla.id) === red) return q
  }
  return base
}

import { anclaDeSonda, enTramo } from '../conexiones/anclas'
import { clavePin, partirClavePin, type Conexiones } from '../conexiones/conexiones'
import { borrar, juntar, modificar, type Cambio, type Comando } from '../doc/comandos'
import { esDeInstrumento, esMedidor, haySondas, MAX_PANTALLA_MEDIDOR, nombreDeSonda } from '../doc/sondas'
import { cajaTexto, etiquetasSinChoques, listasDe } from '../lienzo/apartar'
import { cuerpoEnMundo } from './colision'
import { ALTO_CUERPO_AC, ALTO_CUERPO_DC, ANCHO_CUERPO } from '../lienzo/medidores'
import { cajaEtiqueta, cajaNota } from '../lienzo/medidas'
import type { Cable, Documento, Etiqueta, Id, Pieza, Punto, SentidoSonda, Sonda } from '../doc/tipos'
import { pinesEnMundo } from '../piezas/transformar'
import { distanciaASegmento } from './indice'
import { imanEn, type Iman } from './iman'
import { proyectarEnTramo } from './rutas'
import type { Indice } from './indice'
import type { Caja, PiezaDef } from '../piezas/tipos'

/** Sondas tras cada cambio: la que ya no toca nada se muda al punto más cercano de su red o se borra, en el mismo paso de
 * deshacer. Tampoco cambia de red sin verse (un cable ajeno que cruza su punto la aparta) ni une dos redes (la quita). */

const NOMBRE = 'mantener las sondas'

/** Los motivos por los que un medidor rápido no mide corriente o no se convierte (los comparten el editor y la ficha del inspector). */
export const MOTIVO_MEDIDOR_DE_CORRIENTE = 'Pon el medidor sobre un cable para medir corriente.'
export const MOTIVO_CONVERTIR_CORRIENTE = 'Para medir corriente con el multímetro completo, intercálalo en serie: pon el multímetro en el cable.'
export const MOTIVO_CORRIENTE_AC = 'La corriente AC se mide con el multímetro completo en serie.'

/** El interior de un tramo (sin sus extremos): donde va una sonda de corriente, que necesita un solo tramo con su orientación. */
function enInterior(a: Punto, b: Punto, x: number, y: number): boolean {
  return enTramo(a, b, x, y) && !(x === a.x && y === a.y) && !(x === b.x && y === b.y)
}

/** La sonda lee la corriente de un cable: la de corriente de siempre o un medidor rápido en corriente (este no tiene orientación). */
const deCorriente = (s: Sonda): boolean => s.tipo === 'corriente' || (esMedidor(s) && s.magnitud === 'corriente')

/** Un tramo horizontal lleva la corriente a la derecha o a la izquierda; uno vertical, abajo o arriba. */
const horizontal = (s: SentidoSonda) => s === 'derecha' || s === 'izquierda'

const pasaPor = (c: Cable, x: number, y: number) => c.puntos.length >= 2 && c.puntos.some((_, i) => i > 0 && enTramo(c.puntos[i - 1], c.puntos[i], x, y))

/** Lo que la sonda toca en `doc`: cualquier pin, ancla o cable en su punto; la de corriente, el interior de un tramo con su orientación. */
export function tocaAlgo(doc: Documento, lib: Map<string, PiezaDef>, s: Sonda): boolean {
  if (deCorriente(s)) {
    const h = s.tipo === 'corriente' ? horizontal(s.sentido ?? 'derecha') : null
    return Object.values(doc.cables).some((c) => c.puntos.some((_, i) => i > 0 && enInterior(c.puntos[i - 1], c.puntos[i], s.x, s.y) && (h === null || (c.puntos[i - 1].y === c.puntos[i].y) === h)))
  }
  for (const id in doc.cables) if (pasaPor(doc.cables[id], s.x, s.y)) return true
  for (const id in doc.etiquetas) if (doc.etiquetas[id].x === s.x && doc.etiquetas[id].y === s.y) return true
  for (const id in doc.piezas) {
    const p = doc.piezas[id]
    const def = lib.get(p.tipo)
    if (def && pinesEnMundo(p, def).some((q) => q.x === s.x && q.y === s.y)) return true
  }
  return false
}

/** El punto de la entrada de una sonda de instrumento en `doc`, o null si su instrumento no está o no tiene esa entrada. */
function puntoDeEntrada(doc: Documento, lib: Map<string, PiezaDef>, s: Sonda): Punto | null {
  if (!esDeInstrumento(s) || !Object.hasOwn(doc.piezas, s.instrumento)) return null
  const p = doc.piezas[s.instrumento]
  const def = lib.get(p.tipo)
  return (def && pinesEnMundo(p, def).find((q) => q.id === s.entrada)) || null
}

/** A la entrada de la sonda llega algo más que la sonda: un cable, una etiqueta u otro pin. */
function entradaOcupada(doc: Documento, lib: Map<string, PiezaDef>, s: Sonda): boolean {
  const q = puntoDeEntrada(doc, lib, s)
  if (!q || (q.x === s.x && q.y === s.y)) return false
  for (const id in doc.cables) if (pasaPor(doc.cables[id], q.x, q.y)) return true
  for (const id in doc.etiquetas) if (doc.etiquetas[id].x === q.x && doc.etiquetas[id].y === q.y) return true
  for (const id in doc.piezas) {
    if (id === s.instrumento) continue
    const p = doc.piezas[id]
    const def = lib.get(p.tipo)
    if (def && pinesEnMundo(p, def).some((z) => z.x === q.x && z.y === q.y)) return true
  }
  return false
}

/** La red que medía la sonda: la de las conexiones de antes del gesto o, si es nueva en este gesto, la de lo que tocaba. */
function redDeSonda(doc: Documento, lib: Map<string, PiezaDef>, con: Conexiones, s: Sonda): number | undefined {
  const r = con.redDeSonda.get(s.id)
  if (r !== undefined) return r
  const a = anclaDeSonda(doc, lib, s.x, s.y)
  if (!a) return undefined
  return a.tipo === 'pin' ? con.redDePin.get(a.clave) : a.tipo === 'etiqueta' ? con.redDeEtiqueta.get(a.id) : con.redDeCable.get(a.id)
}

/** El punto (x, y) cae sobre un cable de `despues` que no es de la red de la sonda (`ajenos`): un cruce sin unión con otra red. */
function otraRedPasa(despues: Documento, ajenos: (id: Id) => boolean, x: number, y: number): boolean {
  // Un cable que termina en el punto se une ahí (es una T): no es de otra red.
  for (const id in despues.cables) if (ajenos(id) && cruzaSinUnirse(despues.cables[id], x, y)) return true
  return false
}

const distancia2 = (a: Punto, b: Punto) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2

/** Puntos de rejilla del tramo `a`-`b` (pares si se puede), del más cercano a `p` al más lejano, sin extremos si
 * `interior`. Hasta 64 por lado: basta para salir de un cruce. */
function* cercanosEnTramo(a: Punto, b: Punto, p: Punto, interior: boolean): Generator<Punto> {
  const h = a.y === b.y
  const [lo, hi] = h ? [Math.min(a.x, b.x), Math.max(a.x, b.x)] : [Math.min(a.y, b.y), Math.max(a.y, b.y)]
  const [min, max] = interior ? [lo + 1, hi - 1] : [lo, hi]
  if (min > max) return
  const pedido = h ? p.x : p.y
  const paso = max - min >= 2 ? 2 : 1
  const base = Math.max(min, Math.min(max, paso === 2 ? Math.round(pedido / 2) * 2 : Math.round(pedido)))
  const v0 = base < min ? base + paso : base > max ? base - paso : base
  const pt = (v: number) => (h ? { x: v, y: a.y } : { x: a.x, y: v })
  if (v0 >= min && v0 <= max) yield pt(v0)
  for (let k = 1; k <= 64; k++) {
    const izq = v0 - k * paso, der = v0 + k * paso
    const conIzq = izq >= min, conDer = der <= max
    if (!conIzq && !conDer) return
    // Primero el lado más cercano al punto pedido.
    const primeroDer = Math.abs(der - pedido) < Math.abs(izq - pedido)
    if (primeroDer) {
      if (conDer) yield pt(der)
      if (conIzq) yield pt(izq)
    } else {
      if (conIzq) yield pt(izq)
      if (conDer) yield pt(der)
    }
  }
}

/** El nuevo lugar de la sonda sobre lo que queda de su red (sin caer en un cruce con otra red), o null si no queda nada. */
function nuevoLugar(despues: Documento, lib: Map<string, PiezaDef>, conAntes: Conexiones, s: Sonda, red: number): { x: number; y: number; sentido?: SentidoSonda } | null {
  const r = conAntes.redes[red]
  if (!r) return null
  const propios = new Set(r.cables)
  const ajenos = (id: Id) => !propios.has(id)
  const p = { x: s.x, y: s.y }
  let mejor: { x: number; y: number; sentido?: SentidoSonda } | null = null
  let d = Infinity
  for (const id of r.cables) {
    const c = Object.hasOwn(despues.cables, id) ? despues.cables[id] : undefined
    if (!c) continue
    for (let i = 1; i < c.puntos.length; i++) {
      for (const q of cercanosEnTramo(c.puntos[i - 1], c.puntos[i], p, deCorriente(s))) {
        if (distancia2(q, p) >= d) break
        if (otraRedPasa(despues, ajenos, q.x, q.y)) continue
        d = distancia2(q, p)
        const h = c.puntos[i - 1].y === c.puntos[i].y
        mejor = s.tipo === 'corriente' ? { ...q, sentido: horizontal(s.sentido ?? 'derecha') === h ? s.sentido : h ? 'derecha' : 'abajo' } : q
        break
      }
    }
  }
  if (mejor || deCorriente(s)) return mejor
  // Sin cables de su red, el pin más cercano que quede (nunca la entrada del propio instrumento).
  const propia = esDeInstrumento(s) ? clavePin(s.instrumento, s.entrada) : null
  for (const k of r.pines) {
    if (k === propia) continue
    const { piezaId, pinId } = partirClavePin(k)
    const pz = Object.hasOwn(despues.piezas, piezaId) ? despues.piezas[piezaId] : undefined
    const def = pz ? lib.get(pz.tipo) : undefined
    const q = pz && def ? pinesEnMundo(pz, def).find((x) => x.id === pinId) : undefined
    if (q && distancia2(q, p) < d) [mejor, d] = [{ x: q.x, y: q.y }, distancia2(q, p)]
  }
  return mejor
}

/** Lo más lejos que un pin queda del origen de su pieza en la librería (gire como gire): la caja de una pieza para `Tocado`. */
const alcances = new WeakMap<Map<string, PiezaDef>, number>()
function alcanceDePines(lib: Map<string, PiezaDef>): number {
  let m = alcances.get(lib)
  if (m === undefined) {
    m = 0
    for (const d of lib.values()) for (const q of d.pines) m = Math.max(m, Math.abs(q.x), Math.abs(q.y))
    alcances.set(lib, m)
  }
  return m
}

/** Qué sondas pudo tocar un cambio: las que cambiaron, las de un instrumento que cambió y las de punto o entrada dentro de
 * la caja de algo movido. Cota por exceso barata: sondas ordenadas por x y búsqueda binaria por caja. */
class Tocado {
  readonly sondas = new Set<Id>()
  /** Sondas de instrumento cuya entrada quedó dentro de lo que cambió (puede haberle llegado un cable). */
  readonly entradas = new Set<Id>()
  /** Los cables cambiados (como quedan) cuya caja contiene el punto de cada sonda: los únicos que pueden cruzársele. */
  readonly cables = new Map<Id, Id[]>()
  private xs: number[] = []
  private ids: { id: Id; y: number; entrada: boolean }[] = []
  constructor(cambios: readonly Cambio[], lib: Map<string, PiezaDef>, sondas: readonly Sonda[], antes: Documento) {
    const puntos: { x: number; y: number; id: Id; entrada: boolean }[] = []
    const porInstrumento = new Map<Id, Id[]>()
    for (const s of sondas) {
      puntos.push({ x: s.x, y: s.y, id: s.id, entrada: false })
      if (!esDeInstrumento(s)) continue
      const q = puntoDeEntrada(antes, lib, s)
      if (q) puntos.push({ x: q.x, y: q.y, id: s.id, entrada: true })
      const l = porInstrumento.get(s.instrumento)
      if (l) l.push(s.id)
      else porInstrumento.set(s.instrumento, [s.id])
    }
    puntos.sort((a, b) => a.x - b.x)
    this.xs = puntos.map((q) => q.x)
    this.ids = puntos.map((q) => ({ id: q.id, y: q.y, entrada: q.entrada }))
    const m = alcanceDePines(lib)
    for (const c of cambios) {
      if (c.col === 'sondas') this.sondas.add(c.id)
      if (c.col === 'piezas') for (const id of porInstrumento.get(c.id) ?? []) this.sondas.add(id)
      for (const v of [c.antes, c.despues]) {
        if (!v) continue
        if (c.col === 'cables') {
          const pts = (v as Cable).puntos
          const cable = v === c.despues ? c.id : null
          for (let k = 1; k < pts.length; k++) this.marcar(Math.min(pts[k - 1].x, pts[k].x), Math.min(pts[k - 1].y, pts[k].y), Math.max(pts[k - 1].x, pts[k].x), Math.max(pts[k - 1].y, pts[k].y), cable)
        } else if (c.col === 'piezas') {
          const q = v as Pieza
          this.marcar(q.x - m, q.y - m, q.x + m, q.y + m)
        } else if (c.col === 'etiquetas') {
          const e = v as Etiqueta
          this.marcar(e.x, e.y, e.x, e.y)
        }
      }
    }
  }
  private marcar(x0: number, y0: number, x1: number, y1: number, cable: Id | null = null): void {
    let lo = 0, hi = this.xs.length
    while (lo < hi) {
      const k = (lo + hi) >> 1
      if (this.xs[k] < x0) lo = k + 1
      else hi = k
    }
    for (let k = lo; k < this.xs.length && this.xs[k] <= x1; k++) {
      const q = this.ids[k]
      if (q.y < y0 || q.y > y1) continue
      if (q.entrada) this.entradas.add(q.id)
      else {
        this.sondas.add(q.id)
        if (cable !== null) {
          const l = this.cables.get(q.id)
          if (!l) this.cables.set(q.id, [cable])
          else if (l[l.length - 1] !== cable) l.push(cable)
        }
      }
    }
  }
}

export interface Mantenidas {
  cmd: Comando | null
  /** Lo que se quitó y por qué, para el Registro. */
  avisos: string[]
}

/** La sonda sigue sobre algo de su red `r` en `despues` (un cable, un pin o una etiqueta de esa red), sin recorrer el documento. */
function sigueEnSuRed(despues: Documento, lib: Map<string, PiezaDef>, con: Conexiones, red: number, s: Sonda): boolean {
  const r = con.redes[red]
  if (!r) return false
  for (const id of r.cables) if (Object.hasOwn(despues.cables, id) && pasaPor(despues.cables[id], s.x, s.y)) return true
  for (const k of r.pines) {
    const { piezaId, pinId } = partirClavePin(k)
    if (piezaId === s.instrumento && pinId === s.entrada) continue
    const pz = Object.hasOwn(despues.piezas, piezaId) ? despues.piezas[piezaId] : undefined
    const def = pz ? lib.get(pz.tipo) : undefined
    if (pz && def && pinesEnMundo(pz, def).some((q) => q.id === pinId && q.x === s.x && q.y === s.y)) return true
  }
  for (const [id, re] of con.redDeEtiqueta) if (re === red && Object.hasOwn(despues.etiquetas, id) && despues.etiquetas[id].x === s.x && despues.etiquetas[id].y === s.y) return true
  return false
}

/** Qué hacer con las sondas tras un cambio: mudar o borrar las que no tocan su red, apartar las de un cruce ajeno y quitar
 * (avisando) las de una entrada con cable nuevo. `conAntes`: conexiones previas al gesto. `cambios` limita la revisión;
 * `despues` puede ser función. */
export function mantenerSondas(antes: Documento, despuesDado: Documento | (() => Documento), lib: Map<string, PiezaDef>, conAntes: Conexiones, cambios?: readonly Cambio[]): Mantenidas {
  const nada: Mantenidas = { cmd: null, avisos: [] }
  if (!haySondas(antes) && typeof despuesDado === 'function') return nada
  let despuesHecho: Documento | null = typeof despuesDado === 'function' ? null : despuesDado
  const despues = () => (despuesHecho ??= (despuesDado as () => Documento)())
  const lista = cambios ? Object.values(antes.sondas ?? {}) : Object.values(despues().sondas ?? {})
  const tocado = cambios ? new Tocado(cambios, lib, lista, antes) : null
  // Las sondas que llegan en el cambio (una pegada o una nueva) también se revisan.
  if (tocado) for (const c of cambios!) if (c.col === 'sondas' && c.despues && !c.antes) lista.push(c.despues as Sonda)
  if (tocado && tocado.sondas.size === 0 && tocado.entradas.size === 0) return nada
  const d = despues()
  if (!haySondas(d)) return nada
  const cmds: Comando[] = []
  const avisos: string[] = []
  for (const viejo of lista) {
    if (tocado && !tocado.sondas.has(viejo.id) && !tocado.entradas.has(viejo.id)) continue
    const s = Object.hasOwn(d.sondas!, viejo.id) ? d.sondas![viejo.id] : null
    if (!s) continue
    // La sonda de un instrumento que ya no está se va con él.
    if (esDeInstrumento(s) && !Object.hasOwn(d.piezas, s.instrumento)) {
      cmds.push(borrar(NOMBRE, 'sondas', s))
      continue
    }
    if (esDeInstrumento(s) && (!tocado || tocado.entradas.has(s.id) || tocado.sondas.has(s.id)) && entradaOcupada(d, lib, s)) {
      cmds.push(borrar(NOMBRE, 'sondas', s))
      avisos.push(`Se quitó ${nombreDeSonda(s, d.piezas[s.instrumento].ref)}: su entrada ya tiene un cable.`)
      continue
    }
    if (tocado && !tocado.sondas.has(s.id)) continue
    const red = redDeSonda(antes, lib, conAntes, s)
    if (red === undefined) continue
    const r = conAntes.redes[red]
    const enSuRed = deCorriente(s) ? tocaAlgo(d, lib, s) : sigueEnSuRed(d, lib, conAntes, red, s)
    if (enSuRed && r) {
      // Sigue en su red; pero si en su punto pasa ahora un cable de otra red (uno que se le cruzó), se aparta sobre la suya.
      const propios = new Set(r.cables)
      const ajenos = (id: Id) => !propios.has(id)
      const cruza = tocado
        ? (tocado.cables.get(s.id) ?? []).some((id) => ajenos(id) && Object.hasOwn(d.cables, id) && cruzaSinUnirse(d.cables[id], s.x, s.y))
        : otraRedPasa(d, ajenos, s.x, s.y)
      if (!cruza) continue
    }
    const lugar = nuevoLugar(d, lib, conAntes, s, red)
    if (!lugar) cmds.push(borrar(NOMBRE, 'sondas', s))
    else if (lugar.x !== s.x || lugar.y !== s.y || lugar.sentido !== s.sentido) cmds.push(modificar(NOMBRE, 'sondas', s, { ...s, ...lugar }))
  }
  return { cmd: cmds.length ? juntar(NOMBRE, cmds) : null, avisos }
}

/** El cable pasa por (x, y) sin terminar ahí: se cruza sin unirse. */
function cruzaSinUnirse(c: Cable, x: number, y: number): boolean {
  const [a, z] = [c.puntos[0], c.puntos[c.puntos.length - 1]]
  if ((a && a.x === x && a.y === y) || (z && z.x === x && z.y === y)) return false
  return pasaPor(c, x, y)
}

/** Las sondas de los instrumentos `ids` (para borrarlas con ellos). */
export function sondasDeLasPiezas(doc: Documento, ids: Iterable<Id>): Sonda[] {
  const conjunto = new Set(ids)
  return Object.values(doc.sondas ?? {}).filter((s) => s.instrumento !== undefined && conjunto.has(s.instrumento))
}

/** Adónde iría la sonda arrastrada con el puntero en `p`, ya pegada con el imán; `valida` si ahí puede medir. */
export interface DestinoSonda {
  x: number
  y: number
  sentido?: SentidoSonda
  valida: boolean
  /** Por qué no se puede soltar ahí (para el Registro). */
  motivo?: string
}

export const MOTIVO_SONDA_EN_EL_AIRE = 'La sonda tiene que quedar sobre un cable o un pin.'
export const MOTIVO_SONDA_DE_CORRIENTE = 'La sonda de corriente va en un tramo recto de cable, lejos de sus puntas y de las uniones.'
export const MOTIVO_SONDA_SIN_CABLE = 'La sonda no tiene más cable de su red en esa dirección.'
export const MOTIVO_SONDA_OTRA_RED = 'La sonda solo se mueve por los cables de su red.'
export const MOTIVO_SONDA_PROPIA = 'La sonda no puede medir la entrada de su propio instrumento.'

/** Destino de la sonda `s` con el puntero en `p`: lo que da `iman` o el punto de rejilla `q` en el aire (no válido).
 * La de corriente no vale en pin, punta ni unión; la de un instrumento no vale en su propia entrada. */
// Si el imán es de otra red que la de la sonda (una sonda sin red no distingue).
export function esDeOtraRed(con: Conexiones, s: Sonda, i: Iman): boolean {
  const red = con.redDeSonda.get(s.id)
  return red !== undefined && redDelIman(con, i) !== red
}

export function destinoDeSonda(doc: Documento, lib: Map<string, PiezaDef>, s: Sonda, iman: { tipo: 'pin' | 'cable' | 'etiqueta'; x: number; y: number; piezaId?: Id; pinId?: string; id?: Id; tramo?: number } | null, q: Punto, otraRed = false): DestinoSonda {
  if (!iman) return { x: q.x, y: q.y, valida: false, motivo: MOTIVO_SONDA_EN_EL_AIRE }
  if (otraRed) return { x: iman.x, y: iman.y, valida: false, motivo: MOTIVO_SONDA_OTRA_RED }
  const { x, y } = iman
  if (esDeInstrumento(s) && iman.tipo === 'pin' && iman.piezaId === s.instrumento && iman.pinId === s.entrada) return { x, y, valida: false, motivo: MOTIVO_SONDA_PROPIA }
  if (!deCorriente(s)) return { x, y, valida: true }
  const c = iman.tipo === 'cable' && iman.id ? doc.cables[iman.id] : undefined
  const a = c && iman.tramo !== undefined ? c.puntos[iman.tramo] : undefined
  const b = c && iman.tramo !== undefined ? c.puntos[iman.tramo + 1] : undefined
  if (!a || !b || !enInterior(a, b, x, y) || !tocaAlgo(doc, lib, { ...s, x, y, sentido: a.y === b.y ? 'derecha' : 'abajo' }) || unionEn(doc, x, y)) return { x, y, valida: false, motivo: MOTIVO_SONDA_DE_CORRIENTE }
  const h = a.y === b.y
  if (s.tipo !== 'corriente') return { x, y, valida: true }
  const sentido = horizontal(s.sentido ?? 'derecha') === h ? s.sentido : h ? 'derecha' : 'abajo'
  return { x, y, sentido, valida: true }
}

/** La red del punto al que se pegaría la sonda: la de su cable, su pin o su etiqueta. */
function redDelIman(con: Conexiones, i: Iman): number | undefined {
  return i.tipo === 'cable' ? con.redDeCable.get(i.id) : i.tipo === 'pin' ? con.redDePin.get(clavePin(i.piezaId, i.pinId)) : con.redDeEtiqueta.get(i.id)
}

/** A qué se pega la sonda arrastrada con el puntero en `p`: a cualquier punto de los cables de SU red. Un cable de su red
 * al alcance del imán gana aunque otro pin pase más cerca; si no, lo de siempre (`destinoDeSonda` rechaza otra red). */
export function imanDeSonda(indice: Indice, doc: Documento, con: Conexiones, s: Sonda, p: Punto, radio: number): Iman | null {
  const base = imanEn(indice, doc, p, radio)
  const red = con.redDeSonda.get(s.id)
  const propia = red === undefined ? undefined : con.redes[red]
  if (!propia || (base && redDelIman(con, base) === red && base.tipo === 'cable')) return base
  let mejor: { id: Id; tramo: number; d: number } | null = null
  for (const id of propia.cables) {
    const c = Object.hasOwn(doc.cables, id) ? doc.cables[id] : undefined
    if (!c) continue
    for (let t = 0; t + 1 < c.puntos.length; t++) {
      const d = distanciaASegmento(p.x, p.y, c.puntos[t].x, c.puntos[t].y, c.puntos[t + 1].x, c.puntos[t + 1].y)
      if (d <= radio && (!mejor || d < mejor.d)) mejor = { id, tramo: t, d }
    }
  }
  if (!mejor) return base
  const c = doc.cables[mejor.id]
  const q = proyectarEnTramo(p, c.puntos[mejor.tramo], c.puntos[mejor.tramo + 1])
  return { tipo: 'cable', id: mejor.id, tramo: mejor.tramo, x: q.x, y: q.y }
}

/** Cuántos pasos de la flecha busca el siguiente punto de la red de una sonda (el cable más largo cabe holgado). */
const PASOS_MAX_FLECHA = 80

/** Con la bandera seleccionada, una flecha la lleva al siguiente punto de rejilla de su red en esa dirección, saltando
 * huecos y sin cambiar de red. null si no queda cable donde medir (la de corriente, solo dentro de un tramo recto). */
export function siguienteDeSonda(indice: Indice, doc: Documento, lib: Map<string, PiezaDef>, con: Conexiones, s: Sonda, dx: number, dy: number): DestinoSonda | null {
  for (let k = 1; k <= PASOS_MAX_FLECHA; k++) {
    const q = { x: s.x + dx * k, y: s.y + dy * k }
    const iman = imanEn(indice, doc, q, 0.01)
    if (!iman || esDeOtraRed(con, s, iman)) continue
    const d = destinoDeSonda(doc, lib, s, iman, q)
    if (d.valida && (d.x !== s.x || d.y !== s.y)) return d
  }
  return null
}

/** Algún otro cable termina o tiene un vértice en (x, y): ahí hay una unión y la corriente se reparte. */
function unionEn(doc: Documento, x: number, y: number): boolean {
  for (const id in doc.cables) if (doc.cables[id].puntos.some((q) => q.x === x && q.y === y)) return true
  return false
}

/** Dónde puede ir la pantalla de un medidor en `en`: del lado preferido (arriba a la derecha) al último, desplazamientos enteros hasta `MAX_PANTALLA_MEDIDOR`. */
const LUGARES_PANTALLA: readonly (readonly [number, number])[] = [[7, -6], [-7, -6], [7, 6], [-7, 6], [8, -8], [-8, -8], [8, 8], [-8, 8], [0, -8], [0, 8], [8, 0], [-8, 0]]

/** Desplazamiento de la pantalla de un medidor nuevo en `en` con las reglas de `apartar.ts`: el primer lugar cuyo cuerpo
 * no toca nada y, de esos, el que no cruza un cable. Sin ninguno, arriba a la derecha. */
export function pantallaLibre(doc: Documento, lib: Map<string, PiezaDef>, en: Punto, modo: 'dc' | 'ac'): { dx: number; dy: number } {
  const listas = listasDe(doc)
  const fijas: Caja[] = []
  for (const p of listas.piezas) fijas.push(cuerpoEnMundo(p, lib.get(p.tipo)))
  for (const ts of etiquetasSinChoques(doc, lib, listas).values()) for (const t of ts) if (t) fijas.push(cajaTexto(t))
  for (const e of listas.etiquetas) fijas.push(cajaEtiqueta(e))
  for (const n of listas.notas) fijas.push(cajaNota(n))
  for (const s of Object.values(doc.sondas ?? {})) if (esMedidor(s)) fijas.push(cajaDe(s.x + (s.pantalla?.dx ?? 0), s.y + (s.pantalla?.dy ?? 0), s.modo ?? 'dc'))
  const cables: Caja[] = []
  const m = 0.125
  for (const c of listas.cables) for (let i = 1; i < c.puntos.length; i++) {
    const a = c.puntos[i - 1], b = c.puntos[i]
    cables.push({ minX: Math.min(a.x, b.x) - m, minY: Math.min(a.y, b.y) - m, maxX: Math.max(a.x, b.x) + m, maxY: Math.max(a.y, b.y) + m })
  }
  const cruza = (a: Caja, b: Caja) => a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY
  let libre: [number, number] | null = null
  for (const [dx, dy] of LUGARES_PANTALLA) {
    const c = cajaDe(en.x + dx, en.y + dy, modo)
    if (fijas.some((f) => cruza(c, f))) continue
    libre ??= [dx, dy]
    if (!cables.some((k) => cruza(c, k))) return { dx, dy }
  }
  const [dx, dy] = libre ?? LUGARES_PANTALLA[0]
  return { dx: Math.max(-MAX_PANTALLA_MEDIDOR, Math.min(MAX_PANTALLA_MEDIDOR, dx)), dy: Math.max(-MAX_PANTALLA_MEDIDOR, Math.min(MAX_PANTALLA_MEDIDOR, dy)) }
}

/** El cuerpo de un medidor centrado en (cx, cy) en DC; en AC el borde de arriba es el mismo y crece hacia abajo. */
function cajaDe(cx: number, cy: number, modo: 'dc' | 'ac'): Caja {
  const alto = modo === 'ac' ? ALTO_CUERPO_AC : ALTO_CUERPO_DC
  const minY = cy - ALTO_CUERPO_DC / 2
  return { minX: cx - ANCHO_CUERPO / 2, minY, maxX: cx + ANCHO_CUERPO / 2, maxY: minY + alto }
}

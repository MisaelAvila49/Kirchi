import type { Conexiones } from '../conexiones/conexiones'
import { esDeInstrumento, instrumentoDe } from '../doc/sondas'
import { cuerpoEnMundo } from '../editor/colision'
import type { Documento, Id, Pieza, Punto, Sonda, TipoSonda } from '../doc/tipos'
import { fuenteDeEntrada } from '../instrumentos/entradas'
import { pinesEnMundo } from '../piezas/transformar'
import type { Caja, PiezaDef, Rotulo } from '../piezas/tipos'
import type { Token } from './paleta'
import { cajaTexto, listasDe, type ListasDelDocumento } from './apartar'
import { TAM_CHIP } from './chips'
import { Cubetas } from './cubetas'
import { rotuloDePieza, rotulosDePieza, type Texto } from './etiquetas'
import { ANCHO_CABLE, anchoTexto, cajaEtiqueta, cajaNota } from './medidas'

/** Banderas de las sondas: cuadro con la letra del canal (o «V», «I», «+», «COM») unido por un tallo corto al punto que
 * mide. Se prueban ocho lugares y gana el primero libre que no cruce un cable. No entran al reparto de referencias
 * (`apartar.ts`) ni al de chips. */

/** Lado del cuadro de la bandera y largo del tallo, en unidades de rejilla fina. */
export const LADO_BANDERA = 2.6
export const TALLO = 1.6
/** Alto de la letra de la bandera, en unidades. */
export const TAM_LETRA_BANDERA = 1.6
/** Aire alrededor de la bandera que no se pisa con nada. */
export const AIRE_BANDERA = 0.4
/** Las de voltaje y corriente reservan a la derecha de la bandera el lugar de su cifra (siete caracteres de chip). */
export const RESERVA_CIFRA = 7 * 0.6 * TAM_CHIP + 0.6
/** Hasta dónde llega lo que aparta una bandera desde su punto, en unidades (tallo, cuadro de «COM», cifra y aire). */
const ALCANCE_BANDERA = 16
/** Los lugares de la bandera respecto del punto, en orden de preferencia: las cuatro diagonales y luego los rectos. */
export const LUGARES_BANDERA = ['ne', 'no', 'se', 'so', 'n', 'e', 's', 'o'] as const
export type LugarBandera = (typeof LUGARES_BANDERA)[number]

export interface Bandera {
  sonda: Id
  tipo: TipoSonda
  /** El cuadro de la bandera. */
  caja: Caja
  /** Lo que la bandera aparta: su cuadro con aire y, en voltaje y corriente, el lugar de la cifra. */
  reservada: Caja
  /** Del punto medido a la esquina (o al borde) del cuadro. */
  tallo: [Punto, Punto]
  lugar: LugarBandera
  letra: string
  /** Donde empieza la cifra de las de voltaje y corriente (alineada a la izquierda, al centro del cuadro). */
  cifra: Punto
}

/** La letra de la bandera: el canal, la terminal del multímetro, «V» o «I». */
export function letraDeSonda(s: Sonda): string {
  if (s.tipo === 'voltaje') return 'V'
  if (s.tipo === 'corriente') return 'I'
  if (s.tipo === 'medidor') return 'M'
  return s.entrada ?? '?'
}

/** El ancho del cuadro: el lado, o lo que pida la letra («COM»). */
const anchoBandera = (letra: string) => Math.max(LADO_BANDERA, anchoTexto(letra, TAM_LETRA_BANDERA) + 0.8)
const conCifra = (t: TipoSonda) => t === 'voltaje' || t === 'corriente'

/** El cuadro, el tallo y lo reservado de la bandera de `s` en el lugar `l`. */
function enLugar(s: Sonda, l: LugarBandera): Omit<Bandera, 'sonda' | 'tipo' | 'letra'> {
  const letra = letraDeSonda(s)
  const w = anchoBandera(letra)
  const h = LADO_BANDERA
  const d = TALLO
  const recto = d * 1.4
  let minX: number, minY: number, fin: Punto
  switch (l) {
    case 'ne': [minX, minY, fin] = [s.x + d, s.y - d - h, { x: s.x + d, y: s.y - d }]; break
    case 'no': [minX, minY, fin] = [s.x - d - w, s.y - d - h, { x: s.x - d, y: s.y - d }]; break
    case 'se': [minX, minY, fin] = [s.x + d, s.y + d, { x: s.x + d, y: s.y + d }]; break
    case 'so': [minX, minY, fin] = [s.x - d - w, s.y + d, { x: s.x - d, y: s.y + d }]; break
    case 'n': [minX, minY, fin] = [s.x - w / 2, s.y - recto - h, { x: s.x, y: s.y - recto }]; break
    case 's': [minX, minY, fin] = [s.x - w / 2, s.y + recto, { x: s.x, y: s.y + recto }]; break
    case 'e': [minX, minY, fin] = [s.x + recto, s.y - h / 2, { x: s.x + recto, y: s.y }]; break
    case 'o': [minX, minY, fin] = [s.x - recto - w, s.y - h / 2, { x: s.x - recto, y: s.y }]; break
  }
  const caja = { minX, minY, maxX: minX + w, maxY: minY + h }
  const extra = conCifra(s.tipo) ? RESERVA_CIFRA : 0
  const a = AIRE_BANDERA
  return {
    caja,
    reservada: { minX: caja.minX - a, minY: caja.minY - a, maxX: caja.maxX + extra + a, maxY: caja.maxY + a },
    tallo: [{ x: s.x, y: s.y }, fin],
    lugar: l,
    cifra: { x: caja.maxX + 0.5, y: (caja.minY + caja.maxY) / 2 }
  }
}

/** Lo que aparta la bandera de `s` en cada lugar, en el orden en que se prueban (para las pruebas). */
export const cajasCandidatas = (s: Sonda): Caja[] => LUGARES_BANDERA.map((l) => enLugar(s, l).reservada)

/** Bandera de cada sonda, en orden de id: el primer lugar cuya caja no toca cuerpo de pieza, texto de `textos`, etiqueta,
 * nota ni otra bandera y, entre los libres, el que no cruza un cable. Sin ninguno, arriba a la derecha. */
export function colocarSondas(doc: Documento, lib: Map<string, PiezaDef>, textos: readonly Texto[]): Map<Id, Bandera> {
  return colocar(doc, lib, listasDe(doc), textos)
}

/** `sueltos` son textos que se miran todos; `deLaPieza` da los de una pieza cuyo origen queda cerca de alguna sonda, para
 * no reunir los de miles de piezas lejanas. Las listas del documento son las de la escena (sin otro `Object.values`). */
function colocar(doc: Documento, lib: Map<string, PiezaDef>, listas: ListasDelDocumento, sueltos: readonly Texto[], deLaPieza?: (p: Pieza, def: PiezaDef | undefined) => Iterable<Texto>): Map<Id, Bandera> {
  const out = new Map<Id, Bandera>()
  // Un medidor rápido dibuja su propia pantalla (`medidores.ts`): no lleva bandera.
  const sondas = Object.values(doc.sondas ?? {}).filter((s) => s.tipo !== 'medidor').sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  if (!sondas.length) return out
  // Solo cuentan los obstáculos cerca de alguna sonda (en las celdas de 16 unidades que tocan sus ocho lugares): con miles de
  // piezas y pocas sondas no se reparte todo el dibujo en cubetas.
  const CELDA = 16
  /** Las celdas a lo más `PREVIO` más allá: si el punto de algo no cae en una, su caja tampoco toca las de `CERCA`. */
  const PREVIO = 20
  const CERCA = 1, PREVIA = 2
  const marcas = celdasDeSondas(sondas, CELDA, [[ALCANCE_BANDERA, CERCA], [ALCANCE_BANDERA + PREVIO, PREVIA]])
  const puntoCerca = (x: number, y: number) => (marcas(Math.floor(x / CELDA), Math.floor(y / CELDA)) & PREVIA) !== 0
  const cerca4 = (minX: number, minY: number, maxX: number, maxY: number) => {
    const x0 = Math.floor(minX / CELDA), x1 = Math.floor(maxX / CELDA), y0 = Math.floor(minY / CELDA), y1 = Math.floor(maxY / CELDA)
    // Una caja enorme (un cable de punta a punta del mundo) se toma siempre.
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > 64) return true
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) if (marcas(cx, cy) & CERCA) return true
    return false
  }
  const cerca = (c: Caja) => cerca4(c.minX, c.minY, c.maxX, c.maxY)
  // Antes de armar la caja de una pieza o de un texto se mira si su punto queda cerca: con miles, casi ninguno lo está.
  const fijas: Caja[] = []
  const texto = (t: Texto) => {
    if (!puntoCerca(t.x, t.y)) return
    const c = cajaTexto(t)
    if (cerca(c)) fijas.push(c)
  }
  for (const p of listas.piezas) {
    if (!puntoCerca(p.x, p.y)) continue
    const def = lib.get(p.tipo)
    const c = cuerpoEnMundo(p, def)
    if (cerca(c)) fijas.push(c)
    if (deLaPieza) for (const t of deLaPieza(p, def)) texto(t)
  }
  for (const t of sueltos) texto(t)
  for (const e of listas.etiquetas) {
    if (!puntoCerca(e.x, e.y)) continue
    const c = cajaEtiqueta(e)
    if (cerca(c)) fijas.push(c)
  }
  for (const n of listas.notas) {
    const c = cajaNota(n)
    if (cerca(c)) fijas.push(c)
  }
  const fijos = new Cubetas(fijas.length, CELDA, 1e-9)
  for (const c of fijas) fijos.agregar(c.minX, c.minY, c.maxX, c.maxY)
  fijos.indexar()
  const tramos: Caja[] = []
  const m = ANCHO_CABLE / 2
  for (const c of listas.cables) {
    for (let i = 1; i < c.puntos.length; i++) {
      const a = c.puntos[i - 1], b = c.puntos[i]
      // Un tramo corto lejos de toda sonda se salta con mirar su punta; uno largo se revisa entero.
      if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) < PREVIO && !puntoCerca(a.x, a.y)) continue
      const [x0, y0, x1, y1] = [Math.min(a.x, b.x) - m, Math.min(a.y, b.y) - m, Math.max(a.x, b.x) + m, Math.max(a.y, b.y) + m]
      if (cerca4(x0, y0, x1, y1)) tramos.push({ minX: x0, minY: y0, maxX: x1, maxY: y1 })
    }
  }
  const cables = new Cubetas(tramos.length, CELDA, 1e-9)
  for (const t of tramos) cables.agregar(t.minX, t.minY, t.maxX, t.maxY)
  cables.indexar()
  const puestas: Caja[] = []
  const cruzaPuesta = (c: Caja) => puestas.some((o) => o.minX < c.maxX && c.minX < o.maxX && o.minY < c.maxY && c.minY < o.maxY)
  for (const s of sondas) {
    let elegido: ReturnType<typeof enLugar> | null = null
    let libre: ReturnType<typeof enLugar> | null = null
    for (const l of LUGARES_BANDERA) {
      const e = enLugar(s, l)
      if (fijos.choca(e.reservada) || cruzaPuesta(e.reservada)) continue
      libre ??= e
      if (!cables.choca(e.caja)) {
        elegido = e
        break
      }
    }
    const e = elegido ?? libre ?? enLugar(s, 'ne')
    puestas.push(e.reservada)
    out.set(s.id, { sonda: s.id, tipo: s.tipo, letra: letraDeSonda(s), ...e })
  }
  return out
}

/** La banderita de la entrada de un instrumento unida por sonda: el cuadro con la letra junto al pin, con un tallo corto. */
export interface BanderaDeEntrada {
  sonda: Id
  instrumento: Id
  letra: string
  caja: Caja
  /** Del pin a la orilla del cuadro. */
  tallo: [Punto, Punto]
}

/** Banderitas de las entradas de instrumento con sonda unida: la misma bandera con su letra, junto al pin y hacia afuera,
 * para que la entrada no parezca desconectada. */
export function banderasDeEntradas(doc: Documento, lib: Map<string, PiezaDef>, con: Conexiones): BanderaDeEntrada[] {
  const out: BanderaDeEntrada[] = []
  for (const s of Object.values(doc.sondas ?? {}).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    if (!esDeInstrumento(s) || !con.redDeSonda.has(s.id)) continue
    const p = instrumentoDe(doc, s)
    const def = p ? lib.get(p.tipo) : undefined
    if (!p || !def) continue
    const pin = pinesEnMundo(p, def).find((q) => q.id === s.entrada)
    if (!pin) continue
    const c = cuerpoEnMundo(p, def)
    const dx = pin.x - (c.minX + c.maxX) / 2, dy = pin.y - (c.minY + c.maxY) / 2
    const [ux, uy] = Math.abs(dx) >= Math.abs(dy) ? [Math.sign(dx) || 1, 0] : [0, Math.sign(dy)]
    const letra = letraDeSonda(s)
    const w = anchoBandera(letra), h = LADO_BANDERA
    const fin = { x: pin.x + ux * TALLO, y: pin.y + uy * TALLO }
    const minX = ux > 0 ? fin.x : ux < 0 ? fin.x - w : fin.x - w / 2
    const minY = uy > 0 ? fin.y : uy < 0 ? fin.y - h : fin.y - h / 2
    out.push({ sonda: s.id, instrumento: p.id, letra, caja: { minX, minY, maxX: minX + w, maxY: minY + h }, tallo: [{ x: pin.x, y: pin.y }, fin] })
  }
  return out
}

/** El color de la bandera y del rótulo de cada canal del osciloscopio. */
export const TOKEN_DE_CANAL: Readonly<Record<string, Token>> = { A: 'sondaA', B: 'sondaB', C: 'sondaC', D: 'sondaD' }
/** Caracteres de la fuente que caben en el rótulo de una entrada; más se recortan con «…». */
export const MAX_FUENTE_ROTULO = 8
const recortar = (t: string) => (t.length > MAX_FUENTE_ROTULO ? `${t.slice(0, MAX_FUENTE_ROTULO - 1)}…` : t)

/** Lo que dicen las entradas con sonda: en el osciloscopio el rótulo cambia de texto y toma el color del canal; el
 * multímetro, que no rotula sus terminales, recibe rótulos junto a «+» y COM. Una sonda que no mide nada no cambia el
 * rótulo. */
export function rotulosDeEntradas(doc: Documento, lib: Map<string, PiezaDef>, con: Conexiones): Map<Id, { reemplazos: Map<string, { texto: string; color: Token }>; extra: Rotulo[] }> {
  const out = new Map<Id, { reemplazos: Map<string, { texto: string; color: Token }>; extra: Rotulo[] }>()
  for (const s of Object.values(doc.sondas ?? {}).sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (!esDeInstrumento(s)) continue
    const p = instrumentoDe(doc, s)
    const m = p ? lib.get(p.tipo)?.modelo : undefined
    if (!p || !m || !con.redDeSonda.has(s.id)) continue
    const f = fuenteDeEntrada(doc, con, p.id, s.entrada)
    if (!f) continue
    let r = out.get(p.id)
    if (!r) out.set(p.id, (r = { reemplazos: new Map(), extra: [] }))
    if (m.tipo === 'osciloscopio' && m.entradas.includes(s.entrada)) r.reemplazos.set(s.entrada, { texto: `${s.entrada} ← ${recortar(f)}`, color: TOKEN_DE_CANAL[s.entrada] ?? 'pieza' })
    else if (m.tipo === 'multimetro' && s.entrada === m.mas) r.extra.push({ texto: `← ${recortar(f)}`, x: 2.8, y: -4.6, tam: 1.2, alinear: 'izq', fuente: 'mono', tinta: 'valor' })
    else if (m.tipo === 'multimetro' && s.entrada === m.com) r.extra.push({ texto: `COM ← ${recortar(f)}`, x: 1.2, y: 4.6, tam: 1.2, alinear: 'izq', fuente: 'mono', tinta: 'valor' })
  }
  for (const r of out.values()) r.extra.sort((a, b) => a.y - b.y)
  return out
}

/** Textos de piezas que una bandera no pisa: referencias y valores ya repartidos (`etiquetasSinChoques`) y rótulos de
 * símbolos (con «A ← R1:2» donde haya sonda). Etiquetas de red y notas van como cajas en `colocarSondas`. Escena y editor
 * usan esta misma lista. */
export function textosDePiezas(doc: Documento, lib: Map<string, PiezaDef>, con: Conexiones, etiquetas: ReadonlyMap<Id, readonly Texto[]>): Texto[] {
  const out: Texto[] = []
  for (const ts of etiquetas.values()) for (const t of ts) if (t) out.push(t)
  const entradas = rotulosDeEntradas(doc, lib, con)
  for (const p of Object.values(doc.piezas)) {
    const def = lib.get(p.tipo)
    if (!def) continue
    const e = entradas.get(p.id)
    if (def.rotulos) out.push(...rotulosDePieza(p, def, e?.reemplazos))
    if (e) for (const r of e.extra) out.push(rotuloDePieza(p, def, r))
  }
  return out
}

/** Celdas de la rejilla de más de esto se guardan en un `Map` y no en un arreglo (sondas a millones de unidades unas de otras). */
const MAX_CELDAS_ARREGLO = 1 << 22

/** Marcas de las celdas de lado `celda` a lo más `r` de alguna sonda, por cada par `[r, bit]`: `(cx, cy) => bits`. Arreglo
 * de bytes sobre la caja de las sondas (más rápido que un `Set` con miles de cables) o un `Map` si la caja es enorme. */
function celdasDeSondas(sondas: readonly Sonda[], celda: number, radios: readonly (readonly [number, number])[]): (cx: number, cy: number) => number {
  const rMax = Math.max(...radios.map(([r]) => r))
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const s of sondas) {
    x0 = Math.min(x0, Math.floor((s.x - rMax) / celda)); x1 = Math.max(x1, Math.floor((s.x + rMax) / celda))
    y0 = Math.min(y0, Math.floor((s.y - rMax) / celda)); y1 = Math.max(y1, Math.floor((s.y + rMax) / celda))
  }
  const w = x1 - x0 + 1, h = y1 - y0 + 1
  const recorrer = (poner: (cx: number, cy: number, bit: number) => void) => {
    for (const s of sondas)
      for (const [r, bit] of radios)
        for (let cx = Math.floor((s.x - r) / celda); cx <= Math.floor((s.x + r) / celda); cx++)
          for (let cy = Math.floor((s.y - r) / celda); cy <= Math.floor((s.y + r) / celda); cy++) poner(cx, cy, bit)
  }
  if (w * h <= MAX_CELDAS_ARREGLO) {
    const a = new Uint8Array(w * h)
    recorrer((cx, cy, bit) => (a[(cy - y0) * w + (cx - x0)] |= bit))
    return (cx, cy) => (cx < x0 || cx > x1 || cy < y0 || cy > y1 ? 0 : a[(cy - y0) * w + (cx - x0)])
  }
  // Llaves de 30 bits: un número chico (Smi) se busca mucho más rápido que uno de 32 bits.
  const llave = (cx: number, cy: number) => (cx & 0x7fff) * 32768 + (cy & 0x7fff)
  const m = new Map<number, number>()
  recorrer((cx, cy, bit) => m.set(llave(cx, cy), (m.get(llave(cx, cy)) ?? 0) | bit))
  return (cx, cy) => m.get(llave(cx, cy)) ?? 0
}

/** Las banderas del último documento (y sus conexiones): la escena y el editor las piden para el mismo y se colocan una vez. */
const ultimas = new WeakMap<Documento, { con: Conexiones; banderas: Map<Id, Bandera> }>()

/** Las banderas de las sondas tal como las dibuja la escena. */
export function banderasDelDocumento(doc: Documento, lib: Map<string, PiezaDef>, con: Conexiones, etiquetas: ReadonlyMap<Id, readonly Texto[]>, listas?: ListasDelDocumento): Map<Id, Bandera> {
  const u = ultimas.get(doc)
  if (u && u.con === con) return u.banderas
  const entradas = rotulosDeEntradas(doc, lib, con)
  // Solo los textos de las piezas cerca de alguna sonda: los mismos que `textosDePiezas`, sin reunir los de todo el dibujo.
  const banderas = colocar(doc, lib, listas ?? listasDe(doc), [], function* (p, def) {
    const ts = etiquetas.get(p.id)
    if (ts) for (const t of ts) if (t) yield t
    if (!def) return
    const e = entradas.get(p.id)
    if (def.rotulos) yield* rotulosDePieza(p, def, e?.reemplazos)
    if (e) for (const r of e.extra) yield rotuloDePieza(p, def, r)
  })
  ultimas.set(doc, { con, banderas })
  return banderas
}

/** La bandera que contiene el punto `p` (con `tol` de holgura), la de encima si hay dos; null si ninguna. */
export function banderaEn(banderas: ReadonlyMap<Id, Bandera>, p: Punto, tol = 0): Id | null {
  let hallada: Id | null = null
  for (const b of banderas.values()) {
    const c = b.caja
    if (p.x >= c.minX - tol && p.x <= c.maxX + tol && p.y >= c.minY - tol && p.y <= c.maxY + tol) hallada = b.sonda
  }
  return hallada
}

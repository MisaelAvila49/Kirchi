import type { Documento, Id, Punto } from '../doc/tipos'
import { pinesEnMundo } from '../piezas/transformar'
import type { Caja, PiezaDef } from '../piezas/tipos'
import { cuerpoEnMundo } from './colision'
import { cableEncimado } from './conflictos'
import type { Indice } from './indice'
import { iguales, limpiarPolilinea, PASO_REJILLA, rutaL } from './rutas'

/** Enrutador ortogonal en la rejilla principal (pasos de 2 unidades): recta, luego la L pedida, luego la otra; si no, A*
 * al camino más corto con pocos codos que evite cuerpos (ampliados 1 unidad), pines, etiquetas, vértices ajenos y correr
 * sobre otro cable. Sin camino, la L con menos conflictos. */

export interface OpcionesRuta {
  /** La L preferida cuando las dos están libres (la del primer movimiento o la que invierte `/`). */
  horizontalPrimero?: boolean
  /** Cables que no cuentan (el que se vuelve a enrutar). */
  ignorarCables?: Set<Id>
  indice?: Indice
}

/** Costo de un codo, en pasos de rejilla. */
export const COSTO_CODO = 4
/** Costo extra por paso que corre encima de otro cable. */
export const COSTO_ENCIMADO = 50
/** Aire alrededor de los extremos para buscar, en unidades; crece al doble hasta 3 veces. */
export const MARGEN_BUSQUEDA = 8
const CRECIMIENTOS = 3
/** Aire que el camino deja a los cuerpos, en unidades. */
const AIRE = 1
const EPS = 1e-6
const PASO = PASO_REJILLA
const DX = [PASO, 0, -PASO, 0]
const DY = [0, PASO, 0, -PASO]

const k = (x: number, y: number) => `${x},${y}`

/** Lo que estorba al enrutar dentro de una zona del documento. */
class Obstaculos {
  private celdas = new Map<string, { cuerpo: Caja; inflado: Caja }[]>()
  private nodos = new Set<string>()
  private filas = new Map<number, [number, number][]>()
  private columnas = new Map<number, [number, number][]>()
  private static readonly CELDA = 8

  constructor(doc: Documento, lib: Map<string, PiezaDef>, zona: Caja, op: OpcionesRuta) {
    const z = { minX: zona.minX - 4, minY: zona.minY - 4, maxX: zona.maxX + 4, maxY: zona.maxY + 4 }
    const piezas = op.indice ? op.indice.buscar(z).filter((it) => it.col === 'piezas').map((it) => doc.piezas[it.id]) : Object.values(doc.piezas)
    for (const p of piezas) {
      if (!p) continue
      const def = lib.get(p.tipo)
      const cuerpo = cuerpoEnMundo(p, def)
      const inflado = { minX: cuerpo.minX - AIRE, minY: cuerpo.minY - AIRE, maxX: cuerpo.maxX + AIRE, maxY: cuerpo.maxY + AIRE }
      if (inflado.maxX < z.minX || inflado.minX > z.maxX || inflado.maxY < z.minY || inflado.minY > z.maxY) continue
      const c = Obstaculos.CELDA
      for (let cx = Math.floor(inflado.minX / c); cx <= Math.floor(inflado.maxX / c); cx++)
        for (let cy = Math.floor(inflado.minY / c); cy <= Math.floor(inflado.maxY / c); cy++) {
          const kk = k(cx, cy)
          const l = this.celdas.get(kk)
          if (l) l.push({ cuerpo, inflado })
          else this.celdas.set(kk, [{ cuerpo, inflado }])
        }
      if (def) for (const pin of pinesEnMundo(p, def)) this.nodos.add(k(pin.x, pin.y))
    }
    for (const e of Object.values(doc.etiquetas)) this.nodos.add(k(e.x, e.y))
    const cables = op.indice
      ? [...new Set(op.indice.buscar(z).filter((it) => it.col === 'cables').map((it) => it.id))].map((id) => doc.cables[id])
      : Object.values(doc.cables)
    for (const cable of cables) {
      if (!cable || op.ignorarCables?.has(cable.id)) continue
      const pts = cable.puntos
      for (let i = 0; i < pts.length; i++) {
        this.nodos.add(k(pts[i].x, pts[i].y))
        if (i === 0) continue
        const a = pts[i - 1], b = pts[i]
        if (a.y === b.y && a.x !== b.x) agregar(this.filas, a.y, [Math.min(a.x, b.x), Math.max(a.x, b.x)])
        else if (a.x === b.x && a.y !== b.y) agregar(this.columnas, a.x, [Math.min(a.y, b.y), Math.max(a.y, b.y)])
      }
    }
  }

  /** Nodo ocupado por un pin, una etiqueta o un vértice de otro cable. */
  ocupado(x: number, y: number): boolean {
    return this.nodos.has(k(x, y))
  }

  /** El paso a→b entra a un cuerpo (a su zona de aire salvo que toque un extremo, donde solo cuenta el cuerpo). */
  bloquea(ax: number, ay: number, bx: number, by: number, junto: boolean): boolean {
    const c = Obstaculos.CELDA
    const x0 = Math.min(ax, bx), x1 = Math.max(ax, bx), y0 = Math.min(ay, by), y1 = Math.max(ay, by)
    for (let cx = Math.floor(x0 / c); cx <= Math.floor(x1 / c); cx++)
      for (let cy = Math.floor(y0 / c); cy <= Math.floor(y1 / c); cy++)
        for (const o of this.celdas.get(k(cx, cy)) ?? []) {
          const b = junto ? o.cuerpo : o.inflado
          if (y0 === y1 ? y0 > b.minY + EPS && y0 < b.maxY - EPS && x0 < b.maxX - EPS && x1 > b.minX + EPS : x0 > b.minX + EPS && x0 < b.maxX - EPS && y0 < b.maxY - EPS && y1 > b.minY + EPS)
            return true
        }
    return false
  }

  /** El paso a→b corre encima de otro cable. */
  encima(ax: number, ay: number, bx: number, by: number): boolean {
    const [lista, lo, hi] = ay === by ? [this.filas.get(ay), Math.min(ax, bx), Math.max(ax, bx)] : [this.columnas.get(ax), Math.min(ay, by), Math.max(ay, by)]
    if (!lista) return false
    for (const [a, b] of lista) if (Math.min(hi, b) - Math.max(lo, a) > EPS) return true
    return false
  }
}

function agregar(m: Map<number, [number, number][]>, clave: number, v: [number, number]) {
  const l = m.get(clave)
  if (l) l.push(v)
  else m.set(clave, [v])
}

/** Conflictos de una polilínea ortogonal, paso a paso: bloqueos (cuerpos u ocupados) y pasos encimados. */
function evaluar(obs: Obstaculos, pts: Punto[], desde: Punto, hasta: Punto): { bloqueos: number; encimados: number } {
  let bloqueos = 0, encimados = 0
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i]
    const sx = Math.sign(b.x - a.x) * PASO, sy = Math.sign(b.y - a.y) * PASO
    const n = Math.round((Math.abs(b.x - a.x) + Math.abs(b.y - a.y)) / PASO)
    let x = a.x, y = a.y
    for (let s = 0; s < n; s++) {
      const nx = x + sx, ny = y + sy
      const junto = (x === desde.x && y === desde.y) || (nx === hasta.x && ny === hasta.y)
      if (obs.bloquea(x, y, nx, ny, junto)) bloqueos++
      if (!(nx === hasta.x && ny === hasta.y) && obs.ocupado(nx, ny)) bloqueos++
      if (obs.encima(x, y, nx, ny)) encimados++
      x = nx
      y = ny
    }
  }
  return { bloqueos, encimados }
}

export function codos(pts: Punto[]): number {
  return Math.max(0, limpiarPolilinea(pts).length - 2)
}

/** Montículo binario de estados por costo estimado; desempata por menor heurística. */
class Monticulo {
  private ids: number[] = []
  private f: number[] = []
  private h: number[] = []
  get vacio() {
    return this.ids.length === 0
  }
  meter(id: number, f: number, h: number) {
    const { ids, f: F, h: H } = this
    ids.push(id), F.push(f), H.push(h)
    let i = ids.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (F[p] < F[i] || (F[p] === F[i] && H[p] <= H[i])) break
      ;[ids[p], ids[i]] = [ids[i], ids[p]]
      ;[F[p], F[i]] = [F[i], F[p]]
      ;[H[p], H[i]] = [H[i], H[p]]
      i = p
    }
  }
  sacar(): number {
    const { ids, f: F, h: H } = this
    const top = ids[0]
    const id = ids.pop()!, f = F.pop()!, h = H.pop()!
    if (ids.length) {
      ids[0] = id, F[0] = f, H[0] = h
      let i = 0
      for (;;) {
        const l = 2 * i + 1, r = l + 1
        let m = i
        if (l < ids.length && (F[l] < F[m] || (F[l] === F[m] && H[l] < H[m]))) m = l
        if (r < ids.length && (F[r] < F[m] || (F[r] === F[m] && H[r] < H[m]))) m = r
        if (m === i) break
        ;[ids[m], ids[i]] = [ids[i], ids[m]]
        ;[F[m], F[i]] = [F[i], F[m]]
        ;[H[m], H[i]] = [H[i], H[m]]
        i = m
      }
    }
    return top
  }
}

/** A* con estado (nodo, dirección) dentro de la caja; null si no hay camino. */
function buscar(obs: Obstaculos, desde: Punto, hasta: Punto, caja: Caja): Punto[] | null {
  const x0 = caja.minX, y0 = caja.minY
  const W = Math.round((caja.maxX - x0) / PASO) + 1, H = Math.round((caja.maxY - y0) / PASO) + 1
  const N = W * H
  const g = new Float64Array(N * 4).fill(Infinity)
  const padre = new Int32Array(N * 4).fill(-1)
  const cerrado = new Uint8Array(N * 4)
  const nodo = (x: number, y: number) => Math.round((x - x0) / PASO) + Math.round((y - y0) / PASO) * W
  const meta = nodo(hasta.x, hasta.y)
  const heur = (x: number, y: number) => {
    const dx = Math.abs(hasta.x - x), dy = Math.abs(hasta.y - y)
    return (dx + dy) / PASO + (dx > 0 && dy > 0 ? COSTO_CODO : 0)
  }
  const m = new Monticulo()
  const inicio = nodo(desde.x, desde.y)
  // Estados de salida: los cuatro sentidos desde el inicio, sin codo.
  for (let d = 0; d < 4; d++) {
    g[inicio * 4 + d] = 0
    m.meter(inicio * 4 + d, heur(desde.x, desde.y), heur(desde.x, desde.y))
  }
  let fin = -1
  while (!m.vacio) {
    const s = m.sacar()
    if (cerrado[s]) continue
    cerrado[s] = 1
    const n = s >> 2, d = s & 3
    if (n === meta) {
      fin = s
      break
    }
    const x = x0 + (n % W) * PASO, y = y0 + Math.floor(n / W) * PASO
    for (let nd = 0; nd < 4; nd++) {
      if (nd === ((d + 2) & 3) && n !== inicio) continue
      const nx = x + DX[nd], ny = y + DY[nd]
      if (nx < x0 || ny < y0 || nx > caja.maxX || ny > caja.maxY) continue
      const nn = nodo(nx, ny)
      const esMeta = nn === meta
      if (!esMeta && obs.ocupado(nx, ny)) continue
      const junto = n === inicio || esMeta
      if (obs.bloquea(x, y, nx, ny, junto)) continue
      const codo = n !== inicio && nd !== d ? COSTO_CODO : 0
      const costo = g[s] + 1 + codo + (obs.encima(x, y, nx, ny) ? COSTO_ENCIMADO : 0)
      const ns = nn * 4 + nd
      if (costo < g[ns]) {
        g[ns] = costo
        padre[ns] = s
        const h = heur(nx, ny)
        m.meter(ns, costo + h, h)
      }
    }
  }
  if (fin < 0) return null
  const pts: Punto[] = []
  for (let s = fin; s >= 0; s = padre[s]) {
    const n = s >> 2
    pts.push({ x: x0 + (n % W) * PASO, y: y0 + Math.floor(n / W) * PASO })
    if (padre[s] < 0) break
  }
  pts.reverse()
  return limpiarPolilinea(pts)
}

const alRejilla = (v: number, abajo: boolean) => (abajo ? Math.floor(v / PASO) : Math.ceil(v / PASO)) * PASO

export function enrutar(doc: Documento, lib: Map<string, PiezaDef>, desde: Punto, hasta: Punto, op: OpcionesRuta = {}): Punto[] {
  if (iguales(desde, hasta)) return [desde]
  const a = { x: desde.x, y: desde.y }, b = { x: hasta.x, y: hasta.y }
  const h = op.horizontalPrimero ?? Math.abs(b.x - a.x) >= Math.abs(b.y - a.y)
  const candidatas = [rutaL(a, b, h), rutaL(a, b, !h)]
  const zona0 = { minX: Math.min(a.x, b.x), minY: Math.min(a.y, b.y), maxX: Math.max(a.x, b.x), maxY: Math.max(a.y, b.y) }
  let obs = new Obstaculos(doc, lib, zona0, op)
  const notas = candidatas.map((c) => ({ c, ...evaluar(obs, c, a, b) }))
  for (const n of notas) if (n.bloqueos === 0 && n.encimados === 0) return n.c
  // Fuera de la rejilla principal A* no aplica: se queda la mejor L.
  const enRejilla = [a.x, a.y, b.x, b.y].every((v) => v % PASO === 0)
  if (enRejilla) {
    let margen = MARGEN_BUSQUEDA
    for (let intento = 0; intento <= CRECIMIENTOS; intento++, margen *= 2) {
      const caja = { minX: alRejilla(zona0.minX - margen, true), minY: alRejilla(zona0.minY - margen, true), maxX: alRejilla(zona0.maxX + margen, false), maxY: alRejilla(zona0.maxY + margen, false) }
      obs = new Obstaculos(doc, lib, caja, op)
      const r = buscar(obs, a, b, caja)
      if (r) return r
    }
  }
  notas.sort((p, q) => p.bloqueos - q.bloqueos || p.encimados - q.encimados)
  return notas[0].c
}

/** La ruta no atraviesa cuerpos, no pasa por pines ni vértices ajenos y no corre encima de otro cable. */
export function rutaLibre(doc: Documento, lib: Map<string, PiezaDef>, pts: Punto[], op: OpcionesRuta = {}): boolean {
  if (pts.length < 2) return true
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y)
  const obs = new Obstaculos(doc, lib, { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) }, op)
  const r = evaluar(obs, pts, pts[0], pts[pts.length - 1])
  return r.bloqueos === 0 && r.encimados === 0
}

const sentido = (a: Punto, b: Punto): [number, number] => [Math.sign(b.x - a.x), Math.sign(b.y - a.y)]

/** Tres tramos seguidos en los que el primero y el tercero van en sentidos opuestos: sube, cruza y baja (un «chipote»). */
export function tieneVuelta(pts: Punto[]): boolean {
  const p = limpiarPolilinea(pts)
  for (let i = 0; i + 3 < p.length; i++) {
    const [ax, ay] = sentido(p[i], p[i + 1]), [bx, by] = sentido(p[i + 2], p[i + 3])
    if (ax === -bx && ay === -by) return true
  }
  return false
}

/** Ruta nueva para un cable de extremos fijos (p. ej. estirado al mover una pieza) si atraviesa un cuerpo o tiene una U
 * que el enrutador resuelve con menos codos; si no, null. */
export function repararCable(doc: Documento, lib: Map<string, PiezaDef>, id: Id): Punto[] | null {
  const c = doc.cables[id]
  if (!c || c.puntos.length < 2) return null
  const pts = c.puntos
  const ignorarCables = new Set([id])
  const cruza = !rutaLibreDeCuerpos(doc, lib, pts)
  const vuelta = tieneVuelta(pts)
  // Encima de otro cable, aunque sea de su misma red: el tramo que vuelve a una unión sobre un cable que sale de ella la corre de lugar.
  const encima = cableEncimado(doc, pts, (o) => o === id) !== null
  if (!cruza && !vuelta && !encima) return null
  const r = enrutar(doc, lib, pts[0], pts[pts.length - 1], { ignorarCables })
  if (!rutaLibreDeCuerpos(doc, lib, r)) return null
  if (cruza) return r
  if (encima) return cableEncimado(doc, r, (o) => o === id) === null ? r : null
  return rutaLibre(doc, lib, r, { ignorarCables }) && codos(r) < codos(pts) ? r : null
}

/** Ningún tramo entra al interior de un cuerpo (sin aire ni más reglas: el invariante). */
function rutaLibreDeCuerpos(doc: Documento, lib: Map<string, PiezaDef>, pts: Punto[]): boolean {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i]
    const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y)
    for (const p of Object.values(doc.piezas)) {
      const c = cuerpoEnMundo(p, lib.get(p.tipo))
      const dentro = y0 === y1
        ? y0 > c.minY + EPS && y0 < c.maxY - EPS && x0 < c.maxX - EPS && x1 > c.minX + EPS
        : x0 > c.minX + EPS && x0 < c.maxX - EPS && y0 < c.maxY - EPS && y1 > c.minY + EPS
      if (dentro) return false
    }
  }
  return true
}

import { clavePin, partirClavePin, type Conexiones, type Red } from '../conexiones/conexiones'
import type { Documento, Punto } from '../doc/tipos'
import type { Golpe } from '../editor/indice'
import { pinesEnMundo } from '../piezas/transformar'
import type { Caja, PiezaDef } from '../piezas/tipos'
import { cajaTexto } from './apartar'
import type { Texto } from './etiquetas'
import { CHIP_ALTO, CHIP_PAD_X } from './texto'

/** Cuánto puede alejarse el lector un chip de voltaje de su red: a lo más 8 unidades (10 mm) del punto más cercano de
 * sus cables o pines, para que no deje de leerse como el voltaje de esa red. Dentro de ese alcance lo lleva a donde quiera,
 * a lo largo de toda la red. Solo vive en la sesión. */
export const DESPLAZO_MAX_CHIP = 8
/** Tope de cordura del desplazo guardado, en unidades: el alcance real lo da `acotarAlAlcance` al dibujar. */
const DESPLAZO_TOPE = 4000

export interface Desplazo {
  dx: number
  dy: number
}
/** Desplazos por red (llave de `claveDeRedChip`), compartidos por el reparto y el arrastre. */
export type Desplazos = Map<string, Desplazo>

/** Sanea un desplazo: lo que no es número vale cero y lo absurdamente grande se recorta al tope. */
export function limitarDesplazo(dx: number, dy: number): Desplazo {
  const x = Number.isFinite(dx) ? dx : 0, y = Number.isFinite(dy) ? dy : 0
  const largo = Math.hypot(x, y)
  if (largo <= DESPLAZO_TOPE) return { dx: x, dy: y }
  const k = DESPLAZO_TOPE / largo
  return { dx: x * k, dy: y * k }
}

/** Desplazo de un chip al soltar: el que tenía (`base`, desde su lugar calculado) más lo que se movió el puntero. Siempre
 * se cuenta desde el lugar calculado; el alcance de la red se aplica al dibujar. */
export function desplazoTrasArrastre(base: Desplazo, inicio: Punto, ahora: Punto): Desplazo {
  return limitarDesplazo(base.dx + ahora.x - inicio.x, base.dy + ahora.y - inicio.y)
}

/** Lleva (x, y) a lo más a `DESPLAZO_MAX_CHIP` de la red: de sus tramos de cable y de sus pines. Dentro del alcance no lo mueve. */
export function acotarAlAlcance(doc: Documento, lib: Map<string, PiezaDef>, r: Pick<Red, 'pines' | 'cables'>, x: number, y: number): Punto {
  let mejor = Infinity, mx = x, my = y
  const prueba = (ax: number, ay: number, bx: number, by: number) => {
    const vx = bx - ax, vy = by - ay
    const l2 = vx * vx + vy * vy
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / l2))
    const px = ax + t * vx, py = ay + t * vy
    const d = Math.hypot(x - px, y - py)
    if (d < mejor) {
      mejor = d
      mx = px
      my = py
    }
  }
  for (const id of r.cables) {
    const pts = doc.cables[id]?.puntos ?? []
    if (pts.length === 1) prueba(pts[0].x, pts[0].y, pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length; i++) prueba(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y)
  }
  for (const clave of r.pines) {
    const { piezaId, pinId } = partirClavePin(clave)
    const p = doc.piezas[piezaId]
    const def = p ? lib.get(p.tipo) : undefined
    const q = p && def ? pinesEnMundo(p, def).find((u) => u.id === pinId) : undefined
    if (q) prueba(q.x, q.y, q.x, q.y)
  }
  if (mejor <= DESPLAZO_MAX_CHIP) return { x, y }
  const k = DESPLAZO_MAX_CHIP / mejor
  return { x: mx + (x - mx) * k, y: my + (y - my) * k }
}

/** Llave de una red estable en la sesión: el menor de sus pines («piezaId:pinId») o, sin pines, el menor de sus cables. El
 * número de red cambia al recalcular conexiones; la llave no. */
export function claveDeRedChip(r: Pick<Red, 'pines' | 'cables'>): string {
  // Un bucle y no `reduce`: la capa la pide para cada red en cada lectura.
  const menor = (xs: readonly string[]) => {
    let m = xs[0]
    for (let i = 1; i < xs.length; i++) if (xs[i] < m) m = xs[i]
    return m
  }
  return r.pines.length ? `p:${menor(r.pines)}` : r.cables.length ? `c:${menor(r.cables)}` : ''
}

/** Una red lleva chip de voltaje si no es la tierra y tiene dos conexiones o más (pines y cables). */
export const redLlevaChip = (r: Pick<Red, 'tierra' | 'pines' | 'cables'>): boolean => !r.tierra && r.pines.length + r.cables.length >= 2

/** La caja que cubre un chip con su placa, en unidades de mundo. */
export function cajaChip(t: Texto): Caja {
  const c = cajaTexto(t, 0)
  const pad = CHIP_PAD_X * t.tamaño
  const mitad = (CHIP_ALTO * t.tamaño) / 2
  const y = (c.minY + c.maxY) / 2
  return { minX: c.minX - pad, maxX: c.maxX + pad, minY: y - mitad, maxY: y + mitad }
}

/** Caja que debe abarcar el encuadre: la de la escena más la placa de cada chip de voltaje a la vista (los que dibuja la
 * capa ahora, no los ocultos). Sin escena ni chips, null. */
export function cajaConChips(caja: Caja | null, chips: readonly Texto[]): Caja | null {
  let r = caja ? { ...caja } : null
  for (const t of chips) {
    if (!t.chip) continue
    const c = cajaChip(t)
    r = r ? { minX: Math.min(r.minX, c.minX), minY: Math.min(r.minY, c.minY), maxX: Math.max(r.maxX, c.maxX), maxY: Math.max(r.maxY, c.maxY) } : c
  }
  return r
}

/** Cuánto se ensancha la placa de un chip para decidir si sigue a la vista: cubre el hueco entre su cable y su placa
 * (`SEPARACION_CHIP` menos media placa, más la tolerancia del cable), así ir del cable al chip no lo oculta. */
export const MARGEN_HOVER_CHIP = 1

/** El chip bajo el punto (el último de la lista si se encimaran), o null. Los chips sin llave no se mueven. `margen` ensancha la placa. */
export function chipEn(chips: readonly Texto[], p: Punto, margen = 0): Texto | null {
  for (let i = chips.length - 1; i >= 0; i--) {
    const t = chips[i]
    if (!t.chip || !t.clave) continue
    const c = cajaChip(t)
    if (p.x >= c.minX - margen && p.x <= c.maxX + margen && p.y >= c.minY - margen && p.y <= c.maxY + margen) return t
  }
  return null
}

/** La red del cable, el pin o la etiqueta bajo el ratón; undefined si no es nada de una red. */
export function redDeGolpe(con: Conexiones, g: Golpe | null): number | undefined {
  if (!g) return undefined
  if (g.tipo === 'cable') return con.redDeCable.get(g.id)
  if (g.tipo === 'pin') return con.redDePin.get(clavePin(g.piezaId, g.pinId))
  if (g.tipo === 'etiqueta') return con.redDeEtiqueta.get(g.id)
  return undefined
}

/** Redes con chip: null (todas) con la tecla V; si no, la del ratón (cable, pin o etiqueta), la del chip bajo el ratón
 * (para que siga a la vista al ir hacia él) y la que se arrastra. */
export function redesConChip(e: { todos: boolean; bajoElRaton?: number; bajoElChip?: number; arrastrada?: number }): Set<number> | null {
  if (e.todos) return null
  const redes = new Set<number>()
  for (const r of [e.bajoElRaton, e.bajoElChip, e.arrastrada]) if (r !== undefined) redes.add(r)
  return redes
}

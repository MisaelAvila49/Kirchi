import { clavePin, type Conexiones, type Red } from '../conexiones/conexiones'
import type { Punto } from '../doc/tipos'
import type { Golpe } from '../editor/indice'
import type { Caja } from '../piezas/tipos'
import { cajaTexto } from './apartar'
import type { Texto } from './etiquetas'
import { CHIP_ALTO, CHIP_PAD_X } from './texto'

/** Cuánto puede mover el lector un chip de voltaje: a lo más 8 unidades (10 mm) de su lugar calculado, sin que deje de
 * leerse como el voltaje de su red. Solo vive en la sesión. */
export const DESPLAZO_MAX_CHIP = 8

export interface Desplazo {
  dx: number
  dy: number
}
/** Desplazos por red (llave de `claveDeRedChip`), compartidos por el reparto y el arrastre. */
export type Desplazos = Map<string, Desplazo>

/** Acota el desplazo a un círculo de `DESPLAZO_MAX_CHIP` de radio; lo que no es número vale cero. */
export function limitarDesplazo(dx: number, dy: number): Desplazo {
  const x = Number.isFinite(dx) ? dx : 0, y = Number.isFinite(dy) ? dy : 0
  const largo = Math.hypot(x, y)
  if (largo <= DESPLAZO_MAX_CHIP) return { dx: x, dy: y }
  const k = DESPLAZO_MAX_CHIP / largo
  return { dx: x * k, dy: y * k }
}

/** Desplazo de un chip al soltar: el que tenía (`base`, desde su lugar calculado) más lo que se movió el puntero, acotado
 * al radio. Siempre se cuenta desde el lugar calculado, así que se puede arrastrar sin límite sin salir del área. */
export function desplazoTrasArrastre(base: Desplazo, inicio: Punto, ahora: Punto): Desplazo {
  return limitarDesplazo(base.dx + ahora.x - inicio.x, base.dy + ahora.y - inicio.y)
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

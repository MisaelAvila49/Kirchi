import { cajaDeSeleccion } from './cajaPieza'
import RBush from 'rbush'
import { ALCANCE_MAX_NODO } from './rutas'
import { documentoVacio, type Coleccion, type Documento, type Id, type Punto } from '../doc/tipos'
import { pinesEnMundo } from '../piezas/transformar'
import type { Caja, PiezaDef } from '../piezas/tipos'
import { anchoDeFigura, cajaFigura, distanciaAFigura } from '../lienzo/figuras'
import { ANCHO_CABLE, CAJA_DESCONOCIDA, cajaEtiqueta, cajaNota, desplazarCaja, MARGEN_CAJA } from '../lienzo/medidas'

export interface Item extends Caja {
  col: Coleccion
  id: Id
  /** Índice del tramo dentro del cable; 0 en las demás colecciones. */
  tramo: number
}

export interface ItemPin extends Caja {
  piezaId: Id
  pinId: string
  x: number
  y: number
}

export type Golpe =
  | { tipo: 'pin'; piezaId: Id; pinId: string; x: number; y: number }
  | { tipo: 'pieza'; id: Id }
  | { tipo: 'cable'; id: Id; tramo: number }
  | { tipo: 'etiqueta'; id: Id }
  | { tipo: 'nota'; id: Id }
  | { tipo: 'figura'; id: Id }
  /** La bandera de una sonda: la toma el editor antes que el índice (`Editor.sondaEn`). */
  | { tipo: 'sonda'; id: Id }

export function distanciaASegmento(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay
  const l2 = dx * dx + dy * dy
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

export class Indice {
  private arbol = new RBush<Item>()
  private pines = new RBush<ItemPin>()
  private doc: Documento = documentoVacio()

  reconstruir(doc: Documento, lib: Map<string, PiezaDef>): void {
    this.doc = doc
    const items: Item[] = []
    const pines: ItemPin[] = []
    for (const p of Object.values(doc.piezas)) {
      const def = lib.get(p.tipo)
      const c = def ? cajaDeSeleccion(p, def, MARGEN_CAJA) : desplazarCaja(CAJA_DESCONOCIDA, p.x, p.y)
      items.push({ ...c, col: 'piezas', id: p.id, tramo: 0 })
      if (def) for (const pin of pinesEnMundo(p, def)) pines.push({ minX: pin.x, minY: pin.y, maxX: pin.x, maxY: pin.y, piezaId: p.id, pinId: pin.id, x: pin.x, y: pin.y })
    }
    const m = ANCHO_CABLE / 2
    for (const c of Object.values(doc.cables))
      for (let i = 1; i < c.puntos.length; i++) {
        const a = c.puntos[i - 1], b = c.puntos[i]
        items.push({ minX: Math.min(a.x, b.x) - m, minY: Math.min(a.y, b.y) - m, maxX: Math.max(a.x, b.x) + m, maxY: Math.max(a.y, b.y) + m, col: 'cables', id: c.id, tramo: i - 1 })
      }
    for (const e of Object.values(doc.etiquetas)) items.push({ ...cajaEtiqueta(e), col: 'etiquetas', id: e.id, tramo: 0 })
    for (const n of Object.values(doc.notas)) items.push({ ...cajaNota(n), col: 'notas', id: n.id, tramo: 0 })
    for (const f of Object.values(doc.figuras ?? {})) items.push({ ...cajaFigura(f), col: 'figuras', id: f.id, tramo: 0 })
    this.arbol.clear()
    this.arbol.load(items)
    this.pines.clear()
    this.pines.load(pines)
  }

  buscar(c: Caja): Item[] {
    return this.arbol.search(c)
  }

  pinesEn(x: number, y: number): ItemPin[] {
    return this.pines.search({ minX: x, minY: y, maxX: x, maxY: y }).filter((p) => p.x === x && p.y === y)
  }

  /** El pin más cercano a `p` a no más de `radio` (sin contar los que están en `excluir`); null si no hay. */
  pinMasCercano(p: Punto, radio: number, excluir?: Punto): ItemPin | null {
    let mejor: ItemPin | null = null, dMejor = Infinity
    for (const it of this.pines.search({ minX: p.x - radio, minY: p.y - radio, maxX: p.x + radio, maxY: p.y + radio })) {
      if (excluir && it.x === excluir.x && it.y === excluir.y) continue
      const d = Math.hypot(it.x - p.x, it.y - p.y)
      if (d <= radio && d < dMejor) {
        dMejor = d
        mejor = it
      }
    }
    return mejor
  }

  /** La etiqueta cuyo punto de conexión queda más cerca de `p` a no más de `radio` (sin la del punto `excluir`); null si no hay. */
  etiquetaMasCercana(p: Punto, radio: number, excluir?: Punto): { id: Id; x: number; y: number } | null {
    let mejor: { id: Id; x: number; y: number } | null = null, dMejor = Infinity
    for (const it of this.arbol.search({ minX: p.x - radio, minY: p.y - radio, maxX: p.x + radio, maxY: p.y + radio })) {
      if (it.col !== 'etiquetas') continue
      const e = this.doc.etiquetas[it.id]
      if (!e || (excluir && e.x === excluir.x && e.y === excluir.y)) continue
      const d = Math.hypot(e.x - p.x, e.y - p.y)
      if (d <= radio && d < dMejor) [mejor, dMejor] = [{ id: e.id, x: e.x, y: e.y }, d]
    }
    return mejor
  }

  /** El tramo de cable más cercano a `p` a no más de `radio`; null si no hay. */
  cableMasCercano(p: Punto, radio: number): { id: Id; tramo: number } | null {
    let mejor: Item | null = null, dMejor = Infinity
    for (const it of this.arbol.search({ minX: p.x - radio, minY: p.y - radio, maxX: p.x + radio, maxY: p.y + radio })) {
      if (it.col !== 'cables') continue
      const c = this.doc.cables[it.id]
      const a = c.puntos[it.tramo], b = c.puntos[it.tramo + 1]
      const d = distanciaASegmento(p.x, p.y, a.x, a.y, b.x, b.y)
      if (d <= radio && d < dMejor) {
        dMejor = d
        mejor = it
      }
    }
    return mejor ? { id: mejor.id, tramo: mejor.tramo } : null
  }

  golpe(p: Punto, tol: number): Golpe | null {
    const zona = { minX: p.x - tol, minY: p.y - tol, maxX: p.x + tol, maxY: p.y + tol }
    let pin: ItemPin | null = null, dPin = Infinity
    // Un pin se toma a media celda a lo más, aunque la tolerancia de pantalla (zoom bajo) sea mayor.
    const tolPin = Math.min(tol, ALCANCE_MAX_NODO)
    for (const it of this.pines.search(zona)) {
      const d = Math.hypot(it.x - p.x, it.y - p.y)
      if (d <= tolPin && d < dPin) {
        dPin = d
        pin = it
      }
    }
    if (pin) return { tipo: 'pin', piezaId: pin.piezaId, pinId: pin.pinId, x: pin.x, y: pin.y }

    let pieza: Item | null = null, area = Infinity
    let cable: Item | null = null, dCable = Infinity
    let etiqueta: Item | null = null, nota: Item | null = null
    let figura: Item | null = null, dFigura = Infinity
    for (const it of this.arbol.search(zona)) {
      if (it.col === 'cables') {
        const c = this.doc.cables[it.id]
        const a = c.puntos[it.tramo], b = c.puntos[it.tramo + 1]
        const d = distanciaASegmento(p.x, p.y, a.x, a.y, b.x, b.y)
        if (d <= tol && d < dCable) {
          dCable = d
          cable = it
        }
        continue
      }
      // Una figura se toma por su contorno (con medio grosor de más), nunca por dentro: un marco no tapa el lienzo.
      if (it.col === 'figuras') {
        const f = this.doc.figuras?.[it.id]
        const d = f ? distanciaAFigura(f, p) - anchoDeFigura(f) / 2 : Infinity
        if (d <= tol && d < dFigura) {
          dFigura = d
          figura = it
        }
        continue
      }
      if (p.x < it.minX - tol || p.x > it.maxX + tol || p.y < it.minY - tol || p.y > it.maxY + tol) continue
      if (it.col === 'piezas') {
        const s = (it.maxX - it.minX) * (it.maxY - it.minY)
        if (s < area) {
          area = s
          pieza = it
        }
      } else if (it.col === 'etiquetas') etiqueta ??= it
      else nota ??= it
    }
    if (pieza) return { tipo: 'pieza', id: pieza.id }
    if (cable) return { tipo: 'cable', id: cable.id, tramo: cable.tramo }
    if (etiqueta) return { tipo: 'etiqueta', id: etiqueta.id }
    if (nota) return { tipo: 'nota', id: nota.id }
    if (figura) return { tipo: 'figura', id: figura.id }
    return null
  }
}

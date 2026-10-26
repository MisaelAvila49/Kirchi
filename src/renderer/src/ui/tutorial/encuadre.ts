import type { Punto } from '../../doc/tipos'
import type { Caja } from '../../piezas/tipos'
import type { Rect } from './colocacion'

/** La zona del mundo (en pantalla) no cabe entera en el área visible del lienzo: hay que encuadrar para que se vea. */
export function zonaFueraDeVista(caja: Caja, aPantalla: (p: Punto) => Punto | null, area: Rect | null): boolean {
  const a = aPantalla({ x: caja.minX, y: caja.minY })
  const b = aPantalla({ x: caja.maxX, y: caja.maxY })
  if (!a || !b || !area) return false
  const x1 = Math.min(a.x, b.x), x2 = Math.max(a.x, b.x), y1 = Math.min(a.y, b.y), y2 = Math.max(a.y, b.y)
  return x1 < area.x || y1 < area.y || x2 > area.x + area.w || y2 > area.y + area.h
}

/**
 * Cuándo se encuadra la zona del capítulo: al empezar o retomar y en cada paso con objetivo del mundo fuera de la vista. Un objetivo de la interfaz no mueve la cámara.
 */
export function debeEncuadrar(anterior: string | null, capitulo: string, objetivoFuera: boolean): boolean {
  return anterior !== capitulo || objetivoFuera
}

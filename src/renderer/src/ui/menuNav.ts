import { normalizar } from '../buscador/buscar'
import type { EntradaMenu, ItemMenu } from './menus'

export const esItem = (e: EntradaMenu): e is ItemMenu => e.tipo === 'item'

/**
 * Siguiente ítem en la dirección `paso`, con vuelta. Los deshabilitados sí reciben el foco (WAI-ARIA) para que se lea su pista.
 */
export function siguiente(entradas: EntradaMenu[], actual: number, paso: 1 | -1): number {
  const n = entradas.length
  if (!entradas.some(esItem)) return -1
  // Sin foco (−1) y hacia atrás se empieza desde n, para caer en el último ítem y no en el penúltimo.
  let i = actual < 0 && paso < 0 ? n : actual
  do i = (((i + paso) % n) + n) % n
  while (!esItem(entradas[i]))
  return i
}

export const primero = (entradas: EntradaMenu[]): number => siguiente(entradas, -1, 1)
export const ultimo = (entradas: EntradaMenu[]): number => siguiente(entradas, 0, -1)

/** Primera letra: el siguiente ítem después de `actual` cuyo texto empieza con `letra` (sin acentos); −1 si ninguno. */
export function porLetra(entradas: EntradaMenu[], actual: number, letra: string): number {
  const l = normalizar(letra)
  if (!l) return -1
  const n = entradas.length
  for (let k = 1; k <= n; k++) {
    const i = (actual + k + n) % n
    const e = entradas[i]
    if (esItem(e) && normalizar(e.texto).startsWith(l)) return i
  }
  return -1
}

/**
 * Esquina de un submenú junto al ítem que lo abre: a la derecha o, si no cabe, a la izquierda, sin salir de la ventana.
 */
export function posicionSubmenu(item: { left: number; top: number; right: number }, ancho: number, alto: number, vw: number, vh: number, margen = 8): { left: number; top: number } {
  let left = item.right + 2
  if (left + ancho > vw - margen) left = item.left - 2 - ancho
  left = Math.max(margen, Math.min(left, vw - margen - ancho))
  // 5 px: el relleno del menú, para que el primer ítem quede a la altura del que lo abrió.
  const top = Math.max(margen, Math.min(item.top - 5, vh - margen - alto))
  return { left, top }
}

/**
 * Esquina de un menú que se abre en (x, y): abajo a la derecha o del otro lado si no cabe. `hueco` lo separa del punto para que un segundo clic derecho llegue al lienzo.
 */
export function posicionMenu(x: number, y: number, ancho: number, alto: number, vw: number, vh: number, margen = 8, hueco = 2): { left: number; top: number } {
  let left = x + hueco
  if (left + ancho > vw - margen) left = x - hueco - ancho
  let top = y + hueco
  if (top + alto > vh - margen) top = y - hueco - alto
  left = Math.max(margen, Math.min(left, vw - margen - ancho))
  top = Math.max(margen, Math.min(top, vh - margen - alto))
  return { left, top }
}

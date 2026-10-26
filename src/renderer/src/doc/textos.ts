import type { CualTexto, LugarTexto, Pieza, PosicionTexto } from './tipos'

/** Posición a mano de los textos de una pieza: uno de ocho lugares o, con Alt, el centro en unidades del símbolo. Aquí
 * solo lo que archivo y dibujo comparten (`lienzo/textosManuales.ts` dibuja). */

/** Los ocho lugares, en el sentido de las manecillas desde arriba. */
export const LUGARES_TEXTO: readonly LugarTexto[] = ['arriba', 'arriba-derecha', 'derecha', 'abajo-derecha', 'abajo', 'abajo-izquierda', 'izquierda', 'arriba-izquierda']
/** Hacia dónde queda cada lugar desde el cuerpo, en el símbolo sin girar. */
export const DIRECCION_LUGAR: Readonly<Record<LugarTexto, readonly [number, number]>> = {
  arriba: [0, -1], 'arriba-derecha': [1, -1], derecha: [1, 0], 'abajo-derecha': [1, 1], abajo: [0, 1], 'abajo-izquierda': [-1, 1], izquierda: [-1, 0], 'arriba-izquierda': [-1, -1]
}
/** Lo más lejos (en unidades del símbolo, por eje) que queda un texto movido libre: así no se pierde lejos de su pieza. */
export const LIMITE_TEXTO_LIBRE = 100
/** Los textos que se mueven. */
export const CUALES_TEXTO: readonly CualTexto[] = ['ref', 'valor']

const esLugar = (v: unknown): v is LugarTexto => typeof v === 'string' && Object.hasOwn(DIRECCION_LUGAR, v)
const coordenada = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= LIMITE_TEXTO_LIBRE

/** Una posición válida (un lugar conocido o coordenadas finitas dentro del tope, sin más llaves), o null. */
export function leerPosicion(v: unknown): PosicionTexto | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const o = v as Record<string, unknown>
  if (Object.hasOwn(o, 'lugar')) return esLugar(o.lugar) && Object.keys(o).length === 1 ? { lugar: o.lugar } : null
  return Object.hasOwn(o, 'x') && Object.hasOwn(o, 'y') && Object.keys(o).length === 2 && coordenada(o.x) && coordenada(o.y) ? { x: o.x, y: o.y } : null
}

/** La posición a mano del texto `cual` de la pieza, o null si va en su lugar automático (o lo guardado no vale). */
export function posicionManual(p: Pieza, cual: CualTexto): PosicionTexto | null {
  const t = p.textos
  if (!t || typeof t !== 'object' || !Object.hasOwn(t, cual)) return null
  return leerPosicion(t[cual])
}

/** La pieza tiene algún texto movido a mano. */
export const tieneTextosManuales = (p: Pieza): boolean => posicionManual(p, 'ref') !== null || posicionManual(p, 'valor') !== null

/** Textos de un `.kir`: solo `ref` y `valor` con posición válida, en un objeto nuevo (protege de `__proto__`).
 * `descartados` cuenta lo inválido (−1 si no es objeto). */
export function leerTextos(v: unknown): { textos: Partial<Record<CualTexto, PosicionTexto>> | null; descartados: number } {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { textos: null, descartados: -1 }
  const out: Partial<Record<CualTexto, PosicionTexto>> = {}
  let descartados = 0
  for (const k of Object.keys(v)) {
    const pos = (CUALES_TEXTO as readonly string[]).includes(k) ? leerPosicion((v as Record<string, unknown>)[k]) : null
    if (pos) out[k as CualTexto] = pos
    else descartados++
  }
  return { textos: Object.keys(out).length ? out : null, descartados }
}

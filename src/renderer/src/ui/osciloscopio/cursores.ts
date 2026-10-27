import { DIVISIONES_H, DIVISIONES_V, MATEMATICO, type AjustesOsciloscopio, type CanalOMatematico } from '../../instrumentos/ajustes'
import { formatearMedida } from '../../valores/valores'
import type { CursoresPantalla } from './dibujar'

/** Por flecha, una décima de división; con Shift, una división. */
export const PASO_CURSOR_DIV = 0.1
export type CualCursor = 't1' | 't2' | 'v1' | 'v2'

/** Los voltios por división de un canal (A − B usa los del canal A, como su traza). */
export const vdivDe = (a: AjustesOsciloscopio, c: CanalOMatematico): number => (c === MATEMATICO ? a.canales[0].vdiv : (a.canales.find((x) => x.canal === c)?.vdiv ?? 1))
/** La posición de un canal (A − B usa la de A, como su traza y su columna). */
const posDe = (a: AjustesOsciloscopio, c: CanalOMatematico): number => (c === MATEMATICO ? a.canales[0].pos : (a.canales.find((x) => x.canal === c)?.pos ?? 0))

/** Los cursores solo valen en el modo de pantalla en que se pusieron: de tiempo y voltaje en Y/T, de puntos de la curva en X-Y. */
export const cursoresDelModo = (c: CursoresPantalla | null | undefined, a: Pick<AjustesOsciloscopio, 'modoXY'> | null | undefined): CursoresPantalla | null => (c && !!c.xy === !!(a && a.modoXY && a.modoXY !== 'yt') ? c : null)

/** Al encender los cursores: tiempos a dos y ocho divisiones y voltajes a ±2 divisiones del canal. */
export function cursoresIniciales(a: AjustesOsciloscopio, t0: number, canal: CanalOMatematico): CursoresPantalla {
  const span = DIVISIONES_H * a.base
  const v = vdivDe(a, canal)
  return { canal, t: [t0 + 0.2 * span, t0 + 0.8 * span], v: [-2 * v, 2 * v] }
}

/** Δt, 1/Δt y ΔV en cuatro cifras, y los dos valores de cada cursor (null si ese par está apagado). */
export function lecturaCursores(c: CursoresPantalla): { dt: string | null; inv: string | null; dv: string | null; t1: string | null; t2: string | null; v1: string | null; v2: string | null } {
  const dt = c.t ? Math.abs(c.t[1] - c.t[0]) : null
  return {
    dt: dt === null ? null : formatearMedida(dt, 's', 4),
    inv: dt === null ? null : dt > 0 ? formatearMedida(1 / dt, 'Hz', 4) : 'sin dato',
    dv: c.v ? formatearMedida(Math.abs(c.v[1] - c.v[0]), 'V', 4) : null,
    t1: c.t ? formatearMedida(c.t[0], 's', 4) : null,
    t2: c.t ? formatearMedida(c.t[1], 's', 4) : null,
    v1: c.v ? formatearMedida(c.v[0], 'V', 4) : null,
    v2: c.v ? formatearMedida(c.v[1], 'V', 4) : null
  }
}

/** Con el teclado: el cursor `cual` una décima de división (`grande`: una división) hacia `dir`. */
export function moverCursor(c: CursoresPantalla, cual: CualCursor, dir: 1 | -1, grande: boolean, a: AjustesOsciloscopio): CursoresPantalla {
  const div = grande ? 1 : PASO_CURSOR_DIV
  if (cual[0] === 't' && c.t) return ponerCursor(c, cual, c.t[cual === 't1' ? 0 : 1] + dir * div * a.base)
  if (cual[0] === 'v' && c.v) return ponerCursor(c, cual, c.v[cual === 'v1' ? 0 : 1] + dir * div * vdivDe(a, c.canal))
  return c
}

export function ponerCursor(c: CursoresPantalla, cual: CualCursor, valor: number): CursoresPantalla {
  if (cual === 't1' && c.t) return { ...c, t: [valor, c.t[1]] }
  if (cual === 't2' && c.t) return { ...c, t: [c.t[0], valor] }
  if (cual === 'v1' && c.v) return { ...c, v: [valor, c.v[1]] }
  if (cual === 'v2' && c.v) return { ...c, v: [c.v[0], valor] }
  return c
}

/** El tiempo de la columna `x` (píxeles) de una pantalla de `W` que empieza en `t0`. */
export const tiempoDeX = (x: number, W: number, t0: number, a: AjustesOsciloscopio): number => t0 + (x / W) * DIVISIONES_H * a.base

/** El voltaje de la fila `y` (píxeles) de una pantalla de `H` en la escala del canal `c`. */
export const voltajeDeY = (y: number, H: number, a: AjustesOsciloscopio, c: CanalOMatematico): number => ((H / 2 - y) / (H / DIVISIONES_V) - posDe(a, c)) * vdivDe(a, c)

/** El cursor que queda a `radio` píxeles o menos de (x, y), o null. Primero los de tiempo. */
export function cursorCercano(c: CursoresPantalla, x: number, y: number, W: number, H: number, t0: number, a: AjustesOsciloscopio, radio: number): CualCursor | null {
  const span = DIVISIONES_H * a.base
  if (c.t)
    for (const [i, cual] of [[0, 't1'], [1, 't2']] as const) if (Math.abs(((c.t[i] - t0) / span) * W - x) <= radio) return cual
  if (c.v)
    for (const [i, cual] of [[0, 'v1'], [1, 'v2']] as const) {
      const yv = H / 2 - (c.v[i] / vdivDe(a, c.canal) + posDe(a, c.canal)) * (H / DIVISIONES_V)
      if (Math.abs(yv - y) <= radio) return cual
    }
  return null
}

/** El puntero sobre un cursor: el de tiempo se arrastra a los lados y el de voltaje, hacia arriba y abajo (como el potenciómetro). */
export const punteroDeCursor = (c: CualCursor | null): 'ew-resize' | 'ns-resize' | null => (c === null ? null : c[0] === 't' ? 'ew-resize' : 'ns-resize')

/**
 * Con el foco en la pantalla: izquierda y derecha mueven el cursor de tiempo activo, arriba y abajo el de voltaje (`activo`: 0 o 1). Null si no mueve nada.
 */
export function cursorDeTecla(tecla: string, activo: 0 | 1, c: CursoresPantalla): { cual: CualCursor; dir: 1 | -1 } | null {
  const t: CualCursor = activo === 0 ? 't1' : 't2'
  const v: CualCursor = activo === 0 ? 'v1' : 'v2'
  if (c.t && (tecla === 'ArrowLeft' || tecla === 'ArrowRight')) return { cual: t, dir: tecla === 'ArrowRight' ? 1 : -1 }
  if (c.v && (tecla === 'ArrowUp' || tecla === 'ArrowDown')) return { cual: v, dir: tecla === 'ArrowUp' ? 1 : -1 }
  return null
}

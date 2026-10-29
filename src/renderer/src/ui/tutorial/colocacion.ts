export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export type Lado = 'abajo' | 'arriba' | 'derecha' | 'izquierda' | 'centro'

export interface EntradaGlobo {
  /** Lo que se señala (ventana); null si el paso no tiene objetivo a la vista. */
  objetivo: Rect | null
  globo: { w: number; h: number }
  ventana: { w: number; h: number }
  /** Distancia mínima al borde de la ventana. */
  margen?: number
  /** Separación entre el globo y el objetivo (incluye la flecha). */
  hueco?: number
  /** El lado que se intenta primero (un paso que pide trabajar debajo o arriba del objetivo deja el globo al costado). */
  preferido?: Exclude<Lado, 'centro'>
  /** Zonas que el globo no debe tapar ni quedar bajo ellas (el editor de valores abierto): un lado que las toca se descarta. */
  evitar?: readonly Rect[]
}

export interface SalidaGlobo {
  x: number
  y: number
  lado: Lado
  /** Dónde cae la punta de la flecha, medida desde el borde del globo que mira al objetivo (a lo largo de ese borde). */
  flecha: number
}

const LADOS: readonly Exclude<Lado, 'centro'>[] = ['abajo', 'arriba', 'derecha', 'izquierda']
const MARGEN_FLECHA = 18

const acotar = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

/**
 * Dónde pone el globo junto al objetivo: debajo, si no cabe arriba, derecha o izquierda (o primero el lado del paso). Sin lugar o sin objetivo, abajo a la izquierda (`centro`). Función pura.
 */
export function colocarGlobo(e: EntradaGlobo): SalidaGlobo {
  const margen = e.margen ?? 12
  const hueco = e.hueco ?? 12
  const { w, h } = e.globo
  const { w: W, h: H } = e.ventana
  const libreX = (x: number) => acotar(x, margen, Math.max(margen, W - w - margen))
  const libreY = (y: number) => acotar(y, margen, Math.max(margen, H - h - margen))
  const o = e.objetivo
  const choca = (x: number, y: number) => (e.evitar ?? []).some((z) => x < z.x + z.w && x + w > z.x && y < z.y + z.h && y + h > z.y)
  if (o) {
    const orden = e.preferido ? [e.preferido, ...LADOS.filter((l) => l !== e.preferido)] : LADOS
    for (const lado of orden) {
      let x: number, y: number
      if (lado === 'abajo' || lado === 'arriba') {
        y = lado === 'abajo' ? o.y + o.h + hueco : o.y - hueco - h
        if (y < margen || y + h > H - margen) continue
        // El globo arranca alineado con el objetivo si cabe: la flecha apunta a su centro.
        x = libreX(Math.min(o.x, o.x + o.w / 2 - MARGEN_FLECHA))
        if (choca(x, y)) continue
        return { x, y, lado, flecha: acotar(o.x + o.w / 2 - x, MARGEN_FLECHA, w - MARGEN_FLECHA) }
      }
      x = lado === 'derecha' ? o.x + o.w + hueco : o.x - hueco - w
      if (x < margen || x + w > W - margen) continue
      y = libreY(o.y + o.h / 2 - h / 2)
      if (choca(x, y)) continue
      return { x, y, lado, flecha: acotar(o.y + o.h / 2 - y, MARGEN_FLECHA, h - MARGEN_FLECHA) }
    }
  }
  // Sin lado libre: abajo a la izquierda y, si ahí también estorba, abajo a la derecha.
  const izq = { x: libreX(margen), y: libreY(H - h - margen) }
  const der = { x: libreX(W - w - margen), y: izq.y }
  const sitio = choca(izq.x, izq.y) && !choca(der.x, der.y) ? der : izq
  return { ...sitio, lado: 'centro', flecha: 0 }
}

/** El rectángulo de foco: el del objetivo con `aire` alrededor, acotado a la ventana. */
export function rectDeFoco(r: Rect, aire: number, ventana: { w: number; h: number }): Rect {
  const x = Math.max(0, r.x - aire)
  const y = Math.max(0, r.y - aire)
  const x2 = Math.min(ventana.w, r.x + r.w + aire)
  const y2 = Math.min(ventana.h, r.y + r.h + aire)
  return { x, y, w: Math.max(0, x2 - x), h: Math.max(0, y2 - y) }
}

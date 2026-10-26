import type { Conexiones } from '../conexiones/conexiones'
import { MM_POR_UNIDAD, type Documento, type Id, type Sonda } from '../doc/tipos'
import type { PiezaDef } from '../piezas/tipos'
import { pinesEnMundo } from '../piezas/transformar'
import type { Lectura } from '../sim/lectura'
import { lecturaDeMedidor } from '../sim/medidor'
import { formatearSI } from '../valores/valores'

/** Etiquetas de lectura del esquema exportado: qué hay bajo un clic de la vista previa (red por pin o extremo, o tramo de
 * cable) y qué dice la lectura ahí. Las cifras son las del medidor rápido (`lecturaDeMedidor`). Unidades de rejilla salvo
 * mm. */
export interface ObjetivoLectura {
  /** `red` es un nodo (un pin o el extremo de un cable): se lee su voltaje. `cable` es un punto dentro de un tramo: voltaje o corriente. */
  clase: 'red' | 'cable'
  x: number
  y: number
  cable: Id | null
  /** Clave «pieza:pin». */
  pin: string | null
}

export const TEXTO_SIN_LECTURA = 'sin lectura'
export const TEXTO_SIN_CORRIENTE = 'Simula para medir corriente'

/** Dónde cae el punto más cercano de un segmento y a qué distancia. */
function cercano(px: number, py: number, x1: number, y1: number, x2: number, y2: number): { x: number; y: number; d: number } {
  const dx = x2 - x1
  const dy = y2 - y1
  const l2 = dx * dx + dy * dy
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l2))
  const x = x1 + t * dx
  const y = y1 + t * dy
  return { x, y, d: Math.hypot(px - x, py - y) }
}

/** Lo medible bajo (x, y) a menos de `tol` unidades: pin o extremo valen como red (solo voltaje), el interior de un tramo
 * como cable. Con `corriente` solo el interior de un tramo, redondeado a la rejilla fina (donde el motor lleva la
 * corriente). */
export function objetivoLectura(doc: Documento, lib: Map<string, PiezaDef>, x: number, y: number, tol: number, magnitud: 'voltaje' | 'corriente' = 'voltaje'): ObjetivoLectura | null {
  if (magnitud === 'voltaje') {
    let mejor: ObjetivoLectura | null = null
    let dMejor = tol
    for (const p of Object.values(doc.piezas)) {
      const def = lib.get(p.tipo)
      if (!def) continue
      for (const pin of pinesEnMundo(p, def)) {
        const d = Math.hypot(pin.x - x, pin.y - y)
        if (d <= dMejor) {
          dMejor = d
          mejor = { clase: 'red', x: pin.x, y: pin.y, cable: null, pin: `${p.id}:${pin.id}` }
        }
      }
    }
    if (mejor) return mejor
    for (const c of Object.values(doc.cables)) {
      for (const q of [c.puntos[0], c.puntos[c.puntos.length - 1]]) {
        if (!q) continue
        const d = Math.hypot(q.x - x, q.y - y)
        if (d <= dMejor) {
          dMejor = d
          mejor = { clase: 'red', x: q.x, y: q.y, cable: c.id, pin: null }
        }
      }
    }
    if (mejor) return mejor
  }
  let mejor: ObjetivoLectura | null = null
  let dMejor = tol
  for (const c of Object.values(doc.cables)) {
    for (let i = 1; i < c.puntos.length; i++) {
      const a = c.puntos[i - 1]
      const b = c.puntos[i]
      const q = cercano(x, y, a.x, a.y, b.x, b.y)
      if (q.d > dMejor) continue
      let sx = q.x
      let sy = q.y
      if (magnitud === 'corriente') {
        sx = Math.round(sx)
        sy = Math.round(sy)
        // Dentro del tramo, no en sus puntas: ahí la corriente no está definida.
        const horizontal = a.y === b.y
        const lo = horizontal ? Math.min(a.x, b.x) : Math.min(a.y, b.y)
        const hi = horizontal ? Math.max(a.x, b.x) : Math.max(a.y, b.y)
        if (hi - lo < 2) continue
        if (horizontal) sx = Math.max(lo + 1, Math.min(hi - 1, sx))
        else sy = Math.max(lo + 1, Math.min(hi - 1, sy))
      }
      dMejor = q.d
      mejor = { clase: 'cable', x: sx, y: sy, cable: c.id, pin: null }
    }
  }
  return mejor
}

export interface PuntoLeido {
  /** mm del mundo. */
  x: number
  y: number
  magnitud: 'voltaje' | 'corriente'
  cable: string | null
  pin: string | null
}

/** El texto de una etiqueta de lectura con la lectura de la vista previa de ahora («3.333 V», «−1.2 mA»); «sin lectura» si no corre o el punto no mide nada. */
export function textoDeLectura(con: Conexiones, l: Lectura | null | undefined, n: PuntoLeido): string {
  if (!l) return n.magnitud === 'corriente' ? TEXTO_SIN_CORRIENTE : TEXTO_SIN_LECTURA
  if (n.magnitud === 'corriente' && !l.corrientes) return TEXTO_SIN_CORRIENTE
  const red = n.pin ? con.redDePin.get(n.pin) : n.cable ? con.redDeCable.get(n.cable) : undefined
  const s: Sonda = { id: 'lectura-esquema', tipo: 'medidor', x: Math.round(n.x / MM_POR_UNIDAD), y: Math.round(n.y / MM_POR_UNIDAD), magnitud: n.magnitud, modo: 'dc' }
  const redes = new Map(con.redDeSonda)
  if (red !== undefined) redes.set(s.id, red)
  const r = lecturaDeMedidor(s, { ...con, redDeSonda: redes }, l)
  return r.estado === 'ok' ? formatearSI(r.valor, r.unidad, 4) : TEXTO_SIN_LECTURA
}

/** Lo que se dice bajo la cifra: «punto de operación» (la vista previa detenida) o el instante de la vista previa («t = 1.23 ms»). */
export function notaDeLectura(l: Lectura | null | undefined, enOperacion: boolean): string | undefined {
  if (!l) return undefined
  return enOperacion ? 'punto de operación' : `t = ${formatearSI(l.t, 's', 3)}`
}

/** Etiquetas de lectura con la lectura congelada al pedir el archivo: el diálogo se cierra antes de armar la lámina y la
 * vista previa sigue (y pierde las corrientes), así que no se puede leer en vivo. */
export function contextoDeLecturaFija(con: Conexiones, l: Lectura | null | undefined, enOperacion: boolean): { texto(n: PuntoLeido): string; nota(n: PuntoLeido): string | undefined } {
  return { texto: (n) => textoDeLectura(con, l, n), nota: () => notaDeLectura(l, enOperacion) }
}

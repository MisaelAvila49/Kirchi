import type { Pieza } from '../doc/tipos'
import { cajaTexto } from '../lienzo/apartar'
import { rotulosDePieza } from '../lienzo/etiquetas'
import { cajaEnMundo, cajaTransformada } from '../piezas/transformar'
import type { Caja, PiezaDef } from '../piezas/tipos'

const dibujos = new WeakMap<PiezaDef, Caja>()

/** Caja de los puntos que dibuja el símbolo, sin sus rótulos (la `caja` de la definición los incluye en su peor caso). */
function cajaDelDibujo(def: PiezaDef): Caja {
  const hecha = dibujos.get(def)
  if (hecha) return hecha
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const ver = (pts: ArrayLike<number>) => {
    for (let i = 0; i + 1 < pts.length; i += 2) {
      minX = Math.min(minX, pts[i])
      maxX = Math.max(maxX, pts[i])
      minY = Math.min(minY, pts[i + 1])
      maxY = Math.max(maxY, pts[i + 1])
    }
  }
  for (const t of def.geometria.trazos) ver(t)
  ver(def.geometria.rellenos)
  const c = minX <= maxX ? { minX, minY, maxX, maxY } : def.geometria.caja
  dibujos.set(def, c)
  return c
}

/** Zona que se toca para seleccionar una pieza, con `margen`. El terminal de alimentación se ciñe a lo visible, no al peor
 * caso de rótulos en ocho orientaciones. */
export function cajaDeSeleccion(p: Pieza, def: PiezaDef, margen = 0): Caja {
  if (def.modelo?.tipo !== 'alimentacion' || !def.rotulos?.length) return cajaEnMundo(p, def, margen)
  let c = cajaTransformada(cajaDelDibujo(def), p, margen)
  for (const t of rotulosDePieza(p, def)) {
    const b = cajaTexto(t, margen)
    c = { minX: Math.min(c.minX, b.minX), minY: Math.min(c.minY, b.minY), maxX: Math.max(c.maxX, b.maxX), maxY: Math.max(c.maxY, b.maxY) }
  }
  return c
}

/** Cuerpo de la pieza para el minimapa: lo que dibuja su símbolo con su giro, sin los rótulos que la caja de la definición
 * reserva (con ella los bloques se encimaban). */
export const cajaDeCuerpo = (p: Pieza, def: PiezaDef): Caja => cajaTransformada(cajaDelDibujo(def), p, 0)

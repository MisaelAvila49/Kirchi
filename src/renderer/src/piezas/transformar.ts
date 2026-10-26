import type { Pieza, Rotacion } from '../doc/tipos'
import type { Caja, PiezaDef } from './tipos'

const fin = (a: number, b: number): [number, number] => [a + 0, b + 0]

/** Refleja en x (si espejo) y luego gira en sentido horario de pantalla. Suma 0 para no devolver -0. */
export function transformar(px: number, py: number, rot: Rotacion, espejo: boolean): [number, number] {
  const x = espejo ? -px : px
  switch (rot) {
    case 0:
      return fin(x, py)
    case 90:
      return fin(-py, x)
    case 180:
      return fin(-x, -py)
    default:
      return fin(py, -x)
  }
}

/** Lo contrario de `transformar`: el punto del símbolo que, reflejado y girado, cae en (tx, ty). */
export function destransformar(tx: number, ty: number, rot: Rotacion, espejo: boolean): [number, number] {
  const [x, y] = rot === 0 ? [tx, ty] : rot === 90 ? [ty, -tx] : rot === 180 ? [-tx, -ty] : [-ty, tx]
  return fin(espejo ? -x : x, y)
}

export function pinesEnMundo(p: Pieza, def: PiezaDef): { id: string; x: number; y: number }[] {
  return def.pines.map((pin) => {
    const [x, y] = transformar(pin.x, pin.y, p.rot, p.espejo)
    return { id: pin.id, x: p.x + x, y: p.y + y }
  })
}

export function girar(rot: Rotacion, sentido: 1 | -1): Rotacion {
  return ((((rot + sentido * 90) % 360) + 360) % 360) as Rotacion
}

/** Caja del símbolo ya girada, reflejada y desplazada a la posición de la pieza, ampliada `margen` por lado. */
export function cajaEnMundo(p: Pieza, def: PiezaDef, margen = 0): Caja {
  return cajaTransformada(def.geometria.caja, p, margen)
}

/** Una caja en coordenadas del símbolo llevada al mundo con la orientación y posición de la pieza. */
export function cajaTransformada(c: Caja, p: Pieza, margen = 0): Caja {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  // Las cuatro esquinas en el orden de siempre, sin arreglos intermedios: la escena la pide miles de veces cada vez que se arma.
  const esquina = (x: number, y: number) => {
    const [tx, ty] = transformar(x, y, p.rot, p.espejo)
    if (tx < minX) minX = tx
    if (tx > maxX) maxX = tx
    if (ty < minY) minY = ty
    if (ty > maxY) maxY = ty
  }
  esquina(c.minX, c.minY)
  esquina(c.maxX, c.minY)
  esquina(c.minX, c.maxY)
  esquina(c.maxX, c.maxY)
  return { minX: p.x + minX - margen, minY: p.y + minY - margen, maxX: p.x + maxX + margen, maxY: p.y + maxY + margen }
}

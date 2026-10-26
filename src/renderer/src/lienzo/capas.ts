import type { Pieza } from '../doc/tipos'
import { capasDeAnimacion, type Geometria, type PiezaDef } from '../piezas/tipos'
import { leerPosicion } from '../valores/valores'

/** Capas de un símbolo según el documento. Lo que depende de una propiedad (posición del potenciómetro) se dibuja igual al
 * editar, simular y exportar; lo que depende de la simulación (rotor, armadura del relé) lo dibuja la capa de movimiento
 * y fuera de ella queda en reposo. */

/** Cuánto se corre en x la flecha del potenciómetro (unidades del símbolo): 0 al 50 %, `desde` al 0 % y `hasta` al 100 %. */
export function desplazamientoCursor(def: PiezaDef, p: Pieza): number {
  const a = def.animacion
  if (a?.tipo !== 'cursor') return 0
  const texto = p.props[a.prop] ?? def.props.find((d) => d.id === a.prop)?.defecto ?? ''
  const x = leerPosicion(texto) ?? 0.5
  return (x - 0.5) * (a.hasta - a.desde)
}

/** Polilínea de la capa del cursor con lo que está bajo `codo` corrido `dx`: lo de arriba no se mueve y donde la línea
 * cruza el codo se agrega un tramo horizontal. Con `dx` 0 es la misma polilínea. */
export function trazoConCodo(pts: readonly number[], codo: number, dx: number): number[] {
  if (dx === 0) return [...pts]
  const out: number[] = []
  const poner = (x: number, y: number, corrido: boolean) => out.push(corrido ? x + dx : x, y)
  for (let i = 0; i + 1 < pts.length; i += 2) {
    const x = pts[i], y = pts[i + 1]
    if (i === 0) {
      poner(x, y, y > codo)
      continue
    }
    const xa = pts[i - 2], ya = pts[i - 1]
    if ((ya < codo && y > codo) || (ya > codo && y < codo)) {
      // Cruza el codo: el punto del cruce, de un lado y del otro.
      const xc = xa + ((codo - ya) / (y - ya)) * (x - xa)
      poner(xc, codo, ya > codo)
      poner(xc, codo, y > codo)
    } else if (ya === codo && y > codo) poner(xa, ya, true)
    else if (ya > codo && y === codo) poner(x, y, true)
    poner(x, y, y > codo)
  }
  return out
}

/** Los triángulos de la capa del cursor: cada vértice debajo del codo, corrido. */
export function rellenosConCodo(tri: readonly number[], codo: number, dx: number): number[] {
  if (dx === 0) return [...tri]
  const out = [...tri]
  for (let i = 0; i + 1 < out.length; i += 2) if (out[i + 1] > codo) out[i] += dx
  return out
}

/** Las capas que se dibujan en la escena: las de reposo fuera de la vista previa, y al simular solo el cursor. */
export function capasDeEscena(def: PiezaDef, simulando: boolean): readonly string[] {
  const a = def.animacion
  const pide = capasDeAnimacion(a)
  if (a?.tipo === 'cursor') return pide
  if (simulando) return []
  return a?.tipo === 'contacto' ? pide.slice(0, 1) : pide
}

/** Llave de la geometría de la pieza en la escena (corrimiento del cursor y si se omiten las capas que se mueven), o null
 * si es la de siempre (`def.geometria`, ya con capas en reposo) y vale la orientación guardada por tipo. */
export function claveDeEscena(def: PiezaDef, p: Pieza, simulando: boolean): string | null {
  const g = def.geometria
  if (!g.fija || !g.capas) return null
  const dx = desplazamientoCursor(def, p)
  const movibles = def.animacion?.tipo === 'giro' || def.animacion?.tipo === 'contacto'
  if (dx === 0 && !(simulando && movibles)) return null
  return `${dx}|${simulando && movibles ? 1 : 0}`
}

/** La geometría de la pieza en la escena, sin orientar: la parte fija del símbolo y sus capas según el documento. */
export function geometriaDeEscena(def: PiezaDef, p: Pieza, simulando: boolean): Geometria {
  const g = def.geometria
  if (!g.fija || !g.capas) return g
  const dx = desplazamientoCursor(def, p)
  const trazos = [...g.fija.trazos]
  const rellenos = [...g.fija.rellenos]
  for (const nombre of capasDeEscena(def, simulando)) {
    const c = g.capas[nombre]
    if (!c) continue
    const codo = def.animacion?.tipo === 'cursor' ? def.animacion.codo : 0
    for (const t of c.trazos) trazos.push(dx ? trazoConCodo(t, codo, dx) : t)
    for (const v of dx ? rellenosConCodo(c.rellenos, codo, dx) : c.rellenos) rellenos.push(v)
  }
  return { trazos, rellenos, caja: g.caja }
}

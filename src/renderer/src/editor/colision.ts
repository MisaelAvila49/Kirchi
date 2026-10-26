import type { Documento, Id, Pieza, Punto } from '../doc/tipos'
import { CAJA_DESCONOCIDA, desplazarCaja } from '../lienzo/medidas'
import { cajaTransformada } from '../piezas/transformar'
import type { Caja, PiezaDef } from '../piezas/tipos'
import type { Indice } from './indice'
import { PASO_REJILLA } from './rutas'

/** Aire que cada cuerpo exige, en unidades (1 = 1.25 mm). Dos cuerpos ampliados no pueden cruzarse, así que quedan a 2
 * unidades (2.5 mm) o más. */
export const SEPARACION = 1
/** Intentos de pegar o duplicar desplazando un paso en diagonal antes de rendirse. */
export const INTENTOS_LUGAR = 20
// Coordenadas de SVG con decimales (0.7 + 0.7 + …): una arista que apenas toca no cuenta como cruce.
const EPS = 1e-6

const cuerpos = new WeakMap<PiezaDef, Caja>()

/** Caja del cuerpo sin patas: todos los puntos de trazos y rellenos menos los que caen sobre un pin, para que dos piezas
 * unidas pin con pin no choquen por sus patas. Sin puntos fuera de pines, la caja completa. */
export function cuerpoLocal(def: PiezaDef): Caja {
  const hecha = cuerpos.get(def)
  if (hecha) return hecha
  const esPin = (x: number, y: number) => def.pines.some((p) => Math.abs(p.x - x) < EPS && Math.abs(p.y - y) < EPS)
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const sumar = (pts: ArrayLike<number>) => {
    for (let i = 0; i + 1 < pts.length; i += 2) {
      const x = pts[i], y = pts[i + 1]
      if (esPin(x, y)) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  for (const t of def.geometria.trazos) sumar(t)
  sumar(def.geometria.rellenos)
  const c = minX <= maxX ? { minX, minY, maxX, maxY } : def.geometria.caja
  cuerpos.set(def, c)
  return c
}

export function cuerpoEnMundo(p: Pieza, def: PiezaDef | undefined, margen = 0): Caja {
  if (!def) {
    const c = desplazarCaja(CAJA_DESCONOCIDA, p.x, p.y)
    return { minX: c.minX - margen, minY: c.minY - margen, maxX: c.maxX + margen, maxY: c.maxY + margen }
  }
  return cajaTransformada(cuerpoLocal(def), p, margen)
}

const cruzan = (a: Caja, b: Caja) => a.minX < b.maxX - EPS && b.minX < a.maxX - EPS && a.minY < b.maxY - EPS && b.minY < a.maxY - EPS

/** Primera pieza cuyo cuerpo ampliado `SEPARACION` por lado cruza el de `candidata`; null si está libre. Ignora la
 * candidata y `ignorar`.
 * Con `indice` usa el árbol espacial (su caja de pieza contiene al cuerpo, así que no pierde choques). */
export function colisiona(doc: Documento, lib: Map<string, PiezaDef>, candidata: Pieza, ignorar?: Set<Id>, indice?: Indice): Id | null {
  const zona = cuerpoEnMundo(candidata, lib.get(candidata.tipo), 2 * SEPARACION)
  const prueba = (otra: Pieza | undefined): boolean =>
    !!otra && otra.id !== candidata.id && !ignorar?.has(otra.id) && cruzan(zona, cuerpoEnMundo(otra, lib.get(otra.tipo)))
  if (indice) {
    for (const it of indice.buscar(zona)) if (it.col === 'piezas' && prueba(doc.piezas[it.id])) return it.id
    return null
  }
  for (const otra of Object.values(doc.piezas)) if (prueba(otra)) return otra.id
  return null
}

/** Primer choque de un grupo que se mueve junto (sus piezas no chocan entre sí: van en `ignorar` o aún no están en el documento). */
export function choqueDeGrupo(doc: Documento, lib: Map<string, PiezaDef>, piezas: Iterable<Pieza>, ignorar: Set<Id>, indice?: Indice): { pieza: Id; con: Id } | null {
  for (const p of piezas) {
    const con = colisiona(doc, lib, p, ignorar, indice)
    if (con) return { pieza: p.id, con }
  }
  return null
}

/** Lugar para pegar `piezas`: `en` si está libre; si no, avanza un paso en diagonal hasta `INTENTOS_LUGAR` veces y
 * devuelve el último intento. */
export function lugarLibre(doc: Documento, lib: Map<string, PiezaDef>, piezas: Pieza[], en: Punto, indice?: Indice): { en: Punto; libre: boolean } {
  const vacio = new Set<Id>()
  let q = en
  for (let k = 0; ; k++) {
    q = { x: en.x + k * PASO_REJILLA, y: en.y + k * PASO_REJILLA }
    // Ids prestados: las piezas pegadas aún no existen y no deben confundirse con una del documento.
    const movidas = piezas.map((p, i) => ({ ...p, id: `\0pegar${i}`, x: p.x + q.x, y: p.y + q.y }))
    if (!choqueDeGrupo(doc, lib, movidas, vacio, indice)) return { en: q, libre: true }
    if (k === INTENTOS_LUGAR) return { en: q, libre: false }
  }
}

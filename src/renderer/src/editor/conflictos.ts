import { calcularConexiones, type Conexiones } from '../conexiones/conexiones'
import type { Cable, Documento, Id, Pieza, Punto } from '../doc/tipos'
import type { Caja, PiezaDef } from '../piezas/tipos'
import { choqueDeGrupo, cuerpoEnMundo, INTENTOS_LUGAR } from './colision'
import { PASO_REJILLA } from './rutas'
import type { Indice } from './indice'

/** Invariante del esquema: ningún tramo de cable atraviesa el cuerpo de una pieza (tocar el borde o llegar a un pin no
 * cuenta) ni corre encimado sobre un cable de otra red. */

const EPS = 1e-6

/** El tramo a→b (horizontal o vertical) entra al interior estricto de la caja. */
export function tramoCruzaCaja(a: Punto, b: Punto, c: Caja): boolean {
  const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y)
  if (y0 === y1) return y0 > c.minY + EPS && y0 < c.maxY - EPS && x0 < c.maxX - EPS && x1 > c.minX + EPS
  if (x0 === x1) return x0 > c.minX + EPS && x0 < c.maxX - EPS && y0 < c.maxY - EPS && y1 > c.minY + EPS
  // Un tramo diagonal (no lo produce el editor) cuenta por su caja.
  return x0 < c.maxX - EPS && x1 > c.minX + EPS && y0 < c.maxY - EPS && y1 > c.minY + EPS
}

/** Primera pieza (fuera de `ignorar`) cuyo cuerpo atraviesa la polilínea; con `indice` solo mira las piezas cercanas. */
export function piezaCruzada(doc: Documento, lib: Map<string, PiezaDef>, puntos: Punto[], indice?: Indice, ignorar?: Set<Id>): Id | null {
  for (let i = 1; i < puntos.length; i++) {
    const a = puntos[i - 1], b = puntos[i]
    const zona = { minX: Math.min(a.x, b.x), minY: Math.min(a.y, b.y), maxX: Math.max(a.x, b.x), maxY: Math.max(a.y, b.y) }
    const candidatas = indice ? indice.buscar(zona).filter((it) => it.col === 'piezas').map((it) => doc.piezas[it.id]) : Object.values(doc.piezas)
    for (const p of candidatas) if (p && !ignorar?.has(p.id) && tramoCruzaCaja(a, b, cuerpoEnMundo(p, lib.get(p.tipo)))) return p.id
  }
  return null
}

/** Largo en común de dos tramos colineales (0 si no lo son o solo se tocan en un punto). */
export function solape(a: Punto, b: Punto, c: Punto, d: Punto): number {
  if (a.y === b.y && c.y === d.y && a.y === c.y && a.x !== b.x && c.x !== d.x)
    return Math.max(0, Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) - Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)))
  if (a.x === b.x && c.x === d.x && a.x === c.x && a.y !== b.y && c.y !== d.y)
    return Math.max(0, Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) - Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)))
  return 0
}

/** Primer cable (fuera de `ignorar`) con un tramo encimado sobre la polilínea. */
export function cableEncimado(doc: Documento, puntos: Punto[], ignorar: (id: Id) => boolean, indice?: Indice): Id | null {
  for (let i = 1; i < puntos.length; i++) {
    const a = puntos[i - 1], b = puntos[i]
    const zona = { minX: Math.min(a.x, b.x), minY: Math.min(a.y, b.y), maxX: Math.max(a.x, b.x), maxY: Math.max(a.y, b.y) }
    if (indice) {
      for (const it of indice.buscar(zona)) {
        if (it.col !== 'cables' || ignorar(it.id)) continue
        const c = doc.cables[it.id]
        if (c && c.puntos[it.tramo + 1] && solape(a, b, c.puntos[it.tramo], c.puntos[it.tramo + 1]) > EPS) return c.id
      }
      continue
    }
    for (const c of Object.values(doc.cables)) {
      if (ignorar(c.id)) continue
      for (let j = 1; j < c.puntos.length; j++) if (solape(a, b, c.puntos[j - 1], c.puntos[j]) > EPS) return c.id
    }
  }
  return null
}

/** Lo que rompe el invariante entre los elementos `tocados` y el resto, con el cambio ya aplicado. Las redes se calculan
 * sobre `doc` si no se dan. */
export function conflictoDeTocados(
  doc: Documento,
  lib: Map<string, PiezaDef>,
  tocados: { piezas?: Iterable<Id>; cables?: Iterable<Id> },
  con?: Conexiones
): { con: Id; col: 'piezas' | 'cables' } | null {
  for (const id of tocados.piezas ?? []) {
    const p = doc.piezas[id]
    if (!p) continue
    const cuerpo = cuerpoEnMundo(p, lib.get(p.tipo))
    for (const c of Object.values(doc.cables))
      for (let i = 1; i < c.puntos.length; i++) if (tramoCruzaCaja(c.puntos[i - 1], c.puntos[i], cuerpo)) return { con: c.id, col: 'cables' }
  }
  let redes: Conexiones | undefined = con
  for (const id of tocados.cables ?? []) {
    const c = doc.cables[id]
    if (!c) continue
    const p = piezaCruzada(doc, lib, c.puntos)
    if (p) return { con: p, col: 'piezas' }
    redes ??= calcularConexiones(doc, lib)
    const mia = redes.redDeCable.get(id)
    const otro = cableEncimado(doc, c.puntos, (o) => o === id || redes!.redDeCable.get(o) === mia)
    if (otro) return { con: otro, col: 'cables' }
  }
  return null
}

/** Primer cable (con `indice`, solo los cercanos; fuera de `ignorar`) que entra al cuerpo de `p`. */
export function cableEnCuerpo(doc: Documento, lib: Map<string, PiezaDef>, p: Pieza, indice?: Indice, ignorar?: (id: Id) => boolean): Id | null {
  const cuerpo = cuerpoEnMundo(p, lib.get(p.tipo))
  const ids = indice ? new Set(indice.buscar(cuerpo).filter((it) => it.col === 'cables').map((it) => it.id)) : Object.keys(doc.cables)
  for (const id of ids) {
    const c = doc.cables[id]
    if (!c || ignorar?.(id)) continue
    for (let i = 1; i < c.puntos.length; i++) if (tramoCruzaCaja(c.puntos[i - 1], c.puntos[i], cuerpo)) return id
  }
  return null
}

/** Lugar para pegar un fragmento: como `lugarLibre`, avanza en diagonal hasta 20 veces, contando también cables (ni los
 * del documento cruzan lo pegado ni al revés).
 * `soloPiezas`: en el último intento solo importan las piezas encimadas. */
export function lugarParaPegar(
  doc: Documento,
  lib: Map<string, PiezaDef>,
  piezas: Pieza[],
  cables: Cable[],
  en: Punto,
  indice?: Indice,
  /** 0 revisa solo `en` (la plantilla que sigue al ratón no se corre sola). */
  intentos = INTENTOS_LUGAR
): { en: Punto; libre: boolean; soloPiezas: boolean } {
  const vacio = new Set<Id>()
  for (let k = 0; ; k++) {
    const q = { x: en.x + k * PASO_REJILLA, y: en.y + k * PASO_REJILLA }
    const movidas = piezas.map((p, i) => ({ ...p, id: `pegar:${i}`, x: p.x + q.x, y: p.y + q.y }))
    const conCables =
      movidas.some((p) => cableEnCuerpo(doc, lib, p, indice)) ||
      cables.some((c) => {
        const pts = c.puntos.map((pt) => ({ x: pt.x + q.x, y: pt.y + q.y }))
        return piezaCruzada(doc, lib, pts, indice) !== null || cableEncimado(doc, pts, () => false, indice) !== null
      })
    const conPiezas = !!choqueDeGrupo(doc, lib, movidas, vacio, indice)
    if (!conCables && !conPiezas) return { en: q, libre: true, soloPiezas: false }
    if (k >= intentos) return { en: q, libre: false, soloPiezas: !conCables }
  }
}

/** Todas las violaciones del invariante en el documento, como texto (para pruebas y diagnóstico). */
export function violaciones(doc: Documento, lib: Map<string, PiezaDef>): string[] {
  const out: string[] = []
  const cuerpos = Object.values(doc.piezas).map((p) => ({ p, c: cuerpoEnMundo(p, lib.get(p.tipo)) }))
  const cables = Object.values(doc.cables)
  for (const k of cables)
    for (let i = 1; i < k.puntos.length; i++)
      for (const { p, c } of cuerpos)
        if (tramoCruzaCaja(k.puntos[i - 1], k.puntos[i], c)) out.push(`el cable ${k.id} (tramo ${i - 1}: ${JSON.stringify([k.puntos[i - 1], k.puntos[i]])}) atraviesa ${p.ref} (${p.id})`)
  const con = calcularConexiones(doc, lib)
  for (let u = 0; u < cables.length; u++)
    for (let v = u + 1; v < cables.length; v++) {
      const a = cables[u], b = cables[v]
      if (con.redDeCable.get(a.id) === con.redDeCable.get(b.id)) continue
      for (let i = 1; i < a.puntos.length; i++)
        for (let j = 1; j < b.puntos.length; j++)
          if (solape(a.puntos[i - 1], a.puntos[i], b.puntos[j - 1], b.puntos[j]) > EPS) out.push(`los cables ${a.id} y ${b.id} de redes distintas corren encimados`)
    }
  return out
}

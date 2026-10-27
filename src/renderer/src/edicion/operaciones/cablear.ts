import { borrar, crear, juntar, type Comando } from '../../doc/comandos'
import type { Cable, Id, Punto } from '../../doc/tipos'
import { nuevoCable } from '../../editor/colocar'
import { iguales, juntarCables } from '../../editor/rutas'
import type { Orden } from '../ordenes'
import { rechazo, type Estado, type Plan, type Rechazo } from '../plan'
import { MOTIVO_FUERA_DE_REJILLA, puntoAUnidades } from '../unidades'

type Cablear = Extract<Orden, { orden: 'cablear' }>

/** El punto `p` está sobre algún tramo del cable (en un extremo o a mitad de un tramo recto). */
export function pasaPor(c: Cable, p: Punto): boolean {
  for (let i = 1; i < c.puntos.length; i++) {
    const a = c.puntos[i - 1], b = c.puntos[i]
    if (a.x === b.x && p.x === a.x && p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y)) return true
    if (a.y === b.y && p.y === a.y && p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x)) return true
  }
  return false
}

/** Único cable que termina justo en `p` sin pin, etiqueta ni otro cable ahí: el nuevo lo continúa. */
export function cableQueContinua(est: Estado, p: Punto, descartados: Set<Id>): Cable | null {
  const { doc, indice } = est
  if (indice.pinesEn(p.x, p.y).length) return null
  if (Object.values(doc.etiquetas).some((e) => e.x === p.x && e.y === p.y)) return null
  const ids = new Set(indice.buscar({ minX: p.x, minY: p.y, maxX: p.x, maxY: p.y }).filter((it) => it.col === 'cables').map((it) => it.id))
  let hallado: Cable | null = null
  for (const id of ids) {
    const c = doc.cables[id]
    if (!c || descartados.has(id) || c.puntos.length < 2) continue
    const toca = iguales(c.puntos[0], p) || iguales(c.puntos[c.puntos.length - 1], p)
    if (!toca) {
      if (pasaPor(c, p)) return null
      continue
    }
    if (hallado) return null
    hallado = c
  }
  return hallado
}

/** El cable que sale de soltar la ruta `puntos` (unidades): si continúa uno que termina en sus extremos, se funde con
 * él en el mismo paso. El núcleo parte las uniones en T y comprueba el invariante al ejecutar. */
export function cablearPuntos(est: Estado, puntos: Punto[]): Plan | Rechazo {
  if (puntos.length < 2) return rechazo('Un cable necesita al menos dos puntos.')
  const cmds: Comando[] = []
  const descartados = new Set<Id>()
  for (const extremo of [puntos[0], puntos[puntos.length - 1]]) {
    const otro = cableQueContinua(est, extremo, descartados)
    const unido = otro ? juntarCables(otro.puntos, puntos) : null
    if (otro && unido) {
      puntos = unido
      descartados.add(otro.id)
      cmds.push(borrar('cablear', 'cables', otro))
    }
  }
  if (puntos.length >= 2) cmds.push(crear('cablear', 'cables', nuevoCable(puntos, est.gen)))
  return { cmd: juntar('cablear', cmds), creados: {}, avisos: [], verbo: 'El cable no se trazó' }
}

/** Igual que soltar un cable: la ruta se da en mm sobre la rejilla de cableado. */
export function cablearOrden(est: Estado, o: Cablear): Plan | Rechazo {
  const puntos: Punto[] = []
  for (const p of o.puntos) {
    const q = puntoAUnidades(p)
    if (!q) return rechazo(MOTIVO_FUERA_DE_REJILLA)
    puntos.push(q)
  }
  return cablearPuntos(est, puntos)
}

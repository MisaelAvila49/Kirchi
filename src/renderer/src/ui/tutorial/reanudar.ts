import type { CapituloDef, CtxTutorial } from './tipos'

/** Lo que pasa al retomar un capítulo en un paso: el documento ya cumple lo anterior, o no y hay que elegir por dónde seguir. */
export type Reanudacion = { tipo: 'coincide'; paso: number } | { tipo: 'distinto'; paso: number }

/**
 * Primer paso anterior a `hasta` cuya condición no se cumple, o -1. Los pasos transitorios no se pueden leer del documento y se dan por hechos.
 */
export function primerPasoPendiente(cap: CapituloDef, ctx: CtxTutorial, hasta: number): number {
  const tope = Math.min(Math.max(0, hasta), cap.pasos.length)
  const limpio: CtxTutorial = { ...ctx, eventos: new Set() }
  for (let i = 0; i < tope; i++) {
    const p = cap.pasos[i]
    if (!p.transitorio && !(p.sigueVigente ?? p.hecho)(limpio)) return i
  }
  return -1
}

/**
 * Al retomar un capítulo en `desde`: si el documento cumple lo anterior sigue ahí (`coincide`); si no, reanuda en el primer paso no cumplido y ofrece el circuito del capítulo o el propio (`distinto`).
 */
export function reanudar(cap: CapituloDef, ctx: CtxTutorial, desde: number): Reanudacion {
  const paso = Math.min(Math.max(0, desde), Math.max(0, cap.pasos.length - 1))
  const pendiente = primerPasoPendiente(cap, ctx, paso)
  return pendiente === -1 ? { tipo: 'coincide', paso } : { tipo: 'distinto', paso: pendiente }
}

/** Lo que se elige en el diálogo de retomar un capítulo cuyo documento no coincide con lo que espera. */
export type EleccionReanudar = 'circuito-del-capitulo' | 'mi-circuito'

/**
 * Qué hace cada elección: con el circuito del capítulo se carga su arranque y se empieza en el paso 0; con el propio se sigue en el primer paso no cumplido.
 */
export function aplicarEleccion(e: EleccionReanudar, pendiente: number): { cargarArranque: boolean; paso: number } {
  return e === 'circuito-del-capitulo' ? { cargarArranque: true, paso: 0 } : { cargarArranque: false, paso: Math.max(0, pendiente) }
}

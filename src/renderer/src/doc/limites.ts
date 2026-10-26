import type { Comando } from './comandos'

/** Mundo que admite un `.kir`: coordenadas (rejilla fina) entre ±LIMITE_COORDENADA, unos 1.3 km por lado. Al leer se
 * descarta lo que sale;
 * el editor no deja salir nada (`Editor.ejecutar`), así que lo guardado siempre se reabre completo. */
export const LIMITE_COORDENADA = 2 ** 20

/** El motivo de un rechazo por el límite, para el Registro («No se pegó: …»). */
export const MOTIVO_FUERA_DEL_MUNDO = 'quedaría fuera del área de dibujo'

export const coordenadaValida = (...v: number[]): boolean => v.every((x) => Math.abs(x) <= LIMITE_COORDENADA)

/** Lo que el comando deja en el documento cabe en el mundo: posiciones de piezas, etiquetas y notas, puntos de cables y extremos de figuras. */
export function comandoDentroDelMundo(cmd: Comando): boolean {
  for (const c of cmd.cambios) {
    const d = c.despues as { x?: number; y?: number; x1?: number; y1?: number; x2?: number; y2?: number; puntos?: { x: number; y: number }[] } | undefined
    if (!d) continue
    if (typeof d.x === 'number' && typeof d.y === 'number' && !coordenadaValida(d.x, d.y)) return false
    if (Array.isArray(d.puntos) && d.puntos.some((q) => !coordenadaValida(q.x, q.y))) return false
    // Los dos extremos de una figura.
    if (typeof d.x1 === 'number' && !coordenadaValida(d.x1, d.y1 ?? 0, d.x2 ?? 0, d.y2 ?? 0)) return false
  }
  return true
}

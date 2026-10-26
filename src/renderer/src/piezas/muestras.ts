import type { PiezaDef } from './tipos'

/** Los colores de un LED o de un display que tienen muestra en la interfaz (`--led-*` en styles.css). */
const COLORES_LED = new Set(['rojo', 'verde', 'azul', 'amarillo', 'blanco'])

/** Muestra de color de cada opción de una propiedad de lista (`data-color` de `.muestra-color`): color de un LED o
 * display. undefined si la propiedad no es un color. */
export function muestrasDeOpciones(def: PiezaDef, propId: string): Record<string, string> | undefined {
  const t = def.modelo?.tipo
  const prop = def.props.find((d) => d.id === propId)
  if ((t !== 'D' && t !== 'display') || propId !== 'color' || !prop?.opciones) return undefined
  const r: Record<string, string> = {}
  for (const o of prop.opciones) if (COLORES_LED.has(o)) r[o] = `led-${o}`
  return r
}

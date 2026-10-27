import type { EnVivo, PropDef } from '../piezas/tipos'
import { formatearValor, leerValor } from './valores'

/** Un número sin ruido de coma flotante (6 cifras significativas bastan para °C, lx y N·m). */
const limpio = (n: number): number => Number(n.toPrecision(6))

/** Lo que dice el texto de una perilla: su valor dentro del rango, o el motivo para el campo. */
export function leerEnVivo(prop: Pick<PropDef, 'nombre' | 'unidad' | 'enVivo'>, texto: string): { valor: number } | { error: string } {
  const ev = prop.enVivo
  if (!ev) return { error: `${prop.nombre} no es una perilla.` }
  const unidad = prop.unidad ?? ''
  const v = leerValor(texto)
  if (!v) return { error: `«${texto.trim()}» no es un valor válido.` }
  if (v.unidad && v.unidad !== unidad) return { error: `Se esperaba un valor en ${unidad}.` }
  if (v.valor < ev.min || v.valor > ev.max) return { error: `${prop.nombre} va de ${formatearValor(ev.min, unidad)} a ${formatearValor(ev.max, unidad)}.` }
  return { valor: v.valor }
}

/** El texto que se guarda en la propiedad: «85 °C», «300 lx». */
export const textoEnVivo = (prop: Pick<PropDef, 'unidad'>, valor: number): string => `${limpio(valor)}${prop.unidad ? ` ${prop.unidad}` : ''}`

/** Muescas por década en escala logarítmica: con `escala: 'log'`, `paso` y `pasoFino` son cuántas muescas caben en una
 * década (10 muescas multiplican por 1.26), no una suma. */
const muescasPorDecada = (ev: EnVivo, fino: boolean): number => {
  const n = fino ? ev.pasoFino : ev.paso
  return n > 0 ? n : 10
}

/** Fracción 0 a 1 del recorrido que ocupa `valor` (en logarítmica, por décadas). */
export function fraccionEnVivo(ev: EnVivo, valor: number): number {
  const v = Math.min(ev.max, Math.max(ev.min, valor))
  if (ev.escala === 'log') return Math.log(v / ev.min) / Math.log(ev.max / ev.min)
  return (v - ev.min) / (ev.max - ev.min)
}

/** Valor que corresponde a una fracción 0 a 1 del recorrido. */
export function valorDeFraccion(ev: EnVivo, f: number): number {
  const g = Math.min(1, Math.max(0, f))
  return limpio(ev.escala === 'log' ? ev.min * (ev.max / ev.min) ** g : ev.min + g * (ev.max - ev.min))
}

/** Una muesca arriba (`dir` 1) o abajo (-1), con `fino` el paso fino; acotado al rango. */
export function pasoEnVivo(ev: EnVivo, valor: number, dir: 1 | -1, fino = false): number {
  const nuevo = ev.escala === 'log' ? valor * 10 ** (dir / muescasPorDecada(ev, fino)) : valor + dir * (fino ? ev.pasoFino : ev.paso)
  return limpio(Math.min(ev.max, Math.max(ev.min, nuevo)))
}

/** Lo que mueve la rueda o una tecla sobre la pieza: 5 % del rango por muesca (1 % en fino); en logarítmica, una muesca de la
 * escala. `pasos` positivo sube. */
export function pasosEnVivo(ev: EnVivo, valor: number, pasos: number, fino = false): number {
  if (ev.escala === 'log') {
    let v = valor
    for (let i = 0; i < Math.abs(pasos); i++) v = pasoEnVivo(ev, v, pasos > 0 ? 1 : -1, fino)
    return v
  }
  return limpio(Math.min(ev.max, Math.max(ev.min, valor + pasos * (fino ? 0.01 : 0.05) * (ev.max - ev.min))))
}

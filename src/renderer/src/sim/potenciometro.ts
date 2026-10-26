import type { Pieza, Punto } from '../doc/tipos'
import type { PiezaDef } from '../piezas/tipos'
import { pinesEnMundo } from '../piezas/transformar'
import { fraccionConLey } from '../valores/leyPot'
import { formatearValor, leerValor } from '../valores/valores'

/** Lo que mueve una muesca de la rueda (y una flecha del teclado), y con Shift, en puntos de porcentaje. */
export const PASO_POT = 5
export const PASO_POT_FINO = 1
/** Píxeles de deltaY que valen una muesca de la rueda; en modo línea, 33 por línea (3 líneas por muesca). */
const PX_POR_MUESCA = 100
const PX_POR_LINEA = PX_POR_MUESCA / 3

/** La posición del cursor se guarda como «25 %»: entero de 0 a 100. */
export function textoPosicion(v: number): string {
  const n = Number.isFinite(v) ? Math.round(v) : 0
  return `${Math.min(100, Math.max(0, n))} %`
}

/** Porcentaje de la propiedad «posición» de un potenciómetro; lo ilegible vale la mitad. */
export function posicionDeProp(texto: string | undefined): number {
  const m = texto === undefined ? null : /^(\d+(?:\.\d+)?)\s*%$/.exec(texto.trim())
  const v = m ? Number(m[1]) : NaN
  return v >= 0 && v <= 100 ? v : 50
}

/** Suma un evento de la rueda a lo acumulado y dice cuántas muescas completas hay (positivo: arriba, sube la posición) y
 * cuánto queda. Un panel táctil manda pedazos: se juntan hasta completar una muesca. Con Shift algunos sistemas mandan el
 * movimiento en deltaX. */
export function acumularRueda(resto: number, e: { deltaY: number; deltaX: number; deltaMode: number }): { pasos: number; resto: number } {
  const d = e.deltaY !== 0 ? e.deltaY : e.deltaX
  const px = e.deltaMode === 1 ? d * PX_POR_LINEA : e.deltaMode === 2 ? d * PX_POR_MUESCA * 10 : d
  const total = resto - px
  const pasos = Math.trunc(total / PX_POR_MUESCA + (total < 0 ? -1e-9 : 1e-9))
  return { pasos: pasos + 0, resto: total - pasos * PX_POR_MUESCA + 0 }
}

/** El eje del potenciómetro en el mundo: vector unitario del pin 1 al pin 2 y la distancia entre ellos. */
export function ejeDePotenciometro(p: Pieza, def: PiezaDef): { x: number; y: number; largo: number } {
  const pines = pinesEnMundo(p, def)
  const a = pines.find((q) => q.id === '1'), b = pines.find((q) => q.id === '2')
  if (!a || !b) return { x: 1, y: 0, largo: 8 }
  const dx = b.x - a.x, dy = b.y - a.y
  const largo = Math.hypot(dx, dy) || 8
  return { x: dx / largo + 0, y: dy / largo + 0, largo }
}

/** Posición (0 a 100, entera) tras arrastrar de `desde` a `hasta` sobre la pieza: recorrer su largo cubre todo el rango.
 * Solo cuenta el movimiento a lo largo del eje (horizontal a 0° y 180°, vertical a 90° y 270°) del pin 1 al 2 (el espejo
 * ya está en el eje). */
export function posicionDeArrastre(pos0: number, desde: Punto, hasta: Punto, eje: { x: number; y: number; largo: number }): number {
  const dx = hasta.x - desde.x, dy = hasta.y - desde.y
  const axial = dx * eje.x + dy * eje.y
  const v = Math.round(pos0 + (axial / eje.largo) * 100)
  return Math.min(100, Math.max(0, v)) + 0
}

/** Resistencia total (Ω) del potenciómetro según su propiedad de valor; null si no se puede leer. */
export function ohmsDelPot(p: Pieza, def: PiezaDef): number | null {
  const m = def.modelo
  if (m?.tipo !== 'pot') return null
  const texto = p.props[m.prop] ?? def.props.find((d) => d.id === m.prop)?.defecto ?? ''
  const v = leerValor(texto)
  return v && v.valor > 0 && (v.unidad === '' || v.unidad === 'Ω') ? v.valor : null
}

/** Lo que mide cada lado del cursor, para el inspector: «2.5 kΩ · 25 %» del pin 1 al cursor y «7.5 kΩ · 75 %» del cursor
 * al pin 2. El porcentaje es el de la posición guardada (entera). null si el valor total no se lee. */
export function ladosDelPot(totalOhms: number | null, posicion: number, ley?: string): { pin1: string; pin2: string } | null {
  if (totalOhms === null || !(totalOhms > 0)) return null
  const giro = Math.min(100, Math.max(0, Math.round(Number.isFinite(posicion) ? posicion : 0)))
  // Con una ley logarítmica el valor entre el pin 1 y el cursor no es el porcentaje del giro.
  const x = ley && ley !== 'lineal' ? Math.round(fraccionConLey(giro / 100, ley) * 100) : giro
  const lado = (pct: number) => `${formatearValor((totalOhms * pct) / 100, 'Ω')} · ${pct} %`
  return { pin1: lado(x), pin2: lado(100 - x) }
}

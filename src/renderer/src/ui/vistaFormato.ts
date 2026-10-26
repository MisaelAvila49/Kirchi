import { formatoCompleto, siguienteTam, type Alineacion, type Contorno, type FormatoCompleto, type ParcheFormato } from '../doc/formato'
import type { Documento, Fuente, Tinta } from '../doc/tipos'
import type { Seleccion } from '../editor/seleccion'
import type { Caja } from '../piezas/tipos'

/** Un valor que comparten todos los textos seleccionados, o «varios» si difiere. */
export type Mixto<T> = T | 'varios'

/** Lo que muestran los controles de formato (barra flotante, menú Formato e inspector) para la selección. */
export interface VistaFormato {
  notas: number
  etiquetas: number
  fuente: Mixto<Fuente>
  tam: Mixto<number>
  /** «mixto» si unos sí y otros no: el botón queda a medio activar. */
  negrita: boolean | 'mixto'
  cursiva: boolean | 'mixto'
  subrayado: boolean | 'mixto'
  tinta: Mixto<Tinta>
  contorno: Mixto<Contorno>
  /** Solo de las notas; null si no hay notas (las etiquetas no se alinean). */
  alinear: Mixto<Alineacion> | null
  /** El tamaño al que llevarían Ctrl+Shift+. y Ctrl+Shift+, a todos (null si cada uno iría a otro o no cambia). */
  tamMayor: number | null
  tamMenor: number | null
}

/** Ni piezas ni cables: la barra flotante de formato aparece solo así. */
export const soloTextos = (s: Seleccion): boolean => s.piezas.size === 0 && s.cables.size === 0 && s.figuras.size === 0 && s.notas.size + s.etiquetas.size > 0

function comun<T>(valores: T[]): Mixto<T> {
  return valores.every((v) => v === valores[0]) ? valores[0] : 'varios'
}
const bandera = (valores: boolean[]): boolean | 'mixto' => (valores.every(Boolean) ? true : valores.some(Boolean) ? 'mixto' : false)

/** El estado de cada control para las notas y etiquetas seleccionadas; null si no hay ninguna. */
export function vistaFormato(doc: Documento, sel: Seleccion): VistaFormato | null {
  const notas = [...sel.notas].map((id) => doc.notas[id]).filter(Boolean).map((n) => formatoCompleto(n.formato, 'nota'))
  const etiquetas = [...sel.etiquetas].map((id) => doc.etiquetas[id]).filter(Boolean).map((e) => formatoCompleto(e.formato, 'etiqueta'))
  const todos: FormatoCompleto[] = [...notas, ...etiquetas]
  if (todos.length === 0) return null
  const paso = (dir: 1 | -1) => {
    const v = comun(todos.map((f) => siguienteTam(f.tam, dir)))
    return v === 'varios' || todos.every((f) => f.tam === v) ? null : v
  }
  return {
    notas: notas.length,
    etiquetas: etiquetas.length,
    fuente: comun(todos.map((f) => f.fuente)),
    tam: comun(todos.map((f) => f.tam)),
    negrita: bandera(todos.map((f) => f.negrita)),
    cursiva: bandera(todos.map((f) => f.cursiva)),
    subrayado: bandera(todos.map((f) => f.subrayado)),
    tinta: comun(todos.map((f) => f.tinta)),
    contorno: comun(todos.map((f) => f.contorno)),
    alinear: notas.length ? comun(notas.map((f) => f.alinear)) : null,
    tamMayor: paso(1),
    tamMenor: paso(-1)
  }
}

/**
 * Esquina de la barra flotante para la caja `c` de lo seleccionado (px de ventana) dentro de `area`: centrada arriba si cabe, si no abajo, siempre dentro del área.
 */
export function posicionBarraFormato(c: Caja, ancho: number, alto: number, area: Caja, hueco = 8): { left: number; top: number; abajo: boolean } {
  const m = 4
  const left = Math.max(area.minX + m, Math.min((c.minX + c.maxX) / 2 - ancho / 2, area.maxX - m - ancho))
  const arriba = c.minY - hueco - alto
  if (arriba >= area.minY + m) return { left, top: Math.min(arriba, area.maxY - m - alto), abajo: false }
  const abajo = c.maxY + hueco
  // Siempre dentro del área: si el texto la rebasa por abajo o por arriba, la barra se pega al borde.
  return { left, top: Math.max(area.minY + m, Math.min(abajo, area.maxY - m - alto)), abajo: true }
}

/** La caja de lo seleccionado toca el área del lienzo (si no, la barra se esconde en vez de flotar sobre otra cosa). */
export const cajaTocaArea = (c: Caja, area: Caja): boolean => c.maxX >= area.minX && c.minX <= area.maxX && c.maxY >= area.minY && c.minY <= area.maxY

/** Una orden de los controles de formato: un parche, alternar negrita, cursiva o subrayado, o un paso de tamaño. */
export type OrdenFormato = { tipo: 'parche'; parche: ParcheFormato; control?: string } | { tipo: 'alternar'; prop: 'negrita' | 'cursiva' | 'subrayado' } | { tipo: 'paso'; dir: 1 | -1 }

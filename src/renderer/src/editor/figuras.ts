import { conCaja, normalizarCaja, porOrden } from '../doc/figuras'
import { LIMITE_COORDENADA } from '../doc/limites'
import { MM_POR_UNIDAD, type Figura, type Id, type Punto, type TipoFigura } from '../doc/tipos'

/** Edición de figuras, sin documento ni historial. Todo va en la rejilla fina: las figuras no se pegan a la de 2.5 mm de
 * las piezas. */

/** El punto entero de la rejilla fina más cercano (el `+ 0` quita el -0). */
export const fino = (p: Punto): Punto => ({ x: Math.round(p.x) + 0, y: Math.round(p.y) + 0 })

/** Un valor a centésimas de unidad (el `+ 0` quita el -0): la precisión de lo que se mueve libre con Alt. */
export const dosDecimales = (v: number): number => Math.round(v * 100) / 100 + 0

const TAN_22 = Math.tan(Math.PI / 8)

/** El extremo `b` llevado a la horizontal, la vertical o la diagonal exacta desde `a` (lo que esté más cerca del puntero). */
export function a45(a: Punto, b: Punto): Punto {
  const dx = b.x - a.x, dy = b.y - a.y
  const ax = Math.abs(dx), ay = Math.abs(dy)
  if (ay <= ax * TAN_22) return { x: b.x, y: a.y }
  if (ax <= ay * TAN_22) return { x: a.x, y: b.y }
  const l = Math.max(ax, ay)
  return { x: a.x + Math.sign(dx) * l, y: a.y + Math.sign(dy) * l }
}

/** La esquina `b` de un cuadrado desde `a`: manda el lado más largo y cada eje conserva su sentido (sin sentido, hacia +). */
export function cuadrar(a: Punto, b: Punto): Punto {
  const dx = b.x - a.x, dy = b.y - a.y
  const l = Math.max(Math.abs(dx), Math.abs(dy))
  return { x: a.x + (dx < 0 ? -l : l), y: a.y + (dy < 0 ? -l : l) }
}

/** Figura al arrastrar de `a` a `b` (rejilla fina). Con `restringir` (Shift): cuadrado o círculo en cajas, 45° en línea y
 * flecha. Sin id ni orden: los pone el editor al soltar. */
export function figuraDeArrastre(tipo: TipoFigura, a: Punto, b: Punto, restringir: boolean): Figura {
  const q = restringir ? (conCaja(tipo) ? cuadrar(a, b) : a45(a, b)) : b
  return normalizarCaja({ id: '', tipo, x1: a.x, y1: a.y, x2: q.x, y2: q.y, orden: 0 })
}

/** Asas: los dos extremos de la línea y la flecha, o las cuatro esquinas y los cuatro lados de la caja (rosa de los vientos). */
export type AsaFigura = 'p1' | 'p2' | 'no' | 'n' | 'ne' | 'e' | 'se' | 's' | 'so' | 'o'

export function asasDeFigura(f: Figura): { asa: AsaFigura; x: number; y: number }[] {
  if (!conCaja(f.tipo)) return [{ asa: 'p1', x: f.x1, y: f.y1 }, { asa: 'p2', x: f.x2, y: f.y2 }]
  const mx = (f.x1 + f.x2) / 2, my = (f.y1 + f.y2) / 2
  return [
    { asa: 'no', x: f.x1, y: f.y1 }, { asa: 'n', x: mx, y: f.y1 }, { asa: 'ne', x: f.x2, y: f.y1 }, { asa: 'e', x: f.x2, y: my },
    { asa: 'se', x: f.x2, y: f.y2 }, { asa: 's', x: mx, y: f.y2 }, { asa: 'so', x: f.x1, y: f.y2 }, { asa: 'o', x: f.x1, y: my }
  ]
}

/** Cursor de un asa: en diagonal, vertical u horizontal según los bordes que mueve; el extremo de una línea, de cruz. */
export function cursorDeAsaFigura(asa: AsaFigura): string {
  if (asa === 'p1' || asa === 'p2') return 'crosshair'
  if (asa === 'no' || asa === 'se') return 'nwse-resize'
  if (asa === 'ne' || asa === 'so') return 'nesw-resize'
  return asa === 'n' || asa === 's' ? 'ns-resize' : 'ew-resize'
}

/** La figura `f` con el asa llevada a `p`. En la caja, cada borde sigue al puntero sin cruzar el opuesto (queda al menos
 * una unidad); con `restringir` en una esquina se conserva la proporción.
 * En la línea, el extremo va al puntero (Shift: a 45°). null si caería sobre el otro. */
export function moverAsaFigura(f: Figura, asa: AsaFigura, p: Punto, restringir: boolean): Figura | null {
  if (asa === 'p1' || asa === 'p2') {
    const fijo = asa === 'p1' ? { x: f.x2, y: f.y2 } : { x: f.x1, y: f.y1 }
    const q = restringir ? a45(fijo, p) : p
    if (q.x === fijo.x && q.y === fijo.y) return null
    return asa === 'p1' ? { ...f, x1: q.x, y1: q.y } : { ...f, x2: q.x, y2: q.y }
  }
  const oeste = asa.endsWith('o'), este = asa.endsWith('e'), norte = asa.startsWith('n'), sur = asa.startsWith('s')
  let { x1, y1, x2, y2 } = f
  if (oeste) x1 = Math.min(p.x, x2 - 1)
  if (este) x2 = Math.max(p.x, x1 + 1)
  if (norte) y1 = Math.min(p.y, y2 - 1)
  if (sur) y2 = Math.max(p.y, y1 + 1)
  if (restringir && (oeste || este) && (norte || sur)) {
    const r = (f.x2 - f.x1) / (f.y2 - f.y1)
    let w = x2 - x1, h = y2 - y1
    // Manda el lado que menos creció (la caja no pasa del puntero en ningún eje); el otro se ajusta a la proporción.
    if (w / h > r) w = Math.max(1, Math.round(h * r))
    else h = Math.max(1, Math.round(w / r))
    if (oeste) x1 = x2 - w
    else x2 = x1 + w
    if (norte) y1 = y2 - h
    else y2 = y1 + h
  }
  return x1 === f.x1 && y1 === f.y1 && x2 === f.x2 && y2 === f.y2 ? f : { ...f, x1, y1, x2, y2 }
}

/** Lo más que mide una figura escrita a mano en el inspector: 2 m (más allá se dibuja arrastrando). */
export const MEDIDA_MAX = 1600

/** Una medida en mm del inspector (con o sin «mm», punto decimal), redondeada a la rejilla fina; o el error que se muestra. */
export function leerMedida(texto: string): { unidades: number } | { error: string } {
  const m = /^\s*(\d+(?:\.\d+)?|\.\d+)\s*(?:mm)?\s*$/i.exec(texto)
  if (!m) return { error: 'Escribe la medida en mm con punto decimal, como 20 o 12.5.' }
  const unidades = Math.round(Number(m[1]) / MM_POR_UNIDAD)
  if (unidades < 1) return { error: `La medida mínima es ${MM_POR_UNIDAD} mm.` }
  if (unidades > MEDIDA_MAX) return { error: `La medida máxima es ${MEDIDA_MAX * MM_POR_UNIDAD} mm.` }
  return { unidades }
}

/** La caja con otro ancho o alto (en unidades), con la esquina de arriba a la izquierda fija; la misma si no cambia. */
export function conMedida(f: Figura, medida: 'ancho' | 'alto', unidades: number): Figura {
  if (medida === 'ancho') return f.x2 - f.x1 === unidades ? f : { ...f, x2: f.x1 + unidades }
  return f.y2 - f.y1 === unidades ? f : { ...f, y2: f.y1 + unidades }
}

/** Las figuras de `ids` llevadas detrás de todas las demás figuras, en el orden que tenían entre ellas; [] si ya lo estaban. */
export function alFondo(todas: readonly Figura[], ids: ReadonlySet<Id>): Figura[] {
  const orden = [...todas].sort(porOrden)
  const elegidas = orden.filter((f) => ids.has(f.id))
  if (elegidas.length === 0 || orden.slice(0, elegidas.length).every((f) => ids.has(f.id))) return []
  const minimo = orden[0].orden
  if (minimo - elegidas.length >= -LIMITE_COORDENADA) return elegidas.map((f, i) => ({ ...f, orden: minimo - elegidas.length + i }))
  // Cerca del límite del archivo: todas renumeradas desde 0, las elegidas primero (solo las que cambian).
  const resto = orden.filter((f) => !ids.has(f.id))
  return [...elegidas, ...resto].flatMap((f, i) => (f.orden === i ? [] : [{ ...f, orden: i }]))
}

import type { PiezaDef } from '../piezas/tipos'
import type { ModeloAmpOp, ModeloLed } from './formulas'

/** Datos de los modelos de pieza que usan las calculadoras: Vf del LED sale de `is` y `n`, la saturación del amplificador
 * de `dhi` y `dlo`. Sin copiar cifras. */

export interface DatosLed extends ModeloLed {
  /** Corriente nominal del color (A). */
  inom: number
}

/** Los colores de LED de la librería, en el orden de su lista. */
export function coloresLed(lib: Map<string, PiezaDef>): string[] {
  return lib.get('led')?.props.find((p) => p.id === 'color')?.opciones ?? []
}

/** El modelo de diodo de un color de LED; null si la librería no trae el LED. */
export function modeloLed(lib: Map<string, PiezaDef>, color: string): DatosLed | null {
  const m = lib.get('led')?.modelo
  if (!m || m.tipo !== 'D') return null
  const propio = m.por?.valores[color]
  return { is: propio?.is ?? m.is, n: propio?.n ?? m.n, inom: propio?.inom ?? m.inom ?? 0.02 }
}

/** Los modelos de amplificador operacional de la librería, en el orden de su lista. */
export function modelosAmpOp(lib: Map<string, PiezaDef>): string[] {
  return lib.get('amp-op')?.props.find((p) => p.id === 'modelo')?.opciones ?? []
}

/** Caídas de la salida respecto de los rieles y producto ganancia-ancho de banda de un modelo de amplificador; null si no existe. */
export function modeloAmpOp(lib: Map<string, PiezaDef>, modelo: string): ModeloAmpOp | null {
  const m = lib.get('amp-op')?.modelo
  if (!m || m.tipo !== 'ampop') return null
  const p = m.modelos[modelo]
  if (!p) return null
  return { dhi: p.dhi ?? 0, dlo: p.dlo ?? 0, gbw: p.gbw ?? 1e6 }
}

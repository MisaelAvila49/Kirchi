import { patillasDeUnidad } from '../doc/paquetes'
import type { Pieza } from '../doc/tipos'
import { filaDe } from '../piezas/validarDatos'
import type { PiezaDef, Rotulo } from '../piezas/tipos'
import { rotuloDePieza, type Texto } from './etiquetas'

/** Alto de la letra de los números de patilla, en mm. */
export const TAM_NUMERO_PATILLA = 1.4

/** Con 1 mm la letra medía 3.8 px al 100 % y el mínimo general (6 px) la ocultaba hasta el 160 %: el botón no mostraba nada. */
export const MINIMO_PX_NUMERO_PATILLA = 4

const lista = (v: string | string[]): string => (Array.isArray(v) ? v.join(',') : v)

/** Pin → número físico de la unidad y la familia de la pieza (presentación de omisión de su fila de datos); null si no tiene presentación. */
export function numerosDePieza(p: Pieza, def: PiezaDef): Record<string, string> | null {
  const pres = filaDe(def, p.props)?.fila.presentaciones?.[0]
  if (!pres) return null
  const unidad = p.props.unidad
  const deUnidad = unidad ? patillasDeUnidad(def, p.props, unidad) : null
  if (deUnidad) return deUnidad
  // Sin unidad guardada, o pieza de una sola unidad: las patillas de la presentación (la primera unidad).
  return Object.fromEntries(Object.entries(pres.patillas).map(([pin, v]) => [pin, lista(v)]))
}

/** Los rótulos de la definición ya traen sus números de pin (el 555): dibujar otros los duplicaría. */
/** Solo los chips de Digitales e Integrados: una resistencia o un capacitor no se arman por número de patilla. */
const CATEGORIAS = new Set(['digitales', 'integrados'])

const yaRotulaNumeros = (def: PiezaDef): boolean => !!def.rotulos?.some((r) => r.tinta === 'valor' && /^\d+$/.test(r.texto))

/** Número de cada pin junto a su pie: encima del conductor si es horizontal, a un lado si es vertical, siempre del lado de afuera del cuerpo.
 * Cada texto sigue las reglas de los rótulos (gira con la pieza y se lee derecho). */
export function textosNumerosPatilla(p: Pieza, def: PiezaDef): Texto[] {
  if (!CATEGORIAS.has(def.categoria) || yaRotulaNumeros(def)) return []
  const numeros = numerosDePieza(p, def)
  if (!numeros) return []
  const pines = def.pines
  let cx = 0, cy = 0
  for (const q of pines) { cx += q.x; cy += q.y }
  cx /= pines.length || 1
  cy /= pines.length || 1
  const out: Texto[] = []
  for (const q of pines) {
    const texto = numeros[q.id]
    if (texto === undefined) continue
    const dx = q.x - cx, dy = q.y - cy
    const horizontal = Math.abs(dx) >= Math.abs(dy)
    const r: Rotulo = horizontal
      ? { texto, x: q.x - Math.sign(dx || 1), y: q.y - 0.9, tam: TAM_NUMERO_PATILLA, alinear: 'centro', fuente: 'mono', tinta: 'valor' }
      : { texto, x: q.x + 0.6, y: q.y - Math.sign(dy || 1) * 0.9, tam: TAM_NUMERO_PATILLA, alinear: 'izq', fuente: 'mono', tinta: 'valor' }
    out.push({ ...rotuloDePieza(p, def, r), minimoPx: MINIMO_PX_NUMERO_PATILLA })
  }
  return out
}

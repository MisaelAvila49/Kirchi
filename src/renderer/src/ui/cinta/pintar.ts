import type { Tono } from '../colores'
import { DECISIONES } from './decisiones'
import { PLANOS, TONO_ICONO, type Capa, type Papel, type Plano, type TonoIcono } from './planos'
import type { NombreIcono } from './trazos'

/** Dónde va un icono: los tamaños de `BotonCinta` y las pestañas de la franja de instrumentos. */
export type UsoIcono = 'grande' | 'chico' | 'solo-icono' | 'principal' | 'secundaria' | 'franja'

/** «plano»: el dibujo a varios colores de R1; «linea»: el trazo de siempre en el color de su orden (R3); «trazo»: en el color del texto. */
export type Variante = 'plano' | 'linea' | 'trazo'

export interface Pintura {
  variante: Variante
  /** Las capas del plano (completas o de 14 px); null en línea y en trazo, que dibujan el trazo de `trazos.ts`. */
  capas: readonly Capa[] | null
  /** El color de la orden y el segundo color (data-h y data-h2 del SVG); sin ellos, el icono va en el color del texto. */
  h?: Tono
  h2?: Tono
}

const PLANO = PLANOS as Partial<Record<NombreIcono, Plano>>
const TONO = TONO_ICONO as Partial<Record<NombreIcono, TonoIcono>>
const TRAZO: Pintura = { variante: 'trazo', capas: null }

/** Qué variante y qué capas dibuja un icono según dónde va. */
export function pinturaDe(nombre: NombreIcono, uso: UsoIcono, chicos: 'plano' | 'linea' = DECISIONES.iconosChicos): Pintura {
  const tono = TONO[nombre]
  // Simular de la fila de arriba es el botón relleno con el color de selección: su icono sigue en el color del texto.
  if (uso === 'principal' || !tono) return TRAZO
  const [h, h2] = typeof tono === 'string' ? [tono, tono] : tono
  const pequeño = uso === 'chico' || uso === 'secundaria' || uso === 'franja'
  const plano = PLANO[nombre]
  if (!plano || (pequeño && chicos === 'linea')) return { variante: 'linea', capas: null, h, h2 }
  return { variante: 'plano', capas: pequeño ? (plano.chico ?? plano.capas) : plano.capas, h, h2 }
}

/** Cada papel como variable: `colores.css` reparte --h, --h-tenue, --h-borde y --h2 según data-h y data-h2. */
export const PAPEL_CSS: Readonly<Record<Papel, string>> = {
  h: 'var(--h)',
  h2: 'var(--h2)',
  tenue: 'var(--h-tenue)',
  borde: 'var(--h-borde)',
  contra: 'var(--ic-contra)',
  gris: 'var(--ic-gris)'
}

/** El estilo de una capa: su relleno y su trazo con variables, y el grosor del trazo. */
export function estiloCapa(c: Capa): Record<string, string> {
  const e: Record<string, string> = { fill: c.relleno ? PAPEL_CSS[c.relleno] : 'none', stroke: c.trazo ? PAPEL_CSS[c.trazo] : 'none' }
  if (c.trazo && c.grosor !== undefined) e['stroke-width'] = String(c.grosor)
  return e
}

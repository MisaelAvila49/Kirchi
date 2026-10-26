/** Puente con ngspice: la interfaz manda una `PeticionAnalisis` (datos estructurados) y recibe vectores, nunca una línea de órdenes, un mazo de texto ni una ruta. */
import type { PeticionAnalisis } from './spice/mazo'
import type { TablaVuelta } from './spice/exportar'

export { type PeticionAnalisis, type AnalisisSpice, type OpcionesSolver } from './spice/mazo'

export const CANALES_NGSPICE = {
  ejecutar: 'ngspice:ejecutar',
  cancelar: 'ngspice:cancelar'
} as const

/** Qué es un vector del resultado, según la tabla de vuelta del exportador. */
export type ReferenciaVector =
  | { tipo: 'nodo'; nodo: number }
  /** La corriente de un elemento de la netlist (`indice`). */
  | { tipo: 'elemento'; indice: number }
  | { tipo: 'sonda'; indice: number }
  | { tipo: 'digital'; red: number }
  | { tipo: 'escala' }
  | { tipo: 'otro' }

export interface VectorResultado {
  /** El nombre en ngspice (`v(n3)`, `time`). */
  nombre: string
  /** El tipo que da ngspice (`voltage`, `current`, `time`, `frequency`). */
  unidad: string
  referencia: ReferenciaVector
  re: Float64Array
  im: Float64Array | null
}

export interface GraficoResultado {
  nombre: string
  complejo: boolean
  puntos: number
  vectores: VectorResultado[]
}

export type ResultadoAnalisis =
  | { ok: true; graficos: GraficoResultado[]; avisos: string[]; duracionMs: number }
  | { ok: false; error: string; cancelado?: true; tiempoAgotado?: true }

export interface ApiNgspice {
  /** Corre un análisis (uno a la vez por ventana; los demás esperan en una cola corta). */
  ejecutar(peticion: PeticionAnalisis): Promise<ResultadoAnalisis>
  /** Cancela el análisis en curso de esta ventana y los que esperan. */
  cancelar(): Promise<void>
}

/** Qué es un vector del `raw` según su nombre en ngspice y la tabla de vuelta. */
export function clasificarVector(nombre: string, tabla: TablaVuelta, escala: boolean): ReferenciaVector {
  if (escala) return { tipo: 'escala' }
  // En un barrido de CD ngspice llama `i(corr1)` a lo que en otros análisis es `corr1`.
  const n = nombre.toLowerCase().replace(/^i\((corr\d+|sonda\d+)\)$/, '$1')
  let m = /^v\((n\d+)\)$/.exec(n)
  if (m) {
    const nodo = tabla.nodos.get(m[1])
    return nodo ? { tipo: 'nodo', nodo: nodo.nodo } : { tipo: 'otro' }
  }
  m = /^(?:i\()?([a-z]+\d+[a-z]?)(?:#branch|\))?$/.exec(n)
  if (m && (n.endsWith('#branch') || n.startsWith('i('))) {
    const el = tabla.elementos.get(m[1])
    return el ? { tipo: 'elemento', indice: el.indice } : { tipo: 'otro' }
  }
  m = /^corr(\d+)$/.exec(n)
  if (m) return { tipo: 'elemento', indice: Number(m[1]) }
  m = /^sonda(\d+)$/.exec(n)
  if (m) return { tipo: 'sonda', indice: Number(m[1]) }
  m = /^(d\d+)$/.exec(n)
  if (m && tabla.digitales.has(m[1])) return { tipo: 'digital', red: tabla.digitales.get(m[1])! }
  return { tipo: 'otro' }
}

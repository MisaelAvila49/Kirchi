import type { Conexiones } from '../conexiones/conexiones'
import type { Comando } from '../doc/comandos'
import type { GeneradorId } from '../doc/ids'
import type { Documento } from '../doc/tipos'
import type { Indice } from '../editor/indice'
import type { PiezaDef } from '../piezas/tipos'

/** Lo que una operación necesita leer del núcleo. */
export interface Estado {
  readonly doc: Documento
  readonly lib: Map<string, PiezaDef>
  readonly con: Conexiones
  readonly indice: Indice
  readonly gen: GeneradorId
}

/** El cambio que una operación propone, antes de pasar por `NucleoEdicion.ejecutar`. */
export interface Plan {
  cmd: Comando
  /** Referencia de lo creado a su id. */
  creados: Record<string, string>
  avisos: string[]
  /** Encabezado del rechazo si el núcleo no admite el cambio («No se colocó R3»); sin él, el motivo va solo. */
  verbo?: string
  via?: 'cable' | 'etiquetas'
  /** Los extremos ya estaban en la misma red: no hay nada que ejecutar. */
  yaUnidas?: true
}

export interface Rechazo {
  motivo: string
  /** Posición (desde 0) de la orden de un lote que se rechazó. */
  indice?: number
}

export const rechazo = (motivo: string, indice?: number): Rechazo => (indice === undefined ? { motivo } : { motivo, indice })
export const esRechazo = (r: Plan | Rechazo): r is Rechazo => 'motivo' in r

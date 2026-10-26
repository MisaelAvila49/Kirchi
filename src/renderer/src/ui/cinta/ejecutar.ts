import type { IdComando } from './comandos'
import { razonDeshabilitado, type EstadoCinta, type Teclas } from './estado'

/** Qué hace cada comando; `ancla` es el control desde donde se pidió (un menú se abre debajo de él). */
export type Acciones = Readonly<Record<IdComando, (ancla: HTMLElement) => void>>

export interface OpcionesEjecutor {
  acciones: Acciones
  /** El estado de este instante (no el de la última vez que se dibujó la cinta). */
  estado(): EstadoCinta
  tecla: Teclas
  /** Dice la razón por la región viva cuando el comando no actúa. */
  avisar(texto: string): void
}

/**
 * Ejecuta un comando. Si está deshabilitado dice por qué (un botón `aria-disabled` sigue recibiendo clics para que el lector lea la razón). Devuelve si actuó.
 */
export function crearEjecutor(o: OpcionesEjecutor): (id: IdComando, ancla: HTMLElement) => boolean {
  return (id, ancla) => {
    const razon = razonDeshabilitado(id, o.estado(), o.tecla)
    if (razon) {
      o.avisar(razon)
      return false
    }
    o.acciones[id](ancla)
    return true
  }
}

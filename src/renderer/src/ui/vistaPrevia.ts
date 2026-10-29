import type { Id, Documento } from '../doc/tipos'
import type { Seleccion } from '../editor/seleccion'
import type { PiezaDef } from '../piezas/tipos'
import { accionDeClic, type FaseSim } from '../sim/control'

/** Lo que dice la barra superior de lo que cambia piezas y cables: los valores (resistencias, fuentes, potenciómetros, instrumentos) sí cambian corriendo. */
export const MENSAJE_DETENER_PARA_EDITAR = 'Detén la vista previa para modificar piezas y cables. Los valores sí se ajustan mientras corre.'
/** El modo que dice la barra de estado: «Edición» con la vista previa detenida, «En pausa» en pausa y «Simulando» si corre o arranca. */
export const textoModo = (f: FaseSim): string => (f === 'detenida' ? 'Edición' : f === 'pausada' ? 'En pausa' : 'Simulando')

/** El inspector lee del motor mientras arranca o corre; en pausa y detenida no hay nada nuevo que leer. */
export const leeCadaCiclo = (f: FaseSim): boolean => f === 'arrancando' || f === 'corriendo'

/**
 * La lectura cuadro a cuadro tras un cambio en caliente sigue también en pausa: allí no corre la lectura de 10 Hz y el worker da un paso corto que alguien debe leer.
 */
export const leeTrasCambio = (f: FaseSim): boolean => f !== 'detenida'

/**
 * Cuadros seguidos que se leen del motor tras un cambio en caliente. El worker lo toma en ≤12 ms y la lectura de 10 Hz tardaría hasta 100 ms.
 */
export const CUADROS_TRAS_CAMBIO = 12

/** Cuenta los cuadros que faltan por leer tras un cambio en caliente. */
export class LecturaPorCuadro {
  restantes = 0
  /** Un cambio en caliente: reinicia la cuenta; true si hay que arrancar el ciclo de cuadros (no estaba corriendo). */
  pedir(): boolean {
    const arrancar = this.restantes === 0
    this.restantes = CUADROS_TRAS_CAMBIO
    return arrancar
  }
  /** Un cuadro: true si en él se lee y el ciclo sigue; con la vista previa inactiva se acaba. */
  cuadro(activa: boolean): boolean {
    if (!activa || this.restantes <= 0) {
      this.restantes = 0
      return false
    }
    this.restantes--
    return true
  }
}

/**
 * Qué se anuncia a los lectores al cambiar de fase, una vez por cambio (arrancar y recargar tras accionar un interruptor no cuentan). `estable` es la última fase estable y se devuelve la nueva.
 */
export function anuncioDeFase(estable: FaseSim, nueva: FaseSim): { texto: string | null; estable: FaseSim } {
  if (nueva === 'arrancando' || nueva === estable) return { texto: null, estable }
  const texto = nueva === 'detenida' ? 'Vista previa detenida.' : nueva === 'pausada' ? 'Vista previa en pausa.' : estable === 'pausada' ? 'Vista previa reanudada.' : 'Vista previa en marcha.'
  return { texto, estable: nueva }
}

export type AccionSim = { id: Id; tipo: 'conmutar' | 'sostener' | 'reponer' }

/** El interruptor, botón o fusible que es lo único seleccionado: Enter o Espacio lo accionan durante la vista previa. */
export function accionableSeleccionado(doc: Documento, lib: Map<string, PiezaDef>, sel: Seleccion): AccionSim | null {
  if (sel.piezas.size !== 1 || sel.cables.size + sel.etiquetas.size + sel.notas.size + sel.figuras.size > 0) return null
  const [id] = sel.piezas
  const p = Object.hasOwn(doc.piezas, id) ? doc.piezas[id] : undefined
  const tipo = p ? accionDeClic(lib.get(p.tipo)) : null
  return tipo ? { id, tipo } : null
}

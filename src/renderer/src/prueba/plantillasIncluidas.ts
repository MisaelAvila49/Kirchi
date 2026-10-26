import type { Documento } from '../doc/tipos'
import { armar, type DefCircuito, type Parte } from '../plantillas/armar'
import { conTextosFijos } from '../plantillas/textosFijos'
import type { PiezaDef } from '../piezas/tipos'

/** Plantillas que trae Kirchi, armadas con código: piezas con posición y conexiones pin a pin que enruta el A* del editor.
 * `npm test` regenera `componentes/plantillas/` con `KIRCHI_PLANTILLAS=1` y comprueba que el disco coincida. Sin
 * etiquetas de red: pegarla dos veces uniría por nombre las redes de las copias. */

export type { Parte }

export interface DefPlantilla extends DefCircuito {
  id: string
  nombre: string
  descripcion: string
}

export { DEFINICIONES } from './definicionesPlantillas'

/** Arma el documento de una definición con el enrutador del editor, con los textos fijos donde se ven. Lanza si falta una pieza o un pin. */
export const construir = (def: DefPlantilla, lib: Map<string, PiezaDef>): Documento => conTextosFijos(armar(def, lib, def.id), lib)

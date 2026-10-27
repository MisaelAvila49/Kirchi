import { borrar, juntar, type Comando } from '../../doc/comandos'
import { borrarSeleccion } from '../../editor/acciones'
import { todo } from '../../editor/seleccion'
import { rechazo, type Estado, type Plan, type Rechazo } from '../plan'

export const MOTIVO_YA_VACIO = 'El circuito ya está vacío.'

/** Borra todo el circuito en un paso: lo dibujado (con sus sondas), los análisis guardados y los voltajes de los rieles. */
export function vaciarOrden(est: Estado): Plan | Rechazo {
  const { doc } = est
  const partes: Comando[] = [borrarSeleccion(doc, todo(doc))]
  for (const a of Object.values(doc.analisis ?? {})) partes.push(borrar('vaciar el circuito', 'analisis', a))
  for (const a of Object.values(doc.alimentaciones ?? {})) partes.push(borrar('vaciar el circuito', 'alimentaciones', a))
  const cmd = juntar('vaciar el circuito', partes)
  if (cmd.cambios.length === 0) return rechazo(MOTIVO_YA_VACIO)
  return { cmd, creados: {}, avisos: [] }
}

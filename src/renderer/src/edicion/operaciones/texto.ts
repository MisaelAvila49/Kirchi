import { crear, juntar, type Comando } from '../../doc/comandos'
import { limpiarTexto } from '../../doc/limpiar'
import type { Etiqueta, Nota, Punto } from '../../doc/tipos'
import { nuevaEtiqueta, nuevaNota, nuevoCable } from '../../editor/colocar'
import { planDeEtiqueta } from '../../editor/etiquetaEnTramo'
import type { Estado } from '../plan'

/** La etiqueta de red `nombre` en `en`. Sobre un cable va en un tramo corto perpendicular para no encimarse con él; tramo
 * y etiqueta son un solo paso. `normalizar` pide partir las uniones que el tramo deje. */
export function etiquetaEn(est: Estado, en: Punto, nombre: string): { cmd: Comando; etiqueta: Etiqueta; normalizar: boolean } | { motivo: string } {
  if (!limpiarTexto(nombre).trim()) return { motivo: 'Escribe el nombre de la red.' }
  const plan = planDeEtiqueta(est.doc, est.lib, en, limpiarTexto(nombre).trim())
  const etiqueta = { ...nuevaEtiqueta(limpiarTexto(nombre), plan.etiqueta, est.gen), rot: plan.etiqueta.rot }
  if (plan.cable) return { cmd: juntar('etiqueta', [crear('etiqueta', 'cables', nuevoCable(plan.cable, est.gen)), crear('etiqueta', 'etiquetas', etiqueta)]), etiqueta, normalizar: true }
  return { cmd: crear('etiqueta', 'etiquetas', etiqueta), etiqueta, normalizar: false }
}

/** Una nota con ese texto en `en`. */
export function notaEn(est: Estado, en: Punto, texto: string): { cmd: Comando; nota: Nota } | { motivo: string } {
  const limpio = limpiarTexto(texto).replace(/\s+$/, '')
  if (!limpio.trim()) return { motivo: 'Escribe el texto de la nota.' }
  const nota = nuevaNota(limpio, en, est.gen)
  return { cmd: crear('nota', 'notas', nota), nota }
}

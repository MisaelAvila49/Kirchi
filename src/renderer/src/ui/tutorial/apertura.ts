import type { Ajustes } from '../../../../compartido/ajustes'
import type { Pestaña } from '../Instrumentos'
import type { PasoDef } from './tipos'

/** Qué deja abierto un paso al empezar: el panel lateral, un panel del riel derecho (Inspector, Mediciones, Proyecto o Análisis) o una pestaña de la franja. */
export interface Apertura {
  parche: Partial<Pick<Ajustes, 'panel' | 'lateral' | 'inspector' | 'panelDerecho'>>
  franja: Pestaña | null
}

/**
 * Los paneles arrancan plegados, así que un paso que señala algo dentro de uno lo abre solo. Si ya estaba abierto no cambia nada de más.
 */
export function aperturaDelPaso(p: Pick<PasoDef, 'abre'>): Apertura | null {
  switch (p.abre) {
    case 'libreria':
    case 'plantillas':
    case 'calculadoras':
      return { parche: { panel: p.abre, lateral: true }, franja: null }
    case 'inspector':
    case 'mediciones':
    case 'proyecto':
    case 'analisis':
      return { parche: { inspector: true, panelDerecho: p.abre }, franja: null }
    case 'osciloscopio':
    case 'graficas':
      return { parche: {}, franja: p.abre }
    default:
      return null
  }
}

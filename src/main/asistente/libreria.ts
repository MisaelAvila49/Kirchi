import { libreriaIncluida } from '../../renderer/src/piezas/incluidas'
import type { PiezaDef } from '../../renderer/src/piezas/tipos'
import { AnalizadorSvg } from './analizadorSvg'

/** Las piezas incluidas leídas sin DOM: el analizador de símbolos se presta solo mientras se carga la librería. */
export function libreriaSinVentana(): Map<string, PiezaDef> {
  const g = globalThis as { DOMParser?: unknown }
  const previo = g.DOMParser
  g.DOMParser = AnalizadorSvg
  try {
    return libreriaIncluida().piezas
  } finally {
    if (previo === undefined) delete g.DOMParser
    else g.DOMParser = previo
  }
}

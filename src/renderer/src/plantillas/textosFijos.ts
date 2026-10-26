import type { Documento, Id, Pieza } from '../doc/tipos'
import { copiar, type Fragmento } from '../editor/portapapeles'
import type { Seleccion } from '../editor/seleccion'
import { etiquetasSinChoques } from '../lienzo/apartar'
import { textosLocales } from '../lienzo/etiquetas'
import { centroDeTexto, posicionLibre, posicionManual } from '../lienzo/textosManuales'
import type { PiezaDef } from '../piezas/tipos'

/** Al hacer una plantilla, cada texto sin posición a mano toma como fija la que tiene en pantalla (su centro en el marco
 * del símbolo, dos decimales); el reparto automático (`etiquetasSinChoques`) elegiría otro lugar en otro dibujo. Se
 * dibuja centrado, como uno movido con Alt. */

type Textos = NonNullable<Pieza['textos']>

/** Las posiciones fijas que le faltan a una pieza para que sus textos queden donde se ven en `colocados` (en orden de `textosLocales`). */
function faltantes(p: Pieza, def: PiezaDef, doc: Documento, colocados: ReturnType<typeof etiquetasSinChoques>): Textos | null {
  const locales = textosLocales(p, def, doc)
  const vistos = colocados.get(p.id)
  if (!vistos) return null
  const nuevos: Textos = {}
  locales.forEach((t, i) => {
    const visto = vistos[i]
    if (!visto || posicionManual(p, t.cual)) return
    nuevos[t.cual] = posicionLibre(p, centroDeTexto(visto))
  })
  return Object.keys(nuevos).length > 0 ? nuevos : null
}

/** El fragmento de `sel` (como Ctrl+C) con los textos automáticos de sus piezas fijos donde los muestra `doc`. */
export function copiarConTextosFijos(doc: Documento, sel: Seleccion, lib: Map<string, PiezaDef>): Fragmento | null {
  const f = copiar(doc, sel, lib)
  if (!f) return null
  const colocados = etiquetasSinChoques(doc, lib)
  for (const p of f.piezas) {
    const original = doc.piezas[p.id]
    const def = lib.get(p.tipo)
    if (!original || !def) continue
    const nuevos = faltantes(original, def, doc, colocados)
    if (nuevos) p.textos = { ...(p.textos ?? {}), ...nuevos }
  }
  return f
}

/** El documento con los textos automáticos de todas sus piezas fijos donde los reparte el editor (circuitos armados por código). */
export function conTextosFijos(doc: Documento, lib: Map<string, PiezaDef>): Documento {
  const colocados = etiquetasSinChoques(doc, lib)
  const piezas: Record<Id, Pieza> = {}
  for (const [id, p] of Object.entries(doc.piezas)) {
    const def = lib.get(p.tipo)
    const nuevos = def ? faltantes(p, def, doc, colocados) : null
    piezas[id] = nuevos ? { ...p, textos: { ...(p.textos ?? {}), ...nuevos } } : p
  }
  return { ...doc, piezas }
}

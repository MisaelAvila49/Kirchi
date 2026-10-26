import { createMemo, For } from 'solid-js'
import type { PiezaDef } from '../piezas/tipos'
import { grosorIcono, vistaPrevia, type VistaPrevia } from './buscadorUtil'

/** Símbolo pequeño de una pieza (lista de la Librería), con la misma geometría que el lienzo. */
const CACHE = new WeakMap<PiezaDef, VistaPrevia>()
const vistaDe = (def: PiezaDef): VistaPrevia => {
  let v = CACHE.get(def)
  if (!v) CACHE.set(def, (v = vistaPrevia(def.geometria)))
  return v
}

export default function SimboloPieza(props: { def: PiezaDef }) {
  const v = createMemo(() => vistaDe(props.def))
  const grosor = createMemo(() => grosorIcono(v().viewBox))
  // --k-trazo engruesa el trazo donde la hoja lo pide; por omisión 1.
  return (
    <svg class="simbolo" viewBox={v().viewBox} aria-hidden="true">
      <For each={v().triangulos}>{(t) => <polygon points={t} />}</For>
      <For each={v().lineas}>{(l) => <polyline points={l} style={{ 'stroke-width': `calc(${grosor()} * var(--k-trazo, 1))` }} />}</For>
    </svg>
  )
}

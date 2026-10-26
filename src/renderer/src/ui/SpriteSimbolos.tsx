import { For } from 'solid-js'
import type { PiezaDef } from '../piezas/tipos'
import { grosorIcono, vistaPrevia, type VistaPrevia } from './buscadorUtil'

const CACHE = new WeakMap<PiezaDef, VistaPrevia>()
const vistaDe = (def: PiezaDef): VistaPrevia => {
  let v = CACHE.get(def)
  if (!v) CACHE.set(def, (v = vistaPrevia(def.geometria)))
  return v
}

/**
 * Un `<symbol>` por tipo de pieza del panel, una sola vez. El color sale de `currentColor`, que el contraste alto de Windows fuerza. `prefijo` separa los ids de dos paneles.
 */
export default function SpriteSimbolos(props: { defs: readonly PiezaDef[]; prefijo: string }) {
  return (
    <svg class="sprite-simbolos" aria-hidden="true" width="0" height="0">
      <defs>
        <For each={props.defs}>
          {(def) => {
            const v = vistaDe(def)
            const g = grosorIcono(v.viewBox) * 1.6
            return (
              <symbol id={`${props.prefijo}-${def.id}`} viewBox={v.viewBox}>
                <For each={v.triangulos}>{(t) => <polygon points={t} fill="currentColor" />}</For>
                <For each={v.lineas}>{(l) => <polyline points={l} fill="none" stroke="currentColor" stroke-width={g} stroke-linecap="round" stroke-linejoin="round" />}</For>
              </symbol>
            )
          }}
        </For>
      </defs>
    </svg>
  )
}

/** El símbolo de un tipo del sprite de su panel. */
export function UsoSimbolo(props: { tipo: string; prefijo: string }) {
  return (
    <svg class="simbolo-uso" aria-hidden="true">
      <use href={`#${props.prefijo}-${props.tipo}`} width="100%" height="100%" />
    </svg>
  )
}

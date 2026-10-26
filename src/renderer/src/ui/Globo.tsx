import { For, Show } from 'solid-js'
import { acotar } from './buscadorUtil'

// Ancho aproximado de un globo de nombre de pin (12 px monoespaciada, hasta ~14 caracteres) con su relleno.
const ANCHO = 140

/** Ancho máximo de un globo de varios renglones (el de una etiqueta), en píxeles: el de su regla `.globo.renglones`. */
const ANCHO_RENGLONES = 320

/**
 * Globo con el nombre del pin bajo el cursor; `x`, `y` en coordenadas de ventana. Con `lineas`, la primera en negrita.
 */
export default function Globo(props: { texto: string; x: number; y: number; lineas?: readonly string[] }) {
  const ancho = () => (props.lineas ? ANCHO_RENGLONES : ANCHO)
  const alto = () => (props.lineas ? 18 * props.lineas.length + 12 : 40)
  return (
    <div
      class="globo"
      classList={{ renglones: !!props.lineas }}
      role="tooltip"
      style={{ left: `${acotar(props.x + 12, 8, window.innerWidth - ancho() - 8)}px`, top: `${acotar(props.y - 34, 8, window.innerHeight - alto() - 8)}px` }}
    >
      <Show when={props.lineas} fallback={props.texto}>
        {(l) => <For each={l()}>{(t, i) => <div classList={{ 'globo-titulo': i() === 0 }}>{t}</div>}</For>}
      </Show>
    </div>
  )
}

import { Show } from 'solid-js'
import { Dynamic } from 'solid-js/web'

/**
 * Botón de una lista con muestras: `selectedcontent` copia ahí la opción elegida. Primer hijo del `select`. No está en los tipos de JSX, de ahí `Dynamic`.
 */
export function BotonDeLista() {
  return (
    <button type="button" tabindex="-1">
      <Dynamic component="selectedcontent" />
    </button>
  )
}

/**
 * Opción con la muestra de su color a la izquierda. La lista lleva `class="con-muestras"` (`paneles.css`): con `appearance: base-select` el círculo queda en la misma columna en todas.
 */
export default function OpcionConMuestra(props: { valor: string; texto?: string; muestra?: string; seleccionada: boolean }) {
  return (
    <option value={props.valor} selected={props.seleccionada}>
      <Show when={props.muestra}>{(m) => <span class="muestra-color" data-color={m()} aria-hidden="true" />}</Show>
      {props.texto ?? props.valor}
    </option>
  )
}

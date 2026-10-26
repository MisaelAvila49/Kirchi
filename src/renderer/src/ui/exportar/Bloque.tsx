import { Show, type JSX } from 'solid-js'

interface Props {
  titulo: string
  /** Una línea con lo elegido, a la vista aunque el bloque esté plegado. */
  resumen?: string
  /** Abierto al aparecer (lo recuerda el navegador mientras el bloque siga en pantalla). */
  abierto?: boolean
  clase?: string
  children: JSX.Element
}

/** Bloque plegable con `details` nativo (teclado, lector y animación reducida sin trabajo extra). */
export default function Bloque(props: Props) {
  return (
    <details class={`bloque ${props.clase ?? ''}`} open={props.abierto ?? false}>
      <summary>
        <span class="bloque-titulo">{props.titulo}</span>
        <Show when={props.resumen}>
          <span class="bloque-resumen">{props.resumen}</span>
        </Show>
      </summary>
      <div class="bloque-cuerpo">{props.children}</div>
    </details>
  )
}

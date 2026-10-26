import { Show, type JSX } from 'solid-js'
import { IconoPlegarDerecha, IconoPlegarIzquierda } from './iconos'

interface Props {
  titulo: string
  /** Resumen junto al título («10 piezas», «4 piezas · 5 redes»). */
  resumen?: string
  /** Clase que ensancha el panel (la ficha de las calculadoras). */
  clase?: string
  /** Panel del riel derecho: pliega hacia la derecha y es el `#panel-derecho`. */
  lado?: 'izq' | 'der'
  onPlegar(): void
  children: JSX.Element
}

/** Panel lateral de 300 px (--ancho-panel, el mismo de los dos lados), plegable desde su encabezado (el estado se recuerda en los ajustes). */
export default function PanelLateral(props: Props) {
  return (
    <aside id={props.lado === 'der' ? 'panel-derecho' : 'panel-lateral'} class={`lateral ${props.lado === 'der' ? 'derecho ' : ''}${props.clase ?? ''}`} aria-label={props.titulo}>
      <header class="panel-cabeza">
        {/* El resumen va junto al título si cabe; si no, baja al renglón siguiente sin cortarse. */}
        <div class="panel-titulo">
          <h2>{props.titulo}</h2>
          <Show when={props.resumen}>
            <small class="secundario">{props.resumen}</small>
          </Show>
        </div>
        <button type="button" class="boton-icono" aria-label={`Plegar el panel ${props.titulo}`} onClick={() => props.onPlegar()}>
          {props.lado === 'der' ? <IconoPlegarDerecha /> : <IconoPlegarIzquierda />}
        </button>
      </header>
      <div class="panel-cuerpo">{props.children}</div>
    </aside>
  )
}

import { Match, Switch } from 'solid-js'
import type { IdGesto } from './texto'

const CUERPO = 'M4 5.5A4 4 0 0 1 12 5.5V10.5A4 4 0 0 1 4 10.5Z'
const IZQUIERDO = 'M8 1.5A4 4 0 0 0 4 5.5V7H8Z'
const DERECHO = 'M8 1.5A4 4 0 0 1 12 5.5V7H8Z'

function Raton(props: { parte?: 'izq' | 'der' | 'rueda'; extra?: 'doble' }) {
  return (
    <>
      <path d={CUERPO} fill="none" stroke="currentColor" stroke-width="1.3" />
      <path d="M4 7H12M8 1.5V7" fill="none" stroke="currentColor" stroke-width="1.1" />
      {props.parte === 'izq' && <path d={IZQUIERDO} fill="currentColor" />}
      {props.parte === 'der' && <path d={DERECHO} fill="currentColor" />}
      {props.parte === 'rueda' && <rect x="7.1" y="2.6" width="1.8" height="3.2" rx="0.9" fill="currentColor" />}
      {props.extra === 'doble' && <path d="M1.2 4.2A5 5 0 0 0 1.2 9.2M14.8 4.2A5 5 0 0 1 14.8 9.2" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" />}
    </>
  )
}

/** El dibujo de un gesto del ratón, de 16 px y del color del texto. Es decorativo: la palabra del gesto va al lado en el texto. */
export default function GestoIcono(props: { id: IdGesto }) {
  return (
    <svg class="tutorial-gesto-icono" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <Switch>
        <Match when={props.id === 'clic'}>
          <Raton parte="izq" />
        </Match>
        <Match when={props.id === 'doble-clic'}>
          <Raton parte="izq" extra="doble" />
        </Match>
        <Match when={props.id === 'clic-derecho'}>
          <Raton parte="der" />
        </Match>
        <Match when={props.id === 'doble-clic-derecho'}>
          <Raton parte="der" extra="doble" />
        </Match>
        <Match when={props.id === 'rueda'}>
          <Raton parte="rueda" />
          <path d="M8 .4L6.6 1.7M8 .4L9.4 1.7M8 15.6L6.6 14.3M8 15.6L9.4 14.3" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" />
        </Match>
        <Match when={props.id === 'arrastrar'}>
          <path d="M8 1.5V14.5M1.5 8H14.5M8 1.5L6 3.5M8 1.5L10 3.5M8 14.5L6 12.5M8 14.5L10 12.5M1.5 8L3.5 6M1.5 8L3.5 10M14.5 8L12.5 6M14.5 8L12.5 10" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" />
        </Match>
        <Match when={props.id === 'mayus-clic'}>
          <g transform="translate(0.4 1.2) scale(0.8)">
            <path d="M5 1.6L1.4 6.2H3.8V9.6H6.2V6.2H8.6Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" />
          </g>
          <g transform="translate(5.6 1.6) scale(0.7)">
            <Raton parte="izq" />
          </g>
        </Match>
      </Switch>
    </svg>
  )
}

import { For, Show, createUniqueId, type JSX } from 'solid-js'
import PistaGlobo from './PistaGlobo'

/** Las piezas con que se arma Configuración: tarjeta por grupo, filas con el nombre a la izquierda y el control a la derecha, elegir con un segmentado y sí o no con un interruptor. */

/** Una tarjeta con título (h4) y sus filas. */
export function GrupoConfig(props: { titulo: string; children: JSX.Element }) {
  const id = `cfg-g-${createUniqueId()}`
  return (
    <section class="cfg-g" aria-labelledby={id}>
      <h4 class="cfg-gh" id={id}>
        {props.titulo}
      </h4>
      {props.children}
    </section>
  )
}

interface PropsFila {
  /** Id del nombre: el control lo usa en `aria-labelledby`. */
  id: string
  nombre: string
  /** Descripción corta bajo el nombre (una línea). */
  cap?: string
  /** Ayuda (i) justo tras el nombre; el control la nombra con `aria-describedby={pista}`. */
  pista?: { id: string; texto: string }
  /** El control de elegir ocupa todo el ancho bajo el nombre. */
  apila?: boolean
  children?: JSX.Element
}

/** Una fila: nombre, ayuda (i) y descripción a la izquierda; el control a la derecha, o debajo si `apila`. */
export function FilaConfig(props: PropsFila) {
  return (
    <div class="cfg-fila" classList={{ apila: props.apila }}>
      <div class="cfg-lab">
        <span class="cfg-nm" id={props.id}>
          {props.nombre}
        </span>
        <Show when={props.pista}>{(p) => <PistaGlobo id={p().id} texto={p().texto} />}</Show>
        <Show when={props.cap}>
          <span class="cfg-cap" id={`${props.id}-cap`}>
            {props.cap}
          </span>
        </Show>
      </div>
      <Show when={props.children}>
        <div class="cfg-ctl">{props.children}</div>
      </Show>
    </div>
  )
}

export interface OpcionSegmentada<T> {
  valor: T
  texto: string
  /** Color de una muestra junto al texto (el color de los cables). */
  muestra?: string
  /** Las cifras salen en la fuente de cifras. */
  cifra?: boolean
}

/** Elegir entre pocas opciones: radios nativos (teclado y lectores) dibujados como un control segmentado. */
export function Segmentado<T extends string | number>(props: {
  nombre: string
  /** Id del nombre de la fila. */
  etiqueta: string
  describedby?: string
  opciones: readonly OpcionSegmentada<T>[]
  valor: T
  onCambiar(v: T): void
}) {
  return (
    <div class="cfg-seg" role="radiogroup" aria-labelledby={props.etiqueta}>
      <For each={props.opciones}>
        {(o) => (
          <label>
            <input type="radio" class="solo-lectores" name={props.nombre} value={String(o.valor)} checked={props.valor === o.valor} aria-describedby={props.describedby} onChange={() => props.onCambiar(o.valor)} />
            <span classList={{ cifra: o.cifra }}>
              <Show when={o.muestra}>{(m) => <i class="muestra" style={{ background: m() }} aria-hidden="true" />}</Show>
              {o.texto}
            </span>
          </label>
        )}
      </For>
    </div>
  )
}

/** El interruptor de todo lo que es sí o no. */
export function Interruptor(props: { etiqueta: string; activo: boolean; describedby?: string; id?: string; onCambiar(v: boolean): void }) {
  return (
    <button type="button" class="interruptor" id={props.id} role="switch" aria-checked={props.activo} aria-labelledby={props.etiqueta} aria-describedby={props.describedby} onClick={() => props.onCambiar(!props.activo)} />
  )
}

/** La carpeta elegida con Cambiar… y Restablecer: la misma fila para las grabaciones y el asistente. */
export function FilaCarpeta(props: { id: string; nombre: string; idCarpeta: string; carpeta: string; ruta?: string; personalizada: boolean; onCambiar(): void; onRestablecer(): void }) {
  return (
    <FilaConfig id={props.id} nombre={props.nombre}>
      <span class="carpeta cifra" id={props.idCarpeta} title={props.ruta}>
        {props.carpeta}
      </span>
      <button type="button" class="boton" onClick={() => props.onCambiar()}>
        Cambiar…
      </button>
      <button type="button" class="boton" disabled={!props.personalizada} onClick={() => props.onRestablecer()}>
        Restablecer
      </button>
    </FilaConfig>
  )
}

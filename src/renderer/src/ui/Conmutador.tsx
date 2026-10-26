import { createUniqueId, For, type JSX } from 'solid-js'

export interface OpcionConmutador<T extends string> {
  valor: T
  /** El texto visible; es también el nombre accesible de la opción (WCAG 2.5.3). */
  texto: JSX.Element
  /** Nombre solo para lectores cuando `texto` no es texto (un icono). Debe contener lo que se ve. */
  nombre?: string
  titulo?: string
  /** Esta opción no se puede elegir ahora (su `titulo` dice por qué). */
  desactivada?: boolean
}

interface Props<T extends string> {
  /** Qué elige el grupo; lo lee el lector de pantalla como el rótulo del grupo. */
  nombre: string
  opciones: readonly OpcionConmutador<T>[]
  valor: T
  onCambiar(v: T): void
  desactivado?: boolean
  clase?: string
}

/** Conmutador segmentado como grupo de radio: una parada con Tab, flechas cambian de opción. */
export default function Conmutador<T extends string>(props: Props<T>) {
  const grupo = `conmutador-${createUniqueId()}`
  return (
    <fieldset class={`conmutador ${props.clase ?? ''}`} disabled={props.desactivado}>
      <legend class="solo-lectores">{props.nombre}</legend>
      <For each={props.opciones}>
        {(o) => (
          <label class="conmutador-op" title={o.titulo} data-valor={o.valor}>
            <input type="radio" name={grupo} value={o.valor} checked={props.valor === o.valor} disabled={o.desactivada} onChange={() => props.onCambiar(o.valor)} />
            <span>{o.texto}</span>
            {o.nombre ? <span class="solo-lectores">{o.nombre}</span> : null}
          </label>
        )}
      </For>
    </fieldset>
  )
}

import { createSignal, For, Show } from 'solid-js'
import type { Id } from '../doc/tipos'
import type { VistaPaquete } from './vistaInspector'

interface Props {
  pieza: Id
  paquete: VistaPaquete
  desactivado?: boolean
  /** Devuelve el motivo si no se aplicó, o null. */
  onCambiar(id: Id, unidad: string): string | null
}

/**
 * «Unidad» de una pieza agrupada en un encapsulado: A, B, C… con las ocupadas deshabilitadas y la pieza que las tiene.
 */
export default function SelectorUnidad(props: Props) {
  const [error, setError] = createSignal<string | null>(null)
  const id = () => `unidad-${props.pieza}`
  return (
    <div class="selector-unidad">
      <label for={id()}>Unidad</label>
      <select
        id={id()}
        class="campo"
        value={props.paquete.unidad}
        disabled={props.desactivado}
        aria-describedby={`${id()}-error`}
        onChange={(e) => {
          const r = props.onCambiar(props.pieza, e.currentTarget.value)
          setError(r)
          // Una unidad rechazada deja la lista en la del documento.
          if (r) e.currentTarget.value = props.paquete.unidad
        }}
      >
        <For each={props.paquete.unidades}>
          {(u) => (
            <option value={u.nombre} selected={u.actual} disabled={u.enUso !== null} title={u.texto ?? undefined}>
              {u.texto ? `${u.nombre} (${u.texto})` : u.nombre}
            </option>
          )}
        </For>
      </select>
      <p id={`${id()}-error`} class="campo-error caja-referencia-error" role="alert">
        <Show when={error()}>{error()}</Show>
      </p>
    </div>
  )
}

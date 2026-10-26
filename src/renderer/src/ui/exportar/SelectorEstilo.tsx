import { For, Show } from 'solid-js'
import { NOMBRE_PREAJUSTE, PREAJUSTES, type NombrePreajuste } from './preajustes'

interface Props<T extends string = NombrePreajuste> {
  /** El preajuste en curso; null si el lector cambió algún adorno a mano. */
  elegido: T | null
  onElegir(n: T): void
  /** Los preajustes y su nombre (los de la figura de datos si no se dan: Instrumento e Informe). */
  opciones?: readonly (readonly [T, string])[]
  /** El rótulo del grupo y su nombre accesible. */
  rotulo?: string
  nombreAccesible?: string
}

const DE_FIGURA = PREAJUSTES.map((n) => [n, NOMBRE_PREAJUSTE[n]] as const)

/** «Estilo»: grupo de radios con aspecto de dos botones. «A medida» cuando ninguno corresponde. */
export default function SelectorEstilo<T extends string = NombrePreajuste>(props: Props<T>) {
  return (
    <fieldset class="selector-estilo" aria-label={props.nombreAccesible ?? 'Estilo de la figura'}>
      <span class="selector-estilo-rotulo" aria-hidden="true">
        {props.rotulo ?? 'Estilo'}
      </span>
      <div class="selector-estilo-botones">
        <For each={(props.opciones ?? DE_FIGURA) as readonly (readonly [T, string])[]}>
          {([n, nombre]) => (
            <label classList={{ elegida: props.elegido === n }}>
              <input type="radio" name="estilo-figura" checked={props.elegido === n} onChange={() => props.onElegir(n)} />
              {nombre}
            </label>
          )}
        </For>
      </div>
      <Show when={props.elegido === null}>
        <span class="selector-estilo-medida secundario" role="status">
          a medida
        </span>
      </Show>
    </fieldset>
  )
}

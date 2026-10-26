import { createUniqueId, For } from 'solid-js'
import IconoCinta from '../cinta/IconoCinta'

export type TemaFigura = 'claro' | 'oscuro'
const OPCIONES: readonly (readonly [TemaFigura, string])[] = [
  ['claro', 'Tema claro'],
  ['oscuro', 'Tema oscuro']
]

/**
 * Tema de una figura exportada: dos botones de icono de tamaño fijo. `valor` es null cuando el fondo no es un tema.
 */
export default function BotonesTema(props: { valor: TemaFigura | null; onCambiar(t: TemaFigura): void }) {
  const grupo = createUniqueId()
  return (
    <div class="asp-campo" role="radiogroup" aria-label="Tema">
      <span class="asp-rotulo" aria-hidden="true">
        Tema
      </span>
      <div class="asp-pastillas asp-iconos">
        <For each={OPCIONES}>
          {([v, texto]) => (
            <label class="asp-pastilla asp-icono-op" title={texto}>
              <input type="radio" name={`${grupo}-tema`} aria-label={texto} checked={props.valor === v} onChange={() => props.onCambiar(v)} />
              <span aria-hidden="true">
                <IconoCinta nombre={v === 'oscuro' ? 'luna' : 'sol'} uso="chico" />
              </span>
            </label>
          )}
        </For>
      </div>
    </div>
  )
}

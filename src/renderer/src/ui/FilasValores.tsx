import { Index, Show } from 'solid-js'
import type { OpcionValor } from '../valores/vistaSerie'

interface Props {
  /** El nombre del grupo para un lector de pantalla («Valores de E12 en kΩ»). */
  etiqueta: string
  opciones: readonly OpcionValor[]
  /** Escribe el valor en el campo y lo aplica. */
  onUsar(texto: string): void
  desactivado?: boolean
}

/**
 * Valores de una lista plegable como renglones simples. Los botones se conservan al cambiar el valor (`Index`) para no perder el foco, y Enter elige y aplica en el doble clic (`data-eleccion`).
 */
export default function FilasValores(props: Props) {
  return (
    <div class="valor-filas" role="group" aria-label={props.etiqueta}>
      <Index each={props.opciones}>
        {(o) => (
          <button type="button" class="valor-fila cifra" data-eleccion="" aria-pressed={o().activo} disabled={props.desactivado} onClick={() => props.onUsar(o().texto)}>
            <span>{o().etiqueta}</span>
            <Show when={o().activo}>
              <svg class="valor-fila-marca" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M3.5 8.4 6.6 11.4 12.5 5" />
              </svg>
            </Show>
          </button>
        )}
      </Index>
    </div>
  )
}

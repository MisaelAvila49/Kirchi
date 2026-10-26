import { createSignal, Show } from 'solid-js'

interface Props {
  /** Id del campo de texto (para el rótulo y los mensajes). */
  id: string
  /** El juego propio de SPICE como texto («bf = 200» por renglón); vacío si la pieza usa su modelo. */
  texto: string
  /** Los parámetros del modelo elegido, como texto: lo que se escribe al activar «Personalizado». */
  base: string
  desactivado?: boolean
  /** Lo que se escribe en el campo de texto. */
  onEscribir(texto: string): void
  /** Activa (con los parámetros del modelo elegido) o quita el modelo propio. */
  onAlternar(activo: boolean): void
  /** El campo de texto, para que quien lo monta pueda enfocarlo, aplicarlo al salir o atenderle las teclas. */
  campo?: (el: HTMLTextAreaElement) => void
  onSalir?(): void
  onTecla?(e: KeyboardEvent): void
  error?: string | null
}

/**
 * Modelo «Personalizado» de un transistor, MOSFET o amplificador: un parámetro de SPICE por renglón. Lo que falta toma el valor de omisión de ngspice.
 */
export default function FichaPersonalizado(props: Props) {
  // Un campo vaciado a medias sigue a la vista hasta que se desmarque la casilla.
  const [forzado, setForzado] = createSignal(false)
  const activo = () => forzado() || props.texto.trim() !== ''
  const alternar = (marcado: boolean) => {
    setForzado(marcado)
    props.onAlternar(marcado)
  }
  return (
    <div class="ficha-catalogo ficha-spice">
      <label class="casilla ficha-personalizado">
        <input type="checkbox" checked={activo()} disabled={props.desactivado} onChange={(e) => alternar(e.currentTarget.checked)} />
        <span>
          <span class="ficha-personalizado-nombre">Personalizado</span> <span class="secundario">(parámetros de SPICE propios en lugar del modelo)</span>
        </span>
      </label>
      <Show when={activo()}>
        <textarea
          id={props.id}
          class="campo cifra ficha-spice-texto"
          ref={(el) => props.campo?.(el)}
          rows={7}
          spellcheck={false}
          aria-label="Parámetros de SPICE, uno por renglón"
          aria-invalid={props.error ? 'true' : undefined}
          aria-describedby={`${props.id}-ayuda`}
          disabled={props.desactivado}
          value={props.texto}
          onInput={(e) => props.onEscribir(e.currentTarget.value)}
          onBlur={() => props.onSalir?.()}
          onKeyDown={(e) => props.onTecla?.(e)}
        />
        <p id={`${props.id}-ayuda`} class={props.error ? 'campo-error' : 'campo-ayuda'} aria-live="polite">
          {props.error ?? 'Un parámetro por renglón («bf = 200»). El que falta toma el valor de omisión de ngspice.'}
        </p>
      </Show>
    </div>
  )
}

import { createSignal, onCleanup } from 'solid-js'

interface Props {
  /** Id del globo: el control que se explica lo nombra en `aria-describedby`. */
  id: string
  /** El texto completo; es también el nombre accesible del botón. */
  texto: string
}

/**
 * Botón (i) de 16 px con un globo. El globo sale al pasar el ratón o al tener el foco, se queda mientras el puntero está sobre él
 * y Esc lo cierra sin cerrar el diálogo (WCAG 1.4.13).
 */
export default function PistaGlobo(props: Props) {
  const [encima, setEncima] = createSignal(false)
  const [foco, setFoco] = createSignal(false)
  const [cerrada, setCerrada] = createSignal(false)
  const visible = () => (encima() || foco()) && !cerrada()
  const esc = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || !visible()) return
    // En captura y antes del diálogo: Esc cierra el globo y el diálogo sigue abierto.
    e.preventDefault()
    e.stopPropagation()
    setCerrada(true)
  }
  document.addEventListener('keydown', esc, true)
  onCleanup(() => document.removeEventListener('keydown', esc, true))
  return (
    <button
      type="button"
      class="info"
      aria-label={props.texto}
      data-visible={visible() ? '' : undefined}
      onPointerEnter={() => setEncima(true)}
      onPointerLeave={() => (setEncima(false), setCerrada(false))}
      onFocus={() => setFoco(true)}
      onBlur={() => (setFoco(false), setCerrada(false))}
    >
      i
      <span id={props.id} role="tooltip" class="globo-pista">
        {props.texto}
      </span>
    </button>
  )
}

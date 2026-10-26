import { onCleanup, onMount, type JSX } from 'solid-js'
import { IconoCerrar } from './iconos'

interface Props {
  titulo: string
  clase?: string
  onCerrar(): void
  children: JSX.Element
  /** Algo más en la cabecera, entre el título y la ✕ (el buscador de la hoja de atajos). */
  cabeza?: JSX.Element
}

let siguienteId = 0

/** Una parada por grupo de radios: solo cuenta el marcado, o el primero si ninguno lo está. */
function enfocables(caja: HTMLElement): HTMLElement[] {
  const todos = [...caja.querySelectorAll<HTMLElement>(ENFOCABLES)]
  return todos.filter((el) => {
    // Una pestaña sin elegir (tabindex -1) no es parada: se llega a ella con las flechas.
    if (el.getAttribute('role') === 'tab' && el.tabIndex < 0) return false
    if (!(el instanceof HTMLInputElement) || el.type !== 'radio' || !el.name) return true
    const grupo = todos.filter((x): x is HTMLInputElement => x instanceof HTMLInputElement && x.type === 'radio' && x.name === el.name)
    const parada = grupo.find((x) => x.checked) ?? grupo[0]
    return el === parada
  })
}
const ENFOCABLES = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea, [tabindex]:not([tabindex="-1"])'

/**
 * Diálogo modal: el foco entra y regresa al cerrar, Tab da la vuelta, Esc o clic fuera cierran. Bloquea los atajos del lienzo.
 */
export default function Dialogo(props: Props) {
  const id = `dialogo-${++siguienteId}`
  const previo = document.activeElement as HTMLElement | null
  let caja!: HTMLDivElement
  onMount(() => (caja.querySelector<HTMLElement>('[data-autofoco]') ?? caja.querySelector<HTMLElement>(ENFOCABLES))?.focus())
  onCleanup(() => previo?.focus?.({ preventScroll: true }))
  const tecla = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      props.onCerrar()
      return
    }
    if (e.key !== 'Tab') return
    const f = enfocables(caja)
    if (f.length === 0) return
    const i = f.indexOf(document.activeElement as HTMLElement)
    const j = e.shiftKey ? (i <= 0 ? f.length - 1 : i - 1) : i === f.length - 1 ? 0 : i + 1
    f[j].focus()
    e.preventDefault()
  }
  return (
    <div
      class="velo"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) props.onCerrar()
      }}
    >
      <div ref={caja} class={`dialogo ${props.clase ?? ''}`} role="dialog" aria-modal="true" tabindex="-1" aria-labelledby={`${id}-titulo`} on:keydown={tecla}>
        <div class="dialogo-cabeza">
          <h2 id={`${id}-titulo`}>{props.titulo}</h2>
          {props.cabeza}
          <button type="button" class="boton-icono" aria-label="Cerrar" onClick={() => props.onCerrar()}>
            <IconoCerrar />
          </button>
        </div>
        <div class="dialogo-cuerpo">{props.children}</div>
      </div>
    </div>
  )
}

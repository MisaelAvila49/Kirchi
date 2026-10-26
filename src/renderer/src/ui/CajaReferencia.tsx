import { createEffect, createSignal, on } from 'solid-js'
import type { Id } from '../doc/tipos'

interface Props {
  pieza: Id
  /** La referencia vigente del documento («R1», «C1», «XFG1»). */
  valor: string
  /** Devuelve el motivo si no se aplicó (repetida, vacía, con espacios), o null. */
  onCambiar(id: Id, texto: string): string | null
  desactivado?: boolean
  /** Con el motivo si está fija (la vista previa corre). */
  motivoFija?: string
}

/**
 * Referencia de la pieza en un recuadro editable. Enter o salir aplican, Esc regresa. El motivo de un nombre repetido sale debajo.
 */
export default function CajaReferencia(props: Props) {
  const [texto, setTexto] = createSignal(props.valor)
  const [error, setError] = createSignal<string | null>(null)
  let dueña = props.pieza
  createEffect(
    on(
      () => [props.pieza, props.valor] as const,
      ([pieza, valor]) => {
        dueña = pieza
        setTexto(valor)
        setError(null)
      },
      { defer: true }
    )
  )
  const aplicar = () => {
    if (props.desactivado) return
    if (texto().trim() === props.valor) {
      setTexto(props.valor)
      setError(null)
      return
    }
    setError(props.onCambiar(dueña, texto()))
  }
  const id = () => `referencia-${props.pieza}`
  return (
    <div class="caja-referencia-envoltura">
      <label class="caja-referencia" classList={{ invalida: !!error() }} title={props.motivoFija ?? 'Cambiar la referencia'}>
        <span class="solo-lectores">Referencia</span>
        <input
          id={id()}
          class="cifra"
          type="text"
          value={texto()}
          disabled={props.desactivado}
          spellcheck={false}
          autocomplete="off"
          aria-invalid={error() ? 'true' : undefined}
          aria-describedby={`${id()}-error`}
          onInput={(e) => setTexto(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              aplicar()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              setTexto(props.valor)
              setError(null)
            }
          }}
          onBlur={aplicar}
        />
        <svg class="caja-referencia-lapiz" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3 13l.6-2.8L11 2.8a1.4 1.4 0 0 1 2 2l-7.4 7.4z" />
          <path d="M9.8 4l2.2 2.2" />
        </svg>
      </label>
      <p id={`${id()}-error`} class="campo-error caja-referencia-error" role="alert">
        {error() ?? ''}
      </p>
    </div>
  )
}

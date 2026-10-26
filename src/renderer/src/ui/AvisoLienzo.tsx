import { createEffect, on, onCleanup, Show } from 'solid-js'

interface Props {
  /** El texto del aviso; null lo oculta. */
  texto: string | null
  /** Se llama al pasar el tiempo o al cerrarlo. */
  onCerrar(): void
}

/** Cuánto dura a la vista un aviso sobre el lienzo, en milisegundos. */
export const DURACION_AVISO_LIENZO = 6000

/** Aviso breve sobre el lienzo que dice por qué no se hizo algo. Se anuncia como estado y se cierra solo. */
export default function AvisoLienzo(props: Props) {
  let temporizador: ReturnType<typeof setTimeout> | undefined
  const parar = () => {
    if (temporizador !== undefined) clearTimeout(temporizador)
    temporizador = undefined
  }
  createEffect(
    on(
      () => props.texto,
      (t) => {
        parar()
        if (t !== null) temporizador = setTimeout(() => props.onCerrar(), DURACION_AVISO_LIENZO)
      }
    )
  )
  onCleanup(parar)
  return (
    <div class="aviso-lienzo-zona" role="status" aria-live="polite">
      <Show when={props.texto}>
        {(t) => (
          <p class="aviso-lienzo">
            <span>{t()}</span>
            <button type="button" class="aviso-lienzo-cerrar" aria-label="Cerrar el aviso" onClick={() => props.onCerrar()}>
              ×
            </button>
          </p>
        )}
      </Show>
    </div>
  )
}

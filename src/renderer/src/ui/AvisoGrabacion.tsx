import { onCleanup, onMount, Show } from 'solid-js'
import type { AvisoGrabacion } from '../grabacion/control'

/** Cuánto se queda a la vista el aviso de una grabación guardada (un error se queda hasta cerrarlo). */
export const MS_AVISO_GUARDADA = 12000

interface Props {
  aviso: AvisoGrabacion
  onAbrirCarpeta(): void
  onCambiarNombre(): void
  onCerrar(): void
}

/** Aviso sobre el lienzo al terminar de grabar (éxito con acciones, o el error). */
export default function AvisoGrabacionLienzo(props: Props) {
  onMount(() => {
    if (props.aviso.tipo !== 'guardada') return
    const t = setTimeout(() => props.onCerrar(), MS_AVISO_GUARDADA)
    onCleanup(() => clearTimeout(t))
  })
  return (
    <div class="aviso-grabacion" classList={{ 'aviso-error': props.aviso.tipo === 'error' }} role={props.aviso.tipo === 'error' ? 'alert' : 'status'}>
      <span class="aviso-texto">{props.aviso.texto}</span>
      <Show when={props.aviso.tipo === 'guardada'}>
        <button type="button" class="boton" onClick={() => props.onAbrirCarpeta()}>
          Abrir carpeta
        </button>
        <button type="button" class="boton" onClick={() => props.onCambiarNombre()}>
          Cambiar nombre
        </button>
      </Show>
      <button type="button" class="boton" aria-label="Cerrar el aviso" onClick={() => props.onCerrar()}>
        ×
      </button>
    </div>
  )
}

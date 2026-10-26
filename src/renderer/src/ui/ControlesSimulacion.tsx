import { Show } from 'solid-js'
import type { FaseSim } from '../sim/control'
import { atajoAria } from './atajoAria'
import { IconoDetener, IconoPausa, IconoSimular } from './iconos'
import { textoVelocidad } from './tiempo/velocidades'

export interface PropsSimulacion {
  fase: FaseSim
  /** Detenida: simula; corriendo: pausa; en pausa: reanuda (lo mismo que F5). */
  onSimular(): void
  onDetener(): void
  /** Los chips de voltaje de todas las redes están a la vista (tecla V). */
  voltajes: boolean
  onVoltajes(): void
  /** Primera tecla vigente de un comando («F5»); sin ella el botón no la anuncia. */
  tecla?(id: string): string | undefined
  /** Avanzar (F6) y la velocidad, que abre su menú. */
  onAvanzar?(): void
  velocidad?: { valor: number; onMenu(boton: HTMLElement): void }
}

// Los botones de la vista previa no toman el foco: Espacio y los atajos siguen yendo al lienzo.
const sinFoco = (e: MouseEvent) => e.preventDefault()

/** Simular, Pausar o Reanudar, y Detener mientras la vista previa está activa (barra superior y lienzo limpio). */
export default function ControlesSimulacion(props: PropsSimulacion) {
  const atajo = (id: string, nombre: string) => {
    const t = props.tecla?.(id)
    return { title: t ? `${nombre} (${t})` : nombre, 'aria-keyshortcuts': t ? atajoAria(t) : undefined }
  }
  const nombre = () => (props.fase === 'corriendo' ? 'Pausar' : props.fase === 'pausada' ? 'Reanudar' : props.fase === 'arrancando' ? 'Arrancando…' : 'Simular')
  return (
    <span class="controles-sim" role="group" aria-label="Vista previa">
      <button
        type="button"
        class="boton simular"
        classList={{ activa: props.fase !== 'detenida' }}
        aria-disabled={props.fase === 'arrancando' ? 'true' : undefined}
        {...atajo('simular', nombre())}
        onMouseDown={sinFoco}
        onClick={() => props.fase !== 'arrancando' && props.onSimular()}
      >
        {props.fase === 'corriendo' ? <IconoPausa /> : <IconoSimular />}
        {nombre()}
      </button>
      <Show when={props.onAvanzar}>
        <button type="button" class="boton" aria-disabled={props.fase === 'arrancando' ? 'true' : undefined} {...atajo('avanzar', 'Avanzar')} onMouseDown={sinFoco} onClick={() => props.fase !== 'arrancando' && props.onAvanzar?.()}>
          Avanzar
        </button>
      </Show>
      <Show when={props.velocidad}>
        {(v) => (
          <button type="button" class="boton" aria-haspopup="menu" title={`Velocidad ${textoVelocidad(v().valor)}`} onMouseDown={sinFoco} onClick={(e) => v().onMenu(e.currentTarget)}>
            Velocidad {textoVelocidad(v().valor)}
          </button>
        )}
      </Show>
      <Show when={props.fase !== 'detenida'}>
        <button type="button" class="boton" {...atajo('detener', 'Detener')} onMouseDown={sinFoco} onClick={() => props.onDetener()}>
          <IconoDetener />
          Detener
        </button>
        <button
          type="button"
          class="boton"
          aria-pressed={props.voltajes ? 'true' : 'false'}
          {...atajo('voltajes', props.voltajes ? 'Ocultar los voltajes de las redes' : 'Mostrar los voltajes de todas las redes')}
          onMouseDown={sinFoco}
          onClick={() => props.onVoltajes()}
        >
          Voltajes
        </button>
      </Show>
    </span>
  )
}

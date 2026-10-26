import { Show } from 'solid-js'
import type { AjustesGenerador } from '../instrumentos/ajustes'
import FichaGenerador from './FichaGenerador'

interface Props {
  refGen: string
  ajustes: AjustesGenerador | null
  /** El error de los ajustes guardados (un `.kir` con un valor fuera de rango). */
  errorAjustes: string | null
  /** Cambia una propiedad; devuelve el error del editor, o null. */
  onAjuste(prop: string, texto: string): string | null
  /** Cambia varias propiedades en un solo paso (la amplitud y el offset al editar el mínimo y el máximo). */
  onAjustes(cambios: Record<string, string>): string | null
  /** En el inspector el tono ya lo pone el panel entero: la ficha no lo repite en una caja propia. */
  sinTono?: boolean
}

/** Generador seleccionado como ficha compacta (ver `FichaGenerador`). */
export default function PanelGenerador(props: Props) {
  return (
    <section class="panel-generador" aria-label={`Generador ${props.refGen}`} data-tono={props.sinTono ? undefined : 'ciruela'}>
      <Show when={props.ajustes} fallback={<p class="secundario">{props.errorAjustes}</p>}>
        {(a) => <FichaGenerador a={a()} contexto="inspector" ajuste={props.onAjuste} ajustes={props.onAjustes} />}
      </Show>
    </section>
  )
}

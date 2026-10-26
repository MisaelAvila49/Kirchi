import { Show } from 'solid-js'
import Conmutador from './Conmutador'
import { MODOS_MULTIMETRO, type AjustesMultimetro, type ModoMultimetro } from '../instrumentos/ajustes'
import type { LecturaDeMultimetro } from '../sim/control'

interface Props {
  refMm: string
  ajustes: AjustesMultimetro
  /** Solo se lee si el fusible se fundió; la cifra va en Mediciones. */
  lectura: LecturaDeMultimetro | null
  carga: string | null
  onAjuste(prop: string, texto: string): void
  onReponer(): void
}

const OPCIONES = MODOS_MULTIMETRO.map((m) => ({ valor: m, texto: m }))

/**
 * Controles del multímetro seleccionado, en el inspector. La lectura vive en Mediciones y el rango es automático.
 */
export default function PanelMultimetro(props: Props) {
  return (
    <section class="panel-instrumento" aria-label={`Controles de ${props.refMm}`}>
      <div class="ficha-grupo">
        <span class="fld-rotulo" aria-hidden="true">Función</span>
        <Conmutador<ModoMultimetro> clase="modos-multimetro" nombre="Función" opciones={OPCIONES} valor={props.ajustes.modo} onCambiar={(m) => props.onAjuste('modo', m)} />
      </div>
      <label class="casilla">
        <input type="checkbox" checked={props.ajustes.ideal} onChange={(e) => props.onAjuste('ideal', e.currentTarget.checked ? 'sí' : 'no')} />
        Instrumento ideal
      </label>
      <Show when={props.carga}>{(c) => <p class="secundario">{c()}</p>}</Show>
      <Show when={props.lectura?.fundido}>
        <p class="alerta-instrumento">Fusible fundido: en modo de corriente va en serie, no en paralelo.</p>
        <button type="button" class="boton" onClick={() => props.onReponer()}>
          Reponer el fusible
        </button>
      </Show>
    </section>
  )
}

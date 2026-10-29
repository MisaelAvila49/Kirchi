import { For, Show } from 'solid-js'
import { DESCRIPCION_FICHA } from '../analisis/descripciones'
import { NOMBRE_FICHA, TIPOS_FICHA, type TipoFicha } from '../analisis/fichas'
import IconoCinta from './cinta/IconoCinta'
import type { NombreIcono } from './cinta/trazos'

const ICONO: Readonly<Record<TipoFicha, NombreIcono>> = {
  op: 'analisisOp',
  dc: 'analisisDc',
  ac: 'analisisAc',
  tran: 'analisisTran',
  fourier: 'analisisFourier',
  param: 'analisisParam'
}

/** La pestaña Análisis sin ninguno elegido: los análisis disponibles, cada uno con su icono y qué mide, para crear uno
 * como con Inicio › Analizar. */
export default function ElegirAnalisis(props: { onElegir: (t: TipoFicha) => void; motivoNoEditable?: string | null }) {
  return (
    <div class="an-elegir">
      <p class="secundario">Elige el análisis que quieres hacer.</p>
      {/* Por qué no se puede elegir, a la vista: el globo solo aparece al detenerse sobre un botón. */}
      <Show when={props.motivoNoEditable}>
        <p class="nota-serie aviso an-aviso" role="status">
          {props.motivoNoEditable}
        </p>
      </Show>
      <ul class="an-elegir-lista">
        <For each={TIPOS_FICHA}>
          {(t) => (
            <li>
              <button type="button" class="an-elegir-boton" aria-disabled={!!props.motivoNoEditable} title={props.motivoNoEditable ?? undefined} onClick={() => !props.motivoNoEditable && props.onElegir(t)}>
                <IconoCinta nombre={ICONO[t]} uso="grande" />
                <span class="an-elegir-texto">
                  <strong>{NOMBRE_FICHA[t]}</strong>
                  <span>{DESCRIPCION_FICHA[t].mide}</span>
                </span>
              </button>
            </li>
          )}
        </For>
      </ul>
    </div>
  )
}

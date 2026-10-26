import { createSignal, Show } from 'solid-js'
import type { Id } from '../doc/tipos'
import { MOTIVO_CORRIENTE_AC, MOTIVO_MEDIDOR_DE_CORRIENTE } from '../editor/sondas'
import CajaReferencia from './CajaReferencia'
import Conmutador from './Conmutador'
import type { VistaMedidor } from './vistaInspector'

interface Props {
  id: Id
  medidor: VistaMedidor
  /** La vista previa corre: nada se edita. */
  simulando?: boolean
  /** Devuelve el motivo si no se aplicó, o null. */
  onReferencia(id: Id, texto: string): string | null
  onCambiar(id: Id, cambio: { magnitud?: 'voltaje' | 'corriente'; modo?: 'dc' | 'ac' }): string | null
  onConvertir(id: Id): void
}

/**
 * Ficha del medidor rápido en el inspector: referencia, qué mide, modo y botón para pasar a un multímetro completo (con corriente avisa por qué no).
 */
export default function FichaMedidor(props: Props) {
  const [error, setError] = createSignal<string | null>(null)
  const cambiar = (c: { magnitud?: 'voltaje' | 'corriente'; modo?: 'dc' | 'ac' }) => setError(props.onCambiar(props.id, c))
  return (
    <section class="panel-instrumento ficha-medidor" aria-label={`Controles de ${props.medidor.ref}`}>
      <div class="ficha-grupo">
        <span class="fld-rotulo" aria-hidden="true">Referencia</span>
        <CajaReferencia pieza={props.id} valor={props.medidor.ref} onCambiar={props.onReferencia} desactivado={props.simulando} />
      </div>
      <div class="ficha-grupo">
        <span class="fld-rotulo" aria-hidden="true">Mide</span>
        <Conmutador<'voltaje' | 'corriente'>
          clase="modos-medidor"
          nombre="Mide"
          desactivado={props.simulando}
          valor={props.medidor.magnitud}
          onCambiar={(m) => cambiar({ magnitud: m })}
          opciones={[
            { valor: 'voltaje', texto: 'Voltaje' },
            { valor: 'corriente', texto: 'Corriente', titulo: props.medidor.puedeCorriente ? undefined : MOTIVO_MEDIDOR_DE_CORRIENTE, desactivada: !props.medidor.puedeCorriente && props.medidor.magnitud !== 'corriente' }
          ]}
        />
      </div>
      <div class="ficha-grupo">
        <span class="fld-rotulo" aria-hidden="true">Modo</span>
        <Conmutador<'dc' | 'ac'>
          clase="modos-medidor"
          nombre="Modo"
          desactivado={props.simulando}
          valor={props.medidor.modo}
          onCambiar={(m) => cambiar({ modo: m })}
          opciones={[
            { valor: 'dc', texto: 'DC' },
            { valor: 'ac', texto: 'AC (RMS)', nombre: 'AC, valor eficaz', titulo: props.medidor.magnitud === 'corriente' ? MOTIVO_CORRIENTE_AC : undefined, desactivada: props.medidor.magnitud === 'corriente' && props.medidor.modo !== 'ac' }
          ]}
        />
      </div>
      <Show when={!props.medidor.puedeCorriente && props.medidor.magnitud === 'voltaje'}>
        <p class="secundario sub">{MOTIVO_MEDIDOR_DE_CORRIENTE}</p>
      </Show>
      <p class="secundario">{props.medidor.descripcion}</p>
      <Show when={error()}>{(e) => <p class="campo-error" role="alert">{e()}</p>}</Show>
      <div class="acciones">
        <button type="button" class="boton" disabled={props.simulando} onClick={() => props.onConvertir(props.id)}>
          Convertir en multímetro completo
        </button>
      </div>
    </section>
  )
}

import { createSignal, Show } from 'solid-js'
import { RANGOS_FUENTE, type AjustesFuente } from '../instrumentos/ajustes'
import type { MedicionPieza } from '../sim/lectura'
import CampoPerilla from './CampoPerilla'
import { cifra } from './medicion'

interface Props {
  refPs: string
  ajustes: AjustesFuente | null
  errorAjustes: string | null
  medicion: MedicionPieza | null
  onAjuste(prop: string, texto: string): string | null
  /** Dentro del inspector no lleva el tono del instrumento. */
  sinTono?: boolean
}

/** La fuente variable seleccionada: voltaje y límite en perilla, la salida y, simulando, su modo CV o CC con lo que entrega. */
export default function PanelFuente(props: Props) {
  const [errores, setErrores] = createSignal<Record<string, string | null>>({})
  const cambiar = (prop: string, texto: string) => {
    const e = props.onAjuste(prop, texto)
    setErrores((x) => ({ ...x, [prop]: e }))
    return e
  }
  const modo = () => (props.medicion?.extra?.tipo === 'fuente-variable' ? props.medicion.extra.modo : null)
  return (
    <section class="panel-instrumento" aria-label={`Fuente variable ${props.refPs}`} data-tono={props.sinTono ? undefined : 'ciruela'}>
      <Show when={props.ajustes} fallback={<p class="secundario">{props.errorAjustes}</p>}>
        {(a) => (
          <>
            <Show when={modo()}>
              {(m) => (
                <p class="fuente-estado cifra">
                  <b class="fuente-modo" data-modo={m()}>{m() === 'apagada' ? 'Apagada' : m()}</b>
                  {` ${cifra(props.medicion!.v, 'V')} · ${cifra(props.medicion!.i, 'A')}`}
                </p>
              )}
            </Show>
            <CampoPerilla etiqueta="Voltaje" valor={a().voltaje} unidad="V" min={RANGOS_FUENTE.voltaje[0]} max={RANGOS_FUENTE.voltaje[1]} onCambiar={(t) => cambiar('voltaje', t)} error={errores().voltaje} />
            <CampoPerilla etiqueta="Límite de corriente" valor={a().limite} unidad="A" min={RANGOS_FUENTE.limite[0]} max={RANGOS_FUENTE.limite[1]} onCambiar={(t) => cambiar('limite', t)} error={errores().limite} />
            <label class="casilla">
              <input type="checkbox" checked={a().salida} onChange={(e) => cambiar('salida', e.currentTarget.checked ? 'encendida' : 'apagada')} />
              Salida
            </label>
          </>
        )}
      </Show>
    </section>
  )
}

import { createSignal, For, Show, type JSX } from 'solid-js'
import { formatearValor } from '../valores/valores'
import Dialogo from './Dialogo'
import CampoValor from './CampoValor'
import { formatearTiempo, instantePorOmision, leerDelta } from './tiempo/velocidades'

/** Los tiempos fijos que se eligen con un clic en «Tiempo fijo…». */
export const TIEMPOS_RAPIDOS: readonly number[] = [1e-5, 1e-4, 1e-3, 1e-2]

/** «Avanzar hasta t…» con un instante anterior al actual. */
export const textoPasado = (actual: number, v: number): string => `Avanzar hasta t llega a un instante futuro: escribe uno mayor que el actual (t = ${formatearTiempo(actual, v)}), o reinicia y avanza desde t = 0.`

interface Props {
  /** «hasta»: el instante al que se avanza; «delta»: el tiempo fijo que avanza cada avance (F6). */
  modo: 'hasta' | 'delta'
  /** El tiempo simulado de ahora y la velocidad (para escribirlo con sus cifras). */
  t: number
  velocidad: number
  /** El valor con que abre el campo, en segundos. */
  inicial: number | null
  /** Devuelve 'pasado' si el instante ya pasó (el diálogo lo dice y ofrece reiniciar). */
  onAceptar(segundos: number, reiniciar: boolean): 'pasado' | void
  onCerrar(): void
}

/** Diálogo con un valor con unidad: avanza hasta ese instante en pausa o fija el intervalo de F6. */
export default function DialogoTiempo(props: Props) {
  // Por omisión: 1 ms de intervalo, o el siguiente instante redondo por encima del tiempo actual.
  const [texto, setTexto] = createSignal(formatearValor(props.inicial ?? (props.modo === 'hasta' ? instantePorOmision(props.t) : 1e-3), 's'))
  const [error, setError] = createSignal<string | null>(null)
  const [pasado, setPasado] = createSignal(false)
  const leer = (): number | null => {
    const r = leerDelta(texto(), props.modo === 'hasta' ? 'instante' : 'intervalo')
    if ('error' in r) {
      setError(r.error)
      return null
    }
    return r.valor
  }
  const aceptar = (reiniciar: boolean) => {
    const v = leer()
    if (v === null) return
    if (props.modo === 'hasta' && !reiniciar && v <= props.t) {
      setPasado(true)
      setError(textoPasado(props.t, props.velocidad))
      return
    }
    if (props.onAceptar(v, reiniciar) === 'pasado') {
      setPasado(true)
      setError(textoPasado(props.t, props.velocidad))
      return
    }
    props.onCerrar()
  }
  const titulo = props.modo === 'hasta' ? 'Avanzar hasta' : 'Tiempo fijo'
  return (
    <Dialogo titulo={titulo} clase="dialogo-tiempo" onCerrar={props.onCerrar}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          aceptar(false)
        }}
      >
        <p class="secundario nota-dialogo">
          {props.modo === 'hasta' ? (
            <>
              Corre lo más rápido posible hasta ese instante y se queda en pausa en él. Ahora: <span class="cifra">t = {formatearTiempo(props.t, props.velocidad)}</span>. F5 o Esc lo interrumpen en pausa; Shift+F5 detiene.
            </>
          ) : (
            <>Cada avance (F6) corre este tiempo simulado. Elige uno de los de abajo o escribe el tuyo, con su unidad.</>
          )}
        </p>
        <label class="fld fld-campo">
          <span>{props.modo === 'hasta' ? 'Instante' : 'Intervalo'}</span>
          <CampoValor
            texto={texto()}
            unidad="s"
            nombre={props.modo === 'hasta' ? 'Instante' : 'Intervalo'}
            atributos={{ 'data-autofoco': '', 'aria-describedby': 'tiempo-error' } as JSX.InputHTMLAttributes<HTMLInputElement>}
            invalido={!!error()}
            onTexto={(t) => {
              setTexto(t)
              setError(null)
              setPasado(false)
            }}
          />
        </label>
        <p id="tiempo-error" class="en-linea-error" role="alert">
          {error() ?? ''}
        </p>
        <Show when={props.modo === 'delta'}>
          <div class="tiempos-rapidos" role="group" aria-label="Tiempos de uso común">
            <For each={TIEMPOS_RAPIDOS}>
              {(s) => (
                <button
                  type="button"
                  class="boton"
                  onClick={() => {
                    props.onAceptar(s, false)
                    props.onCerrar()
                  }}
                >
                  {formatearValor(s, 's')}
                </button>
              )}
            </For>
          </div>
        </Show>
        <div class="dialogo-botones">
          <Show when={pasado()}>
            <button type="button" class="boton" onClick={() => aceptar(true)}>
              Reiniciar y avanzar hasta t
            </button>
          </Show>
          <button type="button" class="boton" onClick={props.onCerrar}>
            Cancelar
          </button>
          <button type="submit" class="boton principal">
            {props.modo === 'hasta' ? 'Avanzar' : 'Usar este tiempo'}
          </button>
        </div>
      </form>
    </Dialogo>
  )
}

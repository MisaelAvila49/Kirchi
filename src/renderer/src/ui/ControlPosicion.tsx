import { createUniqueId, Show } from 'solid-js'
import { ladosDelPot } from '../sim/potenciometro'

/** El potenciómetro seleccionado: su pieza, su referencia y la posición actual (0 a 100). */
export interface PotVista {
  id: string
  ref: string
  posicion: number
  /** Resistencia total en Ω (null si el valor no se lee): con ella el inspector dice cuánto mide cada lado del cursor. */
  ohms?: number | null
  /** La ley de variación («logarítmica») y si es un reóstato (una sola resistencia del extremo al cursor). */
  ley?: string
  reostato?: boolean
}

interface Props {
  pot: PotVista
  /** `gesto`: el mismo valor mientras dura un arrastre del control (un solo paso de deshacer); sin él, el teclado. */
  onCambiar(posicion: number, gesto?: string): void
  /** Las filas «Pin 1 a cursor» y «Cursor a pin 2» (el inspector las muestra siempre; el Multímetro no). */
  lados?: boolean
}

let contador = 0

/** Posición del cursor de un potenciómetro: slider nativo (0 a 100). Flechas 1 %, Re Pág y Av Pág 10 %. */
export default function ControlPosicion(props: Props) {
  const id = `pos-${createUniqueId()}`
  let gesto: string | undefined
  const soltar = () => (gesto = undefined)
  return (
    <div class="fld fld-pos">
      <label for={id}>Posición del cursor</label>
      <output class="cifra" for={id}>{`${Math.round(props.pot.posicion)} %`}</output>
      <input
        id={id}
        class="deslizador"
        type="range"
        min="0"
        max="100"
        step="1"
        value={Math.round(props.pot.posicion)}
        aria-valuetext={`${Math.round(props.pot.posicion)} %`}
        aria-label={`Posición del cursor de ${props.pot.ref}`}
        onPointerDown={() => (gesto = `d${++contador}`)}
        onPointerUp={soltar}
        onPointerCancel={soltar}
        onBlur={soltar}
        onInput={(e) => props.onCambiar(Number(e.currentTarget.value), gesto)}
      />
      <Show when={props.lados ? ladosDelPot(props.pot.ohms ?? null, props.pot.posicion, props.pot.ley) : null}>
        {(l) => (
          <>
            <span class="secundario fld-lado">{props.pot.reostato ? 'Extremo a cursor' : 'Pin 1 a cursor'}</span>
            <b class="cifra">{l().pin1}</b>
            <Show when={!props.pot.reostato}>
              <span class="secundario fld-lado">Cursor a pin 2</span>
              <b class="cifra">{l().pin2}</b>
            </Show>
          </>
        )}
      </Show>
    </div>
  )
}

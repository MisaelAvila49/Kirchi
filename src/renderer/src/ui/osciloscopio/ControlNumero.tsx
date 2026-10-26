import { createSignal, createUniqueId, Show } from 'solid-js'
import { leerEscrito } from './mandos'
import { Rueda } from './rueda'

interface Props {
  /** El rótulo visible a la izquierda; con `nombre` no se muestra. */
  etiqueta?: string
  /** El nombre accesible cuando el rótulo visible no lo dice todo («Posición del canal A»). */
  nombre?: string
  valor: number
  paso: number
  min: number
  max: number
  /** El valor como se ve y como se dice («1.20 div», «2.500 ms»). */
  texto(v: number): string
  /** Con − y + a los lados (sin foco: el control tiene teclado), como en los mandos. */
  botones?: boolean
  onCambiar(v: number): void
  /** Con una unidad, el valor también se escribe a mano (Enter o doble clic sobre la cifra; «1.5 V», «200m»). */
  escribir?: string
}

/** Un `spinbutton` numérico: flechas un paso, con Shift diez, Inicio y Fin a los extremos, y la rueda. */
export default function ControlNumero(props: Props) {
  const id = `num-${createUniqueId()}`
  const poner = (v: number) => {
    const x = Math.min(props.max, Math.max(props.min, Number(v.toPrecision(12))))
    if (x !== props.valor) props.onCambiar(x)
  }
  const muescas = new Rueda()
  const [editando, setEditando] = createSignal(false)
  const [error, setError] = createSignal(false)
  let valorEl: HTMLSpanElement | undefined
  const abrir = () => {
    if (!props.escribir) return
    setError(false)
    setEditando(true)
    queueMicrotask(() => {
      const i = document.getElementById(`${id}-campo`) as HTMLInputElement | null
      i?.focus()
      i?.select()
    })
  }
  const cerrar = (volver: boolean) => {
    setEditando(false)
    setError(false)
    if (volver) queueMicrotask(() => valorEl?.focus())
  }
  const aplicar = (texto: string, volver: boolean) => {
    const v = leerEscrito(texto, props.escribir!, props.min, props.max)
    if (v === null) return setError(true)
    if (v !== props.valor) props.onCambiar(v)
    cerrar(volver)
  }
  const tecla = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && props.escribir) {
      e.preventDefault()
      e.stopPropagation()
      return abrir()
    }
    const k = e.shiftKey ? 10 : 1
    const nuevo =
      e.key === 'ArrowUp' || e.key === 'ArrowRight' ? props.valor + k * props.paso
      : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? props.valor - k * props.paso
      : e.key === 'Home' ? props.min
      : e.key === 'End' ? props.max
      : null
    if (nuevo === null) return
    e.preventDefault()
    e.stopPropagation()
    poner(nuevo)
  }
  return (
    <div class="control-serie">
      <Show when={props.etiqueta}>
        <span id={`${id}-et`} class="control-etiqueta">
          {props.etiqueta}
        </span>
      </Show>
      <Show when={props.botones}>
        <button type="button" class="boton-mini paso" tabindex="-1" aria-hidden="true" disabled={props.valor <= props.min} onClick={() => poner(props.valor - props.paso)}>
          −
        </button>
      </Show>
      <Show when={editando()}>
        <input
          id={`${id}-campo`}
          class="control-valor control-campo cifra"
          type="text"
          inputmode="decimal"
          autocomplete="off"
          aria-label={props.nombre ?? props.etiqueta}
          aria-invalid={error() ? 'true' : undefined}
          aria-describedby={error() ? `${id}-error` : undefined}
          value={props.texto(props.valor)}
          onInput={() => setError(false)}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') {
              e.preventDefault()
              aplicar(e.currentTarget.value, true)
            } else if (e.key === 'Escape') {
              e.preventDefault()
              cerrar(true)
            }
          }}
          onBlur={(e) => editando() && (leerEscrito(e.currentTarget.value, props.escribir!, props.min, props.max) === null ? cerrar(false) : aplicar(e.currentTarget.value, false))}
        />
        <Show when={error()}>
          <span id={`${id}-error`} class="solo-lectores" role="alert">
            Escribe un voltaje, por ejemplo 1.5 V o 200 mV.
          </span>
        </Show>
      </Show>
      <span
        ref={valorEl}
        hidden={editando()}
        class="control-valor cifra"
        role="spinbutton"
        tabindex="0"
        aria-labelledby={props.nombre ? undefined : `${id}-et`}
        aria-label={props.nombre}
        aria-valuenow={props.valor}
        aria-valuemin={props.min}
        aria-valuemax={props.max}
        aria-valuetext={props.texto(props.valor)}
        on:keydown={tecla}
        on:dblclick={abrir}
        title={props.escribir ? 'Doble clic o Enter para escribir el valor' : undefined}
        on:wheel={(e: WheelEvent) => {
          e.preventDefault()
          const dir = muescas.paso(e)
          if (dir) poner(props.valor - dir * props.paso)
        }}
      >
        {props.texto(props.valor)}
      </span>
      <Show when={props.botones}>
        <button type="button" class="boton-mini paso" tabindex="-1" aria-hidden="true" disabled={props.valor >= props.max} onClick={() => poner(props.valor + props.paso)}>
          +
        </button>
      </Show>
    </div>
  )
}

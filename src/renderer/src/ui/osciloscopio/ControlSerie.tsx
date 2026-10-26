import { createUniqueId, Show } from 'solid-js'
import { enPalabras, pasoSerie, valoresSerie } from '../../instrumentos/serie'
import { formatearValor } from '../../valores/valores'
import { Rueda } from './rueda'

interface Props {
  /** El rótulo visible a la izquierda; con `nombre` no se muestra (el título del grupo ya lo dice). */
  etiqueta?: string
  /** El nombre accesible del control cuando no hay rótulo visible («Voltios por división del canal A»). */
  nombre?: string
  valor: number
  rango: readonly [number, number]
  unidad: 'V' | 's'
  /** Pantalla: botones de 30 px y la cifra grande, sin «/div» (lo dice el título del grupo). */
  grande?: boolean
  /** Cada paso por separado: los seguidos los junta en un paso de deshacer la espera de 800 ms del editor. */
  onCambiar(v: number): void
}

/**
 * Control de la serie 1, 2 y 5 como `spinbutton`: flechas, Re Pág, Av Pág, Inicio, Fin, rueda y botones − y +. Los botones no llevan foco.
 */
export default function ControlSerie(props: Props) {
  const id = `serie-${createUniqueId()}`
  const paso = (dir: 1 | -1) => {
    const nuevo = pasoSerie(props.valor, dir, props.rango[0], props.rango[1])
    if (nuevo !== props.valor) props.onCambiar(nuevo)
  }
  const tecla = (e: KeyboardEvent) => {
    const serie = valoresSerie(props.rango[0], props.rango[1])
    const nuevo =
      e.key === 'ArrowUp' || e.key === 'ArrowRight' || e.key === 'PageUp' ? pasoSerie(props.valor, 1, props.rango[0], props.rango[1])
      : e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'PageDown' ? pasoSerie(props.valor, -1, props.rango[0], props.rango[1])
      : e.key === 'Home' ? serie[0]
      : e.key === 'End' ? serie[serie.length - 1]
      : null
    if (nuevo === null) return
    e.preventDefault()
    e.stopPropagation()
    if (nuevo !== props.valor) props.onCambiar(nuevo)
  }
  const muescas = new Rueda()
  const rueda = (e: WheelEvent) => {
    e.preventDefault()
    const dir = muescas.paso(e)
    if (dir) paso(dir === -1 ? 1 : -1)
  }
  return (
    <div class="control-serie" classList={{ grande: !!props.grande }}>
      <Show when={!props.nombre}>
        <span id={`${id}-et`} class="control-etiqueta">
          {props.etiqueta}
        </span>
      </Show>
      <button type="button" class="boton-mini paso" tabindex="-1" aria-hidden="true" disabled={props.valor <= props.rango[0] * (1 + 1e-9)} onClick={() => paso(-1)}>
        −
      </button>
      <span
        class="control-valor cifra"
        role="spinbutton"
        tabindex="0"
        aria-labelledby={props.nombre ? undefined : `${id}-et`}
        aria-label={props.nombre}
        aria-valuenow={props.valor}
        aria-valuemin={props.rango[0]}
        aria-valuemax={props.rango[1]}
        aria-valuetext={enPalabras(props.valor, props.unidad)}
        on:keydown={tecla}
        on:wheel={rueda}
      >
        {props.grande ? formatearValor(props.valor, props.unidad) : `${formatearValor(props.valor, props.unidad)}/div`}
      </span>
      <button type="button" class="boton-mini paso" tabindex="-1" aria-hidden="true" disabled={props.valor >= props.rango[1] * (1 - 1e-9)} onClick={() => paso(1)}>
        +
      </button>
    </div>
  )
}

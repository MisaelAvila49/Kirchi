import { Show } from 'solid-js'
import ControlesSimulacion, { type PropsSimulacion } from './ControlesSimulacion'
import ControlZoom from './ControlZoom'
import { IconoPaneles } from './iconos'
import { textoModo } from './vistaPrevia'

interface Props {
  archivo: string
  zoomPct: number
  onZoom(pct: number): void
  onAviso(texto: string): void
  /** Solo por la región viva: por qué el − o el + del zoom no actúan en el tope. */
  onAnuncio?(texto: string): void
  onPaneles(): void
  simulacion: PropsSimulacion
}

/**
 * Lienzo limpio: nombre del archivo y barra flotante. Ambos son reservas del encuadre (`data-reserva`). Con la vista previa activa la barra dice la fase con texto.
 */
export default function BarraLimpia(props: Props) {
  return (
    <>
      <div class="nombre-limpio" data-reserva>
        {props.archivo}
      </div>
      <div class="barra-limpia" role="toolbar" aria-label="Lienzo limpio" data-reserva>
        <Show when={props.simulacion.fase !== 'detenida'}>
          <span class="estado-modo">{textoModo(props.simulacion.fase)}</span>
        </Show>
        <ControlesSimulacion {...props.simulacion} />
        <ControlZoom pct={props.zoomPct} onZoom={props.onZoom} onAviso={props.onAviso} onAnuncio={props.onAnuncio} />
        <button type="button" class="boton" aria-keyshortcuts="Control+Shift+L Control+\" onClick={() => props.onPaneles()}>
          <IconoPaneles />
          Paneles
          <kbd aria-hidden="true">Ctrl+Shift+L</kbd>
        </button>
      </div>
    </>
  )
}

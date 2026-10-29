import { For } from 'solid-js'
import type { TarjetaInforme } from './informeVivo'

interface Props {
  tarjetas: TarjetaInforme[]
  /** La tarjeta que resalta ahora en el lienzo, para marcarla. */
  resaltada?: TarjetaInforme['clase'] | null
  onResaltar(t: TarjetaInforme | null): void
  onEncuadrar(t: TarjetaInforme): void
}

const marcaAlgo = (t: TarjetaInforme) => t.piezas.length > 0 || t.etiquetas.length > 0 || t.cables.length > 0

/** Las tarjetas del informe de una importación: pasar el ratón o enfocar una resalta sus piezas en el lienzo, un clic las encuadra. */
export default function TarjetasInforme(props: Props) {
  return (
    <For each={props.tarjetas}>
      {(t) => (
        <button
          type="button"
          class="tarjeta-informe"
          data-tono={t.tono}
          data-clase={t.clase}
          data-resaltada={props.resaltada === t.clase ? '' : undefined}
          // El nombre accesible es su texto visible (la cuenta y los renglones); una tarjeta sin nada que marcar no promete un resalte.
          aria-description={marcaAlgo(t) ? 'Se resaltan en el lienzo.' : undefined}
          onPointerEnter={() => marcaAlgo(t) && props.onResaltar(t)}
          onPointerLeave={() => props.onResaltar(null)}
          onFocus={() => marcaAlgo(t) && props.onResaltar(t)}
          onBlur={() => props.onResaltar(null)}
          onClick={() => marcaAlgo(t) && props.onEncuadrar(t)}
        >
          <strong>{t.titulo}</strong>
          <For each={t.lineas}>{(l) => <span>{l}</span>}</For>
        </button>
      )}
    </For>
  )
}

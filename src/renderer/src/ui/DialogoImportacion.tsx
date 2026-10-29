import { Show } from 'solid-js'
import type { Informe } from '../importar/informe'
import Dialogo from './Dialogo'
import { resumenDeConversion, tieneMarcas, tituloDeImportacion, type TarjetaInforme } from './informeVivo'
import TarjetasInforme from './TarjetasInforme'

interface Props {
  informe: Informe
  tarjetas: TarjetaInforme[]
  resaltada?: TarjetaInforme['clase'] | null
  onResaltar(t: TarjetaInforme | null): void
  onEncuadrar(t: TarjetaInforme): void
  /** Cierra el diálogo y abre Proyecto; `ver` además encuadra las piezas marcadas. */
  onCerrar(ver: boolean): void
}

/** Al terminar de importar: qué se convirtió y qué quedó aproximado. Esc, «Entendido» y «Ver las piezas marcadas» lo cierran y abren Proyecto. */
export default function DialogoImportacion(props: Props) {
  return (
    <Dialogo titulo={tituloDeImportacion(props.informe)} clase="importacion" onCerrar={() => props.onCerrar(false)}>
      <p class="secundario">{resumenDeConversion(props.informe)}</p>
      <div class="tarjetas-informe en-fila">
        <TarjetasInforme tarjetas={props.tarjetas} resaltada={props.resaltada} onResaltar={props.onResaltar} onEncuadrar={props.onEncuadrar} />
      </div>
      <div class="dialogo-botones">
        <Show when={tieneMarcas(props.tarjetas)}>
          <button type="button" class="boton" onClick={() => props.onCerrar(true)}>
            Ver las piezas marcadas
          </button>
        </Show>
        <button type="button" class="boton principal" data-autofoco onClick={() => props.onCerrar(false)}>
          Entendido
        </button>
      </div>
    </Dialogo>
  )
}

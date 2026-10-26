import type { Recuperable } from '../../../compartido/archivos'
import { textoFecha, type RespuestaRecuperar } from '../archivo/control'
import Dialogo from './Dialogo'

interface Props {
  recuperable: Recuperable
  onResponder(r: RespuestaRecuperar): void
}

/** Diálogo al abrir tras un cierre con cambios sin guardar: Recuperar, Descartar o Decidir después (Esc). */
export default function DialogoRecuperar(props: Props) {
  const r = () => props.recuperable
  return (
    <Dialogo titulo="Recuperar el trabajo sin guardar" clase="pregunta" onCerrar={() => props.onResponder('despues')}>
      <p>
        Kirchi se cerró sin guardar <strong>{r().nombre}</strong>. Se puede recuperar con los cambios hasta el {textoFecha(r().fecha)}.
      </p>
      <p class="secundario">Al recuperarlo queda sin guardar. Descartar lo borra para siempre.</p>
      <div class="dialogo-botones">
        <button type="button" class="boton" onClick={() => props.onResponder('despues')}>
          Decidir después
        </button>
        <button type="button" class="boton peligro" onClick={() => props.onResponder('descartar')}>
          Descartar
        </button>
        <button type="button" class="boton principal" data-autofoco onClick={() => props.onResponder('recuperar')}>
          Recuperar
        </button>
      </div>
    </Dialogo>
  )
}

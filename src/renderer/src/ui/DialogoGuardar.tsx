import type { Respuesta } from '../archivo/control'
import Dialogo from './Dialogo'

interface Props {
  nombre: string
  onResponder(r: Respuesta): void
}

/** «¿Guardar los cambios?». Guardar toma el foco; Esc, clic fuera o la X cancelan sin perder nada. */
export default function DialogoGuardar(props: Props) {
  return (
    <Dialogo titulo="¿Guardar los cambios?" clase="pregunta" onCerrar={() => props.onResponder('cancelar')}>
      <p>
        Los cambios de <strong>{props.nombre}</strong> se pierden si no se guardan.
      </p>
      <div class="dialogo-botones">
        <button type="button" class="boton" onClick={() => props.onResponder('cancelar')}>
          Cancelar
        </button>
        <button type="button" class="boton peligro" onClick={() => props.onResponder('descartar')}>
          No guardar
        </button>
        <button type="button" class="boton principal" data-autofoco onClick={() => props.onResponder('guardar')}>
          Guardar
        </button>
      </div>
    </Dialogo>
  )
}

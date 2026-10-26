import { createSignal } from 'solid-js'
import Dialogo from '../Dialogo'
import { CAPITULOS, capituloPorId } from './capitulos'

interface Props {
  /** `noVolver`: la casilla «No volver a mostrar» estaba marcada al cerrar. */
  onEmpezar(noVolver: boolean): void
  onVerTodos(noVolver: boolean): void
  onAhoraNo(noVolver: boolean): void
}

/** La oferta del primer arranque: un recorrido corto del capítulo 1, el selector de los cinco o nada por ahora. */
export default function OfertaTutorial(props: Props) {
  const [noVolver, setNoVolver] = createSignal(true)
  const primero = capituloPorId('primer-circuito')
  return (
    <Dialogo titulo="Bienvenido a Kirchi" clase="tutorial-oferta" onCerrar={() => props.onAhoraNo(noVolver())}>
      <p>
        ¿Quieres un recorrido de {primero?.minutos ?? 6} minutos para armar tu primer circuito? Puedes dejarlo cuando quieras y retomarlo desde la pestaña Ayuda.
      </p>
      <div class="dialogo-botones tutorial-oferta-botones">
        <button type="button" class="boton principal" data-autofoco onClick={() => props.onEmpezar(noVolver())}>
          Empezar el capítulo 1
        </button>
        <button type="button" class="boton" onClick={() => props.onVerTodos(noVolver())}>
          Ver los {CAPITULOS.length} capítulos
        </button>
        <button type="button" class="boton" onClick={() => props.onAhoraNo(noVolver())}>
          Ahora no
        </button>
      </div>
      <label class="tutorial-oferta-casilla">
        <input type="checkbox" checked={noVolver()} onChange={(e) => setNoVolver(e.currentTarget.checked)} />
        No volver a mostrar esta oferta
      </label>
    </Dialogo>
  )
}

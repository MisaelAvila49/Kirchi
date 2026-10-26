import Dialogo from '../Dialogo'
import type { EleccionReanudar } from './reanudar'

interface Props {
  numero: number
  titulo: string
  /** El paso (desde 1) donde seguirías con tu circuito. */
  paso: number
  onElegir(e: EleccionReanudar): void
  onCerrar(): void
}

/** El circuito del lienzo no coincide con lo que el capítulo espera en el paso donde se quedó: se elige con cuál seguir. */
export default function ReanudarTutorial(props: Props) {
  return (
    <Dialogo titulo={`Retomar el capítulo ${props.numero}`} clase="tutorial-oferta tutorial-reanudar" onCerrar={props.onCerrar}>
      <p>
        «{props.titulo}» esperaba otro circuito en el lienzo. Puedes empezar con el circuito del capítulo o seguir con el tuyo desde el paso {props.paso}.
      </p>
      <div class="dialogo-botones tutorial-oferta-botones">
        <button type="button" class="boton principal" data-autofoco onClick={() => props.onElegir('circuito-del-capitulo')}>
          Empezar con el circuito del capítulo
        </button>
        <button type="button" class="boton" onClick={() => props.onElegir('mi-circuito')}>
          Seguir con mi circuito
        </button>
        <button type="button" class="boton" onClick={props.onCerrar}>
          Cancelar
        </button>
      </div>
    </Dialogo>
  )
}

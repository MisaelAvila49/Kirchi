import { vistaCatalogo } from '../valores/vistaSerie'
import FilasValores from './FilasValores'
import ListaValores from './ListaValores'

interface Props {
  /** Lo que dice el campo del valor ahora. */
  texto: string
  unidad: string
  /** Los valores comunes de la propiedad (`comunes` de su `pieza.json`). */
  comunes: readonly string[]
  /** Escribe un valor en el campo y lo aplica. */
  onUsar(texto: string): void
  desactivado?: boolean
}

/** Valores comunes de una pieza con valor numérico: lista plegable sin rangos ni aviso. Cerrada por omisión. */
export default function FichaComunes(props: Props) {
  const v = () => vistaCatalogo(props.texto, props.unidad, props.comunes)
  return (
    <div class="ficha-catalogo">
      <ListaValores titulo="Valores comunes" detalle={String(v().opciones.length)}>
        <FilasValores etiqueta="Valores comunes" opciones={v().opciones} onUsar={props.onUsar} desactivado={props.desactivado} />
      </ListaValores>
    </div>
  )
}

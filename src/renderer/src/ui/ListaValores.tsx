import { createSignal, type JSX } from 'solid-js'

interface Props {
  /** El resumen que se ve cerrado: «Valores comerciales E12». */
  titulo: string
  /** Una cifra o frase corta a la derecha del título («36», «5.1 V»). */
  detalle?: string
  /** Empieza cerrada: una lista larga no debe empujar lo demás. */
  abierta?: boolean
  children: JSX.Element
}

/**
 * Lista plegable de valores comerciales o comunes, la misma en el inspector y el doble clic. Cerrada por omisión, con la cifra de lo que esconde.
 */
export default function ListaValores(props: Props) {
  const [abierta, setAbierta] = createSignal(!!props.abierta)
  return (
    <details class="lista-valores" open={abierta()} onToggle={(e) => setAbierta(e.currentTarget.open)}>
      <summary>
        <span>{props.titulo}</span>
        {props.detalle ? <span class="lista-valores-detalle cifra">{props.detalle}</span> : null}
      </summary>
      <div class="lista-valores-cuerpo">{props.children}</div>
    </details>
  )
}

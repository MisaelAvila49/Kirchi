import { For } from 'solid-js'
import type { AjustesOsciloscopio } from '../../instrumentos/ajustes'
import type { PantallaSab } from '../../sim/protocoloInstrumentos'
import { tablaDePantalla } from './tabla'

/** «Ver como tabla»: la pantalla en 21 filas, la alternativa a la traza para quien no la ve. */
export default function TablaOsciloscopio(props: { pantalla: PantallaSab; ajustes: AjustesOsciloscopio; ref: string }) {
  const t = () => tablaDePantalla(props.pantalla, props.ajustes)
  return (
    <table class="osc-tabla cifra">
      <caption class="solo-lectores">{`Pantalla de ${props.ref} en ${t().filas.length} instantes`}</caption>
      <thead>
        <tr>
          <For each={t().columnas}>{(c) => <th scope="col">{c}</th>}</For>
        </tr>
      </thead>
      <tbody>
        <For each={t().filas}>
          {(f) => (
            <tr>
              <For each={f}>{(v, i) => (i() === 0 ? <th scope="row">{v}</th> : <td>{v}</td>)}</For>
            </tr>
          )}
        </For>
      </tbody>
    </table>
  )
}

import { For, Show } from 'solid-js'
import { tablaDeCsv } from './csvTabla'

interface Props {
  /** El texto completo del CSV tal como se escribirá. */
  texto: string
  /** Cuántas filas de datos se ven. */
  filas?: number
  /** El carácter que separa las columnas del texto (coma, punto y coma o tabulador). */
  separador?: string
}

/** La vista previa del CSV: los comentarios, la fila de títulos y las primeras filas como tabla, con cuántas faltan. */
export default function VistaCsv(props: Props) {
  const t = () => tablaDeCsv(props.texto, props.filas ?? 12, props.separador ?? ',')
  return (
    <div class="vista-csv-caja">
      <Show when={t().comentarios.length > 0}>
        <pre class="vista-csv-comentarios cifra">{t().comentarios.join('\n')}</pre>
      </Show>
      <div class="vista-csv-region" role="region" tabindex="0" aria-label="Primeras filas del CSV">
        <table class="vista-csv-tabla cifra">
          <thead>
            <tr>
              <For each={t().columnas}>{(c) => <th scope="col">{c}</th>}</For>
            </tr>
          </thead>
          <tbody>
            <For each={t().filas}>
              {(f) => (
                <tr>
                  <For each={f}>{(c) => <td>{c}</td>}</For>
                </tr>
              )}
            </For>
            <Show when={t().restantes > 0}>
              <tr class="vista-csv-mas">
                <td colSpan={Math.max(1, t().columnas.length)}>… {t().restantes.toLocaleString('en-US')} filas más</td>
              </tr>
            </Show>
          </tbody>
        </table>
      </div>
    </div>
  )
}

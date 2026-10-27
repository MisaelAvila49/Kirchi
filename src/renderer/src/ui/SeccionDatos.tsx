import { createSignal, For, Show } from 'solid-js'
import { enlaceDeLcsc } from '../../../compartido/enlaces'
import { TEXTO_DATOS_HOJA, TEXTO_DATOS_HOJA_AVISO, TEXTO_DATOS_SIN_FILA, TEXTO_DATOS_SIN_VERIFICAR, TEXTO_DATOS_TIPICO, TEXTO_DATOS_TITULO, TEXTO_DATOS_VIRTUAL, type VistaDatos } from './vistaInspector'

/** Lo que se pinta: todo menos «ninguno», que no muestra la sección. */
export type VistaDatosVisible = Exclude<VistaDatos, { tipo: 'ninguno' }>

export interface PropsSeccionDatos {
  vista: VistaDatosVisible
  /** La sección está plegada. */
  plegada: boolean
  onPlegada(plegada: boolean): void
  onCopiar(texto: string): void | Promise<void>
  /** Pide al proceso principal abrir un enlace en el navegador; solo ocurre con un clic. */
  onAbrir(url: string): void | Promise<unknown>
}

/** «Datos de la pieza»: encapsulado, patillas, huella, LCSC y hoja de datos de la fila que le toca a la pieza. */
export default function SeccionDatos(props: PropsSeccionDatos) {
  const [copiado, setCopiado] = createSignal('')
  const copiar = async (que: string, texto: string) => {
    try {
      await props.onCopiar(texto)
      setCopiado(que)
    } catch {
      setCopiado('')
    }
  }
  return (
    <details class="mas-ajustes seccion-datos" open={!props.plegada} onToggle={(e) => props.onPlegada(!e.currentTarget.open)}>
      <summary>{TEXTO_DATOS_TITULO}</summary>
      <Show when={props.vista.tipo === 'virtual'}>
        <p class="datos-linea">{TEXTO_DATOS_VIRTUAL}</p>
      </Show>
      <Show when={props.vista.tipo === 'sinFila'}>
        <p class="datos-linea">{TEXTO_DATOS_SIN_FILA}</p>
      </Show>
      <Show when={props.vista.tipo === 'fisica' && props.vista}>
        {(v) => (
          <>
            <dl class="datos-dl">
              <Show when={v().encapsulado}>
                <dt>Encapsulado</dt>
                <dd>
                  {v().encapsulado}
                  {v().montaje ? `, ${v().montaje}` : ''}
                  {v().tipico ? ` (${TEXTO_DATOS_TIPICO})` : ''}
                </dd>
              </Show>
              <Show when={v().parte}>
                <dt>Parte</dt>
                <dd>
                  {v().parte}
                  {v().fabricante ? `, ${v().fabricante}` : ''}
                </dd>
              </Show>
            </dl>
            <Show when={v().patillas.length > 0}>
              <table class="datos-tabla" aria-label="Patillas">
                <thead>
                  <tr>
                    <th scope="col">N.°</th>
                    <th scope="col">Patilla</th>
                    <Show when={v().patillas.some((p) => p.nota)}>
                      <th scope="col">Nota</th>
                    </Show>
                  </tr>
                </thead>
                <tbody>
                  <For each={v().patillas}>
                    {(p) => (
                      <tr classList={{ atenuada: p.atenuada }}>
                        <td class="cifra">{p.numero}</td>
                        <td>{p.nombre}</td>
                        <Show when={v().patillas.some((q) => q.nota)}>
                          <td>{p.nota ?? ''}</td>
                        </Show>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </Show>
            <Show when={v().unidades}>
              <p class="datos-linea secundario">{v().unidades}</p>
            </Show>
            <Show when={v().huella}>
              {(h) => (
                <div class="datos-fila">
                  <span class="datos-rotulo">Huella de KiCad</span>
                  <button type="button" class="boton" aria-label="Copiar la huella de KiCad" onClick={() => void copiar('huella', h())}>
                    Copiar
                  </button>
                  <code class="cifra datos-id">{h()}</code>
                </div>
              )}
            </Show>
            <Show when={v().lcsc}>
              {(l) => (
                <>
                  <div class="datos-fila">
                    <span class="datos-rotulo">LCSC</span>
                    <code class="cifra">{l().numero}</code>
                    <Show when={l().sinVerificar}>
                      <span class="datos-marca">{TEXTO_DATOS_SIN_VERIFICAR}</span>
                    </Show>
                    <button type="button" class="boton" aria-label="Copiar el número de LCSC" onClick={() => void copiar('lcsc', l().numero)}>
                      Copiar
                    </button>
                    <button type="button" class="boton" aria-label="Abrir la página de LCSC en el navegador" onClick={() => void props.onAbrir(enlaceDeLcsc(l().numero))}>
                      Abrir
                    </button>
                  </div>
                  <Show when={l().fecha}>
                    <p class="datos-linea secundario">LCSC {l().fecha}.</p>
                  </Show>
                </>
              )}
            </Show>
            <For each={v().avisos}>{(a) => <p class="datos-linea secundario">{a}</p>}</For>
            <Show when={v().hoja}>
              {(h) => (
                <>
                  <button type="button" class="boton datos-hoja" onClick={() => void props.onAbrir(h())}>
                    {TEXTO_DATOS_HOJA}
                  </button>
                  <p class="datos-linea secundario">{TEXTO_DATOS_HOJA_AVISO}</p>
                </>
              )}
            </Show>
          </>
        )}
      </Show>
      <p class="datos-linea secundario" role="status">
        {copiado() === 'huella' ? 'Huella copiada.' : copiado() === 'lcsc' ? 'Número de LCSC copiado.' : ''}
      </p>
    </details>
  )
}

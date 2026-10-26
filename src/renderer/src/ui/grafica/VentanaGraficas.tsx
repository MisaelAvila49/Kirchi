import { createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import type { ApiGraficas, DatosGraficas } from '../../../../compartido/graficas'
import GraficaCorrida from './GraficaCorrida'

interface Props {
  api: ApiGraficas | undefined
}

/**
 * Página de la ventana de gráficas. Aquí no hay documento: el aspecto vale mientras la ventana esté abierta y «Exportar…» pide al editor su diálogo.
 */
export default function VentanaGraficas(props: Props) {
  const [datos, setDatos] = createSignal<DatosGraficas | null>(null)
  const [elegida, setElegida] = createSignal<number | null>(null)
  const [aviso, setAviso] = createSignal<string | null>(null)
  const poner = (d: DatosGraficas) => {
    setDatos(d)
    document.documentElement.dataset.tema = d.tema
    setElegida((e) => (e !== null && d.corridas.some((c) => c.n === e) ? e : (d.elegida ?? d.corridas[0]?.n ?? null)))
  }
  onMount(() => {
    void props.api?.pedir().then((d) => (d ? poner(d) : setAviso('No hay gráficas que mostrar: ábrela de nuevo desde la ventana principal.')))
    const quitar = props.api?.alDatos(poner)
    onCleanup(() => quitar?.())
  })
  const actual = () => {
    const d = datos()
    return d?.corridas.find((c) => c.n === elegida()) ?? d?.corridas[0] ?? null
  }
  return (
    <main class="ventana-graficas">
      <h1 class="solo-lectores">Gráficas de los análisis</h1>
      <Show when={datos()} fallback={<p class="secundario" role="status">{aviso() ?? 'Cargando las gráficas…'}</p>}>
        {(d) => (
          <>
            <div id="vg-panel" class="gr-detalle vg-panel">
              <Show when={actual()} keyed>
                {(c) => (
                  <GraficaCorrida
                    corrida={{ nombre: c.nombre, analisis: c.analisis, mapeado: c.mapeado }}
                    tema={d().tema}
                    titulo={
                      <Show when={d().corridas.length > 1} fallback={<><b class="gr-barra-nombre">{c.nombre}</b> <span class="deriv">· Listo</span></>}>
                        <label class="osc-nombre">
                          <span class="solo-lectores">Corrida de análisis</span>
                          <select value={String(c.n)} onChange={(e) => setElegida(Number(e.currentTarget.value))}>
                            <For each={d().corridas}>{(k) => <option value={String(k.n)}>{k.nombre}</option>}</For>
                          </select>
                          <span class="deriv">· Listo</span>
                        </label>
                      </Show>
                    }
                    enVentana
                    onVentana={() => props.api?.acoplar(c.n)}
                    onExportar={(e) => {
                      props.api?.exportar({ n: c.n, ocultas: [...e.vista.ocultas] })
                      setAviso('El diálogo de exportar se abrió en la ventana principal.')
                    }}
                  />
                )}
              </Show>
              <Show when={aviso()}>
                <p class="deriv" role="status">
                  {aviso()}
                </p>
              </Show>
            </div>
          </>
        )}
      </Show>
    </main>
  )
}

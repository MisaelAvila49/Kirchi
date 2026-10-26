import { For, Match, Show, Switch } from 'solid-js'
import type { CorridaGuardada } from '../analisis/almacen'
import { NOMBRE_FICHA } from '../analisis/fichas'
import { formatearValor } from '../valores/valores'
import type { Tema } from '../../../compartido/ajustes'
import type { GraficaDoc } from '../../../compartido/grafica/aspecto'
import type { EntradaFigura } from './grafica/figura'
import GraficaCorrida from './grafica/GraficaCorrida'

interface Props {
  corridas: readonly CorridaGuardada[]
  seleccionada: CorridaGuardada | null
  corriendo: boolean
  onElegir(n: number): void
  onQuitar(n: number): void
  onLimpiar(): void
  /** Resalta en el lienzo la pieza de una fila de la tabla (opcional). */
  onPieza?(id: string): void
  tema: Tema
  /** Guarda el aspecto de la gráfica con el análisis de la corrida; devuelve por qué no se pudo (o null). */
  onGrafica?(c: CorridaGuardada, g: GraficaDoc | undefined): string | null
  onExportar?(e: EntradaFigura): void
  /** Abre las corridas en una ventana aparte. */
  onVentana?(): void
}

const ESTADO: Record<CorridaGuardada['estado'], string> = { corriendo: 'Ejecutando', listo: 'Listo', error: 'Con error', cancelado: 'Cancelado' }

const duracion = (ms: number | undefined): string => (ms === undefined ? '' : ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`)
/** Una cifra con prefijo SI y tres cifras significativas; el cero y lo ínfimo se dicen «0». */
const cifra = (v: number, unidad: string): string => (Math.abs(v) < 1e-15 ? `0 ${unidad}` : formatearValor(v, unidad))

/** La corrida con gráfica lleva su título, su estado y «Quitar» en la barra del instrumento (una sola fila); las demás, su cabeza propia. */
const conBarra = (c: CorridaGuardada): boolean => c.estado === 'listo' && !c.tabla && !!c.mapeado

/**
 * Pestaña Gráficas de la franja: una pestaña interna por corrida con su gráfica y, para el punto de operación, tablas. «Ventana» manda las corridas a una ventana aparte.
 */
export default function PanelGraficas(props: Props) {
  // Flechas, Inicio y Fin recorren las pestañas (una sola entra con Tab: la elegida).
  const teclaPestañas = (e: KeyboardEvent) => {
    const k = ['ArrowLeft', 'ArrowRight', 'Home', 'End', 'ArrowUp', 'ArrowDown'].indexOf(e.key)
    if (k < 0 || props.corridas.length === 0) return
    e.preventDefault()
    const i = Math.max(0, props.corridas.findIndex((c) => c.n === props.seleccionada?.n))
    const n = props.corridas.length
    const j = k === 0 || k === 4 ? (i - 1 + n) % n : k === 1 || k === 5 ? (i + 1) % n : k === 2 ? 0 : n - 1
    props.onElegir(props.corridas[j].n)
    queueMicrotask(() => document.getElementById(`gr-pestana-${props.corridas[j].n}`)?.focus())
  }
  return (
    <div class="panel-graficas">
      <Show when={props.corridas.length > 0} fallback={<p class="secundario">Sin corridas todavía. Ejecuta un análisis desde la pestaña Análisis.</p>}>
        <div class="gr-lista-caja">
          <div class="gr-acciones">
            <h3>Corridas</h3>
            <span class="gr-acciones-botones">
              <button type="button" class="boton" disabled={props.corridas.every((c) => c.estado === 'corriendo')} onClick={() => props.onLimpiar()}>
                Quitar las terminadas
              </button>
            </span>
          </div>
          <ol class="gr-lista" role="tablist" aria-orientation="vertical" aria-label="Corridas de análisis" onKeyDown={teclaPestañas}>
            <For each={props.corridas}>
              {(c) => (
                <li role="presentation">
                  <button
                    type="button"
                    role="tab"
                    id={`gr-pestana-${c.n}`}
                    class="gr-corrida"
                    aria-selected={props.seleccionada?.n === c.n}
                    aria-controls="gr-panel"
                    tabindex={props.seleccionada?.n === c.n ? 0 : -1}
                    data-estado={c.estado}
                    onClick={() => props.onElegir(c.n)}
                  >
                    <span class="gr-nombre">{c.nombre}</span>
                    <span class="deriv">
                      {NOMBRE_FICHA[c.tipo]} · {ESTADO[c.estado]}
                      {c.duracionMs !== undefined && c.estado !== 'corriendo' ? ` · ${duracion(c.duracionMs)}` : ''}
                    </span>
                  </button>
                </li>
              )}
            </For>
          </ol>
        </div>
        <Show when={props.seleccionada}>
          {(c) => (
            <div class="gr-detalle" id="gr-panel" role="tabpanel" aria-labelledby={`gr-pestana-${c().n}`}>
              <Show when={!conBarra(c())}>
                <div class="gr-cabeza">
                  <h3>
                    {c().nombre} <span class="deriv">· {ESTADO[c().estado]}</span>
                  </h3>
                  <Show when={c().estado !== 'corriendo'}>
                    <button type="button" class="boton" onClick={() => props.onQuitar(c().n)}>
                      Quitar esta corrida
                    </button>
                  </Show>
                </div>
              </Show>
              <Switch>
                <Match when={c().estado === 'corriendo'}>
                  <p class="secundario" role="status">
                    ngspice está calculando. Puedes cancelarlo desde la cinta.
                  </p>
                </Match>
                <Match when={c().estado === 'error'}>
                  <p class="fld-error" role="alert">
                    {c().error}
                  </p>
                </Match>
                <Match when={c().estado === 'cancelado'}>
                  <p class="secundario">Esta corrida se canceló y no dejó resultados.</p>
                </Match>
                <Match when={c().estado === 'listo'}>
                  <Show when={c().tabla}>
                    {(t) => (
                      <div class="gr-tablas">
                        <table class="gr-tabla">
                          <caption>Voltaje de cada red</caption>
                          <thead>
                            <tr>
                              <th scope="col">Red</th>
                              <th scope="col" class="num">
                                Voltaje
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            <For each={t().redes}>
                              {(r) => (
                                <tr>
                                  <th scope="row">{r.nombre}</th>
                                  <td class="num cifra">{cifra(r.voltaje, 'V')}</td>
                                </tr>
                              )}
                            </For>
                          </tbody>
                        </table>
                        <table class="gr-tabla">
                          <caption>Corriente y potencia de cada pieza</caption>
                          <thead>
                            <tr>
                              <th scope="col">Pieza</th>
                              <th scope="col" class="num">
                                Corriente
                              </th>
                              <th scope="col" class="num">
                                Potencia
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            <For each={t().piezas}>
                              {(p) => (
                                <tr>
                                  <th scope="row">{p.ref}</th>
                                  <td class="num cifra">{cifra(p.corriente, 'A')}</td>
                                  <td class="num cifra">{p.potencia === null ? 'sin dato' : cifra(p.potencia, 'W')}</td>
                                </tr>
                              )}
                            </For>
                          </tbody>
                        </table>
                        <p class="deriv gr-nota">La corriente es positiva si entra por el primer terminal de la pieza. La potencia es negativa si la pieza entrega.</p>
                      </div>
                    )}
                  </Show>
                  <Show when={!c().tabla && c().mapeado}>
                    <Show when={c()} keyed>
                      {(k) => (
                        <GraficaCorrida
                          corrida={{ nombre: k.nombre, analisis: k.analisis, mapeado: k.mapeado! }}
                          tema={props.tema}
                          titulo={
                            <>
                              <b class="gr-barra-nombre">{k.nombre}</b> <span class="deriv">· {ESTADO[k.estado]}</span>
                            </>
                          }
                          onQuitar={() => props.onQuitar(k.n)}
                          onGrafica={props.onGrafica ? (g) => props.onGrafica!(k, g) : undefined}
                          onExportar={props.onExportar}
                          onVentana={props.onVentana}
                        />
                      )}
                    </Show>
                  </Show>
                  <Show when={c().avisos.length > 0}>
                    <ul class="gr-avisos" aria-label="Avisos de la corrida">
                      <For each={c().avisos}>{(a) => <li>{a}</li>}</For>
                    </ul>
                  </Show>
                </Match>
              </Switch>
            </div>
          )}
        </Show>
      </Show>
    </div>
  )
}

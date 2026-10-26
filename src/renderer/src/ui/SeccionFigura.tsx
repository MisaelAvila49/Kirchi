import { createEffect, createSignal, For, on, Show } from 'solid-js'
import { GROSORES, NOMBRE_PUNTA, NOMBRE_TRAZO, OPACIDADES, PUNTAS, TRAZOS_FIGURA, type EstiloFigura } from '../doc/figuras'
import { NOMBRE_TINTA, TINTAS } from '../doc/formato'
import type { Trazo } from '../doc/tipos'
import type { VistaFigura } from './vistaFigura'

interface Props {
  vista: VistaFigura
  /** Qué figuras se editan (sus ids): al cambiar, los campos de medida descartan lo que se estaba escribiendo. */
  clave: string
  onEstilo(cambio: Partial<EstiloFigura>): void
  /** Ancho o alto en mm; devuelve el error para mostrarlo, o null si se aplicó. */
  onMedida(medida: 'ancho' | 'alto', texto: string): string | null
}

const pulsado = (si: boolean): 'true' | 'false' => (si ? 'true' : 'false')
const PATRON: Record<Trazo, string | undefined> = { continuo: undefined, guiones: '4 2.6', puntos: '0.01 2.6' }

/** Ancho o alto en mm: Enter o salir aplica, Esc regresa, y el error queda bajo el campo. */
function CampoMedida(props: { id: string; nombre: string; valor: number; clave: string; onAplicar(texto: string): string | null }) {
  const mostrado = () => `${props.valor} mm`
  const [texto, setTexto] = createSignal(mostrado())
  const [error, setError] = createSignal<string | null>(null)
  createEffect(on(() => [props.valor, props.clave], () => (setTexto(mostrado()), setError(null)), { defer: true }))
  const aplicar = () => {
    if (texto() === mostrado()) return setError(null)
    setError(props.onAplicar(texto()))
  }
  return (
    <div class="fld fld-campo">
      <label for={props.id}>{props.nombre}</label>
      <input
        id={props.id}
        class="campo cifra"
        value={texto()}
        aria-invalid={error() ? 'true' : undefined}
        aria-describedby={`${props.id}-ayuda`}
        onInput={(e) => setTexto(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            aplicar()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            setTexto(mostrado())
            setError(null)
          }
        }}
        onBlur={aplicar}
      />
      <p id={`${props.id}-ayuda`} class={error() ? 'campo-error' : 'campo-ayuda'} aria-live="polite">
        {error() ?? ''}
      </p>
    </div>
  )
}

/** La sección «Figura» del inspector: tinta, línea, relleno o punta y tamaño, para una o varias figuras. */
export default function SeccionFigura(props: Props) {
  const v = () => props.vista
  return (
    <>
      <h3 class="sec" id="figura-tinta">
        Tinta
      </h3>
      <div class="tintas-figura" role="group" aria-labelledby="figura-tinta">
        <For each={TINTAS}>
          {(t) => (
            <button type="button" class="tinta-figura" aria-pressed={pulsado(v().tinta === t)} onClick={() => props.onEstilo({ tinta: t })}>
              <span class="tinta-muestra" data-tinta={t} aria-hidden="true" />
              {NOMBRE_TINTA[t]}
            </button>
          )}
        </For>
      </div>
      <div class="fld fld-col">
        <span id="figura-opacidad">Opacidad</span>
        <div class="seg seg-figura" role="group" aria-labelledby="figura-opacidad">
          <For each={OPACIDADES}>
            {(o) => (
              <button type="button" class="cifra" aria-pressed={pulsado(v().opacidad === o)} onClick={() => props.onEstilo({ opacidad: o })}>
                {`${o} %`}
              </button>
            )}
          </For>
        </div>
      </div>
      <h3 class="sec">Línea</h3>
      <div class="fld fld-col">
        <span id="figura-grosor">Grosor</span>
        <div class="seg seg-figura" role="group" aria-labelledby="figura-grosor">
          <For each={GROSORES}>
            {(g) => (
              <button type="button" class="cifra" aria-label={`${g} mm`} aria-pressed={pulsado(v().grosor === g)} onClick={() => props.onEstilo({ grosor: g })}>
                {String(g)}
              </button>
            )}
          </For>
        </div>
      </div>
      <p class="campo-ayuda ayuda-figura">Grosores de pluma ISO 128, en mm.</p>
      <div class="fld fld-col">
        <span id="figura-trazo">Trazo</span>
        <div class="seg seg-figura" role="group" aria-labelledby="figura-trazo">
          <For each={TRAZOS_FIGURA}>
            {(z) => (
              <button type="button" aria-pressed={pulsado(v().trazo === z)} onClick={() => props.onEstilo({ trazo: z })}>
                <svg class="muestra-trazo" viewBox="0 0 22 6" aria-hidden="true">
                  <path d="M2 3 H20" stroke-dasharray={PATRON[z]} />
                </svg>
                {NOMBRE_TRAZO[z]}
              </button>
            )}
          </For>
        </div>
      </div>
      <Show when={v().relleno !== null}>
        <div class="fld">
          <span id="figura-relleno">Relleno suave{v().relleno === 'mixto' ? ' (en algunas)' : ''}</span>
          <button
            type="button"
            role="switch"
            class="interruptor-figura"
            aria-labelledby="figura-relleno"
            aria-checked={pulsado(v().relleno === true)}
            onClick={() => props.onEstilo({ relleno: v().relleno !== true })}
          >
            <span aria-hidden="true" />
          </button>
        </div>
      </Show>
      <Show when={v().punta !== null}>
        <div class="fld fld-col">
          <span id="figura-punta">Punta</span>
          <div class="seg seg-figura" role="group" aria-labelledby="figura-punta">
            <For each={PUNTAS}>
              {(p) => (
                <button type="button" aria-pressed={pulsado(v().punta === p)} onClick={() => props.onEstilo({ punta: p })}>
                  {NOMBRE_PUNTA[p]}
                </button>
              )}
            </For>
          </div>
        </div>
      </Show>
      <Show when={v().medidas}>
        {(m) => (
          <>
            <h3 class="sec">Tamaño</h3>
            <Show
              when={'ancho' in m() ? (m() as { ancho: number; alto: number }) : null}
              fallback={
                <div class="fld">
                  <span>Largo</span>
                  <span class="cifra">{(m() as { largo: number }).largo} mm</span>
                </div>
              }
            >
              {(c) => (
                <>
                  <CampoMedida id="figura-ancho" nombre="Ancho" valor={c().ancho} clave={props.clave} onAplicar={(t) => props.onMedida('ancho', t)} />
                  <CampoMedida id="figura-alto" nombre="Alto" valor={c().alto} clave={props.clave} onAplicar={(t) => props.onMedida('alto', t)} />
                </>
              )}
            </Show>
          </>
        )}
      </Show>
    </>
  )
}

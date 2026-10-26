import { For, Index, Show } from 'solid-js'
import { textoDeNumero, textoDeSerie } from '../../instrumentos/ajusteAutomatico'
import { BASE_RANGO, CANALES, MODOS_XY, NIVEL_MAX, POS_RANGO, VDIV_RANGO, type AjustesOsciloscopio, type Canal } from '../../instrumentos/ajustes'
import { formatearMedida } from '../../valores/valores'
import ControlNumero from './ControlNumero'
import ControlSerie from './ControlSerie'
import { encenderOtros, siguienteAcople, textoAcople, textoFuente, textoPosicion } from './mandos'

interface Props {
  ajustes: () => AjustesOsciloscopio
  /** De dónde mide cada entrada (`fuentesDeInstrumento`): «R1:2», «GND» o null. */
  fuentes: () => Readonly<Record<string, string | null>>
  /** «Disparado», «Esperando disparo», «Detenido»: el estado del disparo a la vista. */
  estadoDisparo: () => string
  /** Cambia una propiedad del osciloscopio (con `gesto`, varias son un solo paso de deshacer). */
  onAjuste(prop: string, texto: string, gesto?: string): void
  onRearmar(): void
}

const MODOS = [['Automático', 'Auto'], ['Normal', 'Normal'], ['Único', 'Único'], ['Rodante', 'Rodante']] as const
const k = (c: Canal) => c.toLowerCase()

/**
 * Columna de mandos. Se arma una sola vez (la ventana la crea con `untrack`) y lo que cambia se lee de señales, para que un ajuste simulando no rehaga los controles ni pierda el foco.
 */
export default function MandosOsciloscopio(props: Props) {
  const canal = (c: Canal) => props.ajustes().canales.find((x) => x.canal === c)!
  const apagados = () => CANALES.filter((c) => !canal(c).on)
  const disparo = () => props.ajustes().disparo
  const vdivFuente = () => canal(disparo().fuente).vdiv
  let raiz: HTMLDivElement | undefined
  /** Encender o apagar un canal quita el botón que tenía el foco: el foco pasa a su contraparte. */
  const alternarCanal = (c: Canal, encender: boolean) => {
    props.onAjuste(`${k(c)}_on`, encender ? 'encendido' : 'apagado')
    requestAnimationFrame(() => raiz?.querySelector<HTMLElement>(encender ? `.osc-canal-fila[data-canal='${c}'] .osc-canal-boton` : `.osc-apagados [data-canal='${c}']`)?.focus())
  }
  return (
    <div class="osc-mandos" ref={raiz}>
      <section class="osc-mando" aria-labelledby="osc-titulo-vdiv">
        <h3 id="osc-titulo-vdiv" class="osc-mando-titulo">
          Voltios/div
        </h3>
        <Index each={CANALES}>
          {(c) => (
            <Show when={canal(c()).on}>
              <div class="osc-canal-fila" data-canal={c()}>
                <div class="osc-canal-escala">
                  <button type="button" class="osc-canal-boton" aria-pressed="true" aria-label={`Canal ${c()}, encendido`} onClick={() => alternarCanal(c(), false)}>
                    {c()}
                  </button>
                  <ControlSerie
                    nombre={`Voltios por división del canal ${c()}`}
                    grande
                    valor={canal(c()).vdiv}
                    rango={VDIV_RANGO}
                    unidad="V"
                    onCambiar={(v) => props.onAjuste(`${k(c())}_vdiv`, textoDeSerie(v))}
                  />
                  <button type="button" class="osc-acople" aria-label={textoAcople(c(), canal(c()).acople)} onClick={() => props.onAjuste(`${k(c())}_acople`, siguienteAcople(canal(c()).acople))}>
                    {canal(c()).acople}
                  </button>
                  <span class="osc-fuente cifra" classList={{ suelta: !props.fuentes()[c()] }} title={props.fuentes()[c()] ? `La entrada ${c()} mide ${props.fuentes()[c()]}` : `La entrada ${c()} no está conectada`}>
                    {textoFuente(props.fuentes()[c()] ?? null)}
                  </span>
                </div>
                <div class="osc-canal-posicion">
                  <span class="control-etiqueta" aria-hidden="true">
                    Posición
                  </span>
                  <ControlNumero
                    nombre={`Posición del canal ${c()}`}
                    botones
                    valor={canal(c()).pos}
                    paso={0.2}
                    min={POS_RANGO[0]}
                    max={POS_RANGO[1]}
                    texto={textoPosicion}
                    onCambiar={(v) => props.onAjuste(`${k(c())}_pos`, textoDeNumero(v))}
                  />
                  <button type="button" class="boton-mini osc-al-centro" disabled={canal(c()).pos === 0} aria-label={`Llevar el canal ${c()} al centro`} onClick={() => props.onAjuste(`${k(c())}_pos`, '0')}>
                    al centro
                  </button>
                </div>
              </div>
            </Show>
          )}
        </Index>
        <Show when={apagados().length > 0}>
          <div class="osc-apagados">
            <For each={apagados()}>
              {(c) => (
                <button type="button" class="osc-canal-boton apagado" data-canal={c} aria-pressed="false" aria-label={`Canal ${c}, apagado`} onClick={() => alternarCanal(c, true)}>
                  {c}
                </button>
              )}
            </For>
            <span class="secundario">{encenderOtros(apagados())}</span>
          </div>
        </Show>
      </section>
      <section class="osc-mando" aria-labelledby="osc-titulo-base">
        <h3 id="osc-titulo-base" class="osc-mando-titulo">
          Tiempo/div
        </h3>
        <div class="osc-base">
          <ControlSerie nombre="Tiempo por división" grande valor={props.ajustes().base} rango={BASE_RANGO} unidad="s" onCambiar={(v) => props.onAjuste('base', textoDeSerie(v))} />
        </div>
        <label class="osc-campo osc-modo-xy">
          <span class="control-etiqueta">Pantalla</span>
          <select aria-label="Modo de la pantalla" value={modoXYDe(props.ajustes().modoXY)} onChange={(e) => props.onAjuste('modo_xy', e.currentTarget.value)}>
            <For each={Object.keys(MODOS_XY)}>{(m) => <option value={m}>{m === 'Y/T' ? 'Y/T (tiempo)' : m === 'B/A' ? 'B/A (A en X, B en Y)' : 'A/B (B en X, A en Y)'}</option>}</For>
          </select>
        </label>
      </section>
      <section class="osc-mando osc-disparo" aria-labelledby="osc-titulo-disparo">
        <div class="osc-mando-titulo">
          <h3 id="osc-titulo-disparo">Disparo</h3>
          <span class="osc-disparo-estado" role="status">
            {props.estadoDisparo()}
          </span>
        </div>
        <div class="osc-disparo-fila">
          <label class="osc-campo" data-canal={disparo().fuente}>
            <span class="solo-lectores">Fuente del disparo</span>
            <select value={disparo().fuente} onChange={(e) => props.onAjuste('disp_fuente', e.currentTarget.value)}>
              <For each={CANALES}>{(c) => <option value={c}>{c}</option>}</For>
            </select>
          </label>
          <label class="osc-campo">
            <span class="solo-lectores">Flanco del disparo</span>
            <select value={disparo().subida ? 'Subida' : 'Bajada'} onChange={(e) => props.onAjuste('disp_flanco', e.currentTarget.value)}>
              <option value="Subida">↑ Subida</option>
              <option value="Bajada">↓ Bajada</option>
            </select>
          </label>
          <ControlNumero
            nombre="Nivel del disparo"
            botones
            valor={disparo().nivel}
            paso={vdivFuente() / 10}
            min={-NIVEL_MAX}
            max={NIVEL_MAX}
            texto={(v) => formatearMedida(v, 'V', 3)}
            escribir="V"
            onCambiar={(v) => props.onAjuste('disp_nivel', textoDeNumero(v))}
          />
          <label class="osc-campo">
            <span class="solo-lectores">Modo del disparo</span>
            <select value={modoDe(disparo().modo)} onChange={(e) => props.onAjuste('disp_modo', e.currentTarget.value)}>
              <For each={MODOS}>{([v, t]) => <option value={v}>{t}</option>}</For>
            </select>
          </label>
          <Show when={disparo().modo === 'unico'}>
            <button type="button" class="boton" onClick={() => props.onRearmar()}>
              Rearmar
            </button>
          </Show>
        </div>
      </section>
    </div>
  )
}

/** El valor guardado de la propiedad `modo_xy` para cada modo. */
const modoXYDe = (m: AjustesOsciloscopio['modoXY']): string => (m === 'ba' ? 'B/A' : m === 'ab' ? 'A/B' : 'Y/T')

/** El valor guardado de la propiedad `disp_modo` para cada modo. */
const modoDe = (m: AjustesOsciloscopio['disparo']['modo']): string => (m === 'auto' ? 'Automático' : m === 'normal' ? 'Normal' : m === 'rodante' ? 'Rodante' : 'Único')

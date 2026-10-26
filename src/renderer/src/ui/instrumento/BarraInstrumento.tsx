import { createMemo, For, Show, type JSX } from 'solid-js'
import IconoCinta from '../cinta/IconoCinta'
import { aspectoDeBoton, atajoAria, BOTONES_BARRA, GRUPOS_BARRA, type AccionBarra } from './barra'

/** Lo que el instrumento dice de un botón: qué hace, si está encendido o desplegado y si se puede usar ahora. */
export interface EstadoBoton {
  onClick(): void
  /** `aria-pressed`: un botón de dos estados (Pausar, Cursores). */
  activo?: boolean
  /** `aria-expanded`: abre un panel (Más ajustes, Aspecto). */
  expandido?: boolean
  /** Los controles del panel que abre, mientras está abierto. */
  controla?: string
  deshabilitado?: boolean
  ref?(el: HTMLButtonElement): void
}

interface Props {
  /** «Barra del instrumento: OSC1». */
  etiqueta: string
  /** A la izquierda: el nombre del instrumento y su estado. */
  inicio?: JSX.Element
  /** Los botones que este instrumento tiene; el que falta no se dibuja (las gráficas no pausan). */
  botones: Partial<Record<AccionBarra, EstadoBoton>>
  /** En la ventana aparte, Pausar sigue y el botón de ventana pasa a «Acoplar». */
  enVentana?: boolean
  /** Entre los botones de Medir: «Ver detalles» de los cursores. */
  medirExtra?: JSX.Element
  /** Un botón propio del contenedor (Quitar esta corrida) en su grupo, justo antes de «Ventana», que siempre queda al borde derecho. */
  extraFin?: JSX.Element
}

/**
 * Barra del instrumento en grupos. Cada botón tiene nombre completo para el lector, globo con el atajo y `aria-pressed` o `aria-expanded`. Los colores salen de `data-tono` y los iconos planos de la cinta.
 */
export default function BarraInstrumento(props: Props) {
  // La estructura (qué grupos y qué botones) se calcula aparte y solo cambia si cambian los botones que hay: `props.botones` lee las
  // señales de la pantalla (unas 60 veces por segundo simulando), y si el `For` recibiera una lista nueva en cada lectura rehacería
  // los botones entre el «puntero abajo» y el «puntero arriba» de un clic, y el clic no llegaría nunca.
  const presentes = createMemo(() => (Object.keys(BOTONES_BARRA) as AccionBarra[]).filter((a) => props.botones[a]), undefined, { equals: (a, b) => a.join() === b.join() })
  const grupos = createMemo(() => GRUPOS_BARRA.map((g) => ({ ...g, acciones: presentes().filter((a) => BOTONES_BARRA[a].grupo === g.id) })).filter((g) => g.acciones.length > 0))
  const grupo = (g: { id: string; nombre: string; acciones: AccionBarra[] }) => (
    <div class="bi-grupo" role="group" aria-label={g.nombre}>
      <Show when={g.id === 'zoom'}>
        <span class="bi-rotulo" aria-hidden="true">
          Zoom
        </span>
      </Show>
      <For each={g.acciones}>
        {(a) => {
          const def = BOTONES_BARRA[a]
          const e = () => props.botones[a]!
          const v = () => aspectoDeBoton(a, { pausada: a === 'pausa' && e().activo === true, enVentana: props.enVentana })
          return (
            <>
              <button
                type="button"
                class="bi-boton"
                classList={{ 'bi-solo': !def.corto }}
                data-tono={def.tono}
                data-accion={a}
                aria-label={v().aria}
                aria-keyshortcuts={atajoAria(v().atajo)}
                aria-pressed={a === 'cursores' ? e().activo === true : undefined}
                aria-expanded={e().expandido === undefined ? undefined : e().expandido}
                aria-controls={e().expandido ? e().controla : undefined}
                aria-haspopup={a === 'exportar' ? 'dialog' : undefined}
                disabled={e().deshabilitado}
                ref={(el) => e().ref?.(el)}
                onClick={() => e().onClick()}
              >
                <IconoCinta nombre={v().icono} uso="grande" />
                <Show when={v().corto}>
                  <span class="bi-corto">{v().corto}</span>
                </Show>
                {/* El texto del globo va como contenido generado (CSS): no es texto del botón y su nombre accesible no cambia al mostrarse. */}
                <span class="bi-globo" aria-hidden="true" data-nombre={v().nombre} data-atajo={v().atajo} />
              </button>
              <Show when={a === 'cursores'}>{props.medirExtra}</Show>
            </>
          )
        }}
      </For>
    </div>
  )
  return (
    <div class="barra-instrumento" role="toolbar" aria-label={props.etiqueta}>
      <Show when={props.inicio}>
        <div class="bi-quien">{props.inicio}</div>
      </Show>
      <For each={grupos().filter((g) => g.id !== 'ventana')}>{(g) => grupo(g)}</For>
      <Show when={props.extraFin}>
        <div class="bi-grupo" role="group" aria-label="Corrida">
          {props.extraFin}
        </div>
      </Show>
      <For each={grupos().filter((g) => g.id === 'ventana')}>{(g) => grupo(g)}</For>
    </div>
  )
}

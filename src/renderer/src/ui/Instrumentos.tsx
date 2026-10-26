import { For, Match, onCleanup, onMount, Show, Switch, type JSX } from 'solid-js'
import IconoCinta from './cinta/IconoCinta'
import { ICONO_PESTAÑA, PESTAÑAS_FRANJA as PESTAÑAS, tonoDePestaña } from './franja'
import { IconoAbajo, IconoArriba, IconoNivel } from './iconos'
import { instalarTeclasDelRegistro, NIVELES_REGISTRO, nivelDelRegistro, type EntradaRegistro, type NivelRegistro } from './registro'
import SeparadorFranja from './SeparadorFranja'

const NOMBRE_NIVEL = Object.fromEntries(NIVELES_REGISTRO.map((n) => [n.id, n.nombre])) as Record<NivelRegistro, string>

/** Pestañas de la franja. */
export type Pestaña = 'osciloscopio' | 'graficas' | 'registro'

interface Props {
  abierta: boolean
  pestaña: Pestaña
  registro: EntradaRegistro[]
  /** Clic en una pestaña: la abre; en la activa con la franja abierta, la pliega. */
  onPestaña(p: Pestaña): void
  onAlternar(): void
  /** «Copiar todo» del Registro: sus mensajes al portapapeles. */
  onCopiarRegistro(): void
  /** «Borrar el registro»: lo vacía (el efecto lo anuncia la ventana). */
  onBorrarRegistro(): void
  /** Alto del panel abierto (px, ya acotado a la ventana) y el alto de la ventana, para el separador del borde. */
  alto: number
  altoVentana: number
  onAlto(alto: number, final: boolean): void
  /** El contenido de la pestaña Osciloscopio (el panel del osciloscopio), que se crea solo con la pestaña a la vista. */
  osciloscopio: () => JSX.Element
  /** Las corridas con sus resultados (se crean solo con su pestaña a la vista). La ficha de configuración vive en el riel derecho. */
  graficas?: () => JSX.Element
}

/**
 * Franja de instrumentos (30 px plegada). El Registro muestra errores de la librería, de operaciones rechazadas y de la vista previa.
 */
export default function Instrumentos(props: Props) {
  let lista!: HTMLDivElement
  let panel!: HTMLDivElement
  let mensajes: HTMLOListElement | undefined
  // Con el foco en el Registro, Ctrl+C es del texto seleccionado, Ctrl+A selecciona los mensajes y las teclas de edición
  // del lienzo (cortar, pegar, deshacer, borrar) no hacen nada: los atajos del lienzo no llegan a verlas.
  onMount(() => onCleanup(instalarTeclasDelRegistro(panel, () => props.pestaña === 'registro', () => mensajes)))
  const borrar = () => {
    props.onBorrarRegistro()
    // El botón desaparece con los mensajes: el foco queda en el panel del Registro, no en la nada.
    queueMicrotask(() => panel.focus())
  }
  const tecla = (e: KeyboardEvent) => {
    const i = PESTAÑAS.findIndex(([p]) => p === props.pestaña)
    const n = PESTAÑAS.length
    const j = e.key === 'ArrowRight' ? (i + 1) % n : e.key === 'ArrowLeft' ? (i + n - 1) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1
    if (j < 0) return
    // Las flechas de las pestañas son de las pestañas: ni el lienzo ni los atajos globales las ven.
    e.preventDefault()
    e.stopPropagation()
    props.onPestaña(PESTAÑAS[j][0])
    lista.querySelectorAll<HTMLElement>('[role=tab]')[j]?.focus()
  }
  return (
    <section class="instrumentos" classList={{ abierta: props.abierta }}>
      <Show when={props.abierta}>
        <SeparadorFranja alto={props.alto} altoVentana={props.altoVentana} onAlto={(a, f) => props.onAlto(a, f)} />
      </Show>
      <div class="instrumentos-barra">
        <div ref={lista} role="tablist" aria-label="Instrumentos" on:keydown={tecla}>
          <For each={PESTAÑAS}>
            {([id, nombre]) => (
              <button
                type="button"
                role="tab"
                id={`pestaña-${id}`}
                class="pestaña"
                data-tono={tonoDePestaña(id)}
                aria-selected={props.pestaña === id}
                aria-controls="instrumentos-panel"
                tabindex={props.pestaña === id ? 0 : -1}
                onClick={() => props.onPestaña(id)}
              >
                <IconoCinta nombre={ICONO_PESTAÑA[id]} uso="franja" />
                {nombre}
                <Show when={id === 'registro' ? nivelDelRegistro(props.registro) : null}>
                  {(nivel) => (
                    <span class="contador cifra" data-nivel={nivel()}>
                      <IconoNivel nivel={nivel()} />
                      {props.registro.length}
                      <span class="solo-lectores">{` ${props.registro.length === 1 ? 'mensaje' : 'mensajes'}, el más grave: ${NOMBRE_NIVEL[nivel()].toLowerCase()}`}</span>
                    </span>
                  )}
                </Show>
              </button>
            )}
          </For>
        </div>
        <Show when={!props.abierta}>
          <span class="instrumentos-nota">Plegada · se abre sola con un instrumento</span>
        </Show>
        <button type="button" class="boton-icono instrumentos-alternar" aria-label={props.abierta ? 'Plegar los instrumentos' : 'Abrir los instrumentos'} aria-expanded={props.abierta} onClick={() => props.onAlternar()}>
          {props.abierta ? <IconoAbajo /> : <IconoArriba />}
        </button>
      </div>
      <div
        id="instrumentos-panel"
        class="instrumentos-panel"
        role="tabpanel"
        aria-labelledby={`pestaña-${props.pestaña}`}
        tabindex="0"
        hidden={!props.abierta}
        ref={panel}
        style={{ height: `${props.alto}px` }}
      >
        <Switch>
          <Match when={props.pestaña === 'registro'}>
            <Show when={props.registro.length > 0} fallback={<p class="secundario">Sin mensajes. Aquí aparecen los errores y los avisos.</p>}>
              <div class="registro-acciones">
                <button type="button" class="boton" onClick={() => props.onCopiarRegistro()}>
                  Copiar todo
                </button>
                <button type="button" class="boton" onClick={borrar}>
                  Borrar el registro
                </button>
              </div>
              <ol ref={mensajes} class="registro" aria-label="Mensajes">
                <For each={[...props.registro].reverse()}>
                  {(e) => (
                    <li data-nivel={e.tipo}>
                      <IconoNivel nivel={e.tipo} />
                      <span class="cifra secundario">{e.hora}</span> <span class="solo-lectores">{NOMBRE_NIVEL[e.tipo]}: </span>
                      {e.texto}
                      <Show when={e.veces > 1}>
                        <span class="secundario"> (×{e.veces})</span>
                      </Show>
                    </li>
                  )}
                </For>
              </ol>
            </Show>
          </Match>
          <Match when={props.pestaña === 'osciloscopio' && props.abierta}>{props.osciloscopio()}</Match>
          <Match when={props.pestaña === 'graficas' && props.abierta && props.graficas}>{(f) => f()()}</Match>
        </Switch>
      </div>
    </section>
  )
}

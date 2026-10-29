import { For, Show } from 'solid-js'
import type { AvanceCapitulo } from '../../../../compartido/ajustes'
import Dialogo from '../Dialogo'
import { resumenDeCapitulo } from './avance'
import { CAPITULOS, minutosTotales } from './capitulos'

interface Props {
  avance: Readonly<Record<string, AvanceCapitulo>>
  onElegir(id: string, desde: number): void
  onCerrar(): void
}

/** El selector de capítulos de «Aprende Kirchi»: estado de cada uno y el botón para empezarlo, retomarlo o repetirlo. */
export default function SelectorTutorial(props: Props) {
  return (
    <Dialogo titulo="Aprende Kirchi" clase="tutorial-selector" onCerrar={props.onCerrar}>
      <p class="tutorial-selector-intro">Cuatro capítulos para conocer Kirchi, cada uno con su propio circuito. Los pasos se hacen en la aplicación real.</p>
      <ol class="tutorial-capitulos">
        <For each={CAPITULOS}>
          {(c) => {
            const r = () => resumenDeCapitulo(c, props.avance)
            return (
              <li classList={{ 'en-curso': r().estado === 'curso' }}>
                <span class="tutorial-numero" data-tono={c.tono} aria-hidden="true">
                  {c.numero}
                </span>
                <div class="tutorial-capitulo-texto">
                  <h3>{c.titulo}</h3>
                  <p class="tutorial-meta">
                    {c.minutos} min · {r().total} pasos. {c.resumen}
                  </p>
                  <p class="tutorial-descripcion">{c.descripcion}</p>
                  <p class="tutorial-estado" data-estado={r().estado}>
                    <Show when={r().estado === 'hecho'}>
                      <span aria-hidden="true">✓ </span>
                    </Show>
                    {r().etiqueta}
                  </p>
                  <Show when={r().estado === 'curso'}>
                    <div class="tutorial-mini" aria-hidden="true">
                      <b style={{ width: `${Math.round(r().fraccion * 100)}%` }} />
                    </div>
                  </Show>
                </div>
                <Show when={r().accion}>
                  {(accion) => (
                    <button
                      type="button"
                      class="boton"
                      classList={{ principal: r().estado === 'curso' }}
                      aria-label={`${accion()}: capítulo ${c.numero}, ${c.titulo}`}
                      data-capitulo={c.id}
                      onClick={() => props.onElegir(c.id, accion() === 'Continuar' ? r().paso : 0)}
                    >
                      {accion()}
                    </button>
                  )}
                </Show>
              </li>
            )
          }}
        </For>
      </ol>
      <div class="tutorial-selector-pie">
        <span>{minutosTotales()} minutos en total. Se puede salir en cualquier paso y retomar luego.</span>
        <button type="button" class="boton" onClick={props.onCerrar}>
          Cerrar
        </button>
      </div>
    </Dialogo>
  )
}

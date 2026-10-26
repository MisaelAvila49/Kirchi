import { modeloDe } from '../editor/colocar'
import { createMemo, createSignal, For, Show } from 'solid-js'
import type { PiezaDef } from '../piezas/tipos'
import { catalogo, type EntradaCatalogo } from './catalogo'
import { plural } from './proyecto'
import { crearGestoArrastre, type FaseArrastre } from './gestoArrastre'
import SimboloPieza from './SimboloPieza'

export type { FaseArrastre }

interface Props {
  lib: Map<string, PiezaDef>
  /** Clic: toma la pieza como al elegirla en el buscador. */
  onTomar(defId: string, valor?: string): void
  /** Arrastre hacia el lienzo, en coordenadas de ventana. */
  onArrastrar(defId: string, valor: string | undefined, e: PointerEvent, fase: FaseArrastre): void
  /** Enlace al panel Plantillas bajo las piezas (la lista vive allí); sin él (pruebas sin la API de plantillas) no se dibuja. */
  plantillas?: { total: number; onVer(): void }
}

/** Librería: buscador (acepta valor, «r 4k7») y categorías plegables con su número de piezas. */
export default function PanelLibreria(props: Props) {
  const [filtro, setFiltro] = createSignal('')
  const [plegadas, setPlegadas] = createSignal<ReadonlySet<string>>(new Set())
  const categorias = createMemo(() => catalogo(props.lib, filtro()))
  const abierta = (id: string) => filtro().trim() !== '' || !plegadas().has(id)
  const alternar = (id: string) =>
    setPlegadas((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const { iniciar, clicCon } = crearGestoArrastre()
  const clic = (e: EntradaCatalogo) => clicCon(() => props.onTomar(e.def.id, e.valor))
  return (
    <>
      <input class="campo" type="search" placeholder="Buscar… (r 4k7)" aria-label="Buscar en la librería, por ejemplo r 4k7" value={filtro()} onInput={(e) => setFiltro(e.currentTarget.value)} />
      <For each={categorias()}>
        {(c) => (
          <section class="categoria" data-tono={c.tono}>
            <h3 class="categoria-titulo">
              <button
                type="button"
                class="categoria-boton"
                aria-expanded={abierta(c.id)}
                aria-label={`${c.nombre} ${plural(c.piezas.length, 'pieza', 'piezas')}`}
                onClick={() => alternar(c.id)}
              >
                <span class="cat-nombre">
                  <span class="muestra" aria-hidden="true" />
                  {c.nombre}
                </span>{' '}
                <span class="cifra">{c.piezas.length}</span>
              </button>
            </h3>
            <Show when={abierta(c.id)}>
              <ul class="lista">
                <For each={c.piezas}>
                  {(e) => (
                    <li>
                      <button type="button" class="entrada pieza-libreria" onPointerDown={(ev) => iniciar(ev, (m, fase) => props.onArrastrar(e.def.id, e.valor, m, fase))} onClick={() => clic(e)}>
                        <span class="ficha-simbolo" aria-hidden="true">
                          <SimboloPieza def={e.def} />
                        </span>
                        <span>{e.def.nombre.es}</span>{' '}
                        <Show when={e.valor ?? modeloDe(e.def)}>
                          <span class="cifra secundario">{e.valor ?? modeloDe(e.def)}</span>
                        </Show>
                      </button>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </section>
        )}
      </For>
      <Show when={categorias().length === 0}>
        <p class="secundario" role="status">
          Ninguna pieza coincide con «{filtro()}».
        </p>
      </Show>
      <p class="pista-panel">Arrastra una pieza al lienzo o haz clic para colocarla.</p>
      <Show when={props.plantillas}>
        {(p) => (
          <button type="button" class="boton enlace-plantillas" onClick={() => p().onVer()}>
            Ver {plural(p().total, 'plantilla', 'plantillas')} en Plantillas
          </button>
        )}
      </Show>
    </>
  )
}

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
  /** Los grupos plegados («categoría/grupo»), que el ajuste recuerda; sin ellos el plegado vale mientras el panel esté abierto. */
  gruposPlegados?: readonly string[]
  onGruposPlegados?(ids: string[]): void
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
  const [gruposLocal, setGruposLocal] = createSignal<readonly string[]>([])
  const gruposPlegados = () => props.gruposPlegados ?? gruposLocal()
  const grupoAbierto = (id: string) => !gruposPlegados().includes(id)
  const alternarGrupo = (id: string) => {
    const n = grupoAbierto(id) ? [...gruposPlegados(), id] : gruposPlegados().filter((x) => x !== id)
    if (props.onGruposPlegados) props.onGruposPlegados(n)
    else setGruposLocal(n)
  }
  const { iniciar, clicCon } = crearGestoArrastre()
  const clic = (e: EntradaCatalogo) => clicCon(() => props.onTomar(e.def.id, e.valor))
  const Entrada = (p: { e: EntradaCatalogo }) => (
    <li>
      <button type="button" class="entrada pieza-libreria" onPointerDown={(ev) => iniciar(ev, (m, fase) => props.onArrastrar(p.e.def.id, p.e.valor, m, fase))} onClick={() => clic(p.e)}>
        <span class="ficha-simbolo" aria-hidden="true">
          <SimboloPieza def={p.e.def} />
        </span>
        <span>{p.e.def.nombre.es}</span>{' '}
        <Show when={p.e.valor ?? modeloDe(p.e.def)}>
          <span class="cifra secundario">{p.e.valor ?? modeloDe(p.e.def)}</span>
        </Show>
      </button>
    </li>
  )
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
                <For each={c.grupos ? c.sueltas : c.piezas}>{(e) => <Entrada e={e} />}</For>
              </ul>
              <For each={c.grupos}>
                {(g) => (
                  <div class="grupo-libreria">
                    <h4 class="grupo-titulo">
                      <button type="button" class="categoria-boton grupo-boton" aria-expanded={grupoAbierto(g.id)} aria-label={`${g.nombre} ${plural(g.piezas.length, 'pieza', 'piezas')}`} onClick={() => alternarGrupo(g.id)}>
                        <span class="cat-nombre">{g.nombre}</span> <span class="cifra">{g.piezas.length}</span>
                      </button>
                    </h4>
                    <Show when={grupoAbierto(g.id)}>
                      <ul class="lista">
                        <For each={g.piezas}>{(e) => <Entrada e={e} />}</For>
                      </ul>
                    </Show>
                  </div>
                )}
              </For>
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

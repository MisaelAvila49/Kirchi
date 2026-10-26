import { createEffect, createMemo, createSignal, For, on, onCleanup, onMount, Show } from 'solid-js'
import IconoCinta from './cinta/IconoCinta'
import Dialogo from './Dialogo'
import { filtrarMapa, pesoDeGrupo, repartirEnColumnas, type FilaMapa, type GrupoMapa, type MapaAtajos } from './hojaDeAtajos'

/** Las teclas de una fila: cada combinación con sus teclas y «+», las alternativas con «o»; un gesto, en palabras. */
function Teclas(props: { fila: FilaMapa }) {
  return (
    <Show when={!props.fila.gesto} fallback={<span class="secundario">{props.fila.gesto}</span>}>
      <Show when={props.fila.flechas} fallback={<Combinaciones fila={props.fila} />}>
        {(f) => (
          <span class="comb">
            <Show when={f().mod}>
              <kbd>{f().mod}</kbd>
              <span class="mas" aria-hidden="true">
                +
              </span>
            </Show>
            <span class="flechas" aria-hidden="true">
              <For each={f().teclas}>{(k) => <kbd>{k}</kbd>}</For>
            </span>
            <span class="solo-lectores">{props.fila.teclas.map((c) => c.at(-1)).join(', ')}</span>
          </span>
        )}
      </Show>
    </Show>
  )
}

/** Las combinaciones de una fila, con «o» entre las alternativas. */
function Combinaciones(props: { fila: FilaMapa }) {
  return (
    <>
      <For each={props.fila.teclas}>
        {(comb, i) => (
          <>
            <Show when={i() > 0}>
              <span class="o"> o </span>
            </Show>
            <span class="comb">
              <For each={comb}>
                {(k, j) => (
                  <>
                    <Show when={j() > 0}>
                      <span class="mas" aria-hidden="true">
                        +
                      </span>
                    </Show>
                    <kbd>{k}</kbd>
                  </>
                )}
              </For>
            </span>
          </>
        )}
      </For>
    </>
  )
}

/** Ancho de la lista desde el que caben tres columnas sin partir los nombres largos («Lienzo limpio (ocultar…)»). */
export const ANCHO_TRES_COLUMNAS = 1180
/** Por debajo de este ancho, una sola columna. */
export const ANCHO_DOS_COLUMNAS = 620

/** Una sección: su encabezado con el icono del grupo y una fila por orden (icono, nombre y lugar, teclas a la derecha). */
function Seccion(props: { g: GrupoMapa }) {
  return (
    <section data-grupo={props.g.id} aria-labelledby={`hoja-${props.g.id}`}>
      <h3 id={`hoja-${props.g.id}`}>
        <IconoCinta nombre={props.g.icono} uso="chico" />
        {props.g.nombre}
      </h3>
      <dl>
        <For each={props.g.filas}>
          {(f) => (
            <div class="fila-atajo">
              <dt>
                <span class="ic-atajo" aria-hidden="true">
                  <Show when={f.icono}>{(n) => <IconoCinta nombre={n()} uso="chico" />}</Show>
                </span>
                <span class="nombre-atajo">
                  {f.nombre}
                  <Show when={f.lugar}>
                    <span class="lugar-atajo">{f.lugar}</span>
                  </Show>
                </span>
              </dt>
              <dd>
                <Teclas fila={f} />
              </dd>
            </div>
          )}
        </For>
      </dl>
    </section>
  )
}

/**
 * Hoja de atajos: teclas solas, filtros por grupo y lista en columnas. Solo lectura, sale del registro real (`mapaDeAtajos`).
 */
export default function HojaAtajos(props: { mapa: MapaAtajos; onCerrar(): void; onCambiar(): void }) {
  const [grupo, setGrupo] = createSignal<string | null>(null)
  const [texto, setTexto] = createSignal('')
  const [nColumnas, setNColumnas] = createSignal(2)
  /** Alto medido de cada sección (los nombres largos se parten en dos renglones): con él las columnas quedan parejas. */
  const [altos, setAltos] = createSignal<Readonly<Record<string, number>>>({})
  const grupos = createMemo(() => filtrarMapa(props.mapa, grupo(), texto()))
  const columnas = createMemo(() => {
    const gs = grupos()
    const a = altos()
    return repartirEnColumnas(gs.map((g) => a[`${g.id}:${g.filas.length}`] ?? pesoDeGrupo(g) * 28), nColumnas()).map((ids) => ids.map((i) => gs[i]))
  })
  let lista!: HTMLDivElement
  // Tras dibujar, se miden las secciones; todas las columnas tienen el mismo ancho, así que repartir otra vez no cambia sus
  // altos y la medición se asienta en una vuelta.
  createEffect(
    on([columnas, nColumnas], () => {
      const id = requestAnimationFrame(() => {
        const medidos: Record<string, number> = { ...altos() }
        let cambio = false
        for (const g of grupos()) {
          const el = lista.querySelector<HTMLElement>(`section[data-grupo="${g.id}"]`)
          if (!el) continue
          const k = `${g.id}:${g.filas.length}`
          const h = el.getBoundingClientRect().height + 18
          if (Math.abs((medidos[k] ?? -99) - h) > 1) {
            medidos[k] = h
            cambio = true
          }
        }
        if (cambio) setAltos(medidos)
      })
      onCleanup(() => cancelAnimationFrame(id))
    })
  )
  let anchoMedido = -1
  onMount(() => {
    const medir = () => {
      const w = lista.clientWidth
      const n = w >= ANCHO_TRES_COLUMNAS ? 3 : w >= ANCHO_DOS_COLUMNAS ? 2 : 1
      // Con otro ancho (o número de columnas) los altos medidos ya no valen.
      if (n !== nColumnas() || Math.abs(w - anchoMedido) > 4) {
        anchoMedido = w
        setAltos({})
      }
      setNColumnas(n)
    }
    medir()
    if (typeof ResizeObserver === 'function') {
      const ro = new ResizeObserver(medir)
      ro.observe(lista)
      onCleanup(() => ro.disconnect())
    }
  })
  const buscador = (
    <div class="buscar-hoja">
      <IconoCinta nombre="buscar" />
      <input
        type="search"
        data-autofoco=""
        placeholder="Buscar una orden o una tecla"
        aria-label="Buscar una orden o una tecla"
        aria-controls="hoja-lista"
        value={texto()}
        onInput={(e) => setTexto(e.currentTarget.value)}
      />
    </div>
  )
  return (
    <Dialogo titulo="Atajos de teclado" clase="hoja-atajos hoja-a2" onCerrar={props.onCerrar} cabeza={buscador}>
      <section class="teclas-solas" aria-labelledby="hoja-solas">
        <h3 id="hoja-solas">Con una sola tecla</h3>
        <ul>
          <For each={props.mapa.solas}>
            {(s) => (
              <li>
                <span class="tecla-grande">
                  <Show when={s.icono}>
                    {(n) => (
                      <span class="ic-tecla" aria-hidden="true">
                        <IconoCinta nombre={n()} uso="chico" />
                      </span>
                    )}
                  </Show>
                  <kbd>{s.tecla}</kbd>
                </span>
                <span>{s.nombre}</span>
              </li>
            )}
          </For>
        </ul>
      </section>
      <div class="filtros-hoja" role="group" aria-label="Mostrar">
        <button type="button" aria-pressed={grupo() === null ? 'true' : 'false'} onClick={() => setGrupo(null)}>
          Todas <span class="cifra">{props.mapa.total}</span>
        </button>
        <For each={props.mapa.grupos}>
          {(g) => (
            <button type="button" aria-pressed={grupo() === g.id ? 'true' : 'false'} onClick={() => setGrupo(grupo() === g.id ? null : g.id)}>
              {g.corto} <span class="cifra">{g.filas.length}</span>
            </button>
          )}
        </For>
      </div>
      <div ref={lista} id="hoja-lista" class="hoja-lista" tabindex="0" role="region" aria-label="Lista de atajos" style={{ '--columnas': String(nColumnas()) }}>
        <For each={columnas()}>
          {(col) => (
            <div class="hoja-columna">
              <For each={col}>{(g) => <Seccion g={g} />}</For>
            </div>
          )}
        </For>
        <Show when={grupos().length === 0}>
          <p class="secundario" role="status">
            Ninguna orden coincide.
          </p>
        </Show>
      </div>
      <div class="hoja-pie">
        <span class="secundario">Son las teclas vigentes. Se cambian en Configuración › Atajos.</span>
        <button type="button" class="boton" onClick={() => props.onCambiar()}>
          <IconoCinta nombre="configuracion" uso="chico" />
          Cambiar los atajos
        </button>
      </div>
    </Dialogo>
  )
}

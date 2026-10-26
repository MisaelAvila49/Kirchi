import { createEffect, createMemo, createSignal, For, on, onMount, Show } from 'solid-js'
import { buscar, type Resultado } from '../buscador/buscar'
import { modeloDe, nombreConModelo, propDelBuscador, propModelo } from '../editor/colocar'
import type { PiezaDef } from '../piezas/tipos'
import { filtrarPlantillas, type ItemPlantilla } from '../plantillas/almacen'
import { serieElegida } from '../valores/serieElegida'
import { vistaSerie } from '../valores/vistaSerie'
import { posicionBuscador, vistaPrevia } from './buscadorUtil'
import { MiniaturaPlantilla } from './MiniaturaPlantilla'

/** Una fila del buscador: una pieza o una plantilla (estas, después de las piezas y solo con palabras de 3 letras o más). */
type Fila = { tipo: 'pieza'; r: Resultado } | { tipo: 'plantilla'; i: ItemPlantilla }
const idFila = (f: Fila): string => (f.tipo === 'pieza' ? `res-${f.r.def.id}${f.r.valor ? `-${f.r.valor.replace(/[^A-Za-z0-9_-]/g, '_')}` : ''}` : `res-plantilla-${f.i.clave.replace(/[^A-Za-z0-9_-]/g, '_')}`)
const MAX_PLANTILLAS = 5

interface Props {
  lib: Map<string, PiezaDef>
  recientes: string[]
  /** Punto de colocación en coordenadas de ventana. */
  x: number
  y: number
  onElegir(defId: string, valor?: string): void
  /** Plantillas que el buscador también encuentra, y qué hacer al elegir una. */
  plantillas?: readonly ItemPlantilla[]
  onElegirPlantilla?(item: ItemPlantilla): void
  onCerrar(): void
}

export default function Buscador(props: Props) {
  const [consulta, setConsulta] = createSignal('')
  const [indice, setIndice] = createSignal(0)
  const piezas = createMemo(() => buscar(consulta(), props.lib, props.recientes))
  const plantillas = createMemo(() => {
    const q = consulta().trim()
    if (!q || !props.plantillas || !props.onElegirPlantilla || q.split(/\s+/).some((w) => w.length < 3)) return []
    return filtrarPlantillas(props.plantillas, q).slice(0, MAX_PLANTILLAS)
  })
  const resultados = createMemo<Fila[]>(() => [...piezas().map((r): Fila => ({ tipo: 'pieza', r })), ...plantillas().map((i): Fila => ({ tipo: 'plantilla', i }))])
  const actual = (): Fila | undefined => resultados()[Math.min(indice(), resultados().length - 1)]
  createEffect(on(consulta, () => setIndice(0), { defer: true }))
  // Con flechas la opción activa puede quedar fuera de la lista visible.
  createEffect(() => {
    const r = actual()
    if (r) document.getElementById(idFila(r))?.scrollIntoView({ block: 'nearest' })
  })
  let campo!: HTMLInputElement
  onMount(() => campo.focus())
  const pos = posicionBuscador(props.x, props.y, window.innerWidth, window.innerHeight)
  const elegir = (f: Fila | undefined, valor?: string) => {
    if (!f) return
    if (f.tipo === 'plantilla') props.onElegirPlantilla?.(f.i)
    else props.onElegir(f.r.def.id, valor ?? f.r.valor)
  }
  const tecla = (e: KeyboardEvent) => {
    const n = resultados().length
    if (e.key === 'ArrowDown') setIndice((i) => Math.min(i + 1, Math.max(n - 1, 0)))
    else if (e.key === 'ArrowUp') setIndice((i) => Math.max(i - 1, 0))
    else if (e.key === 'Enter') elegir(actual())
    else if (e.key === 'Escape') props.onCerrar()
    else return
    e.preventDefault()
  }
  // La lista y los botones no toman el foco: el campo lo conserva y el diálogo no se cierra al hacer clic.
  const sinFoco = (e: MouseEvent) => e.preventDefault()
  return (
    <div
      class="buscador"
      role="dialog"
      aria-label="Agregar pieza"
      style={{ left: `${pos.left}px`, top: `${pos.top}px` }}
      onFocusOut={(e) => {
        // Al cambiar de ventana (Alt+Tab) el foco se pierde sin que el usuario haya cerrado nada.
        if (!document.hasFocus()) return
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) props.onCerrar()
      }}
    >
      <div class="buscador-lista">
        <input
          ref={campo}
          class="buscador-campo"
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls="buscador-resultados"
          aria-autocomplete="list"
          aria-activedescendant={actual() ? idFila(actual()!) : undefined}
          aria-label="Buscar pieza o plantilla por nombre y valor, por ejemplo r 4k7"
          placeholder="Pieza y valor: r 4k7"
          value={consulta()}
          onInput={(e) => setConsulta(e.currentTarget.value)}
          onKeyDown={tecla}
        />
        <ul id="buscador-resultados" role="listbox" aria-label="Piezas y plantillas">
          <For each={resultados()}>
            {(f, i) => (
              <li id={idFila(f)} role="option" aria-selected={f === actual()} classList={{ 'fila-plantilla': f.tipo === 'plantilla' }} onMouseDown={sinFoco} onMouseEnter={() => setIndice(i())} onClick={() => elegir(f)}>
                {f.tipo === 'pieza' ? (
                  <>
                    <span>{f.r.def.nombre.es}</span>
                    <Show when={f.r.valor ?? modeloDe(f.r.def)}>
                      <span class="cifra">{f.r.valor ?? modeloDe(f.r.def)}</span>
                    </Show>
                  </>
                ) : (
                  <>
                    <span>{f.i.nombre}</span>
                    <span class="secundario">Plantilla</span>
                  </>
                )}
              </li>
            )}
          </For>
        </ul>
        <Show when={resultados().length === 0}>
          <p class="buscador-vacio" role="status">Ninguna pieza coincide con «{consulta()}».</p>
        </Show>
      </div>
      {/* keyed: cada fila elegida monta sus detalles de nuevo (una pieza y una plantilla no comparten forma). */}
      <Show when={actual()} keyed>
        {(fila) => (fila.tipo === 'pieza' ? <Detalles r={fila.r} sinFoco={sinFoco} onElegir={(v) => elegir(fila, v)} /> : <DetallesPlantilla i={fila.i} />)}
      </Show>
    </div>
  )
}

function DetallesPlantilla(props: { i: ItemPlantilla }) {
  return (
    <section class="buscador-detalles" aria-label={`Detalles de la plantilla ${props.i.nombre}`}>
      <h2>{props.i.nombre}</h2>
      <MiniaturaPlantilla vista={props.i.vista} clase="grande" />
      <p class="secundario">{props.i.categoria}</p>
      <Show when={props.i.descripcion}>
        <p>{props.i.descripcion}</p>
      </Show>
      <p class="secundario">Se coloca como un grupo de piezas.</p>
    </section>
  )
}

function Detalles(props: { r: Resultado; sinFoco(e: MouseEvent): void; onElegir(valor?: string): void }) {
  const v = () => vistaPrevia(props.r.def.geometria)
  const prop = () => propDelBuscador(props.r.def)
  // Una pieza con modelos ofrece sus modelos como opciones.
  const comunes = () => prop()?.comunes ?? (propModelo(props.r.def) === prop() ? (prop()?.opciones ?? []) : [])
  // «r 15k»: si la pieza tiene serie comercial, dice si el valor escrito lo es y ofrece los vecinos.
  const serie = () => {
    const s = prop()?.serie
    return s === 'elegida' ? serieElegida() : s
  }
  const vistaDeSerie = () => (props.r.valor && prop()?.unidad && serie() ? vistaSerie(props.r.valor, prop()!.unidad!, serie()!) : null)
  // En un terminal de alimentación los comunes son nombres («+15V», «VEE»), no valores.
  const titulo = () => (prop()?.texto ? 'Nombres comunes' : propModelo(props.r.def) === prop() ? 'Modelos' : 'Valores comunes')
  return (
    <section class="buscador-detalles" aria-label={`Detalles de ${props.r.def.nombre.es}`}>
      <h2>{nombreConModelo(props.r.def, props.r.valor)}</h2>
      <svg class="buscador-simbolo" viewBox={v().viewBox} aria-hidden="true">
        <For each={v().triangulos}>{(t) => <polygon points={t} />}</For>
        <For each={v().lineas}>{(l) => <polyline points={l} />}</For>
      </svg>
      <p class="secundario">Pines: {props.r.def.pines.map((p) => p.nombre).join(', ')}</p>
      <Show when={vistaDeSerie()}>
        {(v) => (
          <>
            <p class="nota-serie buscador-nota" classList={{ aviso: v().nota.tipo === 'aviso' }} role="status">
              <span>{v().nota.texto}</span>
            </p>
            <Show when={v().vecinos.length > 0}>
              <p class="secundario">Valores cercanos en {serie()}</p>
              <div class="chips" role="group" aria-label={`Valores de ${serie()} cercanos`}>
                <For each={v().vecinos}>
                  {(c) => (
                    <button type="button" class="chip cifra" aria-pressed={c.activo} onMouseDown={props.sinFoco} onClick={() => props.onElegir(c.texto)}>
                      {c.etiqueta}
                    </button>
                  )}
                </For>
              </div>
            </Show>
          </>
        )}
      </Show>
      <Show when={comunes().length > 0 && !vistaDeSerie()}>
        <p class="secundario">{titulo()}</p>
        <div class="chips" role="group" aria-label={titulo()}>
          <For each={comunes()}>
            {(c) => (
              <button type="button" class="chip cifra" onMouseDown={props.sinFoco} onClick={() => props.onElegir(c)}>
                {c}
              </button>
            )}
          </For>
        </div>
      </Show>
    </section>
  )
}

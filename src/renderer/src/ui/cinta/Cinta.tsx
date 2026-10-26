import { createEffect, createSignal, For, on, onCleanup, onMount, Show } from 'solid-js'
import type { PestañaCinta } from '../../../../compartido/ajustes'
import ControlZoom from '../ControlZoom'
import { crecerMientrasQuepa, ordenDeCrecimiento, ordenDePlegado, plegarHastaCaber } from './ajustar'
import BotonCinta, { type ContextoBotones } from './BotonCinta'
import { DECISIONES } from './decisiones'
import GrupoCinta from './GrupoCinta'
import type { IdComando } from './comandos'
import ControlTamaño from './ControlTamano'
import { esControl, gruposConSeleccion, PESTAÑAS, type Columna, type DefPestaña } from './modelo'
import { instalarFocoItinerante, normalizarFoco, siguientePestaña } from './navegacion'

// Los ids del DOM van sin «ñ» (cinta-pestana-…) para que funcionen en selectores sin escapar.
export const idPestaña = (p: PestañaCinta): string => `cinta-pestana-${p}`
export const idPanel = (p: PestañaCinta): string => `cinta-panel-${p}`

export interface PropsZoom {
  pct: number
  onZoom(pct: number): void
  onAviso(texto: string): void
}

interface PropsPestañas {
  pestaña: PestañaCinta
  plegada: boolean
  /** Plegada y abierta encima del lienzo. */
  flotante: boolean
  onElegir(p: PestañaCinta): void
  onFlotante(abrir: boolean): void
  /** Doble clic: pliega o fija la cinta. */
  onPlegar(): void
  /** Lleva el foco al control de la barra de la pestaña elegida. */
  onEntrar(): void
}

/** Pestañas de la cinta (patrón de pestañas de WAI-ARIA). */
export function PestañasCinta(props: PropsPestañas) {
  let lista!: HTMLDivElement
  // Foco itinerante: la pestaña con tabIndex 0 es la elegida, y plegada (donde las flechas solo mueven el foco) la última
  // a la que se llegó, para que Tab y Shift+Tab vuelvan a ella.
  const [itinerante, setItinerante] = createSignal(props.pestaña)
  createEffect(on(() => props.pestaña, (p) => setItinerante(p)))
  const tabs = () => [...lista.querySelectorAll<HTMLElement>('[role="tab"]')]
  const tecla = (e: KeyboardEvent) => {
    const t = tabs()
    const i = t.indexOf(document.activeElement as HTMLElement)
    if (i < 0) return
    const j = siguientePestaña(t.length, i, e.key)
    if (j !== null) {
      e.preventDefault()
      // Fija: la pestaña se elige al llegar (activación automática). Plegada: solo se mueve el foco.
      if (!props.plegada) props.onElegir(PESTAÑAS[j].id)
      setItinerante(PESTAÑAS[j].id)
      t[j].focus()
    } else if ((e.key === 'Enter' || e.key === ' ') && props.plegada) {
      e.preventDefault()
      props.onElegir(PESTAÑAS[i].id)
      props.onFlotante(true)
      queueMicrotask(() => props.onEntrar())
    } else if (e.key === 'ArrowDown' && (!props.plegada || props.flotante)) {
      e.preventDefault()
      props.onEntrar()
    }
  }
  return (
    <div ref={lista} role="tablist" aria-label="Cinta" class="pestañas-cinta" onKeyDown={tecla}>
      <For each={PESTAÑAS}>
        {(p) => (
          <button
            type="button"
            role="tab"
            id={idPestaña(p.id)}
            aria-controls={idPanel(p.id)}
            aria-selected={p.id === props.pestaña}
            tabIndex={p.id === itinerante() ? 0 : -1}
            onClick={() => {
              const ya = p.id === props.pestaña
              props.onElegir(p.id)
              if (props.plegada) props.onFlotante(!(ya && props.flotante))
            }}
            onDblClick={() => props.onPlegar()}
          >
            {p.nombre}
          </button>
        )}
      </For>
    </div>
  )
}

/** Ancho libre a la derecha tras crecer un grupo, para no cambiar la cinta a 1280 px. */
export const HOLGURA_CRECER = 40

interface PropsCuerpo {
  pestaña: PestañaCinta
  plegada: boolean
  flotante: boolean
  ctx: ContextoBotones
  zoom: PropsZoom
  /** Flecha arriba desde un control: el foco vuelve a la pestaña elegida. */
  onSubir(): void
}

/** Una columna: un botón grande o una pila de chicos (grandes en un grupo crecido). */
function ColumnaCinta(props: { columna: Columna; ctx: ContextoBotones; zoom: PropsZoom; amplio: boolean }) {
  const c = props.columna
  if (c.tipo === 'grande') return <BotonCinta id={c.id} tamaño="grande" ctx={props.ctx} />
  // Cuadrícula de botones solo con icono (Editar y las piezas menores de Colocar): `filas` de alto, con las columnas que haga falta.
  if (c.tipo === 'iconos')
    return (
      <div class="cuadricula" style={{ '--filas': String(c.filas) }} role="group" aria-label="Más órdenes">
        <For each={c.ids}>{(id) => <BotonCinta id={id} tamaño="solo-icono" ctx={props.ctx} />}</For>
      </div>
    )
  if (c.tipo === 'texto') return <p class="texto-grupo">{c.texto}</p>
  // Avanzar en el tiempo: el botón del menú arriba y, debajo, Retroceder y Avanzar lado a lado, solo con icono (24 px cada fila).
  if (c.tipo === 'par')
    return (
      <div class="pila par" classList={{ amplia: props.amplio }}>
        <BotonCinta id={c.arriba} tamaño="chico" ctx={props.ctx} />
        <div class="fila-par">
          <For each={c.abajo}>{(id) => <BotonCinta id={id} tamaño="solo-icono" ctx={props.ctx} />}</For>
        </div>
      </div>
    )
  const ids = c.ids
  if (!ids.some(esControl))
    return (
      // Los mismos botones cambian de tamaño (no se vuelven a crear): el foco y el que recuerda la barra no se pierden al crecer.
      <div class="pila" classList={{ amplia: props.amplio }}>
        <For each={ids}>{(id) => <BotonCinta id={id as IdComando} tamaño={props.amplio ? 'grande' : 'chico'} ctx={props.ctx} />}</For>
      </div>
    )
  return (
    <div class="pila">
      <For each={c.ids}>
        {(id) =>
          id === 'control-tamano' ? (
            <ControlTamaño ctx={props.ctx} />
          ) : id === 'control-zoom' ? (
            <Show when={DECISIONES.zoomEn !== 'estado'}>
              <ControlZoom
                pct={props.zoom.pct}
                onZoom={(p) => props.zoom.onZoom(p)}
                onAviso={(t) => props.zoom.onAviso(t)}
                onPaso={(d, b) => props.ctx.onEjecutar(d > 0 ? 'zoom-mas' : 'zoom-menos', b)}
              />
            </Show>
          ) : (
            <BotonCinta id={id} tamaño="chico" ctx={props.ctx} />
          )
        }
      </For>
    </div>
  )
}

/** Cuerpo de la cinta: un panel por pestaña, cada uno una barra de herramientas con sus grupos, que se pliegan por prioridad. */
export function CuerpoCinta(props: PropsCuerpo) {
  const [plegados, setPlegados] = createSignal<ReadonlySet<string>>(new Set())
  /** Grupos crecidos: sobra ancho y nada está plegado. */
  const [ampliados, setAmpliados] = createSignal<ReadonlySet<string>>(new Set())
  const barras = new Map<PestañaCinta, HTMLDivElement>()
  let cuerpo!: HTMLDivElement
  /** Los grupos de una pestaña; en Inicio, el último cambia con la selección y lleva su nombre. */
  const gruposDe = (p: DefPestaña) => gruposConSeleccion(p, props.ctx.estado().seleccionTipo ?? 'nada', props.ctx.estado().seleccionTitulo ?? '')
  /** Abre todos los grupos de la pestaña visible y los pliega por prioridad hasta que la barra cabe. */
  const ajustar = () => {
    const p = PESTAÑAS.find((x) => x.id === props.pestaña)
    const tb = p && barras.get(p.id)
    if (!p || !tb || tb.clientWidth === 0) return
    // Cada grupo se mide plegado y abierto: el que plegado no gana ancho no entra al orden.
    const gs0 = gruposDe(p)
    const grupos = gs0.map((g) => tb.querySelector<HTMLElement>(`[data-grupo="${g.id}"]`))
    const medir = () => grupos.map((el) => el?.getBoundingClientRect().width ?? 0)
    setAmpliados(new Set<string>())
    setPlegados(new Set(gs0.map((g) => g.id)))
    const plegadosPx = medir()
    setPlegados(new Set<string>())
    const abiertosPx = medir()
    const orden = ordenDePlegado(gs0.map((g) => g.prioridad), abiertosPx, plegadosPx).map((i) => gs0[i].id)
    const cabe = () => tb.scrollWidth <= tb.clientWidth + 1
    const plegadosN = plegarHastaCaber(orden.length, (k) => setPlegados(new Set(orden.slice(0, k))), cabe)
    // Sin nada plegado, el ancho que sobra lo toman los grupos que crecen, de uno en uno; el que desborda se deshace.
    if (plegadosN === 0) {
      const crecen = ordenDeCrecimiento(gs0.map((g) => g.crecer)).map((i) => gs0[i].id)
      const gs = [...tb.querySelectorAll<HTMLElement>(':scope > .grupo')]
      const holgura = () => tb.getBoundingClientRect().right - Math.max(0, ...gs.map((g) => g.getBoundingClientRect().right))
      crecerMientrasQuepa(crecen.length, (k) => setAmpliados(new Set(crecen.slice(0, k))), () => cabe() && holgura() >= HOLGURA_CRECER)
    }
    normalizarFoco(tb)
  }
  onMount(() => {
    const ro = new ResizeObserver(() => ajustar())
    ro.observe(cuerpo)
    const quitar = [...barras.values()].map((tb) => instalarFocoItinerante(tb, { alSubir: () => props.onSubir() }))
    // Con la fuente de reserva los anchos son otros: se vuelve a medir cuando cargan las de la aplicación.
    void document.fonts?.ready.then(() => requestAnimationFrame(ajustar))
    onCleanup(() => {
      ro.disconnect()
      for (const q of quitar) q()
    })
  })
  // Se vuelve a medir solo si cambió la pestaña, el plegado o la cinta encima del lienzo: los ajustes nuevos con los mismos
  // valores (guardar la pestaña, otro ajuste) avisan igual y no deben replegar nada.
  let medido = ''
  createEffect(
    // Con otra selección el último grupo de Inicio cambia de contenido y de ancho: se vuelve a medir.
    on([() => props.pestaña, () => props.plegada, () => props.flotante, () => props.ctx.estado().seleccionTipo, () => props.ctx.estado().seleccionTitulo], ([p, pl, f, st, stt]) => {
      const clave = `${p} ${pl} ${f} ${st} ${stt}`
      if (clave === medido) return
      medido = clave
      requestAnimationFrame(ajustar)
    })
  )
  return (
    <div ref={cuerpo} class="cinta-cuerpo">
      <For each={PESTAÑAS}>
        {(p) => (
          <div role="tabpanel" id={idPanel(p.id)} aria-labelledby={idPestaña(p.id)} hidden={p.id !== props.pestaña}>
            <div ref={(el) => barras.set(p.id, el)} role="toolbar" aria-label={p.nombre} class="herramientas">
              <For each={gruposDe(p)}>
                {(g) => (
                  <GrupoCinta def={g} plegado={plegados().has(g.id)} amplio={ampliados().has(g.id)}>
                    <For each={g.columnas}>{(c) => <ColumnaCinta columna={c} ctx={props.ctx} zoom={props.zoom} amplio={ampliados().has(g.id)} />}</For>
                  </GrupoCinta>
                )}
              </For>
            </div>
          </div>
        )}
      </For>
    </div>
  )
}

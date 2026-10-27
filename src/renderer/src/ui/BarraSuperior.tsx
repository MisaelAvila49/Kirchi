import { createEffect, createMemo, createSignal, For, on, onCleanup, onMount, Show } from 'solid-js'
import type { PestañaCinta } from '../../../compartido/ajustes'
import type { IdCalculadora } from '../calculadoras/catalogo'
import type { ItemPlantilla } from '../plantillas/almacen'
import BotonCinta, { type ContextoBotones } from './cinta/BotonCinta'
import BuscarComando from './cinta/BuscarComando'
import type { EntradaBusqueda } from './cinta/busqueda'
import { CuerpoCinta, idPanel, idPestaña, PestañasCinta, type PropsZoom } from './cinta/Cinta'
import type { IdComando } from './cinta/comandos'
import { DECISIONES } from './cinta/decisiones'
import { conFlecha, type EstadoCinta, type Teclas } from './cinta/estado'
import GloboCinta from './cinta/GloboCinta'
import { ACCESO_RAPIDO, FIJOS } from './cinta/modelo'
import { instalarFocoItinerante, itemsDeBarra, normalizarFoco } from './cinta/navegacion'
import './cinta/cinta.css'

interface Props {
  estado: EstadoCinta
  tecla: Teclas
  /** Todas las teclas vigentes de un comando del registro (el buscador también busca por ellas). */
  teclas(id: string): readonly string[]
  /** Nombre de un comando del registro de atajos (el buscador también busca por él). */
  nombreDe(id: string): string | undefined
  /** Nombre del archivo; «• sin guardar» si hay cambios. */
  archivo: string
  sinGuardar: boolean
  /** Archivo de un formato más nuevo: se ve y se exporta, pero no se cambia. */
  soloLectura: boolean
  /** Un asistente está unido a la ventana: se muestra su indicador, que abre Configuración › Asistente. */
  asistente?: { cliente: string; onAbrir(): void }
  pestaña: PestañaCinta
  plegada: boolean
  onPestaña(p: PestañaCinta): void
  /** Pliega la cinta o la vuelve a fijar (doble clic en una pestaña). */
  onPlegar(): void
  /** El comando cuyo menú está abierto. */
  menuAbierto: IdComando | null
  /** Ejecuta una orden (si está deshabilitada, dice por qué); `ancla` es el control desde donde se pidió. */
  onEjecutar(id: IdComando, ancla: HTMLElement): void
  /** Devuelve el foco al lienzo (lo usa el buscador). */
  onSalir(): void
  zoom: PropsZoom
  /** Recibe el campo del buscador, para Ctrl+K. */
  refBuscador?(el: HTMLInputElement): void
  /** Plantillas que el buscador también encuentra, y qué hacer al elegir una. */
  plantillas?: readonly ItemPlantilla[]
  onPlantilla?(item: ItemPlantilla): void
  /** Ctrl+K encontró una calculadora (o el panel, con `null`). */
  onCalculadora?(id: IdCalculadora | null): void
}

/**
 * Barra superior: fila de título, fila de pestañas y la cinta de la pestaña elegida. Plegada, una pestaña abre la cinta sobre el lienzo.
 */
export default function BarraSuperior(props: Props) {
  const [flotante, setFlotante] = createSignal(false)
  let cabeza!: HTMLElement
  let rapido!: HTMLDivElement
  let fijos!: HTMLDivElement
  createEffect(on(() => props.plegada, (p) => !p && setFlotante(false), { defer: true }))
  /** Abierta encima del lienzo, la cinta se cierra al ejecutar una orden (salvo las que abren un menú bajo su botón). */
  const ejecutar = (id: IdComando, ancla: HTMLElement) => {
    props.onEjecutar(id, ancla)
    if (flotante() && !conFlecha(id, props.estado) && !ancla.hasAttribute('data-grabar-flecha') && !ancla.hasAttribute('data-grabar-pausa')) setFlotante(false)
  }
  const ctx: ContextoBotones = { estado: () => props.estado, tecla: (id) => props.tecla(id), menuAbierto: () => props.menuAbierto, onEjecutar: ejecutar }
  const enfocarPestaña = () => document.getElementById(idPestaña(props.pestaña))?.focus()
  const entrar = () => {
    const tb = document.getElementById(idPanel(props.pestaña))?.querySelector<HTMLElement>('[role="toolbar"]')
    if (!tb) return
    const it = itemsDeBarra(tb)
    ;(it.find((x) => x.tabIndex === 0) ?? it[0])?.focus()
  }
  /** Desde el buscador, lo que vive en una pestaña la deja elegida (así se aprende dónde está); plegada no se abre. */
  const desdeBuscador = (h: EntradaBusqueda, ancla: HTMLElement) => {
    if (h.pestaña && !props.plegada) props.onPestaña(h.pestaña)
    ejecutar(h.id, ancla)
  }
  onMount(() => {
    const quitar = [instalarFocoItinerante(rapido), instalarFocoItinerante(fijos)]
    normalizarFoco(rapido)
    normalizarFoco(fijos)
    // Abierta encima del lienzo, un clic fuera de la barra la cierra (un menú abierto desde ella no cuenta como fuera).
    const fuera = (e: PointerEvent) => {
      const t = e.target as Element | null
      if (flotante() && t && !cabeza.contains(t) && !t.closest?.('.menu, .popover-grabacion')) setFlotante(false)
    }
    document.addEventListener('pointerdown', fuera, true)
    onCleanup(() => {
      for (const q of quitar) q()
      document.removeEventListener('pointerdown', fuera, true)
    })
  })
  const tecla = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || !flotante() || e.defaultPrevented) return
    e.preventDefault()
    setFlotante(false)
    enfocarPestaña()
  }
  // Simular y Detener viven en Inicio; la fila de título lleva Guardar, Deshacer, Rehacer, Voltajes y Corriente.
  const rapidos = createMemo(() => ACCESO_RAPIDO.filter((id) => id !== 'detener' || DECISIONES.detenerSiempre || props.estado.fase !== 'detenida'))
  return (
    <header
      ref={cabeza}
      class="barra"
      classList={{ plegada: props.plegada, flotante: flotante(), mayusculas: DECISIONES.pestañasMayusculas, 'sin-rotulos': !DECISIONES.rotulosGrupo }}
      onKeyDown={tecla}
    >
      <div class="fila-titulo">
        <h1 class="marca">Kirchi</h1>
        <span class="nombre-archivo">
          {props.archivo}
          <Show when={props.sinGuardar}>
            <em> • sin guardar</em>
          </Show>
          <Show when={props.soloLectura}>
            <em> · solo lectura</em>
          </Show>
        </span>
        <Show when={DECISIONES.buscador}>
          <BuscarComando
            estado={props.estado}
            tecla={(id) => props.tecla(id)}
            teclas={(id) => props.teclas(id)}
            nombreDe={(id) => props.nombreDe(id)}
            onEjecutar={desdeBuscador}
            plantillas={props.plantillas}
            onPlantilla={props.onPlantilla}
            onCalculadora={props.onCalculadora}
            onSalir={() => props.onSalir()}
            ref={(el) => props.refBuscador?.(el)}
          />
        </Show>
        <div class="derecha">
          <Show when={props.asistente}>
            {(a) => (
              <button
                type="button"
                class="chip-asistente"
                data-tono="verdeazul"
                data-globo-nombre={`Conectado: ${a().cliente}`}
                aria-label={`Asistente conectado: ${a().cliente}. Abre Configuración.`}
                onClick={() => a().onAbrir()}
              >
                <i aria-hidden="true" />
                Asistente
              </button>
            )}
          </Show>
          <div ref={rapido} role="toolbar" aria-label="Acceso rápido" class="acceso-rapido">
            <For each={rapidos()}>{(id) => (id === '|' ? <span class="separador" aria-hidden="true" /> : <BotonCinta id={id} tamaño="solo-icono" ctx={ctx} />)}</For>
          </div>
          <span class="separador" aria-hidden="true" />
          <div ref={fijos} role="toolbar" aria-label="Ventana" class="fijos">
            <For each={FIJOS}>{(id) => <BotonCinta id={id} tamaño="solo-icono" ctx={ctx} />}</For>
          </div>
        </div>
      </div>
      <div class="fila-pestañas">
        <PestañasCinta
          pestaña={props.pestaña}
          plegada={props.plegada}
          flotante={flotante()}
          onElegir={(p) => props.onPestaña(p)}
          onFlotante={setFlotante}
          onPlegar={() => props.onPlegar()}
          onEntrar={entrar}
        />
      </div>
      <CuerpoCinta pestaña={props.pestaña} plegada={props.plegada} flotante={flotante()} ctx={ctx} zoom={props.zoom} onSubir={enfocarPestaña} />
      <GloboCinta raiz={() => cabeza} />
    </header>
  )
}

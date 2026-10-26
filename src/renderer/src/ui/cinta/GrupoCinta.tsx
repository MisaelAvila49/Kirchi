import { createEffect, createSignal, on, onCleanup, onMount, Show, type JSX } from 'solid-js'
import { DECISIONES } from './decisiones'
import IconoCinta from './IconoCinta'
import type { DefGrupo } from './modelo'

/**
 * Grupo de la cinta. Plegado es un botón que abre su contenido sobre el lienzo: Esc lo cierra y devuelve el foco, las flechas recorren lo de adentro.
 */
export default function GrupoCinta(props: { def: DefGrupo; plegado: boolean; amplio?: boolean; children: JSX.Element }) {
  const [abierto, setAbierto] = createSignal(false)
  const [pos, setPos] = createSignal<{ left: number; top: number } | null>(null)
  const idContenido = `cinta-grupo-${props.def.id}`
  let raiz!: HTMLDivElement
  let boton!: HTMLButtonElement
  let contenido!: HTMLDivElement
  // Al medir, la cinta despliega todos los grupos un instante y vuelve a plegarlos: solo se cierra si de verdad dejó de estar plegado.
  createEffect(on(() => props.plegado, (p) => !p && queueMicrotask(() => !props.plegado && setAbierto(false)), { defer: true }))
  const cerrar = (enfocar: boolean) => {
    setAbierto(false)
    if (enfocar) boton.focus()
  }
  const abrir = () => {
    const r = boton.getBoundingClientRect()
    setAbierto(true)
    const ancho = contenido.offsetWidth
    setPos({ left: Math.max(6, Math.min(window.innerWidth - ancho - 6, r.left)), top: r.bottom + 4 })
    contenido.querySelector<HTMLElement>('button, input')?.focus()
  }
  onMount(() => {
    const fuera = (e: PointerEvent) => {
      if (abierto() && !raiz.contains(e.target as Node)) setAbierto(false)
    }
    document.addEventListener('pointerdown', fuera, true)
    onCleanup(() => document.removeEventListener('pointerdown', fuera, true))
  })
  const tecla = (e: KeyboardEvent) => {
    if (!props.plegado || !abierto()) return
    const it = [...contenido.querySelectorAll<HTMLElement>('button, input')].filter((x) => x.getClientRects().length > 0)
    const i = it.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      cerrar(true)
    } else if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(e.key) && (e.target as HTMLElement).tagName !== 'INPUT') {
      e.preventDefault()
      e.stopPropagation()
      const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1
      it[(i + d + it.length) % it.length]?.focus()
    }
  }
  // Se cierra cuando el foco sale del grupo, no al apretar Tab, para que el foco llegue a su destino antes de ocultar el contenido.
  // Su propio botón cuenta como fuera, salvo con el ratón: ahí el clic lo cierra y cerrarlo aquí lo reabriría.
  let botonApretado = false
  const alSalirFoco = (e: FocusEvent) => {
    // Sin destino (otra ventana, o un control que se oculta al medir la cinta) no es salir: Tab siempre lleva a un control.
    const a = e.relatedTarget as Element | null
    if (!abierto() || !a) return
    if (contenido.contains(a) || a.closest?.('.menu, .popover-grabacion') || (a === boton && botonApretado)) return
    setAbierto(false)
  }
  return (
    <div ref={raiz} class="grupo" classList={{ plegado: props.plegado, abierto: abierto(), amplio: props.amplio === true }} data-grupo={props.def.id} on:focusout={alSalirFoco}>
      <button ref={boton} type="button" class="boton-grupo" tabIndex={-1} aria-expanded={abierto()} aria-controls={idContenido} onPointerDown={() => (botonApretado = true)} onClick={() => {
          botonApretado = false
          if (abierto()) cerrar(false)
          else abrir()
        }}>
        <IconoCinta nombre={props.def.icono} uso="grande" />
        <span class="txt-grupo">{props.def.nombre}</span>
        <IconoCinta nombre="abajo" class="flechita" />
      </button>
      <div
        ref={contenido}
        id={idContenido}
        class="grupo-contenido"
        role="group"
        aria-label={props.def.nombre}
        style={abierto() && pos() ? { left: `${pos()!.left}px`, top: `${pos()!.top}px` } : undefined}
        on:keydown={tecla}
        onClick={(e) => {
          // Una orden cierra el grupo abierto; un botón que abre un menú lo deja abierto debajo de su menú.
          if (props.plegado && abierto() && (e.target as Element).closest('button:not([aria-haspopup])')) setAbierto(false)
        }}
      >
        {props.children}
      </div>
      <Show when={DECISIONES.rotulosGrupo}>
        <span class="grupo-nombre" aria-hidden="true">
          {props.def.nombre}
        </span>
      </Show>
    </div>
  )
}

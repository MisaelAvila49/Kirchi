import { createEffect, createSignal, onCleanup, onMount, Show } from 'solid-js'

/** Espera antes de mostrar el globo al pasar el ratón (de un botón a otro, y al enfocar con el teclado, sale de inmediato). */
export const ESPERA_GLOBO_MS = 450

interface Ficha {
  nombre: string
  tecla?: string
  razon?: string
  caja: DOMRect
}

/**
 * Globo de la cinta. Sale al pasar el ratón o enfocar; se oculta con Esc, clic o al salir, y el puntero puede pasar encima (WCAG 1.4.13). Es solo visual: los lectores reciben lo mismo por el nombre, `aria-keyshortcuts` y `aria-describedby`.
 */
export default function GloboCinta(props: { raiz: () => HTMLElement | undefined }) {
  const [ficha, setFicha] = createSignal<Ficha | null>(null)
  let caja: HTMLDivElement | undefined
  let espera: ReturnType<typeof setTimeout> | undefined
  let dueño: HTMLElement | null = null
  /** El botón cuya espera corre: pasar el puntero a uno de sus hijos no la reinicia. */
  let pendiente: HTMLElement | null = null
  // Mientras el globo está abierto sigue al botón: si cambia su nombre, su tecla o por qué está deshabilitado (copiar
  // habilita Pegar), el globo lo dice sin cerrarse.
  const observador = typeof MutationObserver === 'undefined' ? null : new MutationObserver(() => dueño && leer(dueño))
  const con = (t: EventTarget | null): HTMLElement | null => (t instanceof Element ? t.closest<HTMLElement>('[data-globo-nombre]') : null)
  const leer = (b: HTMLElement) =>
    setFicha({ nombre: b.dataset.globoNombre ?? '', tecla: b.dataset.globoTecla || undefined, razon: b.dataset.globoRazon || undefined, caja: b.getBoundingClientRect() })
  const mostrar = (b: HTMLElement) => {
    pendiente = null
    dueño = b
    observador?.disconnect()
    observador?.observe(b, { attributes: true, attributeFilter: ['data-globo-nombre', 'data-globo-tecla', 'data-globo-razon'] })
    leer(b)
  }
  const ocultar = () => {
    clearTimeout(espera)
    pendiente = null
    dueño = null
    observador?.disconnect()
    setFicha(null)
  }
  // Debajo del botón y centrado, sin salirse de la ventana; arriba si no cabe abajo.
  createEffect(() => {
    const f = ficha()
    if (!f || !caja) return
    const w = caja.offsetWidth, h = caja.offsetHeight
    const x = Math.max(6, Math.min(window.innerWidth - w - 6, f.caja.left + f.caja.width / 2 - w / 2))
    const y = f.caja.bottom + 6 + h > window.innerHeight - 4 ? f.caja.top - h - 6 : f.caja.bottom + 6
    caja.style.left = `${x}px`
    caja.style.top = `${y}px`
  })
  onMount(() => {
    const raiz = props.raiz()
    if (!raiz) return
    const sobre = (e: PointerEvent) => {
      const b = con(e.target)
      if (!b || b === dueño || b === pendiente) return
      clearTimeout(espera)
      pendiente = b
      espera = setTimeout(() => mostrar(b), dueño ? 0 : ESPERA_GLOBO_MS)
    }
    const fuera = (e: PointerEvent) => {
      const a = e.relatedTarget as Node | null
      if (a && caja?.contains(a)) return
      const b = con(e.target)
      if (b && !b.contains(a)) ocultar()
    }
    const foco = (e: FocusEvent) => {
      const b = con(e.target)
      if (b && b.matches(':focus-visible')) mostrar(b)
      else ocultar()
    }
    // Esc oculta el globo sin quedarse con la tecla: también cierra la cinta abierta encima del lienzo, si la hay.
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && ficha()) ocultar()
    }
    raiz.addEventListener('pointerover', sobre)
    raiz.addEventListener('pointerout', fuera)
    raiz.addEventListener('pointerdown', ocultar)
    document.addEventListener('focusin', foco)
    document.addEventListener('keydown', tecla, true)
    onCleanup(() => {
      clearTimeout(espera)
      observador?.disconnect()
      raiz.removeEventListener('pointerover', sobre)
      raiz.removeEventListener('pointerout', fuera)
      raiz.removeEventListener('pointerdown', ocultar)
      document.removeEventListener('focusin', foco)
      document.removeEventListener('keydown', tecla, true)
    })
  })
  return (
    <Show when={ficha()}>
      {(f) => (
        <div ref={caja} class="globo-cinta" aria-hidden="true" onPointerLeave={ocultar}>
          <b>{f().nombre}</b>
          <Show when={f().tecla}>
            <span class="globo-atajo">{f().tecla}</span>
          </Show>
          <Show when={f().razon}>
            <span class="globo-razon">{f().razon}</span>
          </Show>
        </div>
      )}
    </Show>
  )
}

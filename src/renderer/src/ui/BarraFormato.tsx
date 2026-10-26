import { createSignal, onCleanup, onMount } from 'solid-js'
import { siguienteControl } from './barraNav'
import type { Caja } from '../piezas/tipos'
import ControlesFormato from './ControlesFormato'
import { posicionBarraFormato, type OrdenFormato, type VistaFormato } from './vistaFormato'

interface Props {
  vista: VistaFormato
  /** Caja de las notas y etiquetas seleccionadas y del lienzo, en píxeles de ventana. */
  caja: Caja
  area: Caja
  onOrden(o: OrdenFormato): void
  teclas(id: string): string | undefined
  /** Esc o elegir con el puntero: el foco vuelve al lienzo. */
  onSalir(): void
}

/**
 * Barra flotante de formato: arriba del texto o, si no cabe, abajo. Sigue a la cámara porque su caja llega en coordenadas de ventana.
 */
export default function BarraFormato(props: Props) {
  let el!: HTMLDivElement
  const [tam, setTam] = createSignal({ ancho: 0, alto: 0 })
  onMount(() => {
    const medir = () => {
      const r = el.getBoundingClientRect()
      setTam({ ancho: r.width, alto: r.height })
    }
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    // Un solo tabulador para toda la barra (patrón de barra de herramientas): el control activo tiene tabindex 0 y el resto -1.
    const rodar = (activo?: Element | null) => {
      const cs = controles()
      const a = activo && cs.includes(activo as HTMLElement) ? activo : (cs.find((c) => c.tabIndex === 0) ?? cs[0])
      for (const c of cs) c.tabIndex = c === a ? 0 : -1
    }
    rodar()
    const mo = new MutationObserver(() => rodar())
    mo.observe(el, { childList: true, subtree: true })
    const alFoco = (e: FocusEvent) => rodar(e.target as Element)
    el.addEventListener('focusin', alFoco)
    onCleanup(() => {
      ro.disconnect()
      mo.disconnect()
      el.removeEventListener('focusin', alFoco)
    })
  })
  const controles = () => [...el.querySelectorAll<HTMLElement>('button, select')]
  const tecla = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      props.onSalir()
      return
    }
    const cs = controles()
    const i = cs.indexOf(document.activeElement as HTMLElement)
    const j = i < 0 ? null : siguienteControl(cs.length, i, e.key)
    if (j === null) {
      // Las flechas arriba y abajo de una lista son suyas; las demás flechas no deben mover la nota del lienzo.
      if (e.key.startsWith('Arrow')) e.stopPropagation()
      return
    }
    e.preventDefault()
    e.stopPropagation()
    cs[j].focus()
  }
  const pos = () => posicionBarraFormato(props.caja, tam().ancho, tam().alto, props.area)
  return (
    <div
      ref={el}
      class="barra-formato"
      role="toolbar"
      aria-label="Formato del texto"
      onKeyDown={tecla}
      style={{ left: `${pos().left}px`, top: `${pos().top}px`, visibility: tam().ancho ? 'visible' : 'hidden' }}
    >
      <ControlesFormato vista={props.vista} variante="barra" onOrden={props.onOrden} teclas={props.teclas} alCanvas={props.onSalir} />
    </div>
  )
}

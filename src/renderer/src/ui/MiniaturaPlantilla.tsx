import { For } from 'solid-js'
import type { VistaPlantilla } from '../plantillas/plantilla'

/** La miniatura de una plantilla: el dibujo de sus piezas y cables en el color del texto del panel (sin colores propios). */
export function MiniaturaPlantilla(props: { vista: VistaPlantilla; clase?: string }) {
  return (
    <svg class={`miniatura-plantilla ${props.clase ?? ''}`} viewBox={props.vista.viewBox} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <For each={props.vista.triangulos}>{(t) => <polygon points={t} />}</For>
      <For each={props.vista.lineas}>{(l) => <polyline class={l.cable ? 'cable' : undefined} points={l.puntos} />}</For>
    </svg>
  )
}

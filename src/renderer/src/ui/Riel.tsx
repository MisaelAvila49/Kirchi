import { controlesDelPanel } from './rielUtil'
import { For, type JSX } from 'solid-js'
import type { PanelDerecho, PanelLateral } from '../../../compartido/ajustes'
import { IconoAnalisis, IconoCalculadoras, IconoInspector, IconoLibreria, IconoMediciones, IconoPlantillas, IconoProyecto } from './iconos'

export const NOMBRE_PANEL: Record<PanelLateral, string> = { libreria: 'Librería', plantillas: 'Plantillas', calculadoras: 'Calculadoras' }
export const NOMBRE_PANEL_DERECHO: Record<PanelDerecho, string> = { inspector: 'Inspector', mediciones: 'Mediciones', proyecto: 'Proyecto', analisis: 'Análisis' }

const BOTONES_IZQ: [PanelLateral, () => JSX.Element][] = [
  ['libreria', IconoLibreria],
  ['plantillas', IconoPlantillas],
  ['calculadoras', IconoCalculadoras]
]
const BOTONES_DER: [PanelDerecho, () => JSX.Element][] = [
  ['inspector', IconoInspector],
  ['mediciones', IconoMediciones],
  ['proyecto', IconoProyecto],
  ['analisis', IconoAnalisis]
]

interface Props<T extends string> {
  panel: T
  abierto: boolean
  /** Clic en un icono: abre ese panel; en el del panel abierto, lo pliega. */
  onElegir(p: T): void
}

/** Un riel de iconos de 44 px: cada uno con su nombre al pasar el mouse y el mismo nombre para lectores de pantalla. */
function RielDe<T extends string>(props: Props<T> & { botones: [T, () => JSX.Element][]; nombres: Record<T, string>; etiqueta: string; controla: string; lado: 'izq' | 'der' }) {
  return (
    <nav class="riel" classList={{ der: props.lado === 'der' }} aria-label={props.etiqueta}>
      <For each={props.botones}>
        {([id, Icono]) => (
          <button
            type="button"
            class="riel-boton"
            data-panel={id}
            aria-label={props.nombres[id]}
            aria-expanded={props.abierto && props.panel === id}
            aria-controls={controlesDelPanel(props.abierto, props.controla)}
            onClick={() => props.onElegir(id)}
          >
            <Icono />
            <span class="riel-nombre" aria-hidden="true">
              {props.nombres[id]}
            </span>
          </button>
        )}
      </For>
    </nav>
  )
}

/** Riel izquierdo: lo que se coloca (Librería, Plantillas, Calculadoras). */
export default function Riel(props: Props<PanelLateral>) {
  return <RielDe {...props} botones={BOTONES_IZQ} nombres={NOMBRE_PANEL} etiqueta="Paneles" controla="panel-lateral" lado="izq" />
}

/** Riel derecho: lo que dice cómo funciona el circuito (Inspector, Mediciones, Proyecto, Análisis). */
export function RielDerecho(props: Props<PanelDerecho>) {
  return <RielDe {...props} botones={BOTONES_DER} nombres={NOMBRE_PANEL_DERECHO} etiqueta="Para ver el circuito" controla="panel-derecho" lado="der" />
}

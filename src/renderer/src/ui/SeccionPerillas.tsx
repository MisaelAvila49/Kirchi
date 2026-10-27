import { createSignal, For, Show } from 'solid-js'
import ControlPerilla, { type PerillaVista } from './ControlPerilla'

const CLAVE_VISTA = 'kirchi.perillaVista'
const leerVista = (): boolean => {
  try {
    return localStorage.getItem(CLAVE_VISTA) === '1'
  } catch {
    return false
  }
}
// Módulo: el globo se ve hasta que la primera perilla se mueve, aunque el inspector se monte de nuevo.
const [vista, setVista] = createSignal(leerVista())
const marcarVista = () => {
  setVista(true)
  try {
    localStorage.setItem(CLAVE_VISTA, '1')
  } catch {
    /* sin almacenamiento: el globo vuelve a la próxima sesión */
  }
}
/** Solo para pruebas: vuelve al estado de la primera vez. */
export const olvidarPerillaVista = () => {
  try {
    localStorage.removeItem(CLAVE_VISTA)
  } catch {
    /* igual */
  }
  setVista(false)
}

interface Props {
  perillas: readonly PerillaVista[]
  /** `gesto`: el mismo valor mientras dura un arrastre (un paso de deshacer). */
  onCambiar(perilla: PerillaVista, valor: number, gesto?: string): void
  /** En Mediciones: solo el deslizador con su cifra, sin campo escrito ni globo. */
  compacta?: boolean
}

/** Las perillas en vivo de la pieza seleccionada, mientras simula. Va arriba de «Más ajustes» en el inspector. */
export default function SeccionPerillas(props: Props) {
  return (
    <Show when={props.perillas.length > 0}>
      <section class="perillas" classList={{ 'perillas-compacta': props.compacta }} aria-label="Perillas en vivo">
        <Show when={!props.compacta && !vista()}>
          <p class="perillas-pista">Muévela mientras simulas.</p>
        </Show>
        <For each={props.perillas}>
          {(p) => (
            <ControlPerilla
              perilla={p}
              campo={!props.compacta}
              onCambiar={(v, g) => {
                marcarVista()
                props.onCambiar(p, v, g)
              }}
            />
          )}
        </For>
      </section>
    </Show>
  )
}

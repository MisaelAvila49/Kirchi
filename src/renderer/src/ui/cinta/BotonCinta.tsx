import { Show } from 'solid-js'
import { atajoAria } from '../menus'
import { COMANDOS, type IdComando } from './comandos'
import { conFlecha, enGrabacion, globoDe, iconoDe, marcado, nombreAccesible, razonDeshabilitado, teclaVisible, textoDe, type EstadoCinta, type Teclas } from './estado'
import IconoCinta from './IconoCinta'

/** Grande: icono de 20 px sobre el nombre; chico: 24 px de alto; solo icono: 28 × 28; principal y secundaria: Simular y Detener de la fila de arriba. */
export type Tamaño = 'grande' | 'chico' | 'solo-icono' | 'principal' | 'secundaria'

/** Lo que todos los botones de una barra comparten: el estado, las teclas, qué menú está abierto y quién ejecuta. */
export interface ContextoBotones {
  estado(): EstadoCinta
  tecla: Teclas
  /** El comando cuyo menú está abierto (su botón queda con `aria-expanded`). */
  menuAbierto(): IdComando | null
  onEjecutar(id: IdComando, ancla: HTMLElement): void
}

let siguiente = 0

/** Un botón de la cinta: todo lo que muestra sale de la tabla de comandos y del estado (`estado.ts`). */
export default function BotonCinta(props: { id: IdComando; tamaño: Tamaño; ctx: ContextoBotones }) {
  const idRazon = `razon-cinta-${++siguiente}`
  const def = COMANDOS[props.id]
  const solo = props.tamaño === 'solo-icono'
  const razon = () => razonDeshabilitado(props.id, props.ctx.estado(), props.ctx.tecla)
  const tecla = () => teclaVisible(props.id, props.ctx.tecla)
  const texto = () => textoDe(props.id, props.ctx.estado())
  const nombre = () => nombreAccesible(props.id, props.ctx.estado())
  const flecha = () => conFlecha(props.id, props.ctx.estado())
  const pulsado = () => marcado(props.id, props.ctx.estado())
  // Los que no abren un menú no toman el foco con el ratón (mousedown sin efecto): Espacio, las flechas y los atajos
  // siguen yendo al lienzo. Los de menú sí, para que Esc devuelva el foco a su botón.
  const boton = () => (
    <button
        type="button"
        class={`boton-cinta ${props.tamaño}`}
        // Foco itinerante: nace fuera del Tab y `normalizarFoco` deja uno en 0 por barra.
        tabIndex={-1}
        data-comando={props.id}
        data-menu-boton={def.menu ? '' : undefined}
        data-globo-nombre={globoDe(props.id, props.ctx.estado()) ?? (solo ? nombre() : texto())}
        data-globo-tecla={tecla()}
        data-globo-razon={razon() ?? undefined}
        aria-label={solo || nombre() !== texto() ? nombre() : undefined}
        aria-haspopup={def.menu ? 'menu' : def.popover && flecha() ? 'dialog' : undefined}
        aria-expanded={def.menu || (def.popover && flecha()) ? props.ctx.menuAbierto() === props.id : undefined}
        aria-pressed={pulsado() === undefined ? undefined : pulsado() ? 'true' : 'false'}
        aria-disabled={razon() ? 'true' : undefined}
        aria-describedby={razon() ? idRazon : undefined}
        aria-keyshortcuts={razon() ? undefined : atajoAria(tecla())}
        onMouseDown={(e) => {
          if (!def.menu && !def.popover) e.preventDefault()
        }}
        onClick={(e) => props.ctx.onEjecutar(props.id, e.currentTarget)}
      >
        <IconoCinta nombre={iconoDe(props.id, props.ctx.estado())} uso={props.tamaño} />
        <Show when={!solo}>
          <span class={props.tamaño === 'secundaria' ? 'txt-sec' : 'txt'}>
            <Show when={def.partido && enGrabacion(props.ctx.estado())} fallback={texto()}>
              <span class="punto-grabando" classList={{ pausado: props.ctx.estado().grabacion === 'pausada' }} aria-hidden="true">
                ●
              </span>{' '}
              {texto().slice(2)}
            </Show>
          </span>
        </Show>
        <Show when={flecha()}>
          <IconoCinta nombre="abajo" class="flecha" />
        </Show>
      </button>
  )
  return (
    <Show when={props.id !== 'enfocar-tutorial' || props.ctx.estado().tutorial}>
      <Show when={def.partido} fallback={boton()}>
        <span class="boton-partido">
          {boton()}
          <Show when={enGrabacion(props.ctx.estado())}>
            {/* Pausar a simple vista junto al tiempo; el menú de la flecha también lo trae. */}
            <button
              type="button"
              class="boton-cinta pausa-partida"
              tabIndex={-1}
              data-grabar-pausa=""
              data-globo-nombre={props.ctx.estado().grabacion === 'pausada' ? 'Continuar la grabación' : 'Pausar la grabación'}
              aria-label={props.ctx.estado().grabacion === 'pausada' ? 'Continuar la grabación' : 'Pausar la grabación'}
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => props.ctx.onEjecutar(props.id, e.currentTarget)}
            >
              <IconoCinta nombre={props.ctx.estado().grabacion === 'pausada' ? 'simular' : 'pausa'} uso="grande" />
            </button>
          </Show>
          <button
            type="button"
            class="boton-cinta flecha-partida"
            tabIndex={-1}
            data-grabar-flecha=""
            data-menu-de={props.id}
            data-globo-nombre="Opciones de grabación"
            data-globo-razon={razon() ?? undefined}
            aria-label="Opciones de grabación"
            aria-haspopup={enGrabacion(props.ctx.estado()) ? 'menu' : 'dialog'}
            aria-expanded={props.ctx.menuAbierto() === props.id}
            aria-disabled={razon() ? 'true' : undefined}
            onClick={(e) => props.ctx.onEjecutar(props.id, e.currentTarget)}
          >
            <IconoCinta nombre="abajo" class="flecha" />
          </button>
        </span>
      </Show>
      <Show when={razon()}>
        {(r) => (
          <span id={idRazon} hidden>
            {r()}
          </span>
        )}
      </Show>
    </Show>
  )
}

import { atajoAria } from '../menus'
import type { IdComando } from './comandos'
import type { ContextoBotones } from './BotonCinta'
import { nombreAccesible, razonDeshabilitado, teclaVisible } from './estado'

let siguiente = 0

/** Control «Interfaz − 150 % +»: todo pasa por el ejecutor de la cinta, con la razón de lo deshabilitado. */
export default function ControlTamaño(props: { ctx: ContextoBotones }) {
  const id = ++siguiente
  const boton = (orden: IdComando, visible: string, clase: string, etiqueta?: string) => {
    const razon = () => razonDeshabilitado(orden, props.ctx.estado(), props.ctx.tecla)
    const tecla = () => teclaVisible(orden, props.ctx.tecla)
    const idRazon = `razon-tamano-${id}-${orden}`
    return (
      <>
        <button
          type="button"
          class={`boton ${clase}`}
          tabIndex={-1}
          data-comando={orden}
          data-globo-nombre={nombreAccesible(orden, props.ctx.estado())}
          data-globo-tecla={tecla()}
          data-globo-razon={razon() ?? undefined}
          aria-label={etiqueta ?? nombreAccesible(orden, props.ctx.estado())}
          aria-disabled={razon() ? 'true' : undefined}
          aria-describedby={razon() ? idRazon : undefined}
          aria-keyshortcuts={razon() ? undefined : atajoAria(tecla())}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => props.ctx.onEjecutar(orden, e.currentTarget)}
        >
          {visible}
        </button>
        <span id={idRazon} hidden>
          {razon() ?? ''}
        </span>
      </>
    )
  }
  const pct = () => `${props.ctx.estado().tamañoInterfaz} %`
  return (
    <div class="control-tamano" role="group" aria-label="Tamaño de la interfaz">
      <span class="rotulo-tamano" aria-hidden="true">
        Interfaz
      </span>
      {boton('pagina-menos', '−', 'paso-tamano')}
      {boton('pagina-real', pct(), 'cifra cifra-tamano', `${pct()}, tamaño real de la página`)}
      {boton('pagina-mas', '+', 'paso-tamano')}
    </div>
  )
}

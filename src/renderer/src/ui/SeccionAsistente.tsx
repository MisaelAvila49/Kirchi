import { createEffect, createSignal, Show } from 'solid-js'
import PistaGlobo from './PistaGlobo'

/** Lo que la pestaña muestra del asistente: el interruptor y, si lo hay, el cliente conectado. */
export interface EstadoAsistente {
  activo: boolean
  cliente?: string
}

export interface PropsAsistente {
  estado: EstadoAsistente
  /** La carpeta del asistente elegida; sin ella, la de siempre. */
  carpeta?: string
  onActivar(activo: boolean): void
  onCambiarCarpeta(): Promise<string | null>
  onRestablecer(): Promise<void>
  onDesconectar(): void
  onCopiar(): Promise<void>
}

const CARPETA_POR_OMISION = 'Kirchi › Asistente'
const nombreCarpeta = (ruta: string | undefined) => (ruta ? (ruta.split(/[\\/]+/).filter(Boolean).pop() ?? ruta) : CARPETA_POR_OMISION)

/** Configuración › Asistente: permiso, carpeta y copia de la configuración del cliente. */
export default function SeccionAsistente(props: PropsAsistente) {
  const [activo, setActivo] = createSignal(props.estado.activo)
  createEffect(() => setActivo(props.estado.activo))
  const [carpeta, setCarpeta] = createSignal(props.carpeta)
  const [error, setError] = createSignal('')
  const [copiado, setCopiado] = createSignal(false)
  const mensaje = (e: unknown, defecto: string) => (e instanceof Error && e.message ? e.message : defecto)
  const cambiar = async () => {
    setError('')
    try {
      const nueva = await props.onCambiarCarpeta()
      if (nueva) setCarpeta(nueva)
    } catch (e) {
      setError(mensaje(e, 'No se pudo cambiar la carpeta.'))
    }
  }
  const restablecer = async () => {
    setError('')
    try {
      await props.onRestablecer()
      setCarpeta(undefined)
    } catch (e) {
      setError(mensaje(e, 'No se pudo restablecer la carpeta.'))
    }
  }
  const copiar = async () => {
    setError('')
    setCopiado(false)
    try {
      await props.onCopiar()
      setCopiado(true)
    } catch (e) {
      setError(mensaje(e, 'No se pudo copiar la configuración.'))
    }
  }
  const estado = () => (props.estado.cliente ? `Conectado: ${props.estado.cliente}` : activo() ? 'Listo. Escríbele al asistente desde tu cliente.' : 'Sin conectar')
  return (
    <>
      <fieldset class="grupo">
        <legend>Permiso</legend>
        <div class="fila">
          <button
            type="button"
            class="interruptor"
            id="interruptor-asistente"
            role="switch"
            aria-checked={activo()}
            aria-labelledby="rotulo-asistente"
            aria-describedby="pista-asistente"
            onClick={() => (setActivo(!activo()), props.onActivar(activo()))}
          />
          <label id="rotulo-asistente" for="interruptor-asistente">
            Permitir que un asistente controle Kirchi
          </label>
          <PistaGlobo id="pista-asistente" texto="Kirchi sigue sin conexión. El asistente solo toca el circuito abierto y su carpeta." />
        </div>
        <div class="fila">
          <span class="estado" role="status" data-estado={props.estado.cliente ? 'conectado' : activo() ? 'esperando' : 'apagado'}>
            <i aria-hidden="true" />
            {estado()}
          </span>
          <Show when={props.estado.cliente}>
            <button
              type="button"
              class="boton"
              onClick={() => {
                props.onDesconectar()
                // El botón desaparece al desconectar: el foco pasa al interruptor y no se pierde.
                document.getElementById('interruptor-asistente')?.focus()
              }}
            >
              Desconectar
            </button>
          </Show>
        </div>
      </fieldset>
      <fieldset class="grupo">
        <legend>Carpeta del asistente</legend>
        <div class="fila">
          <span class="carpeta cifra" id="carpeta-asistente" title={carpeta()}>
            {nombreCarpeta(carpeta())}
          </span>
          <button type="button" class="boton" onClick={() => void cambiar()}>
            Cambiar…
          </button>
          <button type="button" class="boton" disabled={!carpeta()} onClick={() => void restablecer()}>
            Restablecer
          </button>
        </div>
      </fieldset>
      <fieldset class="grupo">
        <legend>Conexión</legend>
        <p class="pista">Sirve con cualquier cliente MCP (Claude Desktop, Claude Code, Cursor, VS Code y otros): pégala en su configuración.</p>
        <div class="fila">
          <button type="button" class="boton" onClick={() => void copiar()}>
            Copiar configuración del asistente
          </button>
          <Show when={copiado()}>
            <span class="secundario" role="status">
              Copiada.
            </span>
          </Show>
        </div>
      </fieldset>
      <Show when={error()}>
        <p class="secundario nota-dialogo" role="alert">
          {error()}
        </p>
      </Show>
    </>
  )
}

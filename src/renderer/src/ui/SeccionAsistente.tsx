import { createEffect, createSignal, Show } from 'solid-js'
import { FilaCarpeta, FilaConfig, GrupoConfig, Interruptor } from './ControlesConfig'

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
      <GrupoConfig titulo="Permiso">
        <FilaConfig id="rotulo-asistente" nombre="Permitir que un asistente controle Kirchi" pista={{ id: 'pista-asistente', texto: 'Kirchi sigue sin conexión. El asistente solo toca el circuito abierto y su carpeta.' }}>
          <Interruptor id="interruptor-asistente" etiqueta="rotulo-asistente" describedby="pista-asistente" activo={activo()} onCambiar={(v) => (setActivo(v), props.onActivar(v))} />
        </FilaConfig>
        <FilaConfig id="cfg-estado" nombre="Estado">
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
        </FilaConfig>
      </GrupoConfig>
      <GrupoConfig titulo="Carpeta">
        <FilaCarpeta
          id="cfg-carpeta-asistente"
          nombre="Carpeta del asistente"
          idCarpeta="carpeta-asistente"
          carpeta={nombreCarpeta(carpeta())}
          ruta={carpeta()}
          personalizada={!!carpeta()}
          onCambiar={() => void cambiar()}
          onRestablecer={() => void restablecer()}
        />
      </GrupoConfig>
      <GrupoConfig titulo="Conectar un asistente">
        <FilaConfig
          id="cfg-conexion"
          nombre="Configuración para tu cliente"
          cap="Pégala en la configuración de tu cliente MCP."
          pista={{ id: 'pista-conexion', texto: 'Sirve con cualquier cliente MCP (Claude Desktop, Claude Code, Cursor, VS Code y otros): pégala en su configuración.' }}
        >
          <button type="button" class="boton" onClick={() => void copiar()}>
            Copiar configuración del asistente
          </button>
          <Show when={copiado()}>
            <span class="secundario" role="status">
              Copiada.
            </span>
          </Show>
        </FilaConfig>
      </GrupoConfig>
      <Show when={error()}>
        <p class="secundario nota-dialogo" role="alert">
          {error()}
        </p>
      </Show>
    </>
  )
}

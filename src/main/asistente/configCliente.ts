import { join } from 'node:path'

export interface EntornoEjecutable {
  plataforma: NodeJS.Platform
  /** `process.windowsStore`: la ventana corre dentro del paquete de la Tienda. */
  windowsStore: boolean
  empaquetado: boolean
  execPath: string
  appPath: string
  /** `process.env.APPIMAGE` en Linux. */
  appImage?: string
  /** `%LOCALAPPDATA%`, donde Windows publica los alias de ejecución. */
  localAppData?: string
}

export interface ComandoCliente {
  command: string
  args: string[]
}

/** Cómo lanza un cliente MCP este Kirchi. En la Tienda el ejecutable vive en una carpeta que otros procesos no pueden
 * lanzar por ruta, así que se usa el alias `kirchi.exe` del paquete. Sin empaquetar (desarrollo) se lanza Electron con la carpeta de la aplicación. */
export function comandoDelCliente(e: EntornoEjecutable): ComandoCliente {
  if (!e.empaquetado) return { command: e.execPath, args: [e.appPath, '--mcp'] }
  if (e.plataforma === 'win32' && e.windowsStore && e.localAppData) return { command: join(e.localAppData, 'Microsoft', 'WindowsApps', 'kirchi.exe'), args: ['--mcp'] }
  if (e.plataforma === 'linux' && e.appImage) return { command: e.appImage, args: ['--mcp'] }
  return { command: e.execPath, args: ['--mcp'] }
}

/** El bloque que se pega en la configuración de Claude Desktop. */
export function textoConfiguracion(e: EntornoEjecutable): string {
  const { command, args } = comandoDelCliente(e)
  return JSON.stringify({ mcpServers: { kirchi: { command, args } } }, null, 2)
}

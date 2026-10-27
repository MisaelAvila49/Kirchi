/** Lo que comparten el proceso principal, el preload y la interfaz del asistente. Solo tipos y constantes. */

/** Canales IPC del asistente. */
export const CANALES_ASISTENTE = {
  estado: 'asistente:estado',
  alEstado: 'asistente:al-estado',
  activar: 'asistente:activar',
  cambiarCarpeta: 'asistente:cambiar-carpeta',
  restablecerCarpeta: 'asistente:restablecer-carpeta',
  desconectar: 'asistente:desconectar',
  textoConfiguracion: 'asistente:texto-configuracion',
  /** Del proceso principal a la ventana: una petición del puente. */
  peticion: 'asistente:peticion',
  /** De la ventana al proceso principal: la respuesta a una petición. */
  respuesta: 'asistente:respuesta'
} as const

export const VERSION_TUBERIA = 1
/** Un mensaje de la tubería: más largo que esto corta la conexión. */
export const MAX_MENSAJE_TUBERIA = 16 * 1024 * 1024
/** Lo más que espera la ventana a que termine un gesto del usuario antes de rechazar una orden. */
export const ESPERA_GESTO_MS = 5000
/** Puentes unidos a la vez: un cliente lanza uno por modo (Claude Desktop, uno para el chat y otro para el agente). */
export const MAX_ASISTENTES = 4
export const TEXTO_YA_CONECTADO = `Ya hay ${MAX_ASISTENTES} asistentes conectados a Kirchi.`
export const TEXTO_USUARIO_EDITANDO = 'El usuario está editando; intenta de nuevo.'
/** Tras «Conservar el mío» la ventana y el disco tienen dos versiones: el asistente no edita hasta que el usuario guarde. */
export const TEXTO_CAMBIOS_DEL_USUARIO = 'El circuito está abierto en Kirchi con cambios del usuario. Pide que lo guarde o trabaja en una copia.'
export const MAX_CLIENTE = 40

/** `{v: 1, id, tipo, datos}`, una línea de JSON. */
export interface MensajeTuberia {
  v: 1
  id: number
  tipo: string
  datos: unknown
}

export interface EstadoAsistente {
  activo: boolean
  /** El cliente unido a la ventana (el `clientInfo.name` que mandó al iniciar), o null. */
  conectado: null | { cliente: string }
  /** La carpeta elegida por el usuario, si no es la de siempre. */
  carpeta?: string
}

/** Una petición del puente que el proceso principal pasa a la ventana. */
export interface PeticionAsistente {
  id: number
  tipo: string
  datos: unknown
}

export interface ApiAsistente {
  estado(): Promise<EstadoAsistente>
  /** Escucha los cambios de estado (interruptor, cliente unido o desconectado, carpeta); devuelve cómo dejar de escuchar. */
  alEstado(f: (e: EstadoAsistente) => void): () => void
  activar(activo: boolean): Promise<EstadoAsistente>
  /** Abre el diálogo de carpeta del proceso principal; devuelve la carpeta elegida o null si se canceló. */
  cambiarCarpeta(): Promise<string | null>
  restablecerCarpeta(): Promise<void>
  desconectar(): Promise<void>
  /** El bloque de Claude Desktop con la ruta de esta instalación. */
  textoConfiguracion(): Promise<string>
  /** Peticiones del puente para esta ventana. */
  alPeticion(f: (p: PeticionAsistente) => void): () => void
  responder(id: number, respuesta: unknown): void
}

/** El nombre del cliente tal como se muestra: sin caracteres de control y de a lo más `MAX_CLIENTE`. */
export function limpiarCliente(v: unknown): string {
  if (typeof v !== 'string') return 'Asistente'
  const t = v.replace(/[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_CLIENTE)
  return t || 'Asistente'
}

/** Revisa la forma de un estado que llega por IPC. */
export function validarEstado(x: unknown): EstadoAsistente | null {
  if (typeof x !== 'object' || x === null) return null
  const o = x as Record<string, unknown>
  if (typeof o.activo !== 'boolean') return null
  const c = o.conectado
  const conectado = c !== null && typeof c === 'object' && typeof (c as { cliente?: unknown }).cliente === 'string' ? { cliente: limpiarCliente((c as { cliente: string }).cliente) } : null
  return { activo: o.activo, conectado, ...(typeof o.carpeta === 'string' && o.carpeta.length > 0 ? { carpeta: o.carpeta } : {}) }
}

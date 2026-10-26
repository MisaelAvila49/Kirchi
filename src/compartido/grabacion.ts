import type { OpcionesGrabacion } from './ajustes'

/** Canales IPC de la grabación de pantalla. La interfaz nunca manda una ruta de destino: la decide el proceso principal. */
export const CANALES_GRABACION = {
  pedir: 'grabacion:pedir',
  guardar: 'grabacion:guardar',
  renombrar: 'grabacion:renombrar',
  abrirCarpeta: 'grabacion:abrir-carpeta',
  cambiarCarpeta: 'grabacion:cambiar-carpeta',
  restablecerCarpeta: 'grabacion:restablecer-carpeta'
} as const

/** Del proceso principal al editor: Kirchi se minimizó (true) o volvió (false). La grabación se pausa al minimizar. */
export const CANAL_AL_MINIMIZAR_GRABACION = 'grabacion:al-minimizar'

/** Tope de una grabación que se guarda (el WebM de varios minutos a 1080p pesa decenas de MB). */
export const MAX_BYTES_GRABACION = 1024 * 1024 * 1024
export const MAX_DURACION_GRABACION_MS = 6 * 60 * 60 * 1000
export const LARGO_MAXIMO_NOMBRE_CIRCUITO = 200

export type ResultadoPedirGrabacion = { ok: true } | { ok: false; error: string }
export interface DatosGuardarGrabacion {
  bytes: Uint8Array
  duracionMs: number
  nombreCircuito: string
  /** Contenedor de los bytes; sin él se entiende WebM. */
  contenedor?: 'mp4' | 'webm'
}
export interface GrabacionGuardada {
  ruta: string
  nombre: string
}

/** Lo que la interfaz puede hacer con la grabación: primero `pedir` (el proceso principal abre los permisos unos segundos), luego `getDisplayMedia` y, si hay micrófono, `getUserMedia` dentro de esos 5 s. */
export interface ApiGrabacion {
  pedir(opciones: OpcionesGrabacion): Promise<ResultadoPedirGrabacion>
  guardar(datos: DatosGuardarGrabacion): Promise<GrabacionGuardada>
  /** Recibe la ruta que devolvió `guardar`; abre el diálogo de guardar como. Nueva ruta o null si se canceló. */
  renombrar(ruta: string): Promise<string | null>
  abrirCarpeta(): Promise<void>
  /** Diálogo de carpeta; devuelve la carpeta elegida o null si se canceló. */
  cambiarCarpeta(): Promise<string | null>
  restablecerCarpeta(): Promise<void>
  /** Kirchi se minimizó (true) o volvió (false); devuelve cómo dejar de escuchar. */
  alMinimizar?(f: (minimizada: boolean) => void): () => void
}

import { alArrancar, normalizarAjustes, type Ajustes, type ApiKirchi } from '../../../compartido/ajustes'
import type { ApiArchivos } from '../../../compartido/archivos'
import type { ApiNgspice } from '../../../compartido/ngspice'
import type { ApiPlantillas } from '../../../compartido/plantillas'
import type { TamañoInterfaz } from '../../../compartido/ventana'

declare global {
  interface Window {
    /** API del preload; no existe fuera de Electron (Vitest, navegador). */
    kirchi?: ApiKirchi
  }
}

const api = (): ApiKirchi | undefined => (typeof window === 'undefined' ? undefined : window.kirchi)

/** Ajustes con que abrió la ventana. Sin preload (Vitest, arnés) valen los de por omisión; se normalizan por si llegan de
 * una versión anterior. */
export const ajustesIniciales = (): Ajustes => alArrancar(normalizarAjustes(api()?.ajustes))

/** La ventana se abrió con `--pruebas`: solo entonces existe la sonda `window.__kirchi`. */
export const modoPruebas = (): boolean => api()?.pruebas === true

/** API de archivos del preload; sin preload (Vitest, navegador sin Electron), undefined. */
export const apiArchivos = (): ApiArchivos | undefined => api()?.archivos
export const apiPlantillas = (): ApiPlantillas | undefined => api()?.plantillas
/** El puente con ngspice del preload (corre un análisis y lo cancela); sin preload, undefined. */
export const apiNgspice = (): ApiNgspice | undefined => api()?.ngspice

/** Órdenes a la ventana (pantalla completa, zoom de la página); sin preload, undefined, y la cinta las deshabilita. */
export const apiVentana = (): ApiKirchi['ventana'] => api()?.ventana

/** Escucha el tamaño de la interfaz que fija el proceso principal. Sin preload no hace nada y devuelve la forma de dejar
 * de escuchar. */
export function escucharTamañoInterfaz(f: (t: TamañoInterfaz) => void): () => void {
  return api()?.alTamañoInterfaz?.(f) ?? (() => undefined)
}

/** Guarda un parche en settings.json por el proceso principal y devuelve los ajustes normalizados que quedaron; sin
 * preload, undefined. */
export async function guardarAjustes(parche: Partial<Ajustes>): Promise<Ajustes | undefined> {
  const r = await api()?.guardarAjustes?.(parche)
  // Se normaliza otra vez: un proceso principal de otra versión (o el arnés sin ventana) puede no traer una clave nueva.
  return r === undefined ? undefined : normalizarAjustes(r)
}

/** Los ajustes vigentes del proceso principal (tras una recarga de la interfaz), normalizados; sin preload, undefined. */
export async function leerAjustes(): Promise<Ajustes | undefined> {
  const r = await api()?.leerAjustes?.()
  return r === undefined ? undefined : normalizarAjustes(r)
}

/** Solo cuenta la respuesta de la última petición: la de un parche viejo no debe deshacer uno más nuevo. */
export class UltimaRespuesta {
  private n = 0

  /** Marca una petición nueva; devuelve con qué saber después si sigue siendo la última. */
  pedir(): () => boolean {
    const mia = ++this.n
    return () => mia === this.n
  }
}

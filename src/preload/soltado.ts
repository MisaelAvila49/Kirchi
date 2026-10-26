import type { ResultadoAbrir } from '../compartido/archivos'

/**
 * Abre un archivo soltado sin que la página nombre rutas: la ruta se saca aquí con `webUtils.getPathForFile`. Un `File` armado en la página no tiene ruta y devuelve null.
 * El proceso principal vuelve a validar la ruta.
 */
export function abrirSoltadoCon(rutaDe: (f: File) => string, abrir: (ruta: string) => Promise<ResultadoAbrir>): (f: File) => Promise<ResultadoAbrir | null> {
  return async (f) => {
    let ruta = ''
    try {
      ruta = rutaDe(f)
    } catch {
      ruta = ''
    }
    return typeof ruta === 'string' && ruta.length > 0 ? abrir(ruta) : null
  }
}

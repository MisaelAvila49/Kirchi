/** Textos y utilidades de la grabación que ven la interfaz y las pruebas, aparte de `grabador.ts` para que el panel de
 * opciones y el aviso no dependan de la captura. */

/** Cuánto pesa un minuto de video. Medido en MP4 (ventana de 2560 × 1440, divisor simulando, 20 s con el ratón en movimiento): 1080p 2.55 MB, 720p 2.04 MB; en WebM salió casi igual (2.5 y 1.9 MB). Es el único lugar donde está. */
export const TEXTO_TAMAÑO_POR_MINUTO = 'Unos 2.5 MB por minuto en 1080p y 2 MB en 720p. Un circuito con mucho movimiento pesa más.'

/** Cómo se llama la carpeta de grabaciones mientras nadie eligió otra. */
export const CARPETA_POR_OMISION = 'Videos › Kirchi'

/** El nombre de una carpeta para mostrarlo: el último tramo de la ruta, o la carpeta por omisión si no hay ruta. */
export function nombreDeCarpeta(ruta: string | undefined): string {
  if (!ruta) return CARPETA_POR_OMISION
  const partes = ruta.split(/[\\/]+/).filter(Boolean)
  return partes.length ? partes[partes.length - 1] : ruta
}

/** El nombre de un archivo a partir de su ruta. */
export const nombreDeArchivo = (ruta: string): string => ruta.split(/[\\/]+/).filter(Boolean).pop() ?? ruta

export const textoGuardada = (carpeta: string | undefined): string => `Grabación guardada en ${nombreDeCarpeta(carpeta)}`

export const SIN_MICROFONO = 'Sin micrófono'

/** Lo que `enumerateDevices` entrega de cada dispositivo. */
export interface DispositivoLike {
  kind: string
  deviceId: string
  label: string
}
export interface OpcionMicrofono {
  id: string
  etiqueta: string
}

/** Micrófonos para el selector. Antes del permiso el navegador no da etiqueta: se rotulan «Micrófono 1», «Micrófono 2»…
 * por orden. Sin identificador no se puede elegir y se omite. */
export function etiquetasMicrofonos(dispositivos: readonly DispositivoLike[]): OpcionMicrofono[] {
  const entradas = dispositivos.filter((d) => d.kind === 'audioinput' && d.deviceId)
  return entradas.map((d, i) => ({ id: d.deviceId, etiqueta: d.label.trim() || `Micrófono ${i + 1}` }))
}

/** Los micrófonos del sistema; sin `mediaDevices` o si falla, ninguno. */
export async function listarMicrofonos(): Promise<OpcionMicrofono[]> {
  try {
    const md = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices
    if (!md?.enumerateDevices) return []
    return etiquetasMicrofonos(await md.enumerateDevices())
  } catch {
    return []
  }
}

import type { ApiKirchi } from '../compartido/ajustes'
import type { ApiArchivos } from '../compartido/archivos'

/** Lo que cada clase de ventana recibe en `window.kirchi`. Las ventanas aparte solo muestran datos: sin archivos, plantillas, ngspice, guardar ni órdenes de ventana. */
export function apiParaVentana(soloAparte: boolean, completa: ApiKirchi): ApiKirchi {
  if (!soloAparte) return completa
  const { ajustes, pruebas, graficas, osciloscopio, alTamañoInterfaz } = completa
  return { ajustes, pruebas, archivos: {} as ApiArchivos, graficas, osciloscopio, alTamañoInterfaz }
}

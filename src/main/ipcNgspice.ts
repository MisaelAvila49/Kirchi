import { ipcMain } from 'electron'
import { CANALES_NGSPICE, type ResultadoAnalisis } from '../compartido/ngspice'
import { ServicioNgspice } from './servicioNgspice'

/** IPC de ngspice: solo `PeticionAnalisis` (datos) y cancelar, nunca una línea de órdenes, una ruta ni texto de SPICE. Un trabajo por ventana y dos procesos en toda la aplicación. */
export function registrarNgspice(ejecutable: string | null, esPropia: (url: string | undefined) => boolean, esEditor: (id: number) => boolean, motivoAusente?: string): ServicioNgspice | null {
  const servicio = ejecutable ? new ServicioNgspice({ ejecutable }) : null
  const vigiladas = new Set<number>()
  ipcMain.handle(CANALES_NGSPICE.ejecutar, async (e, peticion: unknown): Promise<ResultadoAnalisis> => {
    if (!esPropia(e.senderFrame?.url) || !esEditor(e.sender.id)) throw new Error('origen no permitido')
    // Sin ejecutable, cada intento dice dónde se buscó: los controles siguen activos y el Registro explica por qué no corre.
    if (!servicio) return { ok: false, error: motivoAusente ?? 'ngspice no está instalado con Kirchi: los análisis no están disponibles.' }
    const id = e.sender.id
    if (!vigiladas.has(id)) {
      vigiladas.add(id)
      // Cerrar la ventana cancela lo suyo: no queda ningún ngspice corriendo para nadie.
      e.sender.once('destroyed', () => {
        vigiladas.delete(id)
        servicio.cancelar(id)
      })
    }
    return servicio.ejecutar(id, peticion)
  })
  ipcMain.handle(CANALES_NGSPICE.cancelar, (e) => {
    if (!esPropia(e.senderFrame?.url) || !esEditor(e.sender.id)) throw new Error('origen no permitido')
    servicio?.cancelar(e.sender.id)
  })
  return servicio
}

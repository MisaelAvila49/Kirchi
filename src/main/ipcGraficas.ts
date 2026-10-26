import { ipcMain } from 'electron'
import { CANALES_GRAFICAS } from '../compartido/graficas'
import { ServicioGraficas, type VentanaGraficas } from './servicioGraficas'

/** IPC de las gráficas en ventana aparte. Cada mensaje se acepta solo de una página propia: `abrir` de una ventana del editor, `pedir` y `exportar` de una ventana de gráficas que el servicio abrió. */
export function registrarGraficas(
  esEditor: (id: number) => boolean,
  esPropia: (url: string | undefined) => boolean,
  crear: (padre: number) => VentanaGraficas,
  alPadre: (padre: number, canal: string, mensaje: unknown) => void
): ServicioGraficas {
  const servicio = new ServicioGraficas({ crear, alPadre })
  ipcMain.handle(CANALES_GRAFICAS.abrir, (e, datos: unknown): boolean => {
    if (!esPropia(e.senderFrame?.url) || !esEditor(e.sender.id)) throw new Error('origen no permitido')
    return servicio.abrir(e.sender.id, datos)
  })
  ipcMain.handle(CANALES_GRAFICAS.actualizar, (e, datos: unknown): boolean => {
    if (!esPropia(e.senderFrame?.url) || !esEditor(e.sender.id)) throw new Error('origen no permitido')
    return servicio.actualizar(e.sender.id, datos)
  })
  ipcMain.handle(CANALES_GRAFICAS.pedir, (e) => {
    if (!esPropia(e.senderFrame?.url)) throw new Error('origen no permitido')
    return servicio.pedir(e.sender.id)
  })
  ipcMain.on(CANALES_GRAFICAS.exportar, (e, pedido: unknown) => {
    if (!esPropia(e.senderFrame?.url)) return
    servicio.exportar(e.sender.id, pedido)
  })
  ipcMain.on(CANALES_GRAFICAS.acoplar, (e, pedido: unknown) => {
    if (!esPropia(e.senderFrame?.url)) return
    servicio.acoplar(e.sender.id, pedido)
  })
  return servicio
}

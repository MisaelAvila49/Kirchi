import { ipcMain } from 'electron'
import { CANALES_OSC, type ResultadoActualizarOsc } from '../compartido/ventanaOsc'
import { ServicioOsc, type VentanaOsc } from './servicioOsc'

/** IPC del osciloscopio en ventana aparte. Cada mensaje se acepta solo de una página propia: `abrir` y `actualizar` del editor, `pedir`, `comando` y `acoplar` de una ventana que el servicio abrió. */
export function registrarOsc(
  esEditor: (id: number) => boolean,
  esPropia: (url: string | undefined) => boolean,
  crear: (padre: number) => VentanaOsc,
  alPadre: (padre: number, canal: string, mensaje: unknown) => void,
  enfocarPadre: (padre: number) => void
): ServicioOsc {
  const servicio = new ServicioOsc({ crear, alPadre, enfocarPadre })
  ipcMain.handle(CANALES_OSC.abrir, (e, datos: unknown): boolean => {
    if (!esPropia(e.senderFrame?.url) || !esEditor(e.sender.id)) throw new Error('origen no permitido')
    return servicio.abrir(e.sender.id, datos)
  })
  ipcMain.handle(CANALES_OSC.actualizar, (e, datos: unknown): ResultadoActualizarOsc => {
    if (!esPropia(e.senderFrame?.url) || !esEditor(e.sender.id)) throw new Error('origen no permitido')
    return servicio.actualizar(e.sender.id, datos)
  })
  ipcMain.handle(CANALES_OSC.cerrar, (e): boolean => {
    if (!esPropia(e.senderFrame?.url) || !esEditor(e.sender.id)) throw new Error('origen no permitido')
    return servicio.cerrarAPedido(e.sender.id)
  })
  ipcMain.handle(CANALES_OSC.pedir, (e) => {
    if (!esPropia(e.senderFrame?.url)) throw new Error('origen no permitido')
    return servicio.pedir(e.sender.id)
  })
  ipcMain.on(CANALES_OSC.comando, (e, orden: unknown) => {
    if (!esPropia(e.senderFrame?.url)) return
    servicio.comando(e.sender.id, orden)
  })
  ipcMain.on(CANALES_OSC.acoplar, (e) => {
    if (!esPropia(e.senderFrame?.url)) return
    servicio.acoplar(e.sender.id)
  })
  return servicio
}

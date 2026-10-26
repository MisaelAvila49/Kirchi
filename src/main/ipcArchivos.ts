import { randomUUID } from 'node:crypto'
import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, session, shell, type FileFilter, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import { CANALES, nombreDeRuta } from '../compartido/archivos'
import { CANALES_PLANTILLAS as PL } from '../compartido/plantillas'
import type { ControlCierre } from './cierre'
import { conLimite, ErrorPdf, LIMITE_PDF_MS, peticionPdfPermitida } from './pdf'
import { motivoDeError, type Dialogos, type ServicioArchivos, type TipoGuardar } from './servicioArchivos'

/** Lo que el proceso principal guarda de cada ventana: su servicio de archivos y su cierre. */
export interface Ventana {
  win: BrowserWindow
  servicio: ServicioArchivos
  cierre: ControlCierre
}

const FILTROS: Record<TipoGuardar, FileFilter> = {
  kir: { name: 'Circuito de Kirchi', extensions: ['kir'] },
  png: { name: 'Imagen PNG', extensions: ['png'] },
  svg: { name: 'Dibujo SVG', extensions: ['svg'] },
  pdf: { name: 'Documento PDF', extensions: ['pdf'] },
  csv: { name: 'Datos separados por comas (CSV)', extensions: ['csv'] }
}
const TITULOS: Record<TipoGuardar, string> = {
  kir: 'Guardar circuito', png: 'Exportar como PNG', svg: 'Exportar como SVG', pdf: 'Exportar como PDF', csv: 'Exportar los datos como CSV'
}

/** Los diálogos se llaman como `dialog.showOpenDialog(...)` en cada uso, no se guardan, para que las e2e puedan reemplazarlos. */
export function dialogosDe(win: BrowserWindow): Dialogos {
  return {
    abrir: async (carpeta) => {
      const r = await dialog.showOpenDialog(win, { title: 'Abrir circuito', ...(carpeta ? { defaultPath: carpeta } : {}), filters: [FILTROS.kir], properties: ['openFile'] })
      return r.canceled ? null : (r.filePaths[0] ?? null)
    },
    guardar: async (tipo, sugerida) => {
      const r = await dialog.showSaveDialog(win, { title: TITULOS[tipo], defaultPath: sugerida, filters: [FILTROS[tipo]], properties: ['showOverwriteConfirmation'] })
      return r.canceled || !r.filePath ? null : r.filePath
    },
    confirmarReemplazo: async (ruta) => {
      const r = await dialog.showMessageBox(win, {
        type: 'warning',
        title: 'Reemplazar archivo',
        message: `Ya existe ${nombreDeRuta(ruta)}. ¿Quieres reemplazarlo?`,
        detail: ruta,
        buttons: ['Reemplazar', 'Cancelar'],
        defaultId: 1,
        cancelId: 1,
        noLink: true
      })
      return r.response === 0
    },
    confirmarRed: async (ruta) => {
      const r = await dialog.showMessageBox(win, {
        type: 'warning',
        title: 'Archivo en una carpeta de red',
        message: 'Este archivo está en una carpeta de red. ¿Abrirlo?',
        detail: ruta,
        buttons: ['Abrir', 'Cancelar'],
        defaultId: 1,
        cancelId: 1,
        noLink: true
      })
      return r.response === 0
    }
  }
}

export const abrirCarpeta = (dir: string): Promise<string> => shell.openPath(dir)

/** Partición propia y en memoria de la ventana que imprime PDF: sin red y sin permisos. */
const PARTICION_PDF = 'kirchi-pdf'
let sesionPdf: Electron.Session | null = null
/** Los temporales que se están imprimiendo (uno por ventana): lo único `file:` que esa partición deja cargar. */
const temporalesPdf = new Set<string>()
function sesionDePdf(): Electron.Session {
  if (sesionPdf) return sesionPdf
  const s = session.fromPartition(PARTICION_PDF)
  // Solo el temporal que se imprime y lo que trae incrustado: ni la red ni otros archivos del disco.
  s.webRequest.onBeforeRequest((d, cb) => cb({ cancel: !(peticionPdfPermitida(d.url, null) || [...temporalesPdf].some((t) => peticionPdfPermitida(d.url, t))) }))
  s.setPermissionRequestHandler((_wc, _p, cb) => cb(false))
  return (sesionPdf = s)
}

/** Un paso de la impresión cuyo error de Chromium (que trae la ruta del temporal) se cambia por uno propio. */
async function paso<T>(p: Promise<T>, mensaje: string): Promise<T> {
  try {
    return await p
  } catch (e) {
    console.error(`pdf: ${e instanceof Error ? e.message : String(e)}`)
    throw new ErrorPdf(mensaje)
  }
}

/** Imprime `html` a PDF en una ventana oculta: va a un temporal (un `data:` de varios MB no carga), espera las fuentes y se destruye si pasa `LIMITE_PDF_MS`. Quien llama asegura uno a la vez. */
export async function imprimirPdf(html: string): Promise<Uint8Array> {
  const tmp = join(app.getPath('temp'), `kirchi-pdf-${randomUUID()}.html`)
  writeFileSync(tmp, html, { encoding: 'utf8', flag: 'wx' })
  temporalesPdf.add(tmp)
  const win = new BrowserWindow({
    show: false,
    width: 800,
    height: 600,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, session: sesionDePdf(), spellcheck: false, webgl: false }
  })
  const destruir = () => {
    if (!win.isDestroyed()) win.destroy()
  }
  try {
    return await conLimite(
      (async () => {
        await paso(win.loadFile(tmp), 'la página del PDF no cargó')
        // El HTML no trae guiones propios: esto solo espera a que las fuentes incrustadas estén listas.
        await paso(win.webContents.executeJavaScript('document.fonts.ready.then(() => document.fonts.size)', true), 'las fuentes del PDF no cargaron')
        const pdf = await paso(win.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true, margins: { top: 0, bottom: 0, left: 0, right: 0 } }), 'Chromium no pudo imprimirlo')
        return new Uint8Array(pdf)
      })(),
      LIMITE_PDF_MS,
      destruir
    )
  } finally {
    destruir()
    temporalesPdf.delete(tmp)
    try {
      rmSync(tmp, { force: true, maxRetries: 3 })
    } catch {
      // Un temporal retenido no tapa el resultado; queda en la carpeta temporal del sistema.
    }
  }
}

/** Canales de archivos: cada mensaje se acepta solo de una página propia (`esPropia`) y de una ventana conocida. */
export function registrarArchivos(ventanaDe: (id: number) => Ventana | undefined, esPropia: (url: string | undefined) => boolean): void {
  const de = (e: IpcMainInvokeEvent | IpcMainEvent): Ventana | undefined => (esPropia(e.senderFrame?.url) ? ventanaDe(e.sender.id) : undefined)
  const manejar = (canal: string, f: (v: Ventana, ...args: unknown[]) => unknown) =>
    ipcMain.handle(canal, async (e, ...args) => {
      const v = de(e)
      if (!v) throw new Error('origen no permitido')
      try {
        return await f(v, ...args)
      } catch (err) {
        // Un error del sistema de Node trae la ruta completa: a la interfaz solo llega el motivo.
        console.error(`${canal}: ${err instanceof Error ? err.message : String(err)}`)
        throw new Error((err as NodeJS.ErrnoException)?.code ? motivoDeError(err) : err instanceof Error ? err.message : 'error del sistema')
      }
    })
  // Un mensaje sin respuesta que falla (el disco lleno al anotar el diario) no debe tirar el proceso
  // principal: se registra en la consola y la interfaz sigue.
  const escuchar = (canal: string, f: (v: Ventana, ...args: unknown[]) => void) =>
    ipcMain.on(canal, (e, ...args) => {
      const v = de(e)
      if (!v) return
      try {
        f(v, ...args)
      } catch (err) {
        console.error(`${canal}: ${err instanceof Error ? err.message : String(err)}`)
      }
    })

  manejar(CANALES.abrir, (v) => v.servicio.abrir())
  manejar(CANALES.abrirReciente, (v, ruta) => v.servicio.abrirReciente(ruta))
  manejar(CANALES.abrirSoltado, (v, ruta) => v.servicio.abrirSoltado(ruta))
  manejar(CANALES.inicial, (v) => v.servicio.inicial())
  manejar(CANALES.rutaGuardar, (v, sugerida) => v.servicio.rutaGuardar(sugerida))
  manejar(CANALES.guardar, (v, ruta, bytes) => v.servicio.guardar(ruta, bytes))
  manejar(CANALES.olvidarRecientes, (v) => v.servicio.olvidarRecientes())
  manejar(CANALES.abrirRespaldos, (v) => v.servicio.abrirRespaldos())
  manejar(CANALES.rutaExportar, (v, formato, sugerida) => v.servicio.rutaExportar(formato, sugerida))
  manejar(CANALES.escribirExportacion, (v, ruta, bytes) => v.servicio.escribirExportacion(ruta, bytes))
  manejar(CANALES.pdf, (v, ruta, svg, pagina) => v.servicio.exportarPdf(ruta, svg, pagina))
  manejar(CANALES.recuperables, (v) => v.servicio.recuperables())
  manejar(CANALES.recuperar, (v, id) => v.servicio.recuperar(id))
  manejar(CANALES.descartar, (v, id) => v.servicio.descartar(id))
  manejar(PL.listar, (v) => v.servicio.listarPlantillas())
  manejar(PL.leer, (v, categoria, nombre) => v.servicio.leerPlantilla(categoria, nombre))
  manejar(PL.guardar, (v, categoria, nombre, bytes, reemplazar) => v.servicio.guardarPlantilla(categoria, nombre, bytes, reemplazar))
  manejar(PL.renombrar, (v, categoria, nombre, nuevo) => v.servicio.renombrarPlantilla(categoria, nombre, nuevo))
  manejar(PL.mover, (v, categoria, nombre, nueva) => v.servicio.moverPlantilla(categoria, nombre, nueva))
  manejar(PL.borrar, (v, categoria, nombre) => v.servicio.borrarPlantilla(categoria, nombre))
  manejar(PL.borrarCategoria, (v, categoria, confirmada) => v.servicio.borrarCategoria(categoria, confirmada))
  manejar(PL.mostrar, (v, categoria) => v.servicio.mostrarPlantillas(categoria))
  escuchar(CANALES.diarioBase, (v, bytes, base) => v.servicio.diarioBase(bytes, base))
  escuchar(CANALES.diarioAnotar, (v, renglon) => v.servicio.diarioAnotar(renglon))
  escuchar(CANALES.estadoVentana, (v, estado) => v.cierre.ponerEstado(estado))
  escuchar(CANALES.cerrar, (v, descartar) => v.cierre.cerrar(descartar))
}

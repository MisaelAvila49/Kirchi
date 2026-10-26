import { CANALES } from '../compartido/archivos'

/** Lo que usa el cierre de una BrowserWindow; en las pruebas, un objeto con eventos. */
export interface VentanaCerrable {
  on(evento: 'close', f: (e: { preventDefault(): void }) => void): unknown
  on(evento: 'closed' | 'unresponsive' | 'responsive' | 'session-end', f: () => void): unknown
  close(): void
  webContents: {
    send(canal: string): void
    on(evento: 'render-process-gone', f: () => void): unknown
  }
}

/**
 * Cierre con cambios sin guardar: la ventana no se cierra, la interfaz pregunta y contesta con `cerrar`. Sin cambios, sin respuesta, al apagar el equipo o con `app.quit()` se cierra directo.
 * El diario se borra solo si no quedó nada sin guardar o el usuario lo descartó.
 */
export class ControlCierre {
  private sucio = false
  private permitido = false
  private descartado = false
  private sinRespuesta = false
  private saliendo = false

  constructor(private win: VentanaCerrable, private sesion: { terminar(): void }) {
    win.on('close', (e) => {
      if (this.permitido || this.saliendo || this.sinRespuesta || !this.sucio) return
      e.preventDefault()
      win.webContents.send(CANALES.pideCerrar)
    })
    win.on('closed', () => {
      if (!this.sucio || this.descartado) {
        // Borrar el diario que no se pudo (archivo retenido) no tira el proceso principal.
        try {
          this.sesion.terminar()
        } catch (e) {
          console.error(`diario: ${e instanceof Error ? e.message : String(e)}`)
        }
      }
    })

    win.on('unresponsive', () => (this.sinRespuesta = true))
    win.on('responsive', () => (this.sinRespuesta = false))
    win.on('session-end', () => (this.saliendo = true))
    win.webContents.on('render-process-gone', () => (this.sinRespuesta = true))
  }

  /** La interfaz avisa si hay cambios sin guardar. */
  ponerEstado(e: unknown): void {
    this.sucio = (e as { sucio?: unknown } | null)?.sucio === true
  }

  /** Salir sin preguntar y sin borrar el diario (pruebas con `app.quit()`). */
  salirSinPreguntar(): void {
    this.saliendo = true
  }

  /** La interfaz ya resolvió: con `descartar`, el usuario eligió No guardar. */
  cerrar(descartar: unknown): void {
    this.permitido = true
    this.descartado = descartar === true
    this.win.close()
  }
}

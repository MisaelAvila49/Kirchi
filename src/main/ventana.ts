import { CANAL_ORDEN_VENTANA, CANAL_TAMAÑO_INTERFAZ, esOrdenVentana, tamañoTrasOrden, type EstadoVentana, type OrdenTamaño, type TamañoInterfaz } from '../compartido/ventana'

/** Lo que hace falta de una `BrowserWindow` para una orden (así se prueba sin Electron). */
export interface VentanaOrdenable {
  isFullScreen(): boolean
  setFullScreen(v: boolean): void
}

/** Cambia el tamaño de la interfaz de todas las ventanas (`controlDeTamaño`). */
export type CambiarTamaño = (orden: OrdenTamaño) => void

/** Hace lo de los ítems del menú Ver (zoom al tamaño de la interfaz, pantalla completa). Devuelve false si no es una orden. */
export function aplicarOrdenVentana(w: VentanaOrdenable, orden: unknown, tamaño: CambiarTamaño): boolean {
  if (!esOrdenVentana(orden)) return false
  if (orden === 'pantalla-completa') w.setFullScreen(!w.isFullScreen())
  else tamaño(orden)
  return true
}

/** Lo que hace falta de una ventana para ponerle el tamaño de la interfaz. */
export interface VentanaConZoom {
  isDestroyed(): boolean
  webContents: { setZoomFactor(f: number): void; send(canal: string, ...args: unknown[]): void }
}

/** El factor de zoom de Chromium de un tamaño. */
export const factorDe = (t: TamañoInterfaz): number => t / 100

/** Pone `t` en cada ventana viva y les avisa el valor (para que Configuración lo muestre). */
export function aplicarTamaño(t: TamañoInterfaz, ventanas: Iterable<VentanaConZoom>): void {
  for (const w of ventanas) {
    if (w.isDestroyed()) continue
    w.webContents.setZoomFactor(factorDe(t))
    w.webContents.send(CANAL_TAMAÑO_INTERFAZ, t)
  }
}

/** Único que cambia el tamaño de la interfaz por una orden: pasa al paso siguiente, lo guarda y lo aplica en todas las ventanas del editor. */
export function controlDeTamaño(o: { actual(): TamañoInterfaz; poner(t: TamañoInterfaz): void; ventanas(): Iterable<VentanaConZoom> }): CambiarTamaño {
  return (orden) => {
    const t = tamañoTrasOrden(o.actual(), orden)
    if (t !== o.actual()) o.poner(t)
    aplicarTamaño(t, o.ventanas())
  }
}

/** Lo que hace falta de un evento de `ipcMain` (así se prueba sin Electron). */
export interface EventoOrden {
  sender: { id: number; mainFrame: unknown }
  senderFrame?: { url?: string } | null
}

/** Ventana del editor a la que va una orden, o undefined: solo del marco principal de una página propia y solo de una ventana del editor, no la oculta del PDF. */
export function ventanaDeOrden<W>(e: EventoOrden, ventanaDe: (id: number) => W | undefined, esPropia: (url: string | undefined) => boolean): W | undefined {
  if (!e.senderFrame || e.senderFrame !== e.sender.mainFrame || !esPropia(e.senderFrame.url)) return undefined
  return ventanaDe(e.sender.id)
}

/** Vista › Ventana de la barra superior: lo mismo que los ítems del menú Ver, que en Windows y Linux van ocultos. */
export function registrarVentana(
  ipc: { on(canal: string, oyente: (e: EventoOrden, orden: unknown) => void): unknown },
  ventanaDe: (id: number) => VentanaOrdenable | undefined,
  esPropia: (url: string | undefined) => boolean,
  tamaño: CambiarTamaño
): void {
  ipc.on(CANAL_ORDEN_VENTANA, (e, orden) => {
    const w = ventanaDeOrden(e, ventanaDe, esPropia)
    if (w) aplicarOrdenVentana(w, orden, tamaño)
  })
}

/** Lo que hace falta de una `BrowserWindow` para anotar cómo está. */
export interface VentanaMedible {
  isMaximized(): boolean
  isFullScreen(): boolean
  isMinimized(): boolean
  getNormalBounds(): { x: number; y: number; width: number; height: number }
}

/** Estado de la ventana: rectángulo en modo ventana y sus dos modos. Minimizada conserva el rectángulo normal, porque abrir minimizada confunde. */
export function estadoDeVentanaViva(w: VentanaMedible): EstadoVentana {
  const b = w.getNormalBounds()
  return { x: b.x, y: b.y, ancho: b.width, alto: b.height, maximizada: w.isMaximized(), pantallaCompleta: w.isFullScreen() }
}

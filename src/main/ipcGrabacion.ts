/**
 * Permisos e IPC de la grabación. Se niega todo salvo la captura de la ventana propia y el micrófono, y solo en los 5 s siguientes a que el usuario pidió grabar desde una página propia.
 * Todo lo del sistema entra por `DepsPermisos` y `DepsIpcGrabacion`, así las pruebas corren sin Electron.
 */
import { basename } from 'node:path'
import { grabacionPorOmision, normalizarAjustes, type OpcionesGrabacion } from '../compartido/ajustes'
import {
  CANALES_GRABACION as CG,
  LARGO_MAXIMO_NOMBRE_CIRCUITO,
  MAX_BYTES_GRABACION,
  MAX_DURACION_GRABACION_MS,
  type GrabacionGuardada,
  type ResultadoPedirGrabacion
} from '../compartido/grabacion'
import { escribirDuracion } from './cabeceraWebm'
import type { ServicioGrabacion } from './servicioGrabacion'

/** Cuánto dura abierta la ventana de permisos tras pedir grabar. */
export const VENTANA_PERMISOS_MS = 5000

export const AVISO_PANTALLA_DENEGADA =
  'macOS no permite a Kirchi grabar la pantalla. Actívalo en Ajustes del Sistema › Privacidad y seguridad › Grabación de pantalla y vuelve a intentarlo.'
export const AVISO_MICROFONO_DENEGADO =
  'macOS no permite a Kirchi usar el micrófono. Actívalo en Ajustes del Sistema › Privacidad y seguridad › Micrófono y vuelve a intentarlo.'

type Estado = 'not-determined' | 'granted' | 'denied' | 'restricted' | 'unknown'

export interface DepsPermisos {
  ahora(): number
  plataforma: string
  estadoMedia(tipo: 'screen' | 'microphone'): Estado
  esPropia(url: string | undefined): boolean
  /** Id del webContents a partir de lo que entrega Electron (el webContents o el marco que pide). */
  idDe(origen: unknown): number | undefined
  /** `getMediaSourceId()` de la ventana de ese webContents (`window:ID:0`), o undefined si ya no existe. */
  idFuenteDeVentana(webContentsId: number): string | undefined
  /** Fuentes de ventana disponibles para capturar. */
  fuentesDeVentana(): Promise<{ id: string; name: string }[]>
}

interface Pedido {
  webContentsId: number
  hasta: number
  conMicrofono: boolean
  captura: boolean
}

interface DetallesPermiso {
  requestingUrl?: string
  mediaTypes?: string[]
}
interface PeticionPantalla {
  frame?: { url: string } | null
}
export interface SesionPermisos {
  setPermissionRequestHandler(f: (wc: unknown, permiso: string, cb: (permitido: boolean) => void, detalles: DetallesPermiso) => void): void
  setDisplayMediaRequestHandler(f: (peticion: PeticionPantalla, cb: (fuentes: { video: { id: string; name: string } } | null) => void) => void): void
}

const denegado = (e: Estado): boolean => e === 'denied' || e === 'restricted'

export class PermisosGrabacion {
  private pedido: Pedido | null = null

  constructor(private readonly deps: DepsPermisos) {}

  /** El usuario pide grabar: comprueba el sistema y abre la ventana de permisos. */
  pedir(webContentsId: number, opciones: OpcionesGrabacion): ResultadoPedirGrabacion {
    this.pedido = null
    if (this.deps.plataforma === 'darwin') {
      if (denegado(this.deps.estadoMedia('screen'))) return { ok: false, error: AVISO_PANTALLA_DENEGADA }
      if (opciones.microfono !== null && denegado(this.deps.estadoMedia('microphone'))) return { ok: false, error: AVISO_MICROFONO_DENEGADO }
    }
    this.pedido = { webContentsId, hasta: this.deps.ahora() + VENTANA_PERMISOS_MS, conMicrofono: opciones.microfono !== null, captura: true }
    return { ok: true }
  }

  private vigente(): Pedido | null {
    const p = this.pedido
    if (!p) return null
    if (this.deps.ahora() > p.hasta) {
      this.pedido = null
      return null
    }
    return p
  }

  /** Para `setPermissionRequestHandler`: niega todo salvo el micrófono (solo audio) y el permiso previo de la captura de la ventana del pedido vigente. */
  permiso(wc: unknown, permiso: string, detalles: DetallesPermiso): boolean {
    if (permiso !== 'media') return false
    const p = this.vigente()
    if (!p) return false
    const tipos = detalles?.mediaTypes
    // `getDisplayMedia` llega como «media» sin tipos (Electron 44): se concede solo mientras la captura del pedido sigue sin entregarse.
    if (Array.isArray(tipos) && tipos.length === 0) {
      return p.captura && this.deps.esPropia(detalles.requestingUrl) && this.deps.idDe(wc) === p.webContentsId
    }
    if (!p.conMicrofono) return false
    if (!Array.isArray(tipos) || tipos.length !== 1 || tipos[0] !== 'audio') return false
    if (!this.deps.esPropia(detalles.requestingUrl)) return false
    if (this.deps.idDe(wc) !== p.webContentsId) return false
    // Una sola vez por grabación: otra petición de audio dentro de la ventana de tiempo se niega.
    p.conMicrofono = false
    return true
  }

  /** Para `setDisplayMediaRequestHandler`: entrega solo la fuente de la ventana que pidió, una vez. */
  async pantalla(peticion: PeticionPantalla): Promise<{ video: { id: string; name: string } } | null> {
    const p = this.vigente()
    if (!p || !p.captura) return null
    if (!this.deps.esPropia(peticion.frame?.url) || this.deps.idDe(peticion.frame) !== p.webContentsId) return null
    const propia = this.deps.idFuenteDeVentana(p.webContentsId)
    if (!propia) return null
    p.captura = false
    const fuente = (await this.deps.fuentesDeVentana()).find((f) => f.id === propia)
    return fuente ? { video: { id: fuente.id, name: fuente.name } } : null
  }

  /** Cierra la ventana de permisos (la grabación terminó o falló). */
  cerrar(): void {
    this.pedido = null
  }
}

/** Pone los controladores en una sesión: sin pedido vigente todo se niega, como antes. */
export function instalarPermisos(ses: SesionPermisos, permisos: PermisosGrabacion): void {
  ses.setPermissionRequestHandler((wc, permiso, cb, detalles) => cb(permisos.permiso(wc, permiso, detalles)))
  ses.setDisplayMediaRequestHandler((peticion, cb) => {
    permisos.pantalla(peticion).then(
      (r) => cb(r),
      () => cb(null)
    )
  })
}

export interface DepsIpcGrabacion {
  servicio: ServicioGrabacion
  permisos: PermisosGrabacion
  esPropia(url: string | undefined): boolean
  /** ¿Es el id de una ventana del editor? */
  esEditor(webContentsId: number): boolean
  /** `shell.openPath`: devuelve '' si abrió, o el texto del error. */
  abrirRuta(ruta: string): Promise<string>
  /** Diálogo de carpeta de la ventana; null si se canceló. */
  elegirCarpeta(webContentsId: number, inicial: string): Promise<string | null>
  /** Anota o borra (undefined) la carpeta en los ajustes. */
  fijarCarpeta(ruta: string | undefined): void
}

interface Evento {
  sender: { id: number }
  senderFrame?: { url: string } | null
}
export interface IpcInvocable {
  handle(canal: string, f: (e: Evento, ...args: unknown[]) => unknown): unknown
}

const esObjeto = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)

/** Opciones recibidas de la interfaz: un objeto con los cuatro campos y cada uno válido; si no, error. */
export function validarOpciones(v: unknown): OpcionesGrabacion {
  const error = new Error('Opciones de grabación no válidas.')
  if (!esObjeto(v)) throw error
  const limpio = normalizarAjustes({ grabacion: v }).grabacion
  for (const k of Object.keys(grabacionPorOmision()) as (keyof OpcionesGrabacion)[]) if (!(k in v) || limpio[k] !== v[k]) throw error
  return limpio
}

export function registrarGrabacion(ipc: IpcInvocable, d: DepsIpcGrabacion): void {
  const verificar = (e: Evento): number => {
    if (!d.esPropia(e.senderFrame?.url) || !d.esEditor(e.sender.id)) throw new Error('origen no permitido')
    return e.sender.id
  }
  ipc.handle(CG.pedir, (e, opciones): ResultadoPedirGrabacion => d.permisos.pedir(verificar(e), validarOpciones(opciones)))
  ipc.handle(CG.guardar, (e, datos): GrabacionGuardada => {
    verificar(e)
    d.permisos.cerrar()
    if (!esObjeto(datos)) throw new Error('Datos de grabación no válidos.')
    const { bytes, duracionMs, nombreCircuito, contenedor = 'webm' } = datos
    if (contenedor !== 'mp4' && contenedor !== 'webm') throw new Error('Formato de grabación no válido.')
    if (!(bytes instanceof Uint8Array) || bytes.length === 0 || bytes.length > MAX_BYTES_GRABACION) throw new Error('La grabación está vacía o es demasiado grande.')
    if (typeof duracionMs !== 'number' || !Number.isFinite(duracionMs) || duracionMs < 0 || duracionMs > MAX_DURACION_GRABACION_MS) throw new Error('Duración de grabación no válida.')
    if (typeof nombreCircuito !== 'string' || nombreCircuito.length > LARGO_MAXIMO_NOMBRE_CIRCUITO) throw new Error('Nombre de circuito no válido.')
    const ruta = d.servicio.guardar(contenedor === 'webm' ? escribirDuracion(bytes, duracionMs) : bytes, nombreCircuito, contenedor)
    return { ruta, nombre: basename(ruta) }
  })
  ipc.handle(CG.renombrar, async (e, ruta): Promise<string | null> => {
    verificar(e)
    if (typeof ruta !== 'string' || ruta.length === 0 || ruta.length > 4096) throw new Error('Ruta no válida.')
    // El servicio solo mueve lo que él mismo guardó en esta sesión y el destino sale de su propio diálogo.
    return d.servicio.renombrar(ruta)
  })
  ipc.handle(CG.abrirCarpeta, async (e): Promise<void> => {
    verificar(e)
    if (await d.abrirRuta(d.servicio.carpetaGrabaciones())) throw new Error('No se pudo abrir la carpeta de grabaciones.')
  })
  ipc.handle(CG.cambiarCarpeta, async (e): Promise<string | null> => {
    const id = verificar(e)
    const elegida = await d.elegirCarpeta(id, d.servicio.carpetaGrabaciones())
    if (!elegida) return null
    d.fijarCarpeta(elegida)
    return d.servicio.carpetaGrabaciones()
  })
  ipc.handle(CG.restablecerCarpeta, (e): void => {
    verificar(e)
    d.fijarCarpeta(undefined)
  })
}

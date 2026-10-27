import { lstatSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'
import { CANALES_ASISTENTE as CA, type EstadoAsistente, type PeticionAsistente } from '../../compartido/asistente'
import { ServidorTuberia } from './servidorTuberia'

/** Lo que el proceso principal pone: ajustes, ventanas y diálogos. Nada de Electron aquí, para probarlo sin ventana. */
export interface DepsVentanaAsistente {
  ipc: {
    handle(canal: string, f: (e: EventoIpc, ...args: unknown[]) => unknown): void
    on(canal: string, f: (e: EventoIpc, ...args: unknown[]) => void): void
  }
  dirDatos: string
  esPropia(url: string | undefined): boolean
  /** La ventana del editor a la que se une un asistente: la que tiene el foco o, si no, la primera. */
  ventanaDeDestino(): number | undefined
  existeVentana(id: number): boolean
  esEditor(id: number): boolean
  enviar(id: number, canal: string, ...args: unknown[]): void
  difundir(canal: string, ...args: unknown[]): void
  /** Lo que dicen los ajustes ahora. */
  activo(): boolean
  carpeta(): string | undefined
  /** Anotan en los ajustes (el proceso principal los escribe a disco). */
  fijarActivo(activo: boolean): void
  fijarCarpeta(ruta: string | null): void
  /** El diálogo de carpeta del sistema; null si se cancela. */
  elegirCarpeta(ventana: number, inicial: string | undefined): Promise<string | null>
  textoConfiguracion(): string
  /** Aviso de falla que no debe tumbar el proceso. */
  avisarError(texto: string): void
  /** La carpeta del asistente vigente (la elegida o la de omisión): lo único que el puente puede pedir que se abra. */
  carpetaAsistente(): string | undefined
  /** La ventana del editor que tiene abierto ese archivo, si alguna. */
  ventanaConArchivo(ruta: string): number | undefined
  /** Abre el archivo en una ventana nueva, sin tocar el documento de las demás. */
  abrirEnVentanaNueva(ruta: string): void
  plataforma?: NodeJS.Platform
}

export interface EventoIpc {
  sender: { id: number }
  senderFrame?: { url: string } | null
}

const ESPERA_VENTANA_MS = 20_000
/** Lo que tarda como mucho una ventana nueva en cargar el circuito que el puente pidió abrir. */
export const ESPERA_APERTURA_MS = 15_000
const YA_NO_ABIERTO = 'El circuito ya no está abierto en Kirchi.'

/**
 * El lado del proceso principal del asistente: abre la tubería solo con el interruptor encendido, reenvía las peticiones
 * del puente a la ventana a la que se unió y atiende los canales de Configuración y del indicador. El asistente solo llega
 * al circuito por el receptor de esa ventana (el núcleo de edición, con su deshacer).
 */
export class VentanaAsistente {
  private readonly servidor: ServidorTuberia
  private vinculada: number | null = null
  private siguiente = 1
  private readonly esperando = new Map<number, { ventana: number; ok(x: unknown): void; mal(e: Error): void }>()
  /** Archivos que el puente pidió abrir y todavía cargan, con la hora límite. */
  private readonly abriendo = new Map<string, number>()

  constructor(private readonly deps: DepsVentanaAsistente) {
    this.servidor = new ServidorTuberia({
      dirDatos: deps.dirDatos,
      atender: (tipo, datos) => this.atender(tipo, datos),
      // Los puentes unidos comparten la ventana: la elige el primero y se suelta cuando se va el último.
      alUnirse: () => {
        if (this.vinculada === null || !deps.existeVentana(this.vinculada)) this.vinculada = deps.ventanaDeDestino() ?? null
        this.difundir()
      },
      alIrse: (quedan) => {
        if (quedan === 0) {
          this.vinculada = null
          this.soltarPendientes('El asistente se desconectó.')
        }
        this.difundir()
      }
    })
  }

  estado(): EstadoAsistente {
    const c = this.servidor.conectado
    const carpeta = this.deps.carpeta()
    return { activo: this.deps.activo(), conectado: c === null ? null : { cliente: c }, ...(carpeta ? { carpeta } : {}) }
  }

  private difundir(): void {
    this.deps.difundir(CA.alEstado, this.estado())
  }

  /** Abre o cierra la tubería según lo que dicen los ajustes. */
  async reconciliar(): Promise<void> {
    try {
      if (this.deps.activo() && !this.servidor.abierto) await this.servidor.abrir()
      else if (!this.deps.activo() && this.servidor.abierto) this.servidor.cerrar()
    } catch (e) {
      this.deps.avisarError(`No se pudo abrir la tubería del asistente: ${e instanceof Error ? e.message : String(e)}`)
    }
    this.difundir()
  }

  cerrar(): void {
    if (this.servidor.abierto) this.servidor.cerrar()
  }

  /** Si la ventana a la que se unió el asistente se cierra, pasa a otra del editor; sin otra, el asistente se suelta. */
  ventanaCerrada(id: number): void {
    if (this.vinculada !== id) return
    const otra = this.deps.ventanaDeDestino()
    if (otra !== undefined && otra !== id && this.deps.existeVentana(otra)) this.vinculada = otra
    else this.servidor.desconectar()
  }

  /** La clave con que se comparan rutas: la ruta real (el nombre corto de Windows y un enlace a la carpeta dan la misma) y,
   * en Windows y macOS, sin distinguir mayúsculas. */
  private clave(ruta: string): string {
    const p = this.deps.plataforma ?? process.platform
    let real = resolve(ruta)
    try {
      real = realpathSync.native(real)
    } catch {
      // Todavía no existe: basta la ruta resuelta.
    }
    return p === 'linux' ? real : real.toLowerCase()
  }

  /** Un `.kir` real (no un enlace) directamente dentro de la carpeta del asistente; si no, null. */
  private rutaDelAsistente(ruta: unknown): string | null {
    const carpeta = this.deps.carpetaAsistente()
    if (typeof ruta !== 'string' || !carpeta || ruta.length > 1024 || !isAbsolute(ruta) || !/\.kir$/i.test(ruta)) return null
    if (this.clave(dirname(ruta)) !== this.clave(carpeta)) return null
    try {
      return lstatSync(ruta).isFile() ? resolve(ruta) : null
    } catch {
      return null
    }
  }

  /** Las peticiones que resuelve el proceso principal (dónde está abierto un archivo, abrir uno nuevo) y las que van a una ventana. */
  private async atender(tipo: string, datos: unknown): Promise<unknown> {
    const d = (typeof datos === 'object' && datos !== null ? datos : {}) as { ruta?: unknown }
    if (tipo === 'dondeEsta') {
      const ruta = this.rutaDelAsistente(d.ruta)
      if (!ruta) return { abierto: false }
      const k = this.clave(ruta)
      if (this.deps.ventanaConArchivo(ruta) !== undefined) {
        this.abriendo.delete(k)
        return { abierto: true }
      }
      const limite = this.abriendo.get(k)
      if (limite !== undefined && Date.now() < limite) return { abierto: false, cargando: true }
      this.abriendo.delete(k)
      return { abierto: false }
    }
    if (tipo === 'abrir') {
      const ruta = this.rutaDelAsistente(d.ruta)
      if (!ruta) throw new Error('Solo se abren circuitos de la carpeta del asistente.')
      if (this.deps.ventanaConArchivo(ruta) === undefined) {
        this.abriendo.set(this.clave(ruta), Date.now() + ESPERA_APERTURA_MS)
        this.deps.abrirEnVentanaNueva(ruta)
      }
      return { ok: true }
    }
    // Una petición sobre un archivo va a la ventana que lo tiene abierto; sin archivo, a la ventana unida.
    if (d.ruta !== undefined) {
      const ruta = this.rutaDelAsistente(d.ruta)
      const v = ruta ? this.deps.ventanaConArchivo(ruta) : undefined
      if (v === undefined) throw new Error(YA_NO_ABIERTO)
      return this.reenviar(tipo, datos, v)
    }
    return this.reenviar(tipo, datos)
  }

  registrar(): void {
    const { ipc } = this.deps
    const propio = (e: EventoIpc) => this.deps.esEditor(e.sender.id) && this.deps.esPropia(e.senderFrame?.url)
    ipc.handle(CA.estado, (e) => {
      if (!propio(e)) throw new Error('origen no permitido')
      return this.estado()
    })
    ipc.handle(CA.activar, async (e, activo) => {
      if (!propio(e) || typeof activo !== 'boolean') throw new Error('origen no permitido')
      this.deps.fijarActivo(activo)
      await this.reconciliar()
      return this.estado()
    })
    ipc.handle(CA.cambiarCarpeta, async (e) => {
      if (!propio(e)) throw new Error('origen no permitido')
      const ruta = await this.deps.elegirCarpeta(e.sender.id, this.deps.carpeta())
      if (ruta) {
        this.deps.fijarCarpeta(ruta)
        this.difundir()
      }
      return ruta
    })
    ipc.handle(CA.restablecerCarpeta, (e) => {
      if (!propio(e)) throw new Error('origen no permitido')
      this.deps.fijarCarpeta(null)
      this.difundir()
    })
    ipc.handle(CA.desconectar, (e) => {
      if (!propio(e)) throw new Error('origen no permitido')
      this.servidor.desconectar()
    })
    ipc.handle(CA.textoConfiguracion, (e) => {
      if (!propio(e)) throw new Error('origen no permitido')
      return this.deps.textoConfiguracion()
    })
    // La respuesta a una petición solo vale si viene de la ventana a la que se mandó.
    ipc.on(CA.respuesta, (e, id, respuesta) => {
      if (!propio(e) || typeof id !== 'number') return
      const p = this.esperando.get(id)
      if (!p || p.ventana !== e.sender.id) return
      this.esperando.delete(id)
      p.ok(respuesta)
    })
  }

  private reenviar(tipo: string, datos: unknown, ventana?: number): Promise<unknown> {
    const v = ventana ?? this.vinculada
    if (v === null || !this.deps.existeVentana(v)) return Promise.reject(new Error('No hay una ventana de Kirchi disponible.'))
    const id = this.siguiente++
    return new Promise((ok, mal) => {
      const t = setTimeout(() => {
        this.esperando.delete(id)
        mal(new Error('Kirchi no respondió a tiempo.'))
      }, ESPERA_VENTANA_MS)
      this.esperando.set(id, { ventana: v, ok: (x) => (clearTimeout(t), ok(x)), mal: (e) => (clearTimeout(t), mal(e)) })
      const p: PeticionAsistente = { id, tipo, datos }
      this.deps.enviar(v, CA.peticion, p)
    })
  }

  private soltarPendientes(motivo: string): void {
    for (const p of this.esperando.values()) p.mal(new Error(motivo))
    this.esperando.clear()
  }
}

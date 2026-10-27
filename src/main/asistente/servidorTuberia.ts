import { createServer, type Server, type Socket } from 'node:net'
import { chmodSync, rmSync } from 'node:fs'
import { StringDecoder } from 'node:string_decoder'
import { limpiarCliente, MAX_ASISTENTES, MAX_MENSAJE_TUBERIA, TEXTO_YA_CONECTADO, VERSION_TUBERIA, type MensajeTuberia } from '../../compartido/asistente'
import { borrarLlave, crearLlave, mismaLlave, nombreTuberia } from './llave'

/** Lo que el primer mensaje tiene que traer o la conexión se cierra. */
const ESPERA_HOLA_MS = 5000

export interface DepsServidorTuberia {
  /** La carpeta de datos de la aplicación: de ella salen el nombre de la tubería y la llave. */
  dirDatos: string
  plataforma?: NodeJS.Platform
  /** Atiende una petición ya autenticada; si lanza, el cliente recibe el motivo como error. */
  atender(tipo: string, datos: unknown): Promise<unknown>
  alUnirse(cliente: string): void
  /** Un puente se fue; `quedan` dice cuántos siguen unidos. */
  alIrse(quedan: number): void
}

/** Revisa una línea: JSON de la forma `{v: 1, id, tipo, datos}` o null. */
export function leerMensaje(linea: string): MensajeTuberia | null {
  try {
    const m = JSON.parse(linea) as Partial<MensajeTuberia> | null
    if (m === null || typeof m !== 'object' || m.v !== VERSION_TUBERIA || typeof m.id !== 'number' || !Number.isSafeInteger(m.id) || typeof m.tipo !== 'string' || m.tipo.length > 40) return null
    return { v: 1, id: m.id, tipo: m.tipo, datos: m.datos }
  } catch {
    return null
  }
}

export const lineaDe = (m: MensajeTuberia): string => `${JSON.stringify(m)}\n`

/**
 * La tubería local del asistente (tubería con nombre en Windows, socket de dominio en macOS y Linux: nunca un puerto). Se abre
 * solo con el interruptor encendido y exige la llave del archivo `asistente.llave` en el primer mensaje: en Windows una
 * tubería acepta por omisión lecturas de otras cuentas. Admite varios puentes a la vez (un cliente como Claude Desktop lanza
 * uno por modo) y atiende una petición a la vez entre todos.
 */
export class ServidorTuberia {
  private servidor: Server | null = null
  private llave = ''
  /** Los puentes unidos, del más antiguo al último que habló. */
  private readonly unidos = new Map<Socket, string>()
  private corriendo: Promise<void> = Promise.resolve()

  constructor(private readonly deps: DepsServidorTuberia) {}

  get abierto(): boolean {
    return this.servidor !== null
  }

  /** El cliente del puente que habló al último, o null si no hay ninguno. */
  get conectado(): string | null {
    let ultimo: string | null = null
    for (const c of this.unidos.values()) ultimo = c
    return ultimo
  }

  /** Cuántos puentes están unidos. */
  get cuantos(): number {
    return this.unidos.size
  }

  get nombre(): string {
    return nombreTuberia(this.deps.dirDatos, this.deps.plataforma)
  }

  async abrir(): Promise<void> {
    if (this.servidor) return
    const plataforma = this.deps.plataforma ?? process.platform
    this.llave = crearLlave(this.deps.dirDatos, plataforma)
    const nombre = this.nombre
    // Un socket de una sesión que no cerró bien impediría escuchar.
    if (plataforma !== 'win32') rmSync(nombre, { force: true })
    const s = createServer((socket) => this.alConectar(socket))
    // Los unidos y algunos más que todavía se presentan.
    s.maxConnections = MAX_ASISTENTES + 2
    try {
      await new Promise<void>((ok, mal) => {
        s.once('error', mal)
        s.listen(nombre, () => {
          s.off('error', mal)
          ok()
        })
      })
    } catch (e) {
      borrarLlave(this.deps.dirDatos)
      throw e
    }
    s.on('error', (e) => console.error(`asistente: ${e.message}`))
    if (plataforma !== 'win32') {
      try {
        chmodSync(nombre, 0o600)
      } catch {
        // El directorio de datos ya es del usuario.
      }
    }
    this.servidor = s
  }

  /** Cierra la conexión viva, deja de escuchar y borra la llave. */
  cerrar(): void {
    this.desconectar()
    const s = this.servidor
    this.servidor = null
    s?.close()
    borrarLlave(this.deps.dirDatos)
    if ((this.deps.plataforma ?? process.platform) !== 'win32') rmSync(this.nombre, { force: true })
  }

  /** Suelta a todos los puentes unidos (la tubería sigue abierta para los siguientes). */
  desconectar(): void {
    for (const s of [...this.unidos.keys()]) s.destroy()
  }

  /** El puente que habla pasa al final: es el que se muestra como conectado. */
  private habla(socket: Socket): void {
    const c = this.unidos.get(socket)
    if (c === undefined) return
    this.unidos.delete(socket)
    this.unidos.set(socket, c)
  }

  private alConectar(socket: Socket): void {
    const decoder = new StringDecoder('utf8')
    let pendiente = ''
    let autenticado = false
    const espera = setTimeout(() => socket.destroy(), ESPERA_HOLA_MS)
    espera.unref()
    const mandar = (m: Omit<MensajeTuberia, 'v'>) => {
      if (!socket.destroyed) socket.write(lineaDe({ v: 1, ...m }))
    }
    const atender = (m: MensajeTuberia) => {
      this.habla(socket)
      this.corriendo = this.corriendo.then(async () => {
        if (socket.destroyed) return
        try {
          mandar({ id: m.id, tipo: 'respuesta', datos: await this.deps.atender(m.tipo, m.datos) })
        } catch (e) {
          mandar({ id: m.id, tipo: 'error', datos: { motivo: e instanceof Error ? e.message : String(e) } })
        }
      })
    }
    const alLinea = (linea: string) => {
      const m = leerMensaje(linea)
      if (!m) return socket.destroy()
      if (autenticado) return atender(m)
      const d = (typeof m.datos === 'object' && m.datos !== null ? m.datos : {}) as { llave?: unknown; cliente?: unknown }
      if (m.tipo !== 'hola' || !mismaLlave(d.llave, this.llave)) return socket.destroy()
      if (this.unidos.size >= MAX_ASISTENTES) {
        mandar({ id: m.id, tipo: 'error', datos: { motivo: TEXTO_YA_CONECTADO } })
        return void socket.end()
      }
      clearTimeout(espera)
      autenticado = true
      const cliente = limpiarCliente(d.cliente)
      this.unidos.set(socket, cliente)
      mandar({ id: m.id, tipo: 'listo', datos: {} })
      this.deps.alUnirse(cliente)
    }
    socket.on('data', (trozo) => {
      pendiente += decoder.write(trozo)
      if (pendiente.length > MAX_MENSAJE_TUBERIA) return socket.destroy()
      let i: number
      while ((i = pendiente.indexOf('\n')) >= 0) {
        const linea = pendiente.slice(0, i)
        pendiente = pendiente.slice(i + 1)
        if (linea.trim() !== '') alLinea(linea)
        if (socket.destroyed) return
      }
    })
    socket.on('error', () => socket.destroy())
    socket.on('close', () => {
      clearTimeout(espera)
      if (!this.unidos.delete(socket)) return
      this.deps.alIrse(this.unidos.size)
    })
  }
}

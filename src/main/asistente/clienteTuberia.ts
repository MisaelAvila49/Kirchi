import { connect, type Socket } from 'node:net'
import { StringDecoder } from 'node:string_decoder'
import { MAX_MENSAJE_TUBERIA, type MensajeTuberia } from '../../compartido/asistente'
import { leerLlave, nombreTuberia } from './llave'
import { leerMensaje, lineaDe } from './servidorTuberia'

export type RespuestaVentana = { ok: true; datos: unknown } | { ok: false; motivo: string }
export type Conexion = { ok: true; cliente: ClienteTuberia } | { ok: false; sinVentana: boolean; motivo: string }

const ESPERA_CONEXION_MS = 1500
const ESPERA_PETICION_MS = 20_000
const SIN_VENTANA = 'No hay una ventana de Kirchi con el asistente activado.'
const SE_FUE = 'La ventana de Kirchi se desconectó.'

/** El lado del puente de la tubería: se une a la ventana con la llave, manda una petición a la vez y espera su respuesta. */
export class ClienteTuberia {
  private pendientes = new Map<number, (r: RespuestaVentana) => void>()
  private siguiente = 1
  private cerrado = false
  /** Se llama una vez cuando la conexión termina, por cualquier lado. */
  alCerrarse?: () => void

  private constructor(private readonly socket: Socket) {
    const decoder = new StringDecoder('utf8')
    let buffer = ''
    socket.on('data', (trozo) => {
      buffer += decoder.write(trozo)
      if (buffer.length > MAX_MENSAJE_TUBERIA) return socket.destroy()
      let i: number
      while ((i = buffer.indexOf('\n')) >= 0) {
        const linea = buffer.slice(0, i)
        buffer = buffer.slice(i + 1)
        if (linea.trim() !== '') this.alMensaje(linea)
      }
    })
    const cerrar = () => this.alCerrar()
    socket.on('error', cerrar)
    socket.on('close', cerrar)
  }

  get vivo(): boolean {
    return !this.cerrado
  }

  /** Se une a la ventana. Sin archivo de llave o sin nadie escuchando no hay ventana, y no es una falla. */
  static async conectar(dirDatos: string, cliente: string, o: { plataforma?: NodeJS.Platform; esperaMs?: number } = {}): Promise<Conexion> {
    const llave = leerLlave(dirDatos)
    if (!llave) return { ok: false, sinVentana: true, motivo: SIN_VENTANA }
    const socket = await new Promise<Socket | null>((ok) => {
      const s = connect(nombreTuberia(dirDatos, o.plataforma))
      const t = setTimeout(() => (s.destroy(), ok(null)), o.esperaMs ?? ESPERA_CONEXION_MS)
      s.once('connect', () => (clearTimeout(t), ok(s)))
      s.once('error', () => (clearTimeout(t), ok(null)))
    })
    if (!socket) return { ok: false, sinVentana: true, motivo: SIN_VENTANA }
    const c = new ClienteTuberia(socket)
    const r = await c.pedir('hola', { llave, cliente }, ESPERA_CONEXION_MS * 3)
    if (!r.ok) {
      c.cerrar()
      // La ventana contestó con un motivo (ya hay otro asistente): no es lo mismo que no haber ventana.
      return { ok: false, sinVentana: r.motivo === SE_FUE, motivo: r.motivo }
    }
    return { ok: true, cliente: c }
  }

  pedir(tipo: string, datos: unknown, esperaMs = ESPERA_PETICION_MS): Promise<RespuestaVentana> {
    if (this.cerrado) return Promise.resolve({ ok: false, motivo: SE_FUE })
    const id = this.siguiente++
    const linea = lineaDe({ v: 1, id, tipo, datos })
    if (linea.length > MAX_MENSAJE_TUBERIA) return Promise.resolve({ ok: false, motivo: 'La petición es demasiado grande.' })
    return new Promise((ok) => {
      const t = setTimeout(() => {
        this.pendientes.delete(id)
        ok({ ok: false, motivo: 'Kirchi no respondió a tiempo.' })
      }, esperaMs)
      this.pendientes.set(id, (r) => (clearTimeout(t), ok(r)))
      this.socket.write(linea)
    })
  }

  cerrar(): void {
    this.socket.destroy()
    this.alCerrar()
  }

  private alMensaje(linea: string): void {
    const m: MensajeTuberia | null = leerMensaje(linea)
    if (!m) return
    const f = this.pendientes.get(m.id)
    if (!f) return
    this.pendientes.delete(m.id)
    if (m.tipo === 'error') f({ ok: false, motivo: String((m.datos as { motivo?: unknown } | null)?.motivo ?? 'Kirchi rechazó la petición.') })
    else f({ ok: true, datos: m.datos })
  }

  private alCerrar(): void {
    if (this.cerrado) return
    this.cerrado = true
    this.alCerrarse?.()
    for (const f of this.pendientes.values()) f({ ok: false, motivo: SE_FUE })
    this.pendientes.clear()
  }
}

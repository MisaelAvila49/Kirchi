import { ClienteTuberia, type Conexion } from './clienteTuberia'
import { leerLlave } from './llave'

export const TEXTO_DESCONECTADO = 'El usuario desconectó al asistente en Kirchi. Vuelve a activarlo en Configuración › Asistente.'
/** Cada cuánto se busca una ventana mientras no hay una unida: la ventana puede abrirse después que el cliente. */
export const INTERVALO_BUSQUEDA_MS = 3000

/**
 * La unión del puente con la ventana abierta. Se intenta en cuanto el cliente se presenta y luego cada pocos segundos, para
 * que la ventana muestre «Conectado» desde el principio y no solo en la primera herramienta. Si la ventana suelta al
 * asistente (el usuario pulsó «Desconectar»), no vuelve a unirse hasta que cambie la llave de la tubería, que es lo que
 * pasa al apagar y encender el interruptor o al volver a abrir Kirchi: reconectar solo deshacería lo que el usuario pidió.
 */
export class PuenteVentana {
  private actual: ClienteTuberia | null = null
  private soltadaCon: string | null = null
  private enCurso: Promise<Conexion> | null = null
  private reloj: ReturnType<typeof setInterval> | null = null
  /** Se llama al unirse y al soltarse, para el registro del puente. */
  alCambiar?: (unido: boolean, motivo?: string) => void
  /** Se llama cuando la ventana rechaza la unión, una vez por motivo seguido: sin esto el registro no dice por qué el
   * asistente trabajaba sin la ventana. */
  alRechazar?: (motivo: string) => void
  private ultimoRechazo: string | null = null

  constructor(
    private readonly dirDatos: string,
    private readonly nombreCliente: () => string
  ) {}

  get unido(): boolean {
    return this.actual?.vivo === true
  }

  obtener(): Promise<Conexion> {
    if (this.actual?.vivo) return Promise.resolve({ ok: true, cliente: this.actual })
    // Dos llamadas a la vez (una herramienta y la búsqueda periódica) comparten el mismo intento.
    return (this.enCurso ??= this.conectar().finally(() => (this.enCurso = null)))
  }

  private async conectar(): Promise<Conexion> {
    this.actual = null
    const llave = leerLlave(this.dirDatos)
    if (llave && llave === this.soltadaCon) return { ok: false, sinVentana: false, motivo: TEXTO_DESCONECTADO }
    const c = await ClienteTuberia.conectar(this.dirDatos, this.nombreCliente())
    if (!c.ok) {
      if (!c.sinVentana && c.motivo !== this.ultimoRechazo) this.alRechazar?.(c.motivo)
      this.ultimoRechazo = c.sinVentana ? null : c.motivo
      return c
    }
    this.ultimoRechazo = null
    const cliente = c.cliente
    this.actual = cliente
    this.alCambiar?.(true)
    cliente.alCerrarse = () => {
      if (this.actual === cliente) {
        this.actual = null
        this.soltadaCon = leerLlave(this.dirDatos)
        this.alCambiar?.(false, this.soltadaCon ? 'la ventana soltó al asistente' : 'la ventana se cerró')
      }
    }
    return c
  }

  /** Se une ya y sigue buscando la ventana mientras no haya una unida. */
  vigilar(intervalo = INTERVALO_BUSQUEDA_MS): void {
    const intentar = () => {
      if (!this.unido && leerLlave(this.dirDatos) !== null) void this.obtener().catch(() => undefined)
    }
    intentar()
    if (this.reloj) return
    this.reloj = setInterval(intentar, intervalo)
    this.reloj.unref?.()
  }

  cerrar(): void {
    if (this.reloj) clearInterval(this.reloj)
    this.reloj = null
    const c = this.actual
    this.actual = null
    c?.cerrar()
  }
}

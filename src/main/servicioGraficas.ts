import { CANALES_GRAFICAS, validarDatosGraficas, validarPedidoAcoplar, validarPedidoExportar, type DatosGraficas, type PedidoExportar } from '../compartido/graficas'

/** Ventanas de gráficas, una por editor. No toca Electron: la ventana sale de la fábrica recibida (una falsa en pruebas) y todo lo del IPC se revisa antes de guardarse. */
export interface VentanaGraficas {
  /** Id del `webContents`: lo que identifica al remitente de un mensaje. */
  id: number
  isDestroyed(): boolean
  focus(): void
  /** Manda un mensaje a su página. */
  enviar(canal: string, ...args: unknown[]): void
  ponerTitulo(titulo: string): void
  alCerrarse(f: () => void): void
  cerrar(): void
}

export interface DependenciasGraficas {
  /** Crea la ventana de gráficas del editor `padre`. */
  crear(padre: number): VentanaGraficas
  /** Manda un pedido de exportar al editor `padre`. */
  alPadre(padre: number, canal: string, mensaje: unknown): void
}

interface Entrada {
  ventana: VentanaGraficas
  datos: DatosGraficas
}

export const tituloDeGraficas = (archivo: string): string => (archivo ? `Gráficas de ${archivo.replace(/\.kir$/i, '')} · Kirchi` : 'Gráficas · Kirchi')

export class ServicioGraficas {
  private readonly porPadre = new Map<number, Entrada>()
  private readonly padreDe = new Map<number, number>()

  constructor(private readonly dep: DependenciasGraficas) {}

  /** Abre la ventana del editor `padre` o, si ya existe, le manda los datos nuevos. Falso si los datos no son válidos. */
  abrir(padre: number, bruto: unknown): boolean {
    const datos = validarDatosGraficas(bruto)
    if (!datos) return false
    const actual = this.porPadre.get(padre)
    if (actual && !actual.ventana.isDestroyed()) {
      actual.datos = datos
      actual.ventana.ponerTitulo(tituloDeGraficas(datos.archivo))
      actual.ventana.enviar(CANALES_GRAFICAS.datos, datos)
      actual.ventana.focus()
      return true
    }
    const ventana = this.dep.crear(padre)
    ventana.ponerTitulo(tituloDeGraficas(datos.archivo))
    this.porPadre.set(padre, { ventana, datos })
    this.padreDe.set(ventana.id, padre)
    ventana.alCerrarse(() => {
      this.porPadre.delete(padre)
      this.padreDe.delete(ventana.id)
    })
    return true
  }

  /** Manda datos a la ventana del editor `padre` solo si ya está abierta (no la crea ni la enfoca). Falso si no hay ventana o los datos no son válidos. */
  actualizar(padre: number, bruto: unknown): boolean {
    const datos = validarDatosGraficas(bruto)
    const actual = this.porPadre.get(padre)
    if (!datos || !actual || actual.ventana.isDestroyed()) return false
    actual.datos = datos
    actual.ventana.ponerTitulo(tituloDeGraficas(datos.archivo))
    actual.ventana.enviar(CANALES_GRAFICAS.datos, datos)
    return true
  }

  /** Los datos que le tocan a la ventana `hija` (null si no es una ventana de gráficas nuestra). */
  pedir(hija: number): DatosGraficas | null {
    const padre = this.padreDe.get(hija)
    return padre === undefined ? null : (this.porPadre.get(padre)?.datos ?? null)
  }

  /** La ventana de gráficas `hija` quiere exportar: el pedido va al editor que la abrió. */
  exportar(hija: number, bruto: unknown): boolean {
    const padre = this.padreDe.get(hija)
    const pedido: PedidoExportar | null = validarPedidoExportar(bruto)
    if (padre === undefined || !pedido) return false
    this.dep.alPadre(padre, CANALES_GRAFICAS.alExportar, pedido)
    return true
  }

  /** «Acoplar»: se cierra la ventana `hija` y el editor trae la corrida que se veía a su franja. */
  acoplar(hija: number, bruto: unknown): boolean {
    const padre = this.padreDe.get(hija)
    const pedido = validarPedidoAcoplar(bruto)
    const e = padre === undefined ? undefined : this.porPadre.get(padre)
    if (padre === undefined || !pedido || !e) return false
    this.dep.alPadre(padre, CANALES_GRAFICAS.alAcoplar, pedido)
    if (!e.ventana.isDestroyed()) e.ventana.cerrar()
    return true
  }

  /** El editor `padre` se cerró: su ventana de gráficas también. */
  cerrarDePadre(padre: number): void {
    const e = this.porPadre.get(padre)
    if (e && !e.ventana.isDestroyed()) e.ventana.cerrar()
    this.porPadre.delete(padre)
  }

  get abiertas(): number {
    return this.porPadre.size
  }
}

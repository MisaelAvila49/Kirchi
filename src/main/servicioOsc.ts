import { CANALES_OSC, fusionarDatosOsc, type ResultadoActualizarOsc, validarComandoOsc, validarDatosOsc, type ComandoOsc, type DatosOsc } from '../compartido/ventanaOsc'
import type { VentanaGraficas } from './servicioGraficas'

/**
 * Ventana del osciloscopio, una por editor. Como el servicio de gráficas, no toca Electron y todo lo del IPC se revisa.
 * Guarda el último estado completo porque el editor manda los datos de a poco: una ventana que arranca tarde recibe con `pedir` la pantalla vigente.
 */
export type VentanaOsc = VentanaGraficas

export interface DependenciasOsc {
  crear(padre: number): VentanaOsc
  /** Manda un mensaje al editor `padre`. */
  alPadre(padre: number, canal: string, mensaje: unknown): void
  /** Trae al frente la ventana del editor `padre` (al pedir exportar, el diálogo se abre allí). */
  enfocarPadre?(padre: number): void
}

interface Entrada {
  ventana: VentanaOsc
  datos: DatosOsc
}

export const tituloDeOsc = (ref: string | null): string => (ref ? `Kirchi · ${ref} · Osciloscopio` : 'Kirchi · Osciloscopio')

export class ServicioOsc {
  private readonly porPadre = new Map<number, Entrada>()
  private readonly padreDe = new Map<number, number>()

  constructor(private readonly dep: DependenciasOsc) {}

  private titulo(d: DatosOsc): string {
    return tituloDeOsc(d.osciloscopios.find((o) => o.id === d.elegido)?.ref ?? null)
  }

  /** Abre la ventana del editor `padre` o, si ya existe, la actualiza y la enfoca. Falso si los datos no son válidos. */
  abrir(padre: number, bruto: unknown): boolean {
    const datos = validarDatosOsc(bruto)
    if (!datos) return false
    const actual = this.porPadre.get(padre)
    if (actual && !actual.ventana.isDestroyed()) {
      actual.datos = fusionarDatosOsc(actual.datos, datos)
      actual.ventana.ponerTitulo(this.titulo(actual.datos))
      actual.ventana.enviar(CANALES_OSC.datos, datos)
      actual.ventana.focus()
      return true
    }
    const ventana = this.dep.crear(padre)
    ventana.ponerTitulo(this.titulo(datos))
    this.porPadre.set(padre, { ventana, datos })
    this.padreDe.set(ventana.id, padre)
    ventana.alCerrarse(() => {
      const aun = this.porPadre.get(padre)
      if (aun?.ventana !== ventana) return
      this.porPadre.delete(padre)
      this.padreDe.delete(ventana.id)
      this.dep.alPadre(padre, CANALES_OSC.alCerrar, null)
    })
    return true
  }

  /** Datos nuevos solo si la ventana ya está abierta: no la crea ni la enfoca. 'sin-ventana' si no hay, 'invalido' si los datos no valen. */
  actualizar(padre: number, bruto: unknown): ResultadoActualizarOsc {
    const actual = this.porPadre.get(padre)
    if (!actual || actual.ventana.isDestroyed()) return 'sin-ventana'
    const datos = validarDatosOsc(bruto)
    if (!datos) return 'invalido'
    actual.datos = fusionarDatosOsc(actual.datos, datos)
    actual.ventana.ponerTitulo(this.titulo(actual.datos))
    actual.ventana.enviar(CANALES_OSC.datos, datos)
    return 'ok'
  }

  /** Los datos completos que le tocan a la ventana `hija` (null si no es una ventana de osciloscopio nuestra). */
  pedir(hija: number): DatosOsc | null {
    const padre = this.padreDe.get(hija)
    return padre === undefined ? null : (this.porPadre.get(padre)?.datos ?? null)
  }

  /** Una orden de la ventana `hija`: va al editor que la abrió. */
  comando(hija: number, bruto: unknown): boolean {
    const padre = this.padreDe.get(hija)
    const c: ComandoOsc | null = validarComandoOsc(bruto)
    if (padre === undefined || !c) return false
    this.dep.alPadre(padre, CANALES_OSC.alComando, c)
    if (c.tipo === 'exportar') this.dep.enfocarPadre?.(padre)
    return true
  }

  /** «Acoplar»: se cierra la ventana `hija` y el editor lo sabe para traer la vista a la franja. */
  acoplar(hija: number): boolean {
    const padre = this.padreDe.get(hija)
    const e = padre === undefined ? undefined : this.porPadre.get(padre)
    if (padre === undefined || !e) return false
    this.dep.alPadre(padre, CANALES_OSC.alAcoplar, null)
    this.dep.enfocarPadre?.(padre)
    if (!e.ventana.isDestroyed()) e.ventana.cerrar()
    return true
  }

  /** El editor `padre` pide cerrar su ventana: el aviso de cierre le llega por el camino de siempre. */
  cerrarAPedido(padre: number): boolean {
    const e = this.porPadre.get(padre)
    if (!e || e.ventana.isDestroyed()) return false
    e.ventana.cerrar()
    return true
  }

  /** El editor `padre` se cerró: su ventana también. */
  cerrarDePadre(padre: number): void {
    const e = this.porPadre.get(padre)
    this.porPadre.delete(padre)
    if (e) this.padreDe.delete(e.ventana.id)
    if (e && !e.ventana.isDestroyed()) e.ventana.cerrar()
  }

  get abiertas(): number {
    return this.porPadre.size
  }
}

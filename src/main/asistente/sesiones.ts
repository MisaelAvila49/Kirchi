import type { Fragmento } from '../../renderer/src/editor/portapapeles'
import { leerKir } from '../../renderer/src/archivo/kir'
import { fragmentoDeDocumento } from '../../renderer/src/plantillas/plantilla'
import type { PiezaDef } from '../../renderer/src/piezas/tipos'
import { SesionSinVentana, type EjecutorAnalisis } from '../../renderer/src/sinVentana/sesion'
import { cargarMotor } from '../../renderer/src/sinVentana/motor'
import type { CarpetaAsistente } from './carpeta'

/** Circuitos abiertos a la vez; al pasar el tope sale el menos reciente (sus cambios sin guardar se pierden, y la
 * respuesta de la herramienta que lo reabre lo dice). */
export const MAX_SESIONES = 16

export interface DepsSesiones {
  lib: Map<string, PiezaDef>
  wasm: Uint8Array
  version: string
  analisis?: EjecutorAnalisis
  carpeta: CarpetaAsistente
  /** De dónde salen los `.kir` que pide una orden de fragmento; por omisión, la carpeta del asistente. */
  bytesDe?(nombre: string): { ok: true; bytes: Uint8Array } | { ok: false; motivo: string }
}

export type Obtenida = { ok: true; sesion: SesionSinVentana; nombre: string; avisos: string[] } | { ok: false; motivo: string }

/** Las sesiones sin ventana por nombre de archivo. Cada cambio se guarda en su archivo en cuanto se aplica (`autoguardar`),
 * así que un corte del puente no pierde nada; la sesión en memoria solo conserva el historial para deshacer. Si el archivo
 * cambió en el disco por otro lado (la ventana lo guardó), se vuelve a leer. */
export class Sesiones {
  private readonly abiertas = new Map<string, SesionSinVentana>()
  /** La fecha del archivo cuando la sesión se leyó o se guardó por última vez. */
  private readonly fechas = new Map<string, number | null>()
  private listo: Promise<void> | null = null

  constructor(private readonly deps: DepsSesiones) {}

  private motor(): Promise<void> {
    return (this.listo ??= cargarMotor(this.deps.wasm).then(() => undefined))
  }

  private nueva(): SesionSinVentana {
    const s = new SesionSinVentana({ lib: this.deps.lib, version: this.deps.version, analisis: this.deps.analisis })
    s.nucleo.lectorDeArchivos = (nombre) => this.fragmentoDe(nombre)
    return s
  }

  private colocar(clave: string, s: SesionSinVentana): void {
    this.abiertas.delete(clave)
    this.abiertas.set(clave, s)
    while (this.abiertas.size > MAX_SESIONES) {
      const [viejo] = this.abiertas.keys()
      this.abiertas.get(viejo)?.cerrar()
      this.abiertas.delete(viejo)
      this.fechas.delete(viejo)
    }
  }

  /** Suelta la sesión en memoria de un archivo (ahora lo edita una ventana); la próxima vez se lee del disco. */
  olvidar(nombre: string): void {
    this.abiertas.get(nombre)?.cerrar()
    this.abiertas.delete(nombre)
    this.fechas.delete(nombre)
  }

  /** Escribe la sesión en su archivo después de un cambio. */
  autoguardar(nombre: string): { ok: true } | { ok: false; motivo: string } {
    const s = this.abiertas.get(nombre)
    if (!s) return { ok: false, motivo: `${nombre} no está abierto.` }
    const r = this.deps.carpeta.sobrescribir(nombre, s.guardar())
    if (!r.ok) return r
    this.fechas.set(nombre, this.deps.carpeta.modificado(nombre))
    return { ok: true }
  }

  /** La sesión del archivo: la abierta o, si no, la que sale de leerlo de la carpeta. */
  async obtener(nombre: unknown): Promise<Obtenida> {
    const r = this.deps.carpeta.rutaDe(nombre)
    if (!r.ok) return r
    await this.motor()
    const abierta = this.abiertas.get(r.nombre)
    // Otro programa (o la ventana) cambió el archivo: lo del disco manda.
    if (abierta && this.deps.carpeta.modificado(r.nombre) !== this.fechas.get(r.nombre)) this.olvidar(r.nombre)
    else if (abierta) {
      this.colocar(r.nombre, abierta)
      return { ok: true, sesion: abierta, nombre: r.nombre, avisos: [] }
    }
    const l = this.deps.carpeta.leer(r.nombre)
    if (!l.ok) return l
    const s = this.nueva()
    try {
      const { avisos } = s.abrir(l.bytes)
      this.colocar(r.nombre, s)
      this.fechas.set(r.nombre, this.deps.carpeta.modificado(r.nombre))
      return { ok: true, sesion: s, nombre: r.nombre, avisos }
    } catch (e) {
      return { ok: false, motivo: `No se pudo abrir ${r.nombre}: ${e instanceof Error ? e.message : String(e)}` }
    }
  }

  /** Una sesión sobre una copia del circuito abierto en la ventana. No se guarda ni se reutiliza: quien la pide la cierra. */
  async efimera(bytes: Uint8Array): Promise<{ ok: true; sesion: SesionSinVentana; avisos: string[] } | { ok: false; motivo: string }> {
    await this.motor()
    const s = this.nueva()
    try {
      const { avisos } = s.abrir(bytes)
      return { ok: true, sesion: s, avisos }
    } catch (e) {
      s.cerrar()
      return { ok: false, motivo: `No se pudo leer el circuito de la ventana: ${e instanceof Error ? e.message : String(e)}` }
    }
  }

  /** Un circuito vacío nuevo, ya escrito en la carpeta (nunca reemplaza uno que existe). */
  async crear(nombre: unknown): Promise<Obtenida | { ok: false; motivo: string; existe?: true }> {
    const r = this.deps.carpeta.rutaDe(nombre)
    if (!r.ok) return r
    await this.motor()
    const s = this.nueva()
    s.crear()
    const e = this.deps.carpeta.escribir(r.nombre, s.guardar())
    if (!e.ok) return e
    this.colocar(r.nombre, s)
    this.fechas.set(r.nombre, this.deps.carpeta.modificado(r.nombre))
    return { ok: true, sesion: s, nombre: r.nombre, avisos: [] }
  }

  /** Guarda la sesión de `origen` en `destino` (por omisión, el mismo archivo). */
  async guardar(origen: string, destino: string | undefined, reemplazar: boolean): Promise<{ ok: true; nombre: string; respaldo?: string } | { ok: false; motivo: string; existe?: true }> {
    const o = await this.obtener(origen)
    if (!o.ok) return o
    const bytes = o.sesion.guardar()
    const dest = destino === undefined ? null : this.deps.carpeta.rutaDe(destino)
    const mismo = dest === null || (dest.ok && dest.nombre === o.nombre)
    const r = this.deps.carpeta.escribir(destino ?? o.nombre, bytes, mismo ? true : reemplazar)
    if (r.ok && mismo) this.fechas.set(o.nombre, this.deps.carpeta.modificado(o.nombre))
    return r
  }

  private fragmentoDe(nombre: string): Fragmento | { motivo: string } {
    const l = this.deps.bytesDe ? this.deps.bytesDe(nombre) : this.deps.carpeta.leer(nombre)
    if (!l.ok) return l
    const k = leerKir(l.bytes)
    if (!k.ok) return { motivo: k.error }
    return fragmentoDeDocumento(k.doc, this.deps.lib) ?? { motivo: `${nombre} no tiene nada que colocar.` }
  }

  cerrar(): void {
    for (const s of this.abiertas.values()) s.cerrar()
    this.abiertas.clear()
    this.fechas.clear()
  }
}

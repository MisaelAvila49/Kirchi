/**
 * Guarda las grabaciones sin diálogo en `Videos/Kirchi` o en la carpeta de los ajustes. Es la segunda excepción a «rutas solo desde diálogos»: la ruta la decide este servicio.
 * Todo lo del sistema entra por `DepsGrabacion`, así las pruebas corren sin Electron.
 */
import { existsSync, mkdirSync, accessSync, constants, renameSync, statSync } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import { escribirAtomico } from './escritura'

export const NOMBRE_CARPETA_GRABACIONES = 'Kirchi'
export type ContenedorGrabacion = 'mp4' | 'webm'
export const EXTENSION_GRABACION: Record<ContenedorGrabacion, string> = { mp4: '.mp4', webm: '.webm' }
const NOMBRE_POR_OMISION = 'Kirchi'
/** Largo máximo del nombre del circuito dentro del archivo (el resto lo ocupan fecha, sufijo y extensión). */
const LARGO_MAXIMO_NOMBRE = 80
const RESERVADOS_WINDOWS = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i

export interface DepsGrabacion {
  /** `app.getPath('videos')`. */
  videos(): string
  /** La carpeta de grabaciones de los ajustes, si el usuario eligió una. */
  carpetaConfigurada(): string | undefined
  esCarpeta(ruta: string): boolean
  /** ¿Se puede escribir en la carpeta? */
  esEscribible(ruta: string): boolean
  existe(ruta: string): boolean
  crearCarpeta(ruta: string): void
  /** Escritura atómica; con `exclusivo` nunca pisa un archivo que ya esté. */
  escribir(ruta: string, bytes: Uint8Array): void
  mover(de: string, a: string): void
  ahora(): Date
  /** Diálogo de guardar como; devuelve la ruta elegida o `null` si se canceló. */
  dialogoGuardarComo(sugerido: string, carpeta: string): Promise<string | null>
}

export function depsReales(
  o: Pick<DepsGrabacion, 'videos' | 'carpetaConfigurada' | 'dialogoGuardarComo'> & { ahora?: () => Date }
): DepsGrabacion {
  return {
    videos: o.videos,
    carpetaConfigurada: o.carpetaConfigurada,
    esCarpeta: (r) => {
      try {
        return statSync(r).isDirectory()
      } catch {
        return false
      }
    },
    esEscribible: (r) => {
      try {
        accessSync(r, constants.W_OK)
        return true
      } catch {
        return false
      }
    },
    existe: existsSync,
    crearCarpeta: (r) => void mkdirSync(r, { recursive: true }),
    escribir: (r, b) => escribirAtomico(r, b, { exclusivo: true }),
    mover: renameSync,
    ahora: o.ahora ?? (() => new Date()),
    dialogoGuardarComo: o.dialogoGuardarComo
  }
}

const dos = (n: number) => String(n).padStart(2, '0')

/** Quita lo que Windows, macOS o Linux no admiten en un nombre de archivo y recorta el largo. */
export function limpiarNombre(nombre: string): string {
  let n = nombre
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (n.length > LARGO_MAXIMO_NOMBRE) n = n.slice(0, LARGO_MAXIMO_NOMBRE)
  n = n.replace(/[. ]+$/, '').replace(/^\.+/, '').trim()
  if (!n || RESERVADOS_WINDOWS.test(n)) return NOMBRE_POR_OMISION
  return n
}

/** `<circuito o Kirchi> AAAA-MM-DD HH.MM.mp4` (o `.webm`) con la hora local. */
export function nombreGrabacion(nombreCircuito: string | undefined, fecha: Date, contenedor: ContenedorGrabacion = 'webm'): string {
  const f = `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())} ${dos(fecha.getHours())}.${dos(fecha.getMinutes())}`
  return `${limpiarNombre(nombreCircuito ?? '')} ${f}${EXTENSION_GRABACION[contenedor]}`
}

/** Extensiones de video que el usuario puede escribir en el diálogo. */
const EXTENSIONES_DE_VIDEO = ['.webm', '.mp4', '.mkv', '.mov', '.avi']

export class ServicioGrabacion {
  /** Lo que este servicio guardó en esta sesión: lo único que `renombrar` mueve. */
  private readonly guardadas = new Set<string>()

  constructor(private readonly deps: DepsGrabacion) {}

  /** `Videos/Kirchi`, o la carpeta de los ajustes si existe y se puede escribir. Se crea si falta. */
  carpetaGrabaciones(): string {
    const elegida = this.deps.carpetaConfigurada()
    if (elegida && this.deps.esCarpeta(elegida) && this.deps.esEscribible(elegida)) return elegida
    const carpeta = join(this.deps.videos(), NOMBRE_CARPETA_GRABACIONES)
    if (!this.deps.existe(carpeta)) this.deps.crearCarpeta(carpeta)
    return carpeta
  }

  /** Primer nombre libre: el original, luego « (2)», « (3)»... */
  private rutaLibre(carpeta: string, nombre: string): string {
    const ext = extname(nombre)
    const base = nombre.slice(0, nombre.length - ext.length)
    let ruta = join(carpeta, nombre)
    for (let i = 2; this.deps.existe(ruta); i++) ruta = join(carpeta, `${base} (${i})${ext}`)
    return ruta
  }

  /** Guarda la grabación con nombre automático, sin pisar nada, y devuelve la ruta. */
  guardar(bytes: Uint8Array, nombreCircuito?: string, contenedor: ContenedorGrabacion = 'webm'): string {
    if (bytes.length === 0) throw new Error('La grabación está vacía.')
    const carpeta = this.carpetaGrabaciones()
    const nombre = nombreGrabacion(nombreCircuito, this.deps.ahora(), contenedor)
    // Si otro proceso gana la carrera por el nombre, el paso final exclusivo falla con EEXIST y se prueba el siguiente.
    for (let intento = 0; ; intento++) {
      const ruta = this.rutaLibre(carpeta, nombre)
      try {
        this.deps.escribir(ruta, bytes)
        this.guardadas.add(ruta)
        return ruta
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'EEXIST' || intento >= 20) throw e
      }
    }
  }

  /** «Cambiar nombre»: abre el diálogo de guardar como y mueve el archivo, solo si este servicio lo guardó en la sesión. Devuelve la ruta nueva o `null` si se canceló. */
  async renombrar(rutaActual: string): Promise<string | null> {
    if (!this.guardadas.has(rutaActual)) throw new Error('Solo se puede renombrar una grabación guardada en esta sesión.')
    if (!this.deps.existe(rutaActual)) {
      this.guardadas.delete(rutaActual)
      throw new Error('La grabación ya no está en su carpeta.')
    }
    const elegida = await this.deps.dialogoGuardarComo(basename(rutaActual), this.carpetaGrabaciones())
    if (!elegida) return null
    let destino = elegida
    // El contenedor es el del archivo guardado: renombrar nunca lo cambia.
    const ext = extname(rutaActual).toLowerCase()
    const escrita = extname(destino).toLowerCase()
    // Si el nombre ya termina en otra extensión de video (.webm contra .mp4) se cambia por la del contenedor, no se apila.
    if (escrita !== ext) destino = EXTENSIONES_DE_VIDEO.includes(escrita) ? destino.slice(0, -escrita.length) + ext : destino + ext
    if (destino === rutaActual) return rutaActual
    // El diálogo ya confirmó un reemplazo, pero una grabación no pisa archivos de otros: se numera.
    if (this.deps.existe(destino)) destino = this.rutaLibre(dirname(destino), basename(destino))
    this.deps.mover(rutaActual, destino)
    this.guardadas.delete(rutaActual)
    this.guardadas.add(destino)
    return destino
  }
}

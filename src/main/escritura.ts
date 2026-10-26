import { randomBytes } from 'node:crypto'
import { closeSync, fchmodSync, fsyncSync, linkSync, mkdirSync, openSync, renameSync, rmSync, statSync, writeSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'

export const REINTENTOS_RENOMBRAR = 5
const ESPERA_MS = 50
const CODIGOS_REINTENTABLES = ['EPERM', 'EACCES', 'EBUSY']

/** Lo único del sistema de archivos que usa la escritura atómica; se inyecta en las pruebas. */
export interface FsEscritura {
  mkdirSync(dir: string, o: { recursive: true }): unknown
  /** El modo del archivo que se reemplaza (POSIX); lanza si no existe. */
  statSync(ruta: string): { mode: number }
  openSync(ruta: string, flags: string, modo?: number): number
  writeSync(fd: number, datos: Uint8Array, desde: number, largo: number): number
  fsyncSync(fd: number): void
  fchmodSync(fd: number, modo: number): void
  closeSync(fd: number): void
  renameSync(de: string, a: string): void
  /** Enlace duro: falla con EEXIST si el destino existe (paso final exclusivo). Opcional en dobles de prueba. */
  linkSync?(de: string, a: string): void
  rmSync(ruta: string, o: { force: true }): void
  esperar(ms: number): void
}

export const fsReal: FsEscritura = {
  mkdirSync,
  statSync,
  openSync,
  writeSync,
  fsyncSync,
  fchmodSync,
  closeSync,
  renameSync,
  linkSync,
  rmSync,
  esperar: (ms) => {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
  }
}

export interface OpcionesEscritura {
  /** Crea la carpeta si falta, solo para carpetas de la aplicación: una carpeta del usuario que desapareció no se recrea a escondidas. */
  crearCarpeta?: boolean
  /** No reemplazar: si el destino existe (aunque aparezca a media escritura) lanza EEXIST. */
  exclusivo?: boolean
  fs?: FsEscritura
  plataforma?: NodeJS.Platform
}

/** Un fallo de limpieza no tapa el error original. */
const sinError = (f: () => void) => {
  try {
    f()
  } catch {
    // Nada: el error que importa es el que ya se está propagando.
  }
}

/**
 * Escritura atómica: temporal nuevo en la misma carpeta (`wx`, nunca pisa ni sigue un archivo existente), sincronizado y renombrado encima. Un corte nunca deja el archivo a medias.
 * En Windows el renombrado se reintenta porque el antivirus puede retener el destino. En POSIX el temporal toma el modo del reemplazado y se sincroniza la carpeta.
 */
export function escribirAtomico(ruta: string, datos: string | Uint8Array, o: OpcionesEscritura = {}): void {
  const fs = o.fs ?? fsReal
  const posix = (o.plataforma ?? process.platform) !== 'win32'
  const carpeta = dirname(ruta)
  if (o.crearCarpeta) fs.mkdirSync(carpeta, { recursive: true })
  const bytes = typeof datos === 'string' ? new Uint8Array(Buffer.from(datos, 'utf8')) : datos
  let modo: number | undefined
  if (posix) {
    try {
      modo = fs.statSync(ruta).mode & 0o7777
    } catch {
      modo = undefined
    }
  }
  const tmp = `${ruta}.${randomBytes(6).toString('hex')}.tmp`
  const fd = fs.openSync(tmp, 'wx', modo)
  let abierto = true
  try {
    for (let hecho = 0; hecho < bytes.length; ) hecho += fs.writeSync(fd, bytes, hecho, bytes.length - hecho)
    // El umask pudo recortar el modo pedido al abrir.
    if (modo !== undefined) fs.fchmodSync(fd, modo)
    fs.fsyncSync(fd)
    abierto = false
    fs.closeSync(fd)
    for (let intento = 1; ; intento++) {
      try {
        if (o.exclusivo && fs.linkSync) {
          try {
            fs.linkSync(tmp, ruta)
          } catch (e) {
            const c = (e as NodeJS.ErrnoException).code
            // Sin enlaces duros (FAT, red): se comprueba y se renombra.
            if (c !== 'EPERM' && c !== 'ENOTSUP' && c !== 'ENOSYS' && c !== 'EXDEV') throw e
            if (existsSync(ruta)) throw Object.assign(new Error('EEXIST'), { code: 'EEXIST' })
            fs.renameSync(tmp, ruta)
          }
          sinError(() => fs.rmSync(tmp, { force: true }))
        } else fs.renameSync(tmp, ruta)
        break
      } catch (e) {
        const codigo = (e as NodeJS.ErrnoException).code
        if (intento >= REINTENTOS_RENOMBRAR || !codigo || !CODIGOS_REINTENTABLES.includes(codigo)) throw e
        fs.esperar(ESPERA_MS)
      }
    }
  } catch (e) {
    if (abierto) sinError(() => fs.closeSync(fd))
    sinError(() => fs.rmSync(tmp, { force: true }))
    throw e
  }
  if (posix) {
    // Sin esto, tras un apagón la carpeta puede seguir apuntando al archivo viejo (o a ninguno).
    sinError(() => {
      const d = fs.openSync(carpeta, 'r')
      try {
        fs.fsyncSync(d)
      } finally {
        fs.closeSync(d)
      }
    })
  }
}

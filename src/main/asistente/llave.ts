import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { escribirAtomico } from '../escritura'

export const ARCHIVO_LLAVE = 'asistente.llave'
const BYTES_LLAVE = 32

/** El nombre de la tubería: en Windows sale de un resumen de la carpeta de datos (una instancia de prueba con `--datos`
 * no choca con la del usuario); en macOS y Linux es un socket de dominio dentro de esa carpeta. Sin puertos. */
export function nombreTuberia(dirDatos: string, plataforma: NodeJS.Platform = process.platform): string {
  if (plataforma === 'win32') return `\\\\.\\pipe\\kirchi-asistente-${createHash('sha256').update(dirDatos.toLowerCase()).digest('hex').slice(0, 12)}`
  return join(dirDatos, 'asistente.sock')
}

export const rutaLlave = (dirDatos: string): string => join(dirDatos, ARCHIVO_LLAVE)

/** Una llave nueva de 32 bytes aleatorios en hexadecimal, con escritura atómica y, en macOS y Linux, permisos solo del
 * usuario (el archivo se crea vacío con ese modo y la escritura atómica lo hereda). */
export function crearLlave(dirDatos: string, plataforma: NodeJS.Platform = process.platform): string {
  const llave = randomBytes(BYTES_LLAVE).toString('hex')
  const ruta = rutaLlave(dirDatos)
  if (plataforma !== 'win32' && !existsSync(ruta)) writeFileSync(ruta, '', { mode: 0o600 })
  escribirAtomico(ruta, llave, { crearCarpeta: true, plataforma })
  return llave
}

/** La llave guardada, o null si no hay una válida. */
export function leerLlave(dirDatos: string): string | null {
  try {
    const t = readFileSync(rutaLlave(dirDatos), 'utf8').trim()
    return /^[0-9a-f]{64}$/.test(t) ? t : null
  } catch {
    return null
  }
}

export function borrarLlave(dirDatos: string): void {
  rmSync(rutaLlave(dirDatos), { force: true })
}

/** Compara dos llaves sin dar pistas por el tiempo que tarda. */
export function mismaLlave(a: unknown, b: string): boolean {
  if (typeof a !== 'string' || a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

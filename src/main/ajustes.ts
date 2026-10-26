import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { ajustesPorOmision, normalizarAjustes, type Ajustes } from '../compartido/ajustes'
import { escribirAtomico, fsReal, type FsEscritura } from './escritura'

export { REINTENTOS_RENOMBRAR } from './escritura'
/** Lo que usa el guardado de los ajustes: el mismo de la escritura atómica. */
export type FsGuardado = FsEscritura

export const ARCHIVO_AJUSTES = 'settings.json'
/** Los ajustes ocupan unos cientos de bytes: un archivo mayor está dañado o no es de Kirchi y no se lee. */
export const TAMAÑO_MAXIMO_AJUSTES = 64 * 1024

/** Ajustes de la carpeta `dir`; si el archivo falta, está dañado o es enorme, los de por omisión. */
export function leerAjustes(dir: string): Ajustes {
  const ruta = join(dir, ARCHIVO_AJUSTES)
  try {
    if (statSync(ruta).size > TAMAÑO_MAXIMO_AJUSTES) return ajustesPorOmision()
    return normalizarAjustes(JSON.parse(readFileSync(ruta, 'utf8')))
  } catch {
    return ajustesPorOmision()
  }
}

/** settings.json con escritura atómica (temporal aleatorio, sincronizado y renombrado con reintentos). */
export function guardarAjustes(dir: string, a: Ajustes, fs: FsGuardado = fsReal): void {
  escribirAtomico(join(dir, ARCHIVO_AJUSTES), `${JSON.stringify(a, null, 2)}\n`, { crearCarpeta: true, fs })
}

import { resolve } from 'node:path'

/** Banderas de arranque de Kirchi (después de `electron .` o del ejecutable). */
export interface Banderas {
  /** `--pruebas`: la interfaz expone la sonda `window.__kirchi` para Playwright. */
  pruebas: boolean
  /** `--devtools`: abre las herramientas de desarrollo y agrega su atajo al menú. */
  devtools: boolean
  /** `--datos=<carpeta>`: carpeta de datos propia (ajustes), ya absoluta; las pruebas la usan para no tocar la del usuario. */
  datos: string | null
}

/** Variable de entorno con que el desarrollador (no el explorador) habilita las banderas en un ejecutable empaquetado. */
export const ENTORNO_BANDERAS = 'KIRCHI_BANDERAS'

const SIN_BANDERAS: Banderas = { pruebas: false, devtools: false, datos: null }

export interface OpcionesBanderas {
  /** `app.isPackaged`: el ejecutable instalado, el que abren las asociaciones de archivo. */
  empaquetado?: boolean
  env?: Readonly<Record<string, string | undefined>>
}

/**
 * Lee las banderas de la línea de órdenes. Empaquetado se ignoran todas, para que un acceso directo o un nombre de archivo no muevan la carpeta de datos ni abran las herramientas de desarrollo.
 * Solo `--pruebas` se enciende con `KIRCHI_BANDERAS=1`, variable que una asociación de archivos no puede poner.
 */
export function leerBanderas(argv: readonly string[], opciones: OpcionesBanderas = {}): Banderas {
  if (opciones.empaquetado) {
    if ((opciones.env ?? process.env)[ENTORNO_BANDERAS] !== '1') return SIN_BANDERAS
    return { ...SIN_BANDERAS, pruebas: argv.includes('--pruebas') }
  }
  const datos = argv.find((a) => a.startsWith('--datos='))?.slice('--datos='.length) ?? null
  return { pruebas: argv.includes('--pruebas'), devtools: argv.includes('--devtools'), datos: datos ? resolve(datos) : null }
}

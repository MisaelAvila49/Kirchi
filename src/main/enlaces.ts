import { enlaceDeLcsc } from '../compartido/enlaces'
import type { PiezaDef } from '../renderer/src/piezas/tipos'

const permitidas = new WeakMap<Map<string, PiezaDef>, Set<string>>()

/** Las únicas direcciones que se abren: la hoja de datos de cada fila de la librería y el producto de cada número de LCSC. */
export function enlacesDeLaLibreria(lib: Map<string, PiezaDef>): Set<string> {
  const conocido = permitidas.get(lib)
  if (conocido) return conocido
  const r = new Set<string>()
  for (const def of lib.values()) {
    for (const fila of Object.values(def.datos?.valores ?? {})) {
      if (fila.hoja) r.add(fila.hoja)
      for (const p of fila.presentaciones ?? []) if (p.lcsc) r.add(enlaceDeLcsc(p.lcsc.numero))
    }
  }
  permitidas.set(lib, r)
  return r
}

/** Abre en el navegador del sistema; es el único lugar de Kirchi que lo hace. */
const abrirEnElSistema = async (url: string): Promise<void> => {
  const { shell } = await import('electron')
  await shell.openExternal(url)
}

/**
 * Abre `url` solo si es https y aparece tal cual en la librería. Cualquier otra se rechaza y se anota.
 * Devuelve si se abrió.
 */
export async function abrirEnlace(
  url: unknown,
  lib: Map<string, PiezaDef>,
  abrir: (url: string) => Promise<void> = abrirEnElSistema,
  anotar: (mensaje: string) => void = (m) => console.warn(m)
): Promise<boolean> {
  if (typeof url !== 'string' || !url.startsWith('https://') || !enlacesDeLaLibreria(lib).has(url)) {
    anotar(`Enlace rechazado: ${typeof url === 'string' ? url.slice(0, 120) : typeof url}`)
    return false
  }
  try {
    await abrir(url)
    return true
  } catch (e) {
    anotar(`No se pudo abrir el enlace: ${e instanceof Error ? e.message : String(e)}`)
    return false
  }
}

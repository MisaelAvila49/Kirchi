import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { cargarLibreria, type Libreria } from '../piezas/libreria'

// import.meta.dirname no depende del cwd ni de la URL global (happy-dom la reemplaza y rompe new URL(…, import.meta.url)).
export const RAIZ_COMPONENTES = join(import.meta.dirname, '../../../../componentes')

export function leerCarpeta(dir: string): Record<string, string> {
  const out: Record<string, string> = {}
  const recorrer = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n)
      if (statSync(p).isDirectory()) recorrer(p)
      else out[relative(dir, p).replace(/\\/g, '/')] = readFileSync(p, 'utf8')
    }
  }
  recorrer(dir)
  return out
}

export function libreriaDePrueba(): Libreria {
  return cargarLibreria(leerCarpeta(RAIZ_COMPONENTES))
}

import { existsSync, lstatSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { EXTENSION_PLANTILLA, motivoNombreInvalido, MAX_CATEGORIAS, MAX_POR_CATEGORIA } from '../../compartido/plantillas'
import { leerKirDelDisco } from '../archivos'

/** Las plantillas del usuario (Documentos/Kirchi/Plantillas/<categoría>/<nombre>.kir), solo para leer: el asistente las
 * coloca pero no las crea ni las borra. */
export interface PlantillasUsuario {
  listar(): { categoria: string; nombre: string }[]
  leer(categoria: string, nombre: string): { ok: true; bytes: Uint8Array } | { ok: false; motivo: string }
}

const esCarpeta = (ruta: string): boolean => {
  try {
    const s = lstatSync(ruta)
    return s.isDirectory() && !s.isSymbolicLink()
  } catch {
    return false
  }
}

export function plantillasDeUsuario(raiz: string): PlantillasUsuario {
  return {
    listar() {
      if (!esCarpeta(raiz)) return []
      const salida: { categoria: string; nombre: string }[] = []
      for (const d of readdirSync(raiz, { withFileTypes: true }).slice(0, MAX_CATEGORIAS)) {
        if (!d.isDirectory() || motivoNombreInvalido(d.name, 'categoría') || !esCarpeta(join(raiz, d.name))) continue
        for (const f of readdirSync(join(raiz, d.name), { withFileTypes: true }).slice(0, MAX_POR_CATEGORIA)) {
          if (!f.isFile() || !f.name.toLowerCase().endsWith(EXTENSION_PLANTILLA)) continue
          const nombre = f.name.slice(0, -EXTENSION_PLANTILLA.length)
          if (!motivoNombreInvalido(nombre)) salida.push({ categoria: d.name, nombre })
        }
      }
      return salida.sort((a, b) => a.categoria.localeCompare(b.categoria, 'es') || a.nombre.localeCompare(b.nombre, 'es'))
    },
    leer(categoria, nombre) {
      if (motivoNombreInvalido(categoria, 'categoría') || motivoNombreInvalido(nombre)) return { ok: false, motivo: 'No se encontró la plantilla.' }
      const ruta = resolve(raiz, categoria, `${nombre}${EXTENSION_PLANTILLA}`)
      if (dirname(dirname(ruta)) !== resolve(raiz) || !esCarpeta(dirname(ruta)) || !existsSync(ruta) || lstatSync(ruta).isSymbolicLink()) return { ok: false, motivo: 'No se encontró la plantilla.' }
      const l = leerKirDelDisco(ruta)
      return l.ok ? { ok: true, bytes: l.bytes } : { ok: false, motivo: l.error }
    }
  }
}

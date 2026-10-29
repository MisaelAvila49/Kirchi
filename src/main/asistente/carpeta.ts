import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { EXTENSION_PLANTILLA, motivoNombreInvalido } from '../../compartido/plantillas'
import { leerKirDelDisco, respaldar } from '../archivos'
import { escribirAtomico } from '../escritura'

/** Documentos/Kirchi/Asistente: lo único del disco que el asistente toca. */
export const CARPETA_ASISTENTE = ['Kirchi', 'Asistente'] as const
export const MAX_ARCHIVOS_LISTADOS = 500
const MAX_BYTES_AJENO = 8 * 2 ** 20

export type RutaDeNombre = { ok: true; ruta: string; nombre: string } | { ok: false; motivo: string }
export type Lectura = { ok: true; bytes: Uint8Array } | { ok: false; motivo: string }
export type Escritura = { ok: true; nombre: string; respaldo?: string } | { ok: false; motivo: string; existe?: true }

export interface ArchivoListado {
  nombre: string
  bytes: number
  modificado: string
}

/** La carpeta del asistente: recibe nombres, nunca rutas, y comprueba cada uno antes de tocar el disco. */
export class CarpetaAsistente {
  /** `raiz` es la carpeta del asistente; `dirDatos`, la de datos de la aplicación (ahí van los respaldos). */
  constructor(
    readonly raiz: string,
    private readonly dirDatos: string
  ) {}

  /** El nombre con su extensión y la ruta dentro de la carpeta, o el motivo del rechazo. Sin subcarpetas ni enlaces. */
  rutaDe(nombre: unknown, ext: string = EXTENSION_PLANTILLA): RutaDeNombre {
    if (typeof nombre !== 'string') return { ok: false, motivo: 'El nombre del archivo no es válido.' }
    const base = nombre.toLowerCase().endsWith(ext) ? nombre.slice(0, -ext.length) : nombre
    const motivo = motivoNombreInvalido(base)
    if (motivo) return { ok: false, motivo }
    const completo = `${base}${ext}`
    const raiz = resolve(this.raiz)
    const ruta = resolve(raiz, completo)
    if (dirname(ruta) !== raiz) return { ok: false, motivo: 'El archivo debe estar en la carpeta del asistente, sin subcarpetas.' }
    try {
      if (lstatSync(ruta).isSymbolicLink()) return { ok: false, motivo: 'No se admiten enlaces simbólicos.' }
    } catch {
      /* no existe todavía */
    }
    return { ok: true, ruta, nombre: completo }
  }

  existe(nombre: string): boolean {
    const r = this.rutaDe(nombre)
    return r.ok && existsSync(r.ruta)
  }

  listar(): { archivos: ArchivoListado[]; omitidos: number } {
    if (!existsSync(this.raiz)) return { archivos: [], omitidos: 0 }
    const archivos: ArchivoListado[] = []
    let omitidos = 0
    for (const d of readdirSync(this.raiz, { withFileTypes: true })) {
      if (!d.isFile() || !d.name.toLowerCase().endsWith(EXTENSION_PLANTILLA)) continue
      if (!this.rutaDe(d.name).ok || archivos.length >= MAX_ARCHIVOS_LISTADOS) {
        omitidos++
        continue
      }
      const st = statSync(join(this.raiz, d.name))
      archivos.push({ nombre: d.name, bytes: st.size, modificado: st.mtime.toISOString() })
    }
    archivos.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    return { archivos, omitidos }
  }

  leer(nombre: unknown): Lectura {
    const r = this.rutaDe(nombre)
    if (!r.ok) return r
    const l = leerKirDelDisco(r.ruta)
    return l.ok ? l : { ok: false, motivo: l.error }
  }

  /** Los bytes de un archivo de otro programa (.cir, .asc, .kicad_sch...) por nombre completo, con las mismas reglas de nombre que los .kir. */
  leerAjeno(nombre: unknown): Lectura {
    const motivo = motivoNombreInvalido(nombre)
    if (motivo) return { ok: false, motivo }
    const raiz = resolve(this.raiz)
    const ruta = resolve(raiz, nombre as string)
    if (dirname(ruta) !== raiz) return { ok: false, motivo: 'El archivo debe estar en la carpeta del asistente, sin subcarpetas.' }
    try {
      const st = lstatSync(ruta)
      if (st.isSymbolicLink()) return { ok: false, motivo: 'No se admiten enlaces simbólicos.' }
      if (!st.isFile()) return { ok: false, motivo: `${nombre as string} no es un archivo.` }
      if (st.size > MAX_BYTES_AJENO) return { ok: false, motivo: `${nombre as string} es demasiado grande para importarlo.` }
      return { ok: true, bytes: new Uint8Array(readFileSync(ruta)) }
    } catch {
      return { ok: false, motivo: `No se encontró ${nombre as string} en la carpeta del asistente.` }
    }
  }

  /** La fecha de modificación del archivo en el disco (ms), o null si no existe. */
  modificado(nombre: unknown): number | null {
    const r = this.rutaDe(nombre)
    if (!r.ok) return null
    try {
      return statSync(r.ruta).mtimeMs
    } catch {
      return null
    }
  }

  /** El guardado automático después de cada orden: reemplaza el archivo de forma atómica, sin llenar los respaldos con
   * una copia por cambio (el historial de la sesión ya permite deshacer). */
  sobrescribir(nombre: unknown, bytes: Uint8Array): Escritura {
    const r = this.rutaDe(nombre)
    if (!r.ok) return r
    try {
      mkdirSync(this.raiz, { recursive: true })
      escribirAtomico(r.ruta, bytes)
      return { ok: true, nombre: r.nombre }
    } catch {
      return { ok: false, motivo: `No se pudo guardar ${r.nombre}.` }
    }
  }

  /** Escribe con el paso final atómico (`ext` es `.kir` o la de una imagen). Si ya existe y no se pide reemplazar devuelve `existe`; al reemplazar deja antes
   * la versión anterior en los respaldos, como al guardar encima. */
  escribir(nombre: unknown, bytes: Uint8Array, reemplazar = false, ext: string = EXTENSION_PLANTILLA): Escritura {
    const r = this.rutaDe(nombre, ext)
    if (!r.ok) return r
    try {
      mkdirSync(this.raiz, { recursive: true })
      if (existsSync(r.ruta)) {
        if (!reemplazar) return { ok: false, existe: true, motivo: `${r.nombre} ya existe en la carpeta del asistente. Usa otro nombre o pide reemplazarlo.` }
        const copia = ext === EXTENSION_PLANTILLA ? respaldar(r.ruta, this.dirDatos) : { destino: null }
        escribirAtomico(r.ruta, bytes)
        return { ok: true, nombre: r.nombre, ...(copia.destino ? { respaldo: 'versión anterior guardada en los respaldos' } : {}) }
      }
      escribirAtomico(r.ruta, bytes, { exclusivo: true })
      return { ok: true, nombre: r.nombre }
    } catch (e) {
      const c = (e as NodeJS.ErrnoException).code
      if (c === 'EEXIST') return { ok: false, existe: true, motivo: `${r.nombre} ya existe en la carpeta del asistente.` }
      return { ok: false, motivo: `No se pudo guardar ${r.nombre}.` }
    }
  }
}

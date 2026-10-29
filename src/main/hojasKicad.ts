import { realpathSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, sep } from 'node:path'
import { archivosDeHojasKicad } from '../compartido/hojasKicad'
import { LIMITE_KIR } from '../compartido/archivos'
import { leerKirDelDisco } from './archivos'

export const MAX_HOJAS = 64
/** Citas que se examinan en total, también las rechazadas: cada una cuesta un acceso al disco. */
export const MAX_CITAS_HOJAS = 256
export const MAX_PROFUNDIDAD_HOJAS = 12
/** Bytes que pueden sumar todas las hojas juntas: el tope por archivo no basta con muchas hojas. */
export const MAX_BYTES_HOJAS = LIMITE_KIR

export interface HojasLeidas {
  /** Bytes de cada hoja, con el nombre con que la cita su esquema padre. */
  anexos: Record<string, Uint8Array>
  avisos: string[]
}

/** Una cita de hoja solo vale si es relativa, sin `..`, sin unidad ni ruta de red: se queda dentro de la carpeta del archivo abierto. */
function citaSegura(cita: string): boolean {
  if (cita.includes('\0') || isAbsolute(cita) || /^[a-z]:/i.test(cita) || /^[\\/]/.test(cita)) return false
  return !cita.split(/[\\/]/).includes('..')
}

const dentro = (raiz: string, ruta: string): boolean => {
  const r = relative(raiz, ruta)
  return r !== '' && !r.startsWith('..') && !isAbsolute(r)
}

/** Lee las hojas que cita un esquema de KiCad, solo bajo la carpeta del archivo abierto y sin seguir enlaces que salgan de ella. */
export function leerHojasKicad(rutaPadre: string, bytesPadre: Uint8Array, limite?: number): HojasLeidas {
  const anexos: Record<string, Uint8Array> = {}
  const avisos: string[] = []
  let raiz: string
  try {
    raiz = realpathSync(dirname(rutaPadre))
  } catch {
    return { anexos, avisos }
  }
  const leidas = new Set<string>([realpathSync(rutaPadre)])
  let total = 0
  let bytesLeidos = 0
  let citas = 0
  let omitidas = 0

  const visitar = (carpeta: string, bytes: Uint8Array, profundidad: number): void => {
    for (const cita of archivosDeHojasKicad(new TextDecoder().decode(bytes))) {
      if (citas >= MAX_CITAS_HOJAS) {
        omitidas++
        continue
      }
      citas++
      if (total >= MAX_HOJAS) {
        avisos.push(`${cita}: se alcanzó el máximo de ${MAX_HOJAS} hojas.`)
        continue
      }
      if (profundidad >= MAX_PROFUNDIDAD_HOJAS) {
        avisos.push(`${cita}: hojas dentro de hojas más allá de ${MAX_PROFUNDIDAD_HOJAS} niveles.`)
        continue
      }
      if (!citaSegura(cita)) {
        avisos.push(`${cita}: la ruta de la hoja sale de la carpeta del archivo y no se leyó.`)
        continue
      }
      let real: string
      try {
        real = realpathSync(join(carpeta, cita))
      } catch {
        avisos.push(`${cita}: no se encontró el archivo de la hoja.`)
        continue
      }
      if (!dentro(raiz, real)) {
        avisos.push(`${cita}: la hoja está fuera de la carpeta del archivo y no se leyó.`)
        continue
      }
      if (leidas.has(real)) continue
      const restante = MAX_BYTES_HOJAS - bytesLeidos
      if (restante <= 0) {
        avisos.push(`${cita}: las hojas ya suman el máximo de tamaño y no se leyó.`)
        continue
      }
      const l = leerKirDelDisco(real, Math.min(limite ?? LIMITE_KIR, restante), true)
      if (!l.ok) {
        avisos.push(`${cita}: ${l.error}`)
        continue
      }
      leidas.add(real)
      total++
      bytesLeidos += l.bytes.length
      // Si dos hojas distintas comparten el nombre citado, la segunda se anota con su ruta desde la carpeta raíz.
      const clave = cita in anexos ? relative(raiz, real).split(sep).join('/') : cita
      anexos[clave] = l.bytes
      visitar(dirname(real), l.bytes, profundidad + 1)
    }
  }
  visitar(raiz, bytesPadre, 0)
  if (omitidas > 0) avisos.push(`y ${omitidas} más citas de hojas sin examinar: se alcanzó el máximo de ${MAX_CITAS_HOJAS}.`)
  return { anexos, avisos }
}

import { appendFileSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'

export const ARCHIVO_REGISTRO_PUENTE = 'asistente-puente.log'
/** Al pasar de este tamaño el registro se renombra a `.1` (se conserva uno anterior) y empieza de nuevo. */
export const TOPE_REGISTRO_PUENTE = 256 * 1024
const LARGO_RENGLON = 4000

export interface RegistroPuente {
  anotar(texto: string): void
  error(texto: string, e?: unknown): void
}

/** El motivo y la pila de un error, en una sola línea legible. */
export function textoDeError(e: unknown): string {
  if (e instanceof Error) return `${e.message}${e.stack ? ` | ${e.stack.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('at ')).slice(0, 7).join(' | ')}` : ''}`
  return String(e)
}

/**
 * El registro propio del puente en la carpeta de datos: arranque, cada herramienta con su duración, errores con su pila y
 * el motivo de salida. Los clientes no siempre guardan lo que escribe un servidor, así que este archivo es lo único que
 * permite saber por qué se cortó una conexión. Nunca lanza: un disco lleno no debe tumbar al puente.
 */
export function crearRegistroPuente(dirDatos: string, o: { tope?: number; ahora?: () => Date } = {}): RegistroPuente & { ruta: string } {
  const ruta = join(dirDatos, ARCHIVO_REGISTRO_PUENTE)
  const tope = o.tope ?? TOPE_REGISTRO_PUENTE
  const ahora = o.ahora ?? (() => new Date())
  const escribir = (nivel: string, texto: string) => {
    try {
      mkdirSync(dirname(ruta), { recursive: true })
      try {
        if (statSync(ruta).size > tope) {
          rmSync(`${ruta}.1`, { force: true })
          renameSync(ruta, `${ruta}.1`)
        }
      } catch {
        /* todavía no existe */
      }
      const limpio = texto.replace(/[\r\n]+/g, ' | ').slice(0, LARGO_RENGLON)
      appendFileSync(ruta, `${ahora().toISOString()} ${process.pid} ${nivel} ${limpio}\n`, 'utf8')
    } catch {
      /* sin registro se sigue trabajando */
    }
  }
  return {
    ruta,
    anotar: (t) => escribir('info', t),
    error: (t, e) => escribir('error', e === undefined ? t : `${t}: ${textoDeError(e)}`)
  }
}

import { posix, win32 } from 'node:path'
import { rutasKirDeArgumentos } from '../compartido/archivos'
import { claveRuta } from './archivos'

/** Tope de ventanas que abre una sola orden (varios `.kir` arrastrados al icono) o varias seguidas. */
export const MAX_VENTANAS = 8

/** Los `.kir` de una línea de órdenes o de `open-file`, ya absolutos y sin repetidos. Los relativos se resuelven desde el `cwd` de quien lanzó. Que el archivo exista y quepa lo comprueba `ServicioArchivos`. */
export function rutasDeLanzamiento(argv: readonly string[], cwd: string, plataforma: NodeJS.Platform = process.platform): string[] {
  const camino = plataforma === 'win32' ? win32 : posix
  const base = typeof cwd === 'string' && camino.isAbsolute(cwd) ? cwd : camino.parse(process.cwd()).root
  const vistas = new Set<string>()
  const salida: string[] = []
  for (const r of rutasKirDeArgumentos(argv)) {
    const abs = camino.resolve(base, r)
    const clave = claveRuta(abs, plataforma)
    if (vistas.has(clave)) continue
    vistas.add(clave)
    salida.push(abs)
  }
  return salida
}

/** El `open-file` de macOS entrega una sola ruta, no una línea de órdenes. */
export function rutaDeAbrirArchivo(ruta: unknown, plataforma: NodeJS.Platform = process.platform): string[] {
  return typeof ruta === 'string' ? rutasDeLanzamiento(['', ruta], '/', plataforma) : []
}

export interface PlanDeApertura {
  /** El `.kir` que va a la ventana que ya existe (o, al arrancar, a la primera). */
  enLaVentana: string | null
  /** Los demás, cada uno en una ventana nueva. */
  enNuevas: string[]
}

/** Reparte los `.kir` de un lanzamiento entre la ventana existente y ventanas nuevas sin pasar de `MAX_VENTANAS`. */
export function planDeApertura(rutas: readonly string[], ventanasAbiertas: number): PlanDeApertura {
  const [primera, ...resto] = rutas
  const libres = Math.max(0, MAX_VENTANAS - Math.max(ventanasAbiertas, 1))
  return { enLaVentana: primera ?? null, enNuevas: resto.slice(0, libres) }
}

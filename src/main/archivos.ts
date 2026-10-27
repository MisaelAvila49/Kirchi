import { createHash } from 'node:crypto'
import { closeSync, constants, copyFileSync, fstatSync, mkdirSync, openSync, readdirSync, readSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, normalize, win32 } from 'node:path'
import { cambiarExtension, esRutaKir, extension, LARGO_MAXIMO_RUTA, LIMITE_KIR, MAX_ARCHIVOS_RECIENTES, nombreDeRuta } from '../compartido/archivos'

export const CARPETA_RESPALDOS = 'respaldos'
/** Versiones anteriores que se conservan de cada archivo al guardar encima. */
export const RESPALDOS_POR_ARCHIVO = 3

export type Leido = { ok: true; bytes: Uint8Array } | { ok: false; error: string }

const mb = (n: number) => (n / 2 ** 20).toFixed(1)

/** Nombres de dispositivo de Windows (CON, NUL, COM1, con extensión o espacios finales): abrirlos abre el dispositivo. */
export function esNombreDeDispositivo(ruta: string): boolean {
  const base = nombreDeRuta(ruta).split('.')[0].replace(/[ .]+$/, '')
  return /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³]|conin\$|conout\$|clock\$)$/i.test(base)
}

/** Ruta que llega por IPC: texto absoluto, sin nulos y de largo razonable; en Windows, además, sin nombre de dispositivo. */
export function rutaValida(ruta: unknown, plataforma: NodeJS.Platform = process.platform): ruta is string {
  if (typeof ruta !== 'string' || ruta.length === 0 || ruta.length > LARGO_MAXIMO_RUTA || ruta.includes('\0')) return false
  if (plataforma === 'win32') return win32.isAbsolute(ruta) && !esNombreDeDispositivo(ruta)
  return isAbsolute(ruta)
}

/** Ruta de red o del espacio de dispositivos de Windows. Con solo tocarla, Windows intenta autenticarse por SMB o WebDAV y entrega el hash NTLM del usuario. */
export const esRutaDeRed = (ruta: string): boolean => /^[\\/]{2}/.test(ruta) || /^[\\/]\?\?[\\/]/.test(ruta)

export type ClaseRuta = 'local' | 'red' | 'dispositivo'

/** Clasifica una ruta SIN tocar el disco (cualquier mezcla de barras y mayúsculas en Windows). Fuera de Windows todo es local. */
export function clasificarRuta(ruta: string, plataforma: NodeJS.Platform = process.platform): ClaseRuta {
  if (plataforma !== 'win32') return 'local'
  const r = ruta.replace(/\//g, '\\')
  if (/^\\(\\[?.]|\?\?)\\UNC\\/i.test(r)) return 'red'
  if (/^\\\\\?\\[a-z]:(\\|$)/i.test(r)) return 'local'
  if (/^\\(\\[?.]|\?\?)(\\|$)/.test(r)) return 'dispositivo'
  if (r.startsWith('\\\\')) return 'red'
  return 'local'
}

/** Ruta que el proceso principal toca sin que el usuario la haya elegido en un diálogo: debe ser válida y local. Las elegidas en un diálogo o en la línea de órdenes sí pueden ser de red. */
export function rutaDeInterfaz(ruta: unknown): ruta is string {
  return rutaValida(ruta) && !esRutaDeRed(ruta)
}

/** Lee un `.kir` con todas las comprobaciones antes de leer un byte. El tamaño se mide sobre el archivo ya abierto, así que uno que crece entre medias no pasa del límite. */
export function leerKirDelDisco(ruta: unknown, limite = LIMITE_KIR): Leido {
  if (!rutaValida(ruta)) return { ok: false, error: 'La ruta del archivo no es válida.' }
  const nombre = nombreDeRuta(ruta)
  if (!esRutaKir(ruta)) return { ok: false, error: `Solo se abren circuitos .kir; ${nombre} no lo es.` }
  // Antes de abrir, que sea un archivo regular: abrir una FIFO para leer bloquea el proceso principal
  // hasta que alguien escriba. Y en POSIX se abre sin bloquear, por si se cambia entre medias.
  try {
    if (!statSync(ruta).isFile()) return { ok: false, error: `${nombre} no es un archivo.` }
  } catch {
    return { ok: false, error: `No se encontró ${nombre}.` }
  }
  let fd: number
  try {
    fd = openSync(ruta, process.platform === 'win32' ? constants.O_RDONLY : constants.O_RDONLY | constants.O_NONBLOCK)
  } catch {
    return { ok: false, error: `No se encontró ${nombre}.` }
  }
  try {
    const st = fstatSync(fd)
    if (!st.isFile()) return { ok: false, error: `${nombre} no es un archivo.` }
    if (st.size > limite) return { ok: false, error: `${nombre} es demasiado grande para ser un circuito (${mb(st.size)} MB; el máximo es ${mb(limite)} MB).` }
    const bytes = new Uint8Array(st.size)
    let leidos = 0
    while (leidos < bytes.length) {
      const n = readSync(fd, bytes, leidos, bytes.length - leidos, leidos)
      if (n === 0) break
      leidos += n
    }
    return { ok: true, bytes: leidos === bytes.length ? bytes : bytes.subarray(0, leidos) }
  } catch (e) {
    return { ok: false, error: `No se pudo leer ${nombre}: ${(e as NodeJS.ErrnoException).code ?? 'error del sistema'}.` }
  } finally {
    closeSync(fd)
  }
}

/** Llave de comparación de una ruta: en Windows y macOS el sistema de archivos no distingue mayúsculas. */
export function claveRuta(ruta: string, plataforma: NodeJS.Platform = process.platform): string {
  const n = normalize(ruta)
  return plataforma === 'linux' ? n : n.toLowerCase()
}

/** La clave de un archivo que existe, por su ruta real: la misma para su nombre corto de Windows (MISAE~1), otra
 * capitalización o un enlace a la carpeta. Si no se puede resolver, la de `claveRuta`. */
export function claveRutaReal(ruta: string, plataforma: NodeJS.Platform = process.platform): string {
  try {
    return claveRuta(realpathSync.native(ruta), plataforma)
  } catch {
    return claveRuta(ruta, plataforma)
  }
}

/** Rutas donde la interfaz puede escribir: las elegidas en un diálogo de guardar o exportar y los archivos abiertos en la sesión. */
export class Permisos {
  private rutas = new Set<string>()

  constructor(private plataforma: NodeJS.Platform = process.platform) {}

  permitir(ruta: string): void {
    this.rutas.add(claveRuta(ruta, this.plataforma))
  }

  puede(ruta: unknown): ruta is string {
    return rutaValida(ruta, this.plataforma) && this.rutas.has(claveRuta(ruta, this.plataforma))

  }
}

/** La ruta pasa al frente de Recientes, sin repetirse (con la comparación del sistema), y quedan diez. */
export function agregarReciente(lista: readonly string[], ruta: string, plataforma: NodeJS.Platform = process.platform): string[] {
  const k = claveRuta(ruta, plataforma)
  return [ruta, ...lista.filter((r) => claveRuta(r, plataforma) !== k)].slice(0, MAX_ARCHIVOS_RECIENTES)
}

export function quitarReciente(lista: readonly string[], ruta: string, plataforma: NodeJS.Platform = process.platform): string[] {
  const k = claveRuta(ruta, plataforma)
  return lista.filter((r) => claveRuta(r, plataforma) !== k)
}

const dos = (n: number) => String(n).padStart(2, '0')
/** «2026-10-13_14-32-05-123»: se ordena por fecha al ordenar por nombre. */
export const sello = (d: Date): string =>
  `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}_${dos(d.getHours())}-${dos(d.getMinutes())}-${dos(d.getSeconds())}-${String(d.getMilliseconds()).padStart(3, '0')}`

/** Carpeta de respaldos de un archivo: una por ruta, con un nombre corto que sale de la ruta. */
export function carpetaDeRespaldos(dirDatos: string, ruta: string, plataforma: NodeJS.Platform = process.platform): string {
  const h = createHash('sha256').update(claveRuta(ruta, plataforma)).digest('hex').slice(0, 16)
  return join(dirDatos, CARPETA_RESPALDOS, h)
}

/** Bytes máximos (UTF-8) de la parte del nombre de un respaldo que sale del archivo: con el sello cabe en 255. */
const BYTES_NOMBRE_RESPALDO = 120

/** Los primeros caracteres de `s` que caben en `bytes` de UTF-8, sin partir un carácter. */
function recortarBytes(s: string, bytes: number): string {
  let out = '', n = 0
  for (const c of s) {
    n += Buffer.byteLength(c)
    if (n > bytes) break
    out += c
  }
  return out
}

const SELLO_FINAL = /(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-\d{3})\.kir$/i

/** Lo que pasó al respaldar: la copia hecha, o por qué no se hizo (para el Registro). */
export interface Respaldo {
  destino: string | null
  aviso: string | null
}

/**
 * Antes de guardar, copia lo que hay en disco a la carpeta de respaldos de la aplicación y deja los tres más nuevos por fecha del sello (el orden alfabético borraría los nuevos si cambian las mayúsculas).
 * Junto a ellos queda `origen.txt` con la ruta completa. Si el archivo pesa más que un circuito no se copia y se avisa en `aviso`.
 */
export function respaldar(ruta: string, dirDatos: string, ahora = new Date(), plataforma: NodeJS.Platform = process.platform, limite = LIMITE_KIR): Respaldo {
  let tamaño: number
  try {
    const st = statSync(ruta)
    if (!st.isFile()) return { destino: null, aviso: null }
    tamaño = st.size
  } catch {
    return { destino: null, aviso: null }
  }
  if (tamaño > limite) return { destino: null, aviso: `No se respaldó la versión anterior de ${nombreDeRuta(ruta)}: pesa ${mb(tamaño)} MB, más que el máximo de un circuito (${mb(limite)} MB).` }
  const dir = carpetaDeRespaldos(dirDatos, ruta, plataforma)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'origen.txt'), `${ruta}\n`, 'utf8')
  const base = recortarBytes(cambiarExtension(nombreDeRuta(ruta), '').slice(0, -1), BYTES_NOMBRE_RESPALDO)
  const destino = join(dir, `${base} ${sello(ahora)}.kir`)
  copyFileSync(ruta, destino)
  const respaldos = readdirSync(dir)
    .filter((n) => extension(n) === 'kir')
    .map((n) => ({ n, clave: SELLO_FINAL.exec(n)?.[1] ?? '' }))
    .sort((a, b) => (a.clave < b.clave ? -1 : a.clave > b.clave ? 1 : 0))
  for (const viejo of respaldos.slice(0, Math.max(0, respaldos.length - RESPALDOS_POR_ARCHIVO))) rmSync(join(dir, viejo.n), { force: true })
  return { destino, aviso: null }
}

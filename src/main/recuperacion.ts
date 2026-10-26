import { createHash, randomUUID } from 'node:crypto'
import { appendFileSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { LIMITE_KIR, LIMITE_RENGLON, NOMBRE_NUEVO, type BaseDiario, type DatosRecuperacion, type Recuperable } from '../compartido/archivos'
import { escribirAtomico } from './escritura'

/** Diario de autoguardado en `recuperacion/<id>/` (una carpeta por ventana): `base.kir`, `diario.jsonl` y `sesion.json`. Al cerrar bien se borra; si queda una de un proceso muerto con cambios, se ofrece recuperarla. */

export const CARPETA_RECUPERACION = 'recuperacion'
const BASE = 'base.kir'
const DIARIO = 'diario.jsonl'
const SESION = 'sesion.json'
/** El diario se rehace con el documento entero al pasar de 8 MB; esto solo frena un archivo ajeno o dañado. */
export const LIMITE_DIARIO_DISCO = 256 * 2 ** 20
const LIMITE_SESION = 64 * 1024
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

interface DatosSesion extends BaseDiario {
  pid: number
  /** Número de la base vigente (sube con cada `nuevaBase`). Un diario de otra generación es de otra base y no se aplica. */
  generacion: number | null
  /** Huella de `base.kir` (sha-256, 32 cifras hex): una base de otra generación no la cumple. */
  huella: string | null
}

/** El diario llegó a su tope en disco: el renglón no se escribió. */
export class DiarioLleno extends Error {
  constructor(readonly limite: number) {
    super('el diario llegó a su tamaño máximo')
    this.name = 'DiarioLleno'
  }
}

/** Huella de una base, para saber si `base.kir` es la que dice sesion.json. */
export const huellaBase = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex').slice(0, 32)

/** Primer renglón del diario de una generación. */
const cabecera = (generacion: number): string => `${JSON.stringify({ generacion })}\n`

export const pidVivo = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    // EPERM: existe pero es de otro usuario.
    return (e as NodeJS.ErrnoException).code === 'EPERM'
  }
}

export class Sesion {
  readonly id: string
  readonly dir: string
  /** Hay una base completa y su diario: solo entonces se anotan renglones. */
  private conBase = false
  private generacion = 0
  /** Bytes del diario en el disco (cabecera incluida), para no pasar de `limiteDiario`. */
  private bytesDiario = 0

  constructor(dirDatos: string, id: string = randomUUID(), private pid = process.pid, private limiteDiario = LIMITE_DIARIO_DISCO) {
    this.id = id
    this.dir = join(dirDatos, CARPETA_RECUPERACION, id)
  }

  /** Reemplaza la base y vacía el diario. El orden (sesion.json, base.kir, diario) hace que un corte a la mitad deje algo que `leerRecuperacion` reconoce por generación o huella. */
  nuevaBase(bytes: Uint8Array, base: BaseDiario): void {
    this.conBase = false
    const generacion = ++this.generacion
    // sesion.json va primero: una carpeta recién creada ya dice de qué proceso es, y otro Kirchi que
    // busca sesiones recuperables al arrancar no la toma por abandonada mientras se escribe la base.
    const datos: DatosSesion = { pid: this.pid, ruta: base.ruta, nombre: base.nombre, sucio: base.sucio, generacion, huella: huellaBase(bytes) }
    escribirAtomico(join(this.dir, SESION), `${JSON.stringify(datos)}\n`, { crearCarpeta: true })
    escribirAtomico(join(this.dir, BASE), bytes, { crearCarpeta: true })
    const c = cabecera(generacion)
    writeFileSync(join(this.dir, DIARIO), c)
    this.bytesDiario = Buffer.byteLength(c)
    this.conBase = true
  }

  /** Agrega un renglón; sin base todavía no tendría con qué reconstruirse y se ignora. */
  anotar(renglon: string): void {
    if (!this.conBase || renglon.length > LIMITE_RENGLON || renglon.includes('\n')) return
    const texto = `${renglon}\n`
    const n = Buffer.byteLength(texto, 'utf8')
    // La interfaz rehace la base al pasar de 8 MB; si aun así el diario llega al tope, algo anda mal:
    // no se escribe más y quien llama avisa (hasta la próxima base).
    if (this.bytesDiario + n > this.limiteDiario) throw new DiarioLleno(this.limiteDiario)
    appendFileSync(join(this.dir, DIARIO), texto, 'utf8')
    this.bytesDiario += n
  }

  /** Cierre en orden: no queda nada que recuperar. */
  terminar(): void {
    this.conBase = false
    // Un archivo retenido (antivirus, indexador) no tira el cierre: la carpeta queda y la próxima
    // búsqueda la limpia (sin renglones nuevos no hay nada que ofrecer).
    borrarCarpeta(this.dir)
  }
}

/** sesion.json leído, que falta (ENOENT confirmado) o que no se pudo leer o está dañado. */
type LecturaSesion = { estado: 'ok'; datos: DatosSesion } | { estado: 'falta' } | { estado: 'error' }

const esNoExiste = (e: unknown) => (e as NodeJS.ErrnoException)?.code === 'ENOENT'

function leerSesionDe(dir: string): LecturaSesion {
  try {
    const ruta = join(dir, SESION)
    if (statSync(ruta).size > LIMITE_SESION) return { estado: 'error' }
    const d = JSON.parse(readFileSync(ruta, 'utf8'))
    if (!Number.isInteger(d?.pid) || typeof d.nombre !== 'string' || (d.ruta !== null && typeof d.ruta !== 'string') || typeof d.sucio !== 'boolean') return { estado: 'error' }
    const generacion = Number.isSafeInteger(d.generacion) && d.generacion > 0 ? (d.generacion as number) : null
    const huella = typeof d.huella === 'string' && /^[0-9a-f]{32}$/.test(d.huella) ? (d.huella as string) : null
    return { estado: 'ok', datos: { pid: d.pid, ruta: d.ruta, nombre: d.nombre, sucio: d.sucio, generacion, huella } }
  } catch (e) {
    return esNoExiste(e) ? { estado: 'falta' } : { estado: 'error' }
  }
}

function leerSesion(dir: string): DatosSesion | null {
  const l = leerSesionDe(dir)
  return l.estado === 'ok' ? l.datos : null
}

/** Tamaño de un archivo; NO_EXISTE si falta (ENOENT) e ILEGIBLE si no se pudo saber o no es un archivo. */
const NO_EXISTE = -1
const ILEGIBLE = -2
const tamaño = (ruta: string): number => {
  try {
    const st = statSync(ruta)
    return st.isFile() ? st.size : ILEGIBLE
  } catch (e) {
    return esNoExiste(e) ? NO_EXISTE : ILEGIBLE
  }
}

/** Una carpeta incompleta solo se borra si nada en ella cambió en este tiempo (otra ventana pudo estar creándola). */
export const EDAD_PARA_BORRAR_MS = 10 * 60 * 1000

/** ¿Nada en la carpeta (ni ella misma) cambió en `EDAD_PARA_BORRAR_MS`? Ante cualquier duda, no. */
function esVieja(dir: string, ahora: number): boolean {
  try {
    let ultima = statSync(dir).mtimeMs
    for (const n of readdirSync(dir)) ultima = Math.max(ultima, statSync(join(dir, n)).mtimeMs)
    return ahora - ultima > EDAD_PARA_BORRAR_MS
  } catch {
    return false
  }
}

/** Borra sin que un archivo retenido (antivirus, indexador) tire la búsqueda: lo que no se borra queda para la próxima. */
function borrarCarpeta(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 })
  } catch {
    // Se reintenta la próxima vez que se busquen sesiones.
  }
}

/**
 * Sesiones de ventanas cerradas mal (su proceso ya no existe) con algo que no está en ningún archivo. Las vacías se borran; las incompletas, solo tras `EDAD_PARA_BORRAR_MS`.
 * Un error de lectura distinto de ENOENT nunca borra. La `propia` y las de otros Kirchi abiertos no se tocan.
 */
export function buscarRecuperables(dirDatos: string, propia: string | null, vivo: (pid: number) => boolean = pidVivo, ahora = Date.now()): Recuperable[] {
  const raiz = join(dirDatos, CARPETA_RECUPERACION)
  let ids: string[]
  try {
    ids = readdirSync(raiz)
  } catch {
    return []
  }
  const out: Recuperable[] = []
  for (const id of ids) {
    if (!ID.test(id) || id === propia) continue
    const dir = join(raiz, id)
    const l = leerSesionDe(dir)
    if (l.estado === 'error') continue
    if (l.estado === 'falta') {
      if (esVieja(dir, ahora)) borrarCarpeta(dir)
      continue
    }
    const s = l.datos
    if (vivo(s.pid)) continue
    const diario = tamaño(join(dir, DIARIO)), base = tamaño(join(dir, BASE))
    if (diario === ILEGIBLE || base === ILEGIBLE) continue
    if (base === NO_EXISTE || base === 0) {
      if (esVieja(dir, ahora)) borrarCarpeta(dir)
      continue
    }
    // Sin renglones después de la cabecera de su generación, el diario no tiene cambios.
    const conRenglones = diario > (s.generacion ? cabecera(s.generacion).length : 0)
    if (!conRenglones && !s.sucio) {
      // Todo se leyó: la base es lo que ya está en el archivo y no hay cambios después.
      borrarCarpeta(dir)
      continue
    }
    let fecha = 0
    try {
      fecha = statSync(join(dir, conRenglones ? DIARIO : BASE)).mtimeMs
    } catch {
      // Sin fecha se ofrece igual.
    }
    out.push({ id, nombre: s.nombre || NOMBRE_NUEVO, ruta: s.ruta, fecha })
  }
  return out.sort((a, b) => b.fecha - a.fecha)
}

/** Lo recuperado y, si solo se pudo la base, por qué (para el Registro). */
export type Recuperado = DatosRecuperacion & { aviso?: string }

const AVISO_OTRA_BASE = 'La copia de seguridad automática quedó a medias al cerrarse Kirchi: se recuperó la versión anterior del circuito, sin archivo asociado; guárdala con Guardar como.'
const AVISO_GRANDE = 'La copia de seguridad automática era demasiado grande para leerla: se recuperó el circuito sin los últimos cambios.'
const AVISO_SOLO_BASE ='La copia de seguridad automática no coincide con su circuito: se recuperó el circuito sin los últimos cambios.'

/** Renglones del diario de la generación `generacion` (sin cabecera), o null si es de otra, no trae cabecera o no es texto válido. */
function renglonesDe(bytes: Uint8Array, generacion: number | null): string | null {
  if (generacion === null) return null
  let texto: string
  try {
    texto = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return null
  }
  const c = cabecera(generacion)
  return texto.startsWith(c) ? texto.slice(c.length) : null
}

/**
 * Base y diario de una sesión recuperable, con límites de tamaño; null si no existe o no es válida. Si `base.kir` no es la que dice sesion.json se devuelve sin archivo asociado, para no pisar el archivo nuevo al guardar.
 * Si el diario es de otra generación o está dañado, solo la base. Ambos casos traen `aviso`.
 */
export function leerRecuperacion(dirDatos: string, id: unknown, limiteDiario = LIMITE_DIARIO_DISCO): Recuperado | null {
  if (typeof id !== 'string' || !ID.test(id)) return null
  const dir = join(dirDatos, CARPETA_RECUPERACION, id)
  const s = leerSesion(dir)
  const base = tamaño(join(dir, BASE)), diario = tamaño(join(dir, DIARIO))
  if (!s || base <= 0 || base > LIMITE_KIR) return null
  try {
    const bytes = new Uint8Array(readFileSync(join(dir, BASE)))
    const nombre = s.nombre || NOMBRE_NUEVO
    if (s.huella !== null && huellaBase(bytes) !== s.huella) return { base: bytes, diario: '', ruta: null, nombre: NOMBRE_NUEVO, aviso: AVISO_OTRA_BASE }
    // Un diario más grande que el tope (ajeno o dañado) no se lee, pero la base se ofrece igual.
    if (diario > limiteDiario) return { base: bytes, diario: '', ruta: s.ruta, nombre, aviso: AVISO_GRANDE }
    const renglones = diario > 0 ? renglonesDe(new Uint8Array(readFileSync(join(dir, DIARIO))), s.generacion) : null
    if (renglones === null) return { base: bytes, diario: '', ruta: s.ruta, nombre, ...(diario > 0 || s.generacion !== null ? { aviso: AVISO_SOLO_BASE } : {}) }
    return { base: bytes, diario: renglones, ruta: s.ruta, nombre }
  } catch {
    return null
  }
}

export function descartarRecuperacion(dirDatos: string, id: unknown): void {
  if (typeof id !== 'string' || !ID.test(id)) return
  borrarCarpeta(join(dirDatos, CARPETA_RECUPERACION, id))

}

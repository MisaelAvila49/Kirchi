/**
 * Servicio de ngspice. Tiene partes BSD y GPL, así que NUNCA se enlaza: corre como proceso aparte, por lotes, en una carpeta temporal que siempre se borra.
 * La entrada es una `PeticionAnalisis` y la línea de órdenes es fija (`-n -b -o registro.txt mazo.cir`), sin rutas ni argumentos de la interfaz. Hay tope de tiempo y de salida, cancelación que mata el árbol y un trabajo por ventana con cola corta.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readdirSync, readSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { clasificarVector, type GraficoResultado, type ResultadoAnalisis } from '../compartido/ngspice'
import { ARCHIVO_MAZO, ARCHIVO_RAW, ARCHIVO_REGISTRO, armarMazo, validarPeticion } from '../compartido/spice/mazo'
import { ErrorExportacion } from '../compartido/spice/exportar'
import { leerRawAsciiLineas, TOPES_RAW, type TopesRaw } from '../compartido/spice/rawAscii'

/** La versión con que se midieron las referencias del motor: otra daría otras cifras sin avisar. */
export const VERSION_NGSPICE = '47'

export interface OpcionesLocalizar {
  empaquetado: boolean
  /** `carpetaHerramientas()` de `recursos.ts`. */
  carpetaHerramientas: string
  /** La raíz del proyecto (`app.getAppPath()`); en desarrollo ngspice puede estar también en `herramientas/ngspice` de la raíz. */
  appPath: string
  plataforma?: NodeJS.Platform
  existe?: (ruta: string) => boolean
}

/** Dónde está el ejecutable de ngspice, o null: `resources/herramientas/ngspice/` instalado; en desarrollo también `herramientas/ngspice/` de la raíz y, fuera de Windows, el del sistema. */
export function localizarNgspice(o: OpcionesLocalizar): string | null {
  const existe = o.existe ?? existsSync
  const win = (o.plataforma ?? process.platform) === 'win32'
  const bases = o.empaquetado ? [join(o.carpetaHerramientas, 'ngspice')] : [join(o.carpetaHerramientas, 'ngspice'), join(o.appPath, 'herramientas', 'ngspice')]
  const relativas = win ? [join('Spice64', 'bin', 'ngspice_con.exe'), join('bin', 'ngspice_con.exe')] : [join('bin', 'ngspice')]
  for (const base of bases) for (const r of relativas) if (existe(join(base, r))) return join(base, r)
  return !o.empaquetado && !win ? 'ngspice' : null
}

export interface OpcionesServicio {
  ejecutable: string
  /** Tope de tiempo de un trabajo (ms). */
  limiteMs?: number
  /** Tope de lo que escribe un trabajo en su carpeta (bytes) y de su salida estándar. */
  limiteSalida?: number
  /** Trabajos que esperan por ventana, además del que corre. */
  maxEnCola?: number
  /** Procesos de ngspice vivos a la vez en toda la aplicación (varias ventanas no suman procesos sin límite). */
  maxConcurrentes?: number
  carpetaTemporal?: string
  topesRaw?: TopesRaw
  /** Solo para las pruebas: argumentos que van antes de los fijos (un ejecutable falso es `node guion.js`). */
  argumentosPrevios?: string[]
}

interface Trabajo {
  peticion: unknown
  resolver(r: ResultadoAnalisis): void
  cancelado: boolean
  /** Mientras espera un cupo global: cómo sacarlo de la espera. */
  salirDeEspera?: () => void
}

interface Ventana {
  activo: { trabajo: Trabajo; hijo: ChildProcess | null } | null
  cola: Trabajo[]
}

/** Entorno mínimo del proceso: ngspice no necesita nada de lo demás (ni credenciales ni variables de Electron). */
function entornoMinimo(dirTrabajo: string): NodeJS.ProcessEnv {
  const copiar = ['SystemRoot', 'SYSTEMROOT', 'windir', 'PATH', 'Path', 'LANG', 'LC_ALL']
  const env: NodeJS.ProcessEnv = {}
  for (const c of copiar) if (process.env[c] !== undefined) env[c] = process.env[c]
  env.TEMP = dirTrabajo
  env.TMP = dirTrabajo
  env.TMPDIR = dirTrabajo
  return env
}

/** El `spinit` compilado lleva rutas absolutas de la máquina que lo construyó. Con la instalación empaquetada se escribe en la carpeta temporal uno que carga los modelos de código desde donde están. Devuelve la carpeta para `SPICE_LIB_DIR`, o null si no hace falta. */
function rutaSpinit(r: string): string {
  const p = r.replace(/[\\]/g, '/')
  return /\s/.test(p) ? `"${p}"` : p
}

/** ngspice lee el `spinit` con la página de códigos ANSI, no UTF-8: una ruta con acentos llega rota. En Windows se escribe en latin1 (cp1252 coincide hasta U+00FF). */
export function codificarSpinit(texto: string, plataforma: NodeJS.Platform = process.platform): Buffer {
  const cabe = !Array.from(texto).some((c) => c.charCodeAt(0) > 0xff)
  return Buffer.from(texto, plataforma === 'win32' && cabe ? 'latin1' : 'utf8')
}

export function escribirSpinit(dir: string, ejecutable: string, plataforma: NodeJS.Platform = process.platform): string | null {
  const modelos = join(dirname(dirname(ejecutable)), 'lib', 'ngspice')
  if (!existsSync(modelos)) return null
  const cm = readdirSync(modelos).filter((f) => f.endsWith('.cm')).sort()
  if (cm.length === 0) return null
  const scripts = join(dir, 'spice', 'scripts')
  mkdirSync(scripts, { recursive: true })
  const texto = ['if $?xspice_enabled', ...cm.map((m) => ` codemodel ${rutaSpinit(join(modelos, m))}`), 'end', ''].join('\n')
  writeFileSync(join(scripts, 'spinit'), codificarSpinit(texto, plataforma))
  return join(dir, 'spice')
}

/** Variables para que ngspice lea el `spinit`. Con `--enable-relpath` (ngspice de Windows) `SPICE_LIB_DIR` se ignora y manda `SPICE_SCRIPTS`; la otra queda por los ngspice sin relpath. */
export function entornoSpinit(raiz: string | null): NodeJS.ProcessEnv {
  return raiz ? { SPICE_LIB_DIR: raiz, SPICE_SCRIPTS: join(raiz, 'scripts') } : {}
}

/** Mata el proceso y sus hijos: en Windows `taskkill /T`, en los demás el grupo del proceso. */
export function matarArbol(hijo: ChildProcess): void {
  if (hijo.pid === undefined || hijo.exitCode !== null) return
  try {
    if (process.platform === 'win32') {
      spawn(join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'taskkill.exe'), ['/pid', String(hijo.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('error', () => hijo.kill('SIGKILL'))
    } else {
      process.kill(-hijo.pid, 'SIGKILL')
    }
  } catch {
    try {
      hijo.kill('SIGKILL')
    } catch {
      /* ya terminó */
    }
  }
}

/** Los renglones de un archivo, leídos de a bloques de 1 MB: nunca se sostiene el archivo entero como un solo texto. */
export function* lineasDeArchivo(ruta: string, bloque = 1024 * 1024): Generator<string> {
  const fd = openSync(ruta, 'r')
  try {
    const b = Buffer.alloc(bloque)
    let resto = ''
    for (;;) {
      const n = readSync(fd, b, 0, bloque, null)
      if (n === 0) break
      const partes = (resto + b.toString('latin1', 0, n)).split('\n')
      resto = partes.pop() ?? ''
      if (resto.length > bloque) throw new Error('Archivo raw no válido: un renglón demasiado largo')
      for (const p of partes) yield p.endsWith('\r') ? p.slice(0, -1) : p
    }
    if (resto !== '') yield resto
  } finally {
    closeSync(fd)
  }
}

/** Borra las carpetas `kirchi-ngspice-*` que un cierre brusco dejó, si tienen más de `edadMs`. */
export function barrerSobrantes(tmp: string, edadMs = 5 * 60_000, ahora = Date.now()): void {
  let nombres: string[] = []
  try {
    nombres = readdirSync(tmp)
  } catch {
    return
  }
  for (const n of nombres) {
    if (!n.startsWith('kirchi-ngspice-')) continue
    const ruta = join(tmp, n)
    try {
      if (ahora - statSync(ruta).mtimeMs > edadMs) rmSync(ruta, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 })
    } catch {
      /* en uso o sin permiso: se deja */
    }
  }
}

/** Lee a lo más `maximo` bytes del principio de un archivo de texto, o '' si no existe. */
function leerInicio(ruta: string, maximo: number): string {
  let fd: number | null = null
  try {
    fd = openSync(ruta, 'r')
    const b = Buffer.alloc(maximo)
    const n = readSync(fd, b, 0, maximo, 0)
    return b.subarray(0, n).toString('utf8')
  } catch {
    return ''
  } finally {
    if (fd !== null) closeSync(fd)
  }
}

/** Por qué falló la comprobación de versión (null si todo bien): no arrancó (falta una biblioteca) o es otra versión. */
export function motivoDeVersion(salida: string, codigo: number | null): string | null {
  const otra = `Kirchi necesita ngspice ${VERSION_NGSPICE} y el que está instalado es otra versión.`
  if (new RegExp(`ngspice-${VERSION_NGSPICE}\\b`).test(salida)) return null
  if (/ngspice-\d/.test(salida)) return otra
  if (codigo !== null && codigo !== 0) {
    // 0xC0000135 (STATUS_DLL_NOT_FOUND), con signo o sin él según la plataforma.
    if (codigo === -1073741515 || codigo === 0xc0000135) return 'ngspice no pudo arrancar: falta una biblioteca del paquete. Reinstala Kirchi.'
    return `ngspice no pudo arrancar (código ${codigo}).`
  }
  return otra
}

export class ServicioNgspice {
  private readonly ventanas = new Map<number, Ventana>()
  private versionVerificada: Promise<string | null> | null = null
  private readonly limiteMs: number
  private readonly limiteSalida: number
  private readonly maxEnCola: number
  private readonly maxConcurrentes: number
  private corriendo = 0
  private readonly esperaCupo: { trabajo: Trabajo; seguir: (conCupo: boolean) => void }[] = []
  private readonly tmp: string
  private readonly topes: TopesRaw
  private readonly vivos = new Set<ChildProcess>()
  private readonly carpetas = new Set<string>()

  constructor(private readonly o: OpcionesServicio) {
    this.limiteMs = o.limiteMs ?? 60_000
    this.limiteSalida = o.limiteSalida ?? 128 * 1024 * 1024
    this.maxEnCola = o.maxEnCola ?? 2
    this.maxConcurrentes = Math.max(1, o.maxConcurrentes ?? 2)
    this.tmp = o.carpetaTemporal ?? tmpdir()
    this.topes = o.topesRaw ?? TOPES_RAW
    barrerSobrantes(this.tmp)
  }

  /** Comprueba que el ejecutable responde y es la versión 47; devuelve el motivo de falla, o null si sirve. Solo el éxito se recuerda: una falla (un arranque en frío lento) se reintenta en la petición siguiente. */
  verificar(): Promise<string | null> {
    if (this.versionVerificada) return this.versionVerificada
    const p = this.comprobarVersion()
    this.versionVerificada = p
    void p.then((m) => {
      if (m !== null && this.versionVerificada === p) this.versionVerificada = null
    })
    return p
  }

  private comprobarVersion(): Promise<string | null> {
    return new Promise((resolver) => {
      const dir = mkdtempSync(join(this.tmp, 'kirchi-ngspice-v-'))
      let salida = ''
      let hijo: ChildProcess
      try {
        hijo = spawn(this.o.ejecutable, [...(this.o.argumentosPrevios ?? []), '-n', '-v'], { cwd: dir, env: entornoMinimo(dir), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' })
      } catch {
        rmSync(dir, { recursive: true, force: true })
        resolver('No se pudo iniciar ngspice.')
        return
      }
      const fin = (motivo: string | null) => {
        clearTimeout(reloj)
        matarArbol(hijo)
        rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
        resolver(motivo)
      }
      const reloj = setTimeout(() => fin('ngspice no respondió a la comprobación de versión.'), 15_000)
      for (const flujo of [hijo.stdout, hijo.stderr]) flujo?.on('data', (d: Buffer) => (salida = (salida + d.toString('utf8')).slice(0, 4096)))
      hijo.on('error', () => fin('No se pudo iniciar ngspice.'))
      hijo.on('close', (codigo: number | null) => fin(motivoDeVersion(salida, codigo)))
    })
  }

  /** Corre una petición. Nunca rechaza: los errores vuelven como `{ ok: false }`. */
  ejecutar(ventana: number, peticion: unknown): Promise<ResultadoAnalisis> {
    let v = this.ventanas.get(ventana)
    if (!v) this.ventanas.set(ventana, (v = { activo: null, cola: [] }))
    const w = v
    return new Promise((resolver) => {
      const trabajo: Trabajo = { peticion, resolver, cancelado: false }
      if (w.activo) {
        if (w.cola.length >= this.maxEnCola) {
          resolver({ ok: false, error: 'Ya hay un análisis en curso y otros esperando: espera a que terminen.' })
          return
        }
        w.cola.push(trabajo)
        return
      }
      void this.correr(w, trabajo)
    })
  }

  /** Cancela el trabajo en curso de la ventana y vacía su cola. */
  cancelar(ventana: number): void {
    const w = this.ventanas.get(ventana)
    if (!w) return
    for (const t of w.cola.splice(0)) t.resolver({ ok: false, error: 'Análisis cancelado.', cancelado: true })
    if (w.activo) {
      w.activo.trabajo.cancelado = true
      w.activo.trabajo.salirDeEspera?.()
      if (w.activo.hijo) matarArbol(w.activo.hijo)
    }
  }

  /** Cancela todo y espera: al cerrar la aplicación no queda ningún ngspice vivo. */
  cerrar(): void {
    for (const id of this.ventanas.keys()) this.cancelar(id)
    for (const h of this.vivos) matarArbol(h)
    for (const d of this.carpetas) rmSync(d, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 })
    this.carpetas.clear()
  }

  private async correr(w: Ventana, trabajo: Trabajo): Promise<void> {
    w.activo = { trabajo, hijo: null }
    let resultado: ResultadoAnalisis
    const conCupo = await this.tomarCupo(trabajo)
    try {
      resultado = trabajo.cancelado ? { ok: false, error: 'Análisis cancelado.', cancelado: true } : await this.unTrabajo(w, trabajo)
    } catch (e) {
      resultado = { ok: false, error: e instanceof Error ? e.message : 'Error desconocido al correr ngspice.' }
    } finally {
      if (conCupo) this.soltarCupo()
    }
    w.activo = null
    trabajo.resolver(resultado)
    const siguiente = w.cola.shift()
    if (siguiente) void this.correr(w, siguiente)
  }

  /** Espera su turno entre los procesos de toda la aplicación; cancelar al que espera lo suelta de inmediato (sin cupo, `false`). */
  private tomarCupo(trabajo: Trabajo): Promise<boolean> {
    if (this.corriendo < this.maxConcurrentes) {
      this.corriendo++
      return Promise.resolve(true)
    }
    return new Promise((seguir) => {
      const entrada = { trabajo, seguir }
      this.esperaCupo.push(entrada)
      trabajo.salirDeEspera = () => {
        const i = this.esperaCupo.indexOf(entrada)
        if (i >= 0) {
          this.esperaCupo.splice(i, 1)
          seguir(false)
        }
      }
    })
  }

  private soltarCupo(): void {
    const sig = this.esperaCupo.shift()
    // El cupo pasa directo al que espera; si nadie espera, queda libre.
    if (sig) sig.seguir(true)
    else this.corriendo--
  }

  private async unTrabajo(w: Ventana, trabajo: Trabajo): Promise<ResultadoAnalisis> {
    const t0 = Date.now()
    const mazo = (() => {
      try {
        return armarMazo(validarPeticion(trabajo.peticion))
      } catch (e) {
        if (e instanceof ErrorExportacion) return e
        throw e
      }
    })()
    if (mazo instanceof ErrorExportacion) return { ok: false, error: mazo.message }
    if (trabajo.cancelado) return { ok: false, error: 'Análisis cancelado.', cancelado: true }
    const motivo = await this.verificar()
    if (motivo) return { ok: false, error: motivo }
    if (trabajo.cancelado) return { ok: false, error: 'Análisis cancelado.', cancelado: true }

    const dir = mkdtempSync(join(this.tmp, 'kirchi-ngspice-'))
    this.carpetas.add(dir)
    let hijo: ChildProcess | null = null
    try {
      writeFileSync(join(dir, ARCHIVO_MAZO), mazo.texto)
      for (const [nombre, contenido] of Object.entries(mazo.archivos)) {
        // Los nombres los genera el exportador; aun así solo se escribe lo que tiene la forma esperada.
        if (!/^[a-z0-9_]+\.in$/.test(nombre)) throw new Error('Archivo auxiliar con un nombre no permitido.')
        writeFileSync(join(dir, nombre), contenido)
      }
      let porQue: 'tiempo' | 'salida' | null = null
      let stdout = ''
      const codigo = await new Promise<number | null>((resolver, rechazar) => {
        try {
          hijo = spawn(this.o.ejecutable, [...(this.o.argumentosPrevios ?? []), '-n', '-b', '-o', ARCHIVO_REGISTRO, ARCHIVO_MAZO], {
            cwd: dir,
            env: { ...entornoMinimo(dir), ...entornoSpinit(escribirSpinit(dir, this.o.ejecutable)) },
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'pipe'],
            detached: process.platform !== 'win32'
          })
        } catch (e) {
          rechazar(e)
          return
        }
        const h: ChildProcess = hijo
        this.vivos.add(h)
        if (w.activo) w.activo.hijo = h
        for (const flujo of [h.stdout, h.stderr]) flujo?.on('data', (d: Buffer) => (stdout = (stdout + d.toString('utf8')).slice(0, 8192)))
        const reloj = setTimeout(() => {
          porQue = 'tiempo'
          matarArbol(h)
        }, this.limiteMs)
        const vigilante = setInterval(() => {
          if (tamañoDeCarpeta(dir) > this.limiteSalida) {
            porQue = 'salida'
            matarArbol(h)
          }
        }, 200)
        let cerrado = false
        const cerrar = (c: number | null) => {
          if (cerrado) return
          cerrado = true
          clearTimeout(reloj)
          clearInterval(vigilante)
          this.vivos.delete(h)
          resolver(c)
        }
        h.on('error', (e) => {
          clearTimeout(reloj)
          clearInterval(vigilante)
          this.vivos.delete(h)
          if (!cerrado) {
            cerrado = true
            rechazar(e)
          }
        })
        h.on('close', cerrar)
      })
      if (trabajo.cancelado) return { ok: false, error: 'Análisis cancelado.', cancelado: true }
      if (porQue === 'tiempo') return { ok: false, error: `El análisis pasó de ${Math.round(this.limiteMs / 1000)} s y se detuvo.`, tiempoAgotado: true }
      if (porQue === 'salida') return { ok: false, error: 'El análisis produjo demasiados datos y se detuvo.' }
      const registro = leerInicio(join(dir, ARCHIVO_REGISTRO), 256 * 1024) + stdout
      const errores = registro.split(/\r?\n/).filter((l) => /^\s*(error|fatal)|doAnalyses|aborted|no such vector|singular matrix|timestep too small/i.test(l))
      const rutaRaw = join(dir, ARCHIVO_RAW)
      if (!existsSync(rutaRaw)) return { ok: false, error: `ngspice no produjo resultados${errores.length > 0 ? `: ${resumir(errores)}` : codigo === 0 ? '.' : ` (código ${codigo}).`}` }
      if (statSync(rutaRaw).size > this.limiteSalida) return { ok: false, error: 'El resultado es demasiado grande.' }
      const graficos = leerRawAsciiLineas(lineasDeArchivo(rutaRaw), this.topes, statSync(rutaRaw).size)
      // Un error de ngspice con resultados parciales no se esconde: se avisa.
      const avisos = errores.length > 0 ? [resumir(errores)] : []
      const salida: GraficoResultado[] = graficos.map((g) => ({
        nombre: g.nombre,
        complejo: g.complejo,
        puntos: g.puntos,
        vectores: g.variables.map((x, i) => ({ nombre: x.nombre, unidad: x.tipo, referencia: clasificarVector(x.nombre, mazo.exportacion.tabla, i === 0 && !/operating point/i.test(g.nombre)), re: x.re, im: x.im }))
      }))
      return { ok: true, graficos: salida, avisos: [...avisos, ...mazo.exportacion.avisos], duracionMs: Date.now() - t0 }
    } finally {
      if (hijo) matarArbol(hijo)
      // En Windows el proceso puede tardar unos milisegundos en soltar la carpeta tras matarlo.
      rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
      this.carpetas.delete(dir)
    }
  }
}

function resumir(lineas: string[]): string {
  return lineas
    .slice(0, 3)
    .map((l) => l.trim().slice(0, 160))
    .join(' | ')
}

function tamañoDeCarpeta(dir: string): number {
  let total = 0
  for (const n of [ARCHIVO_RAW, ARCHIVO_REGISTRO]) {
    try {
      total += statSync(join(dir, n)).size
    } catch {
      /* todavía no existe */
    }
  }
  return total
}

/** La carpeta del ejecutable (para las pruebas que verifican que está junto a sus bibliotecas). */
export const carpetaDe = (ejecutable: string): string => dirname(ejecutable)

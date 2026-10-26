import { existsSync, lstatSync, mkdirSync, readdirSync, realpathSync, renameSync, rmdirSync, rmSync, statSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import {
  cambiarExtension, esRutaKir, extension, FORMATOS_ARCHIVO_EXPORTAR, LARGO_MAXIMO_RUTA, LIMITE_EXPORTAR, LIMITE_KIR, LIMITE_RENGLON, nombreDeRuta, NOMBRE_NUEVO, rutaKirDeArgumentos,
  type BaseDiario, type DatosRecuperacion, type FormatoArchivoExportar, type Recuperable, type ResultadoAbrir, type ResultadoGuardar
} from '../compartido/archivos'
import type { CarpetasDialogo, TipoCarpeta } from '../compartido/ajustes'
import { EXTENSION_PLANTILLA, MAX_CATEGORIAS, MAX_POR_CATEGORIA, motivoNombreInvalido, type ListaPlantillas, type ResultadoBorrarCategoria, type ResultadoLeerPlantilla, type ResultadoPlantilla } from '../compartido/plantillas'
import { agregarReciente, CARPETA_RESPALDOS, clasificarRuta, claveRuta, leerKirDelDisco, Permisos, quitarReciente, respaldar, rutaDeInterfaz, rutaValida } from './archivos'
import { escribirAtomico } from './escritura'
import { ErrorPdf, htmlParaPdf, paginaValida, svgValido } from './pdf'
import { buscarRecuperables, descartarRecuperacion, DiarioLleno, leerRecuperacion, Sesion } from './recuperacion'

/** Archivos que el explorador deja en las carpetas que abre (en minúsculas): no frenan el borrado de una categoría. */
const ARCHIVOS_DEL_SISTEMA: ReadonlySet<string> = new Set(['desktop.ini', 'thumbs.db'])

/** Tipo de archivo de un diálogo de guardar: el circuito o un formato de exportación. */
export type TipoGuardar = 'kir' | FormatoArchivoExportar

/** Los diálogos nativos; en las pruebas se reemplazan (las e2e los cambian desde el proceso principal). */
export interface Dialogos {
  /** `carpeta`: donde abre el diálogo (la última de abrir, ya validada); sin ella, el sistema elige. */
  abrir(carpeta?: string): Promise<string | null>
  guardar(tipo: TipoGuardar, sugerida: string): Promise<string | null>
  /** Pregunta si se reemplaza un archivo existente. Solo cuando la aplicación agregó la extensión: el diálogo nativo confirmó «practica», no «practica.kir». */
  confirmarReemplazo(ruta: string): Promise<boolean>
  /** Pregunta si se abre un archivo de una carpeta de red (tocarla puede entregar credenciales por SMB). */
  confirmarRed(ruta: string): Promise<boolean>
}

export interface Dependencias {
  dirDatos: string
  dialogos: Dialogos
  recientes(): string[]
  ponerRecientes(l: string[]): void
  abrirCarpeta(dir: string): Promise<unknown>
  argv: readonly string[]
  /** Imprime un HTML a PDF en una ventana oculta y sin red (`ipcArchivos.imprimirPdf`). */
  imprimir?: (html: string) => Promise<Uint8Array>
  sesion?: Sesion
  plataforma?: NodeJS.Platform
  ahora?: () => Date
  /** Última carpeta de cada diálogo, de los ajustes (se valida al usarla: existe, es carpeta y no es de red). */
  carpetas?(): CarpetasDialogo
  /** Anota la carpeta del diálogo en los ajustes. */
  ponerCarpeta?(tipo: TipoCarpeta, carpeta: string): void
  /** Carpeta de Documentos del usuario: la de los diálogos cuando no hay otra mejor. */
  documentos?: string
  /** Carpeta fija de las plantillas (`Documentos/Kirchi/Plantillas`). Es la única ruta que no sale de un diálogo y la interfaz solo manda categoría y nombre. */
  plantillas?: string
  /** Avisa a la interfaz que el diario de autoguardado no se pudo escribir (llega al Registro). */
  avisarErrorDiario?(mensaje: string): void
}

/** Dos rutas que nombran el mismo archivo (un cambio solo de mayúsculas en Windows). */
function mismoArchivo(a: string, b: string): boolean {
  try {
    const x = statSync(a), y = statSync(b)
    return x.ino !== 0 && x.ino === y.ino && x.dev === y.dev
  } catch {
    return false
  }
}

/** Motivo legible de un error del sistema de archivos. */
export function motivoDeError(e: unknown): string {
  const codigo = (e as NodeJS.ErrnoException)?.code
  switch (codigo) {
    case 'EACCES':
    case 'EPERM':
      return 'no hay permiso para escribir ahí'
    case 'ENOSPC':
      return 'el disco está lleno'
    case 'EROFS':
      return 'la carpeta es de solo lectura'
    case 'EBUSY':
      return 'otro programa lo tiene abierto'
    case 'ENOENT':
      return 'la carpeta ya no existe'
    default:
      return codigo ? `error del sistema (${codigo})` : 'error del sistema'
  }
}

/** Todo lo que la interfaz puede pedir sobre archivos. Cada entrada por IPC se valida aquí antes de tocar el disco, y la interfaz solo recibe bytes de lo que el usuario eligió. */
export class ServicioArchivos {
  readonly sesion: Sesion
  /** Rutas donde se puede guardar el circuito: las de Guardar como y las de los archivos abiertos. */
  private permisosKir: Permisos
  /** Rutas donde se puede escribir una exportación: solo las elegidas en el diálogo de exportar. */
  private permisosExportar: Permisos
  private plataforma: NodeJS.Platform
  private ahora: () => Date
  /** Racha de fallos del diario: se avisa al primero y de nuevo solo después de que vuelva a funcionar. */
  private diarioFallando = false
  /** Carpeta del último diálogo de abrir, guardar o exportar. */
  private ultimaCarpeta: string | null = null
  /** Lo anotado en esta sesión por diálogo: sirve aunque el servicio no guarde ajustes. */
  private carpetasSesion: CarpetasDialogo = { abrir: null, guardar: null, exportar: null }
  /** Hay un PDF imprimiéndose (uno a la vez). */
  private pdfEnCurso = false
  private inicialPedido = false

  constructor(private d: Dependencias) {
    this.plataforma = d.plataforma ?? process.platform
    this.ahora = d.ahora ?? (() => new Date())
    this.sesion = d.sesion ?? new Sesion(d.dirDatos)
    this.permisosKir = new Permisos(this.plataforma)
    this.permisosExportar = new Permisos(this.plataforma)
  }

  private anotarReciente(ruta: string): string[] {
    const l = agregarReciente(this.d.recientes(), ruta, this.plataforma)
    this.d.ponerRecientes(l)
    return l
  }

  async abrir(): Promise<ResultadoAbrir> {
    const ruta = await this.d.dialogos.abrir(this.carpetaDe('abrir') ?? undefined)
    if (!ruta) return { ok: false, cancelado: true }
    this.anotarCarpeta('abrir', ruta)
    return this.abrirRuta(ruta)
  }

  /** Abre una ruta ya de confianza (línea de órdenes) o validada por quien llama. No se conecta a IPC: la interfaz entra por `abrirReciente` o `abrirSoltado`. Si ya no existe, sale de Recientes. */
  abrirRuta(ruta: unknown): ResultadoAbrir {
    const l = leerKirDelDisco(ruta)
    if (!l.ok) {
      let recientes = this.d.recientes()
      if (rutaValida(ruta, this.plataforma) && recientes.some((r) => claveRuta(r, this.plataforma) === claveRuta(ruta, this.plataforma))) {
        recientes = quitarReciente(recientes, ruta, this.plataforma)
        this.d.ponerRecientes(recientes)
      }
      return { ok: false, error: l.error, recientes }
    }
    const r = ruta as string
    this.permisosKir.permitir(r)
    return { ok: true, archivo: { ruta: r, nombre: nombreDeRuta(r), bytes: l.bytes }, recientes: this.anotarReciente(r) }
  }

  /** Un `.kir` que llega del sistema (doble clic, segunda instancia, `open-file`). Pasa por las mismas comprobaciones que Abrir y su carpeta pasa a ser la siguiente sugerencia. Zip, límites de descompresión y versión los comprueba la interfaz con `leerKir`. */
  async abrirExterno(ruta: unknown): Promise<ResultadoAbrir> {
    return this.abrirDelSistema(ruta)
  }

  /** Clasifica la ruta ANTES de tocar el disco: las de dispositivo se rechazan y las de red solo con confirmación del usuario. */
  private async abrirDelSistema(ruta: unknown): Promise<ResultadoAbrir> {
    if (!rutaValida(ruta, this.plataforma)) return { ok: false, error: 'La ruta del archivo no es válida.', recientes: this.d.recientes() }
    const clase = clasificarRuta(ruta, this.plataforma)
    if (clase === 'dispositivo') return { ok: false, error: 'La ruta del archivo no es válida.', recientes: this.d.recientes() }
    if (clase === 'red' && !(await this.d.dialogos.confirmarRed(ruta)))
      return { ok: false, error: `No se abrió ${nombreDeRuta(ruta)}: el archivo está en una carpeta de red.`, recientes: this.d.recientes() }
    this.anotarCarpeta('abrir', ruta)
    return this.abrirRuta(ruta)
  }

  /** Recientes (IPC): solo una ruta que está en la lista que guarda el proceso principal; la interfaz no elige otras. */
  abrirReciente(ruta: unknown): ResultadoAbrir {
    const recientes = this.d.recientes()
    // Se abre la entrada de la lista, no el texto que mandó la interfaz (que solo la elige).
    const entrada = rutaValida(ruta, this.plataforma) ? recientes.find((r) => claveRuta(r, this.plataforma) === claveRuta(ruta, this.plataforma)) : undefined
    if (!entrada) return { ok: false, error: 'Ese archivo no está en Recientes.', recientes }
    return this.abrirRuta(entrada)
  }

  /** Archivo soltado (IPC): el preload saca la ruta con `webUtils.getPathForFile`, porque un `File` armado en la página no tiene ruta. Se valida igual: abrir una ruta de red entregaría las credenciales por SMB. */
  abrirSoltado(ruta: unknown): ResultadoAbrir {
    if (typeof ruta === 'string' && rutaValida(ruta) && !rutaDeInterfaz(ruta))
      return { ok: false, error: `No se abrió ${nombreDeRuta(ruta)}: los archivos de red o de dispositivo no se abren al soltarlos; usa Archivo ▸ Abrir.`, recientes: this.d.recientes() }
    if (!rutaDeInterfaz(ruta)) return { ok: false, error: 'La ruta del archivo no es válida.', recientes: this.d.recientes() }
    return this.abrirRuta(ruta)
  }

  /** La interfaz ya pidió el `.kir` de arranque, o sea que ya escucha los que lleguen después (`abrirExterno`). */
  get interfazLista(): boolean {
    return this.inicialPedido
  }

  /** El `.kir` con que se abrió Kirchi; una ruta relativa se toma desde la carpeta en que se lanzó. */
  inicial(cwd = process.cwd()): ResultadoAbrir | null {
    this.inicialPedido = true
    const r = rutaKirDeArgumentos(this.d.argv)
    return r ? this.abrirRuta(resolve(cwd, r)) : null
  }

  /** Sugerencia para un diálogo de guardar: una ruta absoluta se respeta; si no, solo el nombre. */
  /** Sugerencia para un diálogo de guardar o exportar: de la interfaz solo se toma el NOMBRE. La carpeta la decide el proceso principal y nunca es de red ni de dispositivo. */
  private sugerida(s: unknown, ext: string, tipo: TipoCarpeta): string {
    const texto = typeof s === 'string' && s.length > 0 && s.length <= LARGO_MAXIMO_RUTA && !s.includes('\0') ? s : NOMBRE_NUEVO
    let nombre = nombreDeRuta(texto).replace(/\p{Cc}/gu, '').slice(0, 200)
    if (!nombre || /^\.+$/.test(nombre)) nombre = NOMBRE_NUEVO
    const archivo = cambiarExtension(nombre, ext)
    const carpeta = [this.carpetaDe(tipo), this.ultimaCarpeta, this.permisosKir.puede(s) ? dirname(s) : null, this.d.documentos].find((c): c is string => !!c && rutaDeInterfaz(c))
    return carpeta ? join(carpeta, archivo) : archivo
  }

  /** La carpeta de una ruta elegida en un diálogo: la siguiente sugerencia empieza ahí. */
  private anotarCarpeta(tipo: TipoCarpeta, ruta: string): void {
    const carpeta = dirname(ruta)
    this.ultimaCarpeta = carpeta
    this.carpetasSesion[tipo] = carpeta
    if (rutaDeInterfaz(carpeta)) this.d.ponerCarpeta?.(tipo, carpeta)
  }

  /** Última carpeta de un diálogo, solo si sigue existiendo y no es de red ni de dispositivo, para que un settings.json alterado no abra el diálogo ahí. */
  private carpetaDe(tipo: TipoCarpeta): string | null {
    for (const c of [this.d.carpetas?.()[tipo], this.carpetasSesion[tipo]]) {
      if (!c || !rutaDeInterfaz(c)) continue
      try {
        if (statSync(c).isDirectory()) return c
      } catch {
        // ya no existe: se prueba la siguiente
      }
    }
    return null
  }

  /** La ruta con la extensión agregada no pasó por el diálogo nativo: si ya existe, se pregunta antes de darle permiso. */
  private async puedeReemplazar(final: string): Promise<boolean> {
    return !existsSync(final) || (await this.d.dialogos.confirmarReemplazo(final))
  }

  /** Guardar como: la ruta elegida (con `.kir` aunque el usuario no lo escriba) queda permitida. */
  async rutaGuardar(sugerida: unknown): Promise<string | null> {
    const ruta = await this.d.dialogos.guardar('kir', this.sugerida(sugerida, 'kir', 'guardar'))
    if (!ruta || !rutaValida(ruta)) return null
    this.anotarCarpeta('guardar', ruta)
    const final = esRutaKir(ruta) ? ruta : `${ruta}.kir`
    if (final !== ruta && !(await this.puedeReemplazar(final))) return null
    this.permisosKir.permitir(final)
    return final
  }

  /** Guarda el circuito solo en una ruta permitida y dentro del límite; antes respalda lo que había en disco. */
  guardar(ruta: unknown, bytes: unknown): ResultadoGuardar {
    if (!this.permisosKir.puede(ruta) || !esRutaKir(ruta)) return { ok: false, error: 'No se puede guardar en esa ruta: usa Guardar como.' }
    if (!(bytes instanceof Uint8Array) || bytes.length === 0 || bytes.length > LIMITE_KIR) return { ok: false, error: 'El circuito es demasiado grande para guardarlo.' }
    const nombre = nombreDeRuta(ruta)
    try {
      // Un archivo demasiado grande para respaldarlo se guarda igual; el Registro lo dice.
      const { aviso } = respaldar(ruta, this.d.dirDatos, this.ahora(), this.plataforma)
      if (aviso) this.d.avisarErrorDiario?.(aviso)
    } catch (e) {
      return { ok: false, error: `No se guardó ${nombre}: no se pudo respaldar la versión anterior (${motivoDeError(e)}).` }
    }
    try {
      escribirAtomico(ruta, bytes)
    } catch (e) {
      return { ok: false, error: `No se pudo guardar ${nombre}: ${motivoDeError(e)}.` }
    }
    // Lo guardado es la nueva base: el diario empieza de cero (un fallo aquí no deshace el guardado).
    this.conAvisoDeDiario(() => this.sesion.nuevaBase(bytes, { ruta, nombre, sucio: false }))
    return { ok: true, recientes: this.anotarReciente(ruta) }
  }

  olvidarRecientes(): string[] {
    this.d.ponerRecientes([])
    return []
  }

  async abrirRespaldos(): Promise<void> {
    const dir = join(this.d.dirDatos, CARPETA_RESPALDOS)
    try {
      mkdirSync(dir, { recursive: true })
    } catch (e) {
      // El error de Node trae la ruta completa: a la interfaz solo el motivo.
      throw new Error(`No se pudo abrir la carpeta de respaldos: ${motivoDeError(e)}.`)
    }
    await this.d.abrirCarpeta(dir)

  }

  async rutaExportar(formato: unknown, sugerida: unknown): Promise<string | null> {
    if (!FORMATOS_ARCHIVO_EXPORTAR.includes(formato as FormatoArchivoExportar)) return null
    const f = formato as FormatoArchivoExportar
    const ruta = await this.d.dialogos.guardar(f, this.sugerida(sugerida, f, 'exportar'))
    if (!ruta || !rutaValida(ruta)) return null
    this.anotarCarpeta('exportar', ruta)
    const final = extension(ruta) === f ? ruta : `${ruta}.${f}`
    if (final !== ruta && !(await this.puedeReemplazar(final))) return null
    this.permisosExportar.permitir(final)
    return final
  }

  /** Escribe un PNG o un SVG en una ruta elegida en el diálogo de exportar. */
  escribirExportacion(ruta: unknown, bytes: unknown): ResultadoGuardar {
    const ext = typeof ruta === 'string' ? extension(ruta) : ''
    if (!this.permisosExportar.puede(ruta) || (ext !== 'png' && ext !== 'svg' && ext !== 'csv')) return { ok: false, error: 'No se puede exportar a esa ruta: elige otra en el diálogo.' }
    if (!(bytes instanceof Uint8Array) || bytes.length === 0 || bytes.length > LIMITE_EXPORTAR) return { ok: false, error: 'La imagen es demasiado grande para exportarla.' }
    try {
      escribirAtomico(ruta, bytes)
      return { ok: true, recientes: this.d.recientes() }
    } catch (e) {
      return { ok: false, error: `No se pudo exportar ${nombreDeRuta(ruta)}: ${motivoDeError(e)}.` }
    }
  }

  /** Ruta permitida para un PDF. */
  puedeExportarPdf(ruta: unknown): ruta is string {
    return this.permisosExportar.puede(ruta) && extension(ruta) === 'pdf'
  }

  /** Imprime el SVG exportado a PDF en la página pedida y lo escribe en una ruta del diálogo de exportar. */
  async exportarPdf(ruta: unknown, svg: unknown, pagina: unknown): Promise<ResultadoGuardar> {
    if (!this.puedeExportarPdf(ruta)) return { ok: false, error: 'No se puede exportar a esa ruta: elige otra en el diálogo.' }
    if (!svgValido(svg, LIMITE_EXPORTAR) || !paginaValida(pagina) || !this.d.imprimir) return { ok: false, error: 'No se pudo armar el PDF: el dibujo no es válido.' }
    // Una ventana oculta por vez: una interfaz que pide PDF en bucle no llena la memoria de ventanas.
    if (this.pdfEnCurso) return { ok: false, error: 'Ya se está armando otro PDF; espera a que termine.' }
    let bytes: Uint8Array
    this.pdfEnCurso = true
    try {
      bytes = await this.d.imprimir(htmlParaPdf(svg, pagina))
    } catch (e) {
      // Solo los mensajes propios llegan a la interfaz: los de Chromium traen la ruta del temporal.
      return { ok: false, error: `No se pudo armar el PDF: ${e instanceof ErrorPdf ? e.message : 'falló la ventana que lo imprime'}.` }
    } finally {
      this.pdfEnCurso = false
    }
    try {
      escribirAtomico(ruta, bytes)
      return { ok: true, recientes: this.d.recientes() }
    } catch (e) {
      return { ok: false, error: `No se pudo exportar ${nombreDeRuta(ruta)}: ${motivoDeError(e)}.` }
    }
  }

  diarioBase(bytes: unknown, base: unknown): void {
    const b = base as Partial<BaseDiario> | null
    if (!(bytes instanceof Uint8Array) || bytes.length === 0 || bytes.length > LIMITE_KIR || !b || typeof b !== 'object') return
    // La ruta de la base decide después qué archivo se puede sobrescribir al recuperar: solo vale una
    // que el usuario ya eligió (diálogo) o abrió; cualquier otra se guarda como «sin archivo».
    const ruta = this.permisosKir.puede(b.ruta) ? b.ruta : null
    const nombre = typeof b.nombre === 'string' && b.nombre.length <= 255 ? b.nombre : NOMBRE_NUEVO
    this.conAvisoDeDiario(() => this.sesion.nuevaBase(bytes, { ruta, nombre, sucio: b.sucio === true }))
  }

  /** Un fallo del diario no tira nada, pero la interfaz debe saberlo porque sin diario un cierre mal hecho pierde el trabajo. Se avisa una vez por racha. */
  private conAvisoDeDiario(f: () => void): void {
    try {
      f()
      this.diarioFallando = false
    } catch (e) {
      if (this.diarioFallando) return
      this.diarioFallando = true
      if (e instanceof DiarioLleno) {
        this.d.avisarErrorDiario?.(`La copia de seguridad automática llegó a su tamaño máximo (${Math.round(e.limite / 2 ** 20)} MB) y dejó de guardar cambios. Si Kirchi se cierra mal, los cambios recientes no se recuperarán; guarda el circuito.`)
        return
      }
      this.d.avisarErrorDiario?.(`No se pudo escribir la copia de seguridad automática (${motivoDeError(e)}). Si Kirchi se cierra mal, los cambios recientes podrían no recuperarse; guarda el circuito.`)
    }
  }

  diarioAnotar(renglon: unknown): void {
    if (typeof renglon === 'string' && renglon.length <= LIMITE_RENGLON) this.conAvisoDeDiario(() => this.sesion.anotar(renglon))
  }

  recuperables(): Recuperable[] {
    return buscarRecuperables(this.d.dirDatos, this.sesion.id)
  }

  /** Datos de una sesión para recuperarla; su ruta queda permitida para Guardar, como un archivo abierto. */
  recuperar(id: unknown): DatosRecuperacion | null {
    // Solo sesiones que dejó un proceso muerto: ni la propia ni la de otra ventana viva (que
    // comparte el pid). Así la interfaz no puede «recuperar» lo que ella misma escribió en su diario.
    if (!this.esRecuperable(id)) return null
    const leido = leerRecuperacion(this.d.dirDatos, id)
    if (!leido) return null
    const { aviso, ...r } = leido
    // Solo se pudo la base (diario de otra generación o dañado): se dice en el Registro.
    if (aviso) this.d.avisarErrorDiario?.(aviso)
    // Esa ruta perdió su permiso con el proceso. Se renueva si el archivo o su carpeta existen; si no, el circuito vuelve «sin archivo» y Guardar pide Guardar como.
    if (r.ruta && rutaValida(r.ruta, this.plataforma) && esRutaKir(r.ruta) && (existsSync(r.ruta) || existsSync(dirname(r.ruta)))) this.permisosKir.permitir(r.ruta)
    else r.ruta = null
    return r
  }

  descartar(id: unknown): void {
    if (this.esRecuperable(id)) descartarRecuperacion(this.d.dirDatos, id)
  }

  private esRecuperable(id: unknown): boolean {
    return typeof id === 'string' && this.recuperables().some((r) => r.id === id)
  }
  // ---- Plantillas: categoría y nombre desde la interfaz, rutas solo de aquí ----

  /** La ruta de una plantilla (o de una categoría si no hay nombre) dentro de la carpeta fija; texto de error si no sirve. */
  private rutaPlantilla(categoria: unknown, nombre?: unknown): { ruta: string } | { error: string } {
    const raiz = this.d.plantillas
    if (!raiz) return { error: 'No se encontró la carpeta Documentos de este equipo.' }
    const mc = motivoNombreInvalido(categoria, 'categoría')
    if (mc) return { error: mc }
    const carpeta = join(raiz, categoria as string)
    if (nombre === undefined) return this.sinEnlaces(raiz, carpeta) ? { ruta: carpeta } : { error: 'La carpeta de plantillas contiene un enlace y no se usa.' }
    const mn = motivoNombreInvalido(nombre, 'nombre')
    if (mn) return { error: mn }
    const ruta = join(carpeta, `${nombre as string}${EXTENSION_PLANTILLA}`)
    // Defensa en profundidad: aunque los nombres ya no llevan separadores, el resultado debe quedar dentro de la raíz.
    const r = resolve(ruta)
    if (!(r.startsWith(resolve(raiz) + sep) && dirname(r) === resolve(carpeta))) return { error: 'El nombre no es válido.' }
    return this.sinEnlaces(raiz, carpeta, ruta) ? { ruta } : { error: 'La carpeta de plantillas contiene un enlace y no se usa.' }
  }

  /** Ni la raíz, la categoría o el archivo pueden ser enlaces simbólicos o uniones, y lo existente debe resolverse dentro de la raíz real, para que ninguna operación actúe fuera de la carpeta de plantillas. */
  private sinEnlaces(raiz: string, carpeta: string, ruta?: string): boolean {
    const norm = (p: string) => (process.platform === 'win32' ? p.toLowerCase() : p)
    try {
      for (const p of ruta ? [raiz, carpeta, ruta] : [raiz, carpeta]) {
        let st
        try {
          st = lstatSync(p)
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code === 'ENOENT') continue
          return false
        }
        if (st.isSymbolicLink()) return false
      }
      if (!existsSync(raiz)) return true
      const real = norm(realpathSync.native(raiz)) + sep
      for (const p of ruta ? [carpeta, ruta] : [carpeta]) {
        if (!existsSync(p)) continue
        if (!norm(realpathSync.native(p)).startsWith(real)) return false
      }
      return true
    } catch {
      return false
    }
  }

  /** Lista las categorías (un nivel) y sus `.kir`; crea la carpeta si falta. Ignora enlaces, lo que no es un `.kir` normal y pasa de los topes. */
  listarPlantillas(): ListaPlantillas {
    const raiz = this.d.plantillas
    if (!raiz) return { categorias: [], omitidas: 0 }
    mkdirSync(raiz, { recursive: true })
    let omitidas = 0
    const categorias: ListaPlantillas['categorias'] = []
    const alfabetico = (a: string, b: string) => a.localeCompare(b, 'es')
    const carpetas = readdirSync(raiz, { withFileTypes: true })
    for (const d of carpetas.sort((a, b) => alfabetico(a.name, b.name))) {
      // Los archivos sueltos y los enlaces no son categorías: solo carpetas reales con nombre válido.
      if (!d.isDirectory() || motivoNombreInvalido(d.name, 'categoría') || categorias.length >= MAX_CATEGORIAS) {
        omitidas++
        continue
      }
      const plantillas: ListaPlantillas['categorias'][number]['plantillas'] = []
      let archivos
      try {
        archivos = readdirSync(join(raiz, d.name), { withFileTypes: true })
      } catch {
        omitidas++
        continue
      }
      for (const f of archivos.sort((a, b) => alfabetico(a.name, b.name))) {
        const nombre = f.name.slice(0, -EXTENSION_PLANTILLA.length)
        if (!f.isFile() || !f.name.toLowerCase().endsWith(EXTENSION_PLANTILLA) || motivoNombreInvalido(nombre) || plantillas.length >= MAX_POR_CATEGORIA) {
          omitidas++
          continue
        }
        try {
          const st = lstatSync(join(raiz, d.name, f.name))
          if (st.isFile()) plantillas.push({ categoria: d.name, nombre, bytes: st.size })
        } catch {
          omitidas++
        }
      }
      categorias.push({ nombre: d.name, plantillas })
    }
    return { categorias, omitidas }
  }

  /** Bytes de una plantilla con las mismas comprobaciones y el mismo tope que abrir un `.kir`. */
  leerPlantilla(categoria: unknown, nombre: unknown): ResultadoLeerPlantilla {
    const r = this.rutaPlantilla(categoria, nombre)
    if ('error' in r) return { ok: false, error: r.error }
    // Un enlace simbólico (a una carpeta o a un archivo de fuera) no se sigue.
    try {
      if (lstatSync(r.ruta).isSymbolicLink() || lstatSync(dirname(r.ruta)).isSymbolicLink()) return { ok: false, error: 'No se encontró la plantilla.' }
    } catch {
      return { ok: false, error: 'No se encontró la plantilla.' }
    }
    const l = leerKirDelDisco(r.ruta)
    return l.ok ? { ok: true, bytes: l.bytes } : { ok: false, error: l.error }
  }

  guardarPlantilla(categoria: unknown, nombre: unknown, bytes: unknown, reemplazar: unknown): ResultadoPlantilla {
    const r = this.rutaPlantilla(categoria, nombre)
    if ('error' in r) return { ok: false, error: r.error }
    if (!(bytes instanceof Uint8Array) || bytes.length === 0 || bytes.length > LIMITE_KIR) return { ok: false, error: 'La plantilla es demasiado grande para guardarla.' }
    const repetida = `Ya hay una plantilla llamada «${nombre as string}» en esa categoría.`
    if (existsSync(r.ruta) && reemplazar !== true) return { ok: false, existe: true, error: repetida }
    try {
      // Sin reemplazar, el paso final es exclusivo: si otro proceso creó el archivo entre la comprobación y la escritura, falla.
      escribirAtomico(r.ruta, bytes, { crearCarpeta: true, exclusivo: reemplazar !== true })
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'EEXIST') return { ok: false, existe: true, error: repetida }
      return { ok: false, error: `No se pudo guardar la plantilla: ${motivoDeError(e)}.` }
    }
    return { ok: true }
  }

  renombrarPlantilla(categoria: unknown, nombre: unknown, nuevo: unknown): ResultadoPlantilla {
    const de = this.rutaPlantilla(categoria, nombre)
    const a = this.rutaPlantilla(categoria, nuevo)
    if ('error' in de) return { ok: false, error: de.error }
    if ('error' in a) return { ok: false, error: a.error }
    return this.moverArchivo(de.ruta, a.ruta, `Ya hay una plantilla llamada «${nuevo as string}» en esa categoría.`)
  }

  moverPlantilla(categoria: unknown, nombre: unknown, nuevaCategoria: unknown): ResultadoPlantilla {
    const de = this.rutaPlantilla(categoria, nombre)
    const a = this.rutaPlantilla(nuevaCategoria, nombre)
    if ('error' in de) return { ok: false, error: de.error }
    if ('error' in a) return { ok: false, error: a.error }
    return this.moverArchivo(de.ruta, a.ruta, `Ya hay una plantilla llamada «${nombre as string}» en esa categoría.`)
  }

  private moverArchivo(de: string, a: string, repetida: string): ResultadoPlantilla {
    try {
      if (!lstatSync(de).isFile()) return { ok: false, error: 'No se encontró la plantilla.' }
    } catch {
      return { ok: false, error: 'No se encontró la plantilla.' }
    }
    // En Windows renombrar sobre un archivo existente lo reemplaza: se comprueba antes.
    if (existsSync(a) && !mismoArchivo(de, a)) return { ok: false, existe: true, error: repetida }
    try {
      mkdirSync(dirname(a), { recursive: true })
      renameSync(de, a)
    } catch (e) {
      return { ok: false, error: `No se pudo mover la plantilla: ${motivoDeError(e)}.` }
    }
    return { ok: true }
  }

  borrarPlantilla(categoria: unknown, nombre: unknown): ResultadoPlantilla {
    const r = this.rutaPlantilla(categoria, nombre)
    if ('error' in r) return { ok: false, error: r.error }
    try {
      if (!lstatSync(r.ruta).isFile()) return { ok: false, error: 'No se encontró la plantilla.' }
      rmSync(r.ruta)
    } catch (e) {
      return { ok: false, error: (e as NodeJS.ErrnoException).code === 'ENOENT' ? 'No se encontró la plantilla.' : `No se pudo borrar la plantilla: ${motivoDeError(e)}.` }
    }
    return { ok: true }
  }

  /** Borra una categoría propia: solo carpetas reales dentro de la raíz con plantillas normales, con `rmdir` y nunca recursivo. Con plantillas dentro exige `confirmada === true` y contesta cuántas se irían. */
  borrarCategoria(categoria: unknown, confirmada: unknown): ResultadoBorrarCategoria {
    const r = this.rutaPlantilla(categoria)
    if ('error' in r) return { ok: false, error: r.error }
    let entradas
    try {
      if (!lstatSync(r.ruta).isDirectory()) return { ok: false, error: 'No se encontró la categoría.' }
      entradas = readdirSync(r.ruta, { withFileTypes: true })
    } catch (e) {
      return { ok: false, error: (e as NodeJS.ErrnoException).code === 'ENOENT' ? 'No se encontró la categoría.' : `No se pudo leer la categoría: ${motivoDeError(e)}.` }
    }
    // El explorador deja desktop.ini y Thumbs.db en las carpetas que abre: no son del usuario y se van con la categoría.
    const delSistema = entradas.filter((f) => f.isFile() && ARCHIVOS_DEL_SISTEMA.has(f.name.toLowerCase()))
    const propias = entradas.filter((f) => f.isFile() && f.name.toLowerCase().endsWith(EXTENSION_PLANTILLA) && !motivoNombreInvalido(f.name.slice(0, -EXTENSION_PLANTILLA.length)))
    if (propias.length + delSistema.length !== entradas.length) return { ok: false, error: 'La carpeta tiene archivos que no son plantillas de Kirchi: no se borró. Si ya no la quieres, bórrala desde el explorador.' }
    if (propias.length > 0 && confirmada !== true) {
      return { ok: false, error: `La categoría tiene ${propias.length} ${propias.length === 1 ? 'plantilla' : 'plantillas'}: falta confirmar el borrado.`, noVacia: propias.length }
    }
    try {
      for (const f of [...propias, ...delSistema]) {
        const ruta = join(r.ruta, f.name)
        // Entre listar y borrar el archivo pudo cambiar por un enlace: solo se borra un archivo normal.
        if (!lstatSync(ruta).isFile()) return { ok: false, error: 'La carpeta cambió mientras se borraba: no se siguió.' }
        rmSync(ruta)
      }
      rmdirSync(r.ruta)
    } catch (e) {
      return { ok: false, error: `No se pudo borrar la categoría: ${motivoDeError(e)}.` }
    }
    return { ok: true, borradas: propias.length }
  }

  /** Abre en el explorador la carpeta de la categoría; con una categoría que no sirve (o ninguna), la raíz. */
  async mostrarPlantillas(categoria?: unknown): Promise<void> {
    const raiz = this.d.plantillas
    if (!raiz) throw new Error('No se encontró la carpeta Documentos de este equipo.')
    const r = categoria === undefined ? null : this.rutaPlantilla(categoria)
    const dir = r && 'ruta' in r && existsSync(r.ruta) ? r.ruta : raiz
    try {
      mkdirSync(dir, { recursive: true })
    } catch (e) {
      throw new Error(`No se pudo abrir la carpeta de plantillas: ${motivoDeError(e)}.`)
    }
    await this.d.abrirCarpeta(dir)
  }
}

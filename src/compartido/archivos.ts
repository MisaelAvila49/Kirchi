/** Contrato de archivos entre la interfaz y el proceso principal: canales IPC, tipos, límites y funciones puras sobre rutas. Todo el disco se toca en el proceso principal. No importa nada. */

/** Tamaño máximo de un `.kir` en el disco: se comprueba antes de leerlo y antes de pasarlo por IPC. */
export const LIMITE_KIR = 64 * 2 ** 20
/** Tamaño máximo de una imagen exportada o de un SVG para PDF que cruza el IPC. */
export const LIMITE_EXPORTAR = 256 * 2 ** 20
/** Tamaño máximo de un renglón del diario. */
export const LIMITE_RENGLON = 64 * 2 ** 20
/** Archivos recientes que se recuerdan en el menú Archivo. */
export const MAX_ARCHIVOS_RECIENTES = 10
/** Largo máximo de una ruta que se acepta (Windows con rutas largas llega a 32,767). */
export const LARGO_MAXIMO_RUTA = 4096
/** Nombre de un circuito que todavía no se guardó. */
export const NOMBRE_NUEVO = 'sin título.kir'

export const CANALES = {
  /** invoke() → ResultadoAbrir: diálogo de abrir y lectura del archivo elegido. */
  abrir: 'archivo:abrir',
  /** invoke(ruta) → ResultadoAbrir: solo rutas que están en Recientes (el proceso principal lo comprueba). */
  abrirReciente: 'archivo:abrir-reciente',
  /** invoke(ruta) → ResultadoAbrir: archivo soltado, con canal propio para auditarlo. El preload saca la ruta del `File` y el proceso principal rechaza las de red. */
  abrirSoltado: 'archivo:abrir-soltado',
  /** invoke() → ResultadoAbrir | null: el `.kir` con que se abrió Kirchi (doble clic o línea de órdenes). */
  inicial: 'archivo:inicial',
  /** invoke(nombreSugerido) → string | null: diálogo de Guardar como; la ruta elegida queda permitida para escribir. */
  rutaGuardar: 'archivo:ruta-guardar',
  /** invoke(ruta, bytes) → ResultadoGuardar: respaldo del anterior, escritura atómica, base del diario y Recientes. */
  guardar: 'archivo:guardar',
  /** invoke() → string[]: vacía la lista de Recientes. */
  olvidarRecientes: 'archivo:olvidar-recientes',
  /** invoke(): abre la carpeta de respaldos en el explorador del sistema. */
  abrirRespaldos: 'archivo:abrir-respaldos',
  /** invoke(formato, nombreSugerido) → string | null: diálogo de exportar; la ruta elegida queda permitida. */
  rutaExportar: 'exportar:ruta',
  /** invoke(ruta, bytes) → ResultadoGuardar: escribe un PNG o un SVG ya armado. */
  escribirExportacion: 'exportar:escribir',
  /** invoke(ruta, svg, pagina) → ResultadoGuardar: imprime el SVG a PDF en una ventana oculta y sin red. */
  pdf: 'exportar:pdf',
  /** send(bytes, base): reemplaza la base del diario de esta ventana y lo vacía. */
  diarioBase: 'diario:base',
  /** send(renglon): agrega un renglón al diario. */
  diarioAnotar: 'diario:anotar',
  /** invoke() → Recuperable[]: sesiones de Kirchi que se cerraron mal con cambios sin guardar. */
  recuperables: 'diario:recuperables',
  /** invoke(id) → DatosRecuperacion | null. */
  recuperar: 'diario:recuperar',
  /** invoke(id): borra una sesión recuperable. */
  descartar: 'diario:descartar',
  /** send(EstadoVentana): la interfaz avisa si hay cambios sin guardar (el cierre pregunta). */
  estadoVentana: 'ventana:estado',
  /** Del proceso principal a la interfaz: el usuario quiere cerrar y hay cambios sin guardar. */
  pideCerrar: 'ventana:pide-cerrar',
  /** send(descartar): la interfaz ya resolvió (guardó o descartó): cerrar de verdad. */
  cerrar: 'ventana:cerrar',
  /** Del proceso principal a la interfaz: el diario de autoguardado no se pudo escribir (mensaje de texto). */
  diarioError: 'diario:error',
  /** El proceso principal manda un ResultadoAbrir ya leído de un `.kir` que llegó del sistema (doble clic con Kirchi abierto, `open-file`). La página no puede originar este mensaje. */
  abrirExterno: 'archivo:abrir-externo',
  /** Del proceso principal a la interfaz: el archivo abierto cambió en el disco por otro lado (lleva su nombre). */
  cambioEnDisco: 'archivo:cambio-en-disco',
  /** invoke() → ResultadoAbrir: vuelve a leer del disco el archivo abierto en la ventana. */
  recargar: 'archivo:recargar',
  /** invoke() → Ajustes: los ajustes vigentes (una recarga de la interfaz no arranca con datos viejos). */
  leerAjustes: 'ajustes:leer'
} as const

export interface ArchivoLeido {
  ruta: string
  nombre: string
  bytes: Uint8Array
}

export type ResultadoAbrir =
  | { ok: true; archivo: ArchivoLeido; recientes: string[] }
  | { ok: false; cancelado: true }
  | { ok: false; error: string; recientes: string[] }

export type ResultadoGuardar = { ok: true; recientes: string[] } | { ok: false; error: string }

/** Datos de la base del diario: el archivo al que corresponde y si la base misma está sin guardar (recuperada). */
export interface BaseDiario {
  ruta: string | null
  nombre: string
  sucio: boolean
}

export interface Recuperable {
  id: string
  nombre: string
  ruta: string | null
  /** Hora del último cambio anotado (ms desde 1970). */
  fecha: number
}

export interface DatosRecuperacion {
  base: Uint8Array
  diario: string
  ruta: string | null
  nombre: string
}

export interface EstadoVentana {
  /** Hay cambios sin guardar: cerrar la ventana pregunta antes. */
  sucio: boolean
}

export type FormatoExportar = 'png' | 'svg' | 'pdf'
export const FORMATOS_EXPORTAR: readonly FormatoExportar[] = ['png', 'svg', 'pdf']
/** Lo que el diálogo de exportar acepta: el esquema y el CSV de una captura del osciloscopio. */
export type FormatoArchivoExportar = FormatoExportar | 'csv'
export const FORMATOS_ARCHIVO_EXPORTAR: readonly FormatoArchivoExportar[] = [...FORMATOS_EXPORTAR, 'csv']

export type TipoPagina = 'ajustar' | 'a4' | 'carta'
export const PAGINAS: readonly TipoPagina[] = ['ajustar', 'a4', 'carta']

/** Página de un PDF: tipo y tamaño del dibujo (con su margen) en mm. */
export interface PaginaPdf {
  tipo: TipoPagina
  anchoMm: number
  altoMm: number
}

/** Lo que el preload expone como `window.kirchi.archivos`. */
export interface ApiArchivos {
  abrir(): Promise<ResultadoAbrir>
  abrirReciente(ruta: string): Promise<ResultadoAbrir>
  /** Abre el `File` soltado: el preload saca su ruta con `webUtils.getPathForFile`, null si no tiene (un `File` armado en la página). */
  abrirSoltado(f: File): Promise<ResultadoAbrir | null>
  inicial(): Promise<ResultadoAbrir | null>
  rutaGuardar(nombreSugerido: string): Promise<string | null>
  guardar(ruta: string, bytes: Uint8Array): Promise<ResultadoGuardar>
  olvidarRecientes(): Promise<string[]>
  abrirRespaldos(): Promise<void>
  rutaExportar(formato: FormatoArchivoExportar, nombreSugerido: string): Promise<string | null>
  escribirExportacion(ruta: string, bytes: Uint8Array): Promise<ResultadoGuardar>
  pdf(ruta: string, svg: string, pagina: PaginaPdf): Promise<ResultadoGuardar>
  diarioBase(bytes: Uint8Array, base: BaseDiario): void
  diarioAnotar(renglon: string): void
  recuperables(): Promise<Recuperable[]>
  recuperar(id: string): Promise<DatosRecuperacion | null>
  descartar(id: string): Promise<void>
  estadoVentana(e: EstadoVentana): void
  /** Registra quién responde cuando el usuario quiere cerrar con cambios sin guardar; devuelve cómo quitarlo. */
  alPedirCerrar(f: () => void): () => void
  cerrar(descartar: boolean): void
  /** Registra quién muestra (en el Registro) que el diario de autoguardado no se pudo escribir; devuelve cómo quitarlo. */
  alErrorDiario(f: (mensaje: string) => void): () => void
  /** Registra quién carga un `.kir` que abrió el sistema con Kirchi ya abierto. El proceso principal ya lo leyó con las comprobaciones de Abrir. */
  alAbrirExterno(f: (r: ResultadoAbrir) => void): () => void
  /** Registra quién avisa que el archivo abierto cambió en el disco por otro lado; devuelve cómo quitarlo. */
  alCambioEnDisco?(f: (nombre: string) => void): () => void
  /** Vuelve a leer del disco el archivo abierto (el proceso principal sabe cuál es: la página no manda la ruta). */
  recargar?(): Promise<ResultadoAbrir>
}

/** Último tramo de una ruta, con separadores de Windows o de Unix. */
export function nombreDeRuta(ruta: string): string {
  const partes = ruta.split(/[\\/]/).filter(Boolean)
  return partes[partes.length - 1] ?? ruta
}

/** Carpeta de una ruta (sin el último tramo); '' si no tiene. */
export function carpetaDeRuta(ruta: string): string {
  const i = Math.max(ruta.lastIndexOf('/'), ruta.lastIndexOf('\\'))
  return i <= 0 ? '' : ruta.slice(0, i)
}

/** Extensión en minúsculas y sin punto («kir»); '' si no tiene. */
export function extension(ruta: string): string {
  const n = nombreDeRuta(ruta)
  const i = n.lastIndexOf('.')
  return i <= 0 ? '' : n.slice(i + 1).toLowerCase()
}

export const esRutaKir = (ruta: string): boolean => extension(ruta) === 'kir'

/** «practica-3.kir» → «practica-3.png»; sin extensión, se agrega. */
export function cambiarExtension(nombre: string, ext: string): string {
  const i = nombre.lastIndexOf('.')
  return `${i > 0 ? nombre.slice(0, i) : nombre}.${ext}`
}

/** Cuántos `.kir` de una misma orden de arranque se atienden (los demás se ignoran). */
export const MAX_ARCHIVOS_DE_ARRANQUE = 4

/**
 * Los `.kir` de una línea de órdenes, que no es de fiar: cuentan solo los argumentos que no son banderas, terminan en `.kir`, no traen nulos ni controles, sin repetidos y hasta `MAX_ARCHIVOS_DE_ARRANQUE`.
 * Aún no son rutas válidas: quien las abre las resuelve y las comprueba como «Abrir».
 */
export function rutasKirDeArgumentos(argv: readonly string[], max = MAX_ARCHIVOS_DE_ARRANQUE): string[] {
  const salida: string[] = []
  for (const a of argv.slice(1)) {
    if (salida.length >= max) break
    if (typeof a !== 'string' || a.length > LARGO_MAXIMO_RUTA || a.startsWith('-') || /\p{Cc}/u.test(a) || !esRutaKir(a)) continue
    if (!salida.includes(a)) salida.push(a)
  }
  return salida
}

/** El primer `.kir` de la línea de órdenes, o null. */
export function rutaKirDeArgumentos(argv: readonly string[]): string | null {
  return rutasKirDeArgumentos(argv, 1)[0] ?? null
}

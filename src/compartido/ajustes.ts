/** Ajustes de la aplicación (settings.json en la carpeta de datos, escritos por el proceso principal). Solo importa tipos y constantes de `./archivos`. */
import type { ApiNgspice } from './ngspice'
import type { ApiGraficas } from './graficas'
import type { ApiOsciloscopio } from './ventanaOsc'
import type { ApiAsistente } from './asistente'
import type { ApiGrabacion } from './grabacion'
import type { ApiPlantillas } from './plantillas'
import { esRutaKir, LARGO_MAXIMO_RUTA, MAX_ARCHIVOS_RECIENTES, PAGINAS, type ApiArchivos, type TipoPagina } from './archivos'
import { esTamañoInterfaz, estadoDeVentana, TAMAÑO_INTERFAZ_NORMAL, type EstadoVentana, type OrdenVentana, type TamañoInterfaz } from './ventana'

export type Tema = 'claro' | 'oscuro'
export type ColorCables = 'verde' | 'tinta' | 'azul'
export type PanelLateral = 'libreria' | 'plantillas' | 'calculadoras'
/** Los paneles del riel derecho: el izquierdo es para colocar, el derecho para ver cómo funciona. */
export type PanelDerecho = 'inspector' | 'mediciones' | 'proyecto' | 'analisis'
/** Pestañas de la cinta de la barra superior (Instrumentos y Análisis son botones con menú, no pestañas). */
export type PestañaCinta = 'inicio' | 'vista' | 'ayuda'

/** Serie de valores comerciales que el editor ofrece para resistencias y capacitores; «libre» no avisa de nada. */
export type SerieComercial = 'E6' | 'E12' | 'E24' | 'libre'
export const SERIES_COMERCIALES: readonly SerieComercial[] = ['E6', 'E12', 'E24', 'libre']

/** Qué se escribe en el recuadro del ajuste de una pieza que se mueve (potenciómetro, termistor, fotorresistencia): la pieza puede pedir otra cosa. */
export type TextoAjuste = 'Ajuste' | 'Valores' | 'Ambos' | 'Nada'
export const TEXTOS_AJUSTE: readonly TextoAjuste[] = ['Ajuste', 'Valores', 'Ambos', 'Nada']

export const TEMAS: readonly Tema[] = ['claro', 'oscuro']
export const COLORES_DE_CABLE: readonly ColorCables[] = ['verde', 'tinta', 'azul']
export const PANELES: readonly PanelLateral[] = ['libreria', 'plantillas', 'calculadoras']
export const PANELES_DERECHOS: readonly PanelDerecho[] = ['inspector', 'mediciones', 'proyecto', 'analisis']
export const PESTAÑAS_CINTA: readonly PestañaCinta[] = ['inicio', 'vista', 'ayuda']

/** Fondo de una imagen exportada (blanco por omisión): papel, sin fondo (PNG y SVG) u oscuro, cada uno con la paleta de su tema. Un settings.json viejo traía `tema` y pasa a `papel` u `oscuro`. */
export type FondoExportar = 'papel' | 'blanco' | 'transparente' | 'oscuro'
export const FONDOS_EXPORTAR: readonly FondoExportar[] = ['papel', 'blanco', 'transparente', 'oscuro']
/** Resolución del PNG: múltiplos de 96 ppp (el 100 % del zoom). */
export type EscalaPng = 1 | 2 | 3 | 4
export const ESCALAS_PNG: readonly EscalaPng[] = [1, 2, 3, 4]

export interface OpcionesExportar {
  fondo: FondoExportar
  rejilla: boolean
  escala: EscalaPng
  pagina: TipoPagina
  /** El esquema lleva los instrumentos y las etiquetas de sus terminales. */
  instrumentos: boolean
  /** Los medidores rápidos salen con su lectura; sin ella, con rayas. */
  lecturasMedidores: boolean
  /** Con la vista previa corriendo, los cables salen con su color de voltaje (escala azul a naranja). */
  coloresVoltaje: boolean
  /** Margen alrededor de lo que se exporta, en mm (0 a 30). */
  margenMm: number
  /** Los cables salen en tinta negra y no en el color elegido para el lienzo (el preajuste Informe). */
  tintaNegra: boolean
}

export const MARGEN_EXPORTAR_MM = [0, 30] as const

/** Opciones de exportación de una figura de datos. Nunca un color escrito: cada serie guarda el NOMBRE de un tono y el tema lo resuelve al dibujar. */
export type FormatoFigura = 'png' | 'svg' | 'pdf' | 'csv'
export const FORMATOS_FIGURA: readonly FormatoFigura[] = ['png', 'svg', 'pdf', 'csv']
/** Separador de columnas de un CSV: coma, punto y coma (hojas de cálculo en español) o tabulador. */
export type SeparadorCsv = 'coma' | 'punto-y-coma' | 'tab'
export const SEPARADORES_CSV: readonly SeparadorCsv[] = ['coma', 'punto-y-coma', 'tab']
/** Muestras del CSV: todas, una de cada 10 o una de cada 100 (siempre quedan la primera y la última de cada bloque). */
export type MuestreoCsv = 1 | 10 | 100
export const MUESTREOS_CSV: readonly MuestreoCsv[] = [1, 10, 100]
/** Las tres familias que Kirchi empaqueta: la de la interfaz, la de las cifras y la serif. */
export type FamiliaFigura = 'interfaz' | 'cifras' | 'serif'
export const FAMILIAS_FIGURA: readonly FamiliaFigura[] = ['interfaz', 'cifras', 'serif']
export const TAMAÑO_LETRA_FIGURA = [9, 14] as const
/** Tema de una figura exportada (fondo, rejilla y escalas juntos): como la aplicación, claro (hoja blanca para papel) u oscuro. */
export type TemaFigura = 'app' | 'claro' | 'oscuro'
export const TEMAS_FIGURA: readonly TemaFigura[] = ['app', 'claro', 'oscuro']
/** Los tonos que puede tener la línea de una serie: los de canal (validados entre sí), tres más y el negro (la tinta: sobre un fondo oscuro se ve clara). */
export const TONOS_FIGURA = ['canal-a', 'canal-b', 'canal-c', 'canal-d', 'naranja', 'magenta', 'gris', 'negro'] as const
export type TonoFigura = (typeof TONOS_FIGURA)[number]
export const MAX_SERIES_FIGURA = 16

export interface OpcionesFigura {
  formato: FormatoFigura
  escala: EscalaPng
  fuente: FamiliaFigura
  /** Tamaño base de las letras en px (entero entre 9 y 14). */
  tamañoLetra: number
  tema: TemaFigura
  /** CSV: cómo se separan las columnas. */
  separadorCsv: SeparadorCsv
  /** CSV: cuántas muestras se saltan entre dos renglones. */
  muestreoCsv: MuestreoCsv
  ejes: boolean
  rejilla: boolean
  /** El tono de cada serie por su nombre (en el osciloscopio A a D y M para A − B). */
  colores: Record<string, TonoFigura>
}

export const coloresFiguraPorOmision = (): Record<string, TonoFigura> => ({ A: 'canal-a', B: 'canal-b', C: 'canal-c', D: 'canal-d', M: 'gris' })
export const figuraPorOmision = (): OpcionesFigura => ({ formato: 'png', escala: 2, fuente: 'interfaz', tamañoLetra: 11, tema: 'claro', separadorCsv: 'coma', muestreoCsv: 1, ejes: true, rejilla: true, colores: coloresFiguraPorOmision() })

/** Lo que se recuerda de la vista previa entre sesiones. La velocidad del tiempo no: es de la sesión de cada ventana. */
export interface AjustesSimulacion {
  /** Corriente animada (tecla C): apagada por omisión, como los chips de voltaje. */
  corriente: boolean
  /** Animaciones encendidas por omisión. Con `prefers-reduced-motion` empiezan en pausa cada sesión aunque esto diga que no. */
  animaciones: boolean
  /** Sonido (tecla M): encendido por omisión con el volumen al 50 %. */
  sonido: boolean
  /** Volumen de 0 a 100. */
  volumen: number
  /** «Velocidad de las flechas»: de 0.25 a 4 (1 por omisión). */
  velocidadFlechas: number
  /** «Las piezas se queman»: apagada por omisión. */
  quemar: boolean
}

export const RANGO_VELOCIDAD_FLECHAS: readonly [number, number] = [0.25, 4]
export const simulacionPorOmision = (): AjustesSimulacion => ({ corriente: false, animaciones: true, sonido: true, volumen: 50, velocidadFlechas: 1, quemar: false })

/** La cinta de la barra superior: plegada (solo queda la fila de pestañas) y la pestaña elegida. */
export interface AjustesCinta {
  plegada: boolean
  pestaña: PestañaCinta
}

/** Avance de un capítulo del tutorial: el paso en que va (desde 0) y si ya se terminó. */
export interface AvanceCapitulo {
  paso: number
  hecho: boolean
}

/** Tutorial «Aprende Kirchi»: el avance vive aquí y nunca en el `.kir`. `ofertaVista` indica que la oferta del primer arranque ya se mostró; `avance` va por id de capítulo. */
export interface AjustesTutorial {
  ofertaVista: boolean
  /** «Avanzar solo en el tutorial»: un paso cumplido pasa al siguiente tras una espera. Encendido por omisión. */
  avanzarSolo: boolean
  avance: Record<string, AvanceCapitulo>
}

export const MAX_CAPITULOS_TUTORIAL = 12
export const MAX_PASO_TUTORIAL = 99
/**
 * Los capítulos que existen (`ui/tutorial/capitulos.ts`; una prueba los compara): el avance de cualquier otro id se descarta. Los ids de los cinco capítulos de antes (`primer-circuito`, `medir`, `senales`, `archivo`, `trucos`) no están aquí a propósito: sus pasos ya no son los mismos, así que su avance se descarta sin error y los capítulos nuevos empiezan sin empezar.
 */
export const IDS_CAPITULOS_TUTORIAL: readonly string[] = ['conoce', 'circuito', 'medir-senales', 'analizar', 'importar']
export const tutorialPorOmision = (): AjustesTutorial => ({ ofertaVista: false, avanzarSolo: true, avance: {} })

/** Los tres diálogos de archivo que recuerdan su última carpeta (las plantillas no: tienen carpeta fija). */
export type TipoCarpeta = 'abrir' | 'guardar' | 'exportar'
export const TIPOS_CARPETA: readonly TipoCarpeta[] = ['abrir', 'guardar', 'exportar']
/** Última carpeta de cada diálogo (ruta absoluta) o null mientras no se ha usado. */
export type CarpetasDialogo = Record<TipoCarpeta, string | null>
export const carpetasPorOmision = (): CarpetasDialogo => ({ abrir: null, guardar: null, exportar: null })

/** Opciones de la grabación de pantalla: qué se graba, a qué calidad, con qué micrófono y si se resaltan los clics. */
export type QueGrabar = 'ventana' | 'lienzo'
export type CalidadGrabacion = '720p' | '1080p' | 'real'
export const QUE_GRABAR: readonly QueGrabar[] = ['ventana', 'lienzo']
export const CALIDADES_GRABACION: readonly CalidadGrabacion[] = ['720p', '1080p', 'real']
export const LARGO_MAXIMO_MICROFONO = 300
export interface OpcionesGrabacion {
  que: QueGrabar
  calidad: CalidadGrabacion
  /** `deviceId` del micrófono elegido, o null para grabar sin voz. */
  microfono: string | null
  resaltarClics: boolean
}
export const grabacionPorOmision = (): OpcionesGrabacion => ({ que: 'ventana', calidad: '1080p', microfono: null, resaltarClics: true })

/** El asistente (servidor MCP): apagado por omisión y por usuario. */
export interface AjustesAsistente {
  activo: boolean
}
export const asistentePorOmision = (): AjustesAsistente => ({ activo: false })

export interface Ajustes {
  tema: Tema
  colorCables: ColorCables
  /** Panel que muestra el riel de iconos. */
  panel: PanelLateral
  /** Panel lateral abierto (false: plegado). */
  lateral: boolean
  /** Panel que muestra el riel derecho (Inspector, Mediciones o Proyecto). */
  panelDerecho: PanelDerecho
  /** Panel derecho abierto (false: plegado). Se llama `inspector` por los settings.json de antes. */
  inspector: boolean
  /** Ids de las piezas usadas hace poco, la más reciente primero. */
  recientes: string[]
  /** Últimos archivos abiertos o guardados, el más reciente primero. Solo los cambia el proceso principal. */
  archivosRecientes: string[]
  /** Últimas opciones elegidas en el diálogo de exportar. */
  exportar: OpcionesExportar
  /** Últimas opciones del diálogo de exportar una figura de datos (la captura del osciloscopio). */
  figura: OpcionesFigura
  /** Teclas propias por id de comando (solo las que se apartan de las de fábrica; [] deja el comando sin tecla). */
  atajos: Record<string, string[]>
  /** Barra superior: desplegada la primera vez y en Inicio; luego se recuerda. */
  cinta: AjustesCinta
  /** Dibujo del lienzo sincronizado con la ventana (sin parpadeo al cambiar el tamaño). Apagado usa `desynchronized`. Se aplica al reabrir Kirchi. */
  lienzoSincronizado: boolean
  /** Serie comercial de resistencias y capacitores en el inspector y el doble clic: E12 por omisión. */
  serieComercial: SerieComercial
  /** Lo que dice el recuadro del ajuste de las piezas que no piden otra cosa en su opción «Mostrar». */
  textoAjuste: TextoAjuste
  /** Tamaño de la interfaz en por ciento (el zoom de la página): uno de los pasos de 80 a 150. Lo aplica el proceso principal. */
  tamañoInterfaz: TamañoInterfaz
  /** Alto del panel de la franja abierta (px), o null si nunca se arrastró su borde: 150 px, y 320 al abrir el osciloscopio. Se acota al 60 % del alto de la ventana. */
  altoFranja: number | null
  /** Corriente animada, animaciones, sonido, volumen, velocidad de las flechas y quemado. */
  simulacion: AjustesSimulacion
  /** Tutorial «Aprende Kirchi»: la oferta del primer arranque y el avance por capítulo. */
  tutorial: AjustesTutorial
  /** Categorías del panel Plantillas que el usuario plegó (el nombre de la carpeta), para que sigan plegadas al volver. */
  plantillasPlegadas: string[]
  /** Grupos de la Librería que el usuario plegó («<categoría>/<grupo>»), para que sigan plegados al volver. */
  libreriaPlegada: string[]
  /** Secciones del panel Proyecto que el usuario plegó («piezas», «redes», «alimentaciones» o «cat:<categoría>»). */
  proyectoPlegado: string[]
  /** La sección «Datos de la pieza» del inspector está plegada (lo está la primera vez). */
  inspectorDatosPlegado: boolean
  /** Número de patilla junto a cada pin de los chips de Digitales e Integrados (Vista › Números de patilla); visibles la primera vez. */
  numerosPatilla: boolean
  /** Cómo se cerró la última ventana (rectángulo, maximizada, pantalla completa): solo la anota el proceso principal. */
  ventana: EstadoVentana | null
  /** Última carpeta de abrir, guardar y exportar: solo la anota el proceso principal, que la valida al usarla. */
  carpetas: CarpetasDialogo
  /** Opciones de la grabación de pantalla. */
  grabacion: OpcionesGrabacion
  /** Carpeta de grabaciones elegida por el usuario (solo la anota el proceso principal); sin ella, `Videos/Kirchi`. */
  carpetaGrabaciones?: string
  /** El permiso del asistente (el proceso principal lo anota al encender o apagar el interruptor). */
  asistente: AjustesAsistente
  /** Carpeta del asistente elegida por el usuario con el diálogo de carpeta; sin ella, `Documentos/Kirchi/Asistente`. */
  carpetaAsistente?: string
}

/** Tope de categorías plegadas que se recuerdan (más que las carpetas que admite el almacén de plantillas, 100). */
export const MAX_PLEGADAS_PLANTILLAS = 101
export const LARGO_CATEGORIA_PLEGADA = 80

/** El alto mínimo del panel de la franja y el tope que admite un settings.json (la ventana lo acota además a su 60 %). */
export const ALTO_FRANJA_MIN = 150
export const ALTO_FRANJA_TOPE = 4000

/** Límites de los atajos guardados: un settings.json alterado no mete otra cosa. */
export const MAX_COMANDOS_PROPIOS = 200
export const MAX_TECLAS_POR_COMANDO = 4

export const MAX_RECIENTES = 8

export const exportarPorOmision = (): OpcionesExportar => ({ fondo: 'blanco', rejilla: false, escala: 2, pagina: 'ajustar', instrumentos: true, lecturasMedidores: true, coloresVoltaje: false, margenMm: 5, tintaNegra: false })

/** Tema claro la primera vez: el oscuro solo aparece si el usuario lo elige. */
export const ajustesPorOmision = (): Ajustes => ({
  tema: 'claro',
  colorCables: 'verde',
  panel: 'libreria',
  panelDerecho: 'inspector',
  lateral: true,
  inspector: true,
  recientes: [],
  archivosRecientes: [],
  exportar: exportarPorOmision(),
  figura: figuraPorOmision(),
  atajos: {},
  cinta: { plegada: false, pestaña: 'inicio' },
  lienzoSincronizado: true,
  serieComercial: 'E12',
  textoAjuste: 'Valores',
  tamañoInterfaz: TAMAÑO_INTERFAZ_NORMAL,
  altoFranja: null,
  simulacion: simulacionPorOmision(),
  tutorial: tutorialPorOmision(),
  plantillasPlegadas: [],
  libreriaPlegada: [],
  proyectoPlegado: [],
  inspectorDatosPlegado: true,
  numerosPatilla: true,
  ventana: null,
  carpetas: carpetasPorOmision(),
  grabacion: grabacionPorOmision(),
  asistente: asistentePorOmision()
})

/** Ajustes con que arranca la interfaz: panel lateral e inspector siempre plegados, sin importar lo que quedó en settings.json. */
export const alArrancar = (a: Ajustes): Ajustes => ({ ...a, lateral: false, inspector: false })

const una = <T extends string>(v: unknown, opciones: readonly T[], defecto: T): T =>
  typeof v === 'string' && (opciones as readonly string[]).includes(v) ? (v as T) : defecto

const booleano = (v: unknown, defecto: boolean): boolean => (typeof v === 'boolean' ? v : defecto)

/** El alto de la franja: null (sin arrastrar) o un número de 150 a 4,000 px, redondeado; lo demás toma el de `defecto`. */
function altoFranja(v: unknown, defecto: number | null): number | null {
  if (v === null) return null
  if (typeof v !== 'number' || !Number.isFinite(v)) return defecto
  return v >= ALTO_FRANJA_MIN && v <= ALTO_FRANJA_TOPE ? Math.round(v) : null
}

/** Nombres de categoría plegadas: textos de 1 a 80 caracteres, sin repetir, hasta 101 (se corta al juntarlas). */
function plegadas(v: unknown, defecto: string[]): string[] {
  if (!Array.isArray(v)) return [...defecto]
  const nombres = new Set<string>()
  for (const x of v) {
    if (typeof x === 'string' && x.length > 0 && x.length <= LARGO_CATEGORIA_PLEGADA) nombres.add(x)
    if (nombres.size >= MAX_PLEGADAS_PLANTILLAS) break
  }
  return [...nombres]
}

function recientes(v: unknown, defecto: string[]): string[] {
  if (!Array.isArray(v)) return [...defecto]
  const ids = new Set<string>()
  // Se corta al juntar ocho válidos: un arreglo enorme no se recorre entero.
  for (const x of v) {
    if (typeof x === 'string' && x.length > 0 && x.length <= 64) ids.add(x)
    if (ids.size >= MAX_RECIENTES) break
  }
  return [...ids]
}

/** Ruta absoluta de Windows (`C:\…`, `\\servidor\…`) o de Unix (`/…`), sin depender de `node:path`. */
const esAbsoluta = (r: string): boolean => /^[A-Za-z]:[\\/]/.test(r) || /^[\\/]/.test(r)

/** Rutas de `.kir` absolutas, sin nulos ni repetidos, como máximo diez. Se corta al juntarlas para no recorrer un arreglo enorme de un settings.json alterado. */
function rutas(v: unknown, defecto: string[]): string[] {
  if (!Array.isArray(v)) return [...defecto]
  const out = new Set<string>()
  for (const x of v) {
    if (typeof x === 'string' && x.length > 0 && x.length <= LARGO_MAXIMO_RUTA && !x.includes('\0') && esAbsoluta(x) && esRutaKir(x)) out.add(x)
    if (out.size >= MAX_ARCHIVOS_RECIENTES) break
  }
  return [...out]
}

const propia = (o: Record<string, unknown>, k: string): unknown => (Object.hasOwn(o, k) ? o[k] : undefined)

const objeto = (v: unknown): Record<string, unknown> => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})

/** Las tres carpetas: rutas absolutas de texto razonable, lo demás queda en null; un parche con una sola conserva las otras. */
function carpetas(v: unknown, base: CarpetasDialogo): CarpetasDialogo {
  const o = objeto(v)
  const una = (k: TipoCarpeta): string | null => {
    const c = propia(o, k)
    if (c === undefined) return base[k]
    return typeof c === 'string' && c.length > 0 && c.length <= LARGO_MAXIMO_RUTA && !c.includes('\0') && esAbsoluta(c) ? c : null
  }
  return { abrir: una('abrir'), guardar: una('guardar'), exportar: una('exportar') }
}

/** La carpeta del asistente: ruta absoluta de texto razonable o ausente. */
function carpetaAsistente(v: unknown, base: string | undefined): { carpetaAsistente?: string } {
  const c = v === undefined ? base : v
  return typeof c === 'string' && c.length > 0 && c.length <= LARGO_MAXIMO_RUTA && !c.includes('\0') && esAbsoluta(c) ? { carpetaAsistente: c } : {}
}

/** La carpeta de grabaciones: ruta absoluta de texto razonable o ausente. */
function carpetaGrabaciones(v: unknown, base: string | undefined): { carpetaGrabaciones?: string } {
  const c = v === undefined ? base : v
  return typeof c === 'string' && c.length > 0 && c.length <= LARGO_MAXIMO_RUTA && !c.includes('\0') && esAbsoluta(c) ? { carpetaGrabaciones: c } : {}
}

/** El asistente: un parche con otra cosa que un booleano en `activo` conserva lo anterior. */
function asistente(v: unknown, base: AjustesAsistente): AjustesAsistente {
  return { activo: booleano(propia(objeto(v), 'activo'), base.activo) }
}

function opcionesGrabacion(v: unknown, base: OpcionesGrabacion): OpcionesGrabacion {
  const o = objeto(v)
  const m = propia(o, 'microfono')
  return {
    que: una(propia(o, 'que'), QUE_GRABAR, base.que),
    calidad: una(propia(o, 'calidad'), CALIDADES_GRABACION, base.calidad),
    microfono: m === undefined ? base.microfono : typeof m === 'string' && m.length > 0 && m.length <= LARGO_MAXIMO_MICROFONO && !m.includes('\0') ? m : null,
    resaltarClics: booleano(propia(o, 'resaltarClics'), base.resaltarClics)
  }
}

function exportar(v: unknown, base: OpcionesExportar, tema: Tema): OpcionesExportar {
  const o = objeto(v)
  const escala = propia(o, 'escala')
  const margen = propia(o, 'margenMm')
  return {
    fondo: propia(o, 'fondo') === 'tema' ? (tema === 'oscuro' ? 'oscuro' : 'papel') : una(propia(o, 'fondo'), FONDOS_EXPORTAR, base.fondo),
    rejilla: booleano(propia(o, 'rejilla'), base.rejilla),
    escala: (ESCALAS_PNG as readonly unknown[]).includes(escala) ? (escala as EscalaPng) : base.escala,
    pagina: una(propia(o, 'pagina'), PAGINAS, base.pagina),
    // Un settings.json de antes traía la casilla inversa `sinInstrumentos`.
    instrumentos: booleano(propia(o, 'instrumentos'), typeof propia(o, 'sinInstrumentos') === 'boolean' ? !propia(o, 'sinInstrumentos') : base.instrumentos),
    lecturasMedidores: booleano(propia(o, 'lecturasMedidores'), base.lecturasMedidores),
    coloresVoltaje: booleano(propia(o, 'coloresVoltaje'), base.coloresVoltaje),
    tintaNegra: booleano(propia(o, 'tintaNegra'), base.tintaNegra),
    margenMm: typeof margen === 'number' && Number.isFinite(margen) ? Math.min(MARGEN_EXPORTAR_MM[1], Math.max(MARGEN_EXPORTAR_MM[0], margen)) : base.margenMm
  }
}

/** El tema de una figura; un settings.json de antes traía `fondo`: «blanco» pasa a «claro» y «tema» a «como la aplicación». */
function temaDeFigura(o: Record<string, unknown>, defecto: TemaFigura): TemaFigura {
  const t = propia(o, 'tema')
  if ((TEMAS_FIGURA as readonly unknown[]).includes(t)) return t as TemaFigura
  const viejo = propia(o, 'fondo')
  return viejo === 'blanco' ? 'claro' : viejo === 'tema' ? 'app' : defecto
}

/** Las opciones de una figura; un parche con algunas conserva las demás (y los colores se mezclan serie por serie). */
function figura(v: unknown, base: OpcionesFigura): OpcionesFigura {
  const o = objeto(v)
  const escala = propia(o, 'escala')
  const tam = propia(o, 'tamañoLetra')
  const colores: Record<string, TonoFigura> = {}
  for (const [k, t] of Object.entries(base.colores)) if (Object.hasOwn(base.colores, k)) colores[k] = t
  let n = Object.keys(colores).length
  for (const [k, t] of Object.entries(objeto(propia(o, 'colores')))) {
    if (!/^[A-Za-z0-9_-]{1,16}$/.test(k) || !(TONOS_FIGURA as readonly unknown[]).includes(t)) continue
    if (!Object.hasOwn(colores, k)) {
      if (n >= MAX_SERIES_FIGURA) continue
      n++
    }
    colores[k] = t as TonoFigura
  }
  return {
    formato: una(propia(o, 'formato'), FORMATOS_FIGURA, base.formato),
    escala: (ESCALAS_PNG as readonly unknown[]).includes(escala) ? (escala as EscalaPng) : base.escala,
    fuente: una(propia(o, 'fuente'), FAMILIAS_FIGURA, base.fuente),
    tamañoLetra: typeof tam === 'number' && Number.isInteger(tam) && tam >= TAMAÑO_LETRA_FIGURA[0] && tam <= TAMAÑO_LETRA_FIGURA[1] ? tam : base.tamañoLetra,
    tema: temaDeFigura(o, base.tema),
    separadorCsv: una(propia(o, 'separadorCsv'), SEPARADORES_CSV, base.separadorCsv),
    muestreoCsv: (MUESTREOS_CSV as readonly unknown[]).includes(propia(o, 'muestreoCsv')) ? (propia(o, 'muestreoCsv') as MuestreoCsv) : base.muestreoCsv,
    ejes: booleano(propia(o, 'ejes'), base.ejes),
    rejilla: booleano(propia(o, 'rejilla'), base.rejilla),
    colores
  }
}

/** Un número dentro de un intervalo; fuera o sin número, el de `defecto` (un settings.json alterado no aborta nada). */
const enRango = (v: unknown, [min, max]: readonly [number, number], defecto: number): number => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : defecto)

/** La simulación; un parche con algunas de sus claves conserva las demás. */
function simulacion(v: unknown, base: AjustesSimulacion): AjustesSimulacion {
  const o = objeto(v)
  return {
    corriente: booleano(propia(o, 'corriente'), base.corriente),
    animaciones: booleano(propia(o, 'animaciones'), base.animaciones),
    sonido: booleano(propia(o, 'sonido'), base.sonido),
    volumen: Math.round(enRango(propia(o, 'volumen'), [0, 100], base.volumen)),
    velocidadFlechas: enRango(propia(o, 'velocidadFlechas'), RANGO_VELOCIDAD_FLECHAS, base.velocidadFlechas),
    quemar: booleano(propia(o, 'quemar'), base.quemar)
  }
}

/** Tutorial: un parche con solo `ofertaVista` conserva el avance y al revés. Avance válido: ids de capítulos que existen, paso entero de 0 a 99 y «hecho» booleano, como mucho doce. */
function tutorial(v: unknown, base: AjustesTutorial): AjustesTutorial {
  const o = objeto(v)
  const crudo = propia(o, 'avance')
  let avance = base.avance
  if (crudo !== undefined) {
    avance = {}
    let n = 0
    for (const [id, a] of Object.entries(objeto(crudo))) {
      if (!IDS_CAPITULOS_TUTORIAL.includes(id)) continue
      const d = objeto(a)
      const paso = propia(d, 'paso')
      // Un paso entero y no negativo; uno mayor que el tope se recorta, para no perder el «hecho».
      if (typeof paso !== 'number' || !Number.isInteger(paso) || paso < 0) continue
      avance[id] = { paso: Math.min(paso, MAX_PASO_TUTORIAL), hecho: booleano(propia(d, 'hecho'), false) }
      if (++n >= MAX_CAPITULOS_TUTORIAL) break
    }
  }
  return { ofertaVista: booleano(propia(o, 'ofertaVista'), base.ofertaVista), avanzarSolo: booleano(propia(o, 'avanzarSolo'), base.avanzarSolo), avance }
}

/** La cinta; un parche con una sola de sus dos claves conserva la otra. */
function cinta(v: unknown, base: AjustesCinta): AjustesCinta {
  const o = objeto(v)
  // Una pestaña guardada como «instrumentos» (pestaña que ya no existe) abre Simulación.
  const p = propia(o, 'pestaña')
  return { plegada: booleano(propia(o, 'plegada'), base.plegada), pestaña: una(p, PESTAÑAS_CINTA, base.pestaña) }
}

/** Teclas propias válidas: ids de comando cortos en minúsculas, hasta cuatro combinaciones de texto corto sin repetir por comando y como mucho doscientos comandos. */
function atajos(v: unknown, base: Record<string, string[]>): Record<string, string[]> {
  if (v === undefined) return { ...base }
  const out: Record<string, string[]> = {}
  let n = 0
  for (const [id, teclas] of Object.entries(objeto(v))) {
    if (!/^[a-z0-9-]{1,64}$/.test(id) || !Array.isArray(teclas)) continue
    const validas = teclas.filter((t): t is string => typeof t === 'string' && t.length <= 32 && /^[^\s\u0000-\u001f\u007f]+$/.test(t))
    out[id] = [...new Set(validas)].slice(0, MAX_TECLAS_POR_COMANDO)
    if (++n >= MAX_COMANDOS_PROPIOS) break
  }
  return out
}

const esPanelDerecho = (d: unknown): boolean => typeof d === 'string' && (PANELES_DERECHOS as readonly string[]).includes(d)

/** El panel del riel derecho; un settings.json de antes con Proyecto o Mediciones en el riel izquierdo los trae aquí. */
function panelDerecho(o: Record<string, unknown>, defecto: PanelDerecho): PanelDerecho {
  const d = propia(o, 'panelDerecho')
  if (esPanelDerecho(d)) return d as PanelDerecho
  const viejo = propia(o, 'panel')
  return viejo === 'proyecto' || viejo === 'mediciones' ? viejo : defecto
}

/** Ajustes válidos a partir de cualquier valor (JSON del disco o parche): lo que falte o no sea válido toma el valor de `base` y las claves desconocidas se descartan. */
export function normalizarAjustes(v: unknown, base: Ajustes = ajustesPorOmision()): Ajustes {
  const o = objeto(v)
  // Un settings.json de antes con Proyecto o Mediciones en el riel izquierdo abierto: ahora viven a la derecha, que se abre.
  const migrado = !esPanelDerecho(propia(o, 'panelDerecho')) && (propia(o, 'panel') === 'proyecto' || propia(o, 'panel') === 'mediciones') && propia(o, 'lateral') === true
  const tema = una(propia(o, 'tema'), TEMAS, base.tema)
  return {
    tema,
    colorCables: una(propia(o, 'colorCables'), COLORES_DE_CABLE, base.colorCables),
    panel: una(propia(o, 'panel'), PANELES, base.panel),
    panelDerecho: panelDerecho(o, base.panelDerecho),
    lateral: booleano(propia(o, 'lateral'), base.lateral),
    inspector: migrado ? true : booleano(propia(o, 'inspector'), base.inspector),
    recientes: recientes(propia(o, 'recientes'), base.recientes),
    archivosRecientes: rutas(propia(o, 'archivosRecientes'), base.archivosRecientes),
    // Un parche con solo algunas opciones de exportar conserva las demás.
    exportar: exportar(propia(o, 'exportar'), base.exportar, tema),
    figura: figura(propia(o, 'figura'), base.figura),
    // Un parche con atajos los reemplaza todos (la interfaz manda el mapa completo).
    atajos: atajos(propia(o, 'atajos'), base.atajos),
    cinta: cinta(propia(o, 'cinta'), base.cinta),
    lienzoSincronizado: booleano(propia(o, 'lienzoSincronizado'), base.lienzoSincronizado),
    serieComercial: una(propia(o, 'serieComercial'), SERIES_COMERCIALES, base.serieComercial),
    textoAjuste: una(propia(o, 'textoAjuste'), TEXTOS_AJUSTE, base.textoAjuste),
    tamañoInterfaz: esTamañoInterfaz(propia(o, 'tamañoInterfaz')) ? (propia(o, 'tamañoInterfaz') as TamañoInterfaz) : base.tamañoInterfaz,
    altoFranja: propia(o, 'altoFranja') === undefined ? base.altoFranja : altoFranja(propia(o, 'altoFranja'), base.altoFranja),
    simulacion: simulacion(propia(o, 'simulacion'), base.simulacion),
    tutorial: tutorial(propia(o, 'tutorial'), base.tutorial),
    plantillasPlegadas: plegadas(propia(o, 'plantillasPlegadas'), base.plantillasPlegadas),
    libreriaPlegada: plegadas(propia(o, 'libreriaPlegada'), base.libreriaPlegada),
    proyectoPlegado: plegadas(propia(o, 'proyectoPlegado'), base.proyectoPlegado),
    inspectorDatosPlegado: booleano(propia(o, 'inspectorDatosPlegado'), base.inspectorDatosPlegado),
    numerosPatilla: booleano(propia(o, 'numerosPatilla'), base.numerosPatilla),
    ventana: propia(o, 'ventana') === undefined ? base.ventana : estadoDeVentana(propia(o, 'ventana')),
    carpetas: carpetas(propia(o, 'carpetas'), base.carpetas),
    grabacion: opcionesGrabacion(propia(o, 'grabacion'), base.grabacion),
    ...carpetaGrabaciones(propia(o, 'carpetaGrabaciones'), base.carpetaGrabaciones),
    asistente: asistente(propia(o, 'asistente'), base.asistente),
    ...carpetaAsistente(propia(o, 'carpetaAsistente'), base.carpetaAsistente)
  }
}

/** Aplica un parche de la interfaz solo con sus claves válidas. Recientes, carpetas de diálogos, de grabaciones y del asistente, y estado de la ventana no se aceptan: solo los anota el proceso principal. */
export function aplicarParche(actual: Ajustes, parche: unknown): Ajustes {
  const { archivosRecientes: _ignorado, ventana: _ignorada, carpetas: _ignoradas, carpetaGrabaciones: _ignoradaG, carpetaAsistente: _ignoradaA, ...resto } = objeto(parche)
  return normalizarAjustes(resto, actual)
}

/** Canal IPC con el que la interfaz guarda un parche de ajustes. */
export const CANAL_GUARDAR_AJUSTES = 'ajustes:guardar'
/** Canal IPC con el que la interfaz pide abrir un enlace de la librería de piezas en el navegador del sistema. */
export const CANAL_ABRIR_ENLACE = 'kirchi:abrir-enlace'
/** Argumentos que el proceso principal agrega al renderizador (`additionalArguments`). */
export const ARG_AJUSTES = '--kirchi-ajustes='
export const ARG_PRUEBAS = '--kirchi-pruebas'

/** Los ajustes viajan al preload como argumento: así la ventana pinta su tema desde el primer cuadro. */
export const argumentoAjustes = (a: Ajustes): string => ARG_AJUSTES + encodeURIComponent(JSON.stringify(a))

export function leerArgumentos(argv: readonly string[]): { ajustes: Ajustes; pruebas: boolean } {
  const arg = argv.find((a) => a.startsWith(ARG_AJUSTES))
  let ajustes = ajustesPorOmision()
  if (arg) {
    try {
      ajustes = normalizarAjustes(JSON.parse(decodeURIComponent(arg.slice(ARG_AJUSTES.length))))
    } catch {
      // Un argumento dañado no impide abrir: quedan los ajustes por omisión.
    }
  }
  return { ajustes, pruebas: argv.includes(ARG_PRUEBAS) }
}

/** Lo que el preload expone como `window.kirchi`. */
export interface ApiKirchi {
  /** Ajustes con que abrió la ventana. */
  ajustes: Ajustes
  /** Abierta con `--pruebas`: la interfaz expone la sonda `window.__kirchi`. */
  pruebas: boolean
  /** Guarda un parche y devuelve los ajustes completos que quedaron en el disco. */
  guardarAjustes?(parche: Partial<Ajustes>): Promise<Ajustes>
  /** Los ajustes vigentes en el proceso principal. */
  leerAjustes?(): Promise<Ajustes>
  /** Abre en el navegador la hoja de datos o el producto de LCSC de una pieza; el proceso principal solo acepta los enlaces de su librería. */
  abrirEnlace?(url: string): Promise<boolean>
  /** Abrir, guardar, exportar y recuperar archivos (todo el disco lo toca el proceso principal). */
  archivos: ApiArchivos
  /** Plantillas del usuario: categoría y nombre, nunca rutas (la carpeta la decide el proceso principal). */
  plantillas?: ApiPlantillas
  /** Análisis con ngspice: una petición de datos, nunca una línea de órdenes ni una ruta. */
  ngspice?: ApiNgspice
  /** Las gráficas de los análisis en una ventana aparte. */
  graficas?: ApiGraficas
  osciloscopio?: ApiOsciloscopio
  /** Grabación de pantalla de la ventana de Kirchi: permisos y archivos los decide el proceso principal. */
  grabacion?: ApiGrabacion
  /** El asistente (servidor MCP): interruptor, cliente unido, carpeta y peticiones del puente. */
  asistente?: ApiAsistente
  /** Pantalla completa y zoom de la página (Vista › Ventana); el preload siempre la trae, las pruebas sin ventana no. */
  ventana?(orden: OrdenVentana): void
  /** Escucha el tamaño de la interfaz vigente (lo cambia el proceso principal); devuelve la forma de dejar de escuchar. */
  alTamañoInterfaz?(f: (t: TamañoInterfaz) => void): () => void
  /** Avisa cuando la ventana entra o sale de la pantalla completa; devuelve la forma de dejar de escuchar. */
  alPantallaCompleta?(f: (completa: boolean) => void): () => void
}

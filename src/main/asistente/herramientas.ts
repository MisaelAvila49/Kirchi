import { z } from 'zod'
import { CATEGORIA_INCLUIDAS } from '../../compartido/plantillas'
import { plantillasIncluidas } from '../../renderer/src/plantillas/almacen'
import type { EntradaAnalisis } from '../../renderer/src/edicion/analisisDoc'
import { catalogo, datosDePieza } from '../../renderer/src/edicion/catalogo'
import { describir } from '../../renderer/src/edicion/describir'
import { resolverPerilla, valorDePerilla } from '../../renderer/src/edicion/perillas'
import { validarOrden } from '../../renderer/src/edicion/ordenes'
import { normalizar } from '../../renderer/src/buscador/buscar'
import type { PiezaDef } from '../../renderer/src/piezas/tipos'
import { MAX_CAMBIOS, MAX_MUESTRAS_PEDIDAS, MAX_TRAZAS_MUESTREADAS, TOPE_SIMULADO_S, type CambioPerilla, type EjecutorAnalisis, type PedidoMuestra, type SesionSinVentana } from '../../renderer/src/sinVentana/sesion'
import { CarpetaAsistente, type Lectura } from './carpeta'
import { imagenSvgDe, type ImagenSvg } from './imagen'
import type { Conexion, RespuestaVentana } from './clienteTuberia'
import type { Orden } from '../../renderer/src/edicion/ordenes'
import { Sesiones } from './sesiones'
import type { AjustesAsistente } from './ajustes'
import type { RegistroPuente } from './registroPuente'
import { calcular, IDS_CALCULADORAS, resumenDeCampos, SERIES_COMERCIALES } from './calculadoras'
import { analisisPedido, figuraDeAnalisis, PREAJUSTES_GRAFICA, soloLasPedidas, type PreajusteGrafica } from './grafica'
import { medirResultado } from './medidas'
import type { PlantillasUsuario } from './plantillasUsuario'

export const TEXTO_APAGADO = 'El asistente está apagado. Actívalo en Kirchi, Configuración › Asistente.'
const SIN_CIRCUITO = 'Indica el circuito: el nombre de un archivo de la carpeta del asistente (usa listar_archivos o crear_circuito).'
const SIN_VENTANA = 'No hay una ventana de Kirchi con el asistente conectada: indica el nombre de un archivo de la carpeta del asistente.'

export type Contenido = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }
export interface Respuesta {
  content: Contenido[]
  isError?: true
}

const texto = (t: string): Respuesta => ({ content: [{ type: 'text', text: t }] })
const datos = (x: unknown): Respuesta => texto(JSON.stringify(x))
const falla = (motivo: string): Respuesta => ({ content: [{ type: 'text', text: motivo }], isError: true })

export interface DepsHerramientas {
  lib: Map<string, PiezaDef>
  wasm: Uint8Array
  version: string
  /** Carpeta de datos de la aplicación (ahí van los respaldos). */
  dirDatos: string
  /** Carpeta del asistente si el usuario no eligió otra. */
  carpetaPorOmision: string
  /** Los ajustes del asistente, leídos del disco en cada llamada. */
  ajustes(): AjustesAsistente
  analisis?: EjecutorAnalisis
  /** Pinta un SVG y devuelve el PNG; sin él `exportar_imagen` solo entrega SVG. */
  rasterizar?(imagen: ImagenSvg): Promise<Uint8Array>
  /** La unión con la ventana abierta de Kirchi, si la hay. Se pide en cada llamada: la ventana puede abrirse o cerrarse. */
  ventana?(): Promise<Conexion>
  /** El registro del puente, para las fallas que no llegan a la respuesta (un guardado automático que no se pudo). */
  registro?: RegistroPuente
  /** Las plantillas del usuario (solo lectura), si el modo las tiene a la mano. */
  plantillas?: PlantillasUsuario
  /** Imprime un SVG a PDF y devuelve los bytes; sin él `exportar_grafica` no genera PDF. */
  pdf?(svg: string, anchoMm: number, altoMm: number): Promise<Uint8Array>
  /** Cuánto se espera a que una ventana nueva cargue el circuito que se le pidió abrir, y cada cuánto se pregunta. */
  esperaApertura?: { totalMs: number; pasoMs: number }
}

/** Los archivos de la carpeta que una orden (o las de un lote) pide insertar como fragmento. */
function archivosDeOrden(o: unknown): string[] {
  if (typeof o !== 'object' || o === null) return []
  const x = o as { orden?: unknown; archivo?: unknown; ordenes?: unknown }
  if (x.orden === 'fragmento' && typeof x.archivo === 'string') return [x.archivo]
  return x.orden === 'lote' && Array.isArray(x.ordenes) ? x.ordenes.flatMap(archivosDeOrden) : []
}

/** Un fragmento del asistente que choca donde se pidió (o que no dice dónde) busca lugar libre: debajo de lo que hay o a la
 * derecha. Lo mismo dentro de un lote. */
function conLugarLibre(o: unknown): unknown {
  if (typeof o !== 'object' || o === null) return o
  const x = o as { orden?: unknown; ordenes?: unknown; buscarLugar?: unknown }
  if (x.orden === 'fragmento' && x.buscarLugar === undefined) return { ...x, buscarLugar: true }
  if (x.orden === 'lote' && Array.isArray(x.ordenes)) return { ...x, ordenes: x.ordenes.map(conLugarLibre) }
  return o
}

type Ventana = Extract<Conexion, { ok: true }>['cliente']
const TOPE_ADJUNTOS = 12 * 1024 * 1024

const punto = z.object({ x: z.number(), y: z.number() }).describe('Posición en mm, múltiplo de 2.5')
const circuito = z.string().optional().describe('"abierto" (el circuito de la ventana de Kirchi) o el nombre de un archivo .kir de la carpeta del asistente')
const refs = z.array(z.string()).min(1).describe('Referencias de piezas, como R1')

export interface Herramienta {
  nombre: string
  descripcion: string
  entrada: z.ZodRawShape
  /** No cambia el circuito ni el disco. */
  lectura: boolean
}

const circuitoEntrada = { circuito }

/** Cómo se acomoda un circuito, en pocas palabras: va en las herramientas que colocan y conectan. */
const ACOMODO = 'Acomodo: entrada a la izquierda, salida a la derecha, tierra abajo, alimentaciones arriba, posiciones en pasos de 2.5 mm, de 10 a 15 mm entre etapas y sin cruzar cables. Si una plantilla o una calculadora sirve, úsala: ya viene bien acomodada.'
const ESQUEMA_ANALISIS = '{ tipo: "op" } | { tipo: "dc", fuente, desde, hasta, paso } | { tipo: "ac", barrido, puntos (hasta 10000 por década), desde, hasta, fuente, magnitud, incluir? (frecuencias en Hz que el barrido contiene exactas, como [60]) } | { tipo: "tran", fin } | { tipo: "fourier", fundamental, armonicos, periodos, descarte, ventana }'
const valorPerilla = z.union([z.string(), z.number()]).describe('Número en la unidad de la perilla (catalogo_piezas, «perilla») o texto con ella, como «60 °C»')
const trazas = z.array(z.string()).optional().describe('Redes a graficar: una patilla (R2.2, U1.OUT), «red de R1.1» o el nombre de una red, con o sin etiqueta')
const corrientes = z.array(z.string()).optional().describe('Referencias de las piezas cuya corriente se grafica, como R1')

/** Las herramientas, con su descripción y sus argumentos. El texto del circuito (notas, etiquetas) llega como datos en las
 * respuestas, nunca en estas descripciones. */
export const HERRAMIENTAS: Herramienta[] = [
  { nombre: 'estado', descripcion: 'Dice si hay una ventana de Kirchi conectada, la carpeta del asistente y cuántos circuitos tiene abiertos.', entrada: {}, lectura: true },
  {
    nombre: 'catalogo_piezas',
    descripcion: 'Lista los tipos de pieza que se pueden colocar, con sus patillas y propiedades. Filtra por texto o categoría. Para circuitos conocidos (divisor, filtro, amplificador, 555) hay plantillas listas: ve listar_plantillas y generar_circuito.',
    entrada: { filtro: z.string().optional().describe('Texto que debe aparecer en el id, el nombre o la categoría') },
    lectura: true
  },
  {
    nombre: 'datos_pieza',
    descripcion: 'Datos físicos de una pieza: encapsulados con el número de patilla de cada pin, patillas de alimentación, huella de KiCad, número LCSC (con su marca: comprobado o sin verificar), hoja de datos y equivalencias. Por tipo (y opción, la de la propiedad que elige la fila, p. ej. BC547; «props» para otras propiedades) o, con «circuito» y «ref», la pieza del circuito. Las piezas de catalogo_piezas y leer_circuito con «datos» los tienen.',
    entrada: {
      tipo: z.string().optional().describe('Id de pieza del catálogo'),
      opcion: z.string().optional().describe('Opción que elige la fila de datos (modelo, o «A|B» con dos propiedades)'),
      props: z.record(z.string(), z.string()).optional(),
      ...circuitoEntrada,
      ref: z.string().optional().describe('Referencia de una pieza del circuito (R1, Q2)')
    },
    lectura: true
  },
  { nombre: 'leer_circuito', descripcion: 'Describe el circuito: piezas con sus redes, redes, instrumentos, sondas, análisis y avisos. «cablesSueltos» lista los extremos de cable que no tocan nada (bórralos con borrar). Si hace falta armar algo común, busca antes una plantilla con listar_plantillas.', entrada: circuitoEntrada, lectura: true },
  { nombre: 'listar_archivos', descripcion: 'Lista los circuitos .kir de la carpeta del asistente.', entrada: {}, lectura: true },
  { nombre: 'crear_circuito', descripcion: 'Crea un circuito vacío nuevo en la carpeta del asistente y, si Kirchi está abierto, lo abre en una ventana nueva. No reemplaza uno que existe.', entrada: { nombre: z.string().describe('Nombre del archivo, con o sin .kir') }, lectura: false },
  {
    nombre: 'colocar',
    descripcion: `Coloca una pieza. Sin «en» busca lugar libre a la derecha de lo que hay. ${ACOMODO}`,
    entrada: {
      ...circuitoEntrada,
      tipo: z.string().describe('Id de pieza del catálogo'),
      ref: z.string().optional(),
      valor: z.string().optional(),
      props: z.record(z.string(), z.string()).optional(),
      en: punto.optional(),
      rot: z.number().optional().describe('0, 90, 180 o 270'),
      espejo: z.boolean().optional()
    },
    lectura: false
  },
  {
    nombre: 'conectar',
    descripcion: 'Une dos patillas (R1.2) o redes por nombre, con cable o, si un cable cruzaría una pieza, con etiquetas. Prefiere cables que no se crucen: mueve piezas antes que cruzar.',
    entrada: { ...circuitoEntrada, desde: z.string(), hasta: z.string(), via: z.enum(['auto', 'cable', 'etiqueta']).optional() },
    lectura: false
  },
  { nombre: 'mover', descripcion: 'Mueve piezas a una posición o por un desplazamiento, en mm.', entrada: { ...circuitoEntrada, refs, a: punto.optional(), desplazar: punto.optional() }, lectura: false },
  {
    nombre: 'borrar',
    descripcion: 'Borra piezas, cables (por red o patilla) y etiquetas (por nombre).',
    entrada: { ...circuitoEntrada, refs: z.array(z.string()).optional(), cables: z.array(z.string()).optional(), etiquetas: z.array(z.string()).optional() },
    lectura: false
  },
  { nombre: 'cambiar_propiedad', descripcion: 'Cambia una propiedad de una pieza, como el valor de una resistencia.', entrada: { ...circuitoEntrada, ref: z.string(), prop: z.string(), valor: z.union([z.string(), z.number()]) }, lectura: false },
  {
    nombre: 'ajustar_perilla',
    descripcion: 'Mueve una perilla de una pieza (temperatura, luz, carga: las propiedades con «perilla» en catalogo_piezas) dentro de su rango. Sin la vista previa cambia el valor del circuito; con la vista previa corriendo en Kirchi se mueve en vivo. Para mover una perilla en un instante dado de una simulación usa «cambios» de simular.',
    entrada: { ...circuitoEntrada, ref: z.string(), prop: z.string().optional().describe('Id de la perilla; sin él, la única que tenga la pieza'), valor: valorPerilla },
    lectura: false
  },
  { nombre: 'transformar', descripcion: 'Gira o refleja piezas.', entrada: { ...circuitoEntrada, refs, op: z.enum(['girar', 'girarIzq', 'espejoX', 'espejoY']) }, lectura: false },
  {
    nombre: 'poner_instrumento',
    descripcion: 'Coloca un osciloscopio, multímetro o medidor, con sus ajustes y, si se pide, lo conecta a un punto.',
    entrada: {
      ...circuitoEntrada,
      tipo: z.enum(['osciloscopio', 'multimetro', 'medidor']),
      ref: z.string().optional(),
      ajustes: z.record(z.string(), z.string()).optional(),
      en: punto.optional(),
      medir: z.object({ punto: z.string(), canal: z.string().optional(), terminal: z.string().optional() }).optional()
    },
    lectura: false
  },
  {
    nombre: 'poner_sonda',
    descripcion: 'Pone una sonda en una patilla o red.',
    entrada: { ...circuitoEntrada, tipo: z.enum(['osciloscopio', 'multimetro', 'voltaje', 'corriente', 'medidor']), punto: z.string(), instrumento: z.string().optional(), entrada: z.string().optional() },
    lectura: false
  },
  {
    nombre: 'insertar_plantilla',
    descripcion: 'Coloca una plantilla incluida (por id) o un circuito .kir de la carpeta del asistente. Para plantillas de usuario y por categoría usa colocar_plantilla. Sin «en», o si ahí choca con lo que hay, busca lugar libre debajo de lo existente (10 mm de aire) o a la derecha.',
    entrada: { ...circuitoEntrada, plantilla: z.string().optional(), archivo: z.string().optional(), en: punto.optional() },
    lectura: false
  },
  {
    nombre: 'aplicar_lote',
    descripcion: `Aplica una lista de órdenes como un solo paso: si una falla no se aplica ninguna y se dice cuál. Cada orden lleva «orden» (colocar, conectar, mover, borrar, propiedad, transformar, instrumento, sonda, fragmento, nombrar, analisis, vaciar) y sus campos; una «clave» permite nombrar lo creado. ${ACOMODO}`,
    entrada: { ...circuitoEntrada, ordenes: z.array(z.record(z.string(), z.unknown())).min(1) },
    lectura: false
  },
  {
    nombre: 'vaciar_circuito',
    descripcion: 'Borra todo el circuito en un solo paso que se puede deshacer: piezas, cables, etiquetas, notas, figuras, sondas, análisis guardados y voltajes de los rieles. Úsalo para empezar de nuevo en el mismo archivo, en lugar de borrar red por red.',
    entrada: circuitoEntrada,
    lectura: false
  },
  { nombre: 'deshacer', descripcion: 'Deshace el último paso del circuito.', entrada: circuitoEntrada, lectura: false },
  { nombre: 'rehacer', descripcion: 'Rehace el último paso deshecho.', entrada: circuitoEntrada, lectura: false },
  {
    nombre: 'guardar_archivo',
    descripcion: 'Guarda una copia del circuito con otro nombre en la carpeta del asistente. Los archivos de la carpeta ya se guardan solos después de cada cambio; el circuito de la ventana lo guarda el usuario.',
    entrada: { ...circuitoEntrada, nombre: z.string().optional(), reemplazar: z.boolean().optional().describe('Reemplaza el destino si existe; la versión anterior queda en los respaldos') },
    lectura: false
  },
  {
    nombre: 'simular',
    descripcion: `Simula desde cero hasta «hasta» segundos (máximo ${TOPE_SIMULADO_S}) y devuelve voltajes de redes, corrientes de piezas (con la región de los transistores), el valor de cada perilla, multímetros, medidores y un resumen del osciloscopio. «cambios» mueve perillas en instantes dados (hasta ${MAX_CAMBIOS}) y «muestrear» lee el voltaje de una red en instantes exactos (hasta ${MAX_MUESTRAS_PEDIDAS} muestras y ${MAX_TRAZAS_MUESTREADAS} redes distintas), sin importar el paso: así se mide cuándo conmuta un comparador al mover una temperatura.`,
    entrada: {
      ...circuitoEntrada,
      hasta: z.number().positive(),
      paso: z.number().positive().optional(),
      muestras: z.number().int().min(0).max(2000).optional().describe('Valores por canal del osciloscopio'),
      cambios: z.array(z.object({ t: z.number().min(0).describe('Segundos desde el inicio, dentro de «hasta»'), ref: z.string(), prop: z.string().optional(), valor: valorPerilla })).max(MAX_CAMBIOS).optional().describe('Cambios de perilla con su instante'),
      muestrear: z.array(z.object({ t: z.number().min(0), traza: z.string().describe('Una patilla (R2.2), «red de R1.1» o el nombre de una red') })).max(MAX_MUESTRAS_PEDIDAS).optional().describe('Lecturas de voltaje en instantes exactos; la respuesta las trae en «simulado.muestras»')
    },
    lectura: true
  },
  {
    nombre: 'analizar',
    descripcion: 'Corre un análisis de ngspice: punto de operación (op), barrido de CC (dc), respuesta en frecuencia (ac), transitorio (tran) o Fourier. Las fuentes se dan por referencia, como V1. Con «trazas» grafica cualquier red por patilla (R2.2) aunque no tenga nombre; con guardar: true y un nombre, el análisis queda en el circuito y se ve en la pestaña Análisis y en Gráficas.',
    entrada: {
      ...circuitoEntrada,
      config: z.record(z.string(), z.unknown()).describe(ESQUEMA_ANALISIS),
      parametro: z.record(z.string(), z.unknown()).optional().describe('Barrido del valor de una pieza: { pieza, modo, ... }'),
      trazas,
      corrientes,
      nombre: z.string().optional().describe('Nombre del análisis; obligatorio con guardar'),
      guardar: z.boolean().optional().describe('Guarda el análisis en el circuito (reemplaza el que tenga el mismo nombre)')
    },
    lectura: false
  },
  {
    nombre: 'nombrar_red',
    descripcion: 'Da nombre a la red de una patilla con una etiqueta puesta junto a ella, para que las trazas y el Registro la nombren. No une redes: si el nombre ya es de otra, se rechaza.',
    entrada: { ...circuitoEntrada, punto: z.string().describe('Una patilla (R2.2) o la red de una patilla'), nombre: z.string().describe('Nombre corto, hasta 24 caracteres, como SALIDA') },
    lectura: false
  },
  {
    nombre: 'exportar_grafica',
    descripcion: 'Exporta la gráfica de un análisis como imagen o PDF a la carpeta del asistente, con la misma figura del diálogo de exportar. «pantalla» la deja como se ve en Kirchi y «informe» como figura de artículo. Indica un análisis guardado en «analisis» o describe uno con «config». Con «trazas» o «corrientes» grafica solo esas (si no, las del análisis guardado); «titulo» y «subtitulo» reemplazan los de omisión, y un subtítulo vacío no se dibuja.',
    entrada: {
      ...circuitoEntrada,
      analisis: z.string().optional().describe('Nombre de un análisis guardado en el circuito'),
      config: z.record(z.string(), z.unknown()).optional().describe(ESQUEMA_ANALISIS),
      parametro: z.record(z.string(), z.unknown()).optional(),
      trazas,
      corrientes,
      titulo: z.string().max(120).optional().describe('Título de la figura; por omisión, el nombre del análisis'),
      subtitulo: z.string().max(200).optional().describe('Subtítulo; vacío lo deja sin subtítulo'),
      preajuste: z.enum(PREAJUSTES_GRAFICA as [PreajusteGrafica, ...PreajusteGrafica[]]).optional().describe('«informe» por omisión'),
      formato: z.enum(['png', 'svg', 'pdf']).optional().describe('«png» por omisión'),
      tema: z.enum(['claro', 'oscuro']).optional(),
      escala: z.number().int().min(1).max(2).optional().describe('Solo PNG: 1 o 2 (2 por omisión)'),
      nombre: z.string().describe('Nombre del archivo, sin extensión'),
      reemplazar: z.boolean().optional()
    },
    lectura: false
  },
  {
    nombre: 'medir_analisis',
    descripcion: 'Mide un análisis sin traer sus muestras: por traza, el mínimo y el máximo con su x, el pico a pico y el valor en las x que pidas (interpolado, con la fase en CA). En CA agrega la banda de −3 dB contra el máximo y la frecuencia del pico o de la muesca con su profundidad y ancho. Indica un análisis guardado en «analisis» o describe uno con «config» (corre de nuevo). Para ver una frecuencia exacta, como 60 Hz, ponla en «incluir» del análisis o en «en».',
    entrada: {
      ...circuitoEntrada,
      analisis: z.string().optional().describe('Nombre de un análisis guardado en el circuito'),
      config: z.record(z.string(), z.unknown()).optional().describe(ESQUEMA_ANALISIS),
      parametro: z.record(z.string(), z.unknown()).optional(),
      trazas,
      corrientes,
      en: z.array(z.number()).max(50).optional().describe('Valores de x (Hz, s o V del eje) donde se pide el valor')
    },
    lectura: true
  },
  {
    nombre: 'listar_plantillas',
    descripcion: 'Lista las plantillas que se pueden colocar: las incluidas y las del usuario, con su categoría. Úsalas antes de armar a mano.',
    entrada: { filtro: z.string().optional().describe('Texto que debe aparecer en el nombre, la categoría o la descripción') },
    lectura: true
  },
  {
    nombre: 'colocar_plantilla',
    descripcion: `Coloca una plantilla como lo hace el panel Plantillas: piezas, cables y redes ya acomodados, con las referencias renumeradas. Incluidas o del usuario, por nombre y categoría. Sin «en», o si ahí choca con lo que hay, busca lugar libre debajo de lo existente (10 mm de aire) o a la derecha, y lo dice en los avisos. ${ACOMODO}`,
    entrada: { ...circuitoEntrada, plantilla: z.string().describe('Nombre de la plantilla'), categoria: z.string().optional().describe('«Incluidas» por omisión, o la categoría de una plantilla del usuario'), en: punto.optional() },
    lectura: false
  },
  {
    nombre: 'calcular',
    descripcion: `Calcula con las calculadoras de Kirchi y devuelve los valores exactos, los comerciales de la serie y lo que resulta con ellos. Calculadoras y campos: ${resumenDeCampos()}. Los valores se escriben como en la interfaz (4k7, 100n, 1k). En «filtro», «tipo» es bajas, altas, pasabanda, rechazabanda o notch (doble T); en «amplificador», inversor o no-inversor. Con serie «libre» los valores son los exactos, sin redondear a una serie comercial: así se arma un diseño exacto (un notch justo en 60 Hz). No cambia el circuito.`,
    entrada: {
      calculadora: z.enum(IDS_CALCULADORAS as unknown as [string, ...string[]]),
      campos: z.record(z.string(), z.union([z.string(), z.number()])).optional().describe('Valores por id de campo; los que faltan toman el valor de omisión de la calculadora'),
      serie: z.enum(SERIES_COMERCIALES as unknown as [string, ...string[]]).optional().describe('E12 por omisión; «libre» da los valores exactos')
    },
    lectura: true
  },
  {
    nombre: 'generar_circuito',
    descripcion: `Hace lo mismo que «Generar circuito» de una calculadora: calcula (como calcular) y coloca en el circuito el diseño ya acomodado, con los valores de la serie. Con serie «libre» los valores son los exactos, sin redondear a una serie comercial: así se arma un diseño exacto (un notch justo en 60 Hz). Para un circuito que cubre una calculadora (divisor, LED, filtros, amplificadores, 555) úsala siempre en lugar de colocar y conectar a mano, también para varias versiones en el mismo circuito: sin «en», o si ahí choca, va debajo de lo que hay. Devuelve el cálculo. ${ACOMODO}`,
    entrada: {
      ...circuitoEntrada,
      calculadora: z.enum(IDS_CALCULADORAS as unknown as [string, ...string[]]),
      campos: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
      serie: z.enum(SERIES_COMERCIALES as unknown as [string, ...string[]]).optional().describe('E12 por omisión; «libre» da los valores exactos'),
      en: punto.optional()
    },
    lectura: false
  },
  {
    nombre: 'exportar_imagen',
    descripcion: 'Devuelve una imagen PNG del esquema (hasta 2,048 px por lado) y, si se pide, la guarda como PNG o SVG en la carpeta del asistente.',
    entrada: {
      ...circuitoEntrada,
      lado: z.number().int().min(100).max(2048).optional().describe('Lado mayor en píxeles'),
      guardar: z.object({ nombre: z.string(), formato: z.enum(['png', 'svg']), reemplazar: z.boolean().optional() }).optional()
    },
    lectura: true
  }
]

const ESPERA_APERTURA = { totalMs: 15_000, pasoMs: 200 }
const EN_LA_VENTANA = 'El circuito está abierto en Kirchi: los cambios se ven allí y el usuario decide cuándo guardarlo.'

const ORDEN_DE: Record<string, string> = {
  colocar: 'colocar',
  conectar: 'conectar',
  mover: 'mover',
  borrar: 'borrar',
  cambiar_propiedad: 'propiedad',
  transformar: 'transformar',
  poner_instrumento: 'instrumento',
  poner_sonda: 'sonda',
  insertar_plantilla: 'fragmento',
  nombrar_red: 'nombrar',
  vaciar_circuito: 'vaciar',
  deshacer: 'deshacer',
  rehacer: 'rehacer'
}

type Argumentos = Record<string, unknown>
const sinIndefinidos = (a: Argumentos): Argumentos => Object.fromEntries(Object.entries(a).filter(([, v]) => v !== undefined))

/** Las herramientas del asistente sin ventana: cada una trabaja sobre un archivo de la carpeta del asistente. */
export class Herramientas {
  private carpeta: CarpetaAsistente
  private sesiones: Sesiones
  /** Circuitos que la herramienta arma en el momento (el diseño de una calculadora) y una orden de fragmento pide por nombre. */
  private readonly adjuntos = new Map<string, Uint8Array>()

  constructor(private readonly deps: DepsHerramientas) {
    const c = new CarpetaAsistente(deps.carpetaPorOmision, deps.dirDatos)
    this.carpeta = c
    this.sesiones = this.nuevasSesiones(c)
  }

  private nuevasSesiones(carpeta: CarpetaAsistente): Sesiones {
    return new Sesiones({ lib: this.deps.lib, wasm: this.deps.wasm, version: this.deps.version, analisis: this.deps.analisis, carpeta, bytesDe: (n) => this.leerArchivo(n) })
  }

  /** Los bytes de un fragmento por nombre: un circuito armado al momento, una plantilla del usuario («plantilla:Categoría/Nombre») o un archivo de la carpeta. */
  private leerArchivo(nombre: string): Lectura {
    const armado = this.adjuntos.get(nombre)
    if (armado) return { ok: true, bytes: armado }
    if (nombre.startsWith('plantilla:')) {
      const m = /^plantilla:([^/]+)\/(.+)$/.exec(nombre)
      const l = m && this.deps.plantillas ? this.deps.plantillas.leer(m[1], m[2]) : null
      return l ?? { ok: false, motivo: 'No se encontró la plantilla.' }
    }
    return this.carpeta.leer(nombre)
  }

  /** Ajusta la carpeta a lo que dicen los ajustes ahora; si cambió, las sesiones abiertas se descartan. */
  private alDia(a: AjustesAsistente): void {
    const raiz = a.carpeta ?? this.deps.carpetaPorOmision
    if (raiz === this.carpeta.raiz) return
    this.sesiones.cerrar()
    this.carpeta = new CarpetaAsistente(raiz, this.deps.dirDatos)
    this.sesiones = this.nuevasSesiones(this.carpeta)
  }

  cerrar(): void {
    this.sesiones.cerrar()
  }

  /** Ejecuta una herramienta; nunca lanza: lo que falla vuelve como respuesta con `isError`. */
  async llamar(nombre: string, args: Argumentos): Promise<Respuesta> {
    const h = HERRAMIENTAS.find((x) => x.nombre === nombre)
    if (!h) return falla(`No existe la herramienta «${nombre.slice(0, 60)}».`)
    try {
      const ajustes = this.deps.ajustes()
      if (!ajustes.activo) return falla(TEXTO_APAGADO)
      this.alDia(ajustes)
      return await this.despachar(nombre, sinIndefinidos(args))
    } catch (e) {
      return falla(`No se pudo completar la herramienta: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  /** A dónde va una herramienta que trabaja sobre un circuito: la ventana (el circuito abierto, o un archivo de la carpeta que
   * el usuario tiene abierto en una ventana) o el archivo sin ventana. Un archivo abierto en Kirchi se edita siempre allí:
   * una sola copia viva, con su deshacer y a la vista. Si hay una ventana pero no se puede saber qué tiene abierto, no se
   * toca el disco: escribir encima de un archivo abierto haría que los dos diverjan. */
  private async destino(a: Argumentos): Promise<{ ventana: Ventana; ruta?: string } | null | Respuesta> {
    const c = a.circuito
    if (c !== undefined && c !== 'abierto') {
      const r = this.carpeta.rutaDe(c)
      if (!r.ok) return null
      const d = await this.dondeEsta(r.ruta, r.nombre)
      if (d === null || 'content' in d) return d
      this.sesiones.olvidar(r.nombre)
      return d
    }
    const conexion = await this.deps.ventana?.()
    if (conexion?.ok) return { ventana: conexion.cliente }
    if (conexion && !conexion.sinVentana) return falla(conexion.motivo)
    return c === 'abierto' ? falla(SIN_VENTANA) : null
  }

  /** La ventana que tiene abierto ese archivo de la carpeta, null si ninguna lo tiene (o no hay ventana) o la falla que
   * impide saberlo. */
  private async dondeEsta(ruta: string, nombre: string): Promise<{ ventana: Ventana; ruta: string } | null | Respuesta> {
    const conexion = await this.deps.ventana?.()
    if (!conexion) return null
    // Sin una ventana con el asistente activado nadie tiene el archivo abierto; con una que no deja unirse, no se sabe.
    if (!conexion.ok) return conexion.sinVentana ? null : falla(conexion.motivo)
    const espera = this.deps.esperaApertura ?? ESPERA_APERTURA
    for (const fin = Date.now() + espera.totalMs; ; ) {
      const d = await conexion.cliente.pedir('dondeEsta', { ruta })
      if (!d.ok) return falla(`No se pudo saber si ${nombre} está abierto en Kirchi: ${d.motivo}`)
      const x = d.datos as { abierto?: unknown; cargando?: unknown } | null
      if (x?.abierto === true) return { ventana: conexion.cliente, ruta }
      // Una ventana nueva todavía carga el circuito que se le pidió abrir.
      if (x?.cargando !== true || Date.now() >= fin) return null
      await new Promise((ok) => setTimeout(ok, espera.pasoMs))
    }
  }

  /** Una copia que se escribiría encima de un archivo abierto en Kirchi se rechaza: ese archivo lo guarda el usuario. */
  private async destinoDeCopiaLibre(nombre: unknown): Promise<Respuesta | null> {
    const r = this.carpeta.rutaDe(nombre)
    if (!r.ok || !this.carpeta.existe(r.nombre)) return null
    const d = await this.dondeEsta(r.ruta, r.nombre)
    if (d !== null && 'content' in d) return d
    return d ? falla(`${r.nombre} está abierto en Kirchi: no se guarda encima. Usa otro nombre.`) : null
  }

  private async despachar(nombre: string, a: Argumentos): Promise<Respuesta> {
    switch (nombre) {
      case 'estado': {
        const conexion = await this.deps.ventana?.()
        if (conexion?.ok) {
          const r = await conexion.cliente.pedir('estado', null)
          if (r.ok) return datos({ ...(r.datos as object), carpeta: this.carpeta.raiz, modo: 'con ventana' })
          return falla(r.motivo)
        }
        return datos({ ventana: false, mensaje: conexion && !conexion.sinVentana ? conexion.motivo : SIN_VENTANA, carpeta: this.carpeta.raiz, modo: 'sin ventana' })
      }
      case 'catalogo_piezas':
        return datos(this.catalogo(typeof a.filtro === 'string' ? a.filtro : ''))
      case 'listar_plantillas':
        return datos(this.plantillas(typeof a.filtro === 'string' ? a.filtro : ''))
      case 'calcular': {
        const c = calcular(this.deps.lib, this.deps.version, a.calculadora, a.campos, a.serie)
        return 'motivo' in c ? falla(c.motivo) : datos(c.resultado)
      }
      case 'generar_circuito': {
        const c = calcular(this.deps.lib, this.deps.version, a.calculadora, a.campos, a.serie)
        if ('motivo' in c) return falla(c.motivo)
        const clave = `calculadora:${String(a.calculadora)}`
        this.adjuntos.set(clave, c.circuito.bytes)
        const r = await this.despachar('insertar_plantilla', sinIndefinidos({ circuito: a.circuito, archivo: clave, en: a.en }))
        return r.isError ? r : unir(r, datos({ circuito: c.circuito.nombre, calculo: c.resultado }))
      }
      case 'colocar_plantilla': {
        if (typeof a.plantilla !== 'string') return falla('Indica el nombre de la plantilla.')
        const cat = typeof a.categoria === 'string' ? a.categoria : CATEGORIA_INCLUIDAS
        if (cat.toLowerCase() === CATEGORIA_INCLUIDAS.toLowerCase()) return this.despachar('insertar_plantilla', sinIndefinidos({ circuito: a.circuito, plantilla: a.plantilla, en: a.en }))
        const k = normalizar(a.plantilla)
        const u = this.deps.plantillas?.listar().find((p) => p.categoria.toLowerCase() === cat.toLowerCase() && normalizar(p.nombre) === k)
        if (!u) return falla(`No hay una plantilla «${a.plantilla.slice(0, 60)}» en la categoría «${cat.slice(0, 60)}»: mira listar_plantillas.`)
        return this.despachar('insertar_plantilla', sinIndefinidos({ circuito: a.circuito, archivo: `plantilla:${u.categoria}/${u.nombre}`, en: a.en }))
      }
      case 'listar_archivos':
        return datos(this.carpeta.listar())
      case 'crear_circuito': {
        const r = await this.sesiones.crear(a.nombre)
        if (!r.ok) return falla(r.motivo)
        return datos({ ok: true, nombre: r.nombre, ...(await this.abrirEnVentana(r.nombre)) })
      }
      case 'guardar_archivo': {
        const d = await this.destino(a)
        if (d && 'ventana' in d) return this.enVentana(d.ventana, nombre, a, d.ruta)
        if (d) return d
        const o = await this.abrir(a)
        if (!('sesion' in o)) return o
        if (typeof a.nombre === 'string') {
          const ocupado = await this.destinoDeCopiaLibre(a.nombre)
          if (ocupado) return ocupado
        }
        const r = await this.sesiones.guardar(o.nombre, typeof a.nombre === 'string' ? a.nombre : undefined, a.reemplazar === true)
        return r.ok ? datos(r) : falla(r.motivo)
      }
      case 'aplicar_lote': {
        const d = await this.destino(a)
        if (d && 'ventana' in d) return this.enVentana(d.ventana, nombre, a, d.ruta)
        if (d) return d
        const o = await this.abrir(a)
        if (!('sesion' in o)) return o
        return this.aplicar(o, { orden: 'lote', ordenes: a.ordenes })
      }
      case 'ajustar_perilla': {
        const d = await this.destino(a)
        if (d && 'ventana' in d) return this.enVentana(d.ventana, nombre, a, d.ruta)
        if (d) return d
        const o = await this.abrir(a)
        if (!('sesion' in o)) return o
        const p = resolverPerilla(o.sesion.doc, this.deps.lib, String(a.ref ?? ''), typeof a.prop === 'string' ? a.prop : undefined)
        if ('motivo' in p) return falla(p.motivo)
        const v = valorDePerilla(p.prop, a.valor as number | string)
        if ('motivo' in v) return falla(v.motivo)
        const r = this.aplicar(o, { orden: 'propiedad', ref: p.pieza.ref, prop: p.prop.id, valor: v.texto })
        return r.isError ? r : unir(r, datos({ ref: p.pieza.ref, prop: p.prop.id, valor: v.texto }))
      }
      case 'simular':
      case 'analizar':
      case 'leer_circuito':
      case 'datos_pieza':
      case 'exportar_grafica':
      case 'medir_analisis':
      case 'exportar_imagen': {
        if (nombre === 'datos_pieza') {
          if (typeof a.tipo === 'string') return this.datosPieza(a.tipo, a.props, a.opcion)
          if (typeof a.ref !== 'string') return falla('Indica «tipo» (con «opcion» si hace falta), o «circuito» y «ref».')
        }
        const d = await this.destino(a)
        if (d && 'ventana' in d) return this.enVentana(d.ventana, nombre, a, d.ruta)
        if (d) return d
        const o = await this.abrir(a)
        if (!('sesion' in o)) return o
        if (nombre === 'datos_pieza') return this.datosDeRef(o.sesion.doc, a.ref as string)
        if (nombre === 'leer_circuito') return datos({ circuito: o.nombre, ...(o.avisos.length ? { avisosDeApertura: o.avisos } : {}), ...describir(o.sesion.doc, this.deps.lib, o.sesion.nucleo.con) })
        if (nombre === 'simular') return this.simular(o.sesion, a)
        if (nombre === 'analizar') return await this.analizarYGuardar(o.sesion, a, async (orden) => this.aplicar(o, orden))
        if (nombre === 'exportar_grafica') return await this.grafica(o.sesion, a)
        if (nombre === 'medir_analisis') return await this.medir(o.sesion, a)
        return await this.imagen(o.sesion, o.nombre, a)
      }
      default: {
        const orden = ORDEN_DE[nombre]
        if (!orden) return falla(`No existe la herramienta «${nombre}».`)
        const d = await this.destino(a)
        if (d && 'ventana' in d) return this.enVentana(d.ventana, nombre, a, d.ruta)
        if (d) return d
        const o = await this.abrir(a)
        if (!('sesion' in o)) return o
        const { circuito: _c, ...resto } = a
        return this.aplicar(o, { orden, ...resto })
      }
    }
  }

  /** Una herramienta sobre el circuito abierto en la ventana: las órdenes se aplican allí (con su deshacer) y las lecturas, la
   * simulación y los análisis corren aquí sobre una copia del documento, sin tocar la vista previa de la ventana. */
  private async enVentana(v: Ventana, nombre: string, a: Argumentos, ruta?: string): Promise<Respuesta> {
    // Con `ruta`, la petición va a la ventana que tiene ese archivo abierto; sin ella, a la ventana unida.
    const conRuta = (x: object) => (ruta ? { ...x, ruta } : x)
    const documento = async (): Promise<{ bytes: Uint8Array; titulo: string; archivo: string | null } | Respuesta> => {
      const r = await v.pedir('documento', ruta ? { ruta } : null)
      if (!r.ok) return falla(r.motivo)
      const d = r.datos as { bytes?: unknown; titulo?: unknown; archivo?: unknown }
      if (typeof d.bytes !== 'string') return falla('Kirchi no entregó el circuito.')
      return { bytes: new Uint8Array(Buffer.from(d.bytes, 'base64')), titulo: String(d.titulo ?? ''), archivo: typeof d.archivo === 'string' ? d.archivo : null }
    }
    if (nombre === 'guardar_archivo') {
      const copia = typeof a.nombre === 'string' ? this.carpeta.rutaDe(a.nombre) : null
      // El archivo abierto en la ventana no se guarda encima: lo decide el usuario.
      if (ruta && (copia === null || (copia.ok && copia.ruta === ruta))) return datos({ ok: true, enVentana: true, mensaje: EN_LA_VENTANA })
      if (typeof a.nombre !== 'string') return falla('Para guardar una copia del circuito abierto indica «nombre»: el abierto no se guarda en su propia ruta.')
      const ocupado = await this.destinoDeCopiaLibre(a.nombre)
      if (ocupado) return ocupado
      const d = await documento()
      if (!('bytes' in d)) return d
      const r = this.carpeta.escribir(a.nombre, d.bytes, a.reemplazar === true)
      return r.ok ? datos(r) : falla(r.motivo)
    }
    if (nombre === 'leer_circuito' || nombre === 'datos_pieza' || nombre === 'simular' || nombre === 'analizar' || nombre === 'exportar_imagen' || nombre === 'exportar_grafica' || nombre === 'medir_analisis') {
      const d = await documento()
      if (!('bytes' in d)) return d
      const s = await this.sesiones.efimera(d.bytes)
      if (!s.ok) return falla(s.motivo)
      try {
        if (nombre === 'datos_pieza') return this.datosDeRef(s.sesion.doc, a.ref as string)
        if (nombre === 'leer_circuito') return datos({ circuito: ruta ? (d.archivo ?? 'abierto') : 'abierto', ventana: { titulo: d.titulo, archivo: d.archivo }, ...(s.avisos.length ? { avisosDeApertura: s.avisos } : {}), ...describir(s.sesion.doc, this.deps.lib, s.sesion.nucleo.con) })
        if (nombre === 'simular') return this.simular(s.sesion, a)
        if (nombre === 'analizar') return await this.analizarYGuardar(s.sesion, a, (orden) => this.ordenEnVentana(v, orden, ruta))
        if (nombre === 'exportar_grafica') return await this.grafica(s.sesion, a)
        if (nombre === 'medir_analisis') return await this.medir(s.sesion, a)
        return await this.imagen(s.sesion, d.archivo ?? 'abierto', a)
      } finally {
        s.sesion.cerrar()
      }
    }
    // Mover una perilla es lo único que se edita con la vista previa corriendo: la ventana valida y la manda al canal.
    if (nombre === 'ajustar_perilla') {
      const r: RespuestaVentana = await v.pedir('perilla', conRuta({ ref: a.ref, ...(typeof a.prop === 'string' ? { prop: a.prop } : {}), valor: a.valor }))
      if (!r.ok) return falla(r.motivo)
      const res = r.datos as { ok?: boolean; motivo?: string }
      return res.ok === true ? datos(res) : falla(String(res.motivo ?? 'Kirchi rechazó el ajuste.'))
    }
    // Una orden de edición, o un lote.
    const { circuito: _c, ...resto } = a
    return this.ordenEnVentana(v, nombre === 'aplicar_lote' ? { orden: 'lote', ordenes: a.ordenes } : { orden: ORDEN_DE[nombre], ...resto }, ruta)
  }

  /** Manda una orden a la ventana (con los archivos que pide insertar) y devuelve lo que contestó. */
  private async ordenEnVentana(v: Ventana, crudo: unknown, ruta?: string): Promise<Respuesta> {
    const conRuta = (x: object) => (ruta ? { ...x, ruta } : x)
    const val = validarOrden(conLugarLibre(crudo))
    if (!val.ok) return falla(val.motivo)
    const adjuntos: Record<string, string> = {}
    let total = 0
    for (const archivo of new Set(archivosDeOrden(val.orden as Orden))) {
      const l = this.leerArchivo(archivo)
      if (!l.ok) return falla(l.motivo)
      total += l.bytes.length
      if (total > TOPE_ADJUNTOS) return falla('Los archivos que se piden insertar son demasiado grandes.')
      adjuntos[archivo] = Buffer.from(l.bytes).toString('base64')
    }
    const r: RespuestaVentana = await v.pedir('orden', conRuta({ orden: val.orden, ...(Object.keys(adjuntos).length ? { archivos: adjuntos } : {}) }))
    if (!r.ok) return falla(r.motivo)
    const res = r.datos as { ok?: boolean; motivo?: string; indice?: number }
    if (res.ok !== true) return falla(res.indice === undefined ? String(res.motivo ?? 'Kirchi rechazó la orden.') : `Orden ${res.indice + 1}: ${String(res.motivo)}`)
    return datos(res)
  }

  /** El circuito pedido, o la respuesta con el motivo por el que no se pudo. */
  private async abrir(a: Argumentos): Promise<{ sesion: SesionSinVentana; nombre: string; avisos: string[] } | Respuesta> {
    if (a.circuito === undefined) return falla(SIN_CIRCUITO)
    if (a.circuito === 'abierto') return falla(SIN_VENTANA)
    const r = await this.sesiones.obtener(a.circuito)
    return r.ok ? r : falla(r.motivo)
  }

  /** Aplica la orden al archivo sin ventana y lo guarda enseguida: si el puente se corta, lo hecho ya está en el disco. */
  private aplicar(o: { sesion: SesionSinVentana; nombre: string }, orden: unknown): Respuesta {
    const v = validarOrden(conLugarLibre(orden))
    if (!v.ok) return falla(v.motivo)
    const antes = o.sesion.doc
    const r = o.sesion.aplicar(v.orden)
    if (!r.ok) return falla(r.indice === undefined ? r.motivo : `Orden ${r.indice + 1}: ${r.motivo}`)
    if (o.sesion.doc !== antes) {
      const g = this.sesiones.autoguardar(o.nombre)
      if (!g.ok) {
        this.deps.registro?.error(`guardado automático de ${o.nombre}: ${g.motivo}`)
        return datos({ ...r, avisos: [...r.avisos, `El cambio se aplicó pero no se pudo guardar en el disco: ${g.motivo} Usa guardar_archivo con otro nombre.`] })
      }
    }
    return datos(r)
  }

  /** Abre en una ventana nueva de Kirchi un archivo recién creado, si hay una ventana unida. */
  private async abrirEnVentana(nombre: string): Promise<{ ventana?: string }> {
    const r = this.carpeta.rutaDe(nombre)
    const conexion = await this.deps.ventana?.()
    if (!r.ok || !conexion?.ok) return {}
    const abierto = await conexion.cliente.pedir('abrir', { ruta: r.ruta })
    if (!abierto.ok) {
      this.deps.registro?.error(`abrir ${nombre} en una ventana: ${abierto.motivo}`)
      return {}
    }
    return { ventana: 'Se abrió en una ventana nueva de Kirchi: los cambios se verán allí.' }
  }

  private datosPieza(tipo: string, props: unknown, opcion: unknown): Respuesta {
    const def = this.deps.lib.get(tipo)
    if (!def) return falla(`No existe el tipo «${tipo.slice(0, 60)}»: mira catalogo_piezas.`)
    const p = props && typeof props === 'object' ? Object.fromEntries(Object.entries(props).filter((e): e is [string, string] => typeof e[1] === 'string')) : {}
    const r = datosDePieza(def, p, typeof opcion === 'string' ? opcion : undefined)
    return 'motivo' in r ? falla(r.motivo) : datos(r)
  }

  private datosDeRef(doc: SesionSinVentana['doc'], ref: string): Respuesta {
    const pieza = Object.values(doc.piezas).find((x) => x.ref.toLowerCase() === ref.toLowerCase())
    if (!pieza) return falla(`No hay una pieza «${ref.slice(0, 60)}» en el circuito.`)
    const def = this.deps.lib.get(pieza.tipo)
    if (!def) return falla(`La pieza ${pieza.ref} es de un tipo que esta versión no conoce («${pieza.tipo}»).`)
    const r = datosDePieza(def, pieza.props)
    return 'motivo' in r ? falla(r.motivo) : datos({ ref: pieza.ref, ...r })
  }

  private catalogo(filtro: string) {
    const f = normalizar(filtro)
    const todas = catalogo(this.deps.lib)
    return f === '' ? todas : todas.filter((p) => normalizar(`${p.id} ${p.nombre} ${p.categoria}`).includes(f))
  }

  private simular(sesion: SesionSinVentana, a: Argumentos): Respuesta {
    if (typeof a.hasta !== 'number' || !(a.hasta > 0)) return falla('«hasta» debe ser un número de segundos mayor que cero.')
    // Siempre desde cero: dos llamadas iguales dan el mismo resultado.
    sesion.cerrar()
    const c = sesion.compilar()
    if (!c.ok) return falla(`El circuito no se puede simular: ${c.errores.join(' ')}`)
    let s: ReturnType<SesionSinVentana['simular']>
    try {
      s = sesion.simular({
        hasta: a.hasta,
        ...(typeof a.paso === 'number' ? { paso: a.paso } : {}),
        ...(Array.isArray(a.cambios) ? { cambios: a.cambios as CambioPerilla[] } : {}),
        ...(Array.isArray(a.muestrear) ? { muestrear: a.muestrear as PedidoMuestra[] } : {})
      })
    } catch (e) {
      // Un pedido que no vale se dice tal cual, sin el envoltorio de las fallas inesperadas.
      return falla(e instanceof Error ? e.message : String(e))
    }
    const lectura = sesion.leer(typeof a.muestras === 'number' ? { muestras: a.muestras } : {})
    return datos({ simulado: s, avisosDeCompilacion: c.avisos, lectura })
  }

  /** Lo que pide el asistente como análisis: fuentes por referencia y trazas por patilla o nombre. */
  private entradaDe(a: Argumentos, nombre: string): EntradaAnalisis {
    const lista = (x: unknown): string[] | undefined => (Array.isArray(x) ? x.filter((t): t is string => typeof t === 'string') : undefined)
    return { id: 'asistente', nombre, config: a.config, ...(a.parametro ? { parametro: a.parametro } : {}), ...(lista(a.trazas) ? { trazas: lista(a.trazas) } : {}), ...(lista(a.corrientes) ? { corrientes: lista(a.corrientes) } : {}) }
  }

  /** Corre el análisis; con `guardar` lo guarda también en el circuito por `guardarEn` (la orden «analisis» sobre quien tenga el documento). */
  private async analizarYGuardar(sesion: SesionSinVentana, a: Argumentos, guardarEn: (orden: Argumentos) => Promise<Respuesta>): Promise<Respuesta> {
    const guardar = a.guardar === true
    if (guardar && (typeof a.nombre !== 'string' || a.nombre.trim() === '')) return falla('Para guardar el análisis indica «nombre».')
    const nombre = typeof a.nombre === 'string' && a.nombre.trim() !== '' ? a.nombre.trim() : 'Asistente'
    const arm = sesion.armarAnalisis(this.entradaDe(a, nombre))
    if (!arm.ok) return falla(arm.motivo)
    const r = await sesion.analizar(arm.analisis, arm.etiquetas)
    if (!r.ok) return falla(r.error)
    if (!guardar) return datos(r)
    const orden = { orden: 'analisis', nombre, config: a.config, ...(a.parametro ? { parametro: a.parametro } : {}), ...(a.trazas ? { trazas: a.trazas } : {}), ...(a.corrientes ? { corrientes: a.corrientes } : {}) }
    const g = await guardarEn(orden)
    if (g.isError) return falla(`El análisis corrió pero no se guardó: ${(g.content[0] as { text: string }).text}`)
    return unir(datos(r), datos({ guardado: nombre, ...(arm.avisos.length ? { avisos: arm.avisos } : {}) }))
  }

  /** Mide un análisis (guardado o descrito) y devuelve solo las medidas, no las muestras. */
  private async medir(sesion: SesionSinVentana, a: Argumentos): Promise<Respuesta> {
    const lista = (x: unknown): string[] | undefined => (Array.isArray(x) ? x.filter((t): t is string => typeof t === 'string') : undefined)
    const guardado = typeof a.analisis === 'string'
    const p = analisisPedido(sesion, {
      ...(guardado ? { analisis: a.analisis as string } : {}),
      ...(!guardado && a.config ? { entrada: this.entradaDe(a, 'Medida') } : {}),
      ...(guardado && lista(a.trazas) ? { trazas: lista(a.trazas) } : {}),
      ...(guardado && lista(a.corrientes) ? { corrientes: lista(a.corrientes) } : {})
    })
    if (!p.ok) return falla(p.motivo)
    const r = await sesion.ejecutarAnalisis(p.a, p.etiquetas)
    if (!r.ok) return falla(r.error)
    const mapeado = soloLasPedidas(r.mapeado, p.a, sesion)
    if (!mapeado) return falla('Ninguna de las trazas pedidas salió en el análisis.')
    const en = Array.isArray(a.en) ? a.en.filter((x): x is number => typeof x === 'number' && Number.isFinite(x)) : []
    const m = medirResultado(mapeado, en)
    if (!m) return falla('Este análisis no tiene curvas que medir (punto de operación y Fourier): usa analizar.')
    return datos({ analisis: p.a.nombre, ...m, ...(mapeado.avisos.length ? { avisos: mapeado.avisos } : {}) })
  }

  /** Exporta la gráfica de un análisis a la carpeta del asistente como PNG, SVG o PDF, con la figura del diálogo de exportar. */
  private async grafica(sesion: SesionSinVentana, a: Argumentos): Promise<Respuesta> {
    const preajuste = (a.preajuste ?? 'informe') as PreajusteGrafica
    const formato = (a.formato ?? 'png') as 'png' | 'svg' | 'pdf'
    const base = typeof a.nombre === 'string' ? a.nombre.replace(/\.(png|svg|pdf)$/i, '') : ''
    const ruta = this.carpeta.rutaDe(base)
    if (!ruta.ok) return falla(ruta.motivo)
    const f = await figuraDeAnalisis(
      sesion,
      {
        ...(typeof a.analisis === 'string' ? { analisis: a.analisis } : {}),
        ...(a.config ? { entrada: this.entradaDe(a, base) } : {}),
        ...(typeof a.analisis === 'string' && Array.isArray(a.trazas) ? { trazas: a.trazas.filter((x): x is string => typeof x === 'string') } : {}),
        ...(typeof a.analisis === 'string' && Array.isArray(a.corrientes) ? { corrientes: a.corrientes.filter((x): x is string => typeof x === 'string') } : {}),
        ...(typeof a.titulo === 'string' ? { titulo: a.titulo } : {}),
        ...(typeof a.subtitulo === 'string' ? { subtitulo: a.subtitulo } : {})
      },
      preajuste,
      a.tema === 'oscuro' ? 'oscuro' : 'claro'
    )
    if (!f.ok) return falla(f.motivo)
    const { figura } = f
    const escala = typeof a.escala === 'number' ? a.escala : 2
    let bytes: Uint8Array
    let png: Uint8Array | null = null
    try {
      if (formato === 'svg') bytes = new TextEncoder().encode(figura.svg)
      else if (formato === 'pdf') {
        if (!this.deps.pdf) return falla('Este modo no puede generar PDF.')
        bytes = await this.deps.pdf(figura.svg, figura.anchoMm, figura.altoMm)
      } else {
        if (!this.deps.rasterizar) return falla('Este modo no puede generar PNG.')
        png = bytes = await this.deps.rasterizar({ svg: figura.svg, ancho: Math.round(figura.ancho * escala), alto: Math.round(figura.alto * escala) })
      }
    } catch (e) {
      return falla(`No se pudo generar ${formato.toUpperCase()}: ${e instanceof Error ? e.message : String(e)}`)
    }
    const r = this.carpeta.escribir(base, bytes, a.reemplazar === true, `.${formato}`)
    if (!r.ok) return falla(r.motivo)
    const salida: Contenido[] = [{ type: 'text', text: JSON.stringify({ guardado: `${base}.${formato}`, preajuste, ...(r.respaldo ? { respaldo: r.respaldo } : {}) }) }]
    if (png) salida.push({ type: 'image', data: Buffer.from(png).toString('base64'), mimeType: 'image/png' })
    return { content: salida }
  }

  /** Las plantillas que se pueden colocar: las incluidas y las del usuario, por texto. */
  private plantillas(filtro: string): { plantillas: { categoria: string; nombre: string; descripcion?: string }[] } {
    const f = normalizar(filtro)
    const incluidas = plantillasIncluidas(this.deps.lib).items.map((i) => ({ categoria: i.categoria, nombre: i.nombre, ...(i.descripcion ? { descripcion: i.descripcion } : {}) }))
    const propias = (this.deps.plantillas?.listar() ?? []).map((p) => ({ categoria: p.categoria, nombre: p.nombre }))
    return { plantillas: [...incluidas, ...propias].filter((p) => f === '' || normalizar(`${p.categoria} ${p.nombre} ${'descripcion' in p ? p.descripcion : ''}`).includes(f)) }
  }

  private async imagen(sesion: SesionSinVentana, nombre: string, a: Argumentos): Promise<Respuesta> {
    const img = imagenSvgDe(sesion.doc, this.deps.lib, nombre, typeof a.lado === 'number' ? a.lado : undefined)
    if (!img) return falla('El circuito está vacío: no hay nada que dibujar.')
    const salida: Contenido[] = []
    const g = a.guardar as { nombre: string; formato: 'png' | 'svg'; reemplazar?: boolean } | undefined
    let png: Uint8Array | null = null
    if (this.deps.rasterizar) {
      try {
        png = await this.deps.rasterizar(img)
      } catch (e) {
        if (g?.formato === 'png') return falla(`No se pudo generar el PNG: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    if (g) {
      const base = g.nombre.replace(/\.(png|svg)$/i, '')
      const motivo = this.carpeta.rutaDe(base)
      if (!motivo.ok) return falla(motivo.motivo)
      const bytes = g.formato === 'svg' ? new TextEncoder().encode(img.svg) : png
      if (!bytes) return falla('Este modo no puede generar PNG.')
      const r = this.carpeta.escribir(base, bytes, g.reemplazar === true, `.${g.formato}`)
      if (!r.ok) return falla(r.motivo)
      salida.push({ type: 'text', text: JSON.stringify({ guardado: `${base}.${g.formato}`, ancho: img.ancho, alto: img.alto }) })
    }
    if (png) salida.push({ type: 'image', data: Buffer.from(png).toString('base64'), mimeType: 'image/png' })
    else if (!g) return falla('Este modo no puede generar PNG; pide guardar como svg.')
    return { content: salida }
  }
}

/** Junta dos respuestas de datos en una: la primera con los campos de la segunda. */
function unir(a: Respuesta, b: Respuesta): Respuesta {
  try {
    return datos({ ...JSON.parse((a.content[0] as { text: string }).text), ...JSON.parse((b.content[0] as { text: string }).text) })
  } catch {
    return a
  }
}

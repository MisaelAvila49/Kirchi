import { camposDeGenerador, resolverCamposGenerador } from '../instrumentos/generadorEdicion'
import { calcularConexiones, clavePin, type Conexiones } from '../conexiones/conexiones'
import { compilarNetlist } from '../netlist/netlist'
import { CAMPO_VOLTAJE, cambioDeRiel, MENSAJE_VOLTAJE_DEL_NOMBRE, nombreDeRiel, rielDeTerminal, voltajeDeRiel } from '../netlist/alimentaciones'
import { aplicar, borrar, crear, fusionar, juntar, modificar, type Comando } from '../doc/comandos'
import { Historial } from '../doc/historial'
import { idAleatorio, type GeneradorId } from '../doc/ids'
import { ALTO_NOTA_MAX, formatoCompleto, formatoConCambio, siguienteTam, type FormatoCompleto, type ParcheFormato } from '../doc/formato'
import { conCaja, conEstilo, figurasDe, ordenesAlFrente, tieneTamaño, type EstiloFigura } from '../doc/figuras'
import { documentoVacio, type Cable, type Coleccion, type CualTexto, type Documento, type Etiqueta, type Figura, type FormatoTexto, type Id, type Nota, type Pieza, type Punto, type TipoFigura } from '../doc/tipos'
import { cajaTexto, etiquetasSinChoques } from '../lienzo/apartar'
import { textosLocales, type Texto } from '../lienzo/etiquetas'
import { centroDeTexto, lugarMasCercano, posicionLibre, textosManuales, tieneTextosManuales } from '../lienzo/textosManuales'
import type { Caja } from '../piezas/tipos'
import type { Efecto } from '../lienzo/animaciones'
import { ANCHO_NOTA_MAX, anchoNotaAuto, anchoNotaMinimo, anchoSigueAlTexto, altoNota, altoNotaMinimo, altoTextoNota, asasDeNota, disposicionNota, RADIO_ASA, type LadoAsa, type LadoVertical } from '../lienzo/medidas'
import { pinesEnMundo } from '../piezas/transformar'
import { comunesDeLaFicha, type PiezaDef, type PropDef } from '../piezas/tipos'
import { columnasDeModelos, type TablaModelos } from '../piezas/columnasModelo'
import { alimentacionAlCambiarFamilia, alimentacionesDeFamilia, esModeloDigital } from '../netlist/digital'
import { muestrasDeOpciones } from '../piezas/muestras'
import { borrarSeleccion, esGiro, orientar, transformarSeleccion, type Orientacion, type Transformacion } from './acciones'
import { moverTramo, pasoArrastre, planArrastre, type PlanArrastre } from './arrastre'
import { CableEnCurso } from './cableado'
import { choqueDeGrupo, colisiona, cuerpoEnMundo } from './colision'
import { cableEncimado, cableEnCuerpo, conflictoDeTocados, lugarParaPegar, piezaCruzada } from './conflictos'
import { enrutar, repararCable } from './enrutar'
import { insertarEnCable } from './insertar'
import { limpiarTexto } from '../doc/limpiar'
import { familiaSpice, sinSpiceSinFamilia, spiceDeTexto, spiceVigente, textoBaseSpice, textoSpiceDe, type FamiliaSpice } from '../doc/spice'
import { comandoDentroDelMundo, coordenadaValida, MOTIVO_FUERA_DEL_MUNDO } from '../doc/limites'
import { cambiarProp, modeloDe, nombreConModelo, nuevaEtiqueta, nuevaNota, nuevaPieza, nuevoCable, propModelo, valorEditable } from './colocar'
import { imanEn } from './iman'
import { Indice, type Golpe } from './indice'
import { partirEnUniones } from './normalizar'
import { copiar, pegar, type Fragmento } from './portapapeles'
import { unionesDeNombre } from './uniones'
import { errorDeReferencia, errorDeReferenciaMedidor } from '../doc/referencias'
import { formatearValor, leerValor } from '../valores/valores'
import { textoDeNumero } from '../instrumentos/ajusteAutomatico'
import { PASO_POT, PASO_POT_FINO, posicionDeProp, textoPosicion } from '../sim/potenciometro'
import { alFondo, asasDeFigura, conMedida, dosDecimales, figuraDeArrastre, fino, leerMedida, moverAsaFigura, type AsaFigura } from './figuras'
import { seleccionarEnRectangulo } from './rectangulo'
import { ajustar, ALCANCE_MAX_NODO, iguales, juntarCables, limpiarPolilinea, PASO_REJILLA, proyectarEnTramo, proyectarSinAjustar } from './rutas'
import { alternar, depurar, seleccionDe, seleccionVacia, tamañoSeleccion, todo, unir, type Seleccion } from './seleccion'
import { editableEnCaliente, MENSAJE_SOLO_EN_CALIENTE } from './enCaliente'
import { esModeloInstrumento } from '../piezas/validarInstrumentos'
import { anclaDeSonda } from '../conexiones/anclas'
import { comandoMedir, type PedidoMedir } from './medir'
import { esMedidor, hayMedidores, haySondas, medidoresDe } from '../doc/sondas'
import { pantallaDeMedidor } from '../lienzo/medidores'
import { MAX_PANTALLA_MEDIDOR } from '../doc/sondas'
import { leerAnalisis, MAX_ANALISIS } from '../doc/analisis'
import type { AnalisisDoc } from '../../../compartido/analisis/config'
import { destinoDeSonda, esDeOtraRed, imanDeSonda, mantenerSondas, MOTIVO_CONVERTIR_CORRIENTE, MOTIVO_CORRIENTE_AC, MOTIVO_MEDIDOR_DE_CORRIENTE, MOTIVO_SONDA_SIN_CABLE, siguienteDeSonda, tocaAlgo, type DestinoSonda } from './sondas'
import { planDeEtiqueta } from './etiquetaEnTramo'
import { banderaEn, banderasDelDocumento, type Bandera } from '../lienzo/sondas'

export type Herramienta = 'seleccionar' | 'colocar' | 'cablear' | 'etiqueta' | 'nota' | 'figura'

export interface Modificadores {
  shift?: boolean
  ctrl?: boolean
  alt?: boolean
}

/** Lo que la interfaz muestra en el editor en línea; `aceptar` devuelve un mensaje de error o null. */
/** Lo que la ficha de texto del inspector cambia en una nota o una etiqueta: el texto y un parche de formato. */
export interface CambioTexto {
  texto?: string
  formato?: ParcheFormato
}

export interface PedidoTexto {
  tipo: 'etiqueta' | 'nota'
  en: Punto
  inicial: string
  multilinea: boolean
  aceptar(texto: string): string | null
  /** Mientras se escribe: una nota que no impide aceptar («Se une con VCC de PWR1.»), o null. */
  revisar?(texto: string): string | null
  cancelar(): void
}

/** Un campo del editor de una pieza: su referencia y su valor, o el nombre y el voltaje de un terminal. */
export interface CampoPedido {
  /** `num:<clave>`: un campo numérico más del generador (periodo, amplitud, mínimo, máximo, desfase, retardo, pasos); `prop:<id>`: una propiedad de lista de la pieza (el color de un LED, la familia de una compuerta). */
  id: 'ref' | 'valor' | 'nombre' | 'voltaje' | 'spice' | `prop:${string}` | `num:${string}`
  titulo: string
  inicial: string
  /** Lista cerrada: el campo es una lista desplegable con estas opciones. */
  opciones?: string[]
  /** La muestra de color de cada opción (`data-color`), si la propiedad es un color. */
  muestras?: Record<string, string>
  /** Valores comerciales, del valor numérico: su unidad y la serie que se ofrece. */
  unidad?: string
  serie?: PropDef['serie']
  /** Catálogo: los `comunes` son los valores de catálogo y el resto es «Personalizado». */
  catalogo?: string[]
  /** Valores comunes de una pieza sin serie ni catálogo (la fuente, la batería): una lista plegable bajo el campo. */
  comunes?: string[]
  /** La lista de modelos como tabla con las cifras de cada modelo. */
  tabla?: TablaModelos
  /** Modelo «Personalizado»: `inicial` es el juego propio de la pieza (vacío si usa su modelo) y `base` el del modelo
   * elegido, que se escribe al activarlo. */
  personalizado?: { familia: FamiliaSpice; base: string }
}

/** Lo que un campo muestra mientras se escribe. */
export interface RevisionCampo {
  /** El texto no se aceptaría (se dice mientras se escribe; al aceptar se vuelve a decir en el campo). */
  error?: string
  /** Una nota que no impide aceptar: con qué se une un nombre de red repetido. */
  nota?: string
  /** El campo no se edita ahora: muestra `texto` y dice por qué. */
  fijo?: { texto: string; motivo: string }
  /** El texto que toma el campo mientras no se ha tocado (el voltaje del riel del nombre que se escribe). */
  sigue?: string
}

/** Editor de una pieza (referencia y valor, o nombre y voltaje de un terminal). `revisar` valida lo que dice cada campo;
 * `aceptar` cambia todo en un paso o devuelve campo y motivo. */
export interface PedidoCampos {
  tipo: 'pieza'
  en: Punto
  /** Qué pieza es, con su modelo si lo tiene («Transistor NPN · 2N2222»); sin él, el editor no lleva encabezado. */
  encabezado?: string
  /** El nombre de la pieza («Resistencia», «Generador de funciones»): el título de la ficha cuando no hay `encabezado`. */
  nombre?: string
  campos: CampoPedido[]
  /** Campo que recibe el foco al abrir. */
  foco: number
  revisar(valores: string[]): RevisionCampo[]
  aceptar(valores: string[]): { campo: number; error: string } | null
  cancelar(): void
}

export interface Ganchos {
  abrirBuscador(en: Punto): void
  editarTexto(p: PedidoTexto | PedidoCampos): void
  /** Efecto breve de confirmación o rechazo que dibuja el lienzo. */
  animar(e: Efecto): void
  /** Mensaje para el Registro (una operación rechazada y por qué), como oración completa. */
  registrar(texto: string): void
  /** Aviso breve sobre el lienzo. No va al Registro: quien llama decide. */
  avisoLienzo?(texto: string): void
  /** Con la vista previa corriendo, el error que daría llevarle `doc`, o null. Lo pone la ventana
   * (`ControlSimulacion.probarCambio`); sin él se prueba la netlist del documento. */
  probarEnCaliente?(doc: Documento): string | null
  /** Un arrastre con Alt movió algo en la rejilla fina (lo escucha el tutorial «Aprende Kirchi»). */
  alMoverFino?(): void
  /** El clic derecho canceló un cable a medio trazar (lo escucha el tutorial). */
  alCancelarCable?(): void
  /** El doble clic derecho borró lo que había bajo el cursor (lo escucha el tutorial). */
  alBorrarConClicDerecho?(): void
}

/** Lo que hay bajo el cursor al abrir el menú del clic derecho; `en` es el punto del clic (en un cable, sobre su tramo). */
export type ObjetivoMenu =
  | { tipo: 'pieza'; id: Id; en: Punto }
  | { tipo: 'cable'; id: Id; en: Punto }
  | { tipo: 'etiqueta'; id: Id; en: Punto }
  | { tipo: 'nota'; id: Id; en: Punto }
  | { tipo: 'figura'; id: Id; en: Punto }
  | { tipo: 'sonda'; id: Id; en: Punto }
  | { tipo: 'vacio'; en: Punto }

/** Asa de la caja de una nota: bajo el cursor o la que se está arrastrando. */
export interface Asa {
  nota: Id
  /** Borde vertical que mueve (null: ninguno, como en el asa de abajo en el medio). */
  lado: LadoAsa | null
  /** Borde horizontal que mueve (null: ninguno, como en las asas de los lados). */
  vert: LadoVertical | null
}

/** Pieza con la que se encimaría el fantasma o lo arrastrado. */
export interface Choque {
  con: Id
  /** Colección de lo que estorba: una pieza (se encimaría o la cruzaría un cable) o un cable. */
  col: 'piezas' | 'cables'
  ref: string
}

/** Id del fantasma de colocación (también en los efectos de sacudida). */
export const ID_FANTASMA = 'fantasma'
const SIN_BANDERAS: ReadonlyMap<Id, Bandera> = new Map()
/** Id del cable en curso en los efectos de sacudida. */
export const ID_CABLE_EN_CURSO = 'en-curso'

/** Generador de ids de usar y tirar para comprobar un cambio sin gastar ids del documento. */
const idsDePrueba = (): GeneradorId => {
  let n = 0
  return (prefijo) => `prueba:${prefijo}${n++}`
}
/** Flechas seguidas con menos de esto entre una y otra se deshacen en un solo paso. */
export const ESPERA_FLECHAS_MS = 800
/** Lo que dice el Registro al intentar cambiar un circuito abierto en solo lectura. */
export const MENSAJE_SOLO_LECTURA = 'Este circuito es de una versión más nueva de Kirchi y se abrió en solo lectura: se puede ver y exportar, pero no cambiar.'
/** Lo que dice el Registro al intentar cambiar el circuito mientras corre la vista previa. */
export const MENSAJE_SIMULANDO = 'Mientras corre la vista previa el circuito no se edita: detenla para cambiarlo.'
/** El campo de la referencia (o del nombre de un terminal) mientras corre la vista previa: su valor sí cambia en caliente. */
export const MOTIVO_REFERENCIA_SIMULANDO = 'Detén la vista previa para cambiar la referencia.'
export const MOTIVO_LISTA_SIMULANDO = 'Detén la vista previa para cambiarlo.'
export const MOTIVO_NOMBRE_SIMULANDO = 'Detén la vista previa para cambiar el nombre.'
/** Entre dos avisos de solo lectura pasa al menos esto: un arrastre no llena el Registro. */
const ESPERA_AVISO_SOLO_LECTURA_MS = 1000
/** Aire alrededor del cuerpo para el anillo del pulso, en unidades. */
const AIRE_PULSO = 0.5

export interface EstadoEditor {
  doc: Documento
  con: Conexiones
  seleccion: Seleccion
  hover: Golpe | null
  herramienta: Herramienta
  fantasma: Pieza | null
  /** La plantilla que sigue al ratón (colocar un fragmento): sus piezas y cables desplazados a `en`. */
  fantasmaFragmento: { fragmento: Fragmento; en: Punto } | null
  cableEnCurso: Punto[] | null
  rectangulo: { a: Punto; b: Punto } | null
  /** El fantasma o lo arrastrado se encimaría con otra pieza: no se puede soltar ahí. */
  choque: Choque | null
  versionDoc: number
  /** `versionDoc` del último cambio que la vista previa admite sin detenerse: cursor de potenciómetro o valor de una
   * resistencia o fuente (`editableEnCaliente`). */
  versionCaliente: number
  /** Cambia con cada vista previa de la ficha de texto (no toca el documento ni la vista previa de la simulación). */
  versionPrevia: number
  puedeDeshacer: boolean
  puedeRehacer: boolean
  /** El documento difiere de lo último que se guardó o se abrió («• sin guardar» y el asterisco del título). */
  sinGuardar: boolean
  /** Asa de nota bajo el cursor o en arrastre (el lienzo pone el cursor de ancho). */
  asa: Asa | null
  /** Algo se está arrastrando ya (lo seleccionado o un asa): la barra de formato se esconde. */
  arrastrando: boolean
  /** Texto de pieza bajo el puntero o en arrastre (la referencia o el valor): el lienzo pone el cursor de mover y lo resalta. */
  texto: { pieza: Id; cual: CualTexto } | null
  /** La figura que se está dibujando (todavía no está en el documento), o null. */
  figuraEnCurso: Figura | null
  /** El tipo de la herramienta Figura activa, o null. */
  figuraPendiente: TipoFigura | null
  /** Asa de figura bajo el cursor o en arrastre (el lienzo pone su cursor y la dibuja más grande). */
  asaFigura: { figura: Id; asa: AsaFigura } | null
  /** La sonda que se arrastra y adónde iría: el lienzo dibuja su destino, en rojo si ahí no puede medir. */
  sondaArrastrada: (DestinoSonda & { id: Id }) | null
}

/** Arrastre de un texto de pieza: dónde se apretó, cuánto se separa el puntero del centro del texto y lo que había antes. */
interface ArrastreTexto {
  pieza: Id
  cual: CualTexto
  texto: string
  inicio: Punto
  agarre: Punto
  antes: Pieza['textos']
  grupo: string
  movio: boolean
}

/** Arrastre de un asa: los bordes de la caja al empezar; el que no se mueve queda fijo. */
interface ArrastreAsa {
  nota: Id
  lado: LadoAsa | null
  vert: LadoVertical | null
  izquierda: number
  derecha: number
  /** Bordes de arriba y de abajo al empezar (el de abajo, subido al entero que pide la caja) y la altura del puntero. */
  arriba: number
  fondo: number
  punteroY: number
  /** Alto fijado al empezar (para volver a él si el puntero regresa a donde apretó). */
  alto0: number | undefined
  grupo: string
  movio: boolean
}

interface Arrastre {
  inicio: Punto
  /** Con Alt se mueve en rejilla fina si la selección son solo notas, etiquetas sin cables y figuras; piezas, cables y
   * etiquetas con cables siguen en la de 2.5 mm. */
  fino?: Punto
  /** Con Alt y solo notas y figuras: punto de partida de un movimiento libre, sin rejilla, con dos decimales. Si está,
   * manda sobre `fino`. */
  libre?: Punto
  d: Punto
  grupo: string
  movio: boolean
  /** Clic sin mover sobre un miembro de varios: al soltar queda solo ese elemento. */
  reducirA?: [Coleccion, Id]
  /** Se arma en el primer movimiento, ya con el documento partido en uniones. */
  plan?: PlanArrastre
  /** Arrastre de un solo tramo de cable: `en` es el punto del tramo donde se apretó. */
  tramo?: {
    en: Punto
    horizontal: boolean
    /** El cable apretado y el punto sin ajustar a la rejilla: junto a una unión, `en` cae en la unión y la toca más de un cable. */
    id: Id
    crudo: Punto
    /** Se arma en el primer movimiento: cable (ya partido en uniones), puntos de partida, tramo y puntas clavadas. */
    plan?: { id: Id; original: Cable; base: Punto[]; i: number; clavado: { ini: boolean; fin: boolean } }
  }
}

const colDeGolpe = (g: Exclude<Golpe, { tipo: 'pin' }>): [Coleccion, Id] =>
  g.tipo === 'pieza' ? ['piezas', g.id] : g.tipo === 'cable' ? ['cables', g.id] : g.tipo === 'etiqueta' ? ['etiquetas', g.id] : g.tipo === 'figura' ? ['figuras', g.id] : g.tipo === 'sonda' ? ['sondas', g.id] : ['notas', g.id]

const mismoGolpe = (a: Golpe | null, b: Golpe | null) => JSON.stringify(a) === JSON.stringify(b)

/** La pieza con ese juego propio de SPICE (o sin él, si es null): el campo no queda en el documento. */
function conSpice(p: Pieza, spice: Record<string, number> | null): Pieza {
  const { spice: _antes, ...resto } = p
  return spice ? { ...resto, spice } : resto
}

function pasaPor(c: Cable, p: Punto): boolean {
  for (let i = 1; i < c.puntos.length; i++) {
    const a = c.puntos[i - 1], b = c.puntos[i]
    if (a.x === b.x && p.x === a.x && p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y)) return true
    if (a.y === b.y && p.y === a.y && p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x)) return true
  }
  return false
}

/** Por qué se rechazó un cambio, para el Registro: con qué pieza se encimaría o qué cable estorba. */
function motivo(doc: Documento, pieza: { con: Id } | null, conflicto: { con: Id; col: 'piezas' | 'cables' } | null): string {
  if (pieza) return `se encimaría con ${doc.piezas[pieza.con]?.ref ?? 'otra pieza'}`
  if (conflicto?.col === 'piezas') return `un cable atravesaría ${doc.piezas[conflicto.con]?.ref ?? 'una pieza'}`
  return 'un cable correría encima de otra red'
}

/** Por qué un choque rechaza algo. `sujeto` es la pieza que se mueve si es una sola; sin ella, si lo movido son cables
 * (`soloCables`), estorba una pieza que atravesarían. */
function motivoDeChoque(c: Choque, sujeto: string | null, soloCables = false): string {
  if (c.col === 'cables') return `un cable atravesaría ${sujeto ?? 'una de las piezas'}`
  return soloCables ? `el cable atravesaría ${c.ref}` : `se encimaría con ${c.ref}`
}

export class Editor {
  readonly historial: Historial
  readonly indice = new Indice()
  readonly lib: Map<string, PiezaDef>
  con: Conexiones
  seleccion: Seleccion = seleccionVacia()
  hover: Golpe | null = null
  herramienta: Herramienta = 'seleccionar'
  fantasma: Pieza | null = null
  /** Fragmento (plantilla) que se está colocando; con él, `herramienta` es «colocar» y `fantasma` es null. */
  private fragmentoColocar: Fragmento | null = null
  /** Último punto de rejilla bajo el cursor: ahí pegan Ctrl+V, L, T y G. */
  cursor: Punto = { x: 0, y: 0 }
  /** Distancia de captura en unidades de mundo; el lienzo la fija en 6 px según el zoom. */
  tolerancia = 0.75
  /** Radio del imán al cablear (unidades de mundo), nunca menor que `tolerancia`; el lienzo lo fija con el zoom
   * (`radioIman`). */
  radioIman = 0
  /** Sube con cada cambio del documento; la interfaz la usa para saber cuándo rehacer la escena. */
  versionDoc = 0
  private versionCaliente = -1
  private previa: { tipo: 'nota' | 'etiqueta'; id: Id; cambio: CambioTexto } | null = null
  private versionPrevia = 0
  private docPrevio: { base: Documento; previa: unknown; doc: Documento } | null = null
  /** Cuenta los cambios de valor en caliente: cada uno es su propio paso de deshacer. */
  private nValor = 0
  /** Archivo de un formato más nuevo: se ve, se selecciona y se exporta, pero ningún comando lo cambia. */
  soloLectura = false
  /** Corre la vista previa: se selecciona y se recorre, pero ningún comando cambia el documento ni el historial. */
  simulando = false
  private avisoSoloLectura = -Infinity
  private gen: GeneradorId
  private cable: CableEnCurso | null = null
  private rect: { a: Punto; b: Punto; sumar: boolean } | null = null
  private arrastre: Arrastre | null = null
  private arrastreAsa: ArrastreAsa | null = null
  private asaBajoCursor: Asa | null = null
  private arrastreTexto: ArrastreTexto | null = null
  private textoBajoCursor: { pieza: Id; cual: CualTexto } | null = null
  /** Herramienta Figura: el tipo, dónde se apretó (null antes de apretar) y la figura que resulta hasta ahora. */
  private figuraNueva: { tipo: TipoFigura; inicio: Punto | null; actual: Figura | null } | null = null
  private arrastreAsaFigura: { figura: Id; asa: AsaFigura; original: Figura; grupo: string; movio: boolean } | null = null
  private asaFiguraBajoCursor: { figura: Id; asa: AsaFigura } | null = null
  /** Los textos de pieza ya repartidos del documento vigente, para saber cuál está bajo el puntero (se rehacen al cambiar). */
  private colocados: { doc: Documento; textos: Map<Id, Texto[]> } | null = null

  /** Hay un arrastre (de lo seleccionado o de un asa) con el botón apretado: el teclado y los menús no actúan hasta que termine. */
  private get gestoEnCurso(): boolean {
    return !!(this.arrastre || this.arrastreAsa || this.arrastreTexto || this.figuraNueva?.inicio || this.arrastreAsaFigura || this.arrastreSonda || this.arrastrePantalla)
  }
  /** La pantalla de un medidor rápido tomada con el ratón: su desplazamiento de antes y dónde se tomó respecto de su centro. */
  private arrastrePantalla: { id: Id; inicio: { dx: number; dy: number }; agarre: Punto; grupo: string; movio: boolean } | null = null
  /** Una sonda tomada con el ratón: su punto, dónde se tomó la bandera y adónde iría (null mientras no se mueve). `agarre` es la distancia del puntero al punto de la sonda cuando se apretó: la bandera flota fuera del cable y se toma de ella, no del punto. */
  private arrastreSonda: { id: Id; inicio: Punto; agarre: Punto; destino: DestinoSonda | null } | null = null
  private cacheBanderas: { doc: Documento; con: Conexiones; banderas: ReadonlyMap<Id, Bandera> } | null = null

  /** Las banderas de las sondas como las dibuja la escena (el mismo reparto), guardadas hasta el siguiente cambio. */
  banderas(): ReadonlyMap<Id, Bandera> {
    if (!haySondas(this.doc)) return SIN_BANDERAS
    const c = this.cacheBanderas
    if (c && c.doc === this.doc && c.con === this.con) return c.banderas
    if (this.colocados?.doc !== this.doc) this.colocados = { doc: this.doc, textos: etiquetasSinChoques(this.doc, this.lib) }
    const banderas = banderasDelDocumento(this.doc, this.lib, this.con, this.colocados.textos)
    this.cacheBanderas = { doc: this.doc, con: this.con, banderas }
    return banderas
  }

  /** La sonda cuya bandera está bajo `p` (con la tolerancia de siempre), o null. */
  sondaEn(p: Punto): Id | null {
    if (!haySondas(this.doc)) return null
    // El cuerpo de un medidor rápido se toma como una bandera; el de encima gana.
    if (hayMedidores(this.doc)) {
      let hallada: Id | null = null
      const tol = this.tolerancia / 2
      for (const m of medidoresDe(this.doc)) {
        const c = pantallaDeMedidor(m).caja
        if (p.x >= c.minX - tol && p.x <= c.maxX + tol && p.y >= c.minY - tol && p.y <= c.maxY + tol) hallada = m.id
      }
      if (hallada) return hallada
    }
    return banderaEn(this.banderas(), p, this.tolerancia / 2)
  }
  private sinUniones: { base: Conexiones; con: Conexiones } | null = null
  private nArrastres = 0
  private valorColocar: string | undefined
  private portapapeles: Fragmento | null = null
  private oyentes = new Set<() => void>()
  /** `cancelar` del editor en línea abierto (etiqueta o nota nueva), si lo hay. */
  private textoPendiente: (() => void) | null = null
  private ganchos: Ganchos = { abrirBuscador: () => {}, editarTexto: () => {}, animar: () => {}, registrar: () => {} }
  private choque: Choque | null = null
  /** Reloj para unir flechas seguidas en un paso; las pruebas lo reemplazan. */
  ahora: () => number = () => performance.now()
  private flechas: { grupo: string; t: number } | null = null
  private nFlechas = 0
  private formatoSeguido: { grupo: string; t: number; control: string; sel: string } | null = null
  private nFormato = 0
  private potSeguido: { grupo: string; t: number } | null = null
  private nPot = 0
  /** El último ajuste de instrumento (pieza y propiedad), para juntar los seguidos en un paso de deshacer. */
  private ajusteSeguido: { clave: string; grupo: string; t: number } | null = null
  private nAjuste = 0
  /** Cable empezado al apretar un pin: si el botón se suelta tras moverse, el gesto termina el cable (arrastrar de pin a pin). */
  private desdePin: { inicio: Punto; movio: boolean } | null = null
  /** Ruta del cable en curso desde su último punto fijo: la L pedida si está libre; si no, el enrutador. */
  private rutear = (a: Punto, b: Punto, h: boolean): Punto[] => enrutar(this.doc, this.lib, a, b, { horizontalPrimero: h, indice: this.indice })

  constructor(lib: Map<string, PiezaDef>, doc: Documento = documentoVacio(), gen: GeneradorId = idAleatorio, ganchos: Partial<Ganchos> = {}) {
    this.lib = lib
    this.gen = gen
    this.ponerGanchos(ganchos)
    this.historial = new Historial(doc)
    this.con = calcularConexiones(this.historial.doc, lib)
    this.indice.reconstruir(this.historial.doc, lib)
    this.historial.suscribir(() => {
      this.versionDoc++
      // Durante un gesto no se recalcula a cada paso: se recalcula al soltar.
      if (!this.arrastre && !this.arrastreAsa && !this.arrastreTexto && !this.arrastreAsaFigura) this.recalcular()
    })
  }

  get doc(): Documento {
    return this.historial.doc
  }

  /** El documento tal como se dibuja: con la vista previa de la ficha de texto, si hay una. */
  get docVista(): Documento {
    const pr = this.previa
    const base = this.historial.doc
    if (!pr) return base
    if (this.docPrevio && this.docPrevio.base === base && this.docPrevio.previa === pr) return this.docPrevio.doc
    const r = this.textoCon(pr.tipo, pr.id, pr.cambio, base)
    const doc: Documento =
      !r || 'error' in r ? base : pr.tipo === 'nota' ? { ...base, notas: { ...base.notas, [pr.id]: r.valor as Nota } } : { ...base, etiquetas: { ...base.etiquetas, [pr.id]: r.valor as Etiqueta } }
    this.docPrevio = { base, previa: pr, doc }
    return doc
  }

  /** La nota o etiqueta con el cambio de la ficha aplicado, o el mensaje de por qué no vale; null si no existe. */
  private textoCon(tipo: 'nota' | 'etiqueta', id: Id, cambio: CambioTexto, doc: Documento): { valor: Nota | Etiqueta } | { error: string } | null {
    const conFormato = <T extends { formato?: FormatoTexto }>(x: T, f: FormatoTexto | undefined): T => {
      const { formato: _, ...resto } = x
      return (f ? { ...resto, formato: f } : resto) as T
    }
    if (tipo === 'nota') {
      const n = doc.notas[id]
      if (!n) return null
      const f = cambio.formato ? formatoConCambio(n.formato, cambio.formato, 'nota') : n.formato
      let texto = n.texto
      if (cambio.texto !== undefined) {
        texto = limpiarTexto(cambio.texto).replace(/\s+$/, '')
        if (!texto.trim()) return { error: 'Escribe el texto de la nota.' }
      }
      const antes = formatoCompleto(n.formato, 'nota'), despues = formatoCompleto(f, 'nota')
      const cambiaMedida = antes.fuente !== despues.fuente || antes.tam !== despues.tam || antes.negrita !== despues.negrita || antes.cursiva !== despues.cursiva
      // Como editar el texto y como cambiar el formato: una nota que sigue a su texto lo sigue; una fijada con las asas conserva su ancho
      // (y no baja de su palabra más larga si cambió la medida de la letra).
      const ancho = anchoSigueAlTexto(n) ? (texto !== n.texto || cambiaMedida ? anchoNotaAuto(texto, f) : n.ancho) : cambiaMedida ? Math.max(n.ancho, anchoNotaMinimo({ texto, formato: f })) : n.ancho
      return { valor: { ...conFormato(n, f), texto, ancho } }
    }
    const e = doc.etiquetas[id]
    if (!e) return null
    let nombre = e.nombre
    if (cambio.texto !== undefined) {
      nombre = limpiarTexto(cambio.texto).trim()
      if (!nombre) return { error: 'Escribe el nombre de la red.' }
    }
    const f = cambio.formato ? formatoConCambio(e.formato, cambio.formato, 'etiqueta') : e.formato
    return { valor: { ...conFormato(e, f), nombre } }
  }

  /** Vista previa de la ficha de texto del inspector: se dibuja sin tocar el documento. `null` la quita. */
  previsualizarTexto(tipo: 'nota' | 'etiqueta', id: Id, cambio: CambioTexto | null): void {
    if (!cambio && !this.previa) return
    this.previa = cambio ? { tipo, id, cambio } : null
    this.versionPrevia++
    this.avisar()
  }

  /** «Aplicar» de la ficha de texto: texto y formato de una nota o etiqueta en un solo paso de deshacer. Devuelve el error, o null. */
  aplicarTexto(tipo: 'nota' | 'etiqueta', id: Id, cambio: CambioTexto): string | null {
    if (!this.editable()) return null
    if (this.previa) {
      this.previa = null
      this.versionPrevia++
    }
    const r = this.textoCon(tipo, id, cambio, this.doc)
    if (!r) return null
    if ('error' in r) return r.error
    const actual = tipo === 'nota' ? this.doc.notas[id] : this.doc.etiquetas[id]
    if (JSON.stringify(r.valor) !== JSON.stringify(actual)) {
      this.ejecutar(tipo === 'nota' ? modificar('texto', 'notas', actual as Nota, r.valor as Nota) : modificar('texto', 'etiquetas', actual as Etiqueta, r.valor as Etiqueta))
    }
    this.avisar()
    return null
  }

  ponerGanchos(g: Partial<Ganchos>): void {
    this.ganchos = { ...this.ganchos, ...g }
  }

  suscribir(fn: () => void): () => void {
    this.oyentes.add(fn)
    return () => this.oyentes.delete(fn)
  }

  /** Conexiones para dibujar. Durante un arrastre las uniones previas quedarían en posiciones viejas, así que se omiten
   * hasta soltar (`this.con` no cambia). */
  private conParaEscena(): Conexiones {
    if (!this.arrastre?.movio) return this.con
    if (this.sinUniones?.base !== this.con) this.sinUniones = { base: this.con, con: { ...this.con, uniones: [] } }
    return this.sinUniones.con
  }

  estado(): EstadoEditor {
    return {
      doc: this.doc,
      con: this.conParaEscena(),
      seleccion: this.seleccion,
      hover: this.hover,
      herramienta: this.herramienta,
      fantasma: this.fantasma,
      fantasmaFragmento: this.fragmentoColocar ? { fragmento: this.fragmentoColocar, en: this.cursor } : null,
      cableEnCurso: this.cable ? this.cable.vista() : null,
      rectangulo: this.rect ? { a: this.rect.a, b: this.rect.b } : null,
      choque: this.choque,
      versionDoc: this.versionDoc,
      versionCaliente: this.versionCaliente,
      versionPrevia: this.versionPrevia,
      puedeDeshacer: this.historial.puedeDeshacer,
      puedeRehacer: this.historial.puedeRehacer,
      sinGuardar: this.historial.sinGuardar,
      asa: this.arrastreAsa ? { nota: this.arrastreAsa.nota, lado: this.arrastreAsa.lado, vert: this.arrastreAsa.vert } : this.asaBajoCursor,
      arrastrando: !!(this.arrastre?.movio || this.arrastreAsa?.movio || this.arrastreTexto?.movio || this.arrastreAsaFigura?.movio),
      texto: this.arrastreTexto ? { pieza: this.arrastreTexto.pieza, cual: this.arrastreTexto.cual } : this.textoBajoCursor,
      figuraEnCurso: this.figuraNueva?.actual ?? null,
      figuraPendiente: this.figuraNueva?.tipo ?? null,
      asaFigura: this.arrastreAsaFigura ? { figura: this.arrastreAsaFigura.figura, asa: this.arrastreAsaFigura.asa } : this.asaFiguraBajoCursor,
      sondaArrastrada: this.arrastreSonda?.destino ? { id: this.arrastreSonda.id, ...this.arrastreSonda.destino } : null
    }
  }

  /** Asa bajo `p`: solo con una sola nota seleccionada y nada más, y con la herramienta de selección. */
  asaEn(p: Punto): Asa | null {
    const s = this.seleccion
    if (this.herramienta !== 'seleccionar' || s.notas.size !== 1 || tamañoSeleccion(s) !== 1) return null
    const [id] = s.notas
    const n = this.doc.notas[id]
    if (!n) return null
    const tol = Math.max(this.tolerancia, RADIO_ASA)
    const a = asasDeNota(n).find((q) => Math.abs(q.x - p.x) <= tol && Math.abs(q.y - p.y) <= tol)
    return a ? { nota: id, lado: a.lado, vert: a.vert } : null
  }

  /** Paso del arrastre de un asa. Horizontal: el borde va a la rejilla fina, ancho entre 5 y 400 mm sin bajar de la
   * palabra más larga. Vertical: pasos enteros desde donde empezó, entre el alto del texto y 400 mm. La letra no cambia,
   * se reparten renglones. */
  private moverAsa(p: Punto): void {
    const a = this.arrastreAsa!
    const n = this.doc.notas[a.nota]
    if (!n) return
    const min = anchoNotaMinimo(n)
    const x = Math.round(p.x) + 0
    let izq = a.izquierda, der = a.derecha
    if (a.lado === 'der') der = Math.min(izq + ANCHO_NOTA_MAX, Math.max(izq + min, x))
    else if (a.lado === 'izq') izq = Math.max(der - ANCHO_NOTA_MAX, Math.min(der - min, x))
    const dy = a.vert ? Math.round(p.y) - Math.round(a.punteroY) + 0 : 0
    // Un clic con temblor no cambia nada: solo se confirma el gesto si el borde que se arrastra cambió de punto de la rejilla.
    const horizontal = a.lado === null ? false : a.lado === 'der' ? der !== a.derecha : izq !== a.izquierda
    if (!a.movio && !horizontal && dy === 0) return
    let y = n.y, alto = n.alto
    let nueva: Nota = a.lado ? { ...n, x: izq, ancho: der - izq, anchoFijo: true } : n
    if (a.vert && dy === 0) {
      // De vuelta donde apretó: ni la posición ni el alto cambian (un gesto de ancho en una esquina no toca el alto).
      nueva = { ...nueva, y: a.arriba }
      if (a.alto0 === undefined) delete nueva.alto
      else nueva.alto = a.alto0
    } else if (a.vert) {
      // El alto del texto depende del ancho que queda tras este paso.
      const minimo = altoNotaMinimo(nueva)
      let fondo = a.fondo
      y = a.arriba
      if (a.vert === 'abajo') fondo = Math.min(a.arriba + ALTO_NOTA_MAX, Math.max(a.arriba + minimo, a.fondo + dy))
      else y = Math.max(a.fondo - ALTO_NOTA_MAX, Math.min(a.fondo - minimo, a.arriba + dy))
      const pedido = fondo - y
      // Por debajo de lo que pide el texto no hay alto fijado: la caja vuelve a medir lo que su texto.
      alto = a.vert === 'abajo' && pedido <= minimo ? undefined : pedido
      if (alto !== undefined && alto <= altoTextoNota(nueva) + 1e-9) alto = undefined
      nueva = { ...nueva, y }
      if (alto === undefined) delete nueva.alto
      else nueva.alto = alto
    }
    if (nueva.x === n.x && nueva.y === n.y && nueva.ancho === n.ancho && nueva.alto === n.alto && nueva.anchoFijo === n.anchoFijo) return
    a.movio = true
    this.ejecutar(modificar('ancho', 'notas', n, nueva, a.grupo))
  }

  /** Termina el arrastre de un asa: un paso de deshacer si cambió algo. */
  private soltarAsa(): boolean {
    const a = this.arrastreAsa
    if (!a) return false
    this.arrastreAsa = null
    this.historial.cerrarGrupo()
    if (a.movio) this.recalcular()
    return true
  }

  /** Texto de pieza cuya caja contiene `p`, con la posición de la escena; null si no hay. Los textos se reparten una vez
   * por documento y se guardan hasta el siguiente cambio. */
  textoEn(p: Punto): { pieza: Id; cual: CualTexto; texto: Texto } | null {
    if (this.colocados?.doc !== this.doc) this.colocados = { doc: this.doc, textos: etiquetasSinChoques(this.doc, this.lib) }
    for (const [id, ts] of this.colocados.textos)
      for (let i = 0; i < ts.length; i++) {
        const t = ts[i]
        if (!t) continue
        const c = cajaTexto(t)
        if (p.x < c.minX || p.x > c.maxX || p.y < c.minY || p.y > c.maxY) continue
        const pz = this.doc.piezas[id]
        const def = pz ? this.lib.get(pz.tipo) : undefined
        const cual = pz && def ? textosLocales(pz, def, this.doc)[i]?.cual : undefined
        if (cual) return { pieza: id, cual, texto: t }
      }
    return null
  }

  /** Texto de pieza que tomaría un clic en `p`: el de `textoEn`, salvo que mande otra cosa (cuerpo, pin a distancia de
   * captura sin imán, etiqueta o nota; un cable no).
   * Solo con la herramienta de selección y circuito editable. */
  private textoArrastrable(p: Punto): { pieza: Id; cual: CualTexto; texto: Texto } | null {
    if (this.herramienta !== 'seleccionar' || this.soloLectura || this.simulando) return null
    const t = this.textoEn(p)
    if (!t) return null
    const g = this.indice.golpe(p, this.tolerancia)
    if (g?.tipo === 'pin' || g?.tipo === 'etiqueta' || g?.tipo === 'nota') return null
    // El dibujo de otra pieza gana a un texto encimado; el de la propia, solo dentro de su cuerpo.
    if (g?.tipo === 'pieza' && g.id !== t.pieza) return null
    if (g?.tipo === 'pieza') {
      const pz = this.doc.piezas[g.id]
      const c = pz ? cuerpoEnMundo(pz, this.lib.get(pz.tipo)) : null
      if (c && p.x >= c.minX && p.x <= c.maxX && p.y >= c.minY && p.y <= c.maxY) return null
    }
    return t
  }

  /** Como `textoArrastrable` pero sin pedir que se pueda editar: el doble clic y el menú también actúan al simular. */
  private textoTomado(p: Punto): { pieza: Id; cual: CualTexto; texto: Texto } | null {
    const s = this.soloLectura, m = this.simulando
    this.soloLectura = false
    this.simulando = false
    try {
      return this.textoArrastrable(p)
    } finally {
      this.soloLectura = s
      this.simulando = m
    }
  }

  /** Un paso del arrastre de un texto: el lugar más cercano al centro del texto, o libre con Alt. */
  private moverTexto(p: Punto, m: Modificadores): void {
    const a = this.arrastreTexto!
    if (!a.movio && Math.hypot(p.x - a.inicio.x, p.y - a.inicio.y) < this.tolerancia) return
    const pz = this.doc.piezas[a.pieza]
    const def = pz ? this.lib.get(pz.tipo) : undefined
    if (!pz || !def) return
    a.movio = true
    const centro = { x: p.x - a.agarre.x, y: p.y - a.agarre.y }
    const pos = m.alt ? posicionLibre(pz, centro) : { lugar: lugarMasCercano(pz, def, a.texto, centro) }
    const textos = { ...(pz.textos ?? {}), [a.cual]: pos }
    if (JSON.stringify(textos) === JSON.stringify(pz.textos ?? {})) return
    this.ejecutar(modificar('posición del texto', 'piezas', pz, { ...pz, textos }, a.grupo))
  }

  /** La pantalla del medidor sigue al puntero alrededor de su punto, a lo más `MAX_PANTALLA_MEDIDOR` unidades (cada paso, en el mismo grupo de deshacer). Con Alt (`libre`) sin rejilla, a centésimas de unidad. */
  private moverPantalla(p: Punto, libre: boolean): void {
    const a = this.arrastrePantalla!
    const s = this.doc.sondas?.[a.id]
    if (!s || !esMedidor(s)) return
    const acotar = (n: number) => Math.max(-MAX_PANTALLA_MEDIDOR, Math.min(MAX_PANTALLA_MEDIDOR, libre ? dosDecimales(n) : Math.round(n)))
    const pantalla = { dx: acotar(p.x - a.agarre.x - s.x), dy: acotar(p.y - a.agarre.y - s.y) }
    if (!a.movio && pantalla.dx === a.inicio.dx && pantalla.dy === a.inicio.dy) return
    a.movio = true
    if (pantalla.dx === s.pantalla?.dx && pantalla.dy === s.pantalla?.dy) return
    this.ejecutar(modificar('mover la pantalla del medidor', 'sondas', s, { ...s, pantalla }, a.grupo))
  }

  /** Suelta la pantalla del medidor: un paso de deshacer si quedó en otro lugar; si volvió a donde estaba, ninguno. */
  private soltarPantalla(): boolean {
    const a = this.arrastrePantalla
    if (!a) return false
    this.arrastrePantalla = null
    const s = this.doc.sondas?.[a.id]
    if (a.movio && s?.pantalla && s.pantalla.dx === a.inicio.dx && s.pantalla.dy === a.inicio.dy) this.historial.revertirGrupo()
    this.historial.cerrarGrupo()
    return true
  }

  /** Termina el arrastre de un texto: un paso de deshacer si cambió algo; si volvió a donde estaba, no deja paso. */
  private soltarTexto(): boolean {
    const a = this.arrastreTexto
    if (!a) return false
    this.arrastreTexto = null
    if (a.movio && JSON.stringify(this.doc.piezas[a.pieza]?.textos ?? {}) === JSON.stringify(a.antes ?? {})) this.historial.revertirGrupo()
    this.historial.cerrarGrupo()
    return true
  }

  /** Caja del texto que resalta la superposición: el que se arrastra (ya en su lugar nuevo) o el que tomaría un clic. null
   * si ninguno. */
  textoResaltado(): { caja: Caja; arrastrando: boolean } | null {
    const a = this.arrastreTexto
    if (a) {
      const pz = this.doc.piezas[a.pieza]
      const def = pz ? this.lib.get(pz.tipo) : undefined
      if (!pz || !def) return null
      const locales = textosLocales(pz, def, this.doc)
      const i = locales.findIndex((t) => t.cual === a.cual)
      const t = textosManuales(pz, def, locales).get(i)
      return t ? { caja: cajaTexto(t), arrastrando: true } : null
    }
    const b = this.textoBajoCursor
    if (!b) return null
    const i = (() => {
      const pz = this.doc.piezas[b.pieza]
      const def = pz ? this.lib.get(pz.tipo) : undefined
      return pz && def ? textosLocales(pz, def, this.doc).findIndex((t) => t.cual === b.cual) : -1
    })()
    if (this.colocados?.doc !== this.doc) this.colocados = { doc: this.doc, textos: etiquetasSinChoques(this.doc, this.lib) }
    const t = i >= 0 ? this.colocados.textos.get(b.pieza)?.[i] : undefined
    return t ? { caja: cajaTexto(t), arrastrando: false } : null
  }

  /** Hay piezas seleccionadas con algún texto movido a mano: el menú habilita «Restablecer posición de los textos». */
  puedeRestablecerTextos(): boolean {
    for (const id of this.seleccion.piezas) {
      const p = this.doc.piezas[id]
      if (p && tieneTextosManuales(p)) return true
    }
    return false
  }

  /** «Restablecer posición de los textos»: los de las piezas seleccionadas vuelven al reparto automático, en un paso. */
  restablecerTextos(): void {
    if (this.gestoEnCurso || !this.editable()) return
    const cmds: Comando[] = []
    for (const id of this.seleccion.piezas) {
      const p = this.doc.piezas[id]
      if (!p || !Object.hasOwn(p, 'textos')) continue
      const { textos: _a_mano, ...resto } = p
      cmds.push(modificar('posición de los textos', 'piezas', p, resto))
    }
    if (cmds.length === 0) return
    this.ejecutar(cmds.length === 1 ? cmds[0] : juntar('posición de los textos', cmds))
    this.avisar()
  }

  nombrePin(g: Golpe | null): string | null {
    if (g?.tipo !== 'pin') return null
    const p = this.doc.piezas[g.piezaId]
    const pin = p ? this.lib.get(p.tipo)?.pines.find((x) => x.id === g.pinId) : undefined
    return p && pin ? `${p.ref} · ${pin.nombre}` : null
  }

  /** Los renglones de ayuda del pin bajo el cursor (`ayuda` de su `pieza.json`), o null si no tiene. */
  ayudaPin(g: Golpe | null): string[] | null {
    if (g?.tipo !== 'pin') return null
    const p = this.doc.piezas[g.piezaId]
    const pin = p ? this.lib.get(p.tipo)?.pines.find((x) => x.id === g.pinId) : undefined
    return p && pin?.ayuda ? [`${p.ref} · ${pin.nombre}`, ...pin.ayuda.split(' · ')] : null
  }

  /** Reemplaza el documento. Con `sucio` queda «sin guardar» aunque se deshaga todo; con `soloLectura` ningún comando lo
   * cambia. Cada carga fija ambos. */
  cargar(doc: Documento, opciones: { sucio?: boolean; soloLectura?: boolean } = {}): void {
    this.soloLectura = opciones.soloLectura === true
    this.cerrarArrastre()
    this.cancelarCable()
    this.rect = null
    this.fantasma = null
    this.fragmentoColocar = null
    this.figuraNueva = null
    this.asaFiguraBajoCursor = null
    this.choque = null
    this.herramienta = 'seleccionar'
    this.seleccion = seleccionVacia()
    this.hover = null
    // Un `spice` en una pieza sin familia de SPICE (un archivo editado a mano) se descarta y el archivo queda con cambios sin guardar.
    const limpio = sinSpiceSinFamilia(doc, this.lib)
    this.historial.reemplazar(limpio.doc)
    if (opciones.sucio || limpio.descartadas.length > 0) this.historial.marcarSucio()
    for (const ref of limpio.descartadas) this.ganchos.registrar(`Se descartó el modelo propio de ${ref}: su modelo no tiene parámetros de SPICE.`)
    this.avisar()
  }

  /** Marca del estado actual para `marcarGuardado` tras una escritura asíncrona. Cierra antes el paso abierto si no hay
   * arrastre, para que lo editado mientras se escribe sea otro paso. */
  marca(): unknown {
    if (!this.gestoEnCurso) this.historial.cerrarGrupo()
    return this.historial.marca()
  }

  /** Lo actual quedó guardado: cierra el paso en curso para que deshacer vuelva justo a lo guardado. Un arrastre con el
   * botón apretado no se cierra. */
  marcarGuardado(marca: unknown = this.historial.marca()): void {
    if (!this.gestoEnCurso) this.historial.cerrarGrupo()
    this.historial.marcarGuardado(marca)
    this.avisar()
  }

  private avisar(): void {
    for (const fn of this.oyentes) fn()
  }

  private recalcular(): void {
    this.con = calcularConexiones(this.doc, this.lib)
    this.indice.reconstruir(this.doc, this.lib)
    this.seleccion = depurar(this.seleccion, this.doc)
  }

  /** En solo lectura o simulando avisa en el Registro (como mucho una vez por segundo) y devuelve false. */
  private editable(): boolean {
    if (!this.soloLectura && !this.simulando) return true
    const t = this.ahora()
    if (t - this.avisoSoloLectura >= ESPERA_AVISO_SOLO_LECTURA_MS) {
      this.avisoSoloLectura = t
      this.ganchos.registrar(this.simulando ? MENSAJE_SIMULANDO : MENSAJE_SOLO_LECTURA)
    }
    return false
  }

  /** Entra o sale de la vista previa. Al entrar cancela lo pendiente (cable, colocación, texto, rectángulo, arrastre) y
   * cierra el paso abierto; la selección se conserva. */
  ponerSimulando(si: boolean): void {
    if (si === this.simulando) return
    if (si) {
      this.cancelarGesto()
      this.cancelarPendiente()
      this.historial.cerrarGrupo()
    }
    this.simulando = si
    this.avisar()
  }

  /** Todo cambio del documento pasa por aquí. En solo lectura no se aplica ninguno, ni uno que deje algo fuera del mundo
   * de un `.kir` (se descartaría al reabrir). */
  private ejecutar(cmd: Comando): void {
    if (!this.editable() || !comandoDentroDelMundo(cmd)) return
    // Las sondas que el cambio deja sin tocar nada se mudan o se borran en el mismo paso (solo si el circuito tiene alguna).
    const sondas = haySondas(this.doc) ? mantenerSondas(this.doc, () => aplicar(this.doc, cmd), this.lib, this.con, cmd.cambios) : null
    this.historial.ejecutar(sondas?.cmd ? fusionar(cmd, sondas.cmd) : cmd)
    for (const a of sondas?.avisos ?? []) this.ganchos.registrar(a)
  }

  /** Ejecuta `cmd` y, en el mismo paso del historial, parte los cables en las uniones en T que resulten. */
  private ejecutarNormalizado(cmd: Comando): void {
    const extra = partirEnUniones(aplicar(this.doc, cmd), this.gen)
    this.ejecutar(extra ? fusionar(cmd, extra) : cmd)
  }

  /** La selección puede moverse en la rejilla fina con Alt: solo notas, figuras y etiquetas en las que no termina ningún cable. */
  private seMueveFino(): boolean {
    const s = this.seleccion
    if (s.piezas.size || s.cables.size || s.notas.size + s.etiquetas.size + s.figuras.size === 0) return false
    if (s.etiquetas.size === 0) return true
    const puntos = new Set([...s.etiquetas].map((id) => this.doc.etiquetas[id]).filter(Boolean).map((e) => `${e.x},${e.y}`))
    for (const c of Object.values(this.doc.cables)) for (const q of c.puntos) if (puntos.has(`${q.x},${q.y}`)) return false
    return true
  }

  /** Con Alt la selección se mueve sin rejilla: solo si son notas y figuras (una etiqueta, una pieza o un cable quedan en su rejilla). */
  private seMueveLibre(): boolean {
    const s = this.seleccion
    return !s.piezas.size && !s.cables.size && !s.etiquetas.size && s.notas.size + s.figuras.size > 0
  }

  /** Termina el arrastre en curso donde esté: lo normaliza, cierra su grupo y recalcula. */
  /** Un paso del arrastre de un tramo. En el primero se parten las uniones en T para que las puntas sean de verdad, se ubica el tramo y se ven las puntas clavadas. */
  private moverTramoArrastrado(a: Arrastre, dx: number, dy: number): void {
    const t = a.tramo!
    if (!t.plan) {
      const antes = new Set(Object.keys(this.doc.cables))
      const extra = partirEnUniones(this.doc, this.gen)
      if (extra) {
        this.ejecutar({ ...extra, grupo: a.grupo })
        // Durante un arrastre el historial no recalcula: aquí sí, para que el índice y las redes vean los cables partidos.
        this.recalcular()
      }
      // El tramo se busca primero en el cable apretado y en los trozos en que lo partieron las uniones: otro cable de la unión
      // también pasa por `en` y, si fuera primero en el documento, se movería él.
      const propios = [t.id, ...Object.keys(this.doc.cables).filter((id) => !antes.has(id))]
      const lugar = this.localizarTramo(t.en, t.horizontal, propios, t.crudo)
      if (!lugar) return
      const ultimo = lugar.base[lugar.base.length - 1]
      t.plan = {
        ...lugar,
        original: this.doc.cables[lugar.id],
        clavado: { ini: this.puntaClavada(lugar.base[0], lugar.id), fin: this.puntaClavada(ultimo, lugar.id) }
      }
      this.seleccion = seleccionDe('cables', lugar.id)
    }
    const pl = t.plan
    // El codo de una punta clavada va recto salvo que corra sobre otro cable (el que sale de la misma unión hacia donde se
    // mueve el tramo). Entonces sale de la unión un paso a lo largo del tramo y de ahí cruza (un escalón), o si eso también
    // estorba lo traza el enrutador: la unión no se mueve y nada queda encimado.
    const libre = (pts: Punto[]) => !cableEncimado(this.doc, pts, (id) => id === pl.id, this.indice)
    const conectar = (desde: Punto, hasta: Punto, dentro: Punto): Punto[] => {
      const recto = [desde, hasta]
      if (libre(recto)) return recto
      const largo = Math.abs(dentro.x - desde.x) + Math.abs(dentro.y - desde.y)
      if (largo > PASO_REJILLA) {
        const s = { x: desde.x + Math.sign(dentro.x - desde.x) * PASO_REJILLA, y: desde.y + Math.sign(dentro.y - desde.y) * PASO_REJILLA }
        const escalon = [desde, s, { x: s.x + hasta.x - desde.x, y: s.y + hasta.y - desde.y }]
        if (libre(escalon) && !piezaCruzada(this.doc, this.lib, escalon, this.indice)) return escalon
      }
      const r = enrutar(this.doc, this.lib, desde, hasta, { ignorarCables: new Set([pl.id]), indice: this.indice })
      return r.length >= 2 && libre(r) ? r : recto
    }
    const pts = moverTramo(pl.base, pl.i, t.horizontal ? dy : dx, pl.clavado, conectar)
    const actual = this.doc.cables[pl.id]
    if (pts.length < 2) {
      if (actual) this.ejecutar(borrar('tramo', 'cables', actual, a.grupo))
    } else if (actual) this.ejecutar(modificar('tramo', 'cables', actual, { ...actual, puntos: pts }, a.grupo))
    else this.ejecutar(crear('tramo', 'cables', { ...pl.original, puntos: pts }, a.grupo))
    const p = pts.length >= 2 ? piezaCruzada(this.doc, this.lib, pts, this.indice) : null
    const propias = new Set([...this.redesEn(pl.base[0]), ...this.redesEn(pl.base[pl.base.length - 1])])
    this.choque = this.choqueCon(p ?? (pts.length >= 2 ? cableEncimado(this.doc, pts, (id) => id === pl.id || propias.has(this.con.redDeCable.get(id)), this.indice) : null))
  }

  /** Cable y tramo (puntos limpios) que contienen `en` con la orientación dada. Busca en los `propios`, con el punto
   * `crudo` sin ajustar para decidir entre dos trozos que se tocan, y luego en todo el documento. */
  private localizarTramo(en: Punto, horizontal: boolean, propios: Id[] = [], crudo?: Punto): { id: Id; base: Punto[]; i: number } | null {
    const buscar = (c: Cable, q: Punto): { id: Id; base: Punto[]; i: number } | null => {
      const pts = limpiarPolilinea(c.puntos)
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i]
        const enTramo = horizontal
          ? a.y === b.y && a.x !== b.x && q.y === a.y && q.x >= Math.min(a.x, b.x) && q.x <= Math.max(a.x, b.x)
          : a.x === b.x && a.y !== b.y && q.x === a.x && q.y >= Math.min(a.y, b.y) && q.y <= Math.max(a.y, b.y)
        if (enTramo) return { id: c.id, base: pts, i: i - 1 }
      }
      return null
    }
    const mios = propios.map((id) => this.doc.cables[id]).filter((c): c is Cable => !!c)
    for (const q of crudo ? [crudo, en] : [en]) for (const c of mios) {
      const r = buscar(c, q)
      if (r) return r
    }
    for (const c of Object.values(this.doc.cables)) {
      const r = buscar(c, en)
      if (r) return r
    }
    return null
  }

  /** La punta `q` del cable `propio` toca un pin, una etiqueta u otro cable: no puede moverse. */
  private puntaClavada(q: Punto, propio: Id): boolean {
    if (this.indice.pinesEn(q.x, q.y).length) return true
    if (Object.values(this.doc.etiquetas).some((e) => e.x === q.x && e.y === q.y)) return true
    return Object.values(this.doc.cables).some((c) => c.id !== propio && (c.puntos.some((pt) => iguales(pt, q)) || pasaPor(c, q)))
  }

  /** Deshace el arrastre en curso sin dejar paso en el historial; con `motivo`, lo movido se sacude y el Registro dice por qué. */
  private revertirArrastre(motivo?: string): void {
    this.arrastre = null
    this.choque = null
    this.historial.revertirGrupo()
    this.historial.cerrarGrupo()
    if (motivo === undefined) return
    this.ganchos.animar({ tipo: 'sacudida', piezas: [...this.seleccion.piezas], cables: [...this.seleccion.cables] })
    this.ganchos.registrar(`El movimiento se deshizo: ${motivo}.`)
  }

  private soltarArrastre(): boolean {
    const a = this.arrastre
    if (!a) return false
    const choco = a.movio && this.choque !== null
    if (a.movio && ((a.d.x === 0 && a.d.y === 0) || choco)) {
      // Terminó donde empezó, o encima de otra pieza: no deja paso y la pila de rehacer vuelve a como estaba.
      this.revertirArrastre(choco ? motivoDeChoque(this.choque!, this.sujetoUnico(), this.seleccion.piezas.size === 0) : undefined)
      return true
    }
    if (a.movio && a.tramo?.plan) {
      const antes = new Set(Object.keys(this.doc.cables))
      const extra = partirEnUniones(this.doc, this.gen)
      if (extra) this.ejecutar({ ...extra, grupo: a.grupo })
      // El cable arrastrado y los trozos en que lo partan las uniones nuevas.
      const tocados = Object.keys(this.doc.cables).filter((id) => id === a.tramo!.plan!.id || !antes.has(id))
      const conflicto = conflictoDeTocados(this.doc, this.lib, { cables: tocados })
      if (conflicto) {
        this.revertirArrastre(motivo(this.doc, null, conflicto))
        return true
      }
    }
    if (a.movio && a.plan) {
      // Una pieza de dos pines soltada sobre un cable queda en serie (no cuentan los cables que se arrastran con ella).
      for (const id of this.seleccion.piezas) {
        const p = this.doc.piezas[id]
        const ins = p ? insertarEnCable(this.doc, this.lib, p, this.gen, this.seleccion.cables) : null
        if (ins) this.ejecutar({ ...ins, grupo: a.grupo })
      }
      // Los cables estirados (no los que el usuario arrastra) que cruzan un cuerpo o hacen una vuelta en U se vuelven a enrutar entre sus extremos.
      const estirados = a.plan.estirados.map((e) => e.cable.id)
      for (const id of estirados) {
        const c = this.doc.cables[id]
        const r = c ? repararCable(this.doc, this.lib, id) : null
        if (c && r) this.ejecutar(modificar('enrutar', 'cables', c, { ...c, puntos: r }, a.grupo))
      }
      const extra = partirEnUniones(this.doc, this.gen)
      if (extra) this.ejecutar({ ...extra, grupo: a.grupo })
      // El invariante: ningún cable atraviesa una pieza ni corre encima de otra red. Si no se cumple, el arrastre no se queda.
      const tocados = { piezas: this.seleccion.piezas, cables: [...this.seleccion.cables, ...estirados] }
      const conflicto = conflictoDeTocados(this.doc, this.lib, tocados)
      if (conflicto) {
        this.revertirArrastre(motivo(this.doc, null, conflicto))
        return true
      }
    }
    this.arrastre = null
    this.historial.cerrarGrupo()
    if (a.movio) {
      this.recalcular()
      // La escena se dibujó sin uniones durante el gesto: la interfaz la rehace al ver una versión nueva.
      this.versionDoc++
    } else if (a.reducirA) this.seleccion = seleccionDe(a.reducirA[0], a.reducirA[1])
    return true
  }

  private cerrarArrastre(): void {
    this.soltarArrastre()
    this.soltarAsa()
    this.soltarTexto()
    this.soltarPantalla()
    this.soltarAsaFigura()
  }

  // ---- Puntero: coordenadas de mundo sin ajustar ----

  abajo(p: Punto, m: Modificadores = {}): void {
    // Un gesto que quedó abierto (se perdió el pointerup) se cierra antes de empezar otro.
    if (this.gestoEnCurso || this.rect) this.arriba(p, m)
    this.desdePin = null
    const q = ajustar(p)
    this.cursor = q
    if (this.herramienta === 'figura' && this.figuraNueva) {
      const a = fino(p)
      this.figuraNueva.inicio = a
      this.figuraNueva.actual = figuraDeArrastre(this.figuraNueva.tipo, a, a, false)
      this.avisar()
      return
    }
    if (this.herramienta === 'colocar') {
      if (this.fragmentoColocar) {
        this.revisarFragmento()
        if (this.choque) {
          this.ganchos.registrar(`No se colocó la plantilla: ${motivoDeChoque(this.choque, null)}.`)
        } else if (this.pegarFragmento(this.fragmentoColocar, q, true)) {
          // Como una pieza: sin Shift se coloca una vez; con Shift la plantilla sigue para otra.
          if (m.shift) this.revisarFragmento()
          else this.terminarColocar()
        }
        this.avisar()
        return
      }
      if (this.fantasma) {
        this.fantasma = { ...this.fantasma, x: q.x, y: q.y }
        this.revisarFantasma()
        if (this.choque) {
          this.ganchos.animar({ tipo: 'sacudida', piezas: [ID_FANTASMA] })
          this.ganchos.registrar(`No se colocó ${this.fantasma.ref}: ${motivoDeChoque(this.choque, this.fantasma.ref)}.`)
        } else if (this.colocarFantasma()) {
          // Sin Shift se coloca una sola pieza; con Shift el fantasma sigue para la siguiente.
          if (m.shift) this.revisarFantasma()
          else this.terminarColocar()
        }
        this.avisar()
      }
      return
    }
    if (this.herramienta === 'cablear') {
      this.clicCableando(p)
      return
    }
    if (this.herramienta !== 'seleccionar') return
    // Un asa de la nota seleccionada gana a lo que haya debajo: cambia su ancho.
    const asa = m.shift ? null : this.asaEn(p)
    if (asa) {
      const n = this.doc.notas[asa.nota]
      this.arrastreAsa = {
        ...asa, izquierda: n.x, derecha: n.x + Math.ceil(disposicionNota(n).anchoCaja - 1e-9),
        arriba: n.y, fondo: n.y + Math.ceil(altoNota(n) - 1e-9), punteroY: p.y, alto0: n.alto, grupo: `ancho-${++this.nArrastres}`, movio: false
      }
      this.avisar()
      return
    }
    // El asa de la figura seleccionada (también con Shift, que entonces conserva la proporción o los 45°).
    const af = this.asaFiguraEn(p)
    if (af) {
      this.arrastreAsaFigura = { ...af, original: figurasDe(this.doc)[af.figura], grupo: `tamaño-${++this.nArrastres}`, movio: false }
      this.avisar()
      return
    }
    // Un texto de pieza (referencia o valor) se arrastra a uno de sus ocho lugares, o libre con Alt.
    const tx = m.shift ? null : this.textoArrastrable(p)
    if (tx) {
      const c = centroDeTexto(tx.texto)
      this.seleccion = seleccionDe('piezas', tx.pieza)
      this.arrastreTexto = {
        pieza: tx.pieza, cual: tx.cual, texto: tx.texto.texto, inicio: p, agarre: { x: p.x - c.x, y: p.y - c.y },
        antes: this.doc.piezas[tx.pieza]?.textos, grupo: `texto-${++this.nArrastres}`, movio: false
      }
      this.avisar()
      return
    }
    // La bandera de una sonda: se selecciona y se arrastra a otro punto del circuito.
    const sonda = this.sondaEn(p)
    if (sonda) {
      if (m.shift) this.seleccion = alternar(this.seleccion, 'sondas', sonda)
      else {
        if (!this.seleccion.sondas.has(sonda)) this.seleccion = seleccionDe('sondas', sonda)
        const s = this.doc.sondas?.[sonda]
        if (s && esMedidor(s)) {
          // Tomar la pantalla de un medidor la mueve alrededor de su punto; el punto se lleva con las flechas.
          const c = pantallaDeMedidor(s).caja
          if (!this.soloLectura && !this.simulando) this.arrastrePantalla = { id: s.id, inicio: { ...s.pantalla! }, agarre: { x: p.x - (c.minX + c.maxX) / 2, y: p.y - (c.minY + c.maxY) / 2 }, grupo: `pantalla-${++this.nArrastres}`, movio: false }
        } else if (s && !this.soloLectura && !this.simulando) this.arrastreSonda = { id: sonda, inicio: { x: s.x, y: s.y }, agarre: { x: p.x - s.x, y: p.y - s.y }, destino: null }
      }
      this.avisar()
      return
    }
    const g = this.golpeConIman(p)
    if (g?.tipo === 'cable' && m.alt) {
      this.empezarCable(this.puntoEnCable(g, p))
      return
    }
    if (g?.tipo === 'pin') {
      const inicio = { x: g.x, y: g.y }
      this.empezarCable(inicio)
      this.desdePin = { inicio, movio: false }
      return
    }
    if (g) {
      const [col, id] = colDeGolpe(g)
      if (m.shift) this.seleccion = alternar(this.seleccion, col, id)
      else {
        let reducirA: [Coleccion, Id] | undefined
        // Un cable que no es parte de una selección de varios se arrastra por tramos: solo el tramo apretado.
        const varios = this.seleccion[col].has(id) && tamañoSeleccion(this.seleccion) > 1
        const c = g.tipo === 'cable' ? this.doc.cables[g.id] : undefined
        const tramo =
          c && g.tipo === 'cable' && !varios
            ? { en: this.puntoEnCable(g, p), horizontal: c.puntos[g.tramo].y === c.puntos[g.tramo + 1].y, id: g.id, crudo: proyectarSinAjustar(p, c.puntos[g.tramo], c.puntos[g.tramo + 1]) }
            : undefined
        if (!this.seleccion[col].has(id)) this.seleccion = seleccionDe(col, id)
        else if (varios) reducirA = [col, id]
        this.arrastre = { inicio: q, d: { x: 0, y: 0 }, grupo: `arrastre-${++this.nArrastres}`, movio: false, reducirA, tramo, ...(!tramo && this.seMueveFino() ? { fino: fino(p) } : {}), ...(!tramo && this.seMueveLibre() ? { libre: p } : {}) }
      }
      this.avisar()
      return
    }
    if (!m.shift) this.seleccion = seleccionVacia()
    this.rect = { a: p, b: p, sumar: !!m.shift }
    this.avisar()
  }

  mover(p: Punto, m: Modificadores = {}): void {
    const q = ajustar(p)
    const previo = this.cursor
    this.cursor = q
    if (this.figuraNueva?.inicio) {
      this.figuraNueva.actual = figuraDeArrastre(this.figuraNueva.tipo, this.figuraNueva.inicio, fino(p), !!m.shift)
      this.avisar()
      return
    }
    if (this.arrastreTexto) {
      this.moverTexto(p, m)
      this.avisar()
      return
    }
    if (this.arrastrePantalla) {
      this.moverPantalla(p, !!m.alt)
      this.avisar()
      return
    }
    const as = this.arrastreSonda
    if (as) {
      const s = this.doc.sondas?.[as.id]
      // El puntero se mide desde donde se tomó la bandera: lo que busca el imán es el punto de la sonda, no la esquina de su caja.
      const pa = { x: p.x - as.agarre.x, y: p.y - as.agarre.y }
      const qa = ajustar(pa)
      if (!s || (!as.destino && qa.x === as.inicio.x && qa.y === as.inicio.y)) return
      const iman = imanDeSonda(this.indice, this.doc, this.con, s, pa, this.radioCableado())
      as.destino = destinoDeSonda(this.doc, this.lib, s, iman, qa, !!iman && esDeOtraRed(this.con, s, iman))
      this.avisar()
      return
    }
    if (this.arrastreAsaFigura) {
      this.moverAsaDeFigura(p, !!m.shift)
      this.avisar()
      return
    }
    if (this.arrastreAsa) {
      this.moverAsa(p)
      this.avisar()
      return
    }
    const a = this.arrastre
    if (a) {
      const l = m.alt && a.libre ? a.libre : null
      const f = !l && m.alt && a.fino ? fino(p) : null
      const dx = l ? dosDecimales(p.x - l.x) : f ? f.x - a.fino!.x : q.x - a.inicio.x, dy = l ? dosDecimales(p.y - l.y) : f ? f.y - a.fino!.y : q.y - a.inicio.y
      if (dx === a.d.x && dy === a.d.y) return
      a.d = { x: dx, y: dy }
      a.movio = true
      if (f || l) this.ganchos.alMoverFino?.()
      if (a.tramo) {
        this.moverTramoArrastrado(a, dx, dy)
        this.avisar()
        return
      }
      if (!a.plan) {
        // Antes del primer paso, las uniones en T pasan a ser extremos de cable para que se muevan con lo que tocan.
        const extra = partirEnUniones(this.doc, this.gen)
        if (extra) this.ejecutar({ ...extra, grupo: a.grupo })
        a.plan = planArrastre(this.doc, this.lib, this.seleccion)
      }
      this.ejecutar(pasoArrastre(a.plan, dx, dy, a.grupo))
      this.choque = this.choqueDeArrastre()
      this.avisar()
      return
    }
    if (this.rect) {
      this.rect = { ...this.rect, b: p }
      this.avisar()
      return
    }
    if (this.herramienta === 'colocar' && this.fragmentoColocar) {
      if (previo.x !== q.x || previo.y !== q.y) {
        this.revisarFragmento()
        this.avisar()
      }
      return
    }
    if (this.herramienta === 'colocar' && this.fantasma) {
      if (this.fantasma.x !== q.x || this.fantasma.y !== q.y) {
        this.fantasma = { ...this.fantasma, x: q.x, y: q.y }
        this.revisarFantasma()
        this.avisar()
      }
      return
    }
    if (this.herramienta === 'cablear' && this.cable) {
      const m = this.imanDeCable(p, this.cable.inicio)
      const destino = m ? { x: m.x, y: m.y } : q
      if (this.desdePin && !iguales(destino, this.desdePin.inicio)) this.desdePin.movio = true
      this.cable.mover(destino)
      this.choque = this.choqueDeCable()
      // El destino imantado se resalta antes de soltar: el pin con su círculo, el cable con su trazo.
      this.hover = m ? (m.tipo === 'pin' ? m : m.tipo === 'etiqueta' ? { tipo: 'etiqueta', id: m.id } : { tipo: 'cable', id: m.id, tramo: m.tramo }) : null
      this.avisar()
      return
    }
    if (this.herramienta === 'seleccionar') {
      const g = this.golpeConIman(p)
      const asa = this.asaEn(p)
      const asaF = this.asaFiguraEn(p)
      const t = this.textoArrastrable(p)
      const texto = t ? { pieza: t.pieza, cual: t.cual } : null
      if (
        !mismoGolpe(g, this.hover) || JSON.stringify(asa) !== JSON.stringify(this.asaBajoCursor) || JSON.stringify(texto) !== JSON.stringify(this.textoBajoCursor) ||
        JSON.stringify(asaF) !== JSON.stringify(this.asaFiguraBajoCursor)
      ) {
        this.hover = g
        this.asaBajoCursor = asa
        this.asaFiguraBajoCursor = asaF
        this.textoBajoCursor = texto
        this.avisar()
      }
    }
  }

  arriba(p: Punto, m: Modificadores = {}): void {
    if (this.soltarPantalla()) {
      this.avisar()
      return
    }
    if (this.soltarSonda()) {
      this.avisar()
      return
    }
    if (this.figuraNueva?.inicio) {
      this.terminarFigura(p, !!m.shift)
      this.avisar()
      return
    }
    if (this.soltarAsaFigura()) {
      this.avisar()
      return
    }
    if (this.soltarTexto()) {
      this.avisar()
      return
    }
    if (this.soltarAsa()) {
      this.avisar()
      return
    }
    const d = this.desdePin
    if (d) {
      this.desdePin = null
      if (d.movio && this.cable) this.soltarCable(p, d.inicio)
      return
    }
    if (this.soltarArrastre()) {
      this.avisar()
      return
    }
    const r = this.rect
    if (r) {
      this.rect = null
      if (r.a.x !== r.b.x || r.a.y !== r.b.y) {
        const s = seleccionarEnRectangulo(this.indice, this.doc, r.a, r.b)
        this.seleccion = r.sumar ? unir(this.seleccion, s) : s
      }
      this.avisar()
    }
  }

  /** Suelta la sonda arrastrada: en su destino si ahí mide (un paso de deshacer); si no, se queda y el Registro dice por qué. */
  private soltarSonda(): boolean {
    const a = this.arrastreSonda
    if (!a) return false
    this.arrastreSonda = null
    const s = this.doc.sondas?.[a.id]
    const d = a.destino
    if (!s || !d) return true
    if (!d.valida) {
      if (d.motivo) this.ganchos.registrar(d.motivo)
      return true
    }
    if (d.x !== s.x || d.y !== s.y || (d.sentido ?? s.sentido) !== s.sentido)
      this.ejecutar(modificar('mover la sonda', 'sondas', s, { ...s, x: d.x, y: d.y, ...(d.sentido ? { sentido: d.sentido } : {}) }))
    return true
  }

  dobleClic(p: Punto, _m: Modificadores = {}): void {
    if (this.herramienta === 'cablear' && this.cable) {
      this.terminarCable(ajustar(p))
      return
    }
    if (this.herramienta !== 'seleccionar') return
    // Sobre la referencia o el valor de una pieza: su editor, con el foco en ese campo.
    const t = this.textoTomado(p)
    if (t) return this.editarValor(t.pieza, t.cual)
    // El medidor rápido (cuerpo o punto): su editor con lo que mide.
    const sonda = this.sondaEn(p)
    if (sonda && this.doc.sondas && esMedidor(this.doc.sondas[sonda])) return this.editarMedidor(sonda)
    const g = this.indice.golpe(p, this.tolerancia)
    if (!g) this.ganchos.abrirBuscador(ajustar(p))
    else if (g.tipo === 'pieza') this.editarValor(g.id)
    else if (g.tipo === 'etiqueta') this.editarEtiqueta(g.id)
    else if (g.tipo === 'nota') this.editarNota(g.id)
  }

  /** El puntero salió del lienzo. */
  salir(): void {
    if ((this.hover || this.asaBajoCursor || this.textoBajoCursor || this.asaFiguraBajoCursor) && this.herramienta === 'seleccionar') {
      this.hover = null
      this.asaBajoCursor = null
      this.asaFiguraBajoCursor = null
      this.textoBajoCursor = null
      this.avisar()
    }
  }

  /** Cancela lo que el puntero tenga a medias (pointercancel, lostpointercapture, foco perdido) sin dejar paso. Con
   * `soloPuntero` conserva el cable de clic y clic y el texto: perder el foco no debe tirar lo que no depende del botón. */
  cancelarGesto(opciones: { soloPuntero?: boolean } = {}): void {
    this.arrastreSonda = null
    const pa = this.arrastrePantalla
    if (pa) {
      this.arrastrePantalla = null
      if (pa.movio) this.historial.revertirGrupo()
      this.historial.cerrarGrupo()
    }
    const tx = this.arrastreTexto
    if (tx) {
      this.arrastreTexto = null
      if (tx.movio) this.historial.revertirGrupo()
      this.historial.cerrarGrupo()
    }
    const asa = this.arrastreAsa
    if (asa) {
      this.arrastreAsa = null
      // revertirGrupo avisa al historial, que ya sin el gesto abierto recalcula.
      if (asa.movio) this.historial.revertirGrupo()
      this.historial.cerrarGrupo()
    }
    const af = this.arrastreAsaFigura
    if (af) {
      this.arrastreAsaFigura = null
      if (af.movio) this.historial.revertirGrupo()
      this.historial.cerrarGrupo()
    }
    const a = this.arrastre
    if (a) {
      this.arrastre = null
      this.choque = null
      if (a.movio) this.historial.revertirGrupo()
      this.historial.cerrarGrupo()
      // revertirGrupo avisa al historial, y su suscriptor ya recalcula y sube versionDoc con el arrastre cerrado.
    }
    // A medio dibujo: perder el puntero solo tira la figura en curso; cancelar del todo deja la herramienta.
    if (this.figuraNueva) {
      if (opciones.soloPuntero) {
        this.figuraNueva.inicio = null
        this.figuraNueva.actual = null
      } else this.cancelarFigura()
    }
    this.rect = null
    this.desdePin = null
    if (!opciones.soloPuntero) {
      this.cancelarCable()
      this.textoPendiente?.()
    }
    this.avisar()
  }

  /** Botón derecho: cancela lo pendiente y vuelve a seleccionar. true si había algo; si no, la interfaz abre el menú
   * (`objetivoMenu`). */
  clicDerecho(): boolean {
    if (this.gestoEnCurso) {
      this.cancelarGesto({ soloPuntero: true })
      return true
    }
    const conCable = this.herramienta === 'cablear' && !!this.cable
    const algo = this.cancelarPendiente()
    if (conCable) this.ganchos.alCancelarCable?.()
    if (algo) this.avisar()
    return algo
  }

  /** Lo que hay bajo `p` para el menú del clic derecho (un pin cuenta como su pieza). Deja ahí el cursor y, si no estaba
   * seleccionado, lo selecciona solo, porque las acciones del menú actúan sobre la selección. */
  objetivoMenu(p: Punto): ObjetivoMenu {
    const q = ajustar(p)
    this.cursor = q
    // Sobre la referencia o el valor de una pieza: el menú de su pieza (con «Restablecer posición de los textos»).
    const t = this.textoTomado(p)
    if (t) {
      if (!this.seleccion.piezas.has(t.pieza)) {
        this.seleccion = seleccionDe('piezas', t.pieza)
        this.avisar()
      }
      return { tipo: 'pieza', id: t.pieza, en: p }
    }
    // Sobre la bandera de una sonda: su menú.
    const sonda = this.sondaEn(p)
    if (sonda) {
      if (!this.seleccion.sondas.has(sonda)) {
        this.seleccion = seleccionDe('sondas', sonda)
        this.avisar()
      }
      return { tipo: 'sonda', id: sonda, en: p }
    }
    const g = this.indice.golpe(p, this.tolerancia)
    if (!g) return { tipo: 'vacio', en: q }
    const [col, id]: [Coleccion, Id] = g.tipo === 'pin' ? ['piezas', g.piezaId] : colDeGolpe(g)
    if (!this.seleccion[col].has(id)) {
      this.seleccion = seleccionDe(col, id)
      this.avisar()
    }
    if (g.tipo === 'cable') return { tipo: 'cable', id, en: this.puntoEnCable(g, p) }
    if (col === 'etiquetas') return { tipo: 'etiqueta', id, en: p }
    if (col === 'notas') return { tipo: 'nota', id, en: p }
    if (col === 'figuras') return { tipo: 'figura', id, en: p }
    return { tipo: 'pieza', id, en: p }
  }

  /** Reemplaza la selección (paneles Proyecto e inspector); colocando, cableando o arrastrando no hace nada. */
  seleccionar(s: Seleccion): void {
    if (this.herramienta !== 'seleccionar' || this.gestoEnCurso) return
    this.seleccion = depurar(s, this.doc)
    this.avisar()
  }

  /** Selecciona los cables de la red `red`; false (y no cambia nada) si la red no tiene cables. */
  seleccionarCablesDeRed(red: number): boolean {
    const r = this.con.redes[red]
    if (!r || r.cables.length === 0 || this.herramienta !== 'seleccionar' || this.gestoEnCurso) return false
    const s = seleccionVacia()
    for (const id of r.cables) s.cables.add(id)
    this.seleccion = s
    this.avisar()
    return true
  }

  /** Pin de la pieza más cercano al punto del clic. */
  private pinCercano(o: { id: Id; en: Punto }): { pieza: Pieza; pinId: string; nombre: string } | undefined {
    const p = this.doc.piezas[o.id]
    const def = p ? this.lib.get(p.tipo) : undefined
    if (!p || !def) return undefined
    let mejor: { id: string; d: number } | null = null
    for (const pin of pinesEnMundo(p, def)) {
      const d = Math.hypot(pin.x - o.en.x, pin.y - o.en.y)
      if (!mejor || d < mejor.d) mejor = { id: pin.id, d }
    }
    return mejor ? { pieza: p, pinId: mejor.id, nombre: def.pines.find((x) => x.id === mejor!.id)?.nombre ?? mejor.id } : undefined
  }

  /** Red de un cable, o la del pin de la pieza más cercano al punto del clic. */
  redDe(o: ObjetivoMenu): number | undefined {
    if (o.tipo === 'cable') return this.con.redDeCable.get(o.id)
    if (o.tipo === 'sonda') return this.con.redDeSonda.get(o.id)
    if (o.tipo !== 'pieza') return undefined
    const pin = this.pinCercano(o)
    return pin ? this.con.redDePin.get(clavePin(pin.pieza.id, pin.pinId)) : undefined
  }

  /** «Seleccionar su red» del menú: los cables de la red; si no tiene, se avisa y nada cambia. */
  seleccionarRed(o: ObjetivoMenu): void {
    const red = this.redDe(o)
    if (red === undefined) return
    if (this.con.redes[red]?.cables.length) {
      // Con otra herramienta activa o un arrastre en curso no se hace nada, y tampoco se inventa una causa.
      this.seleccionarCablesDeRed(red)
      return
    }
    const pin = o.tipo === 'pieza' ? this.pinCercano(o) : undefined
    this.ganchos.registrar(pin ? `La red del pin ${pin.nombre} de ${pin.pieza.ref} no tiene cables.` : 'Esa red no tiene cables.')
    this.ganchos.animar({ tipo: 'sacudida', piezas: o.tipo === 'pieza' ? [o.id] : [], cables: o.tipo === 'cable' ? [o.id] : [] })
    this.avisar()
  }

  /** «Derivar desde aquí» del menú: empieza un cable en el punto `en` de un cable, como Alt+clic. */
  derivarDesde(en: Punto): void {
    if (this.herramienta !== 'seleccionar' || this.gestoEnCurso) return
    this.empezarCable(en)
  }

  /** Hay algo copiado: el menú habilita Pegar aquí. */
  get puedePegar(): boolean {
    return this.portapapeles !== null
  }

  /** Segundo clic de un doble clic derecho: cancela lo pendiente y borra lo que esté bajo el cursor (pieza, o cable
   * completo, etiqueta o nota) en un paso, sin importar la selección. */
  dobleClicDerecho(p: Punto): void {
    // A medio gesto el botón derecho lo cancela y revierte, como en un arrastre normal; no borra nada.
    if (this.gestoEnCurso) {
      this.cancelarGesto({ soloPuntero: true })
      return
    }
    const conCable = this.herramienta === 'cablear' && !!this.cable
    const cancelo = this.cancelarPendiente()
    if (conCable) this.ganchos.alCancelarCable?.()
    const g = this.indice.golpe(p, this.tolerancia)
    if (g) {
      const [col, id]: [Coleccion, Id] = g.tipo === 'pin' ? ['piezas', g.piezaId] : colDeGolpe(g)
      this.ejecutar(borrarSeleccion(this.doc, seleccionDe(col, id)))
      this.hover = null
      this.ganchos.alBorrarConClicDerecho?.()
    }
    if (g || cancelo) this.avisar()
  }

  /** Cancela cable, colocación, texto pendiente y rectángulo; true si había algo. No avisa. */
  private cancelarPendiente(): boolean {
    let algo = false
    if (this.rect) {
      this.rect = null
      algo = true
    }
    if (this.herramienta === 'cablear') {
      this.cancelarCable()
      algo = true
    }
    if (this.herramienta === 'colocar') {
      this.terminarColocar()
      algo = true
    }
    if (this.textoPendiente) {
      this.textoPendiente()
      algo = true
    }
    if (this.herramienta === 'figura') {
      this.cancelarFigura()
      algo = true
    }
    return algo
  }

  // ---- Cables ----

  private empezarCable(inicio: Punto): void {
    if (!this.editable()) return
    this.cable = new CableEnCurso(inicio, this.rutear)
    this.choque = null
    this.herramienta = 'cablear'
    this.hover = null
    this.avisar()
  }

  private cancelarCable(): void {
    if (this.cable) this.choque = null
    this.cable = null
    this.desdePin = null
    if (this.herramienta === 'cablear') this.herramienta = 'seleccionar'
    this.hover = null
  }

  /** Radio de atracción al cablear: el del imán o la tolerancia de siempre, sin pasar de media celda. */
  private radioCableado(): number {
    return Math.min(Math.max(this.radioIman, this.tolerancia), ALCANCE_MAX_NODO)
  }

  /** A qué se pega el cable en curso que empezó en `inicio` con el puntero en `p`: un pin y, si no, un cable. */
  private imanDeCable(p: Punto, inicio: Punto) {
    return imanEn(this.indice, this.doc, p, this.radioCableado(), inicio)
  }

  /** Qué hay bajo el puntero para cablear o resaltar: un pin a menos del radio del imán gana si el puntero está en el
   * vacío o fuera del cuerpo de una pieza. Un cable o texto tocado no cede ante un pin; una figura sí (es dibujo). */
  private golpeConIman(p: Punto): Golpe | null {
    const sonda = this.sondaEn(p)
    if (sonda) return { tipo: 'sonda', id: sonda }
    const g = this.indice.golpe(p, this.tolerancia)
    if (g && g.tipo !== 'pieza' && g.tipo !== 'figura') return g
    if (g?.tipo === 'pieza') {
      const pz = this.doc.piezas[g.id]
      const c = pz ? cuerpoEnMundo(pz, this.lib.get(pz.tipo)) : null
      if (c && p.x >= c.minX && p.x <= c.maxX && p.y >= c.minY && p.y <= c.maxY) return g
    }
    const pin = this.indice.pinMasCercano(p, this.radioCableado())
    return pin ? { tipo: 'pin', piezaId: pin.piezaId, pinId: pin.pinId, x: pin.x, y: pin.y } : g
  }

  private puntoEnCable(g: { id: Id; tramo: number }, p: Punto): Punto {
    const c = this.doc.cables[g.id]
    return proyectarEnTramo(p, c.puntos[g.tramo], c.puntos[g.tramo + 1])
  }

  private clicCableando(p: Punto): void {
    const c = this.cable
    if (!c) return
    const g = this.imanDeCable(p, c.inicio)
    if (g) {
      this.terminarCable({ x: g.x, y: g.y })
      return
    }
    this.fijarEsquina(ajustar(p))
  }

  /** Un clic (o soltar) en el vacío deja una esquina fija ahí, salvo que el tramo hasta ella cruce una pieza u otra red. */
  private fijarEsquina(q: Punto): void {
    const c = this.cable
    if (!c) return
    c.mover(q)
    this.choque = this.choqueDeCable()
    if (this.choque) this.rechazarCable('esquina')
    else c.fijarEsquina()
    this.avisar()
  }

  private rechazarCable(que: 'cable' | 'esquina' = 'cable', motivo?: string): void {
    this.ganchos.animar({ tipo: 'sacudida', piezas: [], cables: [ID_CABLE_EN_CURSO] })
    const sujeto = que === 'cable' ? 'El cable no se trazó' : 'La esquina no se fijó'
    const c = this.choque
    this.ganchos.registrar(motivo ? `${sujeto}: ${motivo}.` : !c ? `${sujeto}.` : c.col === 'cables' ? `${sujeto}: correría encima de un cable de otra red.` : `${sujeto}: atravesaría ${c.ref}.`)
  }

  /** Referencia de la única pieza seleccionada; null si son varias o ninguna. */
  private sujetoUnico(): string | null {
    const [id] = this.seleccion.piezas
    return this.seleccion.piezas.size === 1 ? (this.doc.piezas[id]?.ref ?? null) : null
  }

  /** Redes de lo que hay en `p`: pines y cables que pasan por ahí. */
  private redesEn(p: Punto): Set<number | undefined> {
    const out = new Set<number | undefined>()
    for (const pin of this.indice.pinesEn(p.x, p.y)) out.add(this.con.redDePin.get(`${pin.piezaId}:${pin.pinId}`))
    for (const it of this.indice.buscar({ minX: p.x, minY: p.y, maxX: p.x, maxY: p.y }))
      if (it.col === 'cables' && this.doc.cables[it.id] && pasaPor(this.doc.cables[it.id], p)) out.add(this.con.redDeCable.get(it.id))
    out.delete(undefined)
    return out
  }

  /** El cable en curso cruza una pieza o corre encima de un cable de otra red que la de sus extremos. */
  private choqueDeCable(): Choque | null {
    const pts = this.cable?.vista()
    if (!pts || pts.length < 2) return null
    const p = piezaCruzada(this.doc, this.lib, pts, this.indice)
    if (p) return this.choqueCon(p)
    const propias = new Set([...this.redesEn(pts[0]), ...this.redesEn(pts[pts.length - 1])])
    return this.choqueCon(cableEncimado(this.doc, pts, (id) => propias.has(this.con.redDeCable.get(id)), this.indice))
  }

  /** Fin de un arrastre desde un pin: sobre otro pin o cable termina el cable (un paso); en el vacío la punta queda como
   * esquina fija y el cableado sigue por clics. */
  private soltarCable(p: Punto, inicio: Punto): void {
    const c = this.cable
    if (!c) return
    const g = this.imanDeCable(p, inicio)
    if (g) {
      this.terminarCable({ x: g.x, y: g.y })
      return
    }
    const q = ajustar(p)
    if (!iguales(q, inicio)) this.fijarEsquina(q)
    else this.avisar()
  }

  /** Único cable que termina justo en `p` sin pin, etiqueta ni otro cable ahí: el nuevo lo continúa. */
  private cableQueContinua(p: Punto, descartados: Set<Id>): Cable | null {
    if (this.indice.pinesEn(p.x, p.y).length) return null
    if (Object.values(this.doc.etiquetas).some((e) => e.x === p.x && e.y === p.y)) return null
    const ids = new Set(this.indice.buscar({ minX: p.x, minY: p.y, maxX: p.x, maxY: p.y }).filter((it) => it.col === 'cables').map((it) => it.id))
    let hallado: Cable | null = null
    for (const id of ids) {
      const c = this.doc.cables[id]
      if (!c || descartados.has(id) || c.puntos.length < 2) continue
      const toca = iguales(c.puntos[0], p) || iguales(c.puntos[c.puntos.length - 1], p)
      if (!toca) {
        if (pasaPor(c, p)) return null
        continue
      }
      if (hallado) return null
      hallado = c
    }
    return hallado
  }

  private terminarCable(en: Punto): void {
    const c = this.cable
    if (!c) return
    let puntos = c.terminar(en)
    if (puntos.length >= 2) {
      // Una ruta que cruza una pieza u otra red no se acepta: el cable sigue en curso, en rojo.
      this.choque = this.choqueDeCable()
      if (this.choque) {
        this.rechazarCable()
        this.avisar()
        return
      }
      const cmds: Comando[] = []
      const descartados = new Set<Id>()
      for (const extremo of [puntos[0], puntos[puntos.length - 1]]) {
        const otro = this.cableQueContinua(extremo, descartados)
        const unido = otro ? juntarCables(otro.puntos, puntos) : null
        if (otro && unido) {
          puntos = unido
          descartados.add(otro.id)
          cmds.push(borrar('cablear', 'cables', otro))
        }
      }
      if (puntos.length >= 2) cmds.push(crear('cablear', 'cables', nuevoCable(puntos, this.gen)))
      const cmd = juntar('cablear', cmds)
      const extra = partirEnUniones(aplicar(this.doc, cmd), this.gen)
      const total = extra ? fusionar(cmd, extra) : cmd
      const despues = aplicar(this.doc, total)
      // El cable nuevo puede quedar fundido con otro o partido en uniones: cuentan (y brillan) los cables que no existían.
      const nuevos = Object.keys(despues.cables).filter((id) => !(id in this.doc.cables))
      const conflicto = conflictoDeTocados(despues, this.lib, { cables: nuevos })
      if (conflicto) {
        this.choque = this.choqueCon(conflicto.con)
        this.rechazarCable()
        this.avisar()
        return
      }
      // Fuera del área de dibujo se rechaza antes de cancelar el cable en curso, como un choque.
      if (!comandoDentroDelMundo(total)) {
        this.rechazarCable('cable', MOTIVO_FUERA_DEL_MUNDO)
        this.avisar()
        return
      }
      this.cancelarCable()
      this.ejecutar(total)
      if (nuevos.length) this.ganchos.animar({ tipo: 'brillo', cables: nuevos })
    } else this.cancelarCable()
    this.avisar()
  }

  /** Retroceso: quita la última esquina del cable; fuera del cableado borra la selección (macOS no tiene Supr). */
  retroceso(): void {
    if (this.gestoEnCurso) return
    if (this.herramienta === 'cablear' && this.cable) {
      if (!this.cable.quitarEsquina()) this.cancelarCable()
      else this.choque = this.choqueDeCable()
      this.avisar()
    } else this.borrar()
  }

  invertirL(): void {
    if (!this.cable) return
    this.cable.invertir()
    this.choque = this.choqueDeCable()
    this.avisar()
  }

  // ---- Colocar ----

  empezarColocar(defId: string, valor?: string, en: Punto = this.cursor): void {
    const def = this.lib.get(defId)
    if (!def || !this.editable()) return
    this.cerrarArrastre()
    this.cancelarCable()
    this.figuraNueva = null
    const q = ajustar(en)
    this.cursor = q
    this.herramienta = 'colocar'
    this.valorColocar = valor
    this.fantasma = nuevaPieza(this.doc, def, q, 0, false, () => ID_FANTASMA, valor)
    this.revisarFantasma()
    this.avisar()
  }

  /** Una plantilla queda pegada al ratón para colocarla con un clic, sin encimarse, con referencias renumeradas y un solo
   * paso de deshacer (el camino de pegar). */
  empezarColocarFragmento(f: Fragmento, en: Punto = this.cursor): boolean {
    if (!this.editable() || (f.piezas.length === 0 && f.cables.length === 0 && f.etiquetas.length === 0 && f.notas.length === 0 && f.figuras.length === 0)) return false
    this.cerrarArrastre()
    this.cancelarCable()
    this.figuraNueva = null
    this.cursor = ajustar(en)
    this.herramienta = 'colocar'
    this.fantasma = null
    this.fragmentoColocar = f
    this.revisarFragmento()
    this.avisar()
    return true
  }

  /** La plantilla en el cursor choca si ahí se encimaría o un cable cruzaría una pieza (no se corre sola, como al pegar). */
  private revisarFragmento(): void {
    const f = this.fragmentoColocar
    if (!f) {
      this.choque = null
      return
    }
    const l = lugarParaPegar(this.doc, this.lib, f.piezas, f.cables, this.cursor, this.indice, 0)
    this.choque = l.libre ? null : { con: 'plantilla', col: 'piezas', ref: 'otro elemento' }
  }

  /** Mueve el fantasma de colocación `dx`, `dy` unidades (flechas): revisa si se encima y avisa. */
  moverFantasma(dx: number, dy: number): void {
    if (this.herramienta === 'colocar' && this.fragmentoColocar) {
      this.cursor = ajustar({ x: this.cursor.x + dx, y: this.cursor.y + dy })
      this.revisarFragmento()
      this.avisar()
      return
    }
    const f = this.fantasma
    if (this.herramienta !== 'colocar' || !f) return
    const q = ajustar({ x: f.x + dx, y: f.y + dy })
    this.cursor = q
    this.fantasma = { ...f, x: q.x, y: q.y }
    this.revisarFantasma()
    this.avisar()
  }

  /** Enter o Espacio colocando: lo mismo que un clic sobre el fantasma (`seguir` como Shift+clic). El Registro dice lo
   * colocado o por qué se rechazó. */
  colocarConTeclado(seguir = false): void {
    if (this.herramienta === 'colocar' && this.fragmentoColocar) {
      const p = this.cursor
      this.abajo(p, { shift: seguir })
      this.arriba(p, { shift: seguir })
      return
    }
    const f = this.fantasma
    if (this.herramienta !== 'colocar' || !f) return
    const antes = new Set(Object.keys(this.doc.piezas))
    const p = { x: f.x, y: f.y }
    this.abajo(p, { shift: seguir })
    this.arriba(p, { shift: seguir })
    const nueva = Object.values(this.doc.piezas).find((q) => !antes.has(q.id))
    if (nueva) this.ganchos.registrar(`Se colocó ${nueva.ref}.`)
  }

  private terminarColocar(): void {
    this.fantasma = null
    this.fragmentoColocar = null
    this.choque = null
    this.herramienta = 'seleccionar'
  }

  private choqueCon(id: Id | null): Choque | null {
    if (!id) return null
    const pieza = this.doc.piezas[id]
    if (pieza) return { con: id, col: 'piezas', ref: pieza.ref }
    return this.doc.cables[id] ? { con: id, col: 'cables', ref: 'un cable' } : { con: id, col: 'piezas', ref: 'otro elemento' }
  }

  private revisarFantasma(): void {
    const f = this.fantasma
    if (!f) {
      this.choque = null
      return
    }
    this.choque = this.choqueCon(colisiona(this.doc, this.lib, f, undefined, this.indice) ?? this.cableBajoFantasma(f))
  }

  /** Cable que atravesaría el cuerpo del fantasma, salvo que al colocarlo quede en serie con él. */
  private cableBajoFantasma(f: Pieza): Id | null {
    const w = cableEnCuerpo(this.doc, this.lib, f, this.indice)
    if (!w) return null
    const ins = insertarEnCable(this.doc, this.lib, f, idsDePrueba())
    return ins ? cableEnCuerpo(aplicar(this.doc, ins), this.lib, f) : w
  }

  /** Choque de lo arrastrado con las piezas quietas. El índice no se reconstruye durante el gesto: las cajas de lo que no
   * se mueve siguen exactas y lo movido se ignora. */
  private choqueDeArrastre(): Choque | null {
    const sel = this.seleccion
    const plan = this.arrastre?.plan
    // Los cables estirados se vuelven a enrutar al soltar; los seleccionados se revisan aparte.
    const aparte = new Set<Id>([...(plan?.estirados.map((e) => e.cable.id) ?? []), ...sel.cables])
    const movidas = [...sel.piezas].map((id) => this.doc.piezas[id]).filter(Boolean)
    const pieza = choqueDeGrupo(this.doc, this.lib, movidas, sel.piezas, this.indice)
    if (pieza) return this.choqueCon(pieza.con)
    for (const p of movidas) {
      const ignorar = (id: Id) => aparte.has(id)
      if (!cableEnCuerpo(this.doc, this.lib, p, this.indice, ignorar)) continue
      // Alineada sobre un cable, al soltarla queda en serie y ya no lo cruza.
      const ins = insertarEnCable(this.doc, this.lib, p, idsDePrueba(), sel.cables)
      const sigue = ins ? cableEnCuerpo(aplicar(this.doc, ins), this.lib, p, undefined, ignorar) : cableEnCuerpo(this.doc, this.lib, p, this.indice, ignorar)
      if (sigue) return this.choqueCon(sigue)
    }
    for (const id of sel.cables) {
      const c = this.doc.cables[id]
      const p = c ? piezaCruzada(this.doc, this.lib, c.puntos, this.indice, sel.piezas) : null
      if (p) return this.choqueCon(p)
    }
    return null
  }

  /** Coloca el fantasma; false si no se pudo (fuera del área de dibujo: se sacude y el Registro lo dice). */
  private colocarFantasma(): boolean {
    const f = this.fantasma
    const def = f ? this.lib.get(f.tipo) : undefined
    if (!f || !def) return false
    if (!coordenadaValida(f.x, f.y)) {
      this.ganchos.animar({ tipo: 'sacudida', piezas: [ID_FANTASMA] })
      this.ganchos.registrar(`No se colocó ${f.ref}: ${MOTIVO_FUERA_DEL_MUNDO}.`)
      return false
    }
    const nueva = nuevaPieza(this.doc, def, { x: f.x, y: f.y }, f.rot, f.espejo, this.gen, this.valorColocar)
    const alta = crear('colocar', 'piezas', nueva)
    // Sobre un cable, una pieza de dos pines lo parte y queda en serie, en el mismo paso.
    const ins = insertarEnCable(this.doc, this.lib, nueva, this.gen)
    this.ejecutarNormalizado(ins ? juntar('colocar', [alta, ins]) : alta)
    this.ganchos.animar({ tipo: 'pulso', caja: cuerpoEnMundo(nueva, def, AIRE_PULSO) })
    return true
  }

  colocarTierra(): void {
    if (this.gestoEnCurso || ['cablear', 'etiqueta', 'nota', 'figura'].includes(this.herramienta)) return
    this.empezarColocar('tierra', undefined, this.cursor)
  }

  colocarEtiqueta(): void {
    if (this.herramienta !== 'seleccionar' || this.gestoEnCurso || !this.editable()) return
    const en = this.cursor
    this.herramienta = 'etiqueta'
    this.avisar()
    const cancelar = () => {
      this.textoPendiente = null
      this.herramienta = 'seleccionar'
      this.avisar()
    }
    this.textoPendiente = cancelar
    this.ganchos.editarTexto({
      tipo: 'etiqueta',
      en,
      inicial: '',
      multilinea: false,
      aceptar: (t) => {
        if (!limpiarTexto(t).trim()) return 'Escribe el nombre de la red.'
        // Sobre un cable, en un tramo corto perpendicular: no se encima con él. Tramo y etiqueta, un paso de deshacer.
        const plan = planDeEtiqueta(this.doc, this.lib, en, limpiarTexto(t).trim())
        const e = { ...nuevaEtiqueta(limpiarTexto(t), plan.etiqueta, this.gen), rot: plan.etiqueta.rot }
        this.textoPendiente = null
        this.herramienta = 'seleccionar'
        if (plan.cable) this.ejecutarNormalizado(juntar('etiqueta', [crear('etiqueta', 'cables', nuevoCable(plan.cable, this.gen)), crear('etiqueta', 'etiquetas', e)]))
        else this.ejecutar(crear('etiqueta', 'etiquetas', e))
        this.seleccion = seleccionDe('etiquetas', e.id)
        this.avisar()
        return null
      },
      cancelar
    })
  }

  colocarNota(): void {
    if (this.herramienta !== 'seleccionar' || this.gestoEnCurso || !this.editable()) return
    const en = this.cursor
    this.herramienta = 'nota'
    this.avisar()
    const cancelar = () => {
      this.textoPendiente = null
      this.herramienta = 'seleccionar'
      this.avisar()
    }
    this.textoPendiente = cancelar
    this.ganchos.editarTexto({
      tipo: 'nota',
      en,
      inicial: '',
      multilinea: true,
      aceptar: (t) => {
        const texto = limpiarTexto(t).replace(/\s+$/, '')
        if (!texto.trim()) return 'Escribe el texto de la nota.'
        const n = nuevaNota(texto, en, this.gen)
        this.textoPendiente = null
        this.herramienta = 'seleccionar'
        this.ejecutar(crear('nota', 'notas', n))
        this.seleccion = seleccionDe('notas', n.id)
        this.avisar()
        return null
      },
      cancelar
    })
  }

  // ---- Figuras ----

  /** Herramienta Figura: arrastrar dibuja una figura de `tipo` (Shift: cuadrado, círculo o 45°) y al soltar vuelve la
   * selección. No empieza simulando ni en solo lectura (el Registro dice por qué). */
  empezarFigura(tipo: TipoFigura): void {
    if (this.gestoEnCurso || this.textoPendiente || !this.editable()) return
    if (this.herramienta === 'colocar') this.terminarColocar()
    else if (this.herramienta === 'cablear') this.cancelarCable()
    else if (this.herramienta !== 'seleccionar' && this.herramienta !== 'figura') return
    this.rect = null
    this.hover = null
    this.herramienta = 'figura'
    this.figuraNueva = { tipo, inicio: null, actual: null }
    this.avisar()
  }

  private cancelarFigura(): void {
    this.figuraNueva = null
    if (this.herramienta === 'figura') this.herramienta = 'seleccionar'
  }

  /** Suelta la figura en curso: con tamaño entra al documento (al frente de las demás) y queda elegida; un clic no dibuja. */
  private terminarFigura(p: Punto, restringir: boolean): void {
    const n = this.figuraNueva
    if (!n?.inicio) return
    const f = figuraDeArrastre(n.tipo, n.inicio, fino(p), restringir)
    n.inicio = null
    n.actual = null
    // Un clic sin arrastre no dibuja nada: la herramienta sigue para el siguiente intento.
    if (!tieneTamaño(f)) return
    const alFrente = ordenesAlFrente(this.doc, 1)
    const nueva: Figura = { ...f, id: this.gen('f'), orden: alFrente.primero }
    this.cancelarFigura()
    const fs = figurasDe(this.doc)
    const cmd = juntar('figura', [...alFrente.renumeradas.map((r) => modificar('figura', 'figuras', fs[r.id], r)), crear('figura', 'figuras', nueva)])
    if (!comandoDentroDelMundo(cmd)) {
      this.ganchos.registrar(`No se dibujó la figura: ${MOTIVO_FUERA_DEL_MUNDO}.`)
      return
    }
    this.ejecutar(cmd)
    if (figurasDe(this.doc)[nueva.id]) this.seleccion = seleccionDe('figuras', nueva.id)
  }

  /** Asa bajo `p`: solo con una sola figura seleccionada y nada más, con la herramienta de selección y sin la vista previa. */
  asaFiguraEn(p: Punto): { figura: Id; asa: AsaFigura } | null {
    const s = this.seleccion
    if (this.herramienta !== 'seleccionar' || this.simulando || this.soloLectura || s.figuras.size !== 1 || tamañoSeleccion(s) !== 1) return null
    const [id] = s.figuras
    const f = figurasDe(this.doc)[id]
    if (!f) return null
    const tol = Math.max(this.tolerancia, RADIO_ASA)
    const a = asasDeFigura(f).find((q) => Math.abs(q.x - p.x) <= tol && Math.abs(q.y - p.y) <= tol)
    return a ? { figura: id, asa: a.asa } : null
  }

  private moverAsaDeFigura(p: Punto, restringir: boolean): void {
    const a = this.arrastreAsaFigura!
    const actual = figurasDe(this.doc)[a.figura]
    const nueva = actual ? moverAsaFigura(a.original, a.asa, fino(p), restringir) : null
    if (!actual || !nueva || (nueva.x1 === actual.x1 && nueva.y1 === actual.y1 && nueva.x2 === actual.x2 && nueva.y2 === actual.y2)) return
    a.movio = true
    this.ejecutar(modificar('tamaño', 'figuras', actual, nueva, a.grupo))
  }

  private soltarAsaFigura(): boolean {
    const a = this.arrastreAsaFigura
    if (!a) return false
    this.arrastreAsaFigura = null
    this.historial.cerrarGrupo()
    if (a.movio) this.recalcular()
    return true
  }

  private figurasElegidas(): Figura[] {
    const fs = figurasDe(this.doc)
    return [...this.seleccion.figuras].map((id) => fs[id]).filter((f): f is Figura => !!f)
  }

  /** Tinta, grosor, trazo, relleno o punta de las figuras seleccionadas, en un paso de deshacer. false si nada cambió. */
  cambiarFigura(cambio: Partial<EstiloFigura>): boolean {
    if (this.gestoEnCurso || this.seleccion.figuras.size === 0 || !this.editable()) return false
    const cmds = this.figurasElegidas()
      .map((f) => [f, conEstilo(f, cambio)] as const)
      .filter(([a, b]) => JSON.stringify(a) !== JSON.stringify(b))
      .map(([a, b]) => modificar('estilo', 'figuras', a, b))
    if (cmds.length === 0) return false
    this.ejecutar(juntar('estilo de figura', cmds))
    this.avisar()
    return true
  }

  /** El ancho o el alto (en mm) de la figura seleccionada, si es un rectángulo o una elipse; devuelve el error o null. */
  cambiarMedidaFigura(medida: 'ancho' | 'alto', texto: string): string | null {
    const [f] = this.figurasElegidas()
    if (!f || this.seleccion.figuras.size !== 1 || !conCaja(f.tipo) || this.gestoEnCurso) return null
    if (!this.editable()) return this.simulando ? MENSAJE_SIMULANDO : MENSAJE_SOLO_LECTURA
    const r = leerMedida(texto)
    if ('error' in r) return r.error
    const nueva = conMedida(f, medida, r.unidades)
    if (nueva !== f) {
      const cmd = modificar('tamaño', 'figuras', f, nueva)
      if (!comandoDentroDelMundo(cmd)) {
        this.ganchos.registrar(`No se cambió el tamaño de la figura: ${MOTIVO_FUERA_DEL_MUNDO}.`)
        return `Quedaría fuera del área de dibujo.`
      }
      this.ejecutar(cmd)
    }
    this.avisar()
    return null
  }

  /** «Al fondo» cambiaría algo: hay figuras seleccionadas y alguna otra queda detrás de ellas. */
  puedeLlevarAlFondo(): boolean {
    return this.seleccion.figuras.size > 0 && alFondo(Object.values(figurasDe(this.doc)), this.seleccion.figuras).length > 0
  }

  /** Las figuras seleccionadas detrás de las demás figuras, en un paso de deshacer (siguen detrás de piezas y cables). */
  figurasAlFondo(): void {
    if (this.gestoEnCurso || this.seleccion.figuras.size === 0 || !this.editable()) return
    const fs = figurasDe(this.doc)
    const nuevas = alFondo(Object.values(fs), this.seleccion.figuras)
    if (nuevas.length === 0) return
    this.ejecutar(juntar('al fondo', nuevas.map((n) => modificar('al fondo', 'figuras', fs[n.id], n))))
    this.avisar()
  }

  // ---- Edición en el lugar ----

  /** Doble clic en una pieza: edita referencia y valor o, en un terminal de alimentación, nombre y voltaje del riel (la
   * tierra no abre nada). Simulando solo cambia lo editable en caliente; referencia y nombre quedan fijos con su motivo. */
  editarValor(id: Id, enfocar?: CualTexto): void {
    const p = this.doc.piezas[id]
    const def = p ? this.lib.get(p.tipo) : undefined
    if (!p || !def || def.modelo?.tipo === 'tierra') return
    if (def.modelo?.tipo === 'alimentacion') return this.editarTerminal(id, def)
    const v = valorEditable(p, def)
    const enCaliente = !!v && editableEnCaliente(def, v.prop.id)
    if (this.soloLectura || (this.simulando && !enCaliente)) return void this.editable()
    const campos: CampoPedido[] = [{ id: 'ref', titulo: 'Referencia', inicial: p.ref }]
    if (v)
      campos.push({
        id: 'valor',
        titulo: v.prop.id === 'frecuencia' && def.modelo?.tipo === 'generador' ? 'Frecuencia (Hz)' : 'Valor',
        inicial: v.texto,
        ...(v.prop.unidad ? { unidad: v.prop.unidad } : {}),
        ...(v.prop.serie ? { serie: v.prop.serie } : {}),
        ...(v.prop.catalogo && v.prop.comunes ? { catalogo: v.prop.comunes } : comunesDeLaFicha(v.prop) && !v.prop.serie ? { comunes: v.prop.comunes } : {})
      })
    // El generador agrega los campos de su onda: el periodo, la amplitud, el mínimo y el máximo...
    if (v && def.modelo?.tipo === 'generador') for (const c of camposDeGenerador(p, def)) campos.push({ id: `num:${c.clave}`, titulo: c.titulo, inicial: c.inicial })
    // La fuente de pulso: la frecuencia junto al voltaje; el periodo y los tiempos después del ciclo de trabajo.
    const pulso = def.modelo?.tipo === 'pulso' ? def.modelo : null
    const textoDe = (k: string) => p.props[k] ?? def.props.find((d) => d.id === k)?.defecto ?? ''
    const numPulso = (clave: string, titulo: string, inicial: string, unidad: string): CampoPedido => ({ id: `num:${clave}`, titulo, inicial, unidad })
    if (v && pulso) campos.push(numPulso('frecuencia', 'Frecuencia', textoDe(pulso.frecuencia), 'Hz'))
    // Las propiedades de lista, salvo la posición de un potenciómetro, que tiene su control. De una
    // pieza digital, solo las alimentaciones que admite su familia (como en el inspector).
    const m = def.modelo
    for (const d of def.props) {
      if (!d.opciones || (m?.tipo === 'pot' && d.id === m.posicion)) continue
      const inicial = p.props[d.id] ?? d.defecto
      let opciones = d.opciones
      if (esModeloDigital(m) && d.id === m.alimentacion) {
        const validas = alimentacionesDeFamilia(opciones, p.props[m.familia] ?? def.props.find((x) => x.id === m.familia)?.defecto ?? '')
        opciones = validas.includes(inicial) ? validas : [...validas, inicial]
      } else if (!opciones.includes(inicial)) opciones = [inicial, ...opciones]
      const muestras = muestrasDeOpciones(def, d.id)
      const tabla = d === propModelo(def) ? columnasDeModelos(def) : null
      campos.push({ id: `prop:${d.id}`, titulo: d.nombre, inicial, opciones, ...(muestras ? { muestras } : {}), ...(tabla ? { tabla } : {}) })
    }
    if (v && pulso) {
      const f = leerValor(textoDe(pulso.frecuencia))
      campos.push(numPulso('periodo', 'Periodo', f && f.valor > 0 ? textoDeNumero(1 / f.valor, 6) : '', 's'))
      for (const k of ['ancho', 'subida', 'bajada', 'retardo'] as const) {
        const id = pulso[k]
        if (id) campos.push(numPulso(k, def.props.find((d) => d.id === id)?.nombre ?? k, textoDe(id), 's'))
      }
    }
    // Modelo «Personalizado» de un transistor, un MOSFET o un amplificador: sus parámetros de SPICE en lugar del modelo.
    const familia = familiaSpice(m)
    const iSpice = familia ? campos.length : -1
    if (familia) campos.push({ id: 'spice', titulo: 'Personalizado', inicial: textoSpiceDe(p, def), personalizado: { familia, base: textoBaseSpice(p, def) } })
    const iValor = campos.findIndex((c) => c.id === 'valor')
    this.ganchos.editarTexto({
      tipo: 'pieza',
      en: { x: p.x, y: p.y },
      ...(modeloDe(def) ? { encabezado: nombreConModelo(def, p.props[propModelo(def)!.id]) } : {}),
      nombre: def.nombre.es,
      campos,
      // Con doble clic sobre la referencia, el foco va a ella; si no, al valor (o a la referencia si no hay valor).
      foco: enfocar === 'ref' || iValor < 0 ? 0 : iValor,
      revisar: (vals) => {
        const actual = this.doc.piezas[id] ?? p
        const ref: RevisionCampo = {}
        if (this.simulando) ref.fijo = { texto: actual.ref, motivo: MOTIVO_REFERENCIA_SIMULANDO }
        else {
          const e = errorDeReferencia(this.doc, id, limpiarTexto(vals[0] ?? ''))
          if (e) ref.error = e
        }
        // Simulando, una lista queda fija salvo que cambie en caliente (el ciclo de trabajo de una fuente de pulsos).
        const fija = (c: CampoPedido) => this.simulando && !!c.opciones && !editableEnCaliente(def, c.id.slice(5))
        return campos.map((c, i): RevisionCampo => {
          if (i === 0) return ref
          if (i === iSpice && familia) {
            if (this.simulando) return { fijo: { texto: textoSpiceDe(actual, def), motivo: MOTIVO_LISTA_SIMULANDO } }
            const r = spiceDeTexto(vals[i] ?? '', familia)
            return r.ok ? {} : { error: r.error }
          }
          return fija(c) ? { fijo: { texto: actual.props[c.id.slice(5)] ?? c.inicial, motivo: MOTIVO_LISTA_SIMULANDO } } : {}
        })
      },
      aceptar: (vals) => {
        const actual = this.doc.piezas[id]
        if (!actual) return null
        // El generador: de lo escrito a las propiedades que cambian (la frecuencia gana al periodo, la amplitud al mínimo y al máximo).
        const esGenerador = m?.tipo === 'generador' && !!v
        let cambiosGen: Record<string, string> = {}
        if (esGenerador) {
          const ini: Record<string, string> = { frecuencia: v!.texto }
          const nuevos: Record<string, string> = { frecuencia: vals[iValor] ?? '' }
          for (const [i, c] of campos.entries()) {
            if (!c.id.startsWith('num:')) continue
            ini[c.id.slice(4)] = c.inicial
            nuevos[c.id.slice(4)] = vals[i] ?? c.inicial
          }
          const r = resolverCamposGenerador(ini, nuevos)
          if (!r.ok) return { campo: r.clave === 'frecuencia' ? iValor : Math.max(0, campos.findIndex((c) => c.id === `num:${r.clave}`)), error: r.error }
          cambiosGen = r.cambios
        }
        // La fuente de pulso: el periodo escribe la frecuencia (la frecuencia escrita gana); lo que no cambia de su texto no se toca.
        const cambiosPulso: Record<string, string> = {}
        if (pulso && v) {
          const nuevo = (k: string) => vals[campos.findIndex((c) => c.id === `num:${k}`)] ?? ''
          const inicial = (k: string) => campos.find((c) => c.id === `num:${k}`)?.inicial ?? ''
          const cambia = (k: string) => nuevo(k) !== inicial(k)
          if (cambia('frecuencia')) cambiosPulso[pulso.frecuencia] = nuevo('frecuencia')
          else if (cambia('periodo')) {
            const t = leerValor(nuevo('periodo'))
            if (!t || !(t.valor > 0)) return { campo: campos.findIndex((c) => c.id === 'num:periodo'), error: 'El periodo debe ser un número mayor que cero.' }
            cambiosPulso[pulso.frecuencia] = textoDeNumero(1 / t.valor, 6)
          }
          for (const k of ['ancho', 'subida', 'bajada', 'retardo'] as const) if (pulso[k] && cambia(k)) cambiosPulso[pulso[k]!] = nuevo(k)
        }
        const campoDe = (prop: string) => {
          const clave = pulso && prop === pulso.frecuencia ? (campos.find((c) => c.id === 'num:periodo' && vals[campos.indexOf(c)] !== c.inicial) ? 'periodo' : 'frecuencia') : (['ancho', 'subida', 'bajada', 'retardo'] as const).find((k) => pulso?.[k] === prop)
          return Math.max(0, campos.findIndex((c) => c.id === `num:${clave}`))
        }
        // Simulando, solo el valor y por el camino de siempre (`cambiarPropiedad`): cambia en caliente o dice por qué no.
        if (this.simulando && esGenerador) {
          const todo = { ...cambiosGen }
          for (const [i, c] of campos.entries()) if (c.opciones && (vals[i] ?? c.inicial) !== c.inicial) todo[c.id.slice(5)] = vals[i]
          const e = this.cambiarAjustesInstrumento(id, todo)
          return e ? { campo: iValor, error: e } : null
        }
        if (this.simulando) {
          const e = v ? this.cambiarPropiedad(id, v.prop.id, vals[iValor] ?? '') : null
          if (e) return { campo: iValor, error: e }
          for (const [k, t] of Object.entries(cambiosPulso)) {
            const ep = this.cambiarPropiedad(id, k, t)
            if (ep) return { campo: campoDe(k), error: ep }
          }
          for (const [i, c] of campos.entries()) {
            const prop = c.id.slice(5)
            if (!c.opciones || !editableEnCaliente(def, prop)) continue
            const el = this.cambiarPropiedad(id, prop, vals[i] ?? c.inicial)
            if (el) return { campo: i, error: el }
          }
          return null
        }
        const ref = limpiarTexto(vals[0] ?? '').trim()
        const e = errorDeReferencia(this.doc, id, ref)
        if (e) return { campo: 0, error: e }
        let nueva: Pieza = { ...actual, ref }
        let cambioValor = false
        let cambioAjustes = false
        if (esGenerador) {
          for (const [k, t] of Object.entries(cambiosGen)) {
            const r = cambiarProp(nueva, def, k, t)
            if ('error' in r) return { campo: k === 'frecuencia' ? iValor : Math.max(0, campos.findIndex((c) => c.id === `num:${k}`)), error: r.error }
            nueva = r.pieza
          }
          cambioValor = 'frecuencia' in cambiosGen
          cambioAjustes = Object.keys(cambiosGen).some((k) => k !== 'frecuencia')
        } else if (v) {
          const r = cambiarProp(nueva, def, v.prop.id, vals[iValor] ?? '')
          if ('error' in r) return { campo: iValor, error: r.error }
          nueva = r.pieza
          cambioValor = nueva.props[v.prop.id] !== (actual.props[v.prop.id] ?? v.prop.defecto)
          if (!cambioValor) nueva = { ...nueva, props: actual.props }
          for (const [k, t] of Object.entries(cambiosPulso)) {
            const r2 = cambiarProp(nueva, def, k, t)
            if ('error' in r2) return { campo: campoDe(k), error: r2.error }
            nueva = r2.pieza
            cambioAjustes = true
          }
        }
        // Las listas: solo se escribe la que cambió (una que se queda en su opción no se agrega al documento).
        const cambiadas: string[] = []
        for (const [i, c] of campos.entries()) {
          if (!c.opciones) continue
          const prop = c.id.slice(5)
          const texto = vals[i] ?? c.inicial
          if (texto === (actual.props[prop] ?? def.props.find((d) => d.id === prop)?.defecto)) continue
          const r = cambiarProp(nueva, def, prop, texto)
          if ('error' in r) return { campo: i, error: r.error }
          nueva = r.pieza
          cambiadas.push(c.titulo.toLowerCase())
        }
        // Otra familia puede no admitir la alimentación: pasa a la más cercana, como en el inspector, y el Registro lo dice.
        if (esModeloDigital(m) && nueva.props[m.familia] !== actual.props[m.familia]) {
          const ajuste = alimentacionAlCambiarFamilia(nueva, def, m, nueva.props[m.familia])
          if (ajuste) {
            nueva = { ...nueva, props: { ...nueva.props, [m.alimentacion]: ajuste.alimentacion } }
            this.ganchos.registrar(ajuste.aviso)
          }
        }
        // Modelo propio de SPICE: un cambio en el campo «Personalizado» (activarlo, editarlo o quitarlo) va en el mismo paso.
        let cambioSpice = false
        if (iSpice >= 0 && familia) {
          const r = spiceDeTexto(vals[iSpice] ?? '', familia)
          if (!r.ok) return { campo: iSpice, error: r.error }
          if (JSON.stringify(r.spice) !== JSON.stringify(spiceVigente(actual))) {
            nueva = conSpice(nueva, r.spice)
            cambioSpice = true
          }
        }
        const cambioRef = nueva.ref !== actual.ref
        if (!cambioRef && !cambioValor && !cambioAjustes && !cambioSpice && cambiadas.length === 0) return null
        const nombres = [...(cambioRef ? ['referencia'] : []), ...(cambioValor ? ['valor'] : []), ...(cambioAjustes ? ['ajustes'] : []), ...(cambioSpice ? ['modelo propio'] : []), ...cambiadas]
        const nombre = nombres.length === 1 ? nombres[0] : `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`
        this.ejecutar(modificar(nombre, 'piezas', actual, nueva))
        this.avisar()
        return null
      },
      cancelar: () => {}
    })
  }

  /** Pone, cambia o quita el modelo SPICE propio de una pieza desde el inspector (`texto`: renglones «nombre = valor»;
   * vacío lo quita). Un paso de deshacer. Devuelve el error del campo o null. */
  cambiarSpice(id: Id, texto: string): string | null {
    if (this.gestoEnCurso) return 'Termina el arrastre antes de cambiar el modelo.'
    if (this.soloLectura) return MENSAJE_SOLO_LECTURA
    if (this.simulando) return MENSAJE_SOLO_EN_CALIENTE
    const p = this.doc.piezas[id]
    const familia = p ? familiaSpice(this.lib.get(p.tipo)?.modelo) : null
    if (!p || !familia) return null
    const r = spiceDeTexto(texto, familia)
    if (!r.ok) return r.error
    if (JSON.stringify(r.spice) === JSON.stringify(spiceVigente(p))) return null
    this.ejecutar(modificar('modelo propio', 'piezas', p, conSpice(p, r.spice)))
    this.avisar()
    return null
  }

  /** Cambia la referencia desde el inspector con las reglas del doble clic. Devuelve el motivo si no se aplica, o null. Un
   * paso de deshacer; simulando queda fija. */
  cambiarReferencia(id: Id, texto: string): string | null {
    if (this.gestoEnCurso) return 'Termina el arrastre antes de cambiar la referencia.'
    if (this.soloLectura) return MENSAJE_SOLO_LECTURA
    if (this.simulando) return MOTIVO_REFERENCIA_SIMULANDO
    const sm = this.doc.sondas && Object.hasOwn(this.doc.sondas, id) ? this.doc.sondas[id] : undefined
    if (sm && esMedidor(sm)) {
      // «m3» se guarda como «M3».
      const ref = limpiarTexto(texto).trim().toUpperCase()
      const e = errorDeReferenciaMedidor(this.doc, id, ref)
      if (e) return e
      if (ref === sm.ref) return null
      this.ejecutar(modificar('referencia', 'sondas', sm, { ...sm, ref }))
      this.avisar()
      return null
    }
    const p = this.doc.piezas[id]
    if (!p) return null
    const ref = limpiarTexto(texto).trim()
    const e = errorDeReferencia(this.doc, id, ref)
    if (e) return e
    if (ref === p.ref) return null
    this.ejecutar(modificar('referencia', 'piezas', p, { ...p, ref }))
    this.avisar()
    return null
  }

  /** `editarValor` de un terminal de alimentación: su nombre (la red) y el voltaje de su riel, en un paso de deshacer. */
  private editarTerminal(id: Id, def: PiezaDef): void {
    const p = this.doc.piezas[id]
    const m = def.modelo
    if (!p || m?.tipo !== 'alimentacion') return
    const riel = rielDeTerminal(this.doc, p, def)!
    // Simulando cambia en caliente el voltaje del riel; si el nombre ya es un voltaje, nada cambia así y no se abre.
    if (this.soloLectura || (this.simulando && riel.deNombre)) return void this.editable()
    /** El voltaje que da un nombre que ya es un voltaje («+12V»), con su motivo; null si el nombre es un riel. */
    const fijoDe = (nombre: string) => {
      const r = voltajeDeRiel(this.doc, nombre)
      return r.deNombre ? { texto: r.valor === null ? r.texto : formatearValor(r.valor, 'V'), motivo: MENSAJE_VOLTAJE_DEL_NOMBRE } : null
    }
    const campos: CampoPedido[] = [
      { id: 'nombre', titulo: 'Nombre', inicial: riel.nombre },
      { id: 'voltaje', titulo: 'Voltaje', inicial: fijoDe(riel.nombre)?.texto ?? riel.texto }
    ]
    this.ganchos.editarTexto({
      tipo: 'pieza',
      en: { x: p.x, y: p.y },
      nombre: def.nombre.es,
      campos,
      foco: riel.deNombre ? 0 : 1,
      revisar: (vals) => {
        const actual = this.doc.piezas[id] ?? p
        const vigente = nombreDeRiel(actual, def)
        const nombre: RevisionCampo = {}
        let efectivo = vigente
        if (this.simulando) nombre.fijo = { texto: vigente, motivo: MOTIVO_NOMBRE_SIMULANDO }
        else {
          const escrito = limpiarTexto(vals[0] ?? '').trim()
          // Repetir el nombre de otro terminal o de una etiqueta se permite: el campo dice con qué se une.
          const u = unionesDeNombre(this.doc, this.lib, escrito, { pieza: id })
          if (u) nombre.nota = u
          if (escrito) efectivo = escrito
        }
        const fijo = fijoDe(efectivo)
        return [nombre, fijo ? { fijo } : { sigue: voltajeDeRiel(this.doc, efectivo).texto }]
      },
      aceptar: (vals) => {
        const actual = this.doc.piezas[id]
        if (!actual) return null
        if (this.simulando) {
          const e = this.cambiarRiel(nombreDeRiel(actual, def), vals[1] ?? '')
          return e ? { campo: 1, error: e } : null
        }
        const r = cambiarProp(actual, def, m.nombre, limpiarTexto(vals[0] ?? ''))
        if ('error' in r) return { campo: 0, error: r.error }
        const nombre = r.pieza.props[m.nombre]
        const cmds: Comando[] = []
        if (nombre !== nombreDeRiel(actual, def)) cmds.push(modificar('nombre', 'piezas', actual, r.pieza))
        // Un nombre que ya es un voltaje («+12V») no tiene riel: lo que diga el campo del voltaje no cuenta.
        if (!fijoDe(nombre)) {
          const c = cambioDeRiel(this.doc, nombre, vals[1] ?? '', this.gen)
          if (c && 'error' in c) return { campo: 1, error: c.error }
          if (c) cmds.push(c)
        }
        if (cmds.length === 0) return null
        this.ejecutar(cmds.length === 1 ? cmds[0] : juntar('nombre y voltaje', cmds))
        this.avisar()
        return null
      },
      cancelar: () => {}
    })
  }

  /** El potenciómetro que es lo único seleccionado; null si no hay o hay más. */
  potSeleccionado(): Id | null {
    const s = this.seleccion
    if (s.piezas.size !== 1 || s.cables.size + s.etiquetas.size + s.notas.size + s.figuras.size > 0) return null
    const [id] = s.piezas
    const p = this.doc.piezas[id]
    return p && this.lib.get(p.tipo)?.modelo?.tipo === 'pot' ? id : null
  }

  /** El potenciómetro bajo el puntero (su cuerpo o uno de sus pines); null si no hay. No cambia la selección. */
  potEn(p: Punto): Id | null {
    const g = this.indice.golpe(p, this.tolerancia)
    const id = g?.tipo === 'pin' ? g.piezaId : g?.tipo === 'pieza' ? g.id : null
    const pz = id ? this.doc.piezas[id] : undefined
    return id && pz && this.lib.get(pz.tipo)?.modelo?.tipo === 'pot' ? id : null
  }

  /** Posición actual (0 a 100) del cursor de un potenciómetro; null si la pieza no lo es. */
  posicionPot(id: Id): number | null {
    const p = this.doc.piezas[id]
    const def = p ? this.lib.get(p.tipo) : undefined
    const m = def?.modelo
    if (!p || !def || m?.tipo !== 'pot') return null
    return posicionDeProp(p.props[m.posicion] ?? def.props.find((d) => d.id === m.posicion)?.defecto)
  }

  /** Pone el cursor de un potenciómetro en `porcentaje` (0 a 100), lo único que se edita con la vista previa corriendo. Un
   * mismo `gesto` es un paso; sin él, los cambios dentro de 800 ms también.
   * Devuelve false si la pieza no es potenciómetro o el archivo es de solo lectura. */
  cambiarPosicionPot(id: Id, porcentaje: number, gesto?: string): boolean {
    const p = this.doc.piezas[id]
    const def = p ? this.lib.get(p.tipo) : undefined
    const m = def?.modelo
    if (!p || !def || m?.tipo !== 'pot') return false
    if (this.soloLectura) return this.editable()
    if (this.gestoEnCurso) return false
    const texto = textoPosicion(porcentaje)
    const actual = p.props[m.posicion] ?? def.props.find((d) => d.id === m.posicion)?.defecto
    if (actual === texto) return true
    let grupo: string
    if (gesto !== undefined) grupo = `pot-${gesto}`
    else {
      const t = this.ahora()
      const s = this.potSeguido
      grupo = s && t - s.t <= ESPERA_FLECHAS_MS && this.historial.grupoEnCurso === s.grupo ? s.grupo : `pot-${++this.nPot}`
      this.potSeguido = { grupo, t }
    }
    // Directo al historial: `ejecutar` rechaza todo mientras se simula, y esto es lo único que se permite.
    this.historial.ejecutar({ ...modificar('posición del cursor', 'piezas', p, { ...p, props: { ...p.props, [m.posicion]: texto } }), grupo })
    this.versionCaliente = this.versionDoc
    this.avisar()
    return true
  }

  /** Cambia un ajuste de instrumento con o sin vista previa. Los cambios seguidos de la misma propiedad a menos de 800 ms,
   * o de un `gesto`, son un paso. Devuelve el error o null (una pieza que no es instrumento tampoco cambia). */
  cambiarAjusteInstrumento(id: Id, propId: string, texto: string, gesto?: string): string | null {
    return this.cambiarAjustesInstrumento(id, { [propId]: texto }, gesto)
  }

  /** Varios ajustes de un instrumento en un solo paso (el generador cambia amplitud y desplazamiento juntos al editar
   * mínimo y máximo). Si alguno es inválido no cambia ninguno. */
  cambiarAjustesInstrumento(id: Id, cambios: Record<string, string>, gesto?: string): string | null {
    if (this.gestoEnCurso) return 'Termina el arrastre antes de cambiar el valor.'
    if (this.soloLectura) return MENSAJE_SOLO_LECTURA
    const p = this.doc.piezas[id]
    const def = p ? this.lib.get(p.tipo) : undefined
    if (!p || !def || !esModeloInstrumento(def.modelo)) return null
    let nueva = p
    for (const [propId, texto] of Object.entries(cambios)) {
      const r = cambiarProp(nueva, def, propId, texto)
      if ('error' in r) return r.error
      nueva = r.pieza
    }
    const antes = (propId: string) => p.props[propId] ?? def.props.find((d) => d.id === propId)?.defecto
    const ids = Object.keys(cambios)
    if (ids.every((k) => nueva.props[k] === antes(k))) return null
    if (this.simulando) {
      const error = this.errorEnCaliente({ ...this.doc, piezas: { ...this.doc.piezas, [id]: nueva } })
      if (error) return error
    }
    let grupo: string
    if (gesto !== undefined) grupo = `ajuste-${gesto}`
    else {
      const t = this.ahora()
      const clave = `${id} ${ids.join(',')}`
      const s = this.ajusteSeguido
      grupo = s && s.clave === clave && t - s.t <= ESPERA_FLECHAS_MS && this.historial.grupoEnCurso === s.grupo ? s.grupo : `ajuste-${++this.nAjuste}`
      this.ajusteSeguido = { clave, grupo, t }
    }
    const cmd = { ...modificar('ajuste', 'piezas', p, nueva), grupo }
    if (this.simulando) {
      // Directo al historial, como la posición de un potenciómetro: `ejecutar` rechaza todo mientras se simula.
      this.historial.ejecutar(cmd)
      this.versionCaliente = this.versionDoc
    } else this.ejecutar(cmd)
    this.avisar()
    return null
  }

  /** «Medir con el osciloscopio ▸ Entrada X» o «con el multímetro» sobre el cable o etiqueta `o`: coloca o reutiliza el
   * instrumento y lo conecta, en un paso. Devuelve el error (al Registro) o null; no actúa simulando ni en solo lectura. */
  medirCon(o: ObjetivoMenu, pedido: PedidoMedir): string | null {
    if (!this.editable()) return this.simulando ? MENSAJE_SIMULANDO : MENSAJE_SOLO_LECTURA
    const red = o.tipo === 'cable' ? this.con.redDeCable.get(o.id) : o.tipo === 'etiqueta' ? this.con.redDeEtiqueta.get(o.id) : undefined
    if (red === undefined) return 'Eso no está en una red.'
    // En una etiqueta se mide en su ancla (su punto de conexión), no donde se hizo clic sobre su bandera.
    const e = o.tipo === 'etiqueta' && Object.hasOwn(this.doc.etiquetas, o.id) ? this.doc.etiquetas[o.id] : undefined
    const en = e ? { x: e.x, y: e.y } : o.en
    const r = comandoMedir(this.doc, this.lib, this.con, red, en, pedido, this.gen, o.tipo === 'cable' ? o.id : undefined)
    if ('error' in r) {
      this.ganchos.registrar(r.error)
      return r.error
    }
    this.ejecutar(r.cmd)
    if (pedido.con === 'medidor') this.seleccion = seleccionDe('sondas', r.sonda)
    this.avisar()
    return null
  }

  /** Cambia lo que mide el medidor rápido `id` (voltaje o corriente, DC o AC) en un paso. Devuelve el porqué si no se
   * pudo, o null. */
  cambiarMedidor(id: Id, cambio: { magnitud?: 'voltaje' | 'corriente'; modo?: 'dc' | 'ac' }): string | null {
    if (!this.editable()) return this.simulando ? MENSAJE_SIMULANDO : MENSAJE_SOLO_LECTURA
    const s = this.doc.sondas && Object.hasOwn(this.doc.sondas, id) ? this.doc.sondas[id] : undefined
    if (!s || !esMedidor(s)) return null
    const nueva = { ...s, ...(cambio.magnitud ? { magnitud: cambio.magnitud } : {}), ...(cambio.modo ? { modo: cambio.modo } : {}) }
    // La corriente AC no tiene lectura en vivo: al pasar a corriente un medidor en AC vuelve a DC en el mismo paso.
    if (cambio.magnitud === 'corriente' && !cambio.modo && nueva.modo === 'ac') nueva.modo = 'dc'
    if (cambio.modo === 'ac' && nueva.magnitud === 'corriente') return MOTIVO_CORRIENTE_AC
    if (nueva.magnitud === s.magnitud && nueva.modo === s.modo) return null
    if (nueva.magnitud === 'corriente' && !tocaAlgo(this.doc, this.lib, nueva)) return MOTIVO_MEDIDOR_DE_CORRIENTE
    this.ejecutar(modificar('cambiar el medidor', 'sondas', s, nueva))
    this.avisar()
    return null
  }

  /** Editor del doble clic sobre un medidor rápido: referencia, magnitud y modo con las reglas del inspector. Pasar a
   * corriente con AC elegido lo vuelve DC en el mismo paso; todo es un solo paso. */
  editarMedidor(id: Id): void {
    const s0 = this.doc.sondas && Object.hasOwn(this.doc.sondas, id) ? this.doc.sondas[id] : undefined
    if (!s0 || !esMedidor(s0) || !this.editable()) return
    const MIDE = ['Voltaje', 'Corriente']
    const MODO = ['DC', 'AC (RMS)']
    const iniMide = s0.magnitud === 'corriente' ? MIDE[1] : MIDE[0]
    const iniModo = s0.modo === 'ac' ? MODO[1] : MODO[0]
    const campos: CampoPedido[] = [
      { id: 'ref', titulo: 'Referencia', inicial: s0.ref ?? '' },
      { id: 'prop:mide', titulo: 'Mide', inicial: iniMide, opciones: MIDE },
      { id: 'prop:modo', titulo: 'Modo', inicial: iniModo, opciones: MODO }
    ]
    const puedeCorriente = () => tocaAlgo(this.doc, this.lib, { ...(this.doc.sondas?.[id] ?? s0), magnitud: 'corriente' })
    const leer = (v: string[]): { magnitud: 'voltaje' | 'corriente'; modo: 'dc' | 'ac' } => {
      const magnitud = (v[1] ?? iniMide) === MIDE[1] ? 'corriente' : 'voltaje'
      const modo = (v[2] ?? iniModo) === MODO[1] ? 'ac' : 'dc'
      return { magnitud, modo }
    }
    this.ganchos.editarTexto({
      tipo: 'pieza',
      en: { x: s0.x, y: s0.y },
      nombre: 'Medidor rápido',
      campos,
      foco: 1,
      revisar: (v) => {
        const actual = this.doc.sondas?.[id] ?? s0
        const ref = errorDeReferenciaMedidor(this.doc, id, limpiarTexto(v[0] ?? '').trim().toUpperCase())
        const { magnitud } = leer(v)
        const mide: RevisionCampo = magnitud === 'corriente' && actual.magnitud !== 'corriente' && !puedeCorriente() ? { error: MOTIVO_MEDIDOR_DE_CORRIENTE } : {}
        // Con corriente elegida, el modo sigue en DC mientras no se toque (la corriente AC no se ofrece).
        const modoRev: RevisionCampo = magnitud === 'corriente' ? (v[2] === MODO[1] && actual.modo !== 'ac' ? { error: MOTIVO_CORRIENTE_AC } : { sigue: MODO[0] }) : {}
        return [ref ? { error: ref } : {}, mide, modoRev]
      },
      aceptar: (v) => {
        const ref = limpiarTexto(v[0] ?? '').trim().toUpperCase()
        const er = errorDeReferenciaMedidor(this.doc, id, ref)
        if (er) return { campo: 0, error: er }
        const actual = this.doc.sondas?.[id]
        if (!actual || !esMedidor(actual)) return null
        let { magnitud, modo } = leer(v)
        if (magnitud === 'corriente' && actual.magnitud !== 'corriente' && !puedeCorriente()) return { campo: 1, error: MOTIVO_MEDIDOR_DE_CORRIENTE }
        // Un medidor en AC que pasa a corriente sin tocar el modo vuelve a DC en el mismo paso.
        if (magnitud === 'corriente' && modo === 'ac' && actual.modo === 'ac' && actual.magnitud !== 'corriente') modo = 'dc'
        if (magnitud === 'corriente' && modo === 'ac') return { campo: 2, error: MOTIVO_CORRIENTE_AC }
        const nueva = { ...actual, ref, magnitud, modo }
        if (nueva.ref === actual.ref && nueva.magnitud === actual.magnitud && nueva.modo === actual.modo) return null
        this.ejecutar(modificar('cambiar el medidor', 'sondas', actual, nueva))
        this.avisar()
        return null
      },
      cancelar: () => {}
    })
  }

  /** «Convertir en multímetro completo»: borra el medidor rápido y pone un multímetro con su sonda en el mismo punto y
   * función, en un paso. Devuelve el error o null. */
  convertirEnMultimetro(id: Id): string | null {
    if (!this.editable()) return this.simulando ? MENSAJE_SIMULANDO : MENSAJE_SOLO_LECTURA
    const s = this.doc.sondas && Object.hasOwn(this.doc.sondas, id) ? this.doc.sondas[id] : undefined
    if (!s || !esMedidor(s)) return null
    if (s.magnitud === 'corriente') {
      this.ganchos.avisoLienzo?.(MOTIVO_CONVERTIR_CORRIENTE)
      return MOTIVO_CONVERTIR_CORRIENTE
    }
    const red = this.con.redDeSonda.get(id)
    if (red === undefined) return 'El medidor no está sobre una red.'
    const a = anclaDeSonda(this.doc, this.lib, s.x, s.y)
    const modo = `V ${s.modo === 'ac' ? 'AC' : 'DC'}`
    const r = comandoMedir(this.doc, this.lib, this.con, red, { x: s.x, y: s.y }, { con: 'multimetro-nuevo', modo }, this.gen, a?.tipo === 'cable' ? a.id : undefined)
    if ('error' in r) {
      this.ganchos.registrar(r.error)
      return r.error
    }
    this.ejecutar(juntar('convertir en multímetro', [borrar('convertir en multímetro', 'sondas', s), r.cmd]))
    if (r.instrumento) this.seleccion = seleccionDe('piezas', r.instrumento)
    this.avisar()
    return null
  }

  /** `+` y `−` (y las flechas durante la vista previa): mueve el cursor del potenciómetro seleccionado 5 %, o 1 % en fino. */
  /** «Invertir el sentido» de una sonda de corriente: la flecha y el signo de su lectura, en un paso de deshacer. */
  invertirSentido(id: Id): void {
    const so = this.doc.sondas && Object.hasOwn(this.doc.sondas, id) ? this.doc.sondas[id] : undefined
    if (!so || so.tipo !== 'corriente' || !this.editable()) return
    const contrario = { derecha: 'izquierda', izquierda: 'derecha', abajo: 'arriba', arriba: 'abajo' } as const
    this.ejecutar(modificar('invertir el sentido', 'sondas', so, { ...so, sentido: contrario[so.sentido ?? 'derecha'] }))
    this.avisar()
  }

  pasoPotenciometro(dir: 1 | -1, fino: boolean): void {
    const id = this.potSeleccionado()
    const actual = id ? this.posicionPot(id) : null
    if (!id || actual === null) return
    this.cambiarPosicionPot(id, actual + dir * (fino ? PASO_POT_FINO : PASO_POT))
  }

  /** Crea o cambia un análisis de ngspice del documento: un paso por cambio, ninguno si no cambia nada. Devuelve el porqué
   * si no se guardó, o null. */
  guardarAnalisis(a: AnalisisDoc): string | null {
    if (this.soloLectura) return MENSAJE_SOLO_LECTURA
    if (this.simulando) return MENSAJE_SIMULANDO
    if (this.gestoEnCurso) return 'Termina el arrastre antes de cambiar el análisis.'
    const r = leerAnalisis(a)
    if ('error' in r) return `${r.error}.`
    const antes = this.doc.analisis && Object.hasOwn(this.doc.analisis, a.id) ? this.doc.analisis[a.id] : undefined
    if (!antes && Object.keys(this.doc.analisis ?? {}).length >= MAX_ANALISIS) return `El documento ya tiene ${MAX_ANALISIS} análisis: borra alguno.`
    if (antes && JSON.stringify(antes) === JSON.stringify(r.valor)) return null
    this.ejecutar(antes ? modificar('cambiar el análisis', 'analisis', antes, r.valor) : crear('crear el análisis', 'analisis', r.valor))
    this.avisar()
    return null
  }

  /** Borra un análisis del documento (un paso de deshacer). */
  borrarAnalisis(id: Id): string | null {
    if (this.soloLectura) return MENSAJE_SOLO_LECTURA
    if (this.simulando) return MENSAJE_SIMULANDO
    const antes = this.doc.analisis && Object.hasOwn(this.doc.analisis, id) ? this.doc.analisis[id] : undefined
    if (!antes) return null
    this.ejecutar(borrar('borrar el análisis', 'analisis', antes))
    this.avisar()
    return null
  }

  /** Cambia una propiedad desde el inspector con la validación de `cambiarProp`; devuelve el error del campo o null y un
   * texto igual no deja paso. Simulando solo cambian valores de fuentes y resistencias (`editableEnCaliente`), un paso
   * cada uno. */
  cambiarPropiedad(id: Id, propId: string, texto: string): string | null {
    if (this.gestoEnCurso) return 'Termina el arrastre antes de cambiar el valor.'
    if (this.soloLectura) return MENSAJE_SOLO_LECTURA
    const p = this.doc.piezas[id]
    const def = p ? this.lib.get(p.tipo) : undefined
    if (this.simulando && !editableEnCaliente(def, propId)) return MENSAJE_SOLO_EN_CALIENTE
    if (!p || !def) return null
    if (propId === 'spice') return this.cambiarSpice(id, texto)
    // El periodo de una fuente de pulso no se guarda: es la frecuencia al revés.
    if (propId === 'periodo' && def.modelo?.tipo === 'pulso') {
      const t = leerValor(texto)
      if (!t) return `«${texto}» no es un valor válido.`
      if (!(t.valor > 0)) return 'El periodo debe ser un número mayor que cero.'
      return this.cambiarPropiedad(id, def.modelo.frecuencia, textoDeNumero(1 / t.valor, 6))
    }
    // El voltaje de un terminal es el de su riel: cambiarlo cambia el de todos los terminales con su nombre.
    if (def.modelo?.tipo === 'alimentacion' && propId === CAMPO_VOLTAJE) return this.cambiarRiel(nombreDeRiel(p, def), texto)
    const r = cambiarProp(p, def, propId, texto)
    if ('error' in r) return r.error
    const antes = p.props[propId] ?? def.props.find((d) => d.id === propId)?.defecto
    if (r.pieza.props[propId] === antes) return null
    // La familia nueva de una pieza digital puede no admitir su alimentación: pasa a la más cercana en el mismo paso.
    const md = def.modelo
    const ajuste = esModeloDigital(md) && propId === md.familia ? alimentacionAlCambiarFamilia(p, def, md, r.pieza.props[propId]) : null
    if (ajuste && esModeloDigital(md)) {
      r.pieza = { ...r.pieza, props: { ...r.pieza.props, [md.alimentacion]: ajuste.alimentacion } }
      this.ganchos.registrar(ajuste.aviso)
    }
    if (this.simulando) {
      // Antes de tocar el documento se arma la netlist con el valor nuevo: uno que el motor no admitiría (cero, negativo, fuera de
      // su rango) se dice en el campo, y la vista previa no se detiene ni el documento se queda con el valor malo.
      // El circuito se podía simular al arrancar: cualquier error es del cambio, aunque nombre a otra pieza.
      const error = this.errorEnCaliente({ ...this.doc, piezas: { ...this.doc.piezas, [id]: r.pieza } })
      if (error) return error
    }
    if (this.simulando) {
      // Directo al historial, como la posición de un potenciómetro: `ejecutar` rechaza todo mientras se simula.
      this.historial.ejecutar({ ...modificar('valor', 'piezas', p, r.pieza), grupo: `valor-${++this.nValor}` })
      this.versionCaliente = this.versionDoc
    } else this.ejecutar(modificar('valor', 'piezas', p, r.pieza))
    this.avisar()
    return null
  }

  /** El error que daría la vista previa con `doc`, o null (ver `Ganchos.probarEnCaliente`). */
  private errorEnCaliente(doc: Documento): string | null {
    if (this.ganchos.probarEnCaliente) return this.ganchos.probarEnCaliente(doc)
    // Sin la vista previa (pruebas): los errores que el cambio agrega a los que ya tenía el documento.
    const antes = new Set(compilarNetlist(this.doc, this.lib, this.con).errores)
    return compilarNetlist(doc, this.lib, this.con).errores.find((e) => !antes.has(e)) ?? null
  }

  /** Pone el riel `nombre` en el voltaje `texto`: cambia todos los terminales con ese nombre en un paso. Un nombre que ya
   * es voltaje («+15V») no se cambia y lo dice.
   * Simulando cambia sin detener la vista previa. Devuelve el error del campo o null. */
  cambiarRiel(nombre: string, texto: string): string | null {
    if (this.gestoEnCurso) return 'Termina el arrastre antes de cambiar el valor.'
    if (this.soloLectura) return MENSAJE_SOLO_LECTURA
    const c = cambioDeRiel(this.doc, nombre, texto, this.gen)
    if (c === null) return null
    if ('error' in c) return c.error
    if (this.simulando) {
      // Como el valor de una fuente: uno que el motor no admitiría se dice en el campo y la vista previa sigue.
      const error = this.errorEnCaliente(aplicar(this.doc, c))
      if (error) return error
      this.historial.ejecutar({ ...c, grupo: `valor-${++this.nValor}` })
      this.versionCaliente = this.versionDoc
    } else this.ejecutar(c)
    this.avisar()
    return null
  }

  editarEtiqueta(id: Id): void {
    const e = this.doc.etiquetas[id]
    if (!e || !this.editable()) return
    this.ganchos.editarTexto({
      tipo: 'etiqueta',
      en: { x: e.x, y: e.y },
      inicial: e.nombre,
      multilinea: false,
      aceptar: (t) => {
        const actual = this.doc.etiquetas[id]
        if (!actual) return null
        const nombre = limpiarTexto(t).trim()
        if (!nombre) return 'Escribe el nombre de la red.'
        this.ejecutar(modificar('nombre', 'etiquetas', actual, { ...actual, nombre }))
        this.avisar()
        return null
      },
      // Repetir el nombre de un terminal o de otra etiqueta se permite: el campo dice con qué se une.
      revisar: (t) => unionesDeNombre(this.doc, this.lib, limpiarTexto(t), { etiqueta: id }),
      cancelar: () => {}
    })
  }

  editarNota(id: Id): void {
    const n = this.doc.notas[id]
    if (!n || !this.editable()) return
    this.ganchos.editarTexto({
      tipo: 'nota',
      en: { x: n.x, y: n.y },
      inicial: n.texto,
      multilinea: true,
      aceptar: (t) => {
        const actual = this.doc.notas[id]
        if (!actual) return null
        const texto = limpiarTexto(t).replace(/\s+$/, '')
        if (!texto.trim()) return 'Escribe el texto de la nota.'
        // Si el usuario fijó el ancho con las asas se conserva; si no, la caja sigue al texto nuevo.
        const ancho = anchoSigueAlTexto(actual) ? anchoNotaAuto(texto, actual.formato) : actual.ancho
        this.ejecutar(modificar('texto', 'notas', actual, { ...actual, texto, ancho }))
        this.avisar()
        return null
      },
      cancelar: () => {}
    })
  }

  // ---- Formato de notas y etiquetas ----

  /** Notas y etiquetas de red seleccionadas: lo único que tiene formato. */
  private textosSeleccionados(): { notas: Nota[]; etiquetas: Etiqueta[] } {
    const notas = [...this.seleccion.notas].map((id) => this.doc.notas[id]).filter((n): n is Nota => !!n)
    const etiquetas = [...this.seleccion.etiquetas].map((id) => this.doc.etiquetas[id]).filter((e): e is Etiqueta => !!e)
    return { notas, etiquetas }
  }

  /** Cambia el formato de las notas y etiquetas seleccionadas en un paso. `parche` puede calcularse por texto y la
   * alineación solo cambia notas. Un ancho que seguía al texto lo sigue; el fijado con asas se conserva. true si cambió
   * algo. */
  cambiarFormato(parche: ParcheFormato | ((actual: FormatoCompleto) => ParcheFormato), opciones: { control?: string } = {}): boolean {
    if (this.gestoEnCurso || this.herramienta !== 'seleccionar') return false
    // Sin nada seleccionado no hay a qué dar formato: ni mensaje ni sacudida.
    if (tamañoSeleccion(this.seleccion) === 0) return false
    if (!this.editable()) return false
    const { notas, etiquetas } = this.textosSeleccionados()
    const de = (actual: FormatoCompleto) => (typeof parche === 'function' ? parche(actual) : parche)
    if (notas.length + etiquetas.length === 0) {
      this.ganchos.registrar('El formato solo se aplica a notas y etiquetas de red.')
      this.ganchos.animar({ tipo: 'sacudida', piezas: [...this.seleccion.piezas], cables: [...this.seleccion.cables] })
      return false
    }
    if (notas.length === 0 && typeof parche !== 'function' && Object.keys(parche).every((k) => k === 'alinear')) {
      this.ganchos.registrar('La alineación solo se aplica a notas.')
      return false
    }
    const conFormato = <T extends { formato?: FormatoTexto }>(x: T, f: FormatoTexto | undefined): T => {
      const { formato: _, ...resto } = x
      return (f ? { ...resto, formato: f } : resto) as T
    }
    const cmds: Comando[] = []
    for (const n of notas) {
      const f = formatoConCambio(n.formato, de(formatoCompleto(n.formato, 'nota')), 'nota')
      if (JSON.stringify(f) === JSON.stringify(n.formato)) continue
      // El ancho solo se toca si cambia lo que mide el texto: una nota fijada no baja de su palabra más larga y una que sigue al texto lo sigue.
      const antes = formatoCompleto(n.formato, 'nota'), despues = formatoCompleto(f, 'nota')
      const cambiaMedida = antes.fuente !== despues.fuente || antes.tam !== despues.tam || antes.negrita !== despues.negrita || antes.cursiva !== despues.cursiva
      const ancho = !cambiaMedida ? n.ancho : anchoSigueAlTexto(n) ? anchoNotaAuto(n.texto, f) : Math.max(n.ancho, anchoNotaMinimo({ texto: n.texto, formato: f }))
      cmds.push(modificar('formato', 'notas', n, { ...conFormato(n, f), ancho }))
    }
    for (const e of etiquetas) {
      const f = formatoConCambio(e.formato, de(formatoCompleto(e.formato, 'etiqueta')), 'etiqueta')
      if (JSON.stringify(f) !== JSON.stringify(e.formato)) cmds.push(modificar('formato', 'etiquetas', e, conFormato(e, f)))
    }
    if (cmds.length === 0) return false
    let cmd = juntar('formato', cmds)
    // Cambios seguidos de un mismo control (flechas sobre una lista) son un solo paso de deshacer, como las flechas del lienzo.
    if (opciones.control) {
      const t = this.ahora()
      const sel = JSON.stringify([[...this.seleccion.notas], [...this.seleccion.etiquetas]])
      const f = this.formatoSeguido
      const grupo = f && f.control === opciones.control && f.sel === sel && t - f.t <= ESPERA_FLECHAS_MS && this.historial.grupoEnCurso === f.grupo ? f.grupo : `formato-${++this.nFormato}`
      this.formatoSeguido = { grupo, t, control: opciones.control, sel }
      cmd = { ...cmd, grupo }
    }
    this.ejecutar(cmd)
    this.avisar()
    return true
  }

  /** Ctrl+B, Ctrl+I y Ctrl+U: si todos los textos seleccionados lo tienen se quita; si no (o es mixto), se pone a todos. */
  alternarFormato(prop: 'negrita' | 'cursiva' | 'subrayado'): void {
    const { notas, etiquetas } = this.textosSeleccionados()
    const todos = [...notas.map((n) => formatoCompleto(n.formato, 'nota')), ...etiquetas.map((e) => formatoCompleto(e.formato, 'etiqueta'))]
    this.cambiarFormato({ [prop]: !(todos.length > 0 && todos.every((f) => f[prop])) })
  }

  /** Ctrl+Shift+. y Ctrl+Shift+,: cada texto pasa al tamaño siguiente de la serie ISO, mayor o menor. */
  pasoTam(dir: 1 | -1): void {
    this.cambiarFormato((f) => ({ tam: siguienteTam(f.tam, dir) }))
  }

  // ---- Órdenes de teclado ----

  // Mientras dura un arrastre se ignoran girar, reflejar, borrar, pegar, duplicar, L, G y T:
  // cambiarían el documento bajo el gesto, que recalcula cada paso desde el documento de antes.

  /** R, Shift+R, X e Y (o un giro y reflejo absolutos desde el inspector) sobre las piezas seleccionadas. */
  transformar(op: Transformacion | Orientacion): void {
    if (this.gestoEnCurso) return
    if (this.herramienta === 'colocar' && this.fantasma) {
      this.fantasma = { ...this.fantasma, ...orientar(this.fantasma.rot, this.fantasma.espejo, op) }
      this.revisarFantasma()
      this.avisar()
      return
    }
    if (this.herramienta !== 'seleccionar' || tamañoSeleccion(this.seleccion) === 0) return
    if (!this.editable()) return
    const sel = this.seleccion
    // Un giro absoluto que ya tienen todas las piezas no cambia nada ni deja paso.
    const yaEsta = (id: Id, o: Orientacion) => !this.doc.piezas[id] || (this.doc.piezas[id].rot === o.rot && this.doc.piezas[id].espejo === o.espejo)
    if (typeof op === 'object' && sel.piezas.size > 0 && [...sel.piezas].every((id) => yaEsta(id, op))) return
    const nombre = typeof op === 'object' ? 'orientar' : op
    let total = transformarSeleccion(this.doc, sel, op, this.lib)
    // Solo cables o notas: R, Shift+R, X e Y no los cambian.
    if (total.cambios.length === 0) {
      this.ganchos.animar({ tipo: 'sacudida', piezas: [], cables: [...sel.cables] })
      this.ganchos.registrar(
        typeof op === 'object' ? 'Cambiar la orientación solo afecta a piezas.' : esGiro(op) ? 'Girar solo cambia piezas y etiquetas de red.' : 'Reflejar solo cambia piezas y etiquetas de red.'
      )
      this.avisar()
      return
    }
    let doc = aplicar(this.doc, total)
    // Las puntas que se estiraron hasta los pines nuevos se vuelven a enrutar si cruzan un cuerpo o hacen una vuelta en U.
    // Los cables elegidos giran con el grupo y conservan su forma: solo se reparan los que se estiraron.
    const estirados = [...new Set(total.cambios.filter((c) => c.col === 'cables' && !sel.cables.has(c.id)).map((c) => c.id))]
    for (const id of estirados) {
      const r = repararCable(doc, this.lib, id)
      if (!r) continue
      const m = modificar(nombre, 'cables', doc.cables[id], { ...doc.cables[id], puntos: r })
      total = fusionar(total, m)
      doc = aplicar(doc, m)
    }
    const extra = partirEnUniones(doc, this.gen)
    if (extra) {
      total = fusionar(total, extra)
      doc = aplicar(doc, extra)
    }
    const movidas = [...sel.piezas].map((id) => doc.piezas[id]).filter(Boolean)
    const pieza = choqueDeGrupo(doc, this.lib, movidas, sel.piezas)
    const conflicto = pieza ? null : conflictoDeTocados(doc, this.lib, { piezas: sel.piezas, cables: [...sel.cables, ...estirados] })
    if (pieza || conflicto) {
      this.ganchos.animar({ tipo: 'sacudida', piezas: [...sel.piezas], cables: [...sel.cables] })
      const verbo = typeof op === 'object' ? 'cambiar la orientación' : esGiro(op) ? 'girar' : 'reflejar'
      const sujeto = this.sujetoUnico()
      this.ganchos.registrar(`${sujeto ? `${sujeto} no se pudo` : 'Las piezas no se pudieron'} ${verbo}: ${motivo(doc, pieza, conflicto)}.`)
      this.avisar()
      return
    }
    this.ejecutar(total)
    this.avisar()
  }

  escape(): void {
    if (this.arrastre || this.arrastreAsa || this.arrastreTexto || this.arrastrePantalla || this.textoPendiente || this.figuraNueva?.inicio || this.arrastreAsaFigura) {
      this.cancelarGesto()
      return
    }
    if (this.herramienta === 'colocar') this.terminarColocar()
    else if (this.herramienta === 'cablear') this.cancelarCable()
    else if (this.herramienta === 'figura') this.cancelarFigura()
    else if (this.rect) this.rect = null
    else this.seleccion = seleccionVacia()
    this.avisar()
  }

  /** Flechas: mueve la selección `dx`, `dy` con la semántica de un arrastre; si algo no se puede, no se mueve y se sacude.
   * Pulsaciones a menos de 800 ms sin otra orden en medio son un paso.
   * false si no hay selección (la interfaz mueve la vista); no hace nada colocando, cableando, escribiendo o arrastrando. */
  desplazar(dx: number, dy: number): boolean {
    // Colocando, las flechas mueven el fantasma (el lienzo no se desplaza).
    if (this.herramienta === 'colocar' && (this.fantasma || this.fragmentoColocar)) {
      this.moverFantasma(dx, dy)
      return true
    }
    // Simulando, con un potenciómetro seleccionado, izquierda y derecha mueven su cursor: 5 %, o 1 % con Shift
    // (cinco pasos de rejilla). Las verticales no hacen nada: la pieza no se mueve mientras corre la vista previa.
    if (this.simulando && this.potSeleccionado()) {
      if (dx !== 0) this.pasoPotenciometro(dx > 0 ? 1 : -1, Math.abs(dx) > PASO_REJILLA)
      return true
    }
    if (this.gestoEnCurso || this.herramienta !== 'seleccionar' || this.textoPendiente) return true
    const sel = this.seleccion
    if (tamañoSeleccion(sel) === 0) return false
    if (!this.editable()) return true
    // Solo banderas seleccionadas: la flecha las lleva por su red, no por la rejilla en el aire.
    if (sel.sondas.size > 0 && sel.piezas.size + sel.cables.size + sel.etiquetas.size + sel.notas.size + sel.figuras.size === 0) return this.desplazarSondas(dx, dy)
    let doc = this.doc
    let total: Comando | null = null
    const sumar = (c: Comando | null) => {
      if (!c || c.cambios.length === 0) return
      total = total ? fusionar(total, c) : c
      doc = aplicar(doc, c)
    }
    sumar(partirEnUniones(doc, this.gen))
    const plan = planArrastre(doc, this.lib, sel)
    sumar(pasoArrastre(plan, dx, dy))
    for (const id of sel.piezas) {
      const p = doc.piezas[id]
      if (p) sumar(insertarEnCable(doc, this.lib, p, this.gen, sel.cables))
    }
    const estirados = plan.estirados.map((e) => e.cable.id)
    for (const id of estirados) {
      const r = repararCable(doc, this.lib, id)
      if (r) sumar(modificar('enrutar', 'cables', doc.cables[id], { ...doc.cables[id], puntos: r }))
    }
    sumar(partirEnUniones(doc, this.gen))
    const movidas = [...sel.piezas].map((id) => doc.piezas[id]).filter(Boolean)
    const pieza = total ? choqueDeGrupo(doc, this.lib, movidas, sel.piezas) : null
    const conflicto = total && !pieza ? conflictoDeTocados(doc, this.lib, { piezas: sel.piezas, cables: [...sel.cables, ...estirados] }) : null
    const fuera = !!total && !pieza && !conflicto && !comandoDentroDelMundo(total as Comando)
    if (!total || pieza || conflicto || fuera) {
      this.ganchos.animar({ tipo: 'sacudida', piezas: [...sel.piezas], cables: [...sel.cables] })
      // Sin cambios (total nulo) no hay ninguna causa que dar: solo se sacude.
      if (total) this.ganchos.registrar(`No se pudo mover la selección: ${fuera ? MOTIVO_FUERA_DEL_MUNDO : motivo(doc, pieza, conflicto)}.`)
      this.avisar()
      return true
    }
    const t = this.ahora()
    const f = this.flechas
    const grupo = f && t - f.t <= ESPERA_FLECHAS_MS && this.historial.grupoEnCurso === f.grupo ? f.grupo : `teclas-${++this.nFlechas}`
    this.flechas = { grupo, t }
    this.ejecutar({ ...(total as Comando), grupo })
    this.avisar()
    return true
  }

  /** Las flechas con solo sondas seleccionadas: cada una al siguiente punto de su red; juntas, en un paso de deshacer (como las flechas). */
  private desplazarSondas(dx: number, dy: number): boolean {
    const cmds: Comando[] = []
    for (const id of this.seleccion.sondas) {
      const s = this.doc.sondas?.[id]
      const d = s ? siguienteDeSonda(this.indice, this.doc, this.lib, this.con, s, dx, dy) : null
      if (s && d) cmds.push(modificar('mover la sonda', 'sondas', s, { ...s, x: d.x, y: d.y, ...(d.sentido ? { sentido: d.sentido } : {}) }))
    }
    if (!cmds.length) {
      this.ganchos.registrar(MOTIVO_SONDA_SIN_CABLE)
      this.avisar()
      return true
    }
    const t = this.ahora()
    const f = this.flechas
    const grupo = f && t - f.t <= ESPERA_FLECHAS_MS && this.historial.grupoEnCurso === f.grupo ? f.grupo : `teclas-${++this.nFlechas}`
    this.flechas = { grupo, t }
    this.ejecutar({ ...juntar('mover las sondas', cmds), grupo })
    this.avisar()
    return true
  }

  borrar(): void {
    if (this.gestoEnCurso || this.herramienta !== 'seleccionar' || tamañoSeleccion(this.seleccion) === 0) return
    if (!this.editable()) return
    this.ejecutar(borrarSeleccion(this.doc, this.seleccion))
    this.seleccion = seleccionVacia()
    this.avisar()
  }

  seleccionarTodo(): void {
    if (this.herramienta !== 'seleccionar') return
    this.seleccion = todo(this.doc)
    this.avisar()
  }

  copiar(): void {
    const f = copiar(this.doc, this.seleccion, this.lib)
    if (f) this.portapapeles = f
  }

  /** Copia la selección y la borra en un solo paso de deshacer; no hace nada (ni copia) si no se puede editar. */
  cortar(): void {
    if (this.gestoEnCurso || this.herramienta !== 'seleccionar' || tamañoSeleccion(this.seleccion) === 0) return
    if (!this.editable()) return
    const f = copiar(this.doc, this.seleccion, this.lib)
    if (!f) return
    this.portapapeles = f
    this.borrar()
  }

  pegar(): void {
    if (!this.portapapeles || this.herramienta !== 'seleccionar' || this.gestoEnCurso) return
    if (!this.editable()) return
    this.pegarFragmento(this.portapapeles, this.cursor)
  }

  /** Duplica la selección en `en` (por omisión el cursor) para que la copia no caiga pegada ni conectada al original; si
   * está ocupado busca el libre más cercano. No toca el portapapeles. */
  duplicar(en: Punto = this.cursor): void {
    if (this.herramienta !== 'seleccionar' || this.gestoEnCurso) return
    const f = copiar(this.doc, this.seleccion, this.lib)
    if (!f || !this.editable()) return
    this.pegarFragmento(f, en)
  }

  /** Pega en `en` o unos pasos en diagonal si se encimaría. Sin hueco: si solo quedan piezas encimadas pega en el último
   * intento y sacude; si cruzarían cables, no pega. */
  private pegarFragmento(f: Fragmento, en: Punto, exacto = false): boolean {
    const lugar = lugarParaPegar(this.doc, this.lib, f.piezas, f.cables, en, this.indice, exacto ? 0 : undefined)
    // Una plantilla se coloca donde está el fantasma o no se coloca: no se corre sola.
    if (exacto && !lugar.libre) {
      this.ganchos.registrar('No se colocó la plantilla: no hay lugar libre ahí.')
      return false
    }
    if (!lugar.libre && !lugar.soloPiezas) {
      this.ganchos.animar({ tipo: 'sacudida', piezas: [...this.seleccion.piezas], cables: [...this.seleccion.cables] })
      this.ganchos.registrar('No se pegó: no hay lugar libre cerca del cursor.')
      return false
    }
    const r = pegar(this.doc, this.lib, f, lugar.en, this.gen, exacto)
    if (!comandoDentroDelMundo(r.cmd)) {
      this.ganchos.animar({ tipo: 'sacudida', piezas: [...this.seleccion.piezas], cables: [...this.seleccion.cables] })
      this.ganchos.registrar(`No se pegó: ${MOTIVO_FUERA_DEL_MUNDO}.`)
      return false
    }
    this.ejecutarNormalizado(r.cmd)
    this.seleccion = r.seleccion
    if (r.renombradas.length) this.ganchos.registrar(`Se renombraron redes para que no se unan con las que ya hay: ${r.renombradas.map(([a, b]) => `${a} a ${b}`).join(', ')}.`)
    if (!lugar.libre) {
      this.ganchos.animar({ tipo: 'sacudida', piezas: [...r.seleccion.piezas] })
      this.ganchos.registrar('Se pegó encimado: no hubo lugar libre cerca del cursor.')
    }
    this.avisar()
    return true
  }

  deshacer(): void {
    // Simulando, deshacer cambiaría el circuito que corre: solo se avisa (en solo lectura no hay historial).
    if (this.simulando) return void this.editable()
    this.cerrarArrastre()
    this.cancelarCable()
    this.historial.deshacer()
    this.avisar()
  }

  rehacer(): void {
    if (this.simulando) return void this.editable()
    this.cerrarArrastre()
    this.cancelarCable()
    this.historial.rehacer()
    this.avisar()
  }
}

import { Sostenidos } from './sim/sostenidos'
import { haySondasDeCorriente, hayMedidores } from './doc/sondas'
import { Histeresis } from './ui/histeresis'
import { batch, createEffect, createMemo, createSignal, Match, on, onCleanup, onMount, Show, Switch, untrack } from 'solid-js'
import { aplicarParche, MAX_RECIENTES, type Ajustes, type PanelDerecho, type PanelLateral as Panel, type PestañaCinta } from '../../compartido/ajustes'
import type { FormatoExportar, Recuperable } from '../../compartido/archivos'
import { ordenDeTeclaNumerica } from '../../compartido/ventana'
import { version as VERSION } from '../../../package.json'
import { CATEGORIA_POR_OMISION, type ResultadoBorrarCategoria, type ResultadoPlantilla } from '../../compartido/plantillas'
import { cargarPropias, plantillasIncluidas, type ItemPlantilla, type ResultadoCarga } from './plantillas/almacen'
import { conTextosFijos } from './plantillas/textosFijos'
import { conDescripcion, empaquetarPlantilla, fragmentoDeDocumento, fragmentoDeSeleccion, fragmentoParaColocar, vistaDeFragmento } from './plantillas/plantilla'
import { armar } from './plantillas/armar'
import type { Armado } from './calculadoras/circuitos'
import { elegirCalculadora } from './calculadoras/estado'
import type { IdCalculadora } from './calculadoras/catalogo'
import type { Fragmento } from './editor/portapapeles'
import Dialogo from './ui/Dialogo'
import DialogoPlantilla, { type DatosPlantilla } from './ui/DialogoPlantilla'
import { aperturaDelPaso } from './ui/tutorial/apertura'
import { ajustesIniciales, apiArchivos, apiNgspice, apiPlantillas, apiVentana, escucharTamañoInterfaz, guardarAjustes, leerAjustes, modoPruebas, UltimaRespuesta } from './ajustes/ajustes'
import { ControlArchivo, estadoNuevo, tituloVentana, type EstadoArchivo, type Respuesta, type RespuestaRecuperar } from './archivo/control'
import { Diario } from './archivo/diario'
import { escribirKir } from './archivo/kir'
import { exportar, vistaPreviaExportar, type DependenciasExportar } from './exportar/exportar'
import { cssDeFuentes } from './exportar/fuentes'
import { rasterizar } from './exportar/png'
import { baseDeTexto } from './exportar/svg'
import { cajaDeExportar, escenaDeExportar, type FuenteEscena, type VivoExportar } from './exportar/escenaExportar'
import { contextoDeLecturaFija, objetivoLectura, notaDeLectura, textoDeLectura } from './exportar/lecturaEsquema'
import { lecturaDeOperacion, pedidoOperacion } from './exportar/operacion'
import { medirOperacion } from './exportar/operacionCliente'
import { lecturasDeMedidores, voltajesDeCables } from './exportar/vivo'
import { dibujarTextos, fuentesDeCss } from './lienzo/texto'
import { ZOOM_MAX, ZOOM_MIN, type Camera } from './canvas/camera'
import { MM_POR_UNIDAD, type Documento, type Id, type Pieza, type Punto } from './doc/tipos'
import { calcularConexiones, partirClavePin } from './conexiones/conexiones'
import { registrarAtajosDelEditor } from './editor/atajosEditor'
import { cuerpoEnMundo } from './editor/colision'
import { cajaEtiqueta, cajaNota, cursorDeAsa } from './lienzo/medidas'
import type { Caja } from './piezas/tipos'
import { cajaDeCuerpo } from './editor/cajaPieza'
import BarraFormato from './ui/BarraFormato'
import { cajaTocaArea, soloTextos, vistaFormato, type OrdenFormato } from './ui/vistaFormato'
import { documentoDemo } from './editor/demo'
import { cursorDeAsaFigura } from './editor/figuras'
import { Editor, type EstadoEditor, type Herramienta, type Modificadores, type ObjetivoMenu, type PedidoCampos, type PedidoTexto } from './editor/Editor'
import { mismaSeleccion, seleccionDe, seleccionVacia, tamañoSeleccion } from './editor/seleccion'
import { Atajos } from './editor/teclado'
import { construirEscena } from './lienzo/escena'
import type { Texto } from './lienzo/etiquetas'
import { Lienzo } from './lienzo/Lienzo'
import { porcentajeAZoom, porcentajeZoom, siguientePasoZoom, zoomAPorcentaje, ZOOM_INICIAL } from './lienzo/medidas'
import { paletaDeTema } from './lienzo/paleta'
import { construirSuperposicion, type GuiaTutorial } from './lienzo/superposicion'
import type { FrameStats } from './perf/fps'
import { libreriaIncluida } from './piezas/incluidas'
import { registrarAtajosDeArchivo } from './ui/atajosArchivo'
import { registrarAtajosDeLaVentana } from './ui/atajosVentana'
import BarraEstado, { HisteresisDeRitmo } from './ui/BarraEstado'
import BarraLimpia from './ui/BarraLimpia'
import BarraSuperior from './ui/BarraSuperior'
import Buscador from './ui/Buscador'
import Configuracion from './ui/Configuracion'
import { crearGrabador } from './grabacion/grabador'
import { crearControlGrabacion } from './grabacion/control'
import AvisoGrabacionLienzo from './ui/AvisoGrabacion'
import PopoverGrabacion from './ui/PopoverGrabacion'
import { alElegirSerie, sincronizarSerie } from './valores/serieElegida'
import DialogoExportar, { type LecturaEsquema } from './ui/DialogoExportar'
import { cajaDeNotas, conNotasEnSvg, type ContextoNotas, type NotaLectura, type Notas } from './ui/exportar/marco/notasEsquema'
import DialogoGuardar from './ui/DialogoGuardar'
import DialogoRecuperar from './ui/DialogoRecuperar'
import EditorEnLinea from './ui/EditorEnLinea'
import Globo from './ui/Globo'
import { globoDeEtiqueta, globoDeSonda } from './ui/textosSonda'
import HojaAtajos from './ui/HojaAtajos'
import type { PotVista } from './ui/ControlPosicion'
import { compilarNetlist, opcionDe } from './netlist/netlist'
import Inspector from './ui/Inspector'
import { mapaDeAtajos } from './ui/hojaDeAtajos'
import Instrumentos, { type Pestaña } from './ui/Instrumentos'
import { acotarAltoFranja, altoAlAbrir, ALTO_FRANJA_OSCILOSCOPIO } from './ui/altoFranja'
import PanelOsciloscopio from './ui/osciloscopio/PanelOsciloscopio'
import type { EjeRueda } from './ui/osciloscopio/Pantalla'
import MandosOsciloscopio from './ui/osciloscopio/MandosOsciloscopio'
import { estadoDelDisparo } from './ui/osciloscopio/panel'
import { fuentesDeInstrumento } from './instrumentos/entradas'
import { pasoSerie } from './instrumentos/serie'
import PanelMultimetro from './ui/PanelMultimetro'
import PanelGenerador from './ui/PanelGenerador'
import PanelFuente from './ui/PanelFuente'
import { cargaDeCanal, cargaDeMultimetro } from './instrumentos/carga'
import { ajustesFuente, ajustesGenerador, ajustesMultimetro, CANALES, type Canal, type Resultado } from './instrumentos/ajustes'
import { colorDeCanal } from './ui/colores'
import { hexARgba } from './lienzo/paleta'
import type { InstrumentosLienzo } from './lienzo/instrumentosLienzo'
import { formatearMedida, formatearValor } from './valores/valores'
import type { PantallaSab } from './sim/protocoloInstrumentos'
import type { CursoresPantalla } from './ui/osciloscopio/dibujar'
import { ajusteAutomatico, canalDeReferencia, textoDeNumero, textoDeSerie } from './instrumentos/ajusteAutomatico'
import { dibujosDePantalla } from './ui/osciloscopio/dibujar'
import { medirDibujo } from './ui/osciloscopio/medirPantalla'
import { ajustesOsciloscopio, BASE_RANGO, DIVISIONES_H, VDIV_RANGO, type AjustesOsciloscopio } from './instrumentos/ajustes'
import Menu from './ui/Menu'
import { MOTIVO_CONVERTIR_CORRIENTE } from './editor/sondas'
import { menuAvanzar, menuDeCategoria, menuDeCinta, menuDePlantilla, menuDeObjetivo, menuFigura, menuGrabacion, menuRecientes, menuVelocidad, ordenDeAccion, estiloDeAccion, pedidoDeAccion, type AccionMenu, type ModeloMenu } from './ui/menus'
import { PISTA_SOLO_LECTURA } from './ui/menus'
import { vistaFigura } from './ui/vistaFigura'
import Minimapa from './ui/Minimapa'
import AvisoLienzo from './ui/AvisoLienzo'
import PanelLateral from './ui/PanelLateral'
import PanelLibreria, { type FaseArrastre } from './ui/PanelLibreria'
import PanelMediciones, { type FilaMultimetro } from './ui/PanelMediciones'
import PanelCalculadoras from './ui/PanelCalculadoras'
import PanelPlantillas from './ui/PanelPlantillas'
import PanelProyecto from './ui/PanelProyecto'
import { pistaDeEstado, pistaDeSimulacion } from './ui/pista'
import { SimClient } from './sim/client'
import { accionDeClic, ControlSimulacion, limitesExcedidos, otraOpcion, type FaseSim } from './sim/control'
import { paraTexto, type Lectura } from './sim/lectura'
import { MENSAJE_DETENER_PARA_EDITAR, accionableSeleccionado, anuncioDeFase, LecturaPorCuadro, leeCadaCiclo, leeTrasCambio } from './ui/vistaPrevia'
import { documentoDeSeleccion, documentoSinInstrumentos, type AlcanceExportar, type AreaMm } from './exportar/seleccion'
import { aplicarFormatoCsv } from './ui/exportar/csvFormato'
import { csvDeCaptura } from './ui/osciloscopio/exportarCaptura'
import { pngDeFigura, svgDeFigura } from './ui/osciloscopio/exportarFigura'
import { conCanalesApagados, figuraDeCaptura, type AspectoDeCaptura } from './ui/osciloscopio/figura'
import DialogoCaptura from './ui/osciloscopio/DialogoCaptura'
import { aspectoOsciloscopio } from './instrumentos/ajustes'
import { temaEfectivo } from './ui/grafica/paleta'
import { PPP_BASE } from './exportar/png'
import { cambiarExtension } from '../../compartido/archivos'
import { construirCapaSim, piezasDeCapaSim } from './lienzo/capaSim'
import { radioIman } from './editor/iman'
import { acumularRueda, ejeDePotenciometro, ohmsDelPot, PASO_POT, PASO_POT_FINO, posicionDeArrastre } from './sim/potenciometro'
import { chipEn, claveDeRedChip, desplazoTrasArrastre, MARGEN_HOVER_CHIP, redDeGolpe, redesConChip, redLlevaChip, type Desplazo, type Desplazos } from './lienzo/ajusteChips'
import type { OpcionesChips } from './lienzo/chips'
import { registrarAtajosDeSimulacion } from './ui/atajosSimulacion'
import { cifra } from './ui/medicion'
import { avisosDelCircuito, plural, type Aviso } from './ui/proyecto'
import type { AnalisisDoc } from '../../compartido/analisis/config'
import { AlmacenAnalisis } from './analisis/almacen'
import { armarContexto } from './analisis/contexto'
import { seleccionDeGuardadas } from './analisis/ejecucion'
import { analisisNuevo, nombraPiezaAusente, reconciliarAnalisis, seDescartaAlCancelar, tipoDeFicha, type TipoFicha } from './analisis/fichas'
import FichaAnalisis from './ui/FichaAnalisis'
import { describirSeleccion } from './ui/cinta/descripcionSeleccion'
import PanelGraficas from './ui/PanelGraficas'
import { crearEnlaceVentana } from './ui/grafica/enlaceVentana'
import { crearEnlaceOsc } from './ui/osciloscopio/enlaceVentanaOsc'
import { copiarPantalla, cursoresAOsc, despacharComando, memoPorClave, type AccionesOsc } from './ui/osciloscopio/traspasoOsc'
import type { CongeladaOsc, DatosOsc, PantallaOsc } from '../../compartido/ventanaOsc'
import DialogoGrafica from './ui/grafica/DialogoGrafica'
import { entradaDeCorrida } from './ui/grafica/entrada'
import { exportarGrafica } from './ui/grafica/exportarGrafica'
import type { EntradaFigura } from './ui/grafica/figura'
import type { GraficaDoc } from '../../compartido/grafica/aspecto'
import { anotacionesParaDoc, escribirAnotaciones, type Anotaciones } from '../../compartido/grafica/anotaciones'
import type { CorridaGuardada } from './analisis/almacen'
import { chipsDeVoltaje } from './lienzo/chips'
import type { CapaSim } from './lienzo/capaSim'
import { idAleatorio } from './doc/ids'
import { abreMedicionesAlSimular, pestañaAlSimular, pestañaInicialFranja } from './ui/franja'
import { cuentas } from './ui/cuentas'
import { nombresDeRedes } from './ui/redes'
import { Demora } from './ui/demora'
import { agregarAlRegistro, copiarAlPortapapeles, textoDelRegistro, type EntradaRegistro } from './ui/registro'
import Riel, { NOMBRE_PANEL, NOMBRE_PANEL_DERECHO, RielDerecho } from './ui/Riel'
import { vistaInspector, type VistaInspector } from './ui/vistaInspector'
import { esDeFigura, esDeMenu, esDeMenuDeCinta, esDePagina, FIGURA_DE_COMANDO, ORDEN_DE_PAGINA, type IdComando } from './ui/cinta/comandos'
import { crearEjecutor, type Acciones } from './ui/cinta/ejecutar'
import { mismoEstadoCinta, razonDeshabilitado, textoReloj, type EstadoCinta } from './ui/cinta/estado'
import { DECISIONES } from './ui/cinta/decisiones'
import { lugarDeTecla } from './ui/cinta/modelo'
import { Movimiento } from './lienzo/movimiento'
import { FasesDeFlechas, instanciasDeFlechas, type FlechasSim } from './lienzo/flechas'
import { VigiaDeDestellos } from './lienzo/luces'
import { Altavoz, PlanDeSonido, type ContextoAudio, type FormaOnda, type FuenteSonora } from './sim/sonido'
import type { AvanceSim } from './sim/control'
import { anuncioDeVelocidad, divisionDeVista, formatearTiempo, intervaloDe, masLenta, masRapida, textoCantidad, textoDelta, VELOCIDAD_INICIAL, type DeltaAvance } from './ui/tiempo/velocidades'
import DialogoTiempo from './ui/DialogoTiempo'
import { conAvance } from './ui/tutorial/avance'
import { arranqueDeCapitulo } from './ui/tutorial/arranques'
import { capituloPorId } from './ui/tutorial/capitulos'
import { crearControlTutorial } from './ui/tutorial/control'
import AcercaDe from './ui/AcercaDe'
import OfertaTutorial from './ui/tutorial/OfertaTutorial'
import { aplicarEleccion, reanudar } from './ui/tutorial/reanudar'
import ReanudarTutorial from './ui/tutorial/ReanudarTutorial'
import SelectorTutorial from './ui/tutorial/SelectorTutorial'
import Tutorial from './ui/tutorial/Tutorial'
import type { CtxTutorial } from './ui/tutorial/tipos'
import { leerValor } from './valores/valores'

interface KirchiProbe {
  ready: boolean
  isolated: boolean
  fps(): FrameStats
  medir(si: boolean): void
  cuadros(): number
  /** Cuántas veces se dibujó la pantalla del osciloscopio. */
  pantallas(): number
  /** El mínimo (ms) de dibujar cuatro canales y A − B a 2,560 columnas en un canvas de verdad. */
  medirPantalla(): number
  doc(): Documento
  conexiones(): { redes: number; redDePin: Record<string, number>; uniones: Punto[] }
  cargar(doc: Documento): void
  cargarDemo(n: number): void
  aPantalla(x: number, y: number): Punto
  errores(): string[]
  herramienta(): Herramienta
  /** Efectos de confirmación vivos en el lienzo. */
  animando(): number
  /** Textos de la escena dibujada, con su ancho medido por el reparto. */
  textos(): Texto[]
  /** Chips de voltaje que se están dibujando (vista previa), con la llave de su red. */
  chips(): { texto: string; x: number; y: number; clave: string }[]
  /** Ids de los comandos del registro de atajos (para comprobar la hoja de atajos). */
  atajos(): string[]
  /** Último punto de rejilla del cursor del editor (donde actúan Pegar, L, G y T). */
  cursor(): Punto
  /** Cuántas veces se calcularon los avisos y los nombres de red (no deben crecer con un filtro ni un paso de arrastre). */
  cuentas(): { avisos: number; nombres: number }
  /** Ids seleccionados por colección. */
  seleccion(): Record<string, string[]>
  /** El archivo abierto (ruta, nombre, solo lectura) y si tiene cambios sin guardar. */
  archivo(): EstadoArchivo & { sinGuardar: boolean }
  /** La vista previa: su fase y la última lectura por red (id → V) y por pieza (id → V, I, P). */
  /** `ratio`: fracción del tiempo real que alcanza la vista previa (1 = al ritmo del reloj). */
  simulacion(): { fase: FaseSim; t: number | null; ratio: number | null; redes: Record<string, number>; piezas: Record<string, { v: number; i: number; p: number }> }
  /** La lectura que dibujan el lienzo y los paneles en este momento (`simulacion()` lee del motor al pedirla). */
  vista(): { t: number | null; piezas: Record<string, { v: number; i: number; p: number }> }
  /** Las figuras se dibujan a media opacidad (vista previa activa). */
  figurasAtenuadas(): boolean
  /** Velocidad, avance, tramos con flechas, movimiento, animaciones, audio y costo (ms) de la última capa de la vista
   * previa. */
  tiempo(): { velocidad: number; avance: AvanceSim | null; flechas: number; movimiento: boolean; animaciones: boolean; audio: boolean; bloqueado: boolean; costoSim: number; msLectura: number }
}

declare global {
  interface Window {
    __kirchi?: KirchiProbe
  }
}

/** Pregunta modal en curso: guardar los cambios, o recuperar lo que quedó de un cierre inesperado. */
type Pregunta =
  | { tipo: 'guardar'; nombre: string; responder(r: Respuesta): void }
  | { tipo: 'recuperar'; recuperable: Recuperable; responder(r: RespuestaRecuperar): void }

const mods = (e: MouseEvent): Modificadores => ({ shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey, alt: e.altKey })
/** Sin nada dibujado: no hay qué exportar. */
const docVacio = (d: Documento): boolean =>
  !Object.keys(d.piezas).length && !Object.keys(d.cables).length && !Object.keys(d.etiquetas).length && !Object.keys(d.notas).length && !Object.keys(d.figuras ?? {}).length

/** Menú abierto: el del clic derecho (con su objetivo) o el de un botón (con el botón, para devolverle el foco). */
interface MenuAbierto {
  modelo: ModeloMenu
  x: number
  y: number
  hueco?: number
  objetivo?: ObjetivoMenu
  /** El menú es el de una plantilla de la Librería. */
  plantilla?: ItemPlantilla
  /** El menú es el de una categoría propia del panel Plantillas. */
  categoria?: { nombre: string; total: number }
  volverA?: HTMLElement
}

export default function App() {
  const libreria = libreriaIncluida()
  const editor = new Editor(libreria.piezas)
  const [estado, setEstado] = createSignal<EstadoEditor>(editor.estado(), { equals: false })
  // El documento llega a SolidJS solo por esta señal: sus elementos están congelados y el historial depende de que nadie los mute.
  const [doc, setDoc] = createSignal(editor.doc, { equals: false })
  const [cam, setCam] = createSignal<Camera>({ x: 0, y: 0, zoom: ZOOM_INICIAL })
  const [vista, setVista] = createSignal({ ancho: 0, alto: 0 })
  const [buscador, setBuscador] = createSignal<{ x: number; y: number; en: Punto } | null>(null)
  const [pedido, setPedido] = createSignal<PedidoTexto | PedidoCampos | null>(null)
  const [sinWebgl, setSinWebgl] = createSignal(false)
  const [menu, setMenu] = createSignal<MenuAbierto | null>(null)
  const [dialogo, setDialogo] = createSignal<'atajos' | 'configuracion' | 'tutorial' | 'oferta' | 'reanudar' | 'acerca' | null>(null)
  // Configuración abierta desde «Cambiar los atajos» de la hoja: entra con el foco en Atajos.
  const [configEnAtajos, setConfigEnAtajos] = createSignal(false)
  // La serie comercial de los ajustes llega al editor de valores; un cambio desde su conmutador se guarda por aquí.
  createEffect(() => sincronizarSerie(ajustes().serieComercial))
  alElegirSerie((s) => cambiarAjustes({ serieComercial: s }))
  onCleanup(() => alElegirSerie(undefined))
  const abrirConfiguracion = () => (setConfigEnAtajos(false), setDialogo('configuracion'))
  const [limpio, setLimpio] = createSignal(false)
  const [archivo, setArchivo] = createSignal<EstadoArchivo>(estadoNuevo())
  const [pregunta, setPregunta] = createSignal<Pregunta | null>(null)
  /** Diálogo de exportar abierto: el formato y el tamaño de la lámina que saldrá. */
  const [exportando, setExportando] = createSignal<{
    formato: FormatoExportar
    /** El circuito tiene instrumentos o medidores rápidos: el diálogo ofrece sus casillas. */
    hayInstrumentos: boolean
    hayMedidores: boolean
    /** El dibujo completo en mm del mundo, de donde parte un área nueva. */
    dibujoMm: AreaMm
    /** Lo seleccionado al abrir el diálogo, que es lo que exporta «Selección» (null: no había nada seleccionado). */
    docSeleccion: Documento | null
  } | null>(null)
  const [alcanceExportar, setAlcanceExportar] = createSignal<AlcanceExportar>('todo')
  /** El área de «Exportar › Área»: vive en la sesión del diálogo, no en el documento ni en los ajustes. */
  const [areaExportar, setAreaExportar] = createSignal<AreaMm | null>(null)
  /** Las anotaciones del diálogo de exportar el esquema: solo viven en la imagen, nunca en el documento ni en los ajustes. */
  const [notasExportar, setNotasExportar] = createSignal<Notas>([])
  /** Lo que mide una etiqueta nueva (Voltaje o Corriente): se recuerda en la sesión. */
  const [magnitudExportar, setMagnitudExportar] = createSignal<'voltaje' | 'corriente'>('voltaje')
  /** El punto de operación del circuito, resuelto aparte mientras el exportar está abierto y la vista previa no corre. */
  const [lecturaOp, setLecturaOp] = createSignal<Lectura | null>(null)
  // Sin preload (navegador, Vitest) no hay archivos: el control lo dice al intentar abrir o guardar.
  const api = apiArchivos()
  // Una sola vez al arrancar: avisa a los lectores de pantalla que el Registro trae mensajes de la librería.
  const [anuncio, setAnuncio] = createSignal('')
  // Los tres paneles arrancan plegados. Con errores en la librería la pestaña queda en el Registro, que es
  // donde se leen (el anuncio y la insignia del Registro los avisan sin abrir la franja).
  const [instrumentos, setInstrumentos] = createSignal<{ abierta: boolean; pestaña: Pestaña }>({
    abierta: false,
    pestaña: pestañaInicialFranja(libreria.errores.length)
  })
  const [ajustes, setAjustes] = createSignal<Ajustes>(ajustesIniciales())
  const [registro, setRegistro] = createSignal<EntradaRegistro[]>(
    libreria.errores.reduce((l, e) => agregarAlRegistro(l, e, 'error', new Date()), [] as EntradaRegistro[])
  )
  // Cambiar de tema o de color de cables recolorea todo sin tocar el documento: la paleta es solo de la vista.
  const paleta = createMemo(() => paletaDeTema(ajustes().tema, ajustes().colorCables))
  const atajos = new Atajos()
  // El registro no es reactivo: esta versión sube al registrar los comandos y al cambiar las teclas
  // propias, y quien muestra una tecla la lee con `teclaDe`, así la barra, los paneles y la pista la siguen.
  const [versionAtajos, setVersionAtajos] = createSignal(0)
  const teclaDe = (id: string): string | undefined => (versionAtajos(), atajos.teclasDe(id)[0])

  // Todo lo que llega al Registro también se anuncia por la región viva (colocar con el teclado se dice así).
  /** El aviso breve sobre el lienzo (convertir un medidor de corriente); se cierra solo. */
  const [avisoLienzo, setAvisoLienzo] = createSignal<string | null>(null)
  const registrar = (texto: string, tipo: EntradaRegistro['tipo'] = 'aviso') => {
    setRegistro((l) => agregarAlRegistro(l, texto, tipo, new Date()))
    setAnuncio('')
    queueMicrotask(() => setAnuncio(texto))
  }

  // Respuestas del proceso principal sobre los ajustes: solo la de la última petición se adopta.
  const pedidosAjustes = new UltimaRespuesta()
  /** Aplica un parche de ajustes, lo guarda en settings.json y adopta lo que el proceso principal normalizó. */
  /** La pestaña de la cinta se guarda al dejar de recorrerla con las flechas, no en cada una. */
  const demoraPestaña = new Demora(400)
  // Lo que devuelve el proceso principal no cambia qué paneles están abiertos: eso lo decide la sesión (arrancan plegados).
  const adoptarAjustes = (r: Ajustes) => setAjustes((a) => ({ ...r, lateral: a.lateral, inspector: a.inspector }))
  const cambiarAjustes = (parche: Partial<Ajustes>) => {
    // Lo que el proceso principal devuelve reemplaza los ajustes: antes se guarda la pestaña pendiente, o volvería atrás.
    demoraPestaña.vaciar()
    setAjustes((a) => aplicarParche(a, parche))
    const vigente = pedidosAjustes.pedir()
    guardarAjustes(parche)
      .then((r) => {
        if (r && vigente()) adoptarAjustes(r)
      })
      .catch(() => registrar('No se pudieron guardar los ajustes; siguen vigentes en esta sesión.', 'error'))
  }

  // Autoguardado: cada cambio del historial va al diario, que lo escribe como mucho un segundo después y
  // nunca a mitad de un arrastre. La base del diario la ponen abrir, nuevo, guardar y recuperar.
  const diario = new Diario(
    {
      anotar: (r) => api?.diarioAnotar(r),
      nuevaBase: (d) => api?.diarioBase(escribirKir(d, VERSION), { ruta: control.estado.ruta, nombre: control.estado.nombre, sucio: editor.historial.sinGuardar })
    },
    () => editor.doc,
    () => editor.estado().arrastrando
  )
  editor.historial.suscribir(diario.alCambiar)

  /** Error de archivo que el usuario tiene que ver: va al Registro y la franja se abre en él. */
  const errorDeArchivo = (t: string) => {
    registrar(t, 'error')
    setInstrumentos({ abierta: true, pestaña: 'registro' })
  }
  // Voltajes en el lienzo: ocultos por omisión; la tecla V los muestra todos, el ratón sobre una red muestra el suyo
  // y cada chip se puede mover un poco (solo durante la sesión, no se guarda en el documento).
  const [voltajes, setVoltajes] = createSignal(false)
  const desplazosChips: Desplazos = new Map()
  let punteroMundo: Punto | null = null
  /** Qué redes llevaban chip la última vez que se rehízo la capa de la vista previa. */
  let ultimasRedesChips = ''
  let arrastreChip: { clave: string; inicio: Punto; base: Desplazo } | null = null
  /** Arrastre sobre un potenciómetro durante la vista previa: su cursor sigue al puntero. */
  let arrastrePot: { id: Id; desde: Punto; pos0: number; eje: { x: number; y: number; largo: number }; gesto: string } | null = null
  let nArrastresPot = 0
  let restoRueda = 0
  const control = new ControlArchivo({
    api,
    editor,
    diario,
    version: VERSION,
    ui: {
      preguntarGuardar: (nombre) => new Promise<Respuesta>((responder) => setPregunta({ tipo: 'guardar', nombre, responder })),
      ofrecerRecuperar: (recuperable) => new Promise<RespuestaRecuperar>((responder) => setPregunta({ tipo: 'recuperar', recuperable, responder })),
      registrar: (t, nivel) => registrar(t, nivel),
      error: errorDeArchivo,
      anunciar: (t) => {
        setAnuncio('')
        queueMicrotask(() => setAnuncio(t))
      },
      cargado: () => {
        lienzo?.encuadrar()
        desplazosChips.clear()
      },
      recientes: (l) => setAjustes((a) => ({ ...a, archivosRecientes: l })),
      estado: (e) => setArchivo(e),
      // «Aprende Kirchi»: los pasos de Archivo se cumplen con lo que de verdad ocurrió en el disco, no con los clics.
      hecho: (e) => tutorial.registrar(e)
    }
  })
  // Vista previa: el control arma la netlist y habla con el worker; la interfaz lee a 10 Hz mientras está activa.
  const [fase, setFase] = createSignal<FaseSim>('detenida')
  const [lectura, setLectura] = createSignal<Lectura | null>(null)
  // Las piezas que pasan un límite de su hoja de datos ahora mismo, para marcarlas en el panel Proyecto. El mapa solo se
  // reemplaza si cambia (las lecturas llegan varias veces por segundo).
  const excedidasSim = createMemo<ReadonlyMap<Id, string>>(
    (previo) => {
      const nuevo = new Map<Id, string>()
      for (const [id, a] of lectura()?.avisos ?? []) if (a.excedido) nuevo.set(id, a.texto)
      if (nuevo.size === previo.size && [...nuevo].every(([k, v]) => previo.get(k) === v)) return previo
      return nuevo
    },
    new Map()
  )
  let lecturas: ReturnType<typeof setTimeout> | undefined
  // La velocidad y el intervalo de F6 son de la sesión de la ventana; lo demás va en los ajustes.
  const [velocidad, setVelocidad] = createSignal(VELOCIDAD_INICIAL)
  const [delta, setDelta] = createSignal<DeltaAvance>('automatico')
  const [avance, setAvance] = createSignal<AvanceSim | null>(null)
  /** A cuántos avances anteriores puede volver Retroceder (el motor guarda los últimos 200). */
  const [retrocesos, setRetrocesos] = createSignal(0)
  const [dialogoTiempo, setDialogoTiempo] = createSignal<'hasta' | 'delta' | null>(null)
  /** Lo que dijo el último avance de un paso de cálculo («Un paso de cálculo de 1.23 µs»), en la barra de estado hasta el siguiente. */
  const [ultimoPaso, setUltimoPaso] = createSignal<string | null>(null)
  // Con prefers-reduced-motion las animaciones empiezan en pausa; encenderlas a mano vale para la sesión.
  const movimientoReducido = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  const [animacionesSesion, setAnimacionesSesion] = createSignal<boolean | null>(null)
  const animaciones = () => animacionesSesion() ?? (ajustes().simulacion.animaciones && !movimientoReducido)
  const [sonidoBloqueado, setSonidoBloqueado] = createSignal(false)
  const movimiento = new Movimiento()
  const destellos = new VigiaDeDestellos()
  let fases: FasesDeFlechas | null = null
  let flechas: FlechasSim | null = null
  /** Los tramos de las fases de las flechas: con otro reparto (una recarga) las fases empiezan de nuevo. */
  let tramosDeFases: readonly unknown[] | null = null
  /** Las piezas que dibujan algo propio en la capa de la vista previa, armada al arrancar (el circuito no se edita corriendo). */
  let piezasDeCapa: Pieza[] | undefined
  const plan = new PlanDeSonido()
  // El contexto de audio se crea la primera vez que algo suena, siempre después del gesto que inició la simulación.
  const altavoz = new Altavoz(() => (typeof AudioContext === 'function' ? (new AudioContext() as unknown as ContextoAudio) : null), () => performance.now(), setSonidoBloqueado)
  /** Suena solo corriendo, a la vista, sin avances ni «Sin límite de tiempo real», y con el sonido encendido. */
  const sonidoActivo = () => ajustes().simulacion.sonido && fase() === 'corriendo' && !avance() && Number.isFinite(velocidad()) && (typeof document === 'undefined' || document.visibilityState === 'visible')
  const callar = () => altavoz.aplicar(plan.callarTodo(performance.now()))
  /** Qué suena de una pieza: el zumbador con el tono de su propiedad, el relé con su clic. */
  const fuenteSonora = (id: Id): FuenteSonora => {
    const p = editor.doc.piezas[id]
    const def = p ? editor.lib.get(p.tipo) : undefined
    if (!p || !def) return null
    if (def.modelo?.tipo === 'rele') return { tipo: 'rele' }
    const a = def.animacion
    if (a?.tipo !== 'sonido') return null
    const f = leerValor(p.props[a.frecuencia] ?? def.props.find((d) => d.id === a.frecuencia)?.defecto ?? '')
    return f && f.valor > 20 && f.valor < 20000 ? { tipo: 'zumbador', frecuencia: f.valor, onda: a.onda as FormaOnda } : null
  }
  /** Última fase estable (detenida, corriendo o en pausa) que ya se anunció. */
  let faseAnunciada: FaseSim = 'detenida'
  const sim = new ControlSimulacion({
    crearMotor: () => new SimClient(),
    circuito: () => ({ doc: editor.doc, lib: editor.lib, con: editor.con }),
    registrar: (t, tipo) => (tipo === 'error' ? errorDeArchivo(t) : registrar(t, tipo)),
    // Los cambios de estado que se oyen se programan desde el instante del motor.
    cruces: (c, pieza) => {
      if (sonidoActivo()) altavoz.aplicar(plan.cruces(c, pieza, fuenteSonora))
    },
    avance: (a) => {
      setAvance(a)
      if (a) {
        callar()
        leerDuranteAvance()
      } else {
        leerSim()
        lienzo?.invalidarSimulacion()
      }
    },
    retrocesos: setRetrocesos,
    quemar: () => ajustes().simulacion.quemar,
    fase: (f) => {
      const antes = fase()
      setFase(f)
      // Al arrancar, la escena deja el rotor y la armadura a la capa de movimiento; al pausar o detener, todo calla.
      if (antes === 'detenida' && f !== 'detenida') {
        movimiento.preparar(editor.doc, editor.lib)
        piezasDeCapa = piezasDeCapaSim(editor.doc, editor.lib)
        lienzo?.invalidarEscena()
      }
      if (f !== 'corriendo') callar()
      editor.ponerSimulando(f !== 'detenida')
      lienzo?.ponerFigurasAtenuadas(f !== 'detenida')
      if (f === 'detenida') {
        // Los estados lógicos vuelven a lo que dice el documento.
        if (antes !== 'detenida') lienzo?.invalidarEscena()
        arrastreChip = null
        arrastrePot = null
        ultimasRedesChips = ''
        soltarSostenido(undefined, true)
        setLectura(null)
        movimiento.reiniciar()
        destellos.reiniciar()
        fases = null
        tramosDeFases = null
        piezasDeCapa = undefined
        flechas = null
        setUltimoPaso(null)
      }
      // Se lee a 10 Hz solo mientras arranca o corre: en pausa no hay nada nuevo que leer y el temporizador se detiene.
      if (leeCadaCiclo(f)) {
        if (!lecturas) programarLectura()
      } else {
        clearTimeout(lecturas)
        lecturas = undefined
      }
      // Al quedar corriendo se lee de inmediato (sin esperar el primer ciclo de 100 ms, los cables no pasan por el color de
      // edición) y al quedar en pausa se hace una última lectura, que es la que se queda en pantalla.
      if (f === 'corriendo') setLectura(leerSim())
      else if (f === 'pausada') leerSim()
      // Los lectores de pantalla oyen cada cambio de fase una sola vez.
      const dicho = anuncioDeFase(faseAnunciada, f)
      faseAnunciada = dicho.estable
      if (dicho.texto) {
        const t = dicho.texto
        setAnuncio('')
        queueMicrotask(() => setAnuncio(t))
      }
      // La franja se abre sola al simular según lo conectado: Osciloscopio o Registro con avisos de conexión; sin nada
      // de eso queda plegada. Una franja que el usuario (o un paso del tutorial) ya abrió no se cambia.
      if (antes === 'detenida' && f === 'arrancando' && !instrumentos().abierta) {
        const p = pestañaAlSimular(sim.arranque?.instrumentos, sim.arranque?.problemas ?? 0)
        if (p) pestaña(p)
      }
      // Un multímetro conectado abre Mediciones a la derecha, salvo que el panel derecho ya esté abierto.
      if (antes === 'detenida' && f === 'arrancando' && !ajustes().inspector && abreMedicionesAlSimular(sim.arranque?.instrumentos)) cambiarAjustes({ panelDerecho: 'mediciones', inspector: true })
      lienzo?.invalidarSimulacion()
    }
  })
  /** El botón principal y F5: simula, pausa o reanuda. */
  // El motor integra las corrientes por terminal aunque las flechas estén apagadas si algo las lee (ajuste, sondas, exportar).
  createEffect(() => sim.ponerCorrientes(ajustes().simulacion.corriente || haySondasDeCorriente(doc()) || (!!exportando() && fase() !== 'detenida') || (!!exportando() && notasExportar().some((n) => n.tipo === 'lectura' && n.magnitud === 'corriente'))))
  /** B12: con la simulación detenida, cada multímetro en Ω o Continuidad resuelve un punto de operación con fuentes
   * apagadas, 200 ms después del último cambio. */
  const [ohmiosDetenido, setOhmiosDetenido] = createSignal<Awaited<ReturnType<ControlSimulacion['ohmiosDetenido']>>>(new Map())
  createEffect(() => {
    const f = fase()
    void doc()
    if (f !== 'detenida') {
      setOhmiosDetenido(new Map())
      return
    }
    let vigente = true
    const cancelar = new AbortController()
    const t = setTimeout(() => {
      sim.ohmiosDetenido(undefined, cancelar.signal).then(
        (m) => vigente && setOhmiosDetenido(m),
        () => vigente && setOhmiosDetenido(new Map())
      )
    }, 200)
    onCleanup(() => {
      vigente = false
      clearTimeout(t)
      // Termina el worker de un solo uso si todavía medía.
      cancelar.abort()
    })
  })
  createEffect(() => {
    if (!exportando() || fase() !== 'detenida') {
      setLecturaOp(null)
      return
    }
    const d = doc()
    // Un cambio del documento invalida la lectura anterior: mientras se recalcula, las etiquetas dicen «sin lectura».
    setLecturaOp(null)
    let vigente = true
    const cancelar = new AbortController()
    const t = setTimeout(() => {
      const { lib, con } = { lib: editor.lib, con: editor.con }
      let r: ReturnType<typeof compilarNetlist>
      let p: ReturnType<typeof pedidoOperacion>
      try {
        r = compilarNetlist(d, lib, con)
        p = pedidoOperacion(r)
      } catch {
        return setLecturaOp(null)
      }
      if (!p || limitesExcedidos(p.netlist)) return setLecturaOp(null)
      medirOperacion(p, cancelar.signal).then(
        (c) => vigente && setLecturaOp(lecturaDeOperacion(d, lib, con, r, c)),
        () => vigente && setLecturaOp(null)
      )
    }, 150)
    onCleanup(() => {
      vigente = false
      clearTimeout(t)
      cancelar.abort()
    })
  })
  /** El pitido de continuidad también suena con la simulación detenida, al seguir a la lectura de ese multímetro. */
  createEffect(() => {
    const hayPaso = [...ohmiosDetenido().values()].some((m) => m.texto.endsWith('hay paso'))
    if (fase() !== 'detenida' || !ajustes().simulacion.sonido || (typeof document !== 'undefined' && document.visibilityState !== 'visible')) return
    altavoz.aplicar(plan.continuidadEs(hayPaso, performance.now()))
  })
  /** La cifra de las sondas de corriente con la histéresis de su última cifra; se vacía al detener. */
  const histeresisSondas = new Histeresis(3)
  createEffect(on(fase, (f) => f === 'detenida' && histeresisSondas.reiniciar()))
  const simularOPausar = () => {
    if (sim.avance) return sim.interrumpir()
    if (sim.fase === 'detenida') void sim.iniciar()
    else if (sim.fase === 'corriendo') sim.pausar()
    else if (sim.fase === 'pausada') sim.reanudar()
  }
  /** Botón sostenido: se suelta al levantar ratón o tecla, perder el foco o detener. Con «enclavado» queda presionado
   * hasta pulsarlo otra vez; perder el foco no lo suelta. */
  const sostenidos = new Sostenidos()
  const [enclavados, setEnclavados] = createSignal<ReadonlySet<Id>>(new Set())
  const refrescarEnclavados = () => setEnclavados(new Set(sostenidos.enclavados()))
  /** El símbolo de un interruptor o botón accionado cambia (accionado.svg): la escena y la selección se rehacen. */
  const redibujarAccionado = () => {
    lienzo?.invalidarEscena()
    lienzo?.invalidarSuperposicion()
  }
  /** Cada lectura del motor pasa por aquí: rotor y contactos toman su estado, las flechas acumulan fase y el sonido revisa
   * la continuidad. */
  const leerSim = (): Lectura | null => {
    const l = sim.leer()
    if (!l) return null
    const ahora = performance.now()
    const pausadas = !animaciones() || fase() !== 'corriendo' || !!avance()
    movimiento.actualizar(editor.lib, l, velocidad(), ahora, pausadas)
    // Las flechas son de la corriente animada; con ella apagada, las corrientes llegan solo para las sondas.
    const c = ajustes().simulacion.corriente ? l.corrientes : undefined
    if (c) {
      if (!fases || tramosDeFases !== c.tramos) {
        fases = new FasesDeFlechas(c.tramos.length)
        tramosDeFases = c.tramos
      }
      const r = instanciasDeFlechas(c.tramos, c.media, c.absoluta, velocidad(), ajustes().simulacion.velocidadFlechas, fases, ahora, pausadas)
      flechas = { ...r, desde: ahora, pausadas }
    } else flechas = null
    if (sonidoActivo()) {
      const continuidad = [...(sim.leerInstrumentos()?.multimetros.values() ?? [])].some((m) => m.texto.endsWith('hay paso'))
      altavoz.aplicar([...plan.revisar(ahora), ...plan.continuidadEs(continuidad, ahora)])
    }
    setLectura(l)
    return l
  }
  /** Con movimiento o cámara lenta el lienzo lee a 30 Hz si la última capa costó menos de 3 ms; si no, a 10 Hz. */
  const msLectura = () => (lienzo && lienzo.costoSim < 3 && (velocidad() < 1 || (animaciones() && (ajustes().simulacion.corriente || !movimiento.vacio))) ? 1000 / 30 : 100)
  const programarLectura = () => {
    lecturas = setTimeout(() => {
      leerSim()
      lienzo?.invalidarSimulacion()
      if (leeCadaCiclo(sim.fase)) programarLectura()
      else lecturas = undefined
    }, msLectura())
  }
  /** Mientras dura un avance la vista previa está en pausa: se lee a 10 Hz para ver cómo va. */
  const leerDuranteAvance = () => {
    const t = setInterval(() => {
      if (!sim.avance) return clearInterval(t)
      leerSim()
      lienzo?.invalidarSimulacion()
    }, 100)
  }
  // Tras un cambio en caliente se lee del motor en cada cuadro un momento, sin esperar la lectura de 10 Hz.
  const porCuadro = new LecturaPorCuadro()
  // El ritmo de la vista previa y si la barra va en ámbar por él (con histéresis: no parpadea alrededor del 100 %).
  // Sin igualdad: cada lectura (10 Hz) vuelve a evaluar la histéresis aunque el ritmo no cambie de valor.
  const tiempoReal = createMemo(() => (fase() === 'corriendo' ? (lectura()?.ratio ?? null) : null), undefined, { equals: false })
  const histeresisRitmo = new HisteresisDeRitmo()
  const ritmoLento = createMemo(() => histeresisRitmo.actualizar(tiempoReal(), performance.now()), false)
  const leerPorCuadros = () => {
    if (!porCuadro.pedir()) return
    const cuadro = () => {
      if (!porCuadro.cuadro(leeTrasCambio(fase()))) return
      leerSim()
      lienzo?.invalidarSimulacion()
      requestAnimationFrame(cuadro)
    }
    requestAnimationFrame(cuadro)
  }
  /** Conmuta un interruptor o sostiene un botón. `via` dice con qué se apretó; true si la pieza era accionable. */
  const accionarPieza = (id: Id, via: string): boolean => {
    if (!sim.activa) return false
    // Una pieza quemada se repone con un clic, como un fusible fundido.
    if (sim.quemada(id)) {
      const repuesta = sim.reponerQuemada(id)
      if (repuesta) leerPorCuadros()
      return repuesta
    }
    const pieza = editor.doc.piezas[id]
    const def = pieza ? editor.lib.get(pieza.tipo) : undefined
    const accion = accionDeClic(def)
    // Un fusible fundido se repone; uno entero no se acciona (el clic lo selecciona).
    if (accion === 'reponer') {
      const repuesto = fusibleFundido(id) && sim.reponer(id)
      if (repuesto) leerPorCuadros()
      return repuesto
    }
    const actual = sim.opcionDe(id)
    if (!accion || !def || actual === undefined || (def.modelo?.tipo !== 'interruptor' && def.modelo?.tipo !== 'estado-logico')) return false
    if (accion === 'conmutar') {
      const otra = otraOpcion(def, actual)
      if (otra) {
        void sim.accionar(id, otra).then(redibujarAccionado)
        leerPorCuadros()
      }
    } else if (def.modelo.tipo === 'interruptor') {
      // Se pueden sostener varios botones a la vez. Uno ya sostenido no se vuelve a apretar; si estaba enclavado y se aprieta
      // en el lienzo, pasa a sostenerse con el puntero: al soltarlo queda suelto.
      const r = sostenidos.apretar(id, via, actual === def.modelo.cerrado ? (otraOpcion(def, actual) ?? actual) : actual)
      refrescarEnclavados()
      if (r !== 'nuevo') return true
      void sim.accionar(id, def.modelo.cerrado).then(redibujarAccionado)
      leerPorCuadros()
    }
    return true
  }
  /** Clic durante la vista previa: un interruptor conmuta, un botón se sostiene; true si lo atendió. */
  const accionarEn = (p: Punto): boolean => {
    if (!sim.activa) return false
    const o = editor.objetivoMenu(p)
    return o.tipo === 'pieza' && accionarPieza(o.id, 'puntero')
  }
  /** Abre el contacto de cada botón soltado. */
  const abrirSoltados = (soltados: readonly { id: Id; suelto: string }[]): boolean => {
    for (const s of soltados) void sim.accionar(s.id, s.suelto).then(redibujarAccionado)
    refrescarEnclavados()
    if (soltados.length) leerPorCuadros()
    return soltados.length > 0
  }
  /** Suelta los botones sostenidos por `via` (sin `via`, todos salvo los enclavados; con `todo`, también esos). */
  const soltarSostenido = (via?: string, todo = false): boolean =>
    abrirSoltados(via !== undefined ? sostenidos.soltarVia(via) : todo ? sostenidos.soltarTodos() : sostenidos.soltarTransitorios())
  /** «Mantener pulsado» del inspector: presiona el botón y lo deja así hasta volver a pulsarlo (cada botón por separado). */
  const alternarEnclavado = (id: Id) => {
    if (sostenidos.estaEnclavado(id)) abrirSoltados([sostenidos.soltarId(id)!])
    else accionarPieza(id, 'enclavado')
  }
  /** Si el fusible `id` está fundido según la última lectura de la vista previa. */
  const fusibleFundido = (id: Id): boolean => {
    const x = lectura()?.piezas.get(id)?.extra
    return x?.tipo === 'fusible' && x.fundido
  }
  /** El interruptor, botón o fusible fundido que es lo único seleccionado, mientras corre la vista previa. */
  const accionable = () => {
    const a = sim.activa ? accionableSeleccionado(editor.doc, editor.lib, editor.seleccion) : null
    return a?.tipo === 'reponer' && !fusibleFundido(a.id) ? null : a
  }

  /** La red de la llave de un chip (las llaves sobreviven a recalcular las conexiones; el número de red no). */
  const redDeClave = (clave: string): number | undefined => editor.con.redes.find((r) => claveDeRedChip(r) === clave)?.id
  /** Redes que llevan chip ahora: todas con la tecla V; si no, la del ratón (cable, pin o etiqueta, o el propio chip) y la que se arrastra. */
  const redesDeChips = (): ReadonlySet<number> | null => {
    if (voltajes()) return null
    const bajo = punteroMundo && lienzo ? chipEn(lienzo.chips, punteroMundo, MARGEN_HOVER_CHIP)?.clave : undefined
    return redesConChip({
      todos: false,
      bajoElRaton: redDeGolpe(editor.con, editor.estado().hover),
      bajoElChip: bajo === undefined ? undefined : redDeClave(bajo),
      arrastrada: arrastreChip ? redDeClave(arrastreChip.clave) : undefined
    })
  }
  const opcionesChips = (): OpcionesChips => ({ redes: redesDeChips(), desplazos: desplazosChips })
  /** Si cambió qué redes llevan chip, se rehace la capa de la vista previa (no en cada movimiento del ratón). */
  const revisarChips = () => {
    if (!sim.activa || !lienzo) return
    const r = redesDeChips()
    const clave = r === null ? '*' : [...r].sort((a, b) => a - b).join(',')
    if (clave === ultimasRedesChips) return
    ultimasRedesChips = clave
    lienzo.invalidarSimulacion()
  }
  const alternarVoltajes = () => {
    setVoltajes((v) => !v)
    ultimasRedesChips = ''
    lienzo?.invalidarSimulacion()
    setAnuncio('')
    queueMicrotask(() => setAnuncio(voltajes() ? 'Voltajes visibles en todas las redes.' : 'Voltajes ocultos. Pasa el ratón sobre una red para ver el suyo.'))
  }
  /** El potenciómetro seleccionado, con su posición, para el inspector y el Multímetro. */
  const potSel = (): PotVista | null => {
    estado()
    const id = editor.potSeleccionado()
    const p = id ? editor.doc.piezas[id] : undefined
    const def = p ? editor.lib.get(p.tipo) : undefined
    const m = def?.modelo?.tipo === 'pot' ? def.modelo : undefined
    const ley = p && def && m?.ley ? opcionDe(p, def, m.ley) : undefined
    return id && p ? { id, ref: p.ref, posicion: editor.posicionPot(id) ?? 50, ohms: ohmsDelPot(p, def!), ...(ley ? { ley } : {}), ...(m?.reostato ? { reostato: true } : {}) } : null
  }
  const cambiarPot = (posicion: number, gesto?: string) => {
    const id = editor.potSeleccionado()
    if (id) editor.cambiarPosicionPot(id, posicion, gesto)
  }
  /** Lo dicen los lectores de pantalla una vez que la rueda, el arrastre o el teclado dejan de mover el cursor. */
  let anuncioPot: ReturnType<typeof setTimeout> | undefined
  const anunciarPot = () => {
    clearTimeout(anuncioPot)
    anuncioPot = setTimeout(() => {
      const p = potSel()
      if (p) {
        setAnuncio('')
        queueMicrotask(() => setAnuncio(`${p.ref}: cursor al ${Math.round(p.posicion)} %.`))
      }
    }, 400)
  }
  /** Cursor sobre un chip de voltaje (se agarra) o el que pide el editor. */
  const cursorDelLienzo = (): string => {
    if (arrastreChip) return 'grabbing'
    if (arrastrePot) return 'ew-resize'
    if (sim.activa && punteroMundo && editor.potEn(punteroMundo)) return 'ew-resize'
    if (sim.activa && punteroMundo && lienzo && chipEn(lienzo.chips, punteroMundo)) return 'grab'
    const s = editor.estado()
    // Un texto de pieza que se toma con un clic (o que se arrastra) lleva el cursor de mover; la herramienta Figura, la cruz.
    return s.choque ? 'not-allowed' : s.asa ? cursorDeAsa(s.asa) : s.asaFigura ? cursorDeAsaFigura(s.asaFigura.asa) : s.herramienta === 'figura' ? 'crosshair' : s.texto ? 'move' : ''
  }

  /** El formato elegido en el diálogo de exportar el esquema (se cambia ahí mismo sin rehacer el diálogo). */
  const [formatoEsquema, setFormatoEsquema] = createSignal<FormatoExportar>('png')
  /** Abre el diálogo de exportar el esquema; con algo seleccionado puede abrir ya en «Selección». */
  const abrirExportar = (formato: FormatoExportar, alcance: AlcanceExportar = 'todo') => {
    const caja = construirEscena(editor.doc, editor.lib, editor.con, paletaDeTema('claro', ajustes().colorCables)).caja
    if (!caja) return
    // Lo seleccionado se guarda como documento aparte: el diálogo no se entera de lo que se seleccione después.
    const docSeleccion = documentoDeSeleccion(editor.doc, editor.seleccion)
    const hayInstrumentos = documentoSinInstrumentos(editor.doc, editor.lib) !== editor.doc
    setAlcanceExportar(alcance === 'seleccion' && docSeleccion ? 'seleccion' : 'todo')
    setAreaExportar(null)
    setFormatoEsquema(formato)
    setExportando({
      formato,
      hayInstrumentos,
      hayMedidores: hayMedidores(editor.doc),
      dibujoMm: { x: caja.minX * MM_POR_UNIDAD, y: caja.minY * MM_POR_UNIDAD, ancho: (caja.maxX - caja.minX) * MM_POR_UNIDAD, alto: (caja.maxY - caja.minY) * MM_POR_UNIDAD },
      docSeleccion
    })
    // Corriendo, se pausa al abrir: la vista previa y el archivo usan las lecturas de ese instante. Las corrientes se piden con el diálogo
    // ya abierto, así que se espera a que lleguen en un paso antes de pausar (pausada no integra nada y las etiquetas quedarían sin corriente).
    if (sim.fase === 'corriendo') {
      const t0 = performance.now()
      const espera = setInterval(() => {
        if (sim.fase !== 'corriendo') return clearInterval(espera)
        if (lectura()?.corrientes || performance.now() - t0 > 800) {
          clearInterval(espera)
          sim.pausar()
        }
      }, 25)
    }
  }
  // Exportar la captura del osciloscopio con vista previa: lo que se ve se congela mientras el diálogo está abierto.
  const [capturaExp, setCapturaExp] = createSignal<{ id: Id; ref: string; pantalla: PantallaSab; ajustes: AjustesOsciloscopio } | null>(null)
  const [exportandoCaptura, setExportandoCaptura] = createSignal(false)
  const pilasFuentes = () => {
    const f = fuentesDeCss()
    return { interfaz: f.interfaz, cifras: f.cifras, serif: f.serif }
  }
  const abrirExportarCaptura = async () => {
    const id = oscVisible()
    const c = congeladaVisible()
    const a = c?.ajustes ?? ajustesOscVisible()
    const p = c?.pantalla ?? (id ? sim.leerInstrumentos(id)?.pantalla : null)
    if (!id || !a || !p || p.ncol === 0) return
    // La captura entera (todo lo que conservan las sondas, desde el principio) y no solo la última pantalla; con la vista previa
    // detenida solo queda la última pantalla. Una pantalla congelada se exporta hasta el instante en que se congeló.
    const hasta = c ? c.pantalla.tCaptura : undefined
    // Las columnas finas viajan con la captura: el tramo que se elija sale de ellas, a su resolución plena (no de las 2,000 de toda la captura).
    const [ampliaSola, fino] = await Promise.all([sim.capturaAmplia(id, hasta), sim.registroFino(id, hasta)])
    const amplia = ampliaSola && fino ? { ...ampliaSola, fino } : ampliaSola
    const ref = doc().piezas[id]?.ref ?? ''
    if (amplia) setCapturaExp({ id, ref, pantalla: amplia, ajustes: { ...a, base: (amplia.dt * amplia.ncol) / DIVISIONES_H } })
    else {
      setCapturaExp({ id, ref, pantalla: p, ajustes: a })
      // Sin las muestras de exportación al día (se arman cada 250 ms), se piden ya y se toma la pantalla que las trae.
      if (!c && p.csv.n === 0 && fase() === 'corriendo') {
        sim.forzarPantallas()
        setTimeout(() => {
          const q = sim.leerInstrumentos(id)?.pantalla
          if (q && q.ncol > 0 && q.csv.n > 0 && capturaExp()?.id === id) setCapturaExp((x) => (x ? { ...x, pantalla: q } : x))
        }, 200)
      }
    }
  }
  /** El aspecto de la pantalla con sus anotaciones guardadas, para el editor de exportar. */
  const aspectoDeExportar = (): AspectoDeCaptura | undefined => {
    const a = aspectoOscVisible()
    return a ? { aspecto: a.aspecto, canales: a.canales, anotaciones: a.notas } : undefined
  }
  /** Guarda las anotaciones de la figura con el osciloscopio (propiedad `notas`); devuelve el motivo si no se pudo. */
  const guardarNotasOsc = (id: Id, a: Anotaciones): string | null => {
    const t = escribirAnotaciones(a)
    if (!t.ok) return t.error
    return editor.cambiarAjusteInstrumento(id, 'notas', t.texto) ?? null
  }
  /** Escribe la captura en el formato y con las opciones del diálogo (el archivo se elige al exportar). */
  const exportarCaptura = async (asp: AspectoDeCaptura) => {
    const x = capturaExp()
    if (!api || !x) return
    const op = ajustes().figura
    const base = `${archivo().nombre.replace(/\.kir$/i, '')} ${x.ref}`
    setExportandoCaptura(true)
    try {
      const ruta = await api.rutaExportar(op.formato, cambiarExtension(base, op.formato))
      if (!ruta) return
      let r
      if (op.formato === 'csv') r = await api.escribirExportacion(ruta, new TextEncoder().encode(aplicarFormatoCsv(csvDeCaptura(x.ref, conCanalesApagados(x.ajustes, asp.apagados), x.pantalla, asp.rango), op)))
      else {
        const fig = figuraDeCaptura(x.ref, x.ajustes, x.pantalla, op, temaEfectivo(asp.aspecto.tema, ajustes().tema), pilasFuentes(), asp)
        if (op.formato === 'png') r = await api.escribirExportacion(ruta, await pngDeFigura(fig, op, rasterizar, PPP_BASE))
        else {
          const fuentes = fuentesDeCss()
          const l = await svgDeFigura(fig, `Captura de ${x.ref}`, (ts) => cssDeFuentes(ts, fuentes))
          r = op.formato === 'svg' ? await api.escribirExportacion(ruta, new TextEncoder().encode(l.svg)) : await api.pdf(ruta, l.svg, { tipo: 'ajustar', anchoMm: l.anchoMm, altoMm: l.altoMm })
        }
      }
      if (r.ok) {
        registrar(`Se exportó la captura de ${x.ref}.`, 'info')
        setCapturaExp(null)
      } else errorDeArchivo(r.error)
    } catch (e) {
      errorDeArchivo(`No se pudo exportar la captura de ${x.ref}: ${e instanceof Error ? e.message : String(e)}.`)
    } finally {
      setExportandoCaptura(false)
    }
  }
  /** Exporta con las opciones guardadas: el diálogo de archivo, la lámina y el resultado al Registro. */
  /** La vista previa en marcha con su lectura: de ella salen los colores de voltaje y las lecturas de los medidores exportados. */
  const vivoExportar = (): VivoExportar | null => {
    const l = lectura()
    if (!sim.activa || !l) return null
    return { voltajes: voltajesDeCables(editor.doc, editor.con, l, sim.escala), lecturas: lecturasDeMedidores(editor.doc, editor.con, l, alternasDeMedidores()) }
  }
  /** Lo que necesita exportar el esquema (y su vista previa): la escena de lo elegido, la paleta, las fuentes y cómo rasterizar. */
  /** Las etiquetas de lectura del esquema exportado: qué hay bajo el clic y qué dice la lectura de la vista previa en ese punto (mm del mundo). */
  /** Con la vista previa en marcha o en pausa, la lectura de ese instante; detenida, el punto de operación. */
  const lecturaParaEtiquetas = (): Lectura | null => (sim.activa && lectura() ? lectura()! : lecturaOp())
  const lecturaEsquema: LecturaEsquema = {
    objetivoEn: (x, y, tol, m) => {
      const t = objetivoLectura(editor.doc, editor.lib, x / MM_POR_UNIDAD, y / MM_POR_UNIDAD, tol / MM_POR_UNIDAD, m)
      return t ? { x: t.x * MM_POR_UNIDAD, y: t.y * MM_POR_UNIDAD, cable: t.cable, pin: t.pin } : null
    },
    texto: (n) => textoDeLectura(editor.con, lecturaParaEtiquetas(), n),
    nota: () => notaDeLectura(lecturaParaEtiquetas(), !(sim.activa && lectura()))
  }
  const ctxNotasEsquema: ContextoNotas = {
    texto: (n) => lecturaEsquema.texto({ x: n.x, y: n.y, magnitud: n.magnitud, cable: n.cable, pin: n.pin }),
    nota: (n) => lecturaEsquema.nota?.({ x: n.x, y: n.y, magnitud: n.magnitud, cable: n.cable, pin: n.pin })
  }
  /** Lo que se ve al pedir el archivo (lecturas de etiquetas, voltajes y medidores), para que el archivo salga igual que la vista previa aunque el diálogo ya esté cerrado. */
  const congelarLecturas = () => {
    const l = lecturaParaEtiquetas()
    const ctx = contextoDeLecturaFija(editor.con, l, !(sim.activa && lectura()))
    return { vivo: vivoExportar(), ctx: { texto: (n: NotaLectura) => ctx.texto(n), nota: (n: NotaLectura) => ctx.nota(n) } as ContextoNotas }
  }
  const dependenciasEsquema = (alcance: AlcanceExportar, docSeleccion: Documento | null, conNotas = false, congelado?: ReturnType<typeof congelarLecturas>): DependenciasExportar => {
    const fuentes = fuentesDeCss()
    const ctxNotas = congelado?.ctx ?? ctxNotasEsquema
    const fuente: FuenteEscena = { doc: editor.doc, con: editor.con, lib: editor.lib, seleccion: docSeleccion, area: areaExportar(), vivo: congelado ? congelado.vivo : vivoExportar() }
    return {
      api,
      escena: (p, o) => escenaDeExportar(fuente, alcance, o, p),
      caja: cajaDeExportar(alcance, fuente.area),
      paleta: (t) => paletaDeTema(t, ajustes().exportar.tintaNegra ? 'tinta' : ajustes().colorCables),
      temaActual: ajustes().tema,
      fuentes,
      css: (ts) => cssDeFuentes(ts, fuentes),
      base: (t) => baseDeTexto(t, fuentes),
      rasterizar,
      dibujarTextos: (ctx, ts, c, p) => dibujarTextos(ctx, [...ts], c, 1, p, fuentes),
      nombre: archivo().nombre,
      ...(conNotas && notasExportar().length ? { superponer: (svg, tema) => conNotasEnSvg(svg, notasExportar(), { tema, ctx: ctxNotas }) } : {}),
      // «Todo» abarca todas las anotaciones; con un área o una selección, las que tocan algo de ahí. También en la vista previa, que las dibuja el diálogo.
      ...(notasExportar().length ? { cajaNotas: (dibujo) => cajaDeNotas(notasExportar(), ctxNotas, alcance === 'todo' ? null : dibujo) } : {})
    }
  }
  const hacerExportar = async (formato: FormatoExportar, alcance: AlcanceExportar, docSeleccion: Documento | null) => {
    // Se congela antes de cerrar el diálogo: al cerrarlo la vista previa deja de pedir corrientes y las etiquetas perderían su valor.
    const congelado = congelarLecturas()
    setExportando(null)
    const r = await exportar(formato, ajustes().exportar, dependenciasEsquema(alcance, docSeleccion, true, congelado))
    if (r.ok) {
      registrar(r.mensaje, 'info')
      if (r.aviso) registrar(r.aviso)
      tutorial.registrar(alcance === 'seleccion' ? 'exportado-seleccion' : 'exportado')
    } else if ('error' in r) errorDeArchivo(r.error)
  }
  /** Cierra la pregunta en curso y le da su respuesta a quien la hizo. */
  const responder = <R,>(f: (r: R) => void) => (r: R) => {
    setPregunta(null)
    f(r)
  }

  createEffect(() => {
    document.documentElement.dataset.tema = ajustes().tema
  })
  let contenedor!: HTMLDivElement
  let lienzo: Lienzo | undefined

  const globo = () => {
    const est = estado()
    void cam()
    // Sobre un lugar ocupado el globo dice con qué pieza se encimaría, 3 unidades arriba del cursor para no tapar el fantasma.
    if (est.choque && lienzo) {
      const p = lienzo.aPantalla({ x: editor.cursor.x, y: editor.cursor.y - 3 })
      return { texto: `Se encima con ${est.choque.ref}.`, x: p.x, y: p.y }
    }
    const h = est.hover
    // Una etiqueta bajo el ratón dice con qué se une.
    if (h?.tipo === 'etiqueta' && lienzo) {
      const lineas = globoDeEtiqueta(est.doc, est.con, h.id)
      const s = lienzo.aPantalla(editor.cursor)
      if (lineas) return { texto: lineas.join(' '), lineas, x: s.x, y: s.y }
    }
    // Una sonda bajo el ratón dice qué mide y cómo se mueve.
    if (h?.tipo === 'sonda' && lienzo) {
      const texto = globoDeSonda(est.doc, est.con, h.id)
      const s = lienzo.aPantalla(editor.cursor)
      if (texto) return { texto, lineas: texto.split(' · '), x: s.x, y: s.y }
    }
    // Durante la vista previa, el cable bajo el cursor dice su red y su voltaje.
    const l = lectura()
    if (l && h?.tipo === 'cable' && lienzo) {
      const red = editor.con.redDeCable.get(h.id)
      const v = red === undefined ? undefined : l.redes.get(red)
      // Si la red lleva chip, el chip ya dice su voltaje (el ratón lo muestra): el globo lo repetiría y taparía referencias.
      const r = editor.con.redes.find((x) => x.id === red)
      if (v !== undefined && !(r && redLlevaChip(r))) {
        const s = lienzo.aPantalla(editor.cursor)
        return { texto: `${nombres().get(red!) ?? 'Red'} · ${cifra(v, 'V')}`, x: s.x, y: s.y }
      }
    }
    const texto = editor.nombrePin(h)
    if (!texto || h?.tipo !== 'pin' || !lienzo) return null
    const s = lienzo.aPantalla(h)
    // Un pin con nota (el ajuste de un regulador) lleva su nombre y las líneas de su ayuda.
    const lineas = editor.ayudaPin(h)
    return lineas ? { texto: lineas.join(' '), lineas, x: s.x, y: s.y } : { texto, x: s.x, y: s.y }
  }

  /** La pieza pasa al frente de las recientes, que se recuerdan en los ajustes. */
  const usarPieza = (defId: string) => cambiarAjustes({ recientes: [defId, ...ajustes().recientes.filter((x) => x !== defId)].slice(0, MAX_RECIENTES) })

  /** La pieza queda en el fantasma, sin tocar las recientes (el arrastre las actualiza solo si coloca). */
  const empezarColocar = (en: Punto, defId: string, valor?: string) => {
    setBuscador(null)
    editor.empezarColocar(defId, valor, en)
    lienzo?.enfocar()
  }
  const elegir = (en: Punto, defId: string, valor?: string) => {
    empezarColocar(en, defId, valor)
    // Mientras corre la vista previa (o con el archivo en solo lectura) el editor no coloca: tampoco cambian las recientes.
    if (editor.herramienta === 'colocar') usarPieza(defId)
  }

  /** Punto de mundo en el centro de la vista. */
  const centroDeVista = (): Punto => {
    const r = lienzo!.gl.getBoundingClientRect()
    return lienzo!.aMundo(r.left + r.width / 2, r.top + r.height / 2)
  }

  /** Clic en la Librería: la pieza queda lista para colocar, como al elegirla en el buscador. */
  const tomar = (defId: string, valor?: string) => {
    if (!lienzo) return
    elegir(centroDeVista(), defId, valor)
  }

  // Gesto de arrastre desde la Librería: el fantasma aparece una sola vez, al entrar el puntero al lienzo; si el gesto se
  // cancela (Esc, clic derecho) lo que resta del arrastre no hace nada.
  /** Arrastrar de la Librería al lienzo: el fantasma sigue al puntero y al soltar se coloca ahí, con las reglas de un clic. */
  let gestoLibreria: { defId: string; empezo: boolean; cancelado: boolean } | null = null
  const arrastrarPieza = (defId: string, valor: string | undefined, e: PointerEvent, fase: FaseArrastre) => {
    if (!lienzo) return
    if (gestoLibreria?.defId !== defId) gestoLibreria = { defId, empezo: false, cancelado: false }
    const g = gestoLibreria
    // Solo es «el lienzo» lo que el puntero toca de verdad: no el minimapa ni lo que flota encima.
    const dentro = document.elementFromPoint(e.clientX, e.clientY) === lienzo.gl
    const p = lienzo.aMundo(e.clientX, e.clientY)
    // Esc (o cualquier cosa que saque al editor de colocar) cancela lo que queda del gesto.
    if (g.empezo && editor.herramienta !== 'colocar') g.cancelado = true
    if (fase === 'mover') {
      if (g.cancelado || !dentro) return
      if (!g.empezo) {
        g.empezo = true
        empezarColocar(p, defId, valor)
      } else editor.mover(p)
      return
    }
    gestoLibreria = null
    if (g.cancelado) return
    if (fase === 'soltar' && dentro && g.empezo && editor.herramienta === 'colocar') {
      const antes = Object.keys(editor.doc.piezas).length
      const m = { shift: e.shiftKey }
      editor.abajo(p, m)
      editor.arriba(p, m)
      // Las recientes se actualizan solo si de verdad se colocó (un lugar ocupado no cuenta).
      if (Object.keys(editor.doc.piezas).length > antes) usarPieza(defId)
      lienzo.enfocar()
    } else if (g.empezo && editor.herramienta === 'colocar') editor.escape()
  }

  // ---- Plantillas ----
  // Las propias viven en Documentos/Kirchi/Plantillas (el proceso principal las lee y las valida; aquí solo se pide por categoría y
  // nombre) y las incluidas vienen con la aplicación. Colocar una es pegar un fragmento: el editor sigue sus reglas.
  const apiPl = apiPlantillas()
  const incluidasPl = plantillasIncluidas(editor.lib)
  const [propias, setPropias] = createSignal<ResultadoCarga>({ items: [], categorias: [], errores: [], omitidas: 0 })
  const [avisoPlantillas, setAvisoPlantillas] = createSignal<string | null>(incluidasPl.errores[0] ?? null)
  const itemsPlantillas = createMemo(() => [...propias().items, ...incluidasPl.items])
  type DialogoPlantillaAbierto =
    | { tipo: 'guardar' | 'copiar'; fragmento: Fragmento; vista: ItemPlantilla['vista']; resumen: string; inicial: DatosPlantilla }
    | { tipo: 'renombrar' | 'mover' | 'borrar' | 'descripcion'; item: ItemPlantilla }
    | { tipo: 'borrar-categoria'; nombre: string; total: number }
  const [dialogoPl, setDialogoPl] = createSignal<DialogoPlantillaAbierto | null>(null)
  let cargaPl = 0
  let ultimaCargaPl = 0
  /** Volver a la ventana no relee la carpeta si la última lectura es de hace menos de esto. */
  const ESPERA_RECARGA_PL = 5000
  const recargarPlantillas = async (alVolver = false) => {
    if (!apiPl) return
    if (alVolver && Date.now() - ultimaCargaPl < ESPERA_RECARGA_PL) return
    ultimaCargaPl = Date.now()
    const n = ++cargaPl
    try {
      const r = await cargarPropias(apiPl, editor.lib)
      if (n !== cargaPl) return
      setPropias(r)
      setAvisoPlantillas(incluidasPl.errores[0] ?? (r.errores.length > 0 ? `No se pudo leer ${plural(r.errores.length, 'plantilla', 'plantillas')}: ${r.errores[0]}` : null))
    } catch (e) {
      if (n === cargaPl) setAvisoPlantillas(e instanceof Error ? e.message : 'No se pudo leer la carpeta de plantillas.')
    }
  }
  onMount(() => {
    void recargarPlantillas()
    // Si la carpeta cambia por fuera (se copia o se borra un archivo), al volver a la ventana la lista se refresca.
    const alVolver = () => void recargarPlantillas(true)
    window.addEventListener('focus', alVolver)
    onCleanup(() => window.removeEventListener('focus', alVolver))
  })
  const colocarPlantilla = (item: ItemPlantilla, en: Punto): boolean => {
    setBuscador(null)
    const ok = editor.empezarColocarFragmento(fragmentoParaColocar(item.fragmento, !item.incluida), en)
    if (ok) lienzo?.enfocar()
    return ok
  }
  /** Clic en la Librería o en una búsqueda: queda pegada al ratón en el centro de la vista, como una pieza. */
  const tomarPlantilla = (item: ItemPlantilla) => {
    if (!lienzo) return
    if (colocarPlantilla(item, centroDeVista())) registrar(`${item.nombre}: haz clic donde va. Esc la cancela.`, 'info')
  }
  let gestoPlantilla: { clave: string; empezo: boolean; cancelado: boolean } | null = null
  /** Arrastrar una plantilla al lienzo: sigue al puntero y al soltar se coloca ahí, con las reglas de un clic. */
  const arrastrarPlantilla = (item: ItemPlantilla, e: PointerEvent, fase: FaseArrastre) => {
    if (!lienzo) return
    if (gestoPlantilla?.clave !== item.clave) gestoPlantilla = { clave: item.clave, empezo: false, cancelado: false }
    const g = gestoPlantilla
    const dentro = document.elementFromPoint(e.clientX, e.clientY) === lienzo.gl
    const p = lienzo.aMundo(e.clientX, e.clientY)
    if (g.empezo && editor.herramienta !== 'colocar') g.cancelado = true
    if (fase === 'mover') {
      if (g.cancelado || !dentro) return
      if (!g.empezo) {
        g.empezo = true
        colocarPlantilla(item, p)
      } else editor.mover(p)
      return
    }
    gestoPlantilla = null
    if (g.cancelado) return
    if (fase === 'soltar' && dentro && g.empezo && editor.herramienta === 'colocar') {
      const m = { shift: e.shiftKey }
      editor.abajo(p, m)
      editor.arriba(p, m)
      lienzo.enfocar()
    } else if (g.empezo && editor.herramienta === 'colocar') editor.escape()
  }
  const abrirMenuPlantilla = (item: ItemPlantilla, x: number, y: number, volverA?: HTMLElement) => setMenu({ modelo: menuDePlantilla(item.nombre, item.incluida), x, y, plantilla: item, volverA })
  const abrirMenuCategoria = (nombre: string, total: number, x: number, y: number, volverA?: HTMLElement) => setMenu({ modelo: menuDeCategoria(nombre, total), x, y, categoria: { nombre, total }, volverA })
  const mostrarCarpetaPlantillas = apiPl ? () => void apiPl.mostrar().catch((e: unknown) => registrar(e instanceof Error ? e.message : 'No se pudo abrir la carpeta de plantillas.', 'error')) : undefined
  const resumenDe = (f: Fragmento) => {
    const cuenta = [plural(f.piezas.length, 'pieza', 'piezas'), ...(f.cables.length > 0 ? [plural(f.cables.length, 'cable', 'cables')] : [])]
    return cuenta.join(' y ')
  }
  /** «Guardar como plantilla…»: la selección tal como la copiaría Ctrl+C (las sondas no van). */
  const abrirGuardarPlantilla = () => {
    if (!apiPl) return registrar('Las plantillas no están disponibles en esta ventana.', 'error')
    const f = fragmentoDeSeleccion(editor.doc, editor.seleccion, editor.lib)
    if (!f) return registrar('Selecciona algo primero.', 'aviso')
    setDialogoPl({ tipo: 'guardar', fragmento: f, vista: vistaDeFragmentoApp(f), resumen: resumenDe(f), inicial: { nombre: '', categoria: CATEGORIA_POR_OMISION, descripcion: '' } })
  }
  const vistaDeFragmentoApp = (f: Fragmento) => vistaDeFragmento(f, editor.lib)
  const guardarPlantilla = async (f: Fragmento, d: DatosPlantilla, reemplazar: boolean): Promise<ResultadoPlantilla> => {
    if (!apiPl) return { ok: false, error: 'Las plantillas no están disponibles en esta ventana.' }
    const bytes = empaquetarPlantilla(f, { nombre: d.nombre, descripcion: d.descripcion }, editor.lib, VERSION)
    const r = await apiPl.guardar(d.categoria, d.nombre, bytes, reemplazar)
    if (r.ok) {
      setDialogoPl(null)
      registrar(`Se guardó la plantilla ${d.nombre} en ${d.categoria}.`, 'info')
      await recargarPlantillas()
      lienzo?.enfocar()
    }
    return r
  }
  // ---- Calculadoras ----
  // «Generar circuito» arma el circuito con el enrutador del editor y lo deja en la sombra de colocar, como una plantilla: el mismo
  // camino de pegar (referencias renumeradas, un paso de deshacer). «Guardar como plantilla» abre el diálogo de siempre.
  const fragmentoDeCalculadora = (a: Armado): Fragmento | null => {
    try {
      return fragmentoDeDocumento(conTextosFijos(armar(a.def, editor.lib, a.nombre), editor.lib))
    } catch (e) {
      registrar(`No se pudo armar el circuito: ${e instanceof Error ? e.message : 'error desconocido'}.`, 'error')
      return null
    }
  }
  const motivoSinEditar = (): string | null => (fase() !== 'detenida' ? 'Detén la vista previa para colocar el circuito.' : archivo().soloLectura ? 'El archivo está en solo lectura: no se puede colocar el circuito.' : null)
  const generarDeCalculadora = (a: Armado) => {
    if (!lienzo) return
    const motivo = motivoSinEditar()
    if (motivo) return registrar(motivo, 'aviso')
    const f = fragmentoDeCalculadora(a)
    if (!f) return
    setBuscador(null)
    if (!editor.empezarColocarFragmento(fragmentoParaColocar(f), centroDeVista())) return registrar('No se pudo colocar el circuito.', 'aviso')
    lienzo.enfocar()
    registrar(`${a.nombre}: haz clic donde va. Esc lo cancela.`, 'info')
  }
  /** Ctrl+K: abre el panel Calculadoras (con la elegida, si se pidió una) y lleva el foco a su primer campo. */
  const abrirCalculadora = (id: IdCalculadora | null) => {
    if (id) elegirCalculadora(id)
    cambiarAjustes({ panel: 'calculadoras', lateral: true })
    setTimeout(() => document.querySelector<HTMLElement>('.panel-calculadoras .calc-campos input, .panel-calculadoras .calc-campos select')?.focus(), 0)
  }
  const operarPlantilla = async (f: () => Promise<ResultadoPlantilla>, mensaje: string): Promise<ResultadoPlantilla> => {
    const r = await f()
    if (r.ok) {
      setDialogoPl(null)
      registrar(mensaje, 'info')
      await recargarPlantillas()
    }
    return r
  }
  const borrarPlantilla = async (item: ItemPlantilla) => {
    const r = await apiPl?.borrar(item.categoria, item.nombre)
    setDialogoPl(null)
    if (r?.ok) registrar(`Se borró la plantilla ${item.nombre}.`, 'info')
    else registrar(r?.error ?? 'No se pudo borrar la plantilla.', 'error')
    await recargarPlantillas()
  }
  /** «Cambiar descripción…»: lee el archivo, le cambia solo `plantilla.json` y lo guarda en su lugar. */
  const cambiarDescripcion = async (item: ItemPlantilla, texto: string): Promise<ResultadoPlantilla> => {
    if (!apiPl) return { ok: false, error: 'Las plantillas no están disponibles en esta ventana.' }
    const leida = await apiPl.leer(item.categoria, item.nombre)
    if (!leida.ok) return leida
    const nuevo = conDescripcion(leida.bytes, texto)
    if (!nuevo.ok) return nuevo
    return apiPl.guardar(item.categoria, item.nombre, nuevo.bytes, true)
  }
  /** Una categoría vacía se borra sin preguntar. Con plantillas, el proceso principal contesta cuántas y aquí se confirma
   * con ese número. */
  const llamarBorrarCategoria = (nombre: string, confirmada: boolean): Promise<ResultadoBorrarCategoria> =>
    apiPl ? apiPl.borrarCategoria(nombre, confirmada).catch((e: unknown) => ({ ok: false, error: e instanceof Error ? e.message : 'No se pudo borrar la categoría.' })) : Promise.resolve({ ok: false, error: 'Las plantillas no están disponibles en esta ventana.' })
  const pedirBorrarCategoria = async (nombre: string) => {
    const r = await llamarBorrarCategoria(nombre, false)
    if (r.ok) {
      registrar(`Se borró la categoría ${nombre}.`, 'info')
      await recargarPlantillas()
    } else if (r.noVacia !== undefined) setDialogoPl({ tipo: 'borrar-categoria', nombre, total: r.noVacia })
    else {
      registrar(r.error, 'error')
      await recargarPlantillas()
    }
  }
  const borrarCategoria = async (nombre: string) => {
    const r = await llamarBorrarCategoria(nombre, true)
    setDialogoPl(null)
    if (r.ok) registrar(`Se borró la categoría ${nombre} con ${plural(r.borradas, 'plantilla', 'plantillas')}.`, 'info')
    else registrar(r.error, 'error')
    await recargarPlantillas()
  }
  const accionCategoria = (id: AccionMenu, c: { nombre: string; total: number }) => {
    if (id === 'categoria:mostrar') void apiPl?.mostrar(c.nombre).catch((e: unknown) => registrar(e instanceof Error ? e.message : 'No se pudo abrir la carpeta de plantillas.', 'error'))
    else if (id === 'categoria:borrar') void pedirBorrarCategoria(c.nombre)
  }
  const accionPlantilla = (id: AccionMenu, item: ItemPlantilla) => {
    switch (id) {
      case 'plantilla:colocar':
        return tomarPlantilla(item)
      case 'plantilla:copiar':
        return setDialogoPl({ tipo: 'copiar', fragmento: item.fragmento, vista: item.vista, resumen: resumenDe(item.fragmento), inicial: { nombre: item.nombre, categoria: CATEGORIA_POR_OMISION, descripcion: item.descripcion } })
      case 'plantilla:renombrar':
        return setDialogoPl({ tipo: 'renombrar', item })
      case 'plantilla:descripcion':
        return setDialogoPl({ tipo: 'descripcion', item })
      case 'plantilla:mover':
        return setDialogoPl({ tipo: 'mover', item })
      case 'plantilla:borrar':
        return setDialogoPl({ tipo: 'borrar', item })
      case 'plantilla:mostrar':
        return void apiPl?.mostrar(item.categoria).catch((e: unknown) => registrar(e instanceof Error ? e.message : 'No se pudo abrir la carpeta de plantillas.', 'error'))
    }
  }

  /** Centra la vista en la caja de los puntos (selección desde el panel Proyecto); no cambia el zoom. */
  const centrarEnPuntos = (pts: Punto[]) => {
    if (!lienzo || pts.length === 0) return
    const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y)
    lienzo.centrarEn({ x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 })
  }
  /** Un clic en el panel Proyecto cancela lo pendiente (colocar, cablear) y luego selecciona. */
  const salirDeGesto = () => {
    if (editor.herramienta !== 'seleccionar') editor.escape()
  }
  const seleccionarPiezas = (ids: Id[]) => {
    salirDeGesto()
    const s = seleccionVacia()
    for (const id of ids) s.piezas.add(id)
    editor.seleccionar(s)
    // Se centra en los cuerpos de las piezas, no en sus orígenes.
    const cajas = ids.flatMap((id) => {
      const p = editor.doc.piezas[id]
      return p ? [cuerpoEnMundo(p, editor.lib.get(p.tipo))] : []
    })
    centrarEnPuntos(cajas.flatMap((c) => [{ x: c.minX, y: c.minY }, { x: c.maxX, y: c.maxY }]))
  }
  const seleccionarRed = (red: number) => {
    const r = editor.con.redes[red]
    if (!r) return
    salirDeGesto()
    if (editor.seleccionarCablesDeRed(red)) centrarEnPuntos(r.cables.flatMap((id) => editor.doc.cables[id]?.puntos ?? []))
    else seleccionarPiezas([...new Set(r.pines.map((k) => partirClavePin(k).piezaId))])
  }

  /** «Ver los N en Proyecto» del inspector: abre el panel Proyecto y lleva el foco a su lista de avisos. */
  const verEnProyecto = (selector: string) => {
    cambiarAjustes({ panelDerecho: 'proyecto', inspector: true })
    queueMicrotask(() => {
      const lista = document.querySelector<HTMLElement>(selector)
      lista?.scrollIntoView({ block: 'nearest' })
      lista?.focus()
    })
  }

  /** «Ver los N avisos» del inspector: la lista entera ahí mismo (el panel Proyecto ya no lista avisos); «Ver menos» la recoge. */
  const [avisosAbiertos, setAvisosAbiertos] = createSignal(false)
  const verAvisos = () => setAvisosAbiertos((a) => !a)
  const verRedes = () => {
    // La sección Redes puede estar plegada: se abre para llevar el foco a su lista.
    if (ajustes().proyectoPlegado.includes('redes')) cambiarAjustes({ proyectoPlegado: ajustes().proyectoPlegado.filter((c) => c !== 'redes') })
    verEnProyecto('.panel-proyecto .lista[aria-labelledby="proyecto-redes"]')
  }

  /** Riel: abre el panel elegido; el que ya está abierto se pliega. */
  const elegirPanel = (p: Panel) => {
    const a = ajustes()
    cambiarAjustes(a.lateral && a.panel === p ? { lateral: false } : { panel: p, lateral: true })
  }
  /** Riel derecho: abre Inspector, Mediciones o Proyecto; el que ya está abierto se pliega. */
  const elegirPanelDerecho = (p: PanelDerecho) => {
    const a = ajustes()
    cambiarAjustes(a.inspector && a.panelDerecho === p ? { inspector: false } : { panelDerecho: p, inspector: true })
  }
  /** Plegar el panel derecho: el foco pasa al icono de su riel (el botón de plegar desaparece). */
  const plegarDerecho = (p: PanelDerecho) => {
    cambiarAjustes({ inspector: false })
    queueMicrotask(() => document.querySelector<HTMLElement>(`.riel.der .riel-boton[data-panel="${p}"]`)?.focus())
  }
  /** Mediciones a la vista sin plegarla si ya lo está (lo que antes hacía la pestaña Multímetro de la franja). */
  const verMediciones = () => {
    const a = ajustes()
    if (!(a.inspector && a.panelDerecho === 'mediciones')) cambiarAjustes({ panelDerecho: 'mediciones', inspector: true })
  }

  /** Abre el buscador con el punto de colocación `en` (mundo). */
  const abrirBuscador = (en: Punto) => {
    if (!lienzo) return
    const s = lienzo.aPantalla(en)
    setBuscador({ x: s.x, y: s.y, en })
  }

  /** Menú del clic derecho para lo que hay en `p` (mundo), abierto junto al cursor (x, y de ventana). */
  const abrirMenuContextual = (p: Punto, x: number, y: number) => abrirMenuDe(editor.objetivoMenu(p), x, y)

  const abrirMenuDe = (o: ObjetivoMenu, x: number, y: number) => {
    const red = editor.redDe(o)
    const modelo = menuDeObjetivo(o, {
      doc: editor.doc,
      lib: editor.lib,
      con: editor.con,
      puedePegar: editor.puedePegar,
      teclas: teclaDe,
      seleccionados: tamañoSeleccion(editor.seleccion),
      red: red === undefined ? undefined : nombresDeRedes(editor.doc, editor.con).get(red),
      // El objetivo ya quedó seleccionado: el submenú Formato muestra el estado de los textos de la selección.
      formato: o.tipo === 'nota' || o.tipo === 'etiqueta' ? vistaFormato(editor.doc, editor.seleccion) : null,
      alFondo: editor.puedeLlevarAlFondo(),
      figura: o.tipo === 'figura' ? vistaFigura(editor.doc, editor.seleccion) : null
    })
    setMenu({ modelo, x, y, objetivo: o })
    if (o.tipo === 'pieza') tutorial.registrar('menu-pieza')
  }

  /** Abre o cierra el menú de un botón de la cinta bajo el control que lo pidió. Esc devuelve el foco a ese control. */
  const anclarMenu = (ancla: HTMLElement, modelo: ModeloMenu) => {
    if (menu()?.volverA === ancla) {
      setMenu(null)
      return
    }
    const r = ancla.getBoundingClientRect()
    setMenu({ modelo, x: r.left, y: r.bottom + 4, hueco: 0, volverA: ancla })
  }

  // Grabar: el panel de opciones bajo el botón de la cinta y el control de la grabación en curso.
  const [opcionesGrabar, setOpcionesGrabar] = createSignal<{ x: number; y: number; volverA: HTMLElement } | null>(null)
  const grabador = crearGrabador()
  const grabacion = crearControlGrabacion({
    grabador,
    api: () => window.kirchi?.grabacion,
    opciones: () => ajustes().grabacion,
    nombreCircuito: () => archivo().nombre.replace(/\.kir$/i, ''),
    rectLienzo: () => {
      const r = lienzo?.gl.getBoundingClientRect()
      return r ? { x: r.left, y: r.top, ancho: r.width, alto: r.height } : null
    },
    carpeta: () => ajustes().carpetaGrabaciones,
    registrar
  })
  // Cada medio segundo mientras graba, para que el «● 00:42» del botón y de la barra de estado avancen (el tiempo no es reactivo).
  const [tocGrabacion, setTocGrabacion] = createSignal(0)
  createEffect(() => {
    const f = grabador.estado()
    setTocGrabacion((n) => n + 1)
    if (f !== 'grabando') return
    const id = setInterval(() => setTocGrabacion((n) => n + 1), 500)
    onCleanup(() => clearInterval(id))
  })
  const segundosGrabados = () => (tocGrabacion(), Math.floor(grabador.transcurridoMs() / 1000))
  const enCurso = () => grabador.estado() === 'grabando' || grabador.estado() === 'pausada'
  /** Botón Grabar partido: el clic empieza o detiene, la flecha abre las opciones (o Pausar y Detener mientras graba). */
  const accionGrabar = (ancla: HTMLElement) => {
    setOpcionesGrabar(null)
    // El botón Pausar / Continuar junto al tiempo.
    if (ancla.hasAttribute('data-grabar-pausa')) return grabacion.alternarPausa()
    if (!ancla.hasAttribute('data-grabar-flecha')) {
      setMenu(null)
      void grabacion.alternar()
      return
    }
    if (enCurso()) return anclarMenu(ancla, menuGrabacion(grabador.estado() === 'pausada'))
    if (grabador.estado() !== 'inactivo') return
    setMenu(null)
    if (opcionesGrabar()?.volverA === ancla) return
    const r = ancla.getBoundingClientRect()
    setOpcionesGrabar({ x: r.left, y: r.bottom + 4, volverA: ancla })
  }
  const empezarDesdeOpciones = () => {
    setOpcionesGrabar(null)
    lienzo?.enfocar()
    void grabacion.empezar()
  }

  const pestaña = (p: Pestaña) => {
    // La primera vez que se abre el osciloscopio, mientras el borde nunca se arrastró, la franja toma 320 px.
    if (p === 'osciloscopio' && ajustes().altoFranja === null) cambiarAjustes({ altoFranja: ALTO_FRANJA_OSCILOSCOPIO })
    setInstrumentos((i) => (i.abierta && i.pestaña === p ? { ...i, abierta: false } : { abierta: true, pestaña: p }))
  }
  // El alto del panel de la franja: el de los ajustes, acotado al 60 % de la ventana; se guarda al soltar el borde.
  const [altoVentana, setAltoVentana] = createSignal(window.innerHeight)
  onMount(() => {
    const medir = () => setAltoVentana(window.innerHeight)
    window.addEventListener('resize', medir)
    onCleanup(() => window.removeEventListener('resize', medir))
  })
  const [altoArrastrado, setAltoArrastrado] = createSignal<number | null>(null)
  const altoFranja = () => acotarAltoFranja(altoArrastrado() ?? altoAlAbrir(ajustes().altoFranja, instrumentos().pestaña === 'osciloscopio' || instrumentos().pestaña === 'graficas'), altoVentana())
  const cambiarAltoFranja = (alto: number, final: boolean) => {
    setAltoArrastrado(final ? null : alto)
    if (final) cambiarAjustes({ altoFranja: alto })
  }

  /** Shift+F10 o tecla de menú: abre el menú de la selección en el centro de su caja, o de la vista si no hay selección. */
  const abrirMenuTeclado = () => {
    const l = lienzo
    if (!l || document.activeElement !== l.gl) return
    const s = editor.seleccion
    const d = editor.doc
    const pts: Punto[] = []
    let objetivo: ObjetivoMenu | null = null
    for (const id of s.piezas) {
      const p = d.piezas[id]
      if (!p) continue
      pts.push({ x: p.x, y: p.y })
      objetivo ??= { tipo: 'pieza', id, en: { x: p.x, y: p.y } }
    }
    for (const id of s.cables) {
      const c = d.cables[id]
      if (!c || c.puntos.length < 2) continue
      pts.push(...c.puntos)
      objetivo ??= { tipo: 'cable', id, en: { x: (c.puntos[0].x + c.puntos[1].x) / 2, y: (c.puntos[0].y + c.puntos[1].y) / 2 } }
    }
    for (const id of s.etiquetas) {
      const e = d.etiquetas[id]
      if (!e) continue
      pts.push({ x: e.x, y: e.y })
      objetivo ??= { tipo: 'etiqueta', id, en: { x: e.x, y: e.y } }
    }
    for (const id of s.notas) {
      const n = d.notas[id]
      if (!n) continue
      pts.push({ x: n.x, y: n.y })
      objetivo ??= { tipo: 'nota', id, en: { x: n.x, y: n.y } }
    }
    if (objetivo) {
      const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y)
      const c = l.aPantalla({ x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 })
      abrirMenuDe(objetivo, c.x, c.y)
      return
    }
    const r = l.gl.getBoundingClientRect()
    const x = r.left + r.width / 2, y = r.top + r.height / 2
    abrirMenuContextual(l.aMundo(x, y), x, y)
  }

  /** Ctrl+\ y el botón Paneles: si el botón enfocado desaparece con el cambio, el foco vuelve al lienzo. */
  const alternarLimpio = (v?: boolean) => {
    setLimpio((a) => v ?? !a)
    queueMicrotask(() => {
      if (!document.activeElement || document.activeElement === document.body) lienzo?.enfocar()
    })
  }

  /** Convierte un medidor rápido en multímetro completo; si no se puede (corriente, vista previa), el motivo va al Registro (el aviso sobre el lienzo lo pone el editor) o se anuncia. */
  const convertirMedidor = (id: Id) => {
    const motivo = editor.convertirEnMultimetro(id)
    if (motivo === null) verMediciones()
    else if (motivo === MOTIVO_CONVERTIR_CORRIENTE) registrar(motivo)
    else anunciar(motivo)
  }

  /** Cada acción del menú hace lo mismo que su atajo o botón. «Editar» y «Derivar desde aquí» actúan bajo el cursor, las
   * demás sobre la selección. */
  const accionMenu = (id: AccionMenu, o?: ObjetivoMenu) => {
    const orden = ordenDeAccion(id)
    if (orden) return formatear(orden)
    const estilo = estiloDeAccion(id)
    if (estilo) return void editor.cambiarFigura(estilo)
    if (id.startsWith('exportar:')) {
      abrirExportar(id.slice('exportar:'.length) as FormatoExportar)
      return
    }
    // «Medir con…» pone sondas. La
    // pestaña de su instrumento se abre sin plegarla si ya estaba a la vista.
    const pedido = pedidoDeAccion(id)
    if (pedido) {
      if (!o || editor.medirCon(o, pedido) !== null) return
      if (pedido.con === 'osciloscopio') {
        if (!(instrumentos().abierta && instrumentos().pestaña === 'osciloscopio')) pestaña('osciloscopio')
      } else if (pedido.con === 'multimetro' || pedido.con === 'multimetro-nuevo') verMediciones()
      return
    }
    if (id.startsWith('reciente:')) {
      const ruta = ajustes().archivosRecientes[Number(id.slice('reciente:'.length))]
      if (ruta) void control.abrirReciente(ruta)
      return
    }
    // El menú de la flecha de Grabar mientras se graba.
    if (id === 'grabacion:pausar' || id === 'grabacion:continuar') return grabacion.alternarPausa()
    if (id === 'grabacion:detener') return void grabacion.detener()
    // Los menús de Velocidad y Avanzar.
    if (id.startsWith('velocidad:')) return cambiarVelocidad(Number(id.slice('velocidad:'.length)))
    if (id === 'avanzar-hasta') return void setDialogoTiempo('hasta')
    if (id === 'delta:automatico' || id === 'delta:paso') {
      setDelta(id === 'delta:paso' ? 'paso' : 'automatico')
      return anunciar(`Avanzar: ${textoDelta(delta(), velocidad(), divisionOsc(), sim.pasoMaximo)}.`)
    }
    if (id === 'delta:escrito') return void setDialogoTiempo('delta')
    // Zoom de la página: las mismas órdenes que la cinta y el buscador, con su razón si no hay ventana.
    if (esDePagina(id)) return void ejecutarComando(id, document.body)
    // Las figuras del menú Figura: la misma orden que el buscador, con su razón si simulando no se puede.
    if (esDeFigura(id)) return void ejecutarComando(id, document.body)
    // Instrumentos y Analizar: cada entrada es la orden de la cinta de su nombre.
    if (esDeMenuDeCinta(id)) return void ejecutarComando(id, document.body)
    // Pegar aquí, L, G y T actúan en el punto donde se hizo clic derecho, no donde haya quedado el puntero después.
    if (o && (id === 'pegar-aqui' || id === 'etiqueta' || id === 'tierra' || id === 'nota')) editor.cursor = o.en
    // Lo que el menú comparte con la cinta hace exactamente lo mismo que su botón: una sola acción por orden.
    if (esDeMenu(id)) return acciones[id](document.body)
    switch (id) {
      case 'editar-valor':
        if (o?.tipo === 'pieza') editor.editarValor(o.id)
        break
      case 'al-fondo':
        editor.figurasAlFondo()
        break
      case 'guardar-plantilla':
        abrirGuardarPlantilla()
        break
      case 'exportar-seleccion':
        abrirExportar(formatoEsquema(), 'seleccion')
        break
      case 'duplicar':
        // Como Pegar aquí: la copia va al punto donde se hizo clic derecho.
        editor.duplicar(o?.en)
        break
      case 'invertir-sentido':
        if (o?.tipo === 'sonda') editor.invertirSentido(o.id)
        break
      case 'convertir-medidor':
        if (o?.tipo === 'sonda') convertirMedidor(o.id)
        break
      case 'quitar-sonda':
        editor.borrar()
        break
      case 'derivar':
        if (o) editor.derivarDesde(o.en)
        break
      case 'editar-texto':
        if (o?.tipo === 'etiqueta') editor.editarEtiqueta(o.id)
        else if (o?.tipo === 'nota') editor.editarNota(o.id)
        break
      case 'colocar-aqui':
        if (o) abrirBuscador(o.en)
        break
      case 'pegar-aqui':
        editor.pegar()
        break
      case 'olvidar-recientes':
        void api?.olvidarRecientes().then((l) => setAjustes((a) => ({ ...a, archivosRecientes: l })))
        break
    }
  }

  let figurasSimplificadas = false
  // Con el contraste alto de Windows las figuras se dibujan opacas: su opacidad no les quita contraste.
  const consultaForzado = typeof matchMedia === 'function' ? matchMedia('(forced-colors: active)') : null
  const [contrasteAlto, setContrasteAlto] = createSignal(consultaForzado?.matches === true)
  if (consultaForzado) {
    const alCambiar = (e: MediaQueryListEvent) => setContrasteAlto(e.matches)
    consultaForzado.addEventListener('change', alCambiar)
    onCleanup(() => consultaForzado.removeEventListener('change', alCambiar))
  }
  onMount(() => {
    // El tamaño de la interfaz lo cambia el proceso principal (teclas, Vista › Zoom de la página o el ajuste): se muestra el vigente.
    const quitarTamaño = escucharTamañoInterfaz((t) => setAjustes((a) => ({ ...a, tamañoInterfaz: t })))
    onCleanup(quitarTamaño)
    let l: Lienzo
    try {
      l = new Lienzo(
        contenedor,
        {
          // Al simular, el rótulo de un estado lógico dice el nivel accionado (el documento no cambia).
          escena: () => {
            const e = construirEscena(sim.activa ? sim.documentoVisible() : editor.docVista, editor.lib, editor.estado().con, paleta(), { sinOpacidad: contrasteAlto(), simulando: sim.activa })
            // Un aviso cada vez que las figuras pasan el presupuesto de la escena (un .kir con miles de figuras punteadas).
            if (e.figurasSimplificadas && !figurasSimplificadas)
              queueMicrotask(() => registrar('Hay demasiadas figuras con guiones o puntos para dibujarlas todas así: algunas se ven con trazo continuo.'))
            figurasSimplificadas = e.figurasSimplificadas
            return e
          },
          // Simulando, un botón presionado o un interruptor cerrado se resalta con su dibujo accionado.
          superposicion: (anim, esc) => construirSuperposicion(sim.activa ? sim.documentoVisible() : editor.docVista, editor.lib, { ...editor.estado(), zoom: lienzo?.cam.zoom, textoResaltado: editor.textoResaltado(), banderas: esc?.banderas, guiaTutorial }, paleta(), anim, esc?.saltos),
          simulacion: (esc) => {
            const l = lectura()
            if (!l) return capaDePuntoDeOperacion(esc)
            const c = construirCapaSim(editor.doc, editor.lib, editor.con, l, sim.escala, paleta(), esc?.saltos, opcionesChips(), esc?.textos, instrumentosLienzo(), { destellos: { vigia: destellos, ahora: performance.now(), muestra: l.t }, piezas: piezasDeCapa, banderas: esc?.banderas, histeresis: histeresisSondas, alternas: alternasDeMedidores() })
            c.flechas = flechas
            return c
          },
          // El rotor y los recorridos de los contactos por cuadro; nada si el circuito no tiene qué mover.
          movimiento: (ahora, vista) => (sim.activa && !movimiento.vacio ? movimiento.construir(editor.doc, editor.lib, paleta(), ahora, !animaciones() || fase() !== 'corriendo' || !!avance(), vista) : null),
          enMovimiento: (ahora) => fase() === 'corriendo' && !avance() && movimiento.enMovimiento(ahora, !animaciones())
        },
        paleta(),
        {
          abajo: (p, e) => {
            // El clic que cierra el buscador no hace nada más ni cuenta para un doble clic: el siguiente par lo vuelve a abrir.
            if (buscador()) {
              setBuscador(null)
              return true
            }
            // Un campo de un panel con texto pendiente lo aplica al perder el foco, ANTES de que el clic cambie la selección o empiece un arrastre.
            const activo = document.activeElement
            if (activo instanceof HTMLElement && activo.closest('.inspector, .lateral')) activo.blur()
            // Mientras corre la vista previa, un chip de voltaje se mueve un poco: es lo único que se arrastra.
            const chip = sim.activa && lienzo ? chipEn(lienzo.chips, p) : null
            if (chip?.clave) {
              arrastreChip = { clave: chip.clave, inicio: p, base: desplazosChips.get(chip.clave) ?? { dx: 0, dy: 0 } }
              lienzo?.ponerCursor(cursorDelLienzo())
              return
            }
            // Un potenciómetro se maneja arrastrando sobre él (es lo único del circuito que se edita simulando).
            const pot = sim.activa ? editor.potEn(p) : null
            const pz = pot ? editor.doc.piezas[pot] : undefined
            const def = pz ? editor.lib.get(pz.tipo) : undefined
            if (pot && pz && def) {
              if (!editor.seleccion.piezas.has(pot) || editor.seleccion.piezas.size !== 1) editor.seleccionar(seleccionDe('piezas', pot))
              arrastrePot = { id: pot, desde: p, pos0: editor.posicionPot(pot) ?? 50, eje: ejeDePotenciometro(pz, def), gesto: `lienzo${++nArrastresPot}` }
              lienzo?.ponerCursor(cursorDelLienzo())
              return
            }
            if (accionarEn(p)) return
            editor.abajo(p, mods(e))
          },
          clicDerecho: (p, e) => {
            if (buscador()) {
              setBuscador(null)
              return
            }
            // Si había algo pendiente el clic derecho solo lo cancela; si no, abre el menú de lo que está bajo el cursor.
            if (editor.clicDerecho()) setMenu(null)
            else abrirMenuContextual(p, e.clientX, e.clientY)
          },
          dobleClicDerecho: (p) => {
            // El doble clic derecho sigue borrando aunque el primero haya abierto el menú; el menú se cierra.
            setBuscador(null)
            setMenu(null)
            editor.dobleClicDerecho(p)
          },
          mover: (p, e) => {
            punteroMundo = p
            if (arrastrePot) {
              const a = arrastrePot
              editor.cambiarPosicionPot(a.id, posicionDeArrastre(a.pos0, a.desde, p, a.eje), a.gesto)
              return
            }
            if (arrastreChip) {
              const a = arrastreChip
              desplazosChips.set(a.clave, desplazoTrasArrastre(a.base, a.inicio, p))
              lienzo?.invalidarSimulacion()
              return
            }
            editor.mover(p, mods(e))
            revisarChips()
            lienzo?.ponerCursor(cursorDelLienzo())
          },
          arriba: (p, e) => {
            if (arrastrePot) {
              arrastrePot = null
              anunciarPot()
              lienzo?.ponerCursor(cursorDelLienzo())
              return
            }
            if (arrastreChip) {
              arrastreChip = null
              revisarChips()
              lienzo?.ponerCursor(cursorDelLienzo())
              return
            }
            if (!soltarSostenido('puntero')) editor.arriba(p, mods(e))
          },
          dobleClic: (p, e) => editor.dobleClic(p, mods(e)),
          salir: () => {
            punteroMundo = null
            editor.salir()
            revisarChips()
          },
          espacioMueveLaVista: () => editor.herramienta !== 'colocar',
          // Soltar el foco o perder la captura interrumpe solo lo que depende del botón; un cable en curso o un texto pendiente siguen.
          // La rueda sobre un potenciómetro mueve su cursor 5 % por muesca (1 % con Shift) en vez de hacer zoom.
          rueda: (p, e) => {
            if (!sim.activa || e.ctrlKey || arrastrePot) return false
            const id = editor.potEn(p)
            if (!id) return false
            const a = acumularRueda(restoRueda, e)
            restoRueda = a.resto
            if (a.pasos !== 0) {
              if (editor.potSeleccionado() !== id) editor.seleccionar(seleccionDe('piezas', id))
              editor.cambiarPosicionPot(id, (editor.posicionPot(id) ?? 50) + a.pasos * (e.shiftKey ? PASO_POT_FINO : PASO_POT))
              anunciarPot()
            }
            return true
          },
          cancelar: () => {
            arrastreChip = null
            arrastrePot = null
            // Perder la captura del puntero (o el foco) suelta el botón que se sostenía.
            soltarSostenido()
            editor.cancelarGesto({ soloPuntero: true })
          }
        },
        // El modo del contexto se elige al crear el lienzo: cambiarlo en Configuración se aplica al volver a abrir Kirchi.
        { sincronizado: ajustes().lienzoSincronizado }
      )
    } catch {
      // Sin WebGL2 el lienzo no existe: se avisa en pantalla en lugar de dejar la ventana en blanco.
      setSinWebgl(true)
      return
    }
    lienzo = l
    // Sin `defer` el efecto reconstruiría la escena al arrancar, cuando ya se dibujó con esta paleta.
    createEffect(on(paleta, (p) => l.ponerPaleta(p), { defer: true }))
    createEffect(on(contrasteAlto, () => l.invalidarEscena(), { defer: true }))
    // Lo que flota sobre el lienzo (minimapa y, en el lienzo limpio, el nombre y la barra) es reserva: encuadrar lo deja libre.
    l.reservas = () => {
      const c = l.gl.getBoundingClientRect()
      return [...(contenedor.parentElement?.querySelectorAll('[data-reserva]') ?? [])]
        .map((el) => el.getBoundingClientRect())
        .filter((m) => m.width > 0)
        .map((m) => ({ minX: m.left - c.left, minY: m.top - c.top, maxX: m.right - c.left, maxY: m.bottom - c.top }))
    }
    let version = editor.versionDoc
    let versionPrevia = editor.estado().versionPrevia
    const quitarEditor = editor.suscribir(() => {
      const s = editor.estado()
      const cambioDoc = s.versionDoc !== version
      // Juntas: lo derivado del documento y de las conexiones no debe ver un documento nuevo con conexiones viejas.
      batch(() => {
        setEstado(s)
        if (cambioDoc) setDoc(s.doc)
      })
      l.ponerCursor(cursorDelLienzo())
      revisarChips()
      // Abrir o empezar otro circuito con la vista previa activa la detiene: lo que corre es el documento de antes.
      // La posición de un potenciómetro y el valor de una resistencia o de una fuente no la detienen: cambian en caliente.
      const enCaliente = s.versionDoc === s.versionCaliente
      if (cambioDoc && sim.activa && !enCaliente) sim.detener()
      else if (cambioDoc && sim.activa && enCaliente) {
        void sim.actualizar()
        leerPorCuadros()
      }
      if (cambioDoc) {
        version = s.versionDoc
        versionPrevia = s.versionPrevia
        l.invalidarEscena()
      } else if (s.versionPrevia !== versionPrevia) {
        // La vista previa de la ficha de texto cambia lo que se dibuja, no el documento.
        versionPrevia = s.versionPrevia
        l.invalidarEscena()
      } else l.invalidarSuperposicion()
    })
    const quitarCamara = l.alCambiarCamara((c) => {
      editor.tolerancia = 6 / c.zoom
      editor.radioIman = radioIman(c.zoom)
      setCam(c)
      setVista({ ancho: l.ancho, alto: l.alto })
    })
    editor.ponerGanchos({
      abrirBuscador,
      editarTexto: (p) => setPedido(p),
      animar: (e) => l.animar(e),
      avisoLienzo: (t) => setAvisoLienzo(t),
      registrar: (t) => registrar(t),
      // Un valor o un riel cambiado simulando se prueba con la vista previa (con sus interruptores accionados).
      probarEnCaliente: (d) => sim.probarCambio(d),
      alMoverFino: () => tutorial.registrar('rejilla-fina'),
      alCancelarCable: () => tutorial.registrar('cable-cancelado'),
      alBorrarConClicDerecho: () => tutorial.registrar('borrado-clic-derecho')
    })
    registrarAtajosDelEditor(atajos, editor, { encuadrar: () => (l.encuadrar(), tutorial.registrar('encuadrar')), desplazarVista: (fx, fy) => l.desplazarVista(fx, fy) })
    registrarAtajosDeLaVentana(atajos, {
      hojaDeAtajos: () => setDialogo('atajos'),
      lienzoLimpio: () => alternarLimpio(),
      menuContextual: () => abrirMenuTeclado(),
      configuracion: () => abrirConfiguracion(),
      enfocarFormato: () => document.querySelector<HTMLElement>('.barra-formato [tabindex="0"]')?.focus(),
      plegarCinta: () => plegarCinta(),
      enfocarTutorial: () => enfocarTutorial(),
      grabar: () => void grabacion.empezar(),
      detenerGrabacion: () => void grabacion.detener(),
      // Con el lienzo limpio la barra (y su buscador) no está: primero se sale del modo limpio.
      buscarComando: () => {
        tutorial.registrar('buscar-comando')
        if (limpio()) alternarLimpio(false)
        queueMicrotask(() => {
          campoBuscador?.focus()
          campoBuscador?.select()
        })
      }
    })
    registrarAtajosDeSimulacion(atajos, {
      simularOPausar,
      detener: () => sim.detener(),
      alternarVoltajes,
      potenciometro: {
        paso: (dir) => {
          editor.pasoPotenciometro(dir, false)
          anunciarPot()
        },
        hay: () => editor.potSeleccionado() !== null
      },
      tiempo: { ejecutar: (id) => void ejecutarComando(id, document.body) }
    })
    registrarAtajosDeArchivo(atajos, {
      nuevo: () => void control.nuevo(),
      abrir: () => void control.abrir(),
      guardar: () => void control.guardar(),
      guardarComo: () => void control.guardarComo()
    })
    // Teclas propias de Configuración → Atajos: se aplican al arrancar y cada vez que cambian los ajustes.
    createEffect(
      on(
        () => ajustes().atajos,
        (p) => {
          const avisos = atajos.cargarPropias(p)
          setVersionAtajos((v) => v + 1)
          // Un settings.json con una tecla en dos comandos se resuelve (gana la de fábrica), se avisa y se guarda ya resuelto.
          if (avisos.length > 0) {
            for (const a of avisos) registrar(a)
            queueMicrotask(() => cambiarAjustes({ atajos: atajos.propiasActuales() }))
          }
        }
      )
    )
    // Con un menú, un diálogo o una pregunta abiertos las teclas son suyas.
    const teclasLibres = () => !menu() && !dialogo() && !pregunta() && !exportando() && !capturaExp() && !dialogoTiempo()
    // Esc durante un avance lo deja en pausa donde va, antes que cualquier otra cosa.
    const alEscDuranteAvance = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !sim.avance) return
      e.preventDefault()
      e.stopPropagation()
      sim.interrumpir()
    }
    window.addEventListener('keydown', alEscDuranteAvance, true)
    onCleanup(() => window.removeEventListener('keydown', alEscDuranteAvance, true))
    // Al ocultar la ventana el sonido calla (Chromium frena sus temporizadores en segundo plano).
    const alOcultar = () => {
      if (document.visibilityState !== 'visible') callar()
    }
    document.addEventListener('visibilitychange', alOcultar)
    onCleanup(() => document.removeEventListener('visibilitychange', alOcultar))
    const quitarAtajos = atajos.instalar(window, teclasLibres)
    // Enter y Espacio accionan el interruptor o botón seleccionado mientras corre la vista previa (un botón se sostiene
    // hasta soltar la tecla). No están en el registro de atajos: Enter y Espacio activan el control enfocado y colocan.
    const viaDeTecla = (e: KeyboardEvent) => (e.key === 'Enter' ? 'Enter' : e.key === ' ' ? 'Espacio' : null)
    const alBajarTecla = (e: KeyboardEvent) => {
      const via = viaDeTecla(e)
      if (!via || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || !teclasLibres()) return
      // Solo con el foco en el lienzo o en el cuerpo: sobre un botón o un campo, Enter y Espacio son suyos.
      if (e.target !== l.gl && e.target !== document.body) return
      const a = accionable()
      if (!a) return
      e.preventDefault()
      if (!e.repeat) accionarPieza(a.id, via)
    }
    const alSubirTecla = (e: KeyboardEvent) => {
      const via = viaDeTecla(e)
      if (via) soltarSostenido(via)
    }
    const alPerderFoco = () => void soltarSostenido()
    // Ctrl con +, − y 0 del teclado numérico cambian el tamaño de la interfaz. El menú de la aplicación
    // trae sus aceleradores; esto los atiende si no llegan, y al consumir la tecla el menú no la repite.
    const alTeclaNumerica = (e: KeyboardEvent) => {
      const orden = ordenDeTeclaNumerica(e)
      const pedir = apiVentana()
      if (!orden || !pedir) return
      e.preventDefault()
      e.stopPropagation()
      pedir(orden)
    }
    window.addEventListener('keydown', alTeclaNumerica, true)
    window.addEventListener('keydown', alBajarTecla)
    window.addEventListener('keyup', alSubirTecla)
    window.addEventListener('blur', alPerderFoco)

    const sonda: KirchiProbe = {
      ready: true,
      isolated: crossOriginIsolated,
      fps: () => l.estadisticas(),
      medir: (si) => l.medir(si),
      cuadros: () => l.cuadros,
      pantallas: () => dibujosDePantalla(),
      medirPantalla: () => {
        // Un canvas fuera del DOM a 2,560 por 2,048: el ancho de una pantalla maximizada a 2×.
        const c = document.createElement('canvas')
        c.width = 2560
        c.height = 2048
        return medirDibujo(c.getContext('2d')!, c.width, c.height)
      },
      doc: () => JSON.parse(JSON.stringify(editor.doc)),
      conexiones: () => ({ redes: editor.con.redes.length, redDePin: Object.fromEntries(editor.con.redDePin), uniones: editor.con.uniones }),
      cargar: (d) => {
        editor.cargar(d)
        l.encuadrar()
      },
      cargarDemo: (n) => {
        editor.cargar(documentoDemo(n))
        l.encuadrar()
      },
      aPantalla: (x, y) => l.aPantalla({ x, y }),
      errores: () => libreria.errores,
      herramienta: () => editor.herramienta,
      animando: () => l.animando,
      textos: () => JSON.parse(JSON.stringify(l.textos)),
      chips: () => l.chips.map((c) => ({ texto: c.texto, x: c.x, y: c.y, clave: c.clave ?? '' })),
      atajos: () => atajos.lista().map((c) => c.id),
      cursor: () => ({ ...editor.cursor }),
      cuentas: () => ({ avisos: cuentas.avisos, nombres: cuentas.nombres }),
      seleccion: () => Object.fromEntries(Object.entries(editor.seleccion).map(([k, v]) => [k, [...v]])),
      archivo: () => ({ ...control.estado, sinGuardar: editor.historial.sinGuardar }),
      simulacion: () => {
        const l = sim.leer()
        return {
          fase: sim.fase,
          t: l?.t ?? null,
          ratio: l?.ratio ?? null,
          redes: Object.fromEntries([...(l?.redes ?? [])].map(([k, v]) => [String(k), v])),
          piezas: Object.fromEntries(l?.piezas ?? []),
          // Nivel, frecuencia y si conmuta, por red con lógica.
          digitales: Object.fromEntries([...(l?.digitales ?? [])].map(([k, v]) => [String(k), v]))
        }
      },
      vista: () => {
        const l = lectura()
        return { t: l?.t ?? null, piezas: Object.fromEntries(l?.piezas ?? []) }
      },
      figurasAtenuadas: () => l.figurasAtenuadas,
      tiempo: () => ({
        velocidad: sim.velocidadVigente,
        avance: sim.avance,
        flechas: flechas?.cuenta ?? 0,
        movimiento: !movimiento.vacio,
        animaciones: animaciones(),
        audio: altavoz.creado,
        bloqueado: altavoz.bloqueado,
        costoSim: l.costoSim,
        msLectura: msLectura()
      })
    }
    // La sonda solo existe con --pruebas: la usa Playwright y nadie más la ve.
    if (modoPruebas()) window.__kirchi = sonda
    l.enfocar()
    if (libreria.errores.length > 0) {
      const n = libreria.errores.length
      setTimeout(() => setAnuncio(`Hay ${n} ${n === 1 ? 'aviso' : 'avisos'} de la librería en el Registro.`), 400)
    }

    // Modalidad de entrada: el recuadro de foco del lienzo solo se ve al usar el teclado, no tras un clic ni un arrastre.
    const modo = (m: 'puntero' | 'teclado') => () => (document.documentElement.dataset.modo = m)
    const alPuntero = modo('puntero')
    const alTeclado = (e: KeyboardEvent) => {
      if (!['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) modo('teclado')()
    }
    window.addEventListener('pointerdown', alPuntero, true)
    window.addEventListener('keydown', alTeclado, true)

    // Una recarga de la interfaz no arranca con ajustes viejos: se piden al proceso principal.
    const vigentes = pedidosAjustes.pedir()
    void leerAjustes().then((a) => {
      if (a && vigentes()) adoptarAjustes(a)
    })
    // Al abrir: la base del diario, el .kir de la línea de órdenes y lo que haya que recuperar.
    void control.iniciar().then(ofrecerTutorial)
    // El proceso principal pide que se pregunte antes de cerrar con cambios sin guardar.
    const quitarCerrar = api?.alPedirCerrar(() => void control.pedirCerrar())
    // El diario de autoguardado no se pudo escribir: el proceso principal avisa una vez por racha de fallas. Si esa copia
    // falla, un cierre inesperado pierde el trabajo: el aviso abre la franja en el Registro para que se vea de inmediato.
    const quitarErrorDiario = api?.alErrorDiario((t) => errorDeArchivo(t))
    // Un .kir que abrió el sistema (doble clic, arrastrado al icono) con Kirchi ya abierto: el proceso principal lo leyó con las
    // mismas comprobaciones de Abrir y aquí se pregunta por los cambios sin guardar antes de reemplazar.
    const quitarAbrirExterno = api?.alAbrirExterno((r) => void control.abrirExterno(r))
    // Soltar un .kir en la ventana lo abre (la ruta la da el preload; el disco lo lee el proceso principal).
    const sobre = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
    const soltar = (e: DragEvent) => {
      if (!e.dataTransfer?.files.length) return
      e.preventDefault()
      void control.soltar([...e.dataTransfer.files])
    }
    // Lo pendiente del diario se escribe antes de que la ventana se cierre o se recargue.
    const vaciarDiario = () => {
      diario.vaciar()
      demoraPestaña.vaciar()
    }
    window.addEventListener('dragover', sobre)
    window.addEventListener('drop', soltar)
    window.addEventListener('beforeunload', vaciarDiario)

    onCleanup(() => {
      clearTimeout(esperaOferta)
      window.removeEventListener('dragover', sobre)
      window.removeEventListener('drop', soltar)
      window.removeEventListener('beforeunload', vaciarDiario)
      quitarCerrar?.()
      quitarErrorDiario?.()
      quitarAbrirExterno?.()
      window.removeEventListener('pointerdown', alPuntero, true)
      window.removeEventListener('keydown', alTeclado, true)
      quitarAtajos()
      window.removeEventListener('keydown', alTeclaNumerica, true)
      window.removeEventListener('keydown', alBajarTecla)
      window.removeEventListener('keyup', alSubirTecla)
      window.removeEventListener('blur', alPerderFoco)
      sim.detener()
      quitarCamara()
      quitarEditor()
      l.destruir()
      delete window.__kirchi
    })
  })

  // El título de la ventana lleva el asterisco de cambios sin guardar; el proceso principal sabe si preguntar al cerrar.
  const sinGuardar = createMemo(() => estado().sinGuardar)
  createEffect(() => {
    document.title = tituloVentana(archivo(), sinGuardar())
  })
  createEffect(() => api?.estadoVentana({ sucio: sinGuardar() }))

  const zoom = () => porcentajeZoom(cam().zoom)
  // Las conexiones cambian de referencia solo cuando cambia el circuito: contar redes en cada aviso del editor sería caro.
  const con = createMemo(() => estado().con)
  // Nombres de red: una vez por conexiones (que cambian al cambiar el circuito, no en cada paso de un arrastre ni con el hover);
  // el documento se lee sin suscribirse, porque `con` ya cambia cuando el documento cambia en lo que importa.
  const nombres = createMemo(() => {
    const c = con()
    cuentas.nombres++
    return untrack(() => nombresDeRedes(doc(), c))
  })
  const numRedes = createMemo(() => nombres().size)
  const numPiezas = createMemo(() => Object.keys(doc().piezas).length)
  const numFiguras = createMemo(() => Object.keys(doc().figuras ?? {}).length)
  // La selección por contenido: depurar() devuelve conjuntos nuevos en cada cambio del documento y las filas dependen de ella.
  const seleccion = createMemo(() => estado().seleccion, undefined, { equals: mismaSeleccion })
  /** La caja de cada pieza para el minimapa: el cuerpo de su símbolo con su giro, sin sus rótulos. */
  const cajaDeMinimapa = (p: Pieza): Caja | null => {
    const d = editor.lib.get(p.tipo)
    return d ? cajaDeCuerpo(p, d) : null
  }
  // El osciloscopio que se ve: el seleccionado en el lienzo, si no el elegido en el selector, si no el primero por referencia.
  const osciloscopios = createMemo(() =>
    Object.values(doc().piezas)
      .filter((p) => editor.lib.get(p.tipo)?.modelo?.tipo === 'osciloscopio')
      .sort((a, b) => a.ref.localeCompare(b.ref, 'es', { numeric: true }))
      .map((p) => ({ id: p.id, ref: p.ref }))
  )
  const [oscElegido, setOscElegido] = createSignal<Id | null>(null)
  const oscVisible = createMemo((): Id | null => {
    const lista = osciloscopios()
    const sel = [...seleccion().piezas].find((id) => lista.some((o) => o.id === id))
    if (sel) return sel
    const e = oscElegido()
    return e && lista.some((o) => o.id === e) ? e : (lista[0]?.id ?? null)
  })
  const ajustesOscVisible = createMemo(() => {
    const id = oscVisible()
    const p = id ? doc().piezas[id] : undefined
    const def = p ? editor.lib.get(p.tipo) : undefined
    if (!p || !def) return null
    const r = ajustesOsciloscopio(p, def)
    return r.ok ? r.a : null
  })
  // El aspecto de la pantalla: aparte de los ajustes, para que cambiarlo no toque la simulación.
  const aspectoOscVisible = createMemo(() => {
    const id = oscVisible()
    const p = id ? doc().piezas[id] : undefined
    const def = p ? editor.lib.get(p.tipo) : undefined
    return p && def ? aspectoOsciloscopio(p, def) : null
  })
  // La pantalla en pausa: la imagen, sus ajustes y lo que se exporta quedan congelados mientras la simulación
  // sigue. Se suelta al reanudar, al detener o rearrancar la simulación y al quitar el osciloscopio.
  const [oscCongelada, setOscCongelada] = createSignal<{ id: Id; pantalla: PantallaSab; ajustes: AjustesOsciloscopio } | null>(null)
  const congeladaVisible = () => {
    const c = oscCongelada()
    return c && c.id === oscVisible() ? c : null
  }
  createEffect(on(fase, (f) => (f === 'detenida' || f === 'arrancando') && setOscCongelada(null), { defer: true }))
  createEffect(() => {
    const c = oscCongelada()
    if (c && !osciloscopios().some((o) => o.id === c.id)) setOscCongelada(null)
  })
  // Los cursores son de la sesión2): se apagan al cambiar de osciloscopio.
  const [cursores, setCursores] = createSignal<CursoresPantalla | null>(null)
  createEffect(on(oscVisible, () => setCursores(null), { defer: true }))
  let nAjusteOsc = 0
  const ajustarOsc = (prop: string, texto: string, gesto?: string) => {
    const id = oscVisible()
    if (!id) return
    const error = editor.cambiarAjusteInstrumento(id, prop, texto, gesto)
    if (error) registrar(error, 'aviso')
  }
  /** Lo que dijo el último «Ajuste automático» al cambiar el acoplamiento; se va al cambiar de osciloscopio o al salir A de AC. */
  const [notaAjuste, setNotaAjuste] = createSignal<string | null>(null)
  /** El canal del último «Ajuste automático» (0 a 3): la nota se va cuando ese canal sale de AC. */
  const [canalAjustado, setCanalAjustado] = createSignal(0)
  createEffect(on(oscVisible, () => setNotaAjuste(null), { defer: true }))
  createEffect(() => {
    if (ajustesOscVisible()?.canales[canalAjustado()]?.acople !== 'AC') setNotaAjuste(null)
  })
  /** «Ajuste automático» con la señal del primer canal que la tenga (A si la tiene), en un solo paso de deshacer. */
  const autoOsc = (p: PantallaSab | null) => {
    const a = ajustesOscVisible()
    if (!p || !a) return
    const i = canalDeReferencia(a.canales.map((c, k) => ({ on: c.on, acople: c.acople, medidas: p.medidas[k] ?? [] })))
    const m = p.medidas[i]
    if (!m) return
    const letra = CANALES[i]
    const k = letra.toLowerCase()
    const valor = (j: number, otro: number) => (m[j].razon ? otro : m[j].valor)
    const promedio = valor(3, 0)
    const f = m[5].razon ? null : m[5].valor
    const r = ajusteAutomatico({ vmax: valor(1, promedio), vmin: valor(2, promedio), frecuencia: f, acople: a.canales[i].acople, base: a.base, canal: letra })
    const gesto = `auto-${++nAjusteOsc}`
    ajustarOsc(`${k}_acople`, r.acople, gesto)
    ajustarOsc(`${k}_vdiv`, textoDeSerie(r.vdiv), gesto)
    ajustarOsc(`${k}_pos`, textoDeNumero(r.pos), gesto)
    ajustarOsc('base', textoDeSerie(r.base), gesto)
    ajustarOsc('disp_fuente', letra, gesto)
    ajustarOsc('disp_nivel', textoDeNumero(r.nivel, 3), gesto)
    setCanalAjustado(i)
    setNotaAjuste(r.nota)
  }
  const ajustarInstrumento = (id: Id, prop: string, texto: string) => editor.cambiarAjusteInstrumento(id, prop, texto)
  const valido = <T,>(r: Resultado<T>): T | null => (r.ok ? r.a : null)
  const errorDe = <T,>(r: Resultado<T>): string | null => (r.ok ? null : r.error)
  const lecturaInst = () => {
    void lectura()
    return sim.leerInstrumentos()
  }
  /** La línea de carga del multímetro o del osciloscopio seleccionado, con la netlist que corre. */
  const cargaSel = createMemo(() => {
    void lectura()
    const r = sim.resultadoActual
    const [id] = seleccion().piezas
    if (!r || !id) return null
    if (r.instrumentos.multimetros.has(id)) return cargaDeMultimetro(r, id)
    if (r.instrumentos.osciloscopios.has(id)) return CANALES.map((c) => cargaDeCanal(r, id, c)).filter(Boolean).join(' ') || null
    return null
  })
  /** Los controles del multímetro seleccionado, en el inspector; su lectura va en Mediciones. */
  const fichaMultimetro = (id: Id) => {
    const p = () => doc().piezas[id]
    return (
      <Show when={p()}>
        {(pz) => (
          <PanelMultimetro
            refMm={pz().ref}
            ajustes={ajustesMultimetro(pz(), editor.lib.get(pz().tipo)!)}
            lectura={ohmiosDetenido().get(id) ?? lecturaInst()?.multimetros.get(id) ?? null}
            carga={cargaSel()}
            onAjuste={(prop, t) => void ajustarInstrumento(id, prop, t)}
            onReponer={() => sim.reponer(id)}
          />
        )}
      </Show>
    )
  }
  /** Los multímetros del circuito con su cifra: la que mide la vista previa o, detenida, la de los ohmios. */
  const filasMultimetros = (): FilaMultimetro[] => {
    const l = lecturaInst()
    const hay = new Map([...(l?.multimetros ?? []), ...ohmiosDetenido()])
    const simulando = fase() !== 'detenida'
    return Object.values(doc().piezas)
      .filter((p) => editor.lib.get(p.tipo)?.modelo?.tipo === 'multimetro')
      .sort((a, b) => a.ref.localeCompare(b.ref, 'es', { numeric: true }))
      .map((p) => {
        const modo = ajustesMultimetro(p, editor.lib.get(p.tipo)!).modo
        const m = hay.get(p.id)
        const alterna = modo === 'V AC' || modo === 'A AC'
        const detalle = m?.fundido
          ? 'Fusible fundido'
          : simulando && m?.estado === 'ok' && alterna && Number.isFinite(m.frecuencia)
            ? `Frecuencia ${formatearMedida(m.frecuencia, 'Hz', 4)}`
            : simulando && m?.estado === 'ok' && modo === 'Ω' && m.rango
              ? `Rango ${formatearValor(m.rango, 'Ω')}, automático`
              : undefined
        return { id: p.id, ref: p.ref, funcion: modo, texto: m?.texto ?? '- - -', ...(detalle ? { detalle } : {}) }
      })
  }
  /** La línea de la base de tiempo cuando el paso que pide deja la vista previa bajo el tiempo real. */
  const avisoDeBase = () => {
    const h = sim.pasoDeLaBase
    const r = tiempoReal()
    return h !== null && r !== null && r < 0.97 ? `La base de tiempo pide pasos de ${formatearMedida(h, 's')}: la vista previa va al ${Math.round(r * 100)} % del tiempo real.` : null
  }
  /** Lo que la capa de simulación dibuja de los instrumentos (cifras, fuente y canales). */
  /** El eficaz y la frecuencia en vivo de los medidores AC (la ventana del motor que cada uno lleva). */
  const alternasDeMedidores = (): Map<string, { valor: number; frecuencia: number }> | undefined => {
    const r = sim.resultadoActual
    if (!r?.instrumentos.medidores.size) return undefined
    const out = new Map<string, { valor: number; frecuencia: number }>()
    for (const [id, m] of sim.leerInstrumentos()?.multimetros ?? []) if (r.instrumentos.medidores.has(id) && m.estado === 'ok') out.set(id, { valor: m.valor, frecuencia: m.frecuencia })
    return out
  }
  const instrumentosLienzo = (): InstrumentosLienzo | null => {
    const l = sim.leerInstrumentos()
    const r = sim.resultadoActual
    if (!r || (r.instrumentos.multimetros.size + r.instrumentos.osciloscopios.size + r.instrumentos.fuentes.size === 0)) return null
    const tema = ajustes().tema
    return {
      multimetros: new Map([...(l?.multimetros ?? [])].map(([id, m]) => [id, { texto: m.texto, fundido: m.fundido }])),
      osciloscopios: new Map([...r.instrumentos.osciloscopios].map(([id, o]) => [id, o.ajustes.canales.map((c) => c.on)])),
      canales: Object.fromEntries(CANALES.map((c) => [c, hexARgba(colorDeCanal(tema, c))])) as InstrumentosLienzo['canales']
    }
  }
  /** De dónde mide cada entrada del osciloscopio a la vista («← R1:2» en los mandos). */
  const fuentesOsc = createMemo(
    () => {
      const id = oscVisible()
      return id ? fuentesDeInstrumento(doc(), editor.lib, con(), id) : {}
    },
    undefined,
    { equals: (a, b) => JSON.stringify(a) === JSON.stringify(b) }
  )
  /** La rueda sobre un eje de la pantalla: un paso de la serie 1, 2 y 5 de los voltios de ese canal o de la base de tiempo. */
  const escalaOsc = (eje: EjeRueda, dir: 1 | -1) => {
    const a = ajustesOscVisible()
    if (!a) return
    if (eje.tipo === 'tiempo') {
      const v = pasoSerie(a.base, dir, BASE_RANGO[0], BASE_RANGO[1])
      if (v !== a.base) ajustarOsc('base', textoDeSerie(v))
      return
    }
    const c = a.canales.find((x) => x.canal === eje.canal)!
    const v = pasoSerie(c.vdiv, dir, VDIV_RANGO[0], VDIV_RANGO[1])
    if (v !== c.vdiv) ajustarOsc(`${eje.canal.toLowerCase()}_vdiv`, textoDeSerie(v))
  }
  // ---- El osciloscopio en una ventana aparte ----
  const apiOsc = () => window.kirchi?.osciloscopio
  const [ventanaOscAbierta, setVentanaOscAbierta] = createSignal(false)
  let avisoOscInvalido = false
  const enlaceOsc = crearEnlaceOsc(
    {
      abrir: (d) => apiOsc()?.abrir(d) ?? Promise.resolve(false),
      actualizar: (d) => apiOsc()?.actualizar(d) ?? Promise.resolve('sin-ventana' as const)
    },
    setVentanaOscAbierta,
    () => {
      // Una sola vez por racha: el sondeo corre 30 veces por segundo.
      if (avisoOscInvalido) return
      avisoOscInvalido = true
      registrar('La ventana del osciloscopio rechazó los datos y no se actualiza hasta que cambien.', 'error')
    }
  )
  const lecturaOsc = memoPorClave<ReturnType<typeof sim.leerInstrumentos>>()
  let copiaPantallaOsc: { v: number; id: Id; p: PantallaOsc | null } | null = null
  let copiaCongeladaOsc: { c: object; p: CongeladaOsc } | null = null
  /** Lo que ve la ventana: los ajustes y el aspecto del elegido, la fase y, solo cuando cambian, las pantallas copiadas. */
  const datosOsc = (cursoresAhora: DatosOsc['cursores']) => {
    const id = oscVisible()
    if (!id) return null
    const v = sim.versionPantalla(id)
    // La lectura copia los arreglos de la memoria compartida: solo se repite si cambió la pantalla o la fase.
    const l = lecturaOsc(`${id}|${v}|${fase()}`, () => sim.leerInstrumentos(id))
    if (!copiaPantallaOsc || copiaPantallaOsc.v !== v || copiaPantallaOsc.id !== id) copiaPantallaOsc = { v, id, p: l?.pantalla ? copiarPantalla(l.pantalla) : null }
    const c = congeladaVisible()
    if (!c) copiaCongeladaOsc = null
    else if (copiaCongeladaOsc?.c !== c) copiaCongeladaOsc = { c, p: { pantalla: copiarPantalla(c.pantalla), ajustes: c.ajustes as unknown as Record<string, unknown> } }
    const asp = aspectoOscVisible()
    const datos: DatosOsc = {
      tema: ajustes().tema,
      osciloscopios: osciloscopios().map((o) => ({ id: o.id, ref: o.ref })),
      elegido: id,
      ajustes: ajustesOscVisible() as unknown as Record<string, unknown> | null,
      aspecto: (asp?.aspecto ?? null) as unknown as Record<string, unknown> | null,
      aspectoCanales: (asp?.canales ?? {}) as unknown as Record<string, unknown>,
      fase: fase(),
      teclaSimular: teclaDe('simular') ?? null,
      estadoDisparo: estadoDelDisparo(fase(), l?.pantalla ?? null),
      fuentes: fuentesOsc(),
      aviso: avisoDeBase(),
      notaAjuste: notaAjuste(),
      cursores: cursoresAhora,
      capturada: l?.capturada ?? false,
      pantalla: copiaPantallaOsc.p,
      congelada: copiaCongeladaOsc?.p ?? null
    }
    return { datos, identidad: { pantalla: copiaPantallaOsc, congelada: copiaCongeladaOsc } }
  }
  // Los cursores se mueven en la ventana y solo se guardan aquí: tras abrir no se mandan de vuelta (se perdería el arrastre).
  let cursoresAlAbrirOsc: DatosOsc['cursores'] = null
  const abrirVentanaOsc = async () => {
    if (!apiOsc()) return
    cursoresAlAbrirOsc = cursoresAOsc(cursores())
    copiaPantallaOsc = null
    const d = datosOsc(cursoresAlAbrirOsc)
    if (!d) return anunciar('No hay un osciloscopio que abrir.')
    if (!(await enlaceOsc.abrir(d.datos, d.identidad))) anunciar('No se pudo abrir la ventana del osciloscopio.')
  }
  // Mientras la ventana esté abierta se le mantiene al día (unas 30 veces por segundo, sin crearla ni enfocarla).
  createEffect(() => {
    if (!ventanaOscAbierta()) return
    const t = setInterval(() => {
      const d = datosOsc(cursoresAlAbrirOsc)
      if (d) void enlaceOsc.actualizar(d.datos, d.identidad).then((ok) => { if (ok) avisoOscInvalido = false })
    }, 33)
    onCleanup(() => clearInterval(t))
  })
  const accionesOsc: AccionesOsc = {
    pausar: () => {
      const id = oscVisible()
      const p = id ? sim.leerInstrumentos(id)?.pantalla : null
      const a = ajustesOscVisible()
      if (id && p && a) setOscCongelada({ id, pantalla: p, ajustes: a })
    },
    reanudar: () => setOscCongelada(null),
    forzar: () => sim.forzarPantallas(),
    auto: () => {
      const id = oscVisible()
      autoOsc(congeladaVisible()?.pantalla ?? (id ? (sim.leerInstrumentos(id)?.pantalla ?? null) : null))
    },
    rearmar: () => oscVisible() && sim.rearmar(oscVisible()!),
    exportar: () => abrirExportarCaptura(),
    elegir: (id) => setOscElegido(id),
    // Con la ventana cerrada, las pantallas las mide la franja: una orden que llega tarde no debe ponerlas a cero.
    columnas: (id, n) => untrack(ventanaOscAbierta) && sim.columnasDePantalla(id, n),
    cursores: (c) => setCursores(c),
    escala: (e, d) => escalaOsc(e, d),
    posicion: (c, pos, gesto) => ajustarOsc(`${c.toLowerCase()}_pos`, textoDeNumero(pos), gesto),
    ajuste: (p, t, g) => ajustarOsc(p, t, g)
  }
  onMount(() => {
    const quitar = [
      apiOsc()?.alComando((c) => despacharComando(c, accionesOsc)),
      // Acoplar: la vista vuelve a la pestaña Osciloscopio de la franja.
      apiOsc()?.alAcoplar(() => setInstrumentos({ abierta: true, pestaña: 'osciloscopio' })),
      apiOsc()?.alCerrar(() => enlaceOsc.cerrada())
    ]
    onCleanup(() => quitar.forEach((q) => q?.()))
  })
  const panelOsciloscopio = () => (
    <Show
      when={!ventanaOscAbierta()}
      fallback={
        <div class="osc-en-ventana" role="status">
          <p>El osciloscopio está en una ventana aparte.</p>
          <button type="button" class="boton principal" onClick={() => void apiOsc()?.cerrar()}>
            Acoplar a la franja
          </button>
        </div>
      }
    >
    <PanelOsciloscopio
      osciloscopios={osciloscopios()}
      elegido={oscVisible()}
      onElegir={setOscElegido}
      ajustes={ajustesOscVisible()}
      aspecto={aspectoOscVisible()?.aspecto}
      aspectoCanales={aspectoOscVisible()?.canales}
      tema={ajustes().tema}
      fase={fase()}
      teclaSimular={teclaDe('simular')}
      leer={(id) => sim.leerInstrumentos(id)}
      version={(id) => sim.versionPantalla(id)}
      registro={(id, hasta) => sim.registroFino(id, hasta)}
      onColumnas={(id, n) => sim.columnasDePantalla(id, n)}
      cursores={cursores()}
      onCursores={setCursores}
      aviso={avisoDeBase()}
      notaAjuste={notaAjuste()}
      onAjuste={ajustarOsc}
      onAuto={autoOsc}
      congelada={congeladaVisible()}
      onForzar={() => sim.forzarPantallas()}
      onPausar={(c) => oscVisible() && setOscCongelada({ id: oscVisible()!, ...c })}
      onReanudar={() => setOscCongelada(null)}
      onExportar={abrirExportarCaptura}
      onEscala={escalaOsc}
      onPosicion={(c, pos, gesto) => ajustarOsc(`${c.toLowerCase()}_pos`, textoDeNumero(pos), gesto)}
      onVentana={apiOsc() ? () => void abrirVentanaOsc() : undefined}
      mandos={(p) => (
        <Show when={ajustesOscVisible()}>
          {(a) => (
            <MandosOsciloscopio
              ajustes={a}
              fuentes={fuentesOsc}
              estadoDisparo={() => estadoDelDisparo(fase(), p())}
              onAjuste={ajustarOsc}
              onRearmar={() => oscVisible() && sim.rearmar(oscVisible()!)}
            />
          )}
        </Show>
      )}
    />
    </Show>
  )
  // Avisos del circuito: una vez por conexiones, para el inspector (un paso de arrastre no los recalcula), y solo mientras
  // los muestra: sin selección y con el inspector abierto. Plegado no se calculan en cada edición; al abrirlo, el memo se
  // rehace con las conexiones de ese momento.
  const avisosVisibles = createMemo(() => {
    const a = ajustes()
    return a.inspector && a.panelDerecho === 'inspector' && tamañoSeleccion(seleccion()) === 0
  })
  const avisos = createMemo((): Aviso[] => {
    if (!avisosVisibles()) return []
    const c = con()
    cuentas.avisos++
    return untrack(() => avisosDelCircuito(doc(), c, editor.lib))
  })
  // Una lista distinta (otro circuito, un aviso que se resolvió) vuelve a mostrar solo las primeras.
  createEffect(on(() => avisos().map((a) => a.texto).join('\n'), () => setAvisosAbiertos(false), { defer: true }))
  // El inspector solo se rehace si cambia lo que muestra: el hover (que cambia el estado) no vuelve a crear sus campos.
  const inspector = createMemo(
    () => {
      const c = con(), n = nombres(), s = seleccion(), a = avisos()
      const todos = avisosAbiertos()
      return untrack(() => vistaInspector(doc(), editor.lib, c, s, n, { piezas: numPiezas(), redes: numRedes() }, a, todos))
    },
    undefined,
    { equals: (a: VistaInspector, b: VistaInspector) => JSON.stringify(a) === JSON.stringify(b) }
  )
  // Formato de la selección (solo notas y etiquetas): lo muestran la barra flotante, el menú Formato y el inspector.
  const formato = createMemo(() => vistaFormato(doc(), seleccion()), undefined, { equals: (a, b) => JSON.stringify(a) === JSON.stringify(b) })
  const formatear = (o: OrdenFormato) => {
    if (o.tipo === 'parche') editor.cambiarFormato(o.parche, { control: o.control })
    else if (o.tipo === 'alternar') editor.alternarFormato(o.prop)
    else editor.pasoTam(o.dir)
  }
  /** Caja en la ventana de las notas y etiquetas seleccionadas (sigue a la cámara); null sin lienzo. */
  const cajaTextosEnPantalla = (): Caja | null => {
    const s = seleccion(), d = doc()
    const cajas = [...[...s.notas].flatMap((id) => (d.notas[id] ? [cajaNota(d.notas[id])] : [])), ...[...s.etiquetas].flatMap((id) => (d.etiquetas[id] ? [cajaEtiqueta(d.etiquetas[id])] : []))]
    if (!cajas.length || !lienzo) return null
    const a = enPantalla({ x: Math.min(...cajas.map((c) => c.minX)), y: Math.min(...cajas.map((c) => c.minY)) })
    const b = enPantalla({ x: Math.max(...cajas.map((c) => c.maxX)), y: Math.max(...cajas.map((c) => c.maxY)) })
    return { minX: a.x, minY: a.y, maxX: b.x, maxY: b.y }
  }
  const areaLienzo = (): Caja | null => {
    void cam()
    void vista()
    const r = lienzo?.gl.getBoundingClientRect()
    return r ? { minX: r.left, minY: r.top, maxX: r.right, maxY: r.bottom } : null
  }
  /** La barra flotante: con notas o etiquetas seleccionadas y nada más, sin arrastre ni texto en edición. */
  const barraFormato = () => {
    const f = formato(), e = estado()
    if (!f || !soloTextos(seleccion()) || e.arrastrando || e.herramienta !== 'seleccionar' || pedido() || menu()) return null
    const c = cajaTextosEnPantalla(), a = areaLienzo()
    return c && a && cajaTocaArea(c, a) ? { vista: f, caja: c, area: a } : null
  }

  /** Punto de mundo en coordenadas de ventana; depende de la cámara, así lo que flota encima la sigue al hacer zoom o paneo. */
  const enPantalla = (p: Punto): Punto => {
    void cam()
    // También cambia con el tamaño y la posición del lienzo (plegar un panel, redimensionar la ventana).
    void vista()
    return lienzo ? lienzo.aPantalla(p) : p
  }
  const zoomPct = () => zoomAPorcentaje(cam().zoom)
  /** El interruptor o botón seleccionado mientras la vista previa está activa: el inspector ofrece accionarlo. */
  const accionSim = () => {
    const a = fase() === 'detenida' ? null : accionableSeleccionado(doc(), editor.lib, seleccion())
    return a?.tipo === 'reponer' && !fusibleFundido(a.id) ? null : a
  }
  const controlesSim = () => ({
    fase: fase(), onSimular: simularOPausar, onDetener: () => sim.detener(), voltajes: voltajes(), onVoltajes: alternarVoltajes, tecla: teclaDe,
    // La barra del lienzo limpio gana Velocidad y Avanzar junto a Simular.
    onAvanzar: () => void ejecutarComando('avanzar', document.body),
    velocidad: { valor: velocidad(), onMenu: (b: HTMLElement) => anclarMenu(b, menuVelocidad(velocidad())) }
  })
  const ponerZoomPct = (pct: number) => lienzo?.ponerZoom(porcentajeAZoom(pct))

  // Barra superior: con `mismoEstadoCinta`, un movimiento del ratón o un paso de arrastre no la redibujan.
  // Tutorial «Aprende Kirchi»: sus pasos se cumplen con lo que muestran el editor y la simulación.
  const tutorial = crearControlTutorial({
    alAvanzar: (id, paso, terminado) => {
      const t = ajustes().tutorial
      cambiarAjustes({ tutorial: { ...t, avance: conAvance(t.avance, id, terminado ? { paso, hecho: true } : { paso }) } })
    },
    alTerminar: (c) => anunciar(`Terminaste el capítulo ${c.numero}: ${c.titulo}.`)
  })
  const vacio = () => numPiezas() === 0 && docVacio(doc())
  const PCT_MIN = zoomAPorcentaje(ZOOM_MIN)
  const PCT_MAX = zoomAPorcentaje(ZOOM_MAX)
  // ---------- Análisis con ngspice ----------
  // Las corridas viven en memoria (no en el .kir); la interfaz se entera por `verAlmacen`. La ficha de cada análisis guarda su
  // configuración en el documento (colección `analisis`, un paso de deshacer por cambio) y Ejecutar habla solo por el IPC.
  const almacen = new AlmacenAnalisis({ api: () => apiNgspice(), registrar: (t, n) => registrar(t, n) })
  const [verAlmacen, setVerAlmacen] = createSignal(0)
  onCleanup(
    almacen.suscribir(() => {
      setVerAlmacen((v) => v + 1)
      lienzo?.invalidarSimulacion()
    })
  )
  const [fichaTipo, setFichaTipo] = createSignal<TipoFicha | null>(null)
  const [analisisId, setAnalisisId] = createSignal<string | null>(null)
  /** Solo se arma el contexto del circuito (una compilación de la netlist) cuando algo de Análisis está a la vista. */
  const analisisActivo = () => (ajustes().inspector && ajustes().panelDerecho === 'analisis') || (instrumentos().abierta && instrumentos().pestaña === 'graficas')
  const contextoAn = createMemo(() => (analisisActivo() ? (doc(), armarContexto(untrack(doc), editor.lib, con())) : null))
  const analisisGuardados = () => Object.values(doc().analisis ?? {})
  const delTipo = () => {
    const t = fichaTipo()
    return t ? analisisGuardados().filter((a) => tipoDeFicha(a) === t).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { numeric: true })) : []
  }
  const elegidoAn = () => delTipo().find((a) => a.id === analisisId()) ?? delTipo()[0] ?? null
  const bloqueoAnalisis = createMemo((): string | null => {
    if (!analisisActivo()) return null
    if (vacio()) return 'El circuito está vacío: no hay nada que analizar.'
    const c = contextoAn()
    if (c && !c.ok) return c.error
    const malos = avisosDelCircuito(doc(), con(), editor.lib).filter((a) => !a.leve)
    return malos.length > 0 ? `${malos.length === 1 ? 'Hay un aviso que impide' : `Hay ${malos.length} avisos que impiden`} analizar el circuito: ${malos[0].texto}` : null
  })
  /** Lo que identifica el circuito para saber si un punto de operación sigue valiendo: cambia con cualquier edición de piezas, cables o redes. */
  const refsCircuito = () => {
    const d = editor.doc
    return [d.piezas, d.cables, d.etiquetas, d.alimentaciones]
  }
  let refsDelOp: unknown[] | null = null
  const mismoCircuito = (a: unknown[] | null) => !!a && refsCircuito().every((x, i) => x === a[i])
  /** El punto de operación vigente sobre el lienzo: los mismos chips de la tecla V, sin cables coloreados. */
  const capaDePuntoDeOperacion = (esc: { textos?: readonly Texto[] } | null | undefined): CapaSim | null => {
    const op = almacen.opVigente
    if (!op || !mismoCircuito(refsDelOp)) return null
    const l: Lectura = { t: 0, ratio: 1, redes: op.voltajePorRed, piezas: new Map() }
    return {
      trazos: new Float32Array(0), nTrazos: 0, triangulos: new Float32Array(0), nTriangulos: 0,
      textos: chipsDeVoltaje(editor.doc, editor.lib, editor.con, l, esc?.textos, { redes: null, desplazos: desplazosChips })
    }
  }
  /** Los análisis creados desde la ficha que aún no se han ejecutado: Cancelar los descarta. */
  const sinEjecutar = new Set<string>()
  const nuevoAnalisis = (t: TipoFicha): string | null => {
    const r = armarContexto(doc(), editor.lib, con())
    if (!r.ok) return r.error
    const n = analisisNuevo(t, r.ctx, idAleatorio('a'), analisisGuardados())
    if (!n.ok) return n.error
    const e = editor.guardarAnalisis(n.analisis)
    if (!e) {
      setAnalisisId(n.analisis.id)
      sinEjecutar.add(n.analisis.id)
    }
    return e
  }
  /** Al cambiar el circuito, un análisis guardado cuyas piezas ya no existen toma la de omisión, con una línea en el
   * Registro; sin reemplazo, la ficha lo señala. */
  const alDiaConElCircuito = (): void => {
    const d = doc()
    const lista = Object.values(d.analisis ?? {})
    if (lista.length === 0 || !lista.some((a) => nombraPiezaAusente(a, d.piezas))) return
    const r = armarContexto(d, editor.lib, con())
    if (!r.ok) return
    for (const a of lista) {
      const q = reconciliarAnalisis(a, r.ctx)
      if (q.cambios.length === 0) continue
      if (editor.guardarAnalisis(q.analisis) === null) for (const c of q.cambios) registrar(c, 'info')
    }
  }
  createEffect(() => {
    doc()
    fase()
    untrack(alDiaConElCircuito)
  })
  /** Cancelar con la ficha en reposo: descarta lo que se estaba armando y vuelve a la vista de omisión del riel derecho. */
  const descartarFicha = () => {
    const a = elegidoAn()
    if (a && seDescartaAlCancelar(a.id, sinEjecutar, almacen.corridas())) editor.borrarAnalisis(a.id)
    if (a) sinEjecutar.delete(a.id)
    setFichaTipo(null)
    setAnalisisId(null)
    cambiarAjustes({ panelDerecho: 'inspector', inspector: true })
  }
  const abrirFicha = (t: TipoFicha) => {
    setFichaTipo(t)
    // La ficha vive en la pestaña Análisis del riel derecho.
    cambiarAjustes({ panelDerecho: 'analisis', inspector: true })
    const hay = analisisGuardados().filter((a) => tipoDeFicha(a) === t)
    if (hay.length === 0) {
      const e = nuevoAnalisis(t)
      if (e) anunciar(e)
    } else if (!hay.some((a) => a.id === analisisId())) setAnalisisId(hay[0].id)
    setTimeout(() => document.querySelector<HTMLElement>('.ficha-analisis .entrada-valor input, .ficha-analisis select.campo, .ficha-analisis .boton')?.focus(), 0)
  }
  const ejecutarAnalisis = async () => {
    let a = elegidoAn()
    if (!a) return
    const r = armarContexto(doc(), editor.lib, con())
    if (!r.ok) {
      registrar(`${a.nombre}: ${r.error}`, 'error')
      return
    }
    // Si algo se quedó sin poner al día (no se podía guardar), se corre con lo repuesto sin tocar el documento.
    const q = reconciliarAnalisis(a, r.ctx)
    if (q.pendientes.length > 0) {
      registrar(`${a.nombre}: ${q.pendientes[0]}`, 'error')
      return
    }
    a = q.analisis
    sinEjecutar.delete(a.id)
    refsDelOp = refsCircuito()
    const c = await almacen.ejecutar(a, r.ctx, seleccionDeGuardadas(a.trazas, r.ctx))
    if (!mismoCircuito(refsDelOp)) almacen.descartarOp()
    // Un resultado bueno se muestra en Gráficas; un error se queda en la ficha, donde se puede corregir.
    if (c?.estado === 'listo' && !(instrumentos().abierta && instrumentos().pestaña === 'graficas')) setInstrumentos({ abierta: true, pestaña: 'graficas' })
  }
  /** El error de la última corrida de un análisis mientras su configuración no haya cambiado desde entonces. */
  const errorDeCorrida = (a: AnalisisDoc): string | null => {
    verAlmacen()
    const c = almacen.corridas().find((x) => x.analisisId === a.id)
    return c && c.estado === 'error' && JSON.stringify(c.analisis) === JSON.stringify(a) ? (c.error ?? null) : null
  }
  /** Cómo quedó la última corrida de un análisis, junto a Ejecutar: «Listo · 97 ms», «Con error» o «Detenido». */
  const estadoDeCorrida = (a: AnalisisDoc): string | null => {
    verAlmacen()
    const c = almacen.corridas().find((x) => x.analisisId === a.id)
    if (!c || c.estado === 'corriendo') return null
    return c.estado === 'listo' ? `Listo · ${Math.round(c.duracionMs ?? 0)} ms` : c.estado === 'error' ? 'Con error' : 'Detenido'
  }
  const puedeEditarAnalisis = () => fase() === 'detenida' && !archivo().soloLectura
  const panelFicha = () => (
    <Show when={fichaTipo()} fallback={<p class="secundario">Elige un análisis con el botón Analizar de Inicio para configurarlo.</p>}>
      {(t) => (
        <FichaAnalisis
          tipo={t()}
          guardados={delTipo()}
          elegido={elegidoAn()}
          onElegir={setAnalisisId}
          ctx={(() => {
            const c = contextoAn()
            return c?.ok ? c.ctx : null
          })()}
          errorCtx={(() => {
            const c = contextoAn()
            return c && !c.ok ? c.error : null
          })()}
          editable={puedeEditarAnalisis()}
          motivoNoEditable={fase() !== 'detenida' ? MENSAJE_DETENER_PARA_EDITAR : archivo().soloLectura ? PISTA_SOLO_LECTURA : null}
          onNuevo={() => nuevoAnalisis(t())}
          onGuardar={(a) => editor.guardarAnalisis(a)}
          onBorrar={(id) => {
            editor.borrarAnalisis(id)
          }}
          corriendo={(verAlmacen(), almacen.corriendo)}
          motivoNoEjecutar={razonDeshabilitado('analisis-ejecutar', estadoCinta(), teclaDe)}
          onEjecutar={() => void ejecutarAnalisis()}
          onDetener={() => almacen.cancelar()}
          onDescartar={descartarFicha}
          errorCorrida={elegidoAn() ? errorDeCorrida(elegidoAn()!) : null}
          estadoCorrida={elegidoAn() ? estadoDeCorrida(elegidoAn()!) : null}
        />
      )}
    </Show>
  )
  // ---------- Gráficas de análisis: aspecto guardado, exportar y ventana aparte ----------
  /** El aspecto de la gráfica se guarda con el análisis de la corrida (un paso de deshacer); null si se guardó, o por qué no. */
  const guardarGraficaDeCorrida = (c: CorridaGuardada, g: GraficaDoc | undefined): string | null => {
    const a = doc().analisis?.[c.analisisId]
    if (!a) return 'El análisis de esta corrida ya no está en el documento: el aspecto vale solo mientras la veas.'
    const { grafica: _antes, ...resto } = a
    return editor.guardarAnalisis(g ? { ...resto, grafica: g } : resto)
  }
  const [graficaExp, setGraficaExp] = createSignal<EntradaFigura | null>(null)
  const [exportandoGrafica, setExportandoGrafica] = createSignal(false)
  const abrirExportarGrafica = (e: EntradaFigura) => setGraficaExp(e)
  const exportarLaGrafica = async (e: EntradaFigura) => {
    if (!api) return
    setExportandoGrafica(true)
    try {
      const fuentes = fuentesDeCss()
      const r = await exportarGrafica(e, ajustes().figura, ajustes().tema, `${archivo().nombre.replace(/\.kir$/i, '')} ${e.titulo}`, {
        api,
        rasterizar,
        ppp: PPP_BASE,
        css: (ts) => cssDeFuentes(ts, fuentes),
        pilas: pilasFuentes()
      })
      if (r.ok) {
        registrar(`Se exportó la gráfica de ${e.titulo}.`, 'info')
        setGraficaExp(null)
      } else if (!('cancelado' in r)) errorDeArchivo(r.error)
    } catch (err) {
      errorDeArchivo(`No se pudo exportar la gráfica: ${err instanceof Error ? err.message : String(err)}.`)
    } finally {
      setExportandoGrafica(false)
    }
  }
  const apiGraficas = () => window.kirchi?.graficas
  // Memos: solo avisan si el valor cambia (guardar las opciones de un diálogo o plegar la franja cambian `ajustes()` entero).
  const temaDeGraficas = createMemo(() => ajustes().tema)
  const nombreDeArchivo = createMemo(() => archivo().nombre)
  /** Las corridas con curvas, listas para viajar a la ventana aparte (las del punto de operación van en tabla y se quedan). */
  const datosParaVentana = () => {
    verAlmacen()
    const corridas = almacen.corridas().filter((c) => c.estado === 'listo' && c.mapeado && !c.tabla)
    return { corridas: corridas.map((c) => ({ n: c.n, nombre: c.nombre, analisis: c.analisis, mapeado: c.mapeado! })), elegida: almacen.seleccionada?.n ?? null, tema: temaDeGraficas(), archivo: nombreDeArchivo() }
  }
  const [ventanaGraficasAbierta, setVentanaGraficasAbierta] = createSignal(false)
  const enlaceGraficas = crearEnlaceVentana(
    {
      abrir: (d) => apiGraficas()?.abrir(d) ?? Promise.resolve(false),
      actualizar: (d) => apiGraficas()?.actualizar(d) ?? Promise.resolve(false)
    },
    setVentanaGraficasAbierta
  )
  const abrirVentanaGraficas = async () => {
    if (!apiGraficas()) return
    const d = datosParaVentana()
    if (d.corridas.length === 0) return anunciar('No hay corridas con gráficas que abrir.')
    await enlaceGraficas.abrir(d)
  }
  // Mientras la ventana aparte esté abierta, cada corrida nueva o quitada se le manda, sin enfocarla ni reabrirla.
  createEffect(() => {
    const d = datosParaVentana()
    if (untrack(ventanaGraficasAbierta) && d.corridas.length > 0) void enlaceGraficas.actualizar(d)
  })
  onMount(() => {
    const quitar = apiGraficas()?.alExportar((p) => {
      const c = almacen.corridas().find((x) => x.n === p.n)
      if (!c || !c.mapeado) return
      const e = entradaDeCorrida({ nombre: c.nombre, analisis: c.analisis, mapeado: c.mapeado }, p.ocultas, (a) => {
        const { anotaciones: _viejas, ...resto } = c.analisis.grafica ?? {}
        const nuevas = anotacionesParaDoc(a) as GraficaDoc['anotaciones']
        const g: GraficaDoc = nuevas ? { ...resto, anotaciones: nuevas } : resto
        return guardarGraficaDeCorrida(c, Object.keys(g).length > 0 ? g : undefined)
      })
      if (e) setGraficaExp(e)
    })
    // Acoplar: la corrida que se veía en la ventana vuelve a la franja, en la pestaña Gráficas.
    const quitarAcople = apiGraficas()?.alAcoplar((n) => {
      almacen.elegir(n)
      setInstrumentos({ abierta: true, pestaña: 'graficas' })
    })
    onCleanup(() => {
      quitar?.()
      quitarAcople?.()
    })
  })
  const panelGraficas = () => (
    <PanelGraficas
      corridas={(verAlmacen(), almacen.corridas())}
      seleccionada={(verAlmacen(), almacen.seleccionada)}
      corriendo={(verAlmacen(), almacen.corriendo)}
      onElegir={(n) => almacen.elegir(n)}
      onQuitar={(n) => almacen.quitar(n)}
      onLimpiar={() => almacen.limpiar()}
      tema={ajustes().tema}
      onGrafica={guardarGraficaDeCorrida}
      onExportar={abrirExportarGrafica}
      onVentana={api && apiGraficas() ? () => void abrirVentanaGraficas() : undefined}
    />
  )

  /** Qué hay seleccionado y cómo se llama, para el último grupo de Inicio. */
  const descripcionSel = createMemo(
    () => {
      const s = seleccion()
      const d = doc()
      return describirSeleccion({
        piezas: [...s.piezas].flatMap((id) => {
          const p = d.piezas[id]
          const def = p ? editor.lib.get(p.tipo) : undefined
          return p ? [{ ref: p.ref, nombre: def?.nombre.es ?? 'Pieza', modelo: def?.modelo?.tipo }] : []
        }),
        cables: s.cables.size,
        etiquetas: [...s.etiquetas].flatMap((id) => (d.etiquetas[id] ? [{ nombre: d.etiquetas[id].nombre }] : [])),
        notas: s.notas.size,
        figuras: s.figuras.size,
        sondas: s.sondas.size
      })
    },
    undefined,
    { equals: (a, b) => a.tipo === b.tipo && a.titulo === b.titulo }
  )
  /** La división del osciloscopio a la vista (s/div), para el intervalo automático de F6; null sin osciloscopio. */
  const divisionOsc = (): number | null => divisionDeVista(instrumentos().abierta, instrumentos().pestaña, ajustesOscVisible()?.base ?? null)
  const estadoCinta = createMemo(
    (): EstadoCinta => ({
      fase: fase(),
      puedeDeshacer: estado().puedeDeshacer,
      puedeRehacer: estado().puedeRehacer,
      // El editor no avisa al copiar: el portapapeles se vuelve a leer con cada cambio del editor, y el ejecutor lo revisa al pulsar.
      puedePegar: (estado(), editor.puedePegar),
      soloLectura: archivo().soloLectura,
      vacio: vacio(),
      recientes: ajustes().archivosRecientes.length,
      voltajes: voltajes(),
      tema: ajustes().tema,
      panel: ajustes().panel,
      lateral: ajustes().lateral,
      inspector: ajustes().inspector,
      panelDerecho: ajustes().panelDerecho,
      franja: instrumentos().abierta ? instrumentos().pestaña : null,
      plegada: ajustes().cinta.plegada,
      ventana: apiVentana() !== undefined,
      seleccion: tamañoSeleccion(seleccion()),
      seleccionTipo: descripcionSel().tipo,
      seleccionTitulo: descripcionSel().titulo,
      soloSondas: seleccion().sondas.size > 0 && seleccion().sondas.size === tamañoSeleccion(seleccion()),
      piezasSeleccionadas: seleccion().piezas.size + seleccion().etiquetas.size,
      textosManuales: (estado(), editor.puedeRestablecerTextos()),
      colocando: estado().herramienta === 'colocar' && (estado().fantasma !== null || estado().fantasmaFragmento !== null),
      topeZoom: zoomPct() <= PCT_MIN + 1e-6 ? 'minimo' : zoomPct() >= PCT_MAX - 1e-6 ? 'maximo' : null,
      tamañoInterfaz: ajustes().tamañoInterfaz,
      velocidad: velocidad(),
      avanceTexto: textoCantidad(delta(), velocidad(), divisionOsc(), sim.pasoMaximo),
      avanzando: avance() !== null,
      retrocesos: retrocesos(),
      corriente: ajustes().simulacion.corriente,
      animaciones: animaciones(),
      movimientoReducido,
      sonido: ajustes().simulacion.sonido,
      tutorial: tutorial.estado() !== null,
      analisisCorriendo: (verAlmacen(), almacen.corriendo),
      analisisBloqueo: bloqueoAnalisis(),
      analisisFicha: elegidoAn() ? fichaTipo() : null,
      grabacion: window.kirchi?.grabacion ? grabador.estado() : 'no-disponible',
      grabacionSeg: enCurso() ? segundosGrabados() : 0
    }),
    undefined,
    { equals: mismoEstadoCinta }
  )
  /** Solo por la región viva (no va al Registro): por qué una orden de la cinta no actúa. */
  const anunciar = (t: string) => {
    setAnuncio('')
    queueMicrotask(() => setAnuncio(t))
  }
  /** «Copiar todo» del Registro; el resultado solo se anuncia (no se agrega al Registro que se copió). */
  const copiarRegistro = async () => {
    const l = registro()
    const ok = await copiarAlPortapapeles(textoDelRegistro(l))
    anunciar(ok ? `${l.length === 1 ? 'Se copió 1 mensaje' : `Se copiaron ${l.length.toLocaleString('es-MX')} mensajes`} del Registro.` : 'No se pudo copiar el Registro.')
  }
  /** Vacía el Registro. Solo lo leen su lista y el contador de su pestaña; los avisos del circuito no salen de él. */
  const borrarRegistro = () => {
    const n = registro().length
    setRegistro([])
    anunciar(`Registro borrado: ${n === 1 ? 'se quitó 1 mensaje' : `se quitaron ${n.toLocaleString('es-MX')} mensajes`}.`)
  }
  const alternarFranja = () => setInstrumentos((i) => ({ ...i, abierta: !i.abierta }))
  // El tiempo y lo que se muestra al simular.
  const cambiarVelocidad = (v: number | null) => {
    if (v === null || v === velocidad()) return
    setVelocidad(v)
    sim.ponerVelocidad(v)
    // Sin límite de tiempo real no suena (el tono no seguiría a nada que se oiga).
    if (!Number.isFinite(v)) callar()
    anunciar(anuncioDeVelocidad(v))
  }
  const cambiarSimulacion = (parche: Partial<Ajustes['simulacion']>) => cambiarAjustes({ simulacion: { ...ajustes().simulacion, ...parche } })
  const alternarCorriente = () => {
    const si = !ajustes().simulacion.corriente
    cambiarSimulacion({ corriente: si })
    if (!si) flechas = null
    lienzo?.invalidarSimulacion()
    anunciar(si ? 'Corriente animada visible.' : 'Corriente animada oculta.')
  }
  const alternarAnimaciones = () => {
    const si = !animaciones()
    setAnimacionesSesion(si)
    // Con la preferencia del sistema el cambio vale solo para la sesión; sin ella también se recuerda.
    if (!movimientoReducido) cambiarSimulacion({ animaciones: si })
    lienzo?.invalidarSimulacion()
    anunciar(si ? 'Animaciones en marcha.' : 'Animaciones en pausa.')
  }
  const alternarSonido = () => {
    if (sonidoBloqueado()) return altavoz.reanudar()
    const si = !ajustes().simulacion.sonido
    cambiarSimulacion({ sonido: si })
    if (!si) callar()
    anunciar(si ? 'Sonido activado.' : 'Sonido silenciado.')
  }
  const avanzarAhora = () => {
    const d = delta()
    // Detener reinicia: el primer avance desde detenida empieza en 0 s y se dice.
    if (sim.fase === 'detenida') setAvisoLienzo('La simulación empieza desde 0 s.')
    void sim.avanzar(intervaloDe(d, velocidad(), divisionOsc())).then((r) => {
      if (!r) return
      const texto = d === 'paso' ? `Un paso de cálculo de ${formatearMedida(r.dt, 's')}` : null
      setUltimoPaso(texto)
      anunciar(`${texto ?? `Avanzó ${formatearMedida(r.dt, 's')}`}: t = ${formatearTiempo(r.t, velocidad())}.`)
    })
  }
  /** Vuelve al estado de antes del último avance (Shift+F6) y relee la vista previa. */
  const retrocederAhora = () => {
    void sim.retroceder().then((r) => {
      if (!r) return anunciar('No hay un avance anterior al que volver.')
      setUltimoPaso(null)
      leerSim()
      lienzo?.invalidarSimulacion()
      anunciar(`Retrocedió a t = ${formatearTiempo(r.t, velocidad())}.`)
    })
  }
  const avanzarHastaT = (t: number, reiniciar: boolean): 'pasado' | void => {
    if (!reiniciar && sim.activa && t <= (lectura()?.t ?? 0)) return 'pasado'
    void sim.avanzarHasta(t, reiniciar).then((r) => {
      if (r && r !== 'pasado') anunciar(r.interrumpido ? `Avance interrumpido en t = ${formatearTiempo(r.t, velocidad())}.` : `Llegó a t = ${formatearTiempo(r.t, velocidad())}.`)
    })
  }
  /** «Hasta t = 2 s: 45 %» mientras corre un avance; el último paso del motor en pausa. */
  const textoAvance = (): string | null => {
    const a = avance()
    if (a?.tipo === 'hasta' && a.meta !== null) {
      const t = lectura()?.t ?? a.desde
      const pct = Math.max(0, Math.min(100, Math.round(((t - a.desde) / Math.max(1e-30, a.meta - a.desde)) * 100)))
      return `Hasta t = ${formatearTiempo(a.meta, velocidad())}: ${pct} %`
    }
    return fase() === 'pausada' ? ultimoPaso() : null
  }
  /** El icono de sonido de la barra: solo si el circuito tiene un zumbador, un relé o un multímetro. */
  const haySonoros = createMemo(() => {
    void doc()
    return Object.values(editor.doc.piezas).some((p) => {
      const t = editor.lib.get(p.tipo)?.modelo?.tipo
      return t === 'zumbador' || t === 'rele' || t === 'multimetro'
    })
  })
  /** Lo que hace cada orden de la cinta y del buscador; las del clic derecho que coinciden (`EN_MENUS`) usan estas mismas. */
  const acciones: Acciones = {
    guardar: () => void control.guardar(),
    nuevo: () => void control.nuevo(),
    abrir: () => void control.abrir(),
    'guardar-como': () => void control.guardarComo(),
    recientes: (a) => anclarMenu(a, menuRecientes(ajustes().archivosRecientes)),
    exportar: () => abrirExportar(formatoEsquema()),
    'guardar-plantilla': () => abrirGuardarPlantilla(),
    deshacer: () => editor.deshacer(),
    rehacer: () => editor.rehacer(),
    cortar: () => editor.cortar(),
    copiar: () => editor.copiar(),
    pegar: () => editor.pegar(),
    duplicar: () => editor.duplicar(),
    borrar: () => editor.borrar(),
    todo: () => editor.seleccionarTodo(),
    'girar-izq': () => editor.transformar('girarIzq'),
    girar: () => editor.transformar('girar'),
    'espejo-x': () => editor.transformar('espejoX'),
    'espejo-y': () => editor.transformar('espejoY'),
    'restablecer-textos': () => editor.restablecerTextos(),
    pieza: () => {
      if (lienzo) abrirBuscador(centroDeVista())
    },
    figura: (a) => anclarMenu(a, menuFigura()),
    instrumentos: (a) => anclarMenu(a, menuDeCinta('instrumentos')),
    analizar: (a) => anclarMenu(a, menuDeCinta('analizar')),
    'figura-linea': () => editor.empezarFigura(FIGURA_DE_COMANDO['figura-linea']),
    'figura-rectangulo': () => editor.empezarFigura(FIGURA_DE_COMANDO['figura-rectangulo']),
    'figura-elipse': () => editor.empezarFigura(FIGURA_DE_COMANDO['figura-elipse']),
    'figura-flecha': () => editor.empezarFigura(FIGURA_DE_COMANDO['figura-flecha']),
    etiqueta: () => editor.colocarEtiqueta(),
    tierra: () => editor.colocarTierra(),
    alimentacion: () => tomar('alimentacion'),
    nota: () => editor.colocarNota(),
    simular: () => simularOPausar(),
    detener: () => sim.detener(),
    voltajes: () => alternarVoltajes(),
    // El botón con menú elige qué avanza cada vez; las dos flechas avanzan (F6) o regresan al avance anterior (Shift+F6).
    'avanzar-tiempo': (a) => anclarMenu(a, menuAvanzar(delta(), velocidad(), divisionOsc(), sim.pasoMaximo)),
    avanzar: () => avanzarAhora(),
    retroceder: () => retrocederAhora(),
    'avanzar-hasta': () => setDialogoTiempo('hasta'),
    velocidad: (a) => anclarMenu(a, menuVelocidad(velocidad())),
    'mas-lento': () => cambiarVelocidad(masLenta(velocidad())),
    'mas-rapido': () => cambiarVelocidad(masRapida(velocidad())),
    corriente: () => alternarCorriente(),
    animaciones: () => alternarAnimaciones(),
    sonido: () => alternarSonido(),
    'franja-osciloscopio': () => pestaña('osciloscopio'),
    'colocar-multimetro': () => tomar('multimetro'),
    'colocar-osciloscopio': () => tomar('osciloscopio'),
    'colocar-generador': () => tomar('generador'),
    'colocar-fuente': () => tomar('fuente-variable'),
    'franja-registro': () => pestaña('registro'),
    'analisis-op': () => abrirFicha('op'),
    'analisis-dc': () => abrirFicha('dc'),
    'analisis-ac': () => abrirFicha('ac'),
    'analisis-tran': () => abrirFicha('tran'),
    'analisis-fourier': () => abrirFicha('fourier'),
    'analisis-param': () => abrirFicha('param'),
    'analisis-ejecutar': () => void ejecutarAnalisis(),
    'analisis-cancelar': () => (almacen.corriendo ? almacen.cancelar() : descartarFicha()),
    'panel-analisis': () => elegirPanelDerecho('analisis'),
    'franja-graficas': () => pestaña('graficas'),
    encuadrar: () => (lienzo?.encuadrar(), tutorial.registrar('encuadrar')),
    'zoom-100': () => ponerZoomPct(100),
    'zoom-mas': () => ponerZoomPct(siguientePasoZoom(zoomPct(), 1, PCT_MIN, PCT_MAX)),
    'zoom-menos': () => ponerZoomPct(siguientePasoZoom(zoomPct(), -1, PCT_MIN, PCT_MAX)),
    'panel-libreria': () => elegirPanel('libreria'),
    'panel-plantillas': () => elegirPanel('plantillas'),
    'panel-proyecto': () => elegirPanelDerecho('proyecto'),
    'panel-mediciones': () => elegirPanelDerecho('mediciones'),
    'panel-calculadoras': () => elegirPanel('calculadoras'),
    'panel-inspector': () => elegirPanelDerecho('inspector'),
    'panel-instrumentos': alternarFranja,
    limpio: () => alternarLimpio(),
    grabar: accionGrabar,
    'detener-grabacion': () => void grabacion.detener(),
    tema: () => cambiarAjustes({ tema: ajustes().tema === 'oscuro' ? 'claro' : 'oscuro' }),
    'pantalla-completa': () => apiVentana()?.('pantalla-completa'),
    'pagina-mas': () => apiVentana()?.(ORDEN_DE_PAGINA['pagina-mas']),
    'pagina-menos': () => apiVentana()?.(ORDEN_DE_PAGINA['pagina-menos']),
    'pagina-real': () => apiVentana()?.(ORDEN_DE_PAGINA['pagina-real']),
    atajos: () => setDialogo('atajos'),
    configuracion: () => abrirConfiguracion(),
    'plegar-cinta': () => plegarCinta(),
    aprender: () => setDialogo('tutorial'),
    ejemplos: () => {
      cambiarAjustes({ panel: 'plantillas', lateral: true })
      anunciar('Los ejemplos son las plantillas incluidas: están al final del panel Plantillas, en la categoría «Incluidas».')
    },
    acerca: () => setDialogo('acerca'),
    'enfocar-tutorial': () => enfocarTutorial()
  }
  /** El foco al botón principal del globo del tutorial (o un aviso si no hay uno a la vista). */
  const enfocarTutorial = () => {
    const b = document.querySelector<HTMLElement>('.tutorial-globo .tutorial-accion')
    if (b) b.focus()
    else anunciar('No hay un tutorial en marcha. Aprende Kirchi está en la pestaña Ayuda.')
  }
  const ctxTutorial = (): CtxTutorial => {
    // La cámara entra al cálculo: las zonas del mundo se mueven con el zoom y el desplazamiento.
    void cam()
    const e = estado()
    const f = fase()
    return {
      doc: e.doc,
      con: e.con,
      lib: editor.lib,
      fase: f,
      franja: instrumentos().abierta ? instrumentos().pestaña : null,
      derecho: ajustes().inspector ? ajustes().panelDerecho : null,
      seleccion: seleccion().piezas,
      cursores: cursores() !== null,
      limpio: limpio(),
      dialogo: dialogo(),
      get centro() {
        return lienzo ? centroDeVista() : { x: 0, y: 0 }
      }
    }
  }
  // Los paneles arrancan plegados: el paso que señala la librería, el inspector o una pestaña de la franja lo abre al empezar.
  createEffect(
    on(
      () => {
        const e = tutorial.estado()
        return e ? `${e.capitulo.id}/${e.paso}` : null
      },
      () => {
        const e = tutorial.estado()
        const ap = e ? aperturaDelPaso(e.capitulo.pasos[e.paso]) : null
        if (!ap) return
        untrack(() => {
          const a = ajustes()
          const parche = Object.fromEntries(Object.entries(ap.parche).filter(([k, v]) => a[k as keyof Ajustes] !== v)) as Partial<Ajustes>
          if (Object.keys(parche).length > 0) cambiarAjustes(parche)
          const i = instrumentos()
          if (ap.franja && !(i.abierta && i.pestaña === ap.franja)) pestaña(ap.franja)
        })
      }
    )
  )
  // La sombra y los cables punteados del paso en curso, dibujados en la capa de superposición del lienzo.
  let guiaTutorial: GuiaTutorial | null = null
  let claveGuia = 'null'
  createEffect(() => {
    const e = tutorial.estado()
    const g = e && !dialogo() && !pregunta() ? (e.capitulo.pasos[e.paso].guia?.(ctxTutorial()) ?? null) : null
    const vacia = !g || (g.piezas.length === 0 && g.cables.length === 0)
    const clave = vacia ? 'null' : JSON.stringify(g)
    if (clave === claveGuia) return
    claveGuia = clave
    guiaTutorial = vacia ? null : g
    lienzo?.invalidarSuperposicion()
  })
  const areaDelLienzo = () => {
    const r = lienzo?.gl.getBoundingClientRect()
    return r ? { x: r.left, y: r.top, w: r.width, h: r.height } : null
  }
  const [reanudando, setReanudando] = createSignal<{ id: string; pendiente: number } | null>(null)
  const empezarCapitulo = async (id: string, desde: number) => {
    const cap = capituloPorId(id)
    if (!cap || cap.pasos.length === 0) return
    setDialogo(null)
    // Retomar a medias: si el circuito del lienzo no cumple lo que el capítulo espera antes de ese paso, se pregunta con cuál seguir.
    if (desde > 0) {
      const r = reanudar(cap, ctxTutorial(), desde)
      if (r.tipo === 'distinto') {
        setReanudando({ id, pendiente: r.paso })
        setDialogo('reanudar')
        return
      }
    }
    // El capítulo 1 trabaja en un circuito nuevo: si el actual tiene cambios, Nuevo pregunta antes (y si se cancela, no empieza).
    if (cap.documentoNuevo && desde === 0) {
      // La vista previa se detiene solo después de la pregunta de cambios sin guardar: si se cancela, sigue corriendo.
      await control.nuevo()
      if (Object.keys(editor.doc.piezas).length > 0) {
        anunciar('El capítulo empieza en un circuito nuevo: no se abrió ninguno, así que el tutorial no arrancó.')
        return
      }
      if (fase() !== 'detenida') sim.detener()
    }
    // Los capítulos 2 a 5 empiezan con el circuito que deja el anterior (Continuar no toca lo que hay en el lienzo).
    const arranque = cap.arranque && desde === 0 ? arranqueDeCapitulo(cap.id) : undefined
    if (arranque) {
      if (!(await control.abrirEmpaquetado(structuredClone(arranque)))) {
        anunciar('El capítulo empieza con su propio circuito: no se reemplazó el actual, así que el tutorial no arrancó.')
        return
      }
      if (fase() !== 'detenida') sim.detener()
    }
    tutorial.iniciar(cap, desde)
    lienzo?.enfocar()
  }
  /** La oferta del primer arranque: una sola vez, sobre un circuito vacío y sin nada más abierto. */
  let esperaOferta: ReturnType<typeof setTimeout> | undefined
  const ofrecerTutorial = () => {
    if (modoPruebas() || !api || ajustes().tutorial.ofertaVista) return
    esperaOferta = setTimeout(() => {
      const vacio = Object.keys(editor.doc.piezas).length === 0 && archivo().ruta === null
      if (vacio && !dialogo() && !pregunta() && !menu() && !tutorial.estado()) setDialogo('oferta')
    }, 700)
  }
  const cerrarOferta = (noVolver: boolean, despues?: () => void) => {
    setDialogo(null)
    if (noVolver || despues) cambiarAjustes({ tutorial: { ...ajustes().tutorial, ofertaVista: true } })
    despues?.()
  }
  const ejecutarComando = crearEjecutor({
    acciones,
    // El de este instante, con el portapapeles leído de nuevo.
    estado: () => ({ ...untrack(estadoCinta), puedePegar: editor.puedePegar }),
    tecla: teclaDe,
    avisar: anunciar
  })
  const cintaActual = () => ajustes().cinta
  const plegarCinta = () => {
    cambiarAjustes({ cinta: { ...cintaActual(), plegada: !cintaActual().plegada } })
    // Si el control enfocado se fue con la cinta, el foco vuelve al lienzo.
    queueMicrotask(() => {
      if (!document.activeElement || document.activeElement === document.body) lienzo?.enfocar()
    })
  }
  const elegirPestañaCinta = (p: PestañaCinta) => {
    if (cintaActual().pestaña === p) return
    setAjustes((a) => aplicarParche(a, { cinta: { ...a.cinta, pestaña: p } }))
    demoraPestaña.pedir(() => cambiarAjustes({ cinta: { ...cintaActual() } }))
  }
  let campoBuscador: HTMLInputElement | undefined

  return (
    <div class="marco" classList={{ limpio: limpio() }} data-fase={fase()}>
      <Show when={!limpio()}>
        <BarraSuperior
          estado={estadoCinta()}
          tecla={teclaDe}
          teclas={(id) => (versionAtajos(), atajos.teclasDe(id))}
          nombreDe={(id) => (versionAtajos(), atajos.nombreDe(id))}
          archivo={archivo().nombre}
          sinGuardar={estado().sinGuardar}
          soloLectura={archivo().soloLectura}
          pestaña={ajustes().cinta.pestaña}
          plegada={ajustes().cinta.plegada}
          onPestaña={elegirPestañaCinta}
          onPlegar={plegarCinta}
          menuAbierto={(((menu()?.volverA ?? opcionesGrabar()?.volverA)?.dataset.menuDe ?? (menu()?.volverA ?? opcionesGrabar()?.volverA)?.dataset.comando) as IdComando | undefined) ?? null}
          onEjecutar={ejecutarComando}
          onSalir={() => lienzo?.enfocar()}
          zoom={{ pct: zoomPct(), onZoom: ponerZoomPct, onAviso: (t) => registrar(t) }}
          refBuscador={(el) => (campoBuscador = el)}
          plantillas={itemsPlantillas()}
          onPlantilla={tomarPlantilla}
          onCalculadora={abrirCalculadora}
        />
      </Show>
      <div class="medio">
        <Show when={!limpio()}>
          <Riel panel={ajustes().panel} abierto={ajustes().lateral} onElegir={elegirPanel} />
          <Show when={ajustes().lateral}>
            <PanelLateral
              titulo={NOMBRE_PANEL[ajustes().panel]}
              clase={ajustes().panel === 'calculadoras' ? 'calculadoras' : ajustes().panel === 'plantillas' ? 'plantillas' : undefined}
              resumen={
                ajustes().panel === 'libreria'
                  ? plural(editor.lib.size, 'pieza', 'piezas')
                  : ajustes().panel === 'plantillas'
                    ? plural(itemsPlantillas().length, 'plantilla', 'plantillas')
                    : undefined
              }
              onPlegar={() => {
                cambiarAjustes({ lateral: false })
                // El botón de plegar desaparece: el foco pasa al icono del riel de este panel.
                queueMicrotask(() => document.querySelector<HTMLElement>(`.riel-boton[data-panel="${ajustes().panel}"]`)?.focus())
              }}
            >
              <Switch>
                <Match when={ajustes().panel === 'libreria'}>
                  <PanelLibreria
                    lib={editor.lib}
                    onTomar={tomar}
                    onArrastrar={arrastrarPieza}
                    plantillas={apiPl ? { total: itemsPlantillas().length, onVer: () => cambiarAjustes({ panel: 'plantillas', lateral: true }) } : undefined}
                  />
                </Match>
                <Match when={ajustes().panel === 'plantillas'}>
                  <PanelPlantillas
                    items={itemsPlantillas()}
                    categoriasVacias={propias().categorias}
                    plegadas={ajustes().plantillasPlegadas}
                    onPlegar={(plantillasPlegadas) => cambiarAjustes({ plantillasPlegadas })}
                    aviso={avisoPlantillas()}
                    puedeGuardar={tamañoSeleccion(seleccion()) > 0 && !(seleccion().sondas.size > 0 && seleccion().sondas.size === tamañoSeleccion(seleccion()))}
                    onGuardarSeleccion={abrirGuardarPlantilla}
                    onTomar={tomarPlantilla}
                    onArrastrar={arrastrarPlantilla}
                    onMenu={abrirMenuPlantilla}
                    onMenuCategoria={abrirMenuCategoria}
                    onBorrarCategoria={(nombre) => void pedirBorrarCategoria(nombre)}
                    onAccion={(a, item) => accionPlantilla(a === 'renombrar' ? 'plantilla:renombrar' : 'plantilla:borrar', item)}
                    onMostrarCarpeta={mostrarCarpetaPlantillas}
                  />
                </Match>
                <Match when={ajustes().panel === 'calculadoras'}>
                  <PanelCalculadoras lib={editor.lib} onGenerar={generarDeCalculadora} motivoBloqueo={motivoSinEditar()} />
                </Match>
              </Switch>
            </PanelLateral>
          </Show>
        </Show>
        <main class="area">
          <div class="lienzo" ref={contenedor} />
          <Show when={sinWebgl()}>
            <p class="sin-webgl" role="alert">
              Este equipo no tiene WebGL2; Kirchi necesita una tarjeta de video compatible.
            </p>
          </Show>
          <AvisoLienzo texto={avisoLienzo()} onCerrar={() => setAvisoLienzo(null)} />
          <Minimapa doc={doc()} cam={cam()} vista={vista()} paleta={paleta()} cajaPieza={cajaDeMinimapa} onSaltar={(p) => lienzo?.centrarEn(p)} />
          <Show when={limpio()}>
            <BarraLimpia archivo={archivo().nombre} zoomPct={zoomPct()} onZoom={ponerZoomPct} onAviso={(t) => registrar(t)} onAnuncio={anunciar} onPaneles={() => alternarLimpio(false)} simulacion={controlesSim()} />
          </Show>
        </main>
        <Show when={!limpio()}>
          <Show when={ajustes().inspector}>
            <Switch>
              <Match when={ajustes().panelDerecho === 'inspector'}>
            <Inspector
              vista={inspector()}
              defDe={(id) => editor.lib.get(id)}
              onCambiarProp={(id, prop, texto) => editor.cambiarPropiedad(id, prop, texto)}
              onCambiarReferencia={(id, texto) => editor.cambiarReferencia(id, texto)}
              fichaGenerador={(id) => {
                const r = () => ajustesGenerador(doc().piezas[id], editor.lib.get(doc().piezas[id]?.tipo ?? '')!)
                return <PanelGenerador refGen={doc().piezas[id]?.ref ?? ''} ajustes={valido(r())} errorAjustes={errorDe(r())} onAjuste={(prop, t) => ajustarInstrumento(id, prop, t)} onAjustes={(c) => editor.cambiarAjustesInstrumento(id, c)} sinTono />
              }}
              fichaFuente={(id) => {
                const r = () => ajustesFuente(doc().piezas[id], editor.lib.get(doc().piezas[id]?.tipo ?? '')!)
                return (
                  <PanelFuente
                    refPs={doc().piezas[id]?.ref ?? ''}
                    ajustes={valido(r())}
                    errorAjustes={errorDe(r())}
                    // El promedio de 100 ms: la corriente de la fuente oscila paso a paso (ver la prueba de la medición).
                    medicion={(() => {
                      const l = lectura()
                      return l ? (paraTexto(l).piezas.get(id) ?? null) : null
                    })()}
                    onAjuste={(prop, t) => ajustarInstrumento(id, prop, t)}
                    sinTono
                  />
                )
              }}
              onOrientar={(o) => editor.transformar(o)}
              onTransformar={(op) => editor.transformar(op)}
              onDuplicar={() => editor.duplicar()}
              onSeleccionarRed={(id) => {
                const c = editor.doc.cables[id]
                if (c?.puntos[0]) editor.seleccionarRed({ tipo: 'cable', id, en: c.puntos[0] })
              }}
              onBorrar={() => editor.borrar()}
              onAviso={(a) => seleccionarPiezas(a.piezas)}
              onVerAvisos={verAvisos}
              avisosAbiertos={avisosAbiertos()}
              onFormato={formatear}
              onPreviaTexto={(tipo, id, c) => editor.previsualizarTexto(tipo, id, c)}
              onAplicarTexto={(tipo, id, c) => editor.aplicarTexto(tipo, id, c)}
              onFigura={(c) => editor.cambiarFigura(c)}
              onMedidaFigura={(m, t) => editor.cambiarMedidaFigura(m, t)}
              onAlFondo={() => editor.figurasAlFondo()}
              onVerRedes={verRedes}
              onElegirSonda={(id) => editor.seleccionar(seleccionDe('sondas', id))}
              onInvertirSentido={(id) => editor.invertirSentido(id)}
              onCambiarMedidor={(id, c) => editor.cambiarMedidor(id, c)}
              onConvertirMedidor={convertirMedidor}
              onRedDeSonda={(id) => {
                const so = editor.doc.sondas?.[id]
                if (so) editor.seleccionarRed({ tipo: 'sonda', id, en: { x: so.x, y: so.y } })
              }}
              atajo={teclaDe}
              fichaMultimetro={fichaMultimetro}
              onVerMediciones={verMediciones}
              carga={cargaSel()}
              simulando={fase() !== 'detenida'}
              accion={accionSim()}
              pot={potSel()}
              onPot={cambiarPot}
              onConmutar={() => {
                const a = accionable()
                if (!a) return
                accionarPieza(a.id, 'boton')
                // El botón «Reponer el fusible» desaparece al reponerlo: el foco pasa al cuerpo del inspector, no a la nada.
                if (a.tipo === 'reponer') queueMicrotask(() => document.querySelector<HTMLElement>('.inspector .panel-cuerpo')?.focus())
              }}
              enclavado={!!accionSim() && enclavados().has(accionSim()!.id)}
              onEnclavar={() => {
                const a = accionable()
                if (a) alternarEnclavado(a.id)
              }}
              onPlegar={() => plegarDerecho('inspector')}
            />
              </Match>
              <Match when={ajustes().panelDerecho === 'mediciones'}>
                <PanelLateral lado="der" titulo={NOMBRE_PANEL_DERECHO.mediciones} onPlegar={() => plegarDerecho('mediciones')}>
                  <PanelMediciones
                    doc={doc()}
                    nombres={nombres()}
                    lectura={lectura() && paraTexto(lectura()!)}
                    seleccion={seleccion()}
                    teclaSimular={teclaDe('simular')}
                    multimetros={filasMultimetros()}
                    onPieza={(id) => seleccionarPiezas([id])}
                    onRed={seleccionarRed}
                    lib={editor.lib}
                    fase={fase()}
                    escala={sim.escala}
                    paleta={paleta()}
                    onSimular={(b) => void ejecutarComando('simular', b)}
                  />
                </PanelLateral>
              </Match>
              <Match when={ajustes().panelDerecho === 'analisis'}>
                <PanelLateral lado="der" clase="panel-analisis" titulo={NOMBRE_PANEL_DERECHO.analisis} onPlegar={() => plegarDerecho('analisis')}>
                  {panelFicha()}
                </PanelLateral>
              </Match>
              <Match when={ajustes().panelDerecho === 'proyecto'}>
                <PanelLateral lado="der" titulo={NOMBRE_PANEL_DERECHO.proyecto} resumen={`${plural(numPiezas(), 'pieza', 'piezas')} · ${plural(numRedes(), 'red', 'redes')}`} onPlegar={() => plegarDerecho('proyecto')}>
                  <PanelProyecto
                    doc={doc()}
                    con={con()}
                    lib={editor.lib}
                    nombres={nombres()}
                    seleccion={seleccion()}
                    excedidas={excedidasSim()}
                    alCanvas={() => lienzo?.enfocar()}
                    onPieza={(id) => seleccionarPiezas([id])}
                    onRed={seleccionarRed}
                    onRiel={(nombre, texto) => editor.cambiarRiel(nombre, texto)}
                    archivo={{ nombre: archivo().nombre, sinGuardar: estado().sinGuardar, soloLectura: archivo().soloLectura }}
                    plegado={ajustes().proyectoPlegado}
                    onPlegado={(proyectoPlegado) => cambiarAjustes({ proyectoPlegado })}
                  />
                </PanelLateral>
              </Match>
            </Switch>
          </Show>
          <RielDerecho panel={ajustes().panelDerecho} abierto={ajustes().inspector} onElegir={elegirPanelDerecho} />
        </Show>
      </div>
      <Show when={!limpio()}>
        <Instrumentos
          abierta={instrumentos().abierta}
          pestaña={instrumentos().pestaña}
          registro={registro()}
          onPestaña={pestaña}
          onAlternar={() => setInstrumentos((i) => ({ ...i, abierta: !i.abierta }))}
          onCopiarRegistro={() => void copiarRegistro()}
          onBorrarRegistro={borrarRegistro}
          alto={altoFranja()}
          altoVentana={altoVentana()}
          onAlto={cambiarAltoFranja}
          osciloscopio={panelOsciloscopio}
          graficas={panelGraficas}
        />
        <BarraEstado
          onPasoZoom={DECISIONES.zoomEn === 'vista' ? undefined : (d, b) => void ejecutarComando(d > 0 ? 'zoom-mas' : 'zoom-menos', b)}
          topeZoom={estadoCinta().topeZoom}
          fase={fase()}
          tiempo={fase() === 'detenida' ? null : { t: lectura()?.t ?? 0, velocidad: velocidad(), rapidez: lectura()?.rapidez, avance: textoAvance() }}
          onVelocidad={(b) => anclarMenu(b, menuVelocidad(velocidad()))}
          grabando={enCurso() ? { pausada: grabador.estado() === 'pausada', reloj: textoReloj(segundosGrabados()), onPausar: grabacion.alternarPausa, onDetener: () => void grabacion.detener() } : null}
          sonido={haySonoros() ? { activo: ajustes().simulacion.sonido, bloqueado: sonidoBloqueado(), onClic: alternarSonido } : null}
          zoom={zoom()} piezas={numPiezas()} redes={numRedes()} figuras={numFiguras()} tiempoReal={tiempoReal()} lento={ritmoLento()} pista={fase() === 'detenida' ? pistaDeEstado(estado(), teclaDe) : pistaDeSimulacion(fase(), lectura(), { tecla: teclaDe('voltajes'), visibles: voltajes() })} />

      </Show>
      <Show when={globo()}>{(g) => <Globo texto={g().texto} lineas={g().lineas} x={g().x} y={g().y} />}</Show>
      <Show when={barraFormato()}>{(b) => <BarraFormato vista={b().vista} caja={b().caja} area={b().area} onOrden={formatear} teclas={teclaDe} onSalir={() => lienzo?.enfocar()} />}</Show>
      <Show when={buscador()}>
        {(b) => (
          <Buscador
            lib={editor.lib}
            recientes={ajustes().recientes}
            x={b().x}
            y={b().y}
            onElegir={(id, v) => elegir(b().en, id, v)}
            plantillas={itemsPlantillas()}
            onElegirPlantilla={(i) => colocarPlantilla(i, b().en)}
            onCerrar={() => {
              setBuscador(null)
              lienzo?.enfocar()
            }}
          />
        )}
      </Show>
      {/* keyed: cada pedido monta su editor, con sus campos y su foco. */}
      <Show when={pedido()} keyed>
        {(q) => (
          <EditorEnLinea
            pedido={q}
            x={enPantalla(q.en).x}
            y={enPantalla(q.en).y}
            onCerrar={() => {
              setPedido(null)
              lienzo?.enfocar()
            }}
          />
        )}
      </Show>
      {/* keyed: cada menú nuevo monta un Menu nuevo, con su posición, su ítem activo y su foco. */}
      <Show when={opcionesGrabar()} keyed>
        {(o) => (
          <PopoverGrabacion
            x={o.x}
            y={o.y}
            opciones={ajustes().grabacion}
            onCambiar={(p) => cambiarAjustes({ grabacion: { ...ajustes().grabacion, ...p } })}
            onEmpezar={empezarDesdeOpciones}
            onCerrar={(foco) => {
              setOpcionesGrabar(null)
              if (foco) o.volverA.focus()
            }}
          />
        )}
      </Show>
      <Show when={grabacion.aviso()} keyed>
        {(a) => <AvisoGrabacionLienzo aviso={a} onAbrirCarpeta={() => void grabacion.abrirCarpeta()} onCambiarNombre={() => void grabacion.cambiarNombre()} onCerrar={grabacion.cerrarAviso} />}
      </Show>
      <Show when={menu()} keyed>
        {(m) => (
          <Menu
            modelo={m.modelo}
            x={m.x}
            y={m.y}
            hueco={m.hueco}
            onElegir={(id) => {
              setMenu(null)
              lienzo?.enfocar()
              if (m.categoria) accionCategoria(id, m.categoria)
              else if (m.plantilla) accionPlantilla(id, m.plantilla)
              else accionMenu(id, m.objetivo)
            }}
            onCerrar={(teclado) => {
              setMenu(null)
              if (teclado) m.volverA ? m.volverA.focus() : lienzo?.enfocar()
              // Cerrado con el puntero, al cambiar el tamaño o al perder el foco: si el foco quedó en el aire vuelve al lienzo.
              else setTimeout(() => (!document.activeElement || document.activeElement === document.body) && lienzo?.enfocar(), 0)
            }}
          />
        )}
      </Show>
      <p class="solo-lectores" aria-live="polite">
        {anuncio()}
      </p>
      <Show when={dialogoTiempo()} keyed>
        {(modo) => (
          <DialogoTiempo
            modo={modo}
            t={lectura()?.t ?? 0}
            velocidad={velocidad()}
            inicial={modo === 'delta' ? (typeof delta() === 'number' ? (delta() as number) : null) : null}
            onAceptar={(s, reiniciar) => {
              if (modo === 'delta') {
                setDelta(s)
                anunciar(`Avanzar: ${textoDelta(s, velocidad(), divisionOsc())}.`)
                return
              }
              return avanzarHastaT(s, reiniciar)
            }}
            onCerrar={() => {
              setDialogoTiempo(null)
              lienzo?.enfocar()
            }}
          />
        )}
      </Show>
      <Show when={dialogo() === 'configuracion'}>
        <Configuracion
          ajustes={ajustes()}
          onCambiar={cambiarAjustes}
          onCerrar={() => (setConfigEnAtajos(false), setDialogo(null))}
          seccion={configEnAtajos() ? 'atajos' : undefined}
          onRespaldos={api ? () => void api.abrirRespaldos() : undefined}
          atajos={atajos}
          versionAtajos={versionAtajos}
          onAtajos={() => cambiarAjustes({ atajos: atajos.propiasActuales() })}
          grabacion={window.kirchi?.grabacion}
        />
      </Show>
      <Show when={graficaExp()} keyed>
        {(e) => (
          <DialogoGrafica
            entrada={e}
            tema={ajustes().tema}
            opciones={ajustes().figura}
            pilas={pilasFuentes()}
            onCambiar={(p) => cambiarAjustes({ figura: { ...ajustes().figura, ...p } })}
            onExportar={(x) => void exportarLaGrafica(x)}
            onCerrar={() => setGraficaExp(null)}
            ocupado={exportandoGrafica()}
          />
        )}
      </Show>
      <Show when={capturaExp()} keyed>
        {(x) => (
          <DialogoCaptura
            referencia={x.ref}
            ajustes={x.ajustes}
            pantalla={x.pantalla}
            tema={ajustes().tema}
            aspecto={aspectoDeExportar()}
            onGuardarNotas={(a) => guardarNotasOsc(x.id, a)}
            opciones={ajustes().figura}
            pilas={pilasFuentes()}
            onCambiar={(p) => cambiarAjustes({ figura: { ...ajustes().figura, ...p } })}
            onExportar={(asp) => void exportarCaptura(asp)}
            onCerrar={() => setCapturaExp(null)}
            ocupado={exportandoCaptura()}
          />
        )}
      </Show>
      <Show when={exportando()} keyed>
        {(x) => (
          <DialogoExportar
            formato={formatoEsquema()}
            onFormato={setFormatoEsquema}
            // Con «Área» la vista muestra el dibujo entero y el recuadro; el archivo, solo el área.
            vista={() => vistaPreviaExportar(formatoEsquema(), ajustes().exportar, dependenciasEsquema(alcanceExportar() === 'area' ? 'todo' : alcanceExportar(), x.docSeleccion))}
            opciones={ajustes().exportar}
            tema={ajustes().tema}
            alcance={alcanceExportar()}
            haySeleccion={x.docSeleccion !== null}
            onAlcance={setAlcanceExportar}
            area={areaExportar()}
            dibujoMm={x.dibujoMm}
            onArea={setAreaExportar}
            hayInstrumentos={x.hayInstrumentos}
            hayMedidores={x.hayMedidores}
            simulando={sim.activa && !!lectura()}
            onNotas={setNotasExportar}
            lectura={lecturaEsquema}
            notasIniciales={notasExportar()}
            magnitudInicial={magnitudExportar()}
            onMagnitud={setMagnitudExportar}
            onCambiar={(p) => cambiarAjustes({ exportar: { ...ajustes().exportar, ...p } })}
            onExportar={() => void hacerExportar(formatoEsquema(), alcanceExportar(), x.docSeleccion)}
            onCerrar={() => setExportando(null)}
          />
        )}
      </Show>
      <Show when={dialogoPl()} keyed>
        {(d) => {
          if (d.tipo === 'borrar')
            return (
              <Dialogo titulo="¿Borrar la plantilla?" clase="pregunta" onCerrar={() => setDialogoPl(null)}>
                <p>
                  Se borra <strong>{d.item.nombre}</strong> de la categoría {d.item.categoria}. No se puede deshacer.
                </p>
                <div class="dialogo-botones">
                  <button type="button" class="boton" onClick={() => setDialogoPl(null)}>
                    Cancelar
                  </button>
                  <button type="button" class="boton peligro" data-autofoco onClick={() => void borrarPlantilla(d.item)}>
                    Borrar
                  </button>
                </div>
              </Dialogo>
            )
          if (d.tipo === 'borrar-categoria')
            return (
              <Dialogo titulo="¿Borrar la categoría?" clase="pregunta" onCerrar={() => setDialogoPl(null)}>
                <p>
                  Se borra la categoría <strong>{d.nombre}</strong> y {d.total === 1 ? 'su única plantilla' : `sus ${d.total} plantillas`}. No se puede deshacer.
                </p>
                <div class="dialogo-botones">
                  <button type="button" class="boton" onClick={() => setDialogoPl(null)}>
                    Cancelar
                  </button>
                  <button type="button" class="boton peligro" data-autofoco onClick={() => void borrarCategoria(d.nombre)}>
                    Borrar
                  </button>
                </div>
              </Dialogo>
            )
          const propiasCat = propias().categorias
          if (d.tipo === 'descripcion')
            return <DialogoPlantilla modo="descripcion" titulo={`Descripción de ${d.item.nombre}`} accion="Guardar" inicial={{ nombre: d.item.nombre, categoria: d.item.categoria, descripcion: d.item.descripcion }} categorias={propiasCat} onAceptar={(v) => operarPlantilla(() => cambiarDescripcion(d.item, v.descripcion), `Se cambió la descripción de ${d.item.nombre}.`)} onCerrar={() => setDialogoPl(null)} />
          if (d.tipo === 'renombrar')
            return <DialogoPlantilla modo="renombrar" titulo="Renombrar la plantilla" accion="Renombrar" inicial={{ nombre: d.item.nombre, categoria: d.item.categoria, descripcion: '' }} categorias={propiasCat} onAceptar={(v) => operarPlantilla(() => apiPl!.renombrar(d.item.categoria, d.item.nombre, v.nombre), `Se renombró a ${v.nombre}.`)} onCerrar={() => setDialogoPl(null)} />
          if ('item' in d)
            return <DialogoPlantilla modo="mover" titulo="Cambiar de categoría" accion="Mover" inicial={{ nombre: d.item.nombre, categoria: d.item.categoria, descripcion: '' }} categorias={propiasCat} onAceptar={(v) => operarPlantilla(() => apiPl!.mover(d.item.categoria, d.item.nombre, v.categoria), `${d.item.nombre} pasó a ${v.categoria}.`)} onCerrar={() => setDialogoPl(null)} />
          return (
            <DialogoPlantilla
              modo="guardar"
              titulo={d.tipo === 'copiar' ? 'Copiar a mis plantillas' : 'Guardar como plantilla'}
              accion="Guardar"
              inicial={d.inicial}
              categorias={propiasCat}
              vista={d.vista}
              resumen={d.resumen}
              onAceptar={(v, r) => guardarPlantilla(d.fragmento, v, r)}
              onCerrar={() => setDialogoPl(null)}
            />
          )
        }}
      </Show>
      <Show when={pregunta()} keyed>
        {(p) =>
          p.tipo === 'guardar' ? (
            <DialogoGuardar nombre={p.nombre} onResponder={responder(p.responder)} />
          ) : (
            <DialogoRecuperar recuperable={p.recuperable} onResponder={responder(p.responder)} />
          )
        }
      </Show>
      <Show when={dialogo() === 'tutorial'}>
        <SelectorTutorial avance={ajustes().tutorial.avance} onElegir={(id, desde) => void empezarCapitulo(id, desde)} onCerrar={() => setDialogo(null)} />
      </Show>
      <Show when={dialogo() === 'reanudar' ? reanudando() : null} keyed>
        {(r) => {
          const cap = capituloPorId(r.id)!
          return (
            <ReanudarTutorial
              numero={cap.numero}
              titulo={cap.titulo}
              paso={r.pendiente + 1}
              onCerrar={() => (setDialogo(null), lienzo?.enfocar())}
              onElegir={(e) => {
                const { cargarArranque, paso } = aplicarEleccion(e, r.pendiente)
                if (cargarArranque) void empezarCapitulo(r.id, 0)
                else {
                  setDialogo(null)
                  tutorial.iniciar(cap, paso)
                  lienzo?.enfocar()
                }
              }}
            />
          )
        }}
      </Show>
      <Show when={dialogo() === 'acerca'}>
        <AcercaDe onCerrar={() => (setDialogo(null), lienzo?.enfocar())} />
      </Show>
      <Show when={dialogo() === 'oferta'}>
        <OfertaTutorial
          onEmpezar={(n) => cerrarOferta(n, () => void empezarCapitulo('primer-circuito', 0))}
          onVerTodos={(n) => cerrarOferta(n, () => setDialogo('tutorial'))}
          onAhoraNo={(n) => cerrarOferta(n)}
        />
      </Show>
      <Tutorial
        control={tutorial}
        ctx={ctxTutorial}
        aPantalla={(p) => (lienzo ? lienzo.aPantalla(p) : null)}
        areaLienzo={areaDelLienzo}
        encuadrar={(caja) => lienzo?.encuadrarCaja(caja)}
        teclaDe={teclaDe}
        nombreDe={(id) => (versionAtajos(), atajos.nombreDe(id) ?? id)}
        anunciar={anunciar}
        movimientoReducido={movimientoReducido}
        avanzarSolo={ajustes().tutorial.avanzarSolo}
        oculto={!!dialogo() || !!pregunta() || !!exportando() || !!capturaExp()}
        onSalir={() => (tutorial.salir(), lienzo?.enfocar())}
        alAccion={() => lienzo?.enfocar()}
      />
      <Show when={dialogo() === 'atajos'}>
        <HojaAtajos
          mapa={mapaDeAtajos(atajos, lugarDeTecla)}
          onCerrar={() => setDialogo(null)}
          onCambiar={() => {
            // Primero se cierra la hoja (el foco vuelve a donde estaba) y luego se abre Configuración: así, al cerrarla, el
            // foco regresa al lienzo y no a un botón que ya no existe.
            setDialogo(null)
            queueMicrotask(() => {
              setConfigEnAtajos(true)
              setDialogo('configuracion')
            })
          }}
        />
      </Show>
    </div>
  )
}

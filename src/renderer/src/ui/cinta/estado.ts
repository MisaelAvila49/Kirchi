import type { PanelDerecho, PanelLateral, Tema } from '../../../../compartido/ajustes'
import { TAMAÑOS_INTERFAZ } from '../../../../compartido/ventana'
import type { FaseSim } from '../../sim/control'
import type { Pestaña } from '../Instrumentos'
import { PISTA_SIN_RECIENTES, PISTA_SOLO_LECTURA, PISTA_VACIO, razonSinPegar } from '../menus'
import { NOMBRE_TEMA, nombreBotonTema } from '../tema'
import { MENSAJE_DETENER_PARA_EDITAR } from '../vistaPrevia'
import { COMANDOS, type IdComando } from './comandos'
import { masLenta, masRapida, textoVelocidad, VELOCIDADES } from '../tiempo/velocidades'
import { DECISIONES } from './decisiones'
import type { TipoSeleccion } from './modelo'
import type { NombreIcono } from './trazos'

/** Lo que la cinta necesita saber de la ventana para dibujar cada botón (sin funciones, para compararlo campo por campo). */
export interface EstadoCinta {
  fase: FaseSim
  puedeDeshacer: boolean
  puedeRehacer: boolean
  puedePegar: boolean
  soloLectura: boolean
  /** No hay nada dibujado: no hay qué exportar. */
  vacio: boolean
  /** Cuántos archivos recientes hay. */
  recientes: number
  /** Los chips de voltaje de todas las redes están a la vista (tecla V). */
  voltajes: boolean
  tema: Tema
  panel: PanelLateral
  /** Panel lateral abierto. */
  lateral: boolean
  /** Panel derecho abierto (Inspector, Mediciones o Proyecto) y cuál muestra su riel. */
  inspector: boolean
  panelDerecho: PanelDerecho
  /** Pestaña de la franja de instrumentos, o null si está plegada. */
  franja: Pestaña | null
  /** La cinta está plegada (solo la fila de pestañas). */
  plegada: boolean
  /** Hay ventana de Electron: pantalla completa y zoom de la página funcionan. */
  ventana: boolean
  /** Cuántas cosas hay seleccionadas (piezas, cables, etiquetas y notas). */
  seleccion: number
  /** Lo seleccionado son solo sondas: se borran pero no se copian. */
  soloSondas?: boolean
  /** Cuántas de ellas son piezas: girar y reflejar solo transforman piezas. */
  piezasSeleccionadas: number
  /** Alguna pieza seleccionada tiene textos movidos a mano: habilita «Restablecer posición de los textos». */
  textosManuales?: boolean
  /** Qué hay seleccionado y cómo se llama (el título del último grupo de Inicio); `nada` y título vacío sin selección. */
  seleccionTipo?: TipoSeleccion
  seleccionTitulo?: string
  /** Hay una pieza a punto de colocarse: R, Shift+R, X e Y la orientan. */
  colocando: boolean
  /** El zoom del lienzo está en su mínimo o en su máximo (900 %). */
  topeZoom: 'minimo' | 'maximo' | null
  /** El tamaño de la interfaz vigente, en por ciento (Vista › Ventana). */
  tamañoInterfaz: number
  /** La velocidad del tiempo (infinito: «Sin límite de tiempo real»). */
  velocidad: number
  /** Lo que avanza cada avance («1 ms», «un paso de cálculo (20 µs)»), para el globo de Avanzar; sin él, el globo no lo dice. */
  avanceTexto?: string
  /** Hay un avance en curso (Avanzar hasta t, o uno largo): Retroceder espera a que termine. */
  avanzando?: boolean
  /** A cuántos avances anteriores se puede volver (Retroceder); sin el campo, a ninguno. */
  retrocesos?: number
  /** La corriente animada, las animaciones en marcha y el sonido. */
  corriente: boolean
  animaciones: boolean
  /** El sistema pide reducir el movimiento: las animaciones empezaron en pausa por eso. */
  movimientoReducido: boolean
  sonido: boolean
  /** Hay un capítulo del tutorial en curso: solo entonces la cinta muestra «Ir al tutorial». */
  tutorial?: boolean
  /** Hay un análisis de ngspice corriendo. */
  analisisCorriendo?: boolean
  /** Por qué el circuito no se puede analizar (avisos que bloquean, sin piezas); null si se puede. */
  analisisBloqueo?: string | null
  /** El tipo de la ficha de análisis elegida (`op`, `dc`, `ac`, `tran`, `fourier` o `param`); null si no hay una elegida. */
  analisisFicha?: string | null
  /** La grabación de pantalla. `no-disponible` es una ventana sin proceso principal (pruebas, navegador). */
  grabacion?: EstadoGrabacionCinta
  /** Segundos grabados (sin las pausas), para el «● 00:42» del botón. */
  grabacionSeg?: number
}

/** Estado de la grabación de pantalla para la cinta; sin el campo, hay ventana y no se graba. */
export type EstadoGrabacionCinta = 'no-disponible' | 'inactivo' | 'grabando' | 'pausada' | 'guardando'

/** Primera tecla vigente de un comando del registro de atajos (`teclaDe` de la ventana). */
export type Teclas = (id: string) => string | undefined

export const RAZON_DETENIDA = 'La vista previa está detenida.'
export const RAZON_ARRANCANDO = 'La vista previa está arrancando.'
export const RAZON_SIN_DESHACER = 'No hay nada que deshacer.'
export const RAZON_SIN_REHACER = 'No hay nada que rehacer.'
export const RAZON_SIN_VENTANA = 'Solo funciona en la ventana de Kirchi.'
export const RAZON_SIN_SELECCION = 'Selecciona algo primero.'
export const RAZON_SONDAS_NO_SE_COPIAN = 'Las sondas no se copian: ponlas con el clic derecho de un cable.'
export const RAZON_GIRAR_SIN_PIEZA = 'Selecciona una pieza para girarla.'
export const RAZON_REFLEJAR_SIN_PIEZA = 'Selecciona una pieza para reflejarla.'
export const RAZON_SIN_TEXTOS_MANUALES = 'Ninguna pieza seleccionada tiene textos movidos a mano.'
export const RAZON_TODO_VACIO = 'No hay nada que seleccionar.'
export const RAZON_ZOOM_MAXIMO = 'Ya está en el zoom máximo.'
export const RAZON_ZOOM_MINIMO = 'Ya está en el zoom mínimo.'
export const RAZON_INTERFAZ_MAXIMA = `La interfaz ya está en su tamaño máximo (${TAMAÑOS_INTERFAZ[TAMAÑOS_INTERFAZ.length - 1]} %).`
export const RAZON_INTERFAZ_MINIMA = `La interfaz ya está en su tamaño mínimo (${TAMAÑOS_INTERFAZ[0]} %).`
export const RAZON_ANALISIS_CON_VISTA_PREVIA = 'Detén la vista previa para ejecutar un análisis.'
export const RAZON_ANALISIS_EN_CURSO = 'Ya hay un análisis en curso: espera a que termine o detenlo.'
export const RAZON_ANALISIS_SIN_ELEGIR = 'Elige primero un análisis con el botón Analizar.'
export const RAZON_ANALISIS_SIN_CORRER = 'No hay ningún análisis abierto.'
export const RAZON_GRABAR_SIN_VENTANA = 'Grabar solo funciona en la ventana de Kirchi.'
export const RAZON_GRABAR_OCUPADA = 'Espera: la grabación se está preparando o guardando.'
export const RAZON_SIN_GRABACION = 'No hay ninguna grabación en curso.'
export const RAZON_RETROCEDER_DETENIDA = 'Retroceder vuelve al avance anterior: avanza primero con la vista previa en pausa.'
export const RAZON_RETROCEDER_CORRIENDO = 'Pausa la vista previa para retroceder.'
export const RAZON_RETROCEDER_AVANZANDO = 'Espera a que termine el avance para retroceder.'
export const RAZON_SIN_RETROCESO = 'No hay un avance anterior al que volver.'
export const razonVoltajes = (t: string | undefined): string => `Los voltajes se ven con la vista previa${t ? ` (${t})` : ''}.`
export const RAZON_MAS_LENTO = `Ya está en la velocidad más lenta (${textoVelocidad(VELOCIDADES[VELOCIDADES.length - 1])}).`
export const RAZON_MAS_RAPIDO = 'Ya va lo más rápido posible.'
/** Lo que dice el botón Animaciones cuando empezaron en pausa por la preferencia del sistema. */
export const ANIMACIONES_DEL_SISTEMA = 'Animaciones en pausa: el sistema pide reducir el movimiento'

/** Lo que necesita algo seleccionado. */
function razonPorSeleccion(id: IdComando, e: EstadoCinta): string | null {
  switch (id) {
    case 'cortar':
    case 'copiar':
    case 'duplicar':
    case 'guardar-plantilla':
      return e.seleccion === 0 ? RAZON_SIN_SELECCION : e.soloSondas ? RAZON_SONDAS_NO_SE_COPIAN : null
    case 'borrar':
      return e.seleccion > 0 ? null : RAZON_SIN_SELECCION
    case 'girar':
    case 'girar-izq':
      return e.piezasSeleccionadas > 0 || e.colocando ? null : RAZON_GIRAR_SIN_PIEZA
    case 'espejo-x':
    case 'espejo-y':
      return e.piezasSeleccionadas > 0 || e.colocando ? null : RAZON_REFLEJAR_SIN_PIEZA
    case 'todo':
      return e.vacio ? RAZON_TODO_VACIO : null
    case 'restablecer-textos':
      return e.textosManuales ? null : RAZON_SIN_TEXTOS_MANUALES
    default:
      return null
  }
}

/** Por qué un botón no actúa ahora, o null. Única función que lo decide: botón, buscador y ejecutor. */
export function razonDeshabilitado(id: IdComando, e: EstadoCinta, tecla: Teclas): string | null {
  const c = COMANDOS[id]
  if (c.edita && e.fase !== 'detenida') return MENSAJE_DETENER_PARA_EDITAR
  if (c.edita && e.soloLectura) return PISTA_SOLO_LECTURA
  if (DECISIONES.segunSeleccion) {
    const r = razonPorSeleccion(id, e)
    if (r) return r
  }
  switch (id) {
    case 'deshacer':
      return e.puedeDeshacer ? null : RAZON_SIN_DESHACER
    case 'rehacer':
      return e.puedeRehacer ? null : RAZON_SIN_REHACER
    case 'pegar':
      return e.puedePegar ? null : razonSinPegar(tecla('copiar'))
    case 'guardar':
    case 'guardar-como':
      return e.soloLectura ? PISTA_SOLO_LECTURA : null
    case 'exportar':
      return e.vacio ? PISTA_VACIO : null
    case 'recientes':
      return e.recientes > 0 ? null : PISTA_SIN_RECIENTES
    case 'simular':
      return e.fase === 'arrancando' ? RAZON_ARRANCANDO : null
    case 'detener':
      return e.fase === 'detenida' ? RAZON_DETENIDA : null
    case 'voltajes':
      return e.fase === 'detenida' ? razonVoltajes(tecla('simular')) : null
    case 'avanzar':
    case 'avanzar-tiempo':
    case 'avanzar-hasta':
      return e.fase === 'arrancando' ? RAZON_ARRANCANDO : null
    case 'retroceder':
      if (e.fase === 'detenida' || e.fase === 'arrancando') return RAZON_RETROCEDER_DETENIDA
      if (e.fase === 'corriendo') return RAZON_RETROCEDER_CORRIENDO
      if (e.avanzando) return RAZON_RETROCEDER_AVANZANDO
      return (e.retrocesos ?? 0) > 0 ? null : RAZON_SIN_RETROCESO
    case 'mas-lento':
      return masLenta(e.velocidad) === null ? RAZON_MAS_LENTO : null
    case 'mas-rapido':
      return masRapida(e.velocidad) === null ? RAZON_MAS_RAPIDO : null
    case 'analisis-ejecutar':
      if (e.fase !== 'detenida') return RAZON_ANALISIS_CON_VISTA_PREVIA
      if (e.analisisCorriendo) return RAZON_ANALISIS_EN_CURSO
      if (e.analisisBloqueo) return e.analisisBloqueo
      return e.analisisFicha ? null : RAZON_ANALISIS_SIN_ELEGIR
    case 'analisis-cancelar':
      return e.analisisCorriendo || e.analisisFicha ? null : RAZON_ANALISIS_SIN_CORRER
    case 'grabar':
      if (e.grabacion === 'no-disponible') return RAZON_GRABAR_SIN_VENTANA
      return e.grabacion === 'guardando' ? RAZON_GRABAR_OCUPADA : null
    case 'detener-grabacion':
      if (e.grabacion === 'no-disponible') return RAZON_GRABAR_SIN_VENTANA
      return e.grabacion === 'grabando' || e.grabacion === 'pausada' ? null : RAZON_SIN_GRABACION
    case 'pantalla-completa':
    case 'pagina-real':
      return e.ventana ? null : RAZON_SIN_VENTANA
    case 'pagina-mas':
      return !e.ventana ? RAZON_SIN_VENTANA : e.tamañoInterfaz >= TAMAÑOS_INTERFAZ[TAMAÑOS_INTERFAZ.length - 1] ? RAZON_INTERFAZ_MAXIMA : null
    case 'pagina-menos':
      return !e.ventana ? RAZON_SIN_VENTANA : e.tamañoInterfaz <= TAMAÑOS_INTERFAZ[0] ? RAZON_INTERFAZ_MINIMA : null
    case 'zoom-mas':
      return e.topeZoom === 'maximo' ? RAZON_ZOOM_MAXIMO : null
    case 'zoom-menos':
      return e.topeZoom === 'minimo' ? RAZON_ZOOM_MINIMO : null
    default:
      return null
  }
}

/** Texto del globo cuando no es el nombre del botón. undefined: el globo lleva el nombre. */
export function globoDe(id: IdComando, e: EstadoCinta): string | undefined {
  if (id === 'avanzar') return e.avanceTexto ? `Avanzar: avanza ${e.avanceTexto}` : 'Avanzar: avanza la cantidad elegida'
  if (id === 'retroceder') return 'Retroceder: regresa al avance anterior'
  if (id === 'avanzar-tiempo') return e.avanceTexto ? `Cada avance: ${e.avanceTexto}. Elige qué avanza` : 'Elige qué avanza cada avance'
  return undefined
}

/** Hay una grabación en curso (grabando o en pausa). */
export const enGrabacion = (e: EstadoCinta): boolean => e.grabacion === 'grabando' || e.grabacion === 'pausada'

/** Si el botón lleva la flecha dentro: solo los de menú. Grabar tiene la suya aparte (botón partido). */
export const conFlecha = (id: IdComando, _e?: EstadoCinta): boolean => !!COMANDOS[id].menu

/** «00:42», o «1:02:03» pasada la hora. */
export function textoReloj(seg: number): string {
  const s = Math.max(0, Math.floor(seg))
  const dos = (n: number) => String(n).padStart(2, '0')
  const h = Math.floor(s / 3600)
  return h > 0 ? `${h}:${dos(Math.floor(s / 60) % 60)}:${dos(s % 60)}` : `${dos(Math.floor(s / 60))}:${dos(s % 60)}`
}

/** `aria-pressed` de los botones de dos estados; undefined en una orden simple. */
export function marcado(id: IdComando, e: EstadoCinta): boolean | undefined {
  switch (id) {
    case 'voltajes':
      return e.fase !== 'detenida' && e.voltajes
    case 'franja-osciloscopio':
      return e.franja === 'osciloscopio'
    case 'franja-registro':
      return e.franja === 'registro'
    case 'franja-graficas':
      return e.franja === 'graficas'
    case 'analisis-op':
    case 'analisis-dc':
    case 'analisis-ac':
    case 'analisis-tran':
    case 'analisis-fourier':
    case 'analisis-param':
      return e.inspector && e.panelDerecho === 'analisis' && e.analisisFicha === id.slice('analisis-'.length)
    case 'panel-analisis':
      return e.inspector && e.panelDerecho === 'analisis'
    case 'panel-libreria':
    case 'panel-plantillas':
    case 'panel-calculadoras':
      return e.lateral && e.panel === id.slice('panel-'.length)
    case 'panel-inspector':
    case 'panel-proyecto':
    case 'panel-mediciones':
      return e.inspector && e.panelDerecho === (id === 'panel-inspector' ? 'inspector' : id.slice('panel-'.length))
    case 'panel-instrumentos':
      return e.franja !== null
    case 'tema':
      return e.tema === 'oscuro'
    case 'grabar':
      return enGrabacion(e)
    case 'corriente':
      return e.corriente
    case 'animaciones':
      return e.animaciones
    case 'sonido':
      return e.sonido
    default:
      return undefined
  }
}

/** Texto visible del botón: el de la tabla, salvo los que dicen su estado o lo que harán. */
export function textoDe(id: IdComando, e: EstadoCinta): string {
  if (id === 'simular') return e.fase === 'corriendo' ? 'Pausar' : e.fase === 'pausada' ? 'Reanudar' : e.fase === 'arrancando' ? 'Arrancando…' : 'Simular'
  if (id === 'analisis-cancelar') return e.analisisCorriendo ? 'Detener' : 'Cancelar'
  if (id === 'tema') return NOMBRE_TEMA[e.tema]
  if (id === 'plegar-cinta') return e.plegada ? 'Fijar la cinta' : 'Plegar la cinta'
  if (id === 'grabar' && enGrabacion(e)) return `● ${textoReloj(e.grabacionSeg ?? 0)}`
  if (id === 'velocidad') return `Velocidad ${textoVelocidad(e.velocidad)}`
  return COMANDOS[id].texto
}

/**
 * Nombre accesible: el texto visible, salvo el tema y los que traen `rotuloAccesible` (ambos contienen el texto visible).
 */
export const nombreAccesible = (id: IdComando, e: EstadoCinta): string =>
  id === 'grabar' && enGrabacion(e) ? `Detener la grabación, ${e.grabacion === 'pausada' ? 'en pausa, ' : ''}${textoReloj(e.grabacionSeg ?? 0)}` : id === 'tema' ? nombreBotonTema(e.tema) : id === 'animaciones' && e.movimientoReducido && !e.animaciones ? `${textoDe(id, e)} (${ANIMACIONES_DEL_SISTEMA.charAt(0).toLowerCase()}${ANIMACIONES_DEL_SISTEMA.slice(1)})` : (COMANDOS[id].rotuloAccesible ?? textoDe(id, e))

export function iconoDe(id: IdComando, e: EstadoCinta): NombreIcono {
  if (id === 'simular' && e.fase === 'corriendo') return 'pausa'
  if (id === 'tema') return e.tema === 'oscuro' ? 'luna' : 'sol'
  if (id === 'plegar-cinta') return e.plegada ? 'abajo' : 'arriba'
  if (id === 'sonido' && !e.sonido) return 'sonidoApagado'
  if (id === 'grabar' && enGrabacion(e)) return 'detener'
  return COMANDOS[id].icono
}

/** La tecla que muestra el botón: la primera vigente del registro, o la fija; undefined si no tiene. */
export function teclaVisible(id: IdComando, tecla: Teclas): string | undefined {
  const c = COMANDOS[id]
  return c.tecla ? tecla(c.tecla) : c.teclaFija
}

/** Igualdad campo por campo (todos los campos son primitivos). */
export function mismoEstadoCinta(a: EstadoCinta, b: EstadoCinta): boolean {
  for (const k of Object.keys(a) as (keyof EstadoCinta)[]) if (a[k] !== b[k]) return false
  return true
}

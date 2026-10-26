import type { FormatoFigura, OpcionesFigura, Tema } from '../../../../compartido/ajustes'
import { anotacionesVacias, type Anotaciones } from '../../../../compartido/grafica/anotaciones'
import { ASPECTO_OSCILOSCOPIO, type AspectoTraza } from '../../../../compartido/grafica/aspecto'
import { MATEMATICO, type AjustesOsciloscopio } from '../../instrumentos/ajustes'
import type { PantallaSab } from '../../sim/protocoloInstrumentos'
import type { DatoExportable } from '../exportar/campos'
import { aplicarFormatoCsv, CARACTER_SEPARADOR } from '../exportar/csvFormato'
import { tablaDeCsv } from '../exportar/csvTabla'
import EditorFigura from '../exportar/editor/EditorFigura'
import type { EstadoEditor } from '../exportar/editor/edicion'
import { ADORNOS_PREAJUSTE } from '../exportar/preajustes'
import VistaCsv from '../exportar/VistaCsv'
import type { TrazaVista } from '../grafica/AspectoPanel'
import { temaEfectivo } from '../grafica/paleta'
import { csvDeCaptura } from './exportarCaptura'
import { conCanalesApagados, figuraDeCaptura, seriesDeCaptura, tonoDeCanal, type AspectoDeCaptura, type PilasFuentes } from './figura'

interface Props {
  /** La captura que se exporta (congelada mientras el diálogo está abierto) con los ajustes que la dibujaron. */
  referencia: string
  ajustes: AjustesOsciloscopio
  pantalla: PantallaSab
  /** El tema de la aplicación: el de la gráfica (que se cambia aquí) puede ser otro. */
  tema: Tema
  opciones: OpcionesFigura
  pilas: PilasFuentes
  /** El aspecto de la pantalla y sus anotaciones guardadas: se exporta tal como se ve. */
  aspecto?: AspectoDeCaptura
  onCambiar(parche: Partial<OpcionesFigura>): void
  /** Exporta con el aspecto que quedó en el editor (lo que se cambia aquí vale solo para esta exportación). */
  onExportar(asp: AspectoDeCaptura): void
  /** Guarda las anotaciones con el aspecto de la pantalla; devuelve el motivo si no se pudo. */
  onGuardarNotas?(a: Anotaciones): string | null
  onCerrar(): void
  ocupado?: boolean
}

const FORMATOS: readonly FormatoFigura[] = ['png', 'svg', 'pdf', 'csv']
/** Cuántas filas del CSV se ven en la vista previa. */
const FILAS_VISTA_CSV = 12

/** Lo que el editor cambió de cada canal, completo (el lado y el tono por omisión cuando no cambió nada). */
const canalesCompletos = (t: EstadoEditor['trazas']): Record<string, AspectoTraza> => Object.fromEntries(Object.entries(t).map(([k, p]) => [k, { lado: 'izquierda' as const, color: null, ...p }]))

/**
 * Exportar la captura del osciloscopio. Sale de la misma captura que se ve, congelada mientras el diálogo está abierto.
 */
export default function DialogoCaptura(props: Props) {
  // El aspecto empieza como está en la pantalla; el tema de la figura (fondo, rejilla y escalas juntos) es el que se recuerda en las opciones.
  const inicial: EstadoEditor = (() => {
    const a: AspectoDeCaptura = props.aspecto ?? { aspecto: ASPECTO_OSCILOSCOPIO, canales: {} }
    return { anot: a.anotaciones ?? anotacionesVacias(), aspecto: { ...a.aspecto, tema: temaEfectivo(props.opciones.tema, props.tema) }, trazas: { ...a.canales }, ocultas: [], adornos: { ...ADORNOS_PREAJUSTE.instrumento }, rango: null }
  })()
  const asp = (e: EstadoEditor): AspectoDeCaptura => ({ aspecto: e.aspecto, canales: canalesCompletos(e.trazas), rango: e.rango, apagados: [...e.ocultas], adornos: e.adornos, anotaciones: e.anot })
  const exportados = (e: EstadoEditor) => conCanalesApagados(props.ajustes, e.ocultas)
  const csv = (e: EstadoEditor) => (props.opciones.formato === 'csv' ? aplicarFormatoCsv(csvDeCaptura(props.referencia, exportados(e), props.pantalla, e.rango), props.opciones) : '')
  const tabla = (e: EstadoEditor) => tablaDeCsv(csv(e), FILAS_VISTA_CSV, CARACTER_SEPARADOR[props.opciones.separadorCsv])
  const trazasDe = (e: EstadoEditor): TrazaVista[] =>
    seriesDeCaptura(exportados(e))
      .filter((s) => s.id !== MATEMATICO)
      .map((s) => {
        const c = e.trazas[s.id]
        return { clave: s.id, etiqueta: s.nombre, tono: c?.color ?? tonoDeCanal(props.opciones, s.id as never), lado: c?.lado ?? 'izquierda', tonoElegido: c?.color ?? null, grosor: c?.grosor ?? null, prefijo: c?.prefijo ?? null, decimales: c?.decimales, unidad: 'V' }
      })
  return (
    <EditorFigura
      titulo={`Exportar la captura de ${props.referencia}`}
      tipo="pantalla"
      inicial={inicial}
      opciones={props.opciones}
      onCambiar={props.onCambiar}
      formatos={FORMATOS}
      figura={(e) => figuraDeCaptura(props.referencia, props.ajustes, props.pantalla, props.opciones, temaEfectivo(e.aspecto.tema, props.tema), props.pilas, asp(e))}
      trazas={trazasDe}
      datos={(e): DatoExportable[] => [
        ...props.ajustes.canales.map((c) => ({ id: c.canal as string, nombre: `Canal ${c.canal}`, canal: c.canal as string, activo: !e.ocultas.includes(c.canal), sinDato: !c.on })),
        ...(props.ajustes.matematico ? [{ id: MATEMATICO as string, nombre: 'A − B', canal: MATEMATICO as string, activo: !e.ocultas.includes(MATEMATICO), sinDato: false }] : [])
      ]}
      claveDeTraza={(id) => id}
      ejeX={{ etiqueta: 'Eje del tiempo', unidad: 's' }}
      unidadTramo="s"
      vistaCsv={(e) => <VistaCsv texto={csv(e)} filas={FILAS_VISTA_CSV} separador={CARACTER_SEPARADOR[props.opciones.separadorCsv]} />}
      pieCsv={(e) => `${tabla(e).total} instantes`}
      motivoNo={(e) => {
        if (props.pantalla.ncol === 0) return 'Todavía no hay una captura que exportar.'
        if (props.opciones.formato === 'csv' && tabla(e).total <= 0) return 'La captura aún no tiene datos de todos los canales encendidos.'
        return undefined
      }}
      onExportar={(e) => props.onExportar(asp(e))}
      onGuardar={props.onGuardarNotas}
      onCerrar={props.onCerrar}
      ocupado={props.ocupado}
    />
  )
}

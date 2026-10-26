import type { FormatoFigura, OpcionesFigura, Tema } from '../../../../compartido/ajustes'
import { anotacionesVacias, type Anotaciones } from '../../../../compartido/grafica/anotaciones'
import type { AspectoTraza } from '../../../../compartido/grafica/aspecto'
import type { DatoExportable } from '../exportar/campos'
import { aplicarFormatoCsv, CARACTER_SEPARADOR } from '../exportar/csvFormato'
import EditorFigura from '../exportar/editor/EditorFigura'
import type { EstadoEditor } from '../exportar/editor/edicion'
import { ADORNOS_PREAJUSTE } from '../exportar/preajustes'
import VistaCsv from '../exportar/VistaCsv'
import type { PilasFuentes } from '../osciloscopio/figura'
import type { TrazaVista } from './AspectoPanel'
import { trazasUnicas } from './modelo'
import { csvDeGrafica, figuraDeGrafica, filasDeGrafica, modeloConTrazas, type EntradaFigura } from './figura'
import { temaEfectivo } from './paleta'

interface Props {
  entrada: EntradaFigura
  tema: Tema
  opciones: OpcionesFigura
  pilas: PilasFuentes
  onCambiar(parche: Partial<OpcionesFigura>): void
  /** Exporta con la gráfica tal como quedó en el editor (el aspecto que se cambia aquí vale solo para esta exportación). */
  onExportar(e: EntradaFigura): void
  onCerrar(): void
  ocupado?: boolean
}

const FORMATOS: readonly FormatoFigura[] = ['png', 'svg', 'pdf', 'csv']
const FILAS_VISTA_CSV = 12

const cambiosCompletos = (t: EstadoEditor['trazas']): Record<string, Partial<AspectoTraza>> => t

/**
 * Exportar una gráfica de análisis. La figura usa la misma función de dibujo que el archivo; en CSV es la tabla de las primeras filas.
 */
export default function DialogoGrafica(props: Props) {
  const m0 = props.entrada.modelo
  const lineas = m0.tipo === 'lineas'
  // El aspecto empieza como está en la gráfica; lo que lleva la figura alrededor, como «Instrumento» o «Informe» si la gráfica lo traía.
  const inicial: EstadoEditor = {
    anot: props.entrada.anotaciones ?? anotacionesVacias(),
    aspecto: { ...props.entrada.aspecto, tema: temaEfectivo(props.opciones.tema, props.tema) },
    trazas: {},
    ocultas: [...props.entrada.vista.ocultas],
    adornos: { ...ADORNOS_PREAJUSTE[props.entrada.aspecto.informe ? 'informe' : 'instrumento'] },
    rango: null
  }
  const entrada = (e: EstadoEditor): EntradaFigura => ({ ...props.entrada, adornos: e.adornos, aspecto: e.aspecto, modelo: modeloConTrazas(props.entrada.modelo, cambiosCompletos(e.trazas)), vista: { ...props.entrada.vista, ocultas: new Set(e.ocultas) }, rango: e.rango, anotaciones: e.anot })
  const csv = (e: EstadoEditor) => (props.opciones.formato === 'csv' ? aplicarFormatoCsv(csvDeGrafica(props.entrada.titulo, props.entrada.subtitulo, entrada(e).modelo, entrada(e).vista, e.rango), props.opciones) : '')
  const filas = (e: EstadoEditor) => filasDeGrafica(entrada(e).modelo, entrada(e).vista, e.rango)
  return (
    <EditorFigura
      titulo={`Exportar la gráfica de ${props.entrada.titulo}`}
      tipo="grafica"
      inicial={inicial}
      opciones={props.opciones}
      onCambiar={props.onCambiar}
      formatos={FORMATOS}
      figura={(e) => figuraDeGrafica(entrada(e), props.opciones, props.tema, props.pilas)}
      trazas={(e): TrazaVista[] => {
        const m = entrada(e).modelo
        if (m.tipo === 'barras') return []
        return trazasUnicas(m.trazas)
          .filter((t) => !e.ocultas.includes(t.clave))
          .map((t) => ({ clave: t.clave, etiqueta: t.etiqueta, tono: t.tono, lado: t.lado, tonoElegido: e.trazas[t.clave]?.color ?? null, grosor: t.grosor ?? null, prefijo: t.prefijo ?? null, decimales: t.decimales, rango: e.trazas[t.clave]?.rango ?? t.rango, unidad: t.unidad }))
      }}
      datos={(e): DatoExportable[] => (m0.tipo === 'barras' ? [] : trazasUnicas(m0.trazas).map((t) => ({ id: t.clave, nombre: t.etiqueta, tono: t.tono, activo: !e.ocultas.includes(t.clave) })))}
      claveDeTraza={(id) => {
        if (m0.tipo === 'barras' || m0.trazas.some((t) => t.clave === id)) return id
        const i = id.lastIndexOf('#')
        return i > 0 ? id.slice(0, i) : id
      }}
      ejeX={lineas ? { etiqueta: 'Eje horizontal', unidad: m0.ejeX.unidad, log: m0.ejeX.escala === 'log' } : null}
      unidadTramo={lineas ? m0.ejeX.unidad : ''}
      vistaCsv={(e) => <VistaCsv texto={csv(e)} filas={FILAS_VISTA_CSV} separador={CARACTER_SEPARADOR[props.opciones.separadorCsv]} />}
      pieCsv={(e) => `${filas(e)} ${filas(e) === 1 ? 'punto' : 'puntos'}`}
      motivoNo={(e) => (props.opciones.formato === 'csv' && filas(e) === 0 ? 'La gráfica no tiene trazas visibles que exportar.' : undefined)}
      onExportar={(e) => props.onExportar(entrada(e))}
      onGuardar={props.entrada.onGuardarNotas}
      onCerrar={props.onCerrar}
      ocupado={props.ocupado}
    />
  )
}


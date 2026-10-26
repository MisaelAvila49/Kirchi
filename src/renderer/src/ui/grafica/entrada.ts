import type { AnalisisDoc } from '../../../../compartido/analisis/config'
import type { ResultadoMapeado } from '../../../../compartido/analisis/resultados'
import { anotacionesDeDoc, type Anotaciones } from '../../../../compartido/grafica/anotaciones'
import { aspectoDeGrafica, trazasDeGrafica } from '../../../../compartido/grafica/aspecto'
import { modeloDeResultado } from '../../analisis/modeloGrafica'
import type { EntradaFigura } from './figura'
import { VISTA_COMPLETA } from './modelo'

/**
 * Entrada del diálogo de exportar para una corrida guardada, cuando el pedido viene de otra ventana (la vista llega como trazas apagadas).
 */
export function entradaDeCorrida(c: { nombre: string; analisis: AnalisisDoc; mapeado: ResultadoMapeado }, ocultas: readonly string[] = [], onGuardarNotas?: (a: Anotaciones) => string | null): EntradaFigura | null {
  const modelo = modeloDeResultado(c.mapeado, trazasDeGrafica(c.analisis.grafica), { dbAbsoluto: c.analisis.grafica?.dbAbsoluto === true, informe: c.analisis.grafica?.informe === true })
  if (!modelo) return null
  return {
    titulo: c.nombre,
    subtitulo: modelo.tipo === 'barras' ? 'Armónicos de la señal' : `Datos de ${c.analisis.nombre}`,
    modelo,
    vista: { ...VISTA_COMPLETA, ocultas: new Set(ocultas) },
    aspecto: aspectoDeGrafica(c.analisis.grafica),
    anotaciones: anotacionesDeDoc(c.analisis.grafica?.anotaciones),
    ...(onGuardarNotas ? { onGuardarNotas } : {})
  }
}

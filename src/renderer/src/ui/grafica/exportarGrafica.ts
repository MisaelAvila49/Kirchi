import type { OpcionesFigura, Tema } from '../../../../compartido/ajustes'
import { cambiarExtension, type ApiArchivos } from '../../../../compartido/archivos'
import type { TextoDeFigura } from '../../exportar/contextoSvg'
import { pngDeFigura, svgDeFigura, type Rasterizar } from '../osciloscopio/exportarFigura'
import type { PilasFuentes } from '../osciloscopio/figura'
import { aplicarFormatoCsv } from '../exportar/csvFormato'
import { csvDeGrafica, figuraDeGrafica, type EntradaFigura } from './figura'

/** Escribe una gráfica de análisis. Disco y navegador llegan por `deps` para probarlo sin ventana. */
export interface DependenciasExportar {
  api: Pick<ApiArchivos, 'rutaExportar' | 'escribirExportacion' | 'pdf'>
  rasterizar: Rasterizar
  ppp: number
  css(textos: readonly TextoDeFigura[]): Promise<string>
  pilas: PilasFuentes
}

export type ResultadoExportar = { ok: true; ruta: string } | { ok: false; cancelado: true } | { ok: false; error: string }

export async function exportarGrafica(e: EntradaFigura, op: OpcionesFigura, tema: Tema, nombreBase: string, d: DependenciasExportar): Promise<ResultadoExportar> {
  const ruta = await d.api.rutaExportar(op.formato, cambiarExtension(nombreBase, op.formato))
  if (!ruta) return { ok: false, cancelado: true }
  let r
  if (op.formato === 'csv') r = await d.api.escribirExportacion(ruta, new TextEncoder().encode(aplicarFormatoCsv(csvDeGrafica(e.titulo, e.subtitulo, e.modelo, e.vista, e.rango), op)))
  else {
    const fig = figuraDeGrafica(e, op, tema, d.pilas)
    if (op.formato === 'png') r = await d.api.escribirExportacion(ruta, await pngDeFigura(fig, op, d.rasterizar, d.ppp))
    else {
      const l = await svgDeFigura(fig, e.titulo, d.css)
      r = op.formato === 'svg' ? await d.api.escribirExportacion(ruta, new TextEncoder().encode(l.svg)) : await d.api.pdf(ruta, l.svg, { tipo: 'ajustar', anchoMm: l.anchoMm, altoMm: l.altoMm })
    }
  }
  return r.ok ? { ok: true, ruta } : { ok: false, error: r.error }
}

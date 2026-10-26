import type { OpcionesFigura } from '../../../../compartido/ajustes'
import { ContextoSvg, type TextoDeFigura } from '../../exportar/contextoSvg'
import type { FiguraCaptura } from './figura'

/**
 * Bytes de una figura en cada formato de imagen. Basta con que la figura sepa dibujarse en un contexto (`FiguraCaptura`).
 */

/** El SVG de fondo que `rasterizar` dibuja antes de la figura (su tamaño lo cambia `rasterizar` a píxeles). */
const fondoSvg = (fondo: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="10mm" height="10mm" viewBox="0 0 10 10"><rect width="10" height="10" fill="${fondo}"/></svg>`

export type Rasterizar = (svg: string, ancho: number, alto: number, ppp: number, encima: (ctx: CanvasRenderingContext2D) => void) => Promise<Uint8Array>

/** El PNG de la figura a la escala de las opciones (1× a 4× de 96 ppp, con su resolución escrita). */
export function pngDeFigura(fig: FiguraCaptura, op: Pick<OpcionesFigura, 'escala'>, rasterizar: Rasterizar, ppp: number): Promise<Uint8Array> {
  const s = op.escala
  return rasterizar(fondoSvg(fig.fondo), fig.ancho * s, fig.alto * s, ppp * s, (ctx) => fig.dibujar(ctx, s))
}

export interface LaminaFigura {
  svg: string
  anchoMm: number
  altoMm: number
}

/** El SVG de la figura (con las fuentes que usa, si `css` las da) y su tamaño real para la hoja del PDF. */
export async function svgDeFigura(fig: FiguraCaptura, titulo: string, css?: (textos: readonly TextoDeFigura[]) => Promise<string>): Promise<LaminaFigura> {
  const ctx = new ContextoSvg(fig.ancho, fig.alto)
  fig.dibujar(ctx, 1)
  return { svg: ctx.svg({ titulo, ...(css ? { css: await css(ctx.textos()) } : {}) }), anchoMm: ctx.anchoMm, altoMm: ctx.altoMm }
}

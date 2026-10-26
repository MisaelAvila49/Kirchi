import type { Camera } from '../canvas/camera'
import type { Texto } from './etiquetas'
import { anchoTexto } from './medidas'
import { cssRgba, type Paleta, type Token } from './paleta'

export const TEXTO_MINIMO_PX = 6

/** `ancho` y `alto` de la vista en píxeles CSS. */
export function textosVisibles(textos: Texto[], cam: Camera, ancho: number, alto: number, minimo = TEXTO_MINIMO_PX): Texto[] {
  const x0 = cam.x, y0 = cam.y, x1 = cam.x + ancho / cam.zoom, y1 = cam.y + alto / cam.zoom
  const out: Texto[] = []
  for (const t of textos) {
    if (t.tamaño * cam.zoom < (t.minimoPx ?? minimo)) continue
    const w = t.ancho ?? anchoTexto(t.texto, t.tamaño)
    // Girado, el largo corre a lo alto y el alto del renglón a lo ancho.
    const a = t.giro ? t.y : t.x
    const ini = t.alinear === 'izq' ? a : t.alinear === 'der' ? a - w : a - w / 2
    const fuera = t.giro
      ? t.x - t.tamaño > x1 || t.x + t.tamaño < x0 || ini > y1 || ini + w < y0
      : ini > x1 || ini + w < x0 || t.y - t.tamaño > y1 || t.y + t.tamaño < y0
    if (fuera) continue
    out.push(t)
  }
  return out
}

/** Tamaño del respaldo del lienzo de texto. Sin textos basta 1×1 (transparente, estirado por CSS): a 2560×1440 el respaldo
 * de Canvas2D cuesta ~7 MB. Cambiar el tamaño borra el lienzo y quien llama dibuja enseguida en el mismo cuadro, sin
 * parpadeo. Devuelve si hay que dibujar. */
export function ajustarLienzoTexto(lienzo: { width: number; height: number }, hayTextos: boolean, w: number, h: number): boolean {
  const ancho = hayTextos ? w : 1, alto = hayTextos ? h : 1
  if (lienzo.width !== ancho) lienzo.width = ancho
  if (lienzo.height !== alto) lienzo.height = alto
  return hayTextos
}

export interface Fuentes {
  interfaz: string
  cifras: string
  serif: string
}

/** Pilas de fuentes de las variables CSS (Mona Sans, Geist Mono y Source Serif incluidas, con las del sistema de respaldo). */
export function fuentesDeCss(el: Element = document.documentElement): Fuentes {
  const s = getComputedStyle(el)
  return {
    interfaz: s.getPropertyValue('--fuente-interfaz').trim() || 'system-ui, sans-serif',
    cifras: s.getPropertyValue('--fuente-cifras').trim() || 'ui-monospace, Consolas, monospace',
    serif: s.getPropertyValue('--fuente-serif').trim() || 'Georgia, serif'
  }
}

export function dibujarTextos(ctx: CanvasRenderingContext2D, textos: Texto[], cam: Camera, dpr: number, paleta: Paleta, fuentes: Fuentes): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  ctx.textBaseline = 'middle'
  // Sin interletraje, como las métricas del reparto: los renglones miden en pantalla lo que midió la función.
  ctx.fontKerning = 'none'
  const colores = new Map<Token, string>()
  let fuente = '', color = '', alinear = ''
  for (const t of textos) {
    const em = t.tamaño * cam.zoom * dpr
    const f = fuenteCanvas(t, em, fuentes)
    if (f !== fuente) ctx.font = fuente = f
    let c = colores.get(t.color)
    if (!c) colores.set(t.color, (c = cssRgba(paleta[t.color])))
    if (c !== color) ctx.fillStyle = color = c
    const a = t.alinear === 'izq' ? 'left' : t.alinear === 'der' ? 'right' : 'center'
    if (a !== alinear) ctx.textAlign = alinear = a
    const x = (t.x - cam.x) * cam.zoom * dpr, y = (t.y - cam.y) * cam.zoom * dpr
    if (t.chip) {
      const w = (t.ancho ?? anchoTexto(t.texto, t.tamaño)) * cam.zoom * dpr
      const izq = (a === 'left' ? x : a === 'right' ? x - w : x - w / 2) - CHIP_PAD_X * em
      ctx.beginPath()
      ctx.roundRect(izq, y - (CHIP_ALTO / 2) * em, w + 2 * CHIP_PAD_X * em, CHIP_ALTO * em, (CHIP_ALTO / 2) * em)
      ctx.fillStyle = cssRgba(paleta.paneles)
      ctx.fill()
      ctx.lineWidth = Math.max(1, dpr)
      ctx.strokeStyle = cssRgba(paleta.bordes)
      ctx.stroke()
      ctx.fillStyle = color
    }
    // Girado un cuarto de vuelta, el texto se dibuja en el origen de un sistema que gira sobre su punto.
    if (t.giro) {
      ctx.translate(x, y)
      ctx.rotate(Math.PI / 2)
    }
    const tx = t.giro ? 0 : x, ty = t.giro ? 0 : y
    ctx.fillText(t.texto, tx, ty)
    if (t.subrayado) {
      const w = (t.ancho ?? anchoTexto(t.texto, t.tamaño)) * cam.zoom * dpr
      const izq = t.alinear === 'izq' ? tx : t.alinear === 'der' ? tx - w : tx - w / 2
      ctx.fillRect(izq, ty + SUBRAYADO_BAJO * em, t.subrayado * cam.zoom * dpr, Math.max(1, SUBRAYADO_GROSOR * em))
    }
    if (t.giro) ctx.setTransform(1, 0, 0, 1, 0, 0)
  }
}

/** Placa de un chip como fracción del alto de la letra: aire a cada lado y alto total. */
export const CHIP_PAD_X = 0.35
export const CHIP_ALTO = 1.35

/** Posición y grosor del subrayado como fracción del alto de la letra, bajo el centro del texto. */
export const SUBRAYADO_BAJO = 0.42
export const SUBRAYADO_GROSOR = 0.07

/** `font` de Canvas2D para un texto: cursiva, negrita, tamaño en píxeles y pila de fuentes. */
export function fuenteCanvas(t: Pick<Texto, 'fuente' | 'negrita' | 'cursiva'>, px: number, fuentes: Fuentes): string {
  const pila = t.fuente === 'cifras' ? fuentes.cifras : t.fuente === 'serif' ? fuentes.serif : fuentes.interfaz
  return `${t.cursiva ? 'italic ' : ''}${t.negrita ? '700 ' : ''}${px.toFixed(1)}px ${pila}`
}

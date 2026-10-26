import type { Lienzo2D } from '../ui/osciloscopio/dibujar'
import { AVISO_FUENTES, escaparXml, num } from './svg'

/** Contexto de dibujo que escribe SVG lo que una figura dibuja con Canvas2D (`Lienzo2D`), para el SVG y PDF del
 * osciloscopio y las gráficas. Solo implementa lo que esas figuras usan y solo escribe la lista blanca del PDF
 * (`main/pdf.ts`). Coordenadas en px CSS. */

/** Una fuente de las que Kirchi empaqueta, para pedir al SVG las caras que usa el texto. */
export type CategoriaFuente = 'interfaz' | 'cifras' | 'serif'
export interface TextoDeFigura {
  texto: string
  fuente: CategoriaFuente
  cursiva: boolean
}

interface Estado {
  fillStyle: string
  strokeStyle: string
  lineWidth: number
  font: string
  textAlign: string
  textBaseline: string
  dash: number[]
  tx: number
  ty: number
  /** Cuántos `<g clip-path>` abrió este nivel (se cierran al `restore`). */
  recortes: number
}

const PX_POR_MM = 96 / 25.4

/** «650 11px "Mona Sans Variable", system-ui, sans-serif» → peso, tamaño, pila y estilo. */
export function leerFuente(f: string): { peso: string; tamaño: number; pila: string; cursiva: boolean } {
  const m = /^\s*(?:(italic|oblique)\s+)?(?:(\d{3}|bold|normal)\s+)?([\d.]+)px\s+(.+)$/.exec(f)
  if (!m) return { peso: 'normal', tamaño: 11, pila: 'system-ui, sans-serif', cursiva: false }
  return { peso: m[2] ?? 'normal', tamaño: Number(m[3]), pila: m[4], cursiva: !!m[1] }
}

const categoriaDe = (pila: string): CategoriaFuente => (/Geist Mono|monospace/i.test(pila) ? 'cifras' : /Source Serif|serif/i.test(pila.replace(/sans-serif/gi, '')) ? 'serif' : 'interfaz')

export class ContextoSvg implements Lienzo2D {
  fillStyle: string | CanvasGradient | CanvasPattern = '#000000'
  strokeStyle: string | CanvasGradient | CanvasPattern = '#000000'
  lineWidth = 1
  font = '10px sans-serif'
  textAlign: CanvasTextAlign = 'left'
  textBaseline: CanvasTextBaseline = 'alphabetic'

  private dash: number[] = []
  private tx = 0
  private ty = 0
  private recortes = 0
  private pila: Estado[] = []
  private d: string[] = []
  private cuerpo: string[] = []
  private nClip = 0
  private vistos: TextoDeFigura[] = []

  constructor(
    readonly ancho: number,
    readonly alto: number
  ) {}

  // ---- estado ----
  save(): void {
    this.pila.push({
      fillStyle: String(this.fillStyle), strokeStyle: String(this.strokeStyle), lineWidth: this.lineWidth, font: this.font, textAlign: this.textAlign,
      textBaseline: this.textBaseline, dash: this.dash, tx: this.tx, ty: this.ty, recortes: this.recortes
    })
    this.recortes = 0
  }

  restore(): void {
    for (let i = 0; i < this.recortes; i++) this.cuerpo.push('</g>')
    const e = this.pila.pop()
    if (!e) {
      this.recortes = 0
      return
    }
    this.fillStyle = e.fillStyle
    this.strokeStyle = e.strokeStyle
    this.lineWidth = e.lineWidth
    this.font = e.font
    this.textAlign = e.textAlign as CanvasTextAlign
    this.textBaseline = e.textBaseline as CanvasTextBaseline
    this.dash = e.dash
    this.tx = e.tx
    this.ty = e.ty
    this.recortes = e.recortes
  }

  translate(x: number, y: number): void {
    this.tx += x
    this.ty += y
  }

  setLineDash(g: number[]): void {
    this.dash = [...g]
  }

  // ---- caminos ----
  private X = (x: number) => num(x + this.tx)
  private Y = (y: number) => num(y + this.ty)

  beginPath(): void {
    this.d = []
  }

  moveTo(x: number, y: number): void {
    this.d.push(`M${this.X(x)} ${this.Y(y)}`)
  }

  lineTo(x: number, y: number): void {
    this.d.push(`L${this.X(x)} ${this.Y(y)}`)
  }

  closePath(): void {
    this.d.push('Z')
  }

  rect(x: number, y: number, w: number, h: number): void {
    this.d.push(`M${this.X(x)} ${this.Y(y)}H${this.X(x + w)}V${this.Y(y + h)}H${this.X(x)}Z`)
  }

  /** El recorte del camino actual: lo que se dibuje hasta el `restore` va dentro de un grupo recortado. */
  clip(): void {
    const id = `recorte-${++this.nClip}`
    this.cuerpo.push(`<clipPath id="${id}"><path d="${this.d.join('')}"/></clipPath>`, `<g clip-path="url(#${id})">`)
    this.recortes++
  }

  stroke(): void {
    if (!this.d.length) return
    const g = this.dash.length ? ` stroke-dasharray="${this.dash.map(num).join(' ')}"` : ''
    this.cuerpo.push(`<path d="${this.d.join('')}" fill="none" stroke="${String(this.strokeStyle)}" stroke-width="${num(this.lineWidth)}"${g} stroke-linejoin="round"/>`)
  }

  fill(): void {
    if (!this.d.length) return
    this.cuerpo.push(`<path d="${this.d.join('')}" fill="${String(this.fillStyle)}"/>`)
  }

  fillRect(x: number, y: number, w: number, h: number): void {
    this.cuerpo.push(`<rect x="${this.X(x)}" y="${this.Y(y)}" width="${num(w)}" height="${num(h)}" fill="${String(this.fillStyle)}"/>`)
  }

  // ---- texto ----
  /** Sin tipografía real a la mano: el ancho aproximado que usan las cajas de lectura (la letra mide ~0.6 de su tamaño). */
  measureText(t: string): TextMetrics {
    const f = leerFuente(this.font)
    return { width: [...t].length * f.tamaño * (categoriaDe(f.pila) === 'cifras' ? 0.6 : 0.56) } as TextMetrics
  }

  fillText(t: string, x: number, y: number): void {
    if (t === '') return
    const f = leerFuente(this.font)
    const fuente = categoriaDe(f.pila)
    this.vistos.push({ texto: t, fuente, cursiva: f.cursiva })
    const ancla = this.textAlign === 'right' || this.textAlign === 'end' ? 'end' : this.textAlign === 'center' ? 'middle' : 'start'
    const atributos = [
      `x="${this.X(x)}"`, `y="${this.Y(y)}"`,
      `font-family="${escaparXml(f.pila).replace(/&quot;/g, "'")}"`, `font-size="${num(f.tamaño)}"`,
      ...(f.peso !== 'normal' ? [`font-weight="${f.peso}"`] : []), ...(f.cursiva ? ['font-style="italic"'] : []),
      ...(ancla !== 'start' ? [`text-anchor="${ancla}"`] : []),
      ...(this.textBaseline === 'middle' ? ['dominant-baseline="central"'] : []),
      `fill="${String(this.fillStyle)}"`
    ]
    this.cuerpo.push(`<text ${atributos.join(' ')}>${escaparXml(t)}</text>`)
  }

  /** Los textos escritos (para pedir las fuentes que incrustar). */
  textos(): readonly TextoDeFigura[] {
    return this.vistos
  }

  /** El documento SVG: tamaño real en mm (96 ppp) y viewBox en px, con el CSS de las fuentes si lo hay. */
  svg(o: { titulo: string; descripcion?: string; css?: string } = { titulo: 'Figura' }): string {
    while (this.recortes > 0 || this.pila.length > 0) {
      if (this.pila.length) this.restore()
      else {
        this.cuerpo.push('</g>')
        this.recortes--
      }
    }
    return (
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        `<svg xmlns="http://www.w3.org/2000/svg" xml:space="preserve" width="${num(this.ancho / PX_POR_MM)}mm" height="${num(this.alto / PX_POR_MM)}mm" viewBox="0 0 ${num(this.ancho)} ${num(this.alto)}">`,
        `<title>${escaparXml(o.titulo)}</title>`,
        `<desc>${escaparXml(o.descripcion ?? 'Figura exportada con Kirchi.')} ${escaparXml(AVISO_FUENTES)}</desc>`,
        `<style>${o.css ?? ''}\ntext{font-kerning:none;white-space:pre}</style>`,
        ...this.cuerpo,
        '</svg>'
      ].join('\n') + '\n'
    )
  }

  /** Tamaño en mm de la figura (96 ppp): lo que pide el PDF para la hoja «del tamaño del dibujo». */
  get anchoMm(): number {
    return this.ancho / PX_POR_MM
  }

  get altoMm(): number {
    return this.alto / PX_POR_MM
  }
}

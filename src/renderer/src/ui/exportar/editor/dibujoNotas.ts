import type { TonoFigura } from '../../../../../compartido/ajustes'
import type { Anotaciones, EstiloTexto, NotaFlecha } from '../../../../../compartido/grafica/anotaciones'
import type { Lienzo2D } from '../../osciloscopio/dibujar'
import { ALTO_RENGLON_GLOBO, medirMono, TAM_GLOBO, type Medir } from './etiquetas'
import type { GeometriaFigura } from './geometria'
import { extremosDeFlecha, resolverEtiqueta } from './objetos'

/** Los colores con que se dibujan las notas: el fondo de la figura, su texto gris y, por tono, la tinta de las letras. */
export interface ColoresNotas {
  fondo: string
  texto: string
  letra(t: TonoFigura): string
}

export interface PilasNotas {
  titulo: string
  cifras: string
}

/** Un texto escrito a mano va en la familia de la interfaz: su caja se estima (solo sirve para elegirlo con el puntero). */
export const medirTexto: Medir = (texto, tam, negrita) => texto.length * tam * (negrita ? 0.58 : 0.54)

/** La letra de uno de los dos títulos de la figura: lo que el lector reescribió o reestilizó, encima de lo de siempre. */
export function letraDeTitulo(
  est: EstiloTexto | undefined,
  base: { texto: string; px: number; negrita: boolean; color: string },
  letra: (t: TonoFigura) => string
): { texto: string; px: number; peso: number; color: string } {
  return {
    texto: est?.texto ?? base.texto,
    px: est?.tam ?? base.px,
    peso: (est?.negrita ?? base.negrita) ? 650 : 400,
    color: est?.tono ? letra(est.tono) : base.color
  }
}

function punta(ctx: Lienzo2D, f: NotaFlecha, x1: number, y1: number, x2: number, y2: number, k: number, color: string): void {
  const largo = (8 + 2 * f.grosor) * k
  const ang = Math.atan2(y2 - y1, x2 - x1)
  const abre = 0.45
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(x2, y2)
  ctx.lineTo(x2 - largo * Math.cos(ang - abre), y2 - largo * Math.sin(ang - abre))
  ctx.lineTo(x2 - largo * Math.cos(ang + abre), y2 - largo * Math.sin(ang + abre))
  ctx.closePath()
  ctx.fill()
}

/** Dibuja textos, flechas y etiquetas de valor sobre la figura. Las coordenadas de `geo` son de la figura a 1×; `k` es el factor de lienzo. */
export function dibujarNotas(ctx: Lienzo2D, k: number, geo: GeometriaFigura, anot: Anotaciones, c: ColoresNotas, pilas: PilasNotas): void {
  ctx.setLineDash([])
  for (const f of anot.flechas) {
    const [x1, y1, x2, y2] = extremosDeFlecha(f, geo).map((v) => v * k) as [number, number, number, number]
    const color = c.letra(f.tono)
    ctx.strokeStyle = color
    ctx.lineWidth = f.grosor * k
    ctx.beginPath()
    // La línea termina donde empieza la punta, para que no la desborde.
    const ang = Math.atan2(y2 - y1, x2 - x1)
    const corte = (6 + 2 * f.grosor) * k
    const largo = Math.hypot(x2 - x1, y2 - y1)
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2 - Math.cos(ang) * Math.min(corte, largo), y2 - Math.sin(ang) * Math.min(corte, largo))
    ctx.stroke()
    if (largo > 0) punta(ctx, f, x1, y1, x2, y2, k, color)
  }
  for (const n of anot.textos) {
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    ctx.fillStyle = c.letra(n.tono)
    ctx.font = `${n.negrita ? 650 : 400} ${n.tam * k}px ${pilas.titulo}`
    ctx.fillText(n.texto, n.fx * geo.ancho * k, n.fy * geo.alto * k)
  }
  for (const e of anot.etiquetas) {
    const r = resolverEtiqueta(e, geo, medirMono)
    if (!r) continue
    const tono = e.tono ?? r.traza.tono
    const tinta = c.letra(tono)
    const { caja, punto } = r
    // El hilo del punto al globo: hasta el borde más cercano del recuadro.
    const ex = Math.max(caja.x, Math.min(caja.x + caja.w, punto.px))
    const ey = Math.max(caja.y, Math.min(caja.y + caja.h, punto.py))
    ctx.strokeStyle = tinta
    ctx.lineWidth = k
    ctx.beginPath()
    ctx.moveTo(punto.px * k, punto.py * k)
    ctx.lineTo(ex * k, ey * k)
    ctx.stroke()
    ctx.fillStyle = c.fondo
    ctx.fillRect(caja.x * k, caja.y * k, caja.w * k, caja.h * k)
    ctx.strokeStyle = tinta
    ctx.beginPath()
    ctx.rect(caja.x * k + 0.5 * k, caja.y * k + 0.5 * k, caja.w * k - k, caja.h * k - k)
    ctx.stroke()
    // El punto elegido: un rombo del color de la traza con un borde del fondo para que se vea sobre cualquier línea.
    const rr = 4.5 * k
    ctx.fillStyle = tinta
    ctx.strokeStyle = c.fondo
    ctx.lineWidth = 1.5 * k
    ctx.beginPath()
    ctx.moveTo(punto.px * k, punto.py * k - rr)
    ctx.lineTo(punto.px * k + rr, punto.py * k)
    ctx.lineTo(punto.px * k, punto.py * k + rr)
    ctx.lineTo(punto.px * k - rr, punto.py * k)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    ctx.font = `${TAM_GLOBO * k}px ${pilas.cifras}`
    ctx.fillStyle = c.texto
    r.renglones.forEach((t, i) => ctx.fillText(t, (caja.x + 6) * k, (caja.y + 4 + ALTO_RENGLON_GLOBO * (i + 0.5)) * k))
  }
}

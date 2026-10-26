import { limpiarTexto } from '../doc/limpiar'
import { MM_POR_UNIDAD } from '../doc/tipos'
import { FLOTANTES_TRAZO, FLOTANTES_VERTICE } from '../lienzo/buffers'
import type { Escena } from '../lienzo/escena'
import type { Texto } from '../lienzo/etiquetas'
import { anchoTexto, PASO_REJILLA_MAYOR, PASO_REJILLA_MENOR } from '../lienzo/medidas'
import type { Paleta, RGBA } from '../lienzo/paleta'
import { fuenteCanvas, SUBRAYADO_BAJO, SUBRAYADO_GROSOR, type Fuentes } from '../lienzo/texto'
import type { Caja } from '../piezas/tipos'

/** Exporta a SVG desde la misma escena del lienzo: trazos en cápsula a caminos con extremos redondos, rellenos
 * triangulados a un camino por color, uniones a círculos y textos a `<text>` con los mismos cortes de renglón.
 * 1 unidad de mundo = 1.25 mm y el tamaño va en mm, así que se imprime a escala real. */

/** Margen alrededor del dibujo, en unidades de mundo: 4 = 5 mm. */
export const MARGEN_EXPORTAR = 4
/** Paso de la rejilla menor y mayor en unidades (2.5 mm y 15 mm, cada 6 celdas) y radio de sus puntos. */
const PASO_MENOR = PASO_REJILLA_MENOR
const PASO_MAYOR = PASO_REJILLA_MAYOR
const RADIO_MENOR = 0.12
const RADIO_MAYOR = 0.18

/** Aviso de las licencias de las fuentes que pueden ir incrustadas (OFL-1.1 pide conservarlo). */
export const AVISO_FUENTES =
  'Fuentes incrustadas sin modificar, con la SIL Open Font License 1.1 (https://openfontlicense.org): Mona Sans (c) 2022 The Mona Sans Project Authors; Geist Mono (c) 2024 The Geist Project Authors; Source Serif 4 (c) 2014-2021 Adobe (Source Serif Project Authors).'

export interface OpcionesSvg {
  paleta: Paleta
  /** Color de fondo; null deja el fondo transparente. */
  fondo: RGBA | null
  rejilla: boolean
  /** Pilas de fuentes CSS (las de la interfaz). */
  fuentes: Fuentes
  /** @font-face con las fuentes incrustadas (`cssDeFuentes`); vacío, el visor usa las suyas. */
  css?: string
  titulo?: string
  /** Margen alrededor del dibujo, en unidades de mundo (`MARGEN_EXPORTAR` por omisión). */
  margen?: number
  /** La caja que cubre la lámina antes del margen, si no es la del dibujo (el área elegida al exportar). */
  caja?: Caja
  /** Sin textos ni fuentes, solo geometría: el PNG dibuja el SVG y encima los textos con Canvas2D, porque las fuentes
   * incrustadas de una imagen SVG cargan tarde y el primer dibujo sale sin letras. */
  sinTextos?: boolean
  /** Distancia de la línea base al centro del texto, en fracción del alto de la letra: Canvas2D centra con `textBaseline =
   * 'middle'` y el SVG coloca la base. Se mide con la fuente real (`baseDeTexto`); en pruebas, un valor fijo. */
  base?: (t: Texto) => number
}

export interface Lamina {
  svg: string
  /** Caja de mundo que cubre la lámina (dibujo más margen). */
  caja: Caja
  anchoMm: number
  altoMm: number
}

/** Número corto: tres decimales sin ceros de sobra («0.25», «-12», «3.125»). */
export const num = (v: number): string => {
  const r = Math.round(v * 1000) / 1000
  return Object.is(r, -0) ? '0' : String(r)
}

const hex2 = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')
export const hexDe = (c: RGBA): string => `#${hex2(c[0])}${hex2(c[1])}${hex2(c[2])}`

/** `fill`/`stroke` con su opacidad si no es opaco. */
const pintura = (attr: 'fill' | 'stroke', c: RGBA): string => `${attr}="${hexDe(c)}"${c[3] < 1 ? ` ${attr}-opacity="${num(c[3])}"` : ''}`

export const escaparXml = (s: string): string => limpiarTexto(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Los trazos de la escena: un camino por tramo continuo del mismo ancho y color, y un círculo por punto. */
function caminos(datos: Float32Array, n: number): string[] {
  const out: string[] = []
  let d = '', clave = '', ultX = NaN, ultY = NaN, ancho = 0, color: RGBA = [0, 0, 0, 1]
  const cerrar = () => {
    if (d) out.push(`<path d="${d}" stroke-width="${num(ancho)}" ${pintura('stroke', color)}/>`)
    d = ''
  }
  for (let i = 0; i < n; i++) {
    const o = i * FLOTANTES_TRAZO
    const x0 = datos[o], y0 = datos[o + 1], x1 = datos[o + 2], y1 = datos[o + 3], w = datos[o + 4]
    const c: RGBA = [datos[o + 5], datos[o + 6], datos[o + 7], datos[o + 8]]
    if (x0 === x1 && y0 === y1) {
      // Un segmento de largo cero es un punto (las uniones): en SVG, un círculo lleno.
      cerrar()
      clave = ''
      out.push(`<circle cx="${num(x0)}" cy="${num(y0)}" r="${num(w / 2)}" ${pintura('fill', c)} stroke="none"/>`)
      continue
    }
    const k = `${w}|${c.join(',')}`
    if (k !== clave) {
      cerrar()
      clave = k
      ancho = w
      color = c
    }
    if (d && x0 === ultX && y0 === ultY) d += `L${num(x1)} ${num(y1)}`
    else d += `M${num(x0)} ${num(y0)}L${num(x1)} ${num(y1)}`
    ultX = x1
    ultY = y1
  }
  cerrar()
  return out
}

/** Rellenos: todos los triángulos de un color en un solo camino (sin costuras entre vecinos), con la misma orientación
 * para que ninguno se reste de otro. */
function rellenos(datos: Float32Array, n: number): string[] {
  const porColor = new Map<string, { c: RGBA; d: string[] }>()
  const paso = FLOTANTES_VERTICE * 3
  for (let i = 0; i < n; i++) {
    const o = i * paso
    let ax = datos[o], ay = datos[o + 1], bx = datos[o + FLOTANTES_VERTICE], by = datos[o + FLOTANTES_VERTICE + 1]
    const cx = datos[o + 2 * FLOTANTES_VERTICE], cy = datos[o + 2 * FLOTANTES_VERTICE + 1]
    if ((bx - ax) * (cy - ay) - (by - ay) * (cx - ax) < 0) [ax, ay, bx, by] = [bx, by, ax, ay]
    const c: RGBA = [datos[o + 2], datos[o + 3], datos[o + 4], datos[o + 5]]
    const k = c.join(',')
    let g = porColor.get(k)
    if (!g) porColor.set(k, (g = { c, d: [] }))
    g.d.push(`M${num(ax)} ${num(ay)}L${num(bx)} ${num(by)}L${num(cx)} ${num(cy)}Z`)
  }
  return [...porColor.values()].map((g) => `<path d="${g.d.join('')}" ${pintura('fill', g.c)} stroke="none"/>`)
}

const ANCLA: Record<Texto['alinear'], string> = { izq: 'start', centro: 'middle', der: 'end' }

function textos(ts: readonly Texto[], o: OpcionesSvg): string[] {
  const out: string[] = []
  for (const t of ts) {
    const pila = t.fuente === 'cifras' ? o.fuentes.cifras : t.fuente === 'serif' ? o.fuentes.serif : o.fuentes.interfaz
    const color = o.paleta[t.color]
    const y = t.y + (o.base?.(t) ?? 0.27) * t.tamaño
    // Girado un cuarto de vuelta (se lee de arriba abajo): el texto y su subrayado giran sobre el punto (x, y) del texto.
    const giro = t.giro ? `transform="rotate(${t.giro} ${num(t.x)} ${num(t.y)})"` : null
    const attrs = [
      `x="${num(t.x)}"`,
      `y="${num(y)}"`,
      `font-family="${escaparXml(pila)}"`,
      `font-size="${num(t.tamaño)}"`,
      ...(t.negrita ? ['font-weight="700"'] : []),
      ...(t.cursiva ? ['font-style="italic"'] : []),
      ...(t.alinear !== 'izq' ? [`text-anchor="${ANCLA[t.alinear]}"`] : []),
      // El ancho que midió el reparto: un visor sin estas fuentes ajusta el espaciado y no rompe los renglones.
      ...(t.ancho !== undefined && t.ancho > 0 ? [`textLength="${num(t.ancho)}"`] : []),
      ...(giro ? [giro] : []),
      pintura('fill', color)
    ]
    out.push(`<text ${attrs.join(' ')}>${escaparXml(t.texto)}</text>`)
    if (t.subrayado) {
      const w = t.ancho ?? anchoTexto(t.texto, t.tamaño)
      const izq = t.alinear === 'izq' ? t.x : t.alinear === 'der' ? t.x - w : t.x - w / 2
      out.push(`<rect x="${num(izq)}" y="${num(t.y + SUBRAYADO_BAJO * t.tamaño)}" width="${num(t.subrayado)}" height="${num(SUBRAYADO_GROSOR * t.tamaño)}" ${giro ? `${giro} ` : ''}${pintura('fill', color)}/>`)
    }
  }
  return out
}

function rejilla(c: Caja, p: Paleta): string[] {
  const patron = (id: string, paso: number, r: number, color: RGBA) =>
    `<pattern id="${id}" x="${-paso / 2}" y="${-paso / 2}" width="${paso}" height="${paso}" patternUnits="userSpaceOnUse"><circle cx="${paso / 2}" cy="${paso / 2}" r="${r}" ${pintura('fill', color)}/></pattern>`
  const rect = (id: string) => `<rect x="${num(c.minX)}" y="${num(c.minY)}" width="${num(c.maxX - c.minX)}" height="${num(c.maxY - c.minY)}" fill="url(#${id})"/>`
  return [`<defs>${patron('rejilla-menor', PASO_MENOR, RADIO_MENOR, p.rejillaMenor)}${patron('rejilla-mayor', PASO_MAYOR, RADIO_MAYOR, p.rejillaMayor)}</defs>`, rect('rejilla-menor'), rect('rejilla-mayor')]
}

/** Caja de la lámina: dibujo con margen y bordes en enteros de la rejilla fina, para que no se mueva medio paso. El
 * diálogo también la usa para decir el tamaño. */
export function cajaLamina(dibujo: Caja, margen = MARGEN_EXPORTAR): { caja: Caja; anchoMm: number; altoMm: number } {
  const caja: Caja = { minX: Math.floor(dibujo.minX - margen), minY: Math.floor(dibujo.minY - margen), maxX: Math.ceil(dibujo.maxX + margen), maxY: Math.ceil(dibujo.maxY + margen) }
  return { caja, anchoMm: (caja.maxX - caja.minX) * MM_POR_UNIDAD, altoMm: (caja.maxY - caja.minY) * MM_POR_UNIDAD }
}

/** El SVG de la escena, recortado al dibujo con su margen; null si no hay nada dibujado. */
export function svgDeEscena(esc: Escena, o: OpcionesSvg): Lamina | null {
  if (!esc.caja) return null
  const { caja, anchoMm, altoMm } = cajaLamina(o.caja ?? esc.caja, o.margen)
  const w = caja.maxX - caja.minX, h = caja.maxY - caja.minY
  const partes = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" xml:space="preserve" width="${num(anchoMm)}mm" height="${num(altoMm)}mm" viewBox="${num(caja.minX)} ${num(caja.minY)} ${num(w)} ${num(h)}">`,
    `<title>${escaparXml(o.titulo ?? 'Circuito')}</title>`,
    `<desc>Esquema exportado con Kirchi. ${escaparXml(AVISO_FUENTES)}</desc>`,
    // Sin interletraje, como el reparto y el lienzo: los renglones miden lo mismo en todos lados.
    ...(o.sinTextos ? [] : [`<style>${o.css ?? ''}\ntext{font-kerning:none;white-space:pre}</style>`]),
    ...(o.fondo ? [`<rect x="${num(caja.minX)}" y="${num(caja.minY)}" width="${num(w)}" height="${num(h)}" ${pintura('fill', o.fondo)}/>`] : []),
    ...(o.rejilla ? rejilla(caja, o.paleta) : []),
    // Las figuras de dibujo, debajo del circuito, como en el lienzo (sin figuras no agregan nada).
    ...rellenos(esc.figuras.triangulos, esc.figuras.nTriangulos),
    ...(esc.figuras.nTrazos > 0 ? ['<g fill="none" stroke-linecap="round" stroke-linejoin="round">', ...caminos(esc.figuras.trazos, esc.figuras.nTrazos), '</g>'] : []),
    ...rellenos(esc.triangulos, esc.nTriangulos),
    '<g fill="none" stroke-linecap="round" stroke-linejoin="round">',
    ...caminos(esc.trazos, esc.nTrazos),
    '</g>',
    ...(o.sinTextos ? [] : textos(esc.textos, o)),
    '</svg>'
  ]
  return { svg: partes.join('\n') + '\n', caja, anchoMm, altoMm }
}

let lienzoMedidas: CanvasRenderingContext2D | null = null

/** Medidor de la base: `medir` da la distancia de la línea base al centro del texto (fracción del alto) y `cargada` si la
 * fuente está lista. Lo medido antes de cargar es del respaldo y no se guarda. */
export function crearBaseDeTexto(medir: (fuente: string) => number, cargada: (fuente: string) => boolean): (t: Texto, fuentes: Fuentes) => number {
  const bases = new Map<string, number>()
  return (t, fuentes) => {
    const f = fuenteCanvas(t, 100, fuentes)
    const v = bases.get(f)
    if (v !== undefined) return v
    const b = medir(f)
    if (cargada(f)) bases.set(f, b)
    return b
  }
}

/** Fracción del alto de la letra entre el centro (`textBaseline = 'middle'` de Canvas2D) y la línea base, medida con la
 * fuente de la página para que el SVG coincida con el lienzo. Una vez por fuente y estilo, ya cargada
 * (`cargarFuentesDeTextos`). */
export const baseDeTexto = crearBaseDeTexto(
  (f) => {
    lienzoMedidas ??= document.createElement('canvas').getContext('2d')
    if (!lienzoMedidas) return 0.27
    lienzoMedidas.font = f
    lienzoMedidas.textBaseline = 'middle'
    return -lienzoMedidas.measureText('Hg').alphabeticBaseline / 100
  },
  (f) => document.fonts?.check(f, 'Hg') ?? true
)

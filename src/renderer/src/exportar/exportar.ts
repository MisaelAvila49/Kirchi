import type { OpcionesExportar, Tema } from '../../../compartido/ajustes'
import { cambiarExtension, nombreDeRuta, type ApiArchivos, type FormatoExportar } from '../../../compartido/archivos'
import type { Camera } from '../canvas/camera'
import { MM_POR_UNIDAD } from '../doc/tipos'
import type { Caja } from '../piezas/tipos'
import type { Escena } from '../lienzo/escena'
import type { Texto } from '../lienzo/etiquetas'
import { hexARgba, type Paleta, type RGBA } from '../lienzo/paleta'
import type { Fuentes } from '../lienzo/texto'
import { cargarFuentesDeTextos } from './fuentes'
import { PPP_BASE, tamañoPng } from './png'
import { svgDeEscena } from './svg'

export interface DependenciasExportar {
  api: ApiArchivos | undefined
  /** La escena de lo que se exporta con una paleta (la del lienzo, sin selección ni cursor) y las opciones (instrumentos, lecturas, voltajes). */
  escena(paleta: Paleta, o: OpcionesExportar): Escena
  /** Si la lámina cubre un área elegida y no el dibujo: su caja en unidades de mundo (antes del margen). */
  caja?: Caja | null
  /** La caja de las anotaciones que la lámina debe abarcar, dada la del dibujo o el área (solo cuentan las que tocan algo de ella); null si no hay. */
  cajaNotas?(dibujo: Caja): Caja | null
  /** La paleta de un tema con el color de cables elegido. */
  paleta(tema: Tema): Paleta
  temaActual: Tema
  fuentes: Fuentes
  /** Carga las fuentes de los textos (`cargarFuentesDeTextos`) antes de medir; sin ella se usa la del documento. */
  cargarFuentes?(textos: readonly Texto[]): Promise<void>
  /** @font-face con las fuentes que usan los textos (`cssDeFuentes`). */
  css(textos: readonly Texto[]): Promise<string>
  /** Posición de la línea base de cada texto (`baseDeTexto`). */
  base(t: Texto): number
  rasterizar(svg: string, ancho: number, alto: number, ppp: number, encima: (ctx: CanvasRenderingContext2D) => void): Promise<Uint8Array>
  /** Dibuja textos con Canvas2D como el lienzo (`dibujarTextos`). */
  dibujarTextos(ctx: CanvasRenderingContext2D, textos: readonly Texto[], cam: Camera, paleta: Paleta): void
  /** Nombre del archivo abierto: título del SVG y nombre sugerido. */
  nombre: string
  /** Las anotaciones del diálogo (solo viven en la imagen): recibe la lámina SVG y el tema de su fondo y la devuelve con ellas encima. */
  superponer?(svg: string, tema: Tema): string
}

export type ResultadoExportar = { ok: true; ruta: string; mensaje: string; aviso?: string } | { ok: false; cancelado: true } | { ok: false; error: string }

export const NOMBRE_FORMATO: Record<FormatoExportar, string> = { png: 'PNG', svg: 'SVG', pdf: 'PDF' }

/** Tema y fondo de la exportación. Blanco por omisión (evita un recuadro crema en hoja blanca); «papel» y «oscuro» usan la
 * paleta de cada tema aunque la aplicación se vea en el otro. Un PDF no tiene fondo transparente: sale en blanco. */
export function aspecto(o: OpcionesExportar, formato: FormatoExportar, temaActual: Tema, paleta: (t: Tema) => Paleta): { paleta: Paleta; fondo: RGBA | null } {
  const p = paleta(o.fondo === 'oscuro' ? 'oscuro' : 'claro')
  if (o.fondo === 'transparente') return { paleta: p, fondo: formato === 'pdf' ? hexARgba('#FFFFFF') : null }
  if (o.fondo === 'blanco') return { paleta: p, fondo: hexARgba('#FFFFFF') }
  return { paleta: p, fondo: p.lienzo }
}

/** La escena armada con sus fuentes y la lámina SVG de `formato`; `lamina` es null si no hay nada dibujado. */
async function armar(formato: FormatoExportar, o: OpcionesExportar, d: DependenciasExportar, conTextos = formato !== 'png') {
  const { paleta, fondo } = aspecto(o, formato, d.temaActual, d.paleta)
  // La opacidad de las figuras se mezcla con el fondo de la hoja (blanco por omisión), no con el papel del lienzo.
  const esc = d.escena(fondo ? { ...paleta, lienzo: fondo } : paleta, o)
  // Las fuentes se cargan antes de medir la línea base y los glifos: un texto fuera de pantalla no las ha pedido.
  await (d.cargarFuentes ? d.cargarFuentes(esc.textos) : cargarFuentesDeTextos(esc.textos, d.fuentes))
  const dibujo = d.caja ?? esc.caja
  const extra = dibujo && d.cajaNotas ? d.cajaNotas(dibujo) : null
  const cajaFinal = extra && dibujo ? { minX: Math.min(dibujo.minX, extra.minX), minY: Math.min(dibujo.minY, extra.minY), maxX: Math.max(dibujo.maxX, extra.maxX), maxY: Math.max(dibujo.maxY, extra.maxY) } : d.caja
  const comunes = { paleta, fondo, rejilla: o.rejilla, fuentes: d.fuentes, titulo: d.nombre, base: d.base, margen: o.margenMm / MM_POR_UNIDAD, ...(cajaFinal ? { caja: cajaFinal } : {}) }
  // El PNG no lleva fuentes en el SVG: sus textos los dibuja Canvas2D encima.
  const base = svgDeEscena(esc, conTextos ? { ...comunes, css: await d.css(esc.textos) } : { ...comunes, sinTextos: true })
  const lamina = base && d.superponer ? { ...base, svg: d.superponer(base.svg, o.fondo === 'oscuro' ? 'oscuro' : 'claro') } : base
  return { lamina, esc, paleta, fondo }
}

/** Vista previa del diálogo de exportar: el SVG con sus textos, como saldrá en SVG, PDF y (misma geometría) PNG. Null si
 * no hay nada dibujado. No toca el disco. */
export async function vistaPreviaExportar(formato: FormatoExportar, o: OpcionesExportar, d: DependenciasExportar): Promise<{ svg: string; anchoMm: number; altoMm: number; transparente: boolean; origenXMm: number; origenYMm: number } | null> {
  const { lamina, fondo } = await armar(formato, o, d, true)
  return lamina ? { svg: lamina.svg, anchoMm: lamina.anchoMm, altoMm: lamina.altoMm, transparente: fondo === null, origenXMm: lamina.caja.minX * MM_POR_UNIDAD, origenYMm: lamina.caja.minY * MM_POR_UNIDAD } : null
}

/** Exporta el dibujo: primero se elige el archivo (cancelar no arma nada) y luego se escribe. */
export async function exportar(formato: FormatoExportar, o: OpcionesExportar, d: DependenciasExportar): Promise<ResultadoExportar> {
  if (!d.api) return { ok: false, error: 'Esta ventana no puede exportar: Kirchi corre sin su proceso principal.' }
  const ruta = await d.api.rutaExportar(formato, cambiarExtension(d.nombre, formato))
  if (!ruta) return { ok: false, cancelado: true }
  const { lamina, esc, paleta } = await armar(formato, o, d)
  if (!lamina) return { ok: false, error: 'El circuito está vacío: no hay nada que exportar.' }
  const nombre = nombreDeRuta(ruta)
  let aviso: string | undefined
  let r
  try {
    if (formato === 'svg') r = await d.api.escribirExportacion(ruta, new TextEncoder().encode(lamina.svg))
    else if (formato === 'pdf') r = await d.api.pdf(ruta, lamina.svg, { tipo: o.pagina, anchoMm: lamina.anchoMm, altoMm: lamina.altoMm })
    else {
      const t = tamañoPng(lamina.anchoMm, lamina.altoMm, o.escala)
      if (t.reducida) aviso = `${nombre} salió a ${t.escala.toFixed(1)}× en lugar de ${o.escala}×: a esa resolución pasaba del tamaño máximo de imagen.`
      // La misma cámara que dibujaría la lámina entera en el lienzo del PNG.
      const cam: Camera = { x: lamina.caja.minX, y: lamina.caja.minY, zoom: t.ancho / (lamina.caja.maxX - lamina.caja.minX) }
      const png = await d.rasterizar(lamina.svg, t.ancho, t.alto, PPP_BASE * t.escala, (ctx) => d.dibujarTextos(ctx, esc.textos, cam, paleta))
      r = await d.api.escribirExportacion(ruta, png)
    }
  } catch (e) {
    return { ok: false, error: `No se pudo exportar ${nombre}: ${e instanceof Error ? e.message : String(e)}.` }
  }
  if (!r.ok) return { ok: false, error: r.error }
  return { ok: true, ruta, mensaje: `Se exportó ${nombre}.`, ...(aviso ? { aviso } : {}) }
}

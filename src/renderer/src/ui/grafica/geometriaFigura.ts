import { decimalesPorOmision, formatoConDecimales } from '../../../../compartido/grafica/ejes'
import { trazaLimpia, type GeometriaFigura, type ObjetoGeom, type Rect, type TrazaGeom } from '../exportar/editor/geometria'
import type { Decimales } from '../../../../compartido/grafica/aspecto'
import type { Geometria } from './dibujo'
import type { ModeloGrafica } from './modelo'
import { aPixel } from './vista'

export interface EntradaGeometriaGrafica {
  modelo: ModeloGrafica
  /** El reparto ya calculado de la gráfica a 1× (sin escalar). */
  g: Geometria
  /** Qué trazas están a la vista (por clave). */
  ocultas: ReadonlySet<string>
  /** Dónde cae el origen de la gráfica dentro de la figura. */
  ox: number
  oy: number
  ancho: number
  alto: number
  titulos?: { titulo?: Rect; subtitulo?: Rect }
  /** Decimales propios de los valores de las etiquetas (ausente, los de cada eje). */
  decimalesEtiquetas?: Decimales
}

/** El nombre con que se guarda el estilo de un eje vertical: la clave de su primera traza y su unidad (un Bode tiene dos con la misma clave). */
export const claveDeEje = (clave: string, unidad: string): string => `${clave}#${unidad}`

/**
 * Dónde cae cada cosa de la gráfica en la figura: retícula del primer panel, un punto por dato y bandas de cada eje. Mismo reparto que `dibujarGrafica`.
 */
export function geometriaDeFigura(e: EntradaGeometriaGrafica): GeometriaFigura {
  const { modelo: m, g } = e
  // Dos trazas con el mismo nombre (la magnitud y la fase de un Bode) se distinguen por la unidad de su eje.
  const repetidas = (et: string) => m.tipo === 'lineas' && m.trazas.filter((t) => t.etiqueta === et).length > 1
  const nombreDe = (t: { etiqueta: string; unidad: string }) => (repetidas(t.etiqueta) && t.unidad ? `${t.etiqueta} (${t.unidad})` : t.etiqueta)
  const trazas: TrazaGeom[] = []
  const objetos: ObjetoGeom[] = []
  if (e.titulos?.titulo) objetos.push({ id: 'titulo', tipo: 'fijo', etiqueta: 'Título', rect: e.titulos.titulo })
  if (e.titulos?.subtitulo) objetos.push({ id: 'subtitulo', tipo: 'fijo', etiqueta: 'Subtítulo', rect: e.titulos.subtitulo })
  const primero = g.paneles[0]
  const area: Rect = primero ? { x: e.ox + primero.col.x, y: e.oy + primero.y0 + primero.col.y, w: primero.col.w, h: primero.col.h } : { x: e.ox, y: e.oy, w: g.W, h: g.H }
  if (m.tipo === 'lineas') {
    for (const [p, pan] of g.paneles.entries()) {
      const { col } = pan
      const x0 = e.ox + col.x
      const y0 = e.oy + pan.y0
      for (const gr of pan.grupos) {
        for (const i of gr.trazas) {
          const t = m.trazas[i]
          if (e.ocultas.has(t.clave) || Math.min(g.paneles.length - 1, t.panel) !== p) continue
          const n = t.x.length
          const px = new Float64Array(n)
          const py = new Float64Array(n)
          for (let j = 0; j < n; j++) {
            px[j] = x0 + aPixel(t.x[j], g.x, g.escalaX, 0, col.w)
            py[j] = y0 + Math.max(col.y - col.h, Math.min(col.y + 2 * col.h, aPixel(t.y[j], gr.dominio, 'lin', col.y + col.h, col.y)))
          }
          // Solo lo que cae en la retícula se puede elegir.
          const dentro: number[] = []
          for (let j = 0; j < n; j++) if (px[j] >= x0 - 0.5 && px[j] <= x0 + col.w + 0.5) dentro.push(j)
          const sel = (f: ArrayLike<number>) => Float64Array.from(dentro, (j) => f[j])
          // Dos trazas con la misma clave (la magnitud y la fase de un Bode) se distinguen por su unidad.
          const id = trazas.some((q) => q.id === t.clave) ? `${t.clave}#${t.unidad}` : t.clave
          trazas.push(trazaLimpia({ id, etiqueta: nombreDe(t), tono: t.tono, unidadX: m.ejeX.unidad, unidadY: t.unidad, ...(g.rotuloX.compacto ? {} : { formatoX: formatoConDecimales({ prefijo: g.rotuloX.prefijo, ...(g.rotuloX.decimales !== undefined ? { decimales: g.rotuloX.decimales } : {}), omision: decimalesPorOmision(m.ejeX.unidad) }, e.decimalesEtiquetas) }), formatoY: formatoConDecimales({ prefijo: gr.prefijo, ...(gr.decimales !== undefined ? { decimales: gr.decimales } : {}), omision: 1 }, e.decimalesEtiquetas), ...(g.escalaX === 'log' ? { logX: true } : {}) }, sel(px), sel(py), sel(t.x), sel(t.y)))
        }
      }
    }
    for (const pan of g.paneles) {
      const { col } = pan
      const y0 = e.oy + pan.y0
      if (col.eje.posicion !== 'ninguno' && !objetos.some((o) => o.id === 'eje:x')) {
        const rect: Rect =
          col.eje.posicion === 'centro'
            ? { x: e.ox + col.x, y: y0 + col.eje.linea - 6, w: col.w, h: 24 }
            : { x: e.ox + col.x, y: y0 + col.eje.y0, w: col.w, h: Math.max(14, col.eje.y1 - col.eje.y0) }
        objetos.push({ id: 'eje:x', tipo: 'eje', etiqueta: 'Eje horizontal', rect })
      }
      for (const [k, gr] of pan.grupos.entries()) {
        const cl = col.columnas[k]
        const clave = m.trazas[gr.trazas[0]]?.clave
        if (!cl || clave === undefined) continue
        objetos.push({ id: `eje:${claveDeEje(clave, gr.unidad)}`, tipo: 'eje', etiqueta: `Eje de ${nombreDe(m.trazas[gr.trazas[0]])}`, rect: { x: e.ox + cl.x0, y: y0 + col.y - 20, w: cl.x1 - cl.x0, h: col.h + 20 } })
      }
    }
  }
  return { ancho: e.ancho, alto: e.alto, area, trazas, objetos }
}

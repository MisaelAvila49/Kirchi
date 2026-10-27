import type { TonoFigura } from '../../../../compartido/ajustes'
import { indiceMasCercano, valorEnPrefijo } from '../../../../compartido/grafica/ejes'
import { textoMarca } from '../../../../compartido/grafica/ticks'
import type { Geometria } from './dibujo'
import type { ModeloGrafica, VistaGrafica } from './modelo'
import { aPixel, deValor, interpolar } from './vista'
import { lecturaXY } from './xy'

/**
 * Lo que el puntero lee sobre una gráfica (valor horizontal y de cada traza visible, con el prefijo de su eje). Sin DOM, en píxeles de dispositivo.
 */
export interface FilaLectura {
  clave: string
  etiqueta: string
  tono: TonoFigura
  /** El panel de la traza (0 arriba) y el píxel vertical del punto, ya sumado el inicio del panel. */
  panel: number
  yPx: number | null
  valor: number
  texto: string
}

export interface LecturaEn {
  /** Dónde cae la cruz (píxel horizontal): el del puntero o el del punto de datos al que se pegó. */
  xPx: number
  encabezado: string
  filas: FilaLectura[]
}

/** Hasta dónde (px CSS) se pega la cruz a un punto de datos, y cuánto deben distar entre sí los puntos para que valga la pena pegarla. */
const PEGAR_PX = 10
const DISPERSOS_PX = 14

const NOMBRE_CORTO = (nombre: string): string => (nombre.length <= 3 ? nombre : nombre.charAt(0).toLowerCase())

export function lecturaEn(m: ModeloGrafica, v: VistaGrafica, g: Geometria, xPx: number, yPx = Number.NaN): LecturaEn | null {
  const col0 = g.paneles[0].col
  if (!(xPx >= col0.x && xPx <= col0.x + col0.w)) return null
  if (m.xy && m.tipo === 'lineas') return Number.isNaN(yPx) ? null : lecturaXY(m, v, g, xPx, yPx)
  const d = g.dpr
  if (m.tipo === 'barras' && m.barras) {
    const n = m.barras.categorias.length
    const i = Math.max(0, Math.min(n - 1, Math.floor(((xPx - col0.x) / col0.w) * n)))
    const gr = g.paneles[0].grupos[0]
    const filas: FilaLectura[] = m.barras.series.map((s) => {
      const val = s.valores[i]
      return { clave: s.clave, etiqueta: s.etiqueta, tono: s.tono, panel: 0, yPx: Number.isFinite(val) ? g.paneles[0].y0 + aPixel(val, gr.dominio, 'lin', col0.y + col0.h, col0.y) : null, valor: val, texto: Number.isFinite(val) ? `${valorEnPrefijo(val, gr.prefijo)} ${gr.unidadMostrada}`.trim() : 'sin dato' }
    })
    const paso = col0.w / n
    return { xPx: col0.x + (i + 0.5) * paso, encabezado: `Armónico ${m.barras.categorias[i]}`, filas }
  }
  let x = deValor(xPx, g.x, g.escalaX, col0.x, col0.x + col0.w)
  let px = xPx
  const visibles = m.trazas.filter((t) => !v.ocultas.has(t.clave))
  // Con pocos puntos (un barrido grueso) la cruz se pega al punto de datos más cercano: lo que se lee es un dato y no una interpolación.
  const ref = visibles[0]
  if (ref) {
    const i = indiceMasCercano(ref.x, x, g.escalaX)
    if (i >= 0) {
      const pi = aPixel(ref.x[i], g.x, g.escalaX, col0.x, col0.x + col0.w)
      const vecino = ref.x[i + 1] ?? ref.x[i - 1]
      const sepa = vecino === undefined ? 0 : Math.abs(aPixel(vecino, g.x, g.escalaX, col0.x, col0.x + col0.w) - pi)
      if (sepa > DISPERSOS_PX * d && Math.abs(pi - xPx) <= PEGAR_PX * d) {
        x = ref.x[i]
        px = pi
      }
    }
  }
  const filas: FilaLectura[] = []
  for (const t of visibles) {
    const val = interpolar(t.x, t.y, x, g.escalaX)
    if (Number.isNaN(val)) continue
    const pan = g.paneles[Math.min(g.paneles.length - 1, t.panel)]
    const i = m.trazas.indexOf(t)
    const gr = pan.grupos.find((k) => k.trazas.includes(i))
    const yPx = gr ? pan.y0 + aPixel(val, gr.dominio, 'lin', pan.col.y + pan.col.h, pan.col.y) : null
    const texto = gr ? `${valorEnPrefijo(val, gr.prefijo)} ${gr.unidadMostrada}`.trim() : textoMarca(val, t.unidad)
    filas.push({ clave: t.clave, etiqueta: t.etiqueta, tono: t.tono, panel: t.panel, yPx, valor: val, texto })
  }
  const r = g.rotuloX
  const xTexto = r.compacto ? textoMarca(x, r.unidad) : `${valorEnPrefijo(x, r.prefijo)} ${r.unidad}`.trim()
  return { xPx: px, encabezado: `${NOMBRE_CORTO(m.ejeX.nombre || 'x')} = ${xTexto}`, filas }
}

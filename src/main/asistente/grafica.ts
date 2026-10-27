import { figuraPorOmision, type Tema } from '../../compartido/ajustes'
import type { AnalisisDoc } from '../../compartido/analisis/config'
import { aspectoDeGrafica, trazasDeGrafica } from '../../compartido/grafica/aspecto'
import { modeloDeResultado } from '../../renderer/src/analisis/modeloGrafica'
import type { ResultadoMapeado } from '../../compartido/analisis/resultados'
import { armarContexto } from '../../renderer/src/analisis/contexto'
import { resolverTrazas, type EntradaAnalisis } from '../../renderer/src/edicion/analisisDoc'
import type { SesionSinVentana } from '../../renderer/src/sinVentana/sesion'
import { aplicarPreajuste, type NombrePreajuste } from '../../renderer/src/ui/exportar/preajustes'
import { figuraDeGrafica } from '../../renderer/src/ui/grafica/figura'
import { VISTA_COMPLETA } from '../../renderer/src/ui/grafica/modelo'
import { svgDeFigura } from '../../renderer/src/ui/osciloscopio/exportarFigura'

/** La gráfica de un análisis como figura de exportar, sin ventana: la misma función de dibujo que el diálogo de exportar. */

export type PreajusteGrafica = 'pantalla' | 'informe'
export const PREAJUSTES_GRAFICA: readonly PreajusteGrafica[] = ['pantalla', 'informe']
/** «Pantalla» es el preajuste «Instrumento» del diálogo (la gráfica como se ve en la aplicación); «Informe» es el de artículo. */
const PREAJUSTE_DE: Record<PreajusteGrafica, NombrePreajuste> = { pantalla: 'instrumento', informe: 'informe' }

export interface FiguraGrafica {
  svg: string
  anchoMm: number
  altoMm: number
  /** Medidas en píxeles de la figura a escala 1. */
  ancho: number
  alto: number
}

export type ResultadoFigura = { ok: true; figura: FiguraGrafica; titulo: string } | { ok: false; motivo: string }

/** Lo que se pide graficar. `trazas` y `corrientes` cambian las de un análisis guardado; `titulo` y `subtitulo` reemplazan
 * los de omisión (un subtítulo vacío queda vacío, como en el diálogo de exportar). */
export interface PedidoGrafica {
  analisis?: string
  entrada?: EntradaAnalisis
  trazas?: string[]
  corrientes?: string[]
  titulo?: string
  subtitulo?: string
}

/** Qué análisis se pide: uno guardado en el documento (por nombre) o uno nuevo descrito como en `analizar`. */
export function analisisPedido(sesion: SesionSinVentana, pedido: PedidoGrafica): { ok: true; a: AnalisisDoc; etiquetas: ReadonlyMap<number, string> | undefined } | { ok: false; motivo: string } {
  let a: AnalisisDoc
  let etiquetas: ReadonlyMap<number, string> | undefined
  if (pedido.analisis !== undefined) {
    const k = pedido.analisis.trim().toLowerCase()
    const g = Object.values(sesion.doc.analisis ?? {}).find((x) => x.nombre.trim().toLowerCase() === k)
    if (!g) return { ok: false, motivo: `El circuito no tiene un análisis guardado llamado «${pedido.analisis.slice(0, 40)}».` }
    a = g
    if (pedido.trazas || pedido.corrientes) {
      const t = resolverTrazas(sesion.nucleo, pedido.trazas, pedido.corrientes)
      if ('motivo' in t) return { ok: false, motivo: t.motivo }
      a = { ...g, trazas: { redes: t.redes, piezas: t.piezas } }
      etiquetas = t.etiquetas
    }
  } else if (pedido.entrada) {
    const arm = sesion.armarAnalisis(pedido.entrada)
    if (!arm.ok) return { ok: false, motivo: arm.motivo }
    a = arm.analisis
    etiquetas = arm.etiquetas
  } else return { ok: false, motivo: 'Indica «analisis» (uno guardado en el circuito) o «config» con el análisis que se grafica.' }
  return { ok: true, a, etiquetas }
}

/** La gráfica de un análisis pedido como figura. */
export async function figuraDeAnalisis(sesion: SesionSinVentana, pedido: PedidoGrafica, preajuste: PreajusteGrafica, tema: Tema): Promise<ResultadoFigura> {
  const p = analisisPedido(sesion, pedido)
  if (!p.ok) return p
  const { a, etiquetas } = p
  const r = await sesion.ejecutarAnalisis(a, etiquetas)
  if (!r.ok) return { ok: false, motivo: r.error }
  const mapeado = soloLasPedidas(r.mapeado, a, sesion)
  if (!mapeado) return { ok: false, motivo: 'Ninguna de las trazas pedidas salió en el análisis.' }
  const estilo = aplicarPreajuste('grafica', PREAJUSTE_DE[preajuste], aspectoDeGrafica(a.grafica))
  const modelo = modeloDeResultado(mapeado, trazasDeGrafica(a.grafica), { dbAbsoluto: estilo.aspecto.dbAbsoluto === true, informe: estilo.aspecto.informe === true })
  if (!modelo) return { ok: false, motivo: 'Este análisis no da una gráfica (el punto de operación son cifras): usa analizar.' }
  const op = { ...figuraPorOmision(), tema }
  const titulo = pedido.titulo ?? a.nombre
  const subtitulo = pedido.subtitulo ?? (modelo.tipo === 'barras' ? 'Armónicos de la señal' : `Datos de ${a.nombre}`)
  const fig = figuraDeGrafica({ adornos: estilo.adornos, titulo, subtitulo, modelo, vista: VISTA_COMPLETA, aspecto: estilo.aspecto }, op, tema)
  const lamina = await svgDeFigura(fig, titulo)
  return { ok: true, titulo, figura: { svg: lamina.svg, anchoMm: lamina.anchoMm, altoMm: lamina.altoMm, ancho: fig.ancho, alto: fig.alto } }
}

/** Con trazas elegidas, solo ellas: las redes con nombre que el análisis agrega por omisión no entran en la figura (una red
 * sin excitar da cientos de dB negativos y aplasta la escala). Sin trazas elegidas, todo lo que dio el análisis. */
export function soloLasPedidas(m: ResultadoMapeado, a: AnalisisDoc, sesion: SesionSinVentana): ResultadoMapeado | null {
  const t = a.trazas
  if (!t || (t.redes.length === 0 && t.piezas.length === 0)) return m
  const c = armarContexto(sesion.doc, sesion.nucleo.lib, sesion.nucleo.con)
  if (!c.ok) return m
  const nombres = new Set(t.redes)
  const piezas = new Set(t.piezas)
  const ids = new Set([...c.ctx.redes.filter((r) => nombres.has(r.nombre)).map((r) => `v:${r.nodo}`), ...c.ctx.corrientes.filter((x) => piezas.has(x.pieza)).map((x) => `i:${x.elemento}`)])
  const corridas = m.corridas.map((q) => ({ ...q, series: q.series.filter((s) => ids.has(s.id)), ...(q.fourier ? { fourier: q.fourier.filter((s) => ids.has(s.id)) } : {}) }))
  const quedan = corridas.some((q) => q.series.length > 0 || (q.fourier?.length ?? 0) > 0)
  return quedan ? { ...m, corridas } : null
}

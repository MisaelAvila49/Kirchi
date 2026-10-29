import type { OpcionesFigura, Tema, TonoFigura } from '../../../../compartido/ajustes'
import type { Anotaciones } from '../../../../compartido/grafica/anotaciones'
import { conTamañoGeneral, type AspectoGrafica, type AspectoTraza } from '../../../../compartido/grafica/aspecto'
import { celdaDeTexto } from '../osciloscopio/exportarCaptura'
import { MARGEN_MARCO, marcoDoble, PILAS_POR_OMISION, tipografiaDeFigura, type FiguraCaptura, type PilasFuentes } from '../osciloscopio/figura'
import type { Adornos } from '../exportar/preajustes'
import { rangoEfectivo, type RangoExportar } from '../exportar/rango'
import { dibujarGrafica, dibujarLeyenda, geometriaGrafica } from './dibujo'
import { trazasUnicas, type ModeloGrafica, type VistaGrafica } from './modelo'
import { coloresGrafica, temaEfectivo } from './paleta'
import { dibujarNotas, letraDeTitulo, medirTexto } from '../exportar/editor/dibujoNotas'
import type { GeometriaFigura } from '../exportar/editor/geometria'
import { geometriaDeFigura } from './geometriaFigura'

/**
 * Figura de una gráfica de análisis para exportar: una sola función de dibujo sirve a la vista previa, el PNG, el SVG y el PDF (`ContextoSvg`).
 */

export const ANCHO_FIGURA_GRAFICA = 900
const ALTO_UN_PANEL = 400
const ALTO_DOS_PANELES = 600
const ALTO_TITULO = 34
/** Lo que ocupa el renglón del subtítulo dentro de `ALTO_TITULO`. */
const ALTO_SUBTITULO = 15

export interface EntradaFigura {
  /** Lo que lleva la figura alrededor (título, leyenda, marco, resplandor); sin él, título y leyenda como siempre. */
  adornos?: Adornos
  titulo: string
  /** Una línea bajo el título (qué análisis y con qué configuración). */
  subtitulo: string
  modelo: ModeloGrafica
  vista: VistaGrafica
  aspecto: AspectoGrafica
  /** El tramo del eje horizontal que se exporta (imágenes y CSV); ausente, lo que muestra la vista. */
  rango?: RangoExportar | null
  /** Textos, flechas, etiquetas de valor y estilos de ejes del editor de exportar. */
  anotaciones?: Anotaciones
  /** Guarda las anotaciones con el análisis de la gráfica; devuelve el motivo si no se pudo. Solo lo usa el editor. */
  onGuardarNotas?(a: Anotaciones): string | null
}

/** La vista con el eje horizontal en el tramo elegido (si recorta algo). */
export function vistaConRango(m: ModeloGrafica, v: VistaGrafica, rango: RangoExportar | null | undefined): VistaGrafica {
  const r = m.tipo === 'lineas' ? rangoEfectivo(rango, m.ejeX.datos) : null
  return r ? { ...v, x: r } : v
}

/**
 * Modelo con lo que el diálogo cambió de cada traza. Las trazas de una misma clave (magnitud y fase de un Bode) comparten lo elegido.
 */
export function modeloConTrazas(m: ModeloGrafica, cambios: Readonly<Record<string, Partial<AspectoTraza>>>): ModeloGrafica {
  if (m.tipo === 'barras' && m.barras) {
    return { ...m, barras: { ...m.barras, series: m.barras.series.map((s) => ({ ...s, tono: cambios[s.clave]?.color ?? s.tono })) } }
  }
  return {
    ...m,
    trazas: m.trazas.map((t) => {
      const c = Object.hasOwn(cambios, t.clave) ? cambios[t.clave] : undefined
      if (!c) return t
      return { ...t, lado: c.lado ?? t.lado, tono: c.color ?? t.tono, ...('grosor' in c ? { grosor: c.grosor } : {}), ...('prefijo' in c ? { prefijo: c.prefijo } : {}), ...('decimales' in c ? { decimales: c.decimales } : {}), ...('rango' in c ? { rango: c.rango } : {}) }
    })
  }
}

const items = (m: ModeloGrafica, v: VistaGrafica) =>
  m.tipo === 'barras' && m.barras
    ? m.barras.series.map((s) => ({ etiqueta: s.etiqueta, tono: s.tono }))
    : trazasUnicas(m.trazas.filter((t) => !v.ocultas.has(t.clave))).map((t) => ({ etiqueta: t.etiqueta, tono: t.tono, discontinua: t.discontinua }))

export { conTamañoGeneral }

export function figuraDeGrafica(e: EntradaFigura, op: OpcionesFigura, actual: Tema, pilas: PilasFuentes = PILAS_POR_OMISION): FiguraCaptura {
  // Un solo tema para fondo, rejilla y escalas: el del aspecto; claro es hoja blanca y oscuro conserva el fondo del lienzo oscuro.
  const tema = temaEfectivo(e.aspecto.tema, actual)
  const c = coloresGrafica(tema, tema === 'claro')
  const tip = tipografiaDeFigura(op, pilas)
  const modelo = e.modelo
  const vista = vistaConRango(modelo, e.vista, e.rango)
  // El tamaño general de la letra de la figura llega a los ejes que no traen el suyo (y el reparto crece con él).
  const aspecto: AspectoGrafica = conTamañoGeneral(e.aspecto, tip.px)
  const ad = e.adornos
  const [conTitulo, conLeyenda, m] = [ad ? ad.titulo : true, ad ? ad.leyenda : true, ad?.marco ? MARGEN_MARCO : 0]
  const Wg = ANCHO_FIGURA_GRAFICA - 2 * m
  const lista = conLeyenda ? items(modelo, vista) : []
  // «Instrumento» (marco): bajo la gráfica, la franja con el nombre del análisis y los nombres de las trazas, como la franja de escalas de la pantalla.
  const enFranja = ad?.marco && !conLeyenda ? items(modelo, vista) : []
  const altoGrafica = modelo.paneles.length > 1 && aspecto.informe ? ALTO_DOS_PANELES : ALTO_UN_PANEL
  // La leyenda: se estima cuántos renglones ocupa (cada elemento mide su texto más 30 px) para reservar el alto.
  const anot = e.anotaciones
  const tTit = letraDeTitulo(anot?.estilos.titulo, { texto: e.titulo, px: tip.px + 3, negrita: true, color: c.letra('negro') }, c.letra)
  const tSub = letraDeTitulo(anot?.estilos.subtitulo, { texto: e.subtitulo, px: tip.px, negrita: false, color: c.texto }, c.letra)
  // Un subtítulo en blanco cierra su renglón: el título queda solo y la gráfica sube.
  const sinSubtitulo = tSub.texto.trim() === ''
  const hTitulo = conTitulo ? (sinSubtitulo ? ALTO_TITULO - ALTO_SUBTITULO : ALTO_TITULO) : 0
  const anchoLeyenda = Wg - 16
  const renglonesDe = (l: typeof lista) => {
    let n = l.length > 0 ? 1 : 0
    let usado = 0
    for (const it of l) {
      const w = it.etiqueta.length * tip.px * 0.62 + 30
      if (usado > 0 && usado + w > anchoLeyenda) {
        n++
        usado = 0
      }
      usado += w
    }
    return n
  }
  const renglones = renglonesDe(lista)
  const altoLeyenda = renglones * 18 + (renglones > 0 ? 8 : 0)
  const hFranja = ad?.marco ? 22 + renglonesDe(enFranja) * 18 + 6 : 0
  const alto = 2 * m + hTitulo + altoLeyenda + altoGrafica + hFranja
  const oy = m + hTitulo + altoLeyenda
  let guardada: GeometriaFigura | undefined
  /** La geometría se arma una vez por figura: el dibujo y el editor la piden varias veces. */
  const geometria = (): GeometriaFigura => (guardada ??= armarGeometria())
  const armarGeometria = (): GeometriaFigura => {
    const g = geometriaGrafica(modelo, vista, aspecto, Wg, altoGrafica, 1, anot?.ejes)
    const caja = (x: number, y: number, t: { texto: string; px: number }) => ({ x, y: y - t.px * 0.7, w: medirTexto(t.texto, t.px, true), h: t.px * 1.4 })
    return geometriaDeFigura({
      modelo,
      g,
      ocultas: vista.ocultas,
      ox: m,
      oy,
      ancho: ANCHO_FIGURA_GRAFICA,
      alto,
      decimalesEtiquetas: aspecto.decimalesEtiquetas,
      titulos: conTitulo ? { titulo: caja(m + 8, m + 12, tTit), subtitulo: sinSubtitulo ? undefined : caja(m + 8, m + 27, tSub) } : undefined
    })
  }
  return {
    ancho: ANCHO_FIGURA_GRAFICA,
    alto,
    fondo: c.fondo,
    geometria,
    ...(modelo.tipo === 'lineas'
      ? (() => {
          const g = geometriaGrafica(modelo, vista, aspecto, Wg, altoGrafica, 1, anot?.ejes)
          const col = g.paneles[0].col
          return { eje: { mapa: { px0: m + col.x, px1: m + col.x + col.w, dom: g.x, escala: g.escalaX }, total: modelo.ejeX.datos, unidad: modelo.ejeX.unidad, prefijo: aspecto.prefijoX } }
        })()
      : {}),
    dibujar(ctx, k) {
      ctx.fillStyle = c.fondo
      ctx.fillRect(0, 0, ANCHO_FIGURA_GRAFICA * k, alto * k)
      if (ad?.marco) marcoDoble(ctx, ANCHO_FIGURA_GRAFICA, alto, k, c.ejes)
      if (conTitulo) {
        ctx.textBaseline = 'middle'
        ctx.textAlign = 'left'
        ctx.fillStyle = tTit.color
        ctx.font = `${tTit.peso} ${tTit.px * k}px ${tip.titulo}`
        ctx.fillText(tTit.texto, (m + 8) * k, (m + 12) * k)
        ctx.fillStyle = tSub.color
        ctx.font = `${tSub.peso === 650 ? '650 ' : ''}${tSub.px * k}px ${tip.titulo}`
        if (!sinSubtitulo) ctx.fillText(tSub.texto, (m + 8) * k, (m + 27) * k)
      }
      ctx.save()
      ctx.translate(m * k, (m + hTitulo + altoLeyenda) * k)
      dibujarGrafica(ctx, modelo, vista, aspecto, c, Wg * k, altoGrafica * k, { dpr: k, tipografia: tip, sinReticula: !aspecto.rejilla, sinEjes: !op.ejes, resplandor: ad?.resplandor, ejes: anot?.ejes })
      ctx.restore()
      if (ad?.marco) {
        const y0 = m + hTitulo + altoLeyenda + altoGrafica
        ctx.textBaseline = 'middle'
        ctx.textAlign = 'left'
        ctx.fillStyle = c.texto
        ctx.font = `${(tip.px + 1) * k}px ${tip.cifras}`
        ctx.fillText(`${e.titulo}${sinSubtitulo ? '' : ` · ${e.subtitulo}`}`, (m + 8) * k, (y0 + 12) * k)
        if (enFranja.length > 0) dibujarLeyenda(ctx, enFranja, (m + 8) * k, (y0 + 22) * k, anchoLeyenda * k, c, tip, k, aspecto.grosor)
      }
      // La leyenda va bajo el subtítulo, como en un informe.
      if (lista.length > 0) dibujarLeyenda(ctx, lista, (m + 8) * k, (m + hTitulo + 2) * k, anchoLeyenda * k, c, tip, k, aspecto.grosor)
      if (anot && (anot.textos.length > 0 || anot.flechas.length > 0 || anot.etiquetas.length > 0)) dibujarNotas(ctx, k, geometria(), anot, { fondo: c.fondo, texto: c.texto, letra: c.letra }, tip)
    }
  }
}

// ---------- CSV ----------

const num = (v: number): string => (Number.isFinite(v) ? String(Number(v.toPrecision(9))) : '')

/** Dos arreglos con los mismos valores (se comparan por tamaño y a saltos: bastan para saber si dos trazas comparten eje). */
function mismoEje(a: Float64Array, b: Float64Array): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  const paso = Math.max(1, Math.floor(a.length / 64))
  for (let i = 0; i < a.length; i += paso) if (a[i] !== b[i]) return false
  return a[a.length - 1] === b[b.length - 1]
}

/**
 * Datos de la gráfica como CSV: comentarios y un bloque por cada eje horizontal distinto. Punto decimal, coma de separador, textos a salvo de hojas de cálculo.
 */
export function csvDeGrafica(titulo: string, subtitulo: string, m: ModeloGrafica, v: VistaGrafica, rango?: RangoExportar | null): string {
  const salida: string[] = [celdaDeTexto(`# Kirchi · ${titulo}`), celdaDeTexto(`# ${subtitulo}`)]
  if (m.tipo === 'barras' && m.barras) {
    const b = m.barras
    salida.push(celdaDeTexto(`# ${b.nota}`))
    salida.push(['n', 'f (Hz)', ...b.series.map((s) => `${s.etiqueta} (${s.unidad})`)].map(celdaDeTexto).join(','))
    b.categorias.forEach((_, i) => salida.push([b.categorias[i], num(b.frecuencias[i]), ...b.series.map((s) => num(s.valores[i]))].join(',')))
    return `${salida.join('\n')}\n`
  }
  const trazas = m.trazas.filter((t) => !v.ocultas.has(t.clave))
  const recorte = rangoEfectivo(rango, m.ejeX.datos)
  if (recorte) salida.push(celdaDeTexto(`# Tramo exportado: de ${num(recorte.min)} a ${num(recorte.max)} ${m.ejeX.unidad}`.trimEnd()))
  // Con recorte: solo los renglones cuyo valor del eje está en el tramo (el borde cuenta).
  const dentro = (x: number) => !recorte || (x >= recorte.min && x <= recorte.max)
  const bloques: (typeof trazas)[] = []
  for (const t of trazas) {
    const b = bloques.find((x) => mismoEje(x[0].x, t.x))
    if (b) b.push(t)
    else bloques.push([t])
  }
  const nombreX = `${m.ejeX.nombre || 'x'}${m.ejeX.unidad ? ` (${m.ejeX.unidad})` : ''}`
  bloques.forEach((b, k) => {
    if (k > 0) salida.push('')
    const ref = b[0]
    if (bloques.length > 1) salida.push(celdaDeTexto(`# Bloque ${k + 1}: ${b.map((t) => t.etiqueta).join('; ')}`))
    salida.push([nombreX, ...b.map((t) => `${t.etiqueta} (${t.unidad})`)].map(celdaDeTexto).join(','))
    for (let i = 0; i < ref.x.length; i++) if (dentro(ref.x[i])) salida.push([num(ref.x[i]), ...b.map((t) => num(t.y[i]))].join(','))
  })
  if (trazas.length === 0) salida.push(celdaDeTexto('# Sin trazas visibles: no hay datos que exportar.'))
  return `${salida.join('\n')}\n`
}

/** Cuántos renglones de datos tiene un CSV (para decir «N puntos» en la vista previa). */
export function filasDeGrafica(m: ModeloGrafica, v: VistaGrafica, rango?: RangoExportar | null): number {
  if (m.tipo === 'barras') return m.barras?.categorias.length ?? 0
  const r = rangoEfectivo(rango, m.ejeX.datos)
  const cuenta = (x: Float64Array) => (r ? x.reduce((n, q) => n + (q >= r.min && q <= r.max ? 1 : 0), 0) : x.length)
  return Math.max(0, ...m.trazas.filter((t) => !v.ocultas.has(t.clave)).map((t) => cuenta(t.x)))
}

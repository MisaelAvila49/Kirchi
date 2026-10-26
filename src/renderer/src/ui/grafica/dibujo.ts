import type { TonoFigura } from '../../../../compartido/ajustes'
import { tamTextoMax, type EstiloEje } from '../../../../compartido/grafica/anotaciones'
import { escalaDeTexto, TEXTO_TAM_BASE, type AspectoGrafica, type Decimales, type LadoEjeY, type PesoTexto, type PrefijoEje } from '../../../../compartido/grafica/aspecto'
import { decimalesPorOmision, etiquetaEnPrefijo, rotuloDeEje } from '../../../../compartido/grafica/ejes'
import { marcasLineales, marcasLog, subdivisionesLineales, subdivisionesLog, textoMarca } from '../../../../compartido/grafica/ticks'
import { TIPOGRAFIA_POR_OMISION, type Lienzo2D, type Tipografia } from '../osciloscopio/dibujar'
import { anchoDeColumna, colocar, margenesVerticales, type Colocacion, type EntradaColocacion } from './colocacion'
import type { ModeloGrafica, TrazaGrafica, VistaGrafica } from './modelo'
import type { ColoresGrafica } from './paleta'
import type { LecturaEn } from './lectura'
import { dominioBonito, dominioEnDivisiones, ticksDeDivisiones } from './divisiones'
import { aPixel, deltaCursores, interpolar, zoomCaja, type Dominio, type Escala } from './vista'
import { conAlfa } from '../exportar/color'

/**
 * Dibujo de una gráfica de datos, la misma función para pantalla, PNG, SVG y PDF (`ContextoSvg`). `geometriaGrafica` calcula dónde cae todo sin dibujar y lo usan los gestos del ratón.
 */

export const COLUMNA_Y = 56
export const INICIO_IZQ = 4
export const AIRE_DER = 38
export const BANDA_X = 40
export const ARRIBA_LIBRE = 24
export const ABAJO_LIBRE = 8

export interface GrupoEje {
  unidad: string
  lado: LadoEjeY
  /** Índices en `modelo.trazas`. */
  trazas: number[]
  /** El rango de los datos visibles, con aire. */
  auto: Dominio
  /** El rango que se ve (el automático con el zoom del lector). */
  dominio: Dominio
  /** El tono de su única traza; con varias, null (las cifras van en gris). */
  tono: TonoFigura | null
  /** El prefijo con que se escriben sus números y la unidad rotulada con él (mV, V): independientes de la escala. */
  prefijo: PrefijoEje
  unidadMostrada: string
  /** Decimales elegidos para sus cifras; ausente, 1. */
  decimales?: Decimales
  /** Pantalla «Instrumento»: el dominio está repartido en `DIVISIONES_Y` divisiones iguales y las marcas caen en ellas. */
  divisiones?: boolean
}

export interface PanelGeom {
  /** Dónde empieza el panel en el lienzo (px de dispositivo) y cuánto mide. */
  y0: number
  alto: number
  col: Colocacion
  grupos: GrupoEje[]
  titulo: string
}

/** La pantalla del estilo «Instrumento»: ocho divisiones verticales y diez horizontales, como el osciloscopio. */
export const DIVISIONES_Y = 8
export const DIVISIONES_X = 10
const LETRAS_EJE = 'ABCDEFGH'
/** Cuánto pueden pasar los datos del borde de la pantalla (2 % del rango) antes de pedir otra división. */
const HOLGURA_DIVISIONES = 0.02

export interface Geometria {
  W: number
  H: number
  dpr: number
  paneles: PanelGeom[]
  /** Se dibuja como la pantalla del osciloscopio (una sola pantalla con divisiones fijas), no como un informe. */
  instrumento: boolean
  /** El eje horizontal (lineal) está repartido en `DIVISIONES_X` divisiones iguales. */
  divisionesX: boolean
  x: Dominio
  escalaX: Escala
  /** Cómo se escriben los números del eje horizontal: `compacto` (eje logarítmico sin prefijo elegido) los deja con su prefijo de siempre (1 k, 10 k). */
  rotuloX: { prefijo: PrefijoEje; unidad: string; compacto: boolean; decimales?: Decimales }
}

const visibles = (m: ModeloGrafica, v: VistaGrafica): number[] => m.trazas.flatMap((t, i) => (v.ocultas.has(t.clave) ? [] : [i]))

/** El dominio horizontal que se ve: el del zoom o el de los datos; un eje logarítmico con datos no positivos pasa a lineal. */
export function escalaYDominioX(m: ModeloGrafica, v: VistaGrafica): { escala: Escala; x: Dominio } {
  const datos = m.ejeX.datos
  const escala: Escala = m.ejeX.escala === 'log' && datos.min > 0 && (v.x === null || v.x.min > 0) ? 'log' : 'lin'
  return { escala, x: v.x ?? datos }
}

/** Un 1 % de aire para que la curva no corra sobre el borde y, de ahí, hasta la siguiente marca redonda (±140 mV da ±150 mV). */
function conAireYBonito(d: Dominio): Dominio {
  const aire = 0.01 * (d.max - d.min)
  return dominioBonito({ min: d.min - aire, max: d.max + aire })
}

function rangoAuto(m: ModeloGrafica, idx: readonly number[], x: Dominio, conAire = true): Dominio {
  let lo = Infinity
  let hi = -Infinity
  for (const i of idx) {
    const t = m.trazas[i]
    for (let k = 0; k < t.x.length; k++) {
      const xv = t.x[k]
      if (xv < x.min || xv > x.max) continue
      const yv = t.y[k]
      if (!Number.isFinite(yv)) continue
      if (yv < lo) lo = yv
      if (yv > hi) hi = yv
    }
  }
  if (!Number.isFinite(lo)) return { min: 0, max: 1 }
  if (hi - lo < 1e-30) {
    const a = Math.abs(lo) || 1
    return { min: lo - 0.1 * a, max: hi + 0.1 * a }
  }
  const aire = conAire ? 0.05 * (hi - lo) : 0
  return { min: lo - aire, max: hi + aire }
}

/** Los textos que la columna de un eje vertical tiene que alojar: sus cifras y el título de su unidad (o el que escribió el lector). */
export function textosDeColumna(m: ModeloGrafica, gr: GrupoEje, k: number, n: number, instrumento: boolean, alto: number, dpr: number, ejes?: Readonly<Record<string, EstiloEje>>): string[] {
  const ticks = marcasY(gr.dominio, alto, dpr, gr.divisiones)
  const paso = ticks.length > 1 ? ticks[1] - ticks[0] : Math.abs(ticks[0] ?? 0) || 1
  const titulo = estiloDeEjeY(ejes, m, gr)?.titulo ?? (instrumento && n > 1 ? `${LETRAS_EJE[k] ?? ''} ${gr.unidadMostrada}`.trim() : gr.unidadMostrada)
  return [...ticks.map((t) => etiquetaEnPrefijo(t, gr.prefijo, paso, gr.decimales, 1)), titulo]
}

export function geometriaGrafica(m: ModeloGrafica, v: VistaGrafica, a: AspectoGrafica, W: number, H: number, dpr: number, ejes?: Readonly<Record<string, EstiloEje>>): Geometria {
  const base = m.tipo === 'barras' ? { escala: 'lin' as Escala, x: { min: 0, max: Math.max(1, m.barras?.categorias.length ?? 1) } } : escalaYDominioX(m, v)
  const escala = base.escala
  // «Instrumento» (de omisión): todas las trazas en una sola pantalla y el eje horizontal lineal en diez divisiones; «Informe» apila los paneles.
  const instrumento = m.tipo === 'lineas' && !a.informe
  const x = a.rangoX && m.tipo === 'lineas' && escala === 'lin' && v.x === null ? { min: a.rangoX.min, max: a.rangoX.max } : instrumento && escala === 'lin' && v.x === null ? dominioEnDivisiones(base.x, DIVISIONES_X, m.ejeX.unidad) : !instrumento && m.tipo === 'lineas' && escala === 'lin' && v.x === null ? dominioBonito(base.x) : base.x
  const n = instrumento ? 1 : Math.max(1, m.paneles.length)
  const vis = visibles(m, v)
  // Los grupos de cada panel: una unidad en un lado es un eje.
  const grupos: GrupoEje[][] = Array.from({ length: n }, () => [])
  if (m.tipo === 'barras' && m.barras) {
    const max = Math.max(0, ...m.barras.series.flatMap((s) => Array.from(s.valores)).filter(Number.isFinite))
    const dominio = { min: 0, max: max > 0 ? max * 1.1 : 1 }
    const rot = rotuloDeEje(m.barras.unidad.includes(' ') ? '' : m.barras.unidad, dominio.max, null)
    grupos[0].push({ unidad: m.barras.unidad, lado: 'izquierda', trazas: [], auto: dominio, dominio, tono: m.barras.series.length === 1 ? m.barras.series[0].tono : null, prefijo: rot.prefijo, unidadMostrada: m.barras.unidad })
  } else {
    const claves = new Map<string, GrupoEje>()
    for (const i of vis) {
      const t = m.trazas[i]
      const k = `${instrumento ? 0 : t.panel}|${t.unidad}|${t.lado}`
      let g = claves.get(k)
      if (!g) {
        g = { unidad: t.unidad, lado: t.lado, trazas: [], auto: { min: 0, max: 1 }, dominio: { min: 0, max: 1 }, tono: t.tono, prefijo: 'base', unidadMostrada: t.unidad }
        claves.set(k, g)
        grupos[Math.min(n - 1, t.panel)].push(g)
      } else if (g.tono !== t.tono) g.tono = null
      g.trazas.push(i)
    }
    for (const [p, lista] of grupos.entries()) {
      const f = v.y[p] ?? null
      for (const g of lista) {
        // Un rango escrito a mano manda sobre el automático (y sobre las divisiones fijas de «Instrumento»).
        const rango = g.trazas.map((i) => m.trazas[i].rango).find((q) => q)
        g.auto = rango ? { min: rango.min, max: rango.max } : instrumento ? rangoAuto(m, g.trazas, x, false) : conAireYBonito(rangoAuto(m, g.trazas, x, false))
        g.dominio = f ? zoomCaja(g.auto, 'lin', f[0], f[1]) : instrumento && !rango ? dominioEnDivisiones(g.auto, DIVISIONES_Y, g.unidad, HOLGURA_DIVISIONES) : g.auto
        g.divisiones = instrumento && !f && !rango
        const elegido = g.trazas.map((i) => m.trazas[i].prefijo).find((q) => q != null) ?? null
        const rot = rotuloDeEje(g.unidad, Math.max(Math.abs(g.dominio.min), Math.abs(g.dominio.max)), elegido)
        g.prefijo = rot.prefijo
        g.unidadMostrada = rot.unidad
        const dec = g.trazas.map((i) => m.trazas[i].decimales).find((q) => q !== undefined)
        if (dec !== undefined) g.decimales = dec
      }
    }
  }
  // El alto se reparte: lo fijo (márgenes y banda) de cada panel y el resto por igual.
  const esc = escalaDeTexto(tamTextoMax(a.textoTam, ejes))
  const ejeDe = (p: number): EntradaColocacion['ejeX'] => (a.ejeX === 'centro' ? 'centro' : a.ejeX === 'abajo' ? (p === n - 1 ? 'abajo' : 'ninguno') : p === 0 ? 'arriba' : 'ninguno')
  const fijos = Array.from({ length: n }, (_, p) => {
    const mv = margenesVerticales({ ejeX: ejeDe(p), banda: BANDA_X * esc, arribaLibre: ARRIBA_LIBRE * esc, abajoLibre: ABAJO_LIBRE })
    return (mv.arriba + mv.abajo) * dpr
  })
  const libre = Math.max(n, H - fijos.reduce((s, f) => s + f, 0))
  let y0 = 0
  const paneles: PanelGeom[] = Array.from({ length: n }, (_, p) => {
    const alto = Math.round(libre / n + fijos[p])
    // Cada columna mide lo que piden sus cifras (con la letra, los decimales y el prefijo en uso) y el título de su unidad.
    const anchos = grupos[p].map((gr, k) => anchoDeColumna(textosDeColumna(m, gr, k, grupos[p].length, instrumento, alto, dpr, ejes), tamTextoMax(a.textoTam, ejes) ?? TEXTO_TAM_BASE))
    const col = colocar({ W, H: alto, dpr, lados: grupos[p].map((g) => g.lado), ejeX: ejeDe(p), anchos, columna: COLUMNA_Y * esc, inicioIzq: INICIO_IZQ, aireIzq: INICIO_IZQ, aireDer: AIRE_DER * esc, banda: BANDA_X * esc, arribaLibre: ARRIBA_LIBRE * esc, abajoLibre: ABAJO_LIBRE })
    const g: PanelGeom = { y0, alto, col, grupos: grupos[p], titulo: instrumento ? '' : (m.paneles[p]?.titulo ?? '') }
    y0 += alto
    return g
  })
  const rx = rotuloDeEje(m.ejeX.unidad, Math.max(Math.abs(x.min), Math.abs(x.max)), a.prefijoX)
  const compacto = escala === 'log' && a.prefijoX === null
  return { W, H, dpr, paneles, instrumento, divisionesX: instrumento && escala === 'lin' && v.x === null && !a.rangoX, x, escalaX: escala, rotuloX: { ...(compacto ? { prefijo: 'base' as const, unidad: m.ejeX.unidad } : rx), compacto, ...(a.decimalesX !== undefined ? { decimales: a.decimalesX } : {}) } }
}

// ---------- Dibujo ----------

export interface OpcionesGrafica {
  dpr: number
  tipografia?: Tipografia
  /** Sin retícula (la rejilla apagada al exportar). */
  sinReticula?: boolean
  /** Sin ejes con sus escalas (al exportar): solo el fondo, la retícula y las trazas. */
  sinEjes?: boolean
  /** El resplandor de fósforo: cada traza lleva debajo un halo ancho y translúcido. */
  resplandor?: boolean
  /** El cursor resaltado (el puntero encima o arrastrado). */
  cursorResaltado?: 0 | 1 | null
  /** Las asas para mover los ejes (solo en pantalla: la figura exportada no las lleva). */
  asas?: boolean
  /** Lo que el puntero lee ahora (la cruz y los valores de cada traza); solo en pantalla. */
  lectura?: LecturaEn | null
  /** La lectura de los cursores con todos sus datos (los dos valores de cada uno y la frecuencia); sin esto, solo la diferencia. */
  detalleCursores?: boolean
  /** El estilo propio de cada eje (título, tono, grosor y tamaño de sus números): `x` y, por traza, su clave. Solo al exportar. */
  ejes?: Readonly<Record<string, EstiloEje>>
}

const fuenteTitulo = (t: Tipografia, d: number, peso = 500) => `${peso} ${Math.round(t.px * d)}px ${t.titulo}`
const fuenteCifras = (t: Tipografia, d: number, peso = 400) => `${peso === 400 ? '' : `${peso} `}${Math.round(t.px * d)}px ${t.cifras}`

function marcasX(g: Geometria, m: ModeloGrafica, ancho: number): { valor: number; mayor: boolean; etiquetar: boolean }[] {
  if (m.tipo === 'barras') return []
  if (g.escalaX === 'log') return marcasLog(g.x.min, g.x.max)
  // Con el eje horizontal en diez divisiones, las marcas son los bordes de cada una (las cifras caben si el ancho da: se saltan alternas).
  if (g.divisionesX) return ticksDeDivisiones(g.x, DIVISIONES_X).map((valor, i) => ({ valor, mayor: true, etiquetar: ancho / g.dpr >= 560 || i % 2 === 0 }))
  return marcasLineales(g.x.min, g.x.max, Math.max(2, Math.floor(ancho / (86 * g.dpr)))).map((valor) => ({ valor, mayor: true, etiquetar: true }))
}

function marcasY(d: Dominio, alto: number, dpr: number, divisiones = false): number[] {
  if (divisiones) return ticksDeDivisiones(d, DIVISIONES_Y)
  return marcasLineales(d.min, d.max, Math.max(2, Math.floor(alto / (38 * dpr))))
}

/** Dibuja la gráfica; devuelve la geometría para los gestos. */
export function dibujarGrafica(ctx: Lienzo2D, m: ModeloGrafica, v: VistaGrafica, a: AspectoGrafica, c: ColoresGrafica, W: number, H: number, o: OpcionesGrafica): Geometria {
  const tip = o.tipografia ?? TIPOGRAFIA_POR_OMISION
  const g = geometriaGrafica(m, v, a, W, H, o.dpr, o.ejes)
  const d = o.dpr
  ctx.fillStyle = c.fondo
  ctx.fillRect(0, 0, W, H)
  for (const [p, pan] of g.paneles.entries()) {
    ctx.save()
    ctx.translate(0, pan.y0)
    dibujarPanel(ctx, m, v, a, c, g, p, pan, tip, o)
    ctx.restore()
  }
  if (m.tipo === 'lineas' && v.cursores && !o.sinEjes) lecturaDeCursores(ctx, m, v, g, c, tip, d, o.detalleCursores === true)
  else if (m.tipo === 'barras' && m.barras?.nota) {
    ctx.fillStyle = c.texto
    ctx.font = fuenteCifras(tip, d)
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    const pan = g.paneles[0]
    ctx.fillText(m.barras.nota, pan.col.x + pan.col.w - 6 * d, pan.col.y + 12 * d)
  }
  if (o.lectura && !o.sinEjes) dibujarLectura(ctx, o.lectura, g, c, tip, d)
  return g
}

/** La cruz vertical, un punto en cada traza y un cuadro de valores por panel junto al puntero (solo en pantalla). */
function dibujarLectura(ctx: Lienzo2D, l: LecturaEn, g: Geometria, c: ColoresGrafica, tip: Tipografia, d: number): void {
  const primero = g.paneles[0]
  const ultimo = g.paneles[g.paneles.length - 1]
  const xx = Math.round(l.xPx) + 0.5
  ctx.save()
  ctx.strokeStyle = c.texto
  ctx.lineWidth = d
  ctx.setLineDash([2 * d, 3 * d])
  ctx.beginPath()
  ctx.moveTo(xx, primero.y0 + primero.col.y)
  ctx.lineTo(xx, ultimo.y0 + ultimo.col.y + ultimo.col.h)
  ctx.stroke()
  ctx.setLineDash([])
  // Un punto cuadrado con borde del color del fondo en cada traza.
  const lado = 8 * d
  for (const f of l.filas) {
    if (f.yPx === null) continue
    const pan = g.paneles[Math.min(g.paneles.length - 1, f.panel)]
    if (f.yPx < pan.y0 + pan.col.y || f.yPx > pan.y0 + pan.col.y + pan.col.h) continue
    ctx.fillStyle = c.fondo
    ctx.fillRect(xx - lado / 2 - d, f.yPx - lado / 2 - d, lado + 2 * d, lado + 2 * d)
    ctx.fillStyle = c.linea(f.tono)
    ctx.fillRect(xx - lado / 2, f.yPx - lado / 2, lado, lado)
  }
  ctx.font = fuenteCifras(tip, d)
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  const renglon = 16 * d
  g.paneles.forEach((pan, p) => {
    const filas = l.filas.filter((f) => Math.min(g.paneles.length - 1, f.panel) === p)
    const lineas: { texto: string; tono: TonoFigura | null }[] = [...(p === 0 ? [{ texto: l.encabezado, tono: null }] : []), ...filas.map((f) => ({ texto: `${f.etiqueta}  ${f.texto}`, tono: f.tono }))]
    if (lineas.length === 0 || (lineas.length === 1 && p === 0 && filas.length === 0 && g.paneles.length === 1)) return
    const ancho = Math.max(...lineas.map((q) => ctx.measureText(q.texto).width)) + 30 * d
    const alto = lineas.length * renglon + 8 * d
    let x = xx + 14 * d
    if (x + ancho > pan.col.x + pan.col.w) x = xx - 14 * d - ancho
    x = Math.max(pan.col.x + 2 * d, x)
    const y = pan.y0 + pan.col.y + 6 * d
    ctx.fillStyle = c.fondo
    ctx.fillRect(x, y, ancho, alto)
    ctx.strokeStyle = c.ejes
    ctx.beginPath()
    ctx.rect(x + 0.5, y + 0.5, ancho - 1, alto - 1)
    ctx.stroke()
    lineas.forEach((q, k) => {
      const yy = y + 4 * d + (k + 0.5) * renglon
      if (q.tono) {
        ctx.fillStyle = c.linea(q.tono)
        ctx.fillRect(x + 7 * d, yy - 4 * d, 8 * d, 8 * d)
      }
      ctx.fillStyle = c.letra('negro')
      ctx.fillText(q.texto, x + (q.tono ? 20 : 8) * d, yy)
    })
  })
  ctx.restore()
}

function dibujarPanel(ctx: Lienzo2D, m: ModeloGrafica, v: VistaGrafica, a: AspectoGrafica, c: ColoresGrafica, g: Geometria, p: number, pan: PanelGeom, tip: Tipografia, o: OpcionesGrafica): void {
  const d = g.dpr
  const { col } = pan
  const ejeX = col.eje
  const xs = marcasX(g, m, col.w)
  // Las letras y cifras de los ejes llevan el tamaño del aspecto; el título del panel y las lecturas, el de la figura.
  const tipE: Tipografia = a.textoTam ? { ...tip, px: a.textoTam } : tip
  const esc = escalaDeTexto(tamTextoMax(a.textoTam, o.ejes))
  // El eje horizontal puede traer su propio estilo (tamaño, grosor, tono y título); sin él, el del texto de los ejes.
  const eX = o.ejes?.x
  const tipX: Tipografia = eX?.tam ? { ...tipE, px: eX.tam } : tipE
  const pesoX = eX?.peso ? PESO_NUM[eX.peso] : pesoCss(a)
  const tonoX = eX?.tono ? c.letra(eX.tono) : colorTexto(a, c)
  const px = (val: number) => Math.round(aPixel(val, g.x, g.escalaX, col.x, col.x + col.w)) + 0.5
  const grupoRejilla = pan.grupos.find((k) => k.lado !== 'centro') ?? pan.grupos[0]
  // La rejilla: verticales en las marcas del eje horizontal (las menores más tenues) y horizontales en el primer eje vertical.
  if (!o.sinReticula && a.rejilla) {
    ctx.lineWidth = (a.grosorRejilla ?? 1) * d
    ctx.strokeStyle = c.reticula
    ctx.setLineDash(a.rejillaEstilo === 'guiones' ? [4 * d, 4 * d] : [])
    const ysRejilla = grupoRejilla ? marcasY(grupoRejilla.dominio, col.h, d, grupoRejilla.divisiones) : []
    // Con las subdivisiones de X elegidas, un eje logarítmico lleva las décadas como rayas normales y las marcas 2 a 9 como menores (más tenues);
    // sin elegirlas (lo de omisión) conserva las 2 a 9 que ya traía con pocas décadas.
    const subX = a.subdivisionesX ?? null
    const subY = a.subdivisionesY ?? null
    const xsRejilla = xs.filter((q) => q.mayor || (g.escalaX === 'log' && subX === null)).map((q) => px(q.valor))
    const menoresX = a.rejillaEstilo === 'horizontal' || a.rejillaEstilo === 'puntos' || subX === null || subX < 2 ? [] : (g.escalaX === 'log' ? subdivisionesLog(g.x.min, g.x.max) : subdivisionesLineales(xs.filter((q) => q.mayor).map((q) => q.valor), subX, g.x.min, g.x.max)).map(px)
    const menoresY = a.rejillaEstilo === 'vertical' || a.rejillaEstilo === 'puntos' || subY === null || subY < 2 || !grupoRejilla ? [] : subdivisionesLineales(ysRejilla, subY, grupoRejilla.dominio.min, grupoRejilla.dominio.max).map((yv) => Math.round(aPixel(yv, grupoRejilla.dominio, 'lin', col.y + col.h, col.y)) + 0.5)
    if (a.rejillaEstilo === 'puntos') {
      // Un punto en cada cruce de la rejilla: mismo lugar que las líneas, con menos tinta.
      ctx.fillStyle = c.ejes
      const lado = Math.max(1, Math.round(1.5 * d))
      for (const xx of xsRejilla)
        for (const yv of ysRejilla) ctx.fillRect(Math.round(xx - lado / 2), Math.round(aPixel(yv, grupoRejilla!.dominio, 'lin', col.y + col.h, col.y) - lado / 2), lado, lado)
    } else {
      ctx.beginPath()
      if (a.rejillaEstilo !== 'horizontal')
        for (const xx of xsRejilla) {
          ctx.moveTo(xx, col.y)
          ctx.lineTo(xx, col.y + col.h)
        }
      if (a.rejillaEstilo !== 'vertical')
        for (const yv of ysRejilla) {
          const yy = Math.round(aPixel(yv, grupoRejilla!.dominio, 'lin', col.y + col.h, col.y)) + 0.5
          ctx.moveTo(col.x, yy)
          ctx.lineTo(col.x + col.w, yy)
        }
      ctx.stroke()
      if (menoresX.length > 0 || menoresY.length > 0) {
        ctx.strokeStyle = conAlfa(c.reticula, 0.5)
        ctx.beginPath()
        for (const xx of menoresX) {
          ctx.moveTo(xx, col.y)
          ctx.lineTo(xx, col.y + col.h)
        }
        for (const yy of menoresY) {
          ctx.moveTo(col.x, yy)
          ctx.lineTo(col.x + col.w, yy)
        }
        ctx.stroke()
      }
    }
    ctx.setLineDash([])
  }
  // El marco de la retícula.
  ctx.strokeStyle = c.ejes
  ctx.lineWidth = (a.grosorEjes ?? 1) * d
  ctx.beginPath()
  ctx.rect(col.x + 0.5, col.y + 0.5, col.w, col.h)
  ctx.stroke()
  // Las rayitas finas de la cruz central (cinco por división), como la retícula de un osciloscopio.
  if (g.instrumento && a.marcas && !o.sinReticula) {
    ctx.beginPath()
    const yc = Math.round(col.y + col.h / 2) + 0.5
    const xc = Math.round(col.x + col.w / 2) + 0.5
    for (let i = 0; i <= DIVISIONES_X * 5; i++) {
      const xx = Math.round(col.x + (i * col.w) / (DIVISIONES_X * 5)) + 0.5
      const largo = (i % 5 === 0 ? 4 : 2.5) * d
      ctx.moveTo(xx, yc - largo)
      ctx.lineTo(xx, yc + largo)
    }
    for (let i = 0; i <= DIVISIONES_Y * 5; i++) {
      const yy = Math.round(col.y + (i * col.h) / (DIVISIONES_Y * 5)) + 0.5
      const largo = (i % 5 === 0 ? 4 : 2.5) * d
      ctx.moveTo(xc - largo, yy)
      ctx.lineTo(xc + largo, yy)
    }
    ctx.stroke()
  }

  // Las trazas o las barras, recortadas a la retícula.
  ctx.save()
  ctx.beginPath()
  ctx.rect(col.x, col.y, col.w, col.h)
  ctx.clip()
  if (m.tipo === 'barras' && m.barras) dibujarBarras(ctx, m, c, g, pan)
  else dibujarTrazas(ctx, m, v, a, c, g, pan, p, o.resplandor === true)
  // Los cursores del eje horizontal.
  if (m.tipo === 'lineas' && v.cursores) {
    ctx.setLineDash([3 * d, 3 * d])
    ctx.strokeStyle = c.texto
    ctx.lineWidth = d
    ctx.beginPath()
    for (const q of v.cursores) {
      const xx = Math.round(aPixel(q, g.x, g.escalaX, col.x, col.x + col.w)) + 0.5
      ctx.moveTo(xx, col.y)
      ctx.lineTo(xx, col.y + col.h)
    }
    ctx.stroke()
    ctx.setLineDash([])
    if (o.cursorResaltado !== null && o.cursorResaltado !== undefined) {
      const xx = Math.round(aPixel(v.cursores[o.cursorResaltado], g.x, g.escalaX, col.x, col.x + col.w)) + 0.5
      ctx.lineWidth = Math.max(2, 2.5 * d)
      ctx.beginPath()
      ctx.moveTo(xx, col.y)
      ctx.lineTo(xx, col.y + col.h)
      ctx.stroke()
    }
  }
  ctx.restore()
  if (o.sinEjes) return

  ctx.textBaseline = 'middle'
  // El eje horizontal.
  if (ejeX.posicion !== 'ninguno') {
    ctx.strokeStyle = c.ejes
    ctx.lineWidth = (eX?.grosor ?? a.grosorEjes ?? 1) * d
    const sentido = ejeX.posicion === 'arriba' ? -1 : 1
    ctx.beginPath()
    if (a.marcas || ejeX.posicion === 'centro') {
      ctx.moveTo(col.x, ejeX.linea + 0.5)
      ctx.lineTo(col.x + col.w, ejeX.linea + 0.5)
    }
    if (a.marcas)
      for (const q of xs) {
        const xx = px(q.valor)
        const largo = (q.mayor ? 5 : 3) * d
        if (ejeX.posicion === 'centro') {
          ctx.moveTo(xx, ejeX.linea - largo / 2)
          ctx.lineTo(xx, ejeX.linea + largo / 2)
        } else {
          ctx.moveTo(xx, ejeX.linea)
          ctx.lineTo(xx, ejeX.linea + sentido * largo)
        }
      }
    ctx.stroke()
    ctx.fillStyle = tonoX
    ctx.font = fuenteCifras(tipX, d, pesoX)
    ctx.textAlign = 'center'
    const yEtq = ejeX.posicion === 'arriba' ? ejeX.linea - 11 * d * esc : ejeX.linea + (ejeX.posicion === 'abajo' ? 11 : 12) * d * esc
    // La unidad una sola vez, al final del eje; las cifras no pasan de ella.
    const rot = g.rotuloX
    const etiquetables = xs.filter((q) => q.etiquetar)
    const pasoX = etiquetables.length > 1 ? etiquetables[1].valor - etiquetables[0].valor : Math.abs(etiquetables[0]?.valor ?? 0) || 1
    ctx.font = fuenteTitulo(tipX, d, 650)
    ctx.font = fuenteCifras(tipX, d, pesoX)
    if (m.tipo === 'barras' && m.barras) {
      const paso = col.w / m.barras.categorias.length
      const cada = Math.max(1, Math.ceil((m.barras.categorias.length * 22 * d) / col.w))
      m.barras.categorias.forEach((t, i) => {
        if (i % cada === 0) ctx.fillText(t, col.x + (i + 0.5) * paso, yEtq)
      })
    } else {
      // Las cifras de los dos extremos siempre se escriben (no se salen del lienzo); las de en medio, si no chocan con ellas.
      const cifras = etiquetables.map((q) => {
        const t = rot.compacto ? textoMarca(q.valor, '') : etiquetaEnPrefijo(q.valor, rot.prefijo, pasoX, rot.decimales, decimalesPorOmision(m.ejeX.unidad))
        const w = ctx.measureText(t).width
        const xx = aPixel(q.valor, g.x, g.escalaX, col.x, col.x + col.w)
        return { t, w, xt: Math.max(w / 2 + 2 * d, Math.min(g.W - w / 2 - 2 * d, xx)) }
      })
      const libres = (a: { xt: number; w: number }, b: { xt: number; w: number }) => b.xt - b.w / 2 >= a.xt + a.w / 2 + 8 * d
      const ultima = cifras.length > 1 ? cifras[cifras.length - 1] : null
      const puestas: typeof cifras = []
      for (const q of cifras.slice(0, ultima ? -1 : undefined)) if (puestas.length === 0 || libres(puestas[puestas.length - 1], q)) puestas.push(q)
      if (ultima) {
        while (puestas.length > 1 && !libres(puestas[puestas.length - 1], ultima)) puestas.pop()
        puestas.push(ultima)
      }
      for (const q of puestas) ctx.fillText(q.t, q.xt, yEtq)
    }
    if (rot.unidad) {
      // Pasada la última cifra (que puede caer en el borde de la retícula), con una holgura.
      ctx.font = fuenteCifras(tipX, d, pesoX)
      const ultima = m.tipo === 'barras' ? '' : (xs.filter((q) => q.etiquetar).at(-1)?.valor ?? null) === null ? '' : rot.compacto ? textoMarca(xs.filter((q) => q.etiquetar).at(-1)!.valor, '') : etiquetaEnPrefijo(xs.filter((q) => q.etiquetar).at(-1)!.valor, rot.prefijo, pasoX, rot.decimales, decimalesPorOmision(m.ejeX.unidad))
      const finDeCifras = Math.max(0, aPixel(xs.filter((q) => q.etiquetar).at(-1)?.valor ?? g.x.min, g.x, g.escalaX, col.x, col.x + col.w) + ctx.measureText(ultima).width / 2)
      ctx.font = fuenteTitulo(tipX, d, 650)
      ctx.textAlign = 'left'
      ctx.fillText(rot.unidad, Math.max(col.x + col.w + 6 * d, finDeCifras + 8 * d), yEtq)
    }
    // El nombre del eje («Frecuencia») en el renglón de afuera, o arriba en la banda libre cuando el eje va en medio.
    ctx.font = fuenteTitulo(tipX, d)
    ctx.textAlign = 'center'
    const yTit = ejeX.posicion === 'arriba' ? 11 * d * esc : ejeX.posicion === 'abajo' ? ejeX.linea + 29 * d * esc : 11 * d * esc
    const nombreX = eX?.titulo ?? m.ejeX.nombre
    if (nombreX.trim()) ctx.fillText(nombreX, col.x + col.w / 2, yTit)
  }
  // El título del panel (Bode: «Magnitud» y «Fase»), arriba a la izquierda dentro de la retícula.
  if (pan.titulo) {
    ctx.font = fuenteTitulo(tip, d, 650)
    // Con un fondo detrás: si la curva pasa por la esquina, el título se sigue leyendo.
    ctx.fillStyle = c.fondo
    ctx.fillRect(col.x + 3 * d, col.y + 3 * d, ctx.measureText(pan.titulo).width + 8 * d, 16 * d)
    ctx.fillStyle = c.texto
    ctx.textAlign = 'left'
    ctx.fillText(pan.titulo, col.x + 7 * d, col.y + 11 * d)
  }
  // Los ejes verticales.
  for (const [k, gr] of pan.grupos.entries()) {
    const cl = col.columnas[k]
    const fondoMarca = c.fondo
    const eG = estiloDeEjeY(o.ejes, m, gr)
    const tipG: Tipografia = eG?.tam ? { ...tipE, px: eG.tam } : tipE
    const pesoG = eG?.peso ? PESO_NUM[eG.peso] : pesoCss(a)
    const tonoTexto = eG?.tono ? c.letra(eG.tono) : colorTexto(a, c, gr)
    const ticks = marcasY(gr.dominio, col.h, d, gr.divisiones)
    const paso = ticks.length > 1 ? ticks[1] - ticks[0] : Math.abs(ticks[0] ?? 0) || 1
    const yDe = (val: number) => aPixel(val, gr.dominio, 'lin', col.y + col.h, col.y)
    const linea = cl.lado === 'izquierda' ? cl.x1 : cl.linea
    ctx.strokeStyle = gr.tono ? c.linea(gr.tono) : c.ejes
    ctx.lineWidth = (eG?.grosor ?? a.grosorEjes ?? 1) * d
    ctx.setLineDash([])
    ctx.beginPath()
    if (a.marcas || cl.lado === 'centro') {
      ctx.moveTo(Math.round(linea) + 0.5, col.y)
      ctx.lineTo(Math.round(linea) + 0.5, col.y + col.h)
    }
    if (a.marcas)
      for (const t of ticks) {
        const yy = Math.round(yDe(t)) + 0.5
        const xx = Math.round(linea) + 0.5
        if (cl.lado === 'izquierda') {
          ctx.moveTo(xx - 4 * d, yy)
          ctx.lineTo(xx, yy)
        } else if (cl.lado === 'derecha') {
          ctx.moveTo(xx, yy)
          ctx.lineTo(xx + 4 * d, yy)
        } else {
          ctx.moveTo(xx - 3 * d, yy)
          ctx.lineTo(xx + 3 * d, yy)
        }
      }
    ctx.stroke()
    ctx.fillStyle = tonoTexto
    ctx.font = fuenteCifras(tipG, d, pesoG)
    ctx.textBaseline = 'middle'
    const xt = cl.lado === 'derecha' ? linea + 8 * d : linea - 7 * d
    ctx.textAlign = cl.lado === 'derecha' ? 'left' : 'right'
    for (const t of ticks) {
      const yy = yDe(t)
      // Las marcas de los bordes también llevan cifra: solo se descarta lo que cae fuera de la retícula.
      if (yy < col.y - d || yy > col.y + col.h + d) continue
      const etq = etiquetaEnPrefijo(t, gr.prefijo, paso, gr.decimales, 1)
      if (cl.lado === 'centro') {
        // Sobre la retícula: un fondo detrás para que no se pierda entre las líneas.
        const w = ctx.measureText(etq).width
        ctx.fillStyle = fondoMarca
        ctx.fillRect(xt - w - 2 * d, yy - 6 * d * esc, w + 4 * d, 12 * d * esc)
        ctx.fillStyle = tonoTexto
      }
      ctx.fillText(etq, xt, yy)
    }
    // La unidad del eje, una sola vez, sobre su columna.
    ctx.font = fuenteTitulo(tipG, d, 650)
    ctx.fillStyle = tonoTexto
    ctx.textAlign = cl.lado === 'derecha' ? 'left' : 'right'
    // Con el eje horizontal arriba, la unidad va en el renglón del título de ese eje: el de las cifras queda libre.
    const yUnidad = cl.lado === 'centro' ? col.y + 10 * d * esc : ejeX.posicion === 'arriba' ? 11 * d * esc : col.y - 9 * d * esc
    // En la pantalla «Instrumento» la unidad lleva la letra de su columna (A, B…), como la bandera de cada canal del osciloscopio.
    ctx.fillText(eG?.titulo ?? (g.instrumento && pan.grupos.length > 1 ? `${LETRAS_EJE[k] ?? ''} ${gr.unidadMostrada}`.trim() : gr.unidadMostrada), xt, yUnidad)
    if (o.asas) asaVertical(ctx, c, Math.round(linea) + 0.5, col.y + col.h / 2, d)
  }
  if (o.asas && ejeX.posicion !== 'ninguno') asaHorizontal(ctx, c, col.x + col.w / 2, Math.round(ejeX.linea) + 0.5, d)
}

/** El peso (CSS) de las cifras de los ejes. */
const PESO_NUM: Readonly<Record<PesoTexto, number>> = { normal: 400, medio: 500, negrita: 700 }
const pesoCss = (a: AspectoGrafica): number => PESO_NUM[a.textoPeso]

/** El estilo propio de un eje vertical: el que se guardó con la clave de su primera traza y su unidad (`claveDeEje`). */
function estiloDeEjeY(ejes: OpcionesGrafica['ejes'], m: ModeloGrafica, gr: GrupoEje): EstiloEje | undefined {
  if (!ejes) return undefined
  for (const i of gr.trazas) {
    const k = m.trazas[i]?.clave
    if (k === undefined) continue
    const propio = `${k}#${gr.unidad}`
    if (Object.hasOwn(ejes, propio)) return ejes[propio]
  }
  return undefined
}

/** El color de las letras de un eje: el tono elegido para el texto o, sin él, el de la traza del eje (gris con varias). */
function colorTexto(a: AspectoGrafica, c: ColoresGrafica, gr?: GrupoEje): string {
  if (a.textoTono) return c.letra(a.textoTono)
  return gr?.tono ? c.letra(gr.tono) : c.texto
}

/** El asa de un eje vertical: una pastilla con dos rayitas sobre la línea del eje, que se agarra para moverlo. */
function asaVertical(ctx: Lienzo2D, c: ColoresGrafica, x: number, y: number, d: number): void {
  const w = 7 * d
  const h = 22 * d
  ctx.fillStyle = c.fondo
  ctx.fillRect(x - w / 2, y - h / 2, w, h)
  ctx.strokeStyle = c.ejes
  ctx.lineWidth = d
  ctx.beginPath()
  ctx.rect(x - w / 2 + 0.5, y - h / 2 + 0.5, w - 1, h - 1)
  ctx.moveTo(x - d, y - 5 * d)
  ctx.lineTo(x - d, y + 5 * d)
  ctx.moveTo(x + d, y - 5 * d)
  ctx.lineTo(x + d, y + 5 * d)
  ctx.stroke()
}

function asaHorizontal(ctx: Lienzo2D, c: ColoresGrafica, x: number, y: number, d: number): void {
  const w = 22 * d
  const h = 7 * d
  ctx.fillStyle = c.fondo
  ctx.fillRect(x - w / 2, y - h / 2, w, h)
  ctx.strokeStyle = c.ejes
  ctx.lineWidth = d
  ctx.beginPath()
  ctx.rect(x - w / 2 + 0.5, y - h / 2 + 0.5, w - 1, h - 1)
  ctx.moveTo(x - 5 * d, y - d)
  ctx.lineTo(x + 5 * d, y - d)
  ctx.moveTo(x - 5 * d, y + d)
  ctx.lineTo(x + 5 * d, y + d)
  ctx.stroke()
}

function dibujarTrazas(ctx: Lienzo2D, m: ModeloGrafica, v: VistaGrafica, a: AspectoGrafica, c: ColoresGrafica, g: Geometria, pan: PanelGeom, p: number, resplandor = false): void {
  const d = g.dpr
  const { col } = pan
  for (const gr of pan.grupos) {
    for (const i of gr.trazas) {
      const t = m.trazas[i]
      if (Math.min(g.paneles.length - 1, t.panel) !== p) continue
      ctx.lineWidth = Math.max(1, (t.grosor ?? a.grosor) * d)
      ctx.strokeStyle = c.linea(t.tono)
      ctx.setLineDash(t.discontinua ? [6 * d, 4 * d] : [])
      ctx.beginPath()
      trazar(ctx, t, g, gr.dominio, col)
      if (resplandor) {
        const [ancho, color] = [ctx.lineWidth, ctx.strokeStyle]
        ctx.lineWidth = ancho * 3.4
        ctx.strokeStyle = conAlfa(String(color), 0.16)
        ctx.stroke()
        ctx.lineWidth = ancho
        ctx.strokeStyle = color
      }
      ctx.stroke()
    }
  }
  ctx.setLineDash([])
}

/** Camino de una traza: con más de dos puntos por píxel se dibuja el rango de cada columna (sin perder picos). */
function trazar(ctx: Lienzo2D, t: TrazaGrafica, g: Geometria, dy: Dominio, col: Colocacion): void {
  const n = t.x.length
  if (n === 0) return
  const X = (val: number) => aPixel(val, g.x, g.escalaX, col.x, col.x + col.w)
  const Y = (val: number) => Math.max(col.y - col.h, Math.min(col.y + 2 * col.h, aPixel(val, dy, 'lin', col.y + col.h, col.y)))
  // Primer índice con x ≥ mínimo (un punto antes, para que la línea entre desde el borde) y último ≤ máximo (uno después).
  let lo = 0
  let hi = n - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (t.x[mid] < g.x.min) lo = mid
    else hi = mid
  }
  const i0 = t.x[hi] < g.x.min ? hi : lo
  lo = 0
  hi = n - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (t.x[mid] <= g.x.max) lo = mid
    else hi = mid
  }
  const i1 = t.x[lo] > g.x.max ? lo : hi
  const puntos = i1 - i0 + 1
  let abierta = false
  if (puntos <= 2 * col.w) {
    for (let i = i0; i <= i1; i++) {
      const yv = t.y[i]
      if (!Number.isFinite(yv) || !Number.isFinite(t.x[i])) {
        abierta = false
        continue
      }
      if (abierta) ctx.lineTo(X(t.x[i]), Y(yv))
      else ctx.moveTo(X(t.x[i]), Y(yv))
      abierta = true
    }
    return
  }
  let colPx = Number.NaN
  let primero = 0
  let ultimo = 0
  let mn = 0
  let mx = 0
  const emitir = () => {
    if (Number.isNaN(colPx)) return
    if (abierta) ctx.lineTo(colPx, Y(primero))
    else ctx.moveTo(colPx, Y(primero))
    ctx.lineTo(colPx, Y(mn))
    ctx.lineTo(colPx, Y(mx))
    ctx.lineTo(colPx, Y(ultimo))
    abierta = true
  }
  for (let i = i0; i <= i1; i++) {
    const yv = t.y[i]
    if (!Number.isFinite(yv)) continue
    const q = Math.round(X(t.x[i]))
    if (q !== colPx) {
      emitir()
      colPx = q
      primero = ultimo = mn = mx = yv
    } else {
      ultimo = yv
      if (yv < mn) mn = yv
      if (yv > mx) mx = yv
    }
  }
  emitir()
}

function dibujarBarras(ctx: Lienzo2D, m: ModeloGrafica, c: ColoresGrafica, g: Geometria, pan: PanelGeom): void {
  const b = m.barras!
  const { col } = pan
  const gr = pan.grupos[0]
  const n = b.categorias.length
  const paso = col.w / n
  const ancho = (paso * 0.8) / b.series.length
  b.series.forEach((s, k) => {
    ctx.fillStyle = c.linea(s.tono)
    s.valores.forEach((val, i) => {
      if (!Number.isFinite(val)) return
      const y1 = aPixel(val, gr.dominio, 'lin', col.y + col.h, col.y)
      ctx.fillRect(col.x + i * paso + paso * 0.1 + k * ancho, y1, Math.max(1, ancho - g.dpr), col.y + col.h - y1)
    })
  })
}

/** La lectura de los dos cursores: la diferencia en el eje horizontal y el valor de cada traza visible bajo cada uno. */
export function lineasDeCursores(m: ModeloGrafica, v: VistaGrafica, g: Geometria): string[] {
  if (!v.cursores) return []
  const [x1, x2] = v.cursores
  const u = m.ejeX.unidad
  const dl = deltaCursores(v.cursores, g.escalaX)
  const eje = m.ejeX.nombre || 'x'
  const lineas = [`${eje}: ${textoMarca(x1, u)} → ${textoMarca(x2, u)}`, `Δ${eje.charAt(0).toLowerCase()} ${textoMarca(dl.dx, u)}${dl.razon ? ` (×${Number(dl.razon.toPrecision(3))})` : ''}`]
  for (const t of m.trazas) {
    if (v.ocultas.has(t.clave)) continue
    const a = interpolar(t.x, t.y, x1, g.escalaX)
    const b = interpolar(t.x, t.y, x2, g.escalaX)
    if (Number.isNaN(a) && Number.isNaN(b)) continue
    const f = (val: number) => (Number.isNaN(val) ? 'sin dato' : textoMarca(val, t.unidad === 'dB' || t.unidad === '°' ? '' : t.unidad) + (t.unidad === 'dB' ? ' dB' : t.unidad === '°' ? '°' : ''))
    lineas.push(`${t.etiqueta}: ${f(a)} → ${f(b)}${Number.isNaN(a) || Number.isNaN(b) ? '' : ` (Δ ${textoMarca(b - a, t.unidad === 'dB' || t.unidad === '°' ? '' : t.unidad)}${t.unidad === 'dB' ? ' dB' : t.unidad === '°' ? '°' : ''})`}`)
  }
  return lineas
}

/** La lectura de los cursores en pocas líneas: solo las diferencias (de x y de cada traza); los valores van en el detalle. */
export function lineasDeCursoresCompactas(m: ModeloGrafica, v: VistaGrafica, g: Geometria): string[] {
  if (!v.cursores) return []
  const u = m.ejeX.unidad
  const dl = deltaCursores(v.cursores, g.escalaX)
  const eje = (m.ejeX.nombre || 'x').charAt(0).toLowerCase()
  const lineas = [`Δ${eje} ${textoMarca(dl.dx, u)}${dl.razon ? ` (×${Number(dl.razon.toPrecision(3))})` : ''}`]
  for (const t of m.trazas) {
    if (v.ocultas.has(t.clave)) continue
    const a = interpolar(t.x, t.y, v.cursores[0], g.escalaX)
    const b = interpolar(t.x, t.y, v.cursores[1], g.escalaX)
    if (Number.isNaN(a) || Number.isNaN(b)) continue
    const sufijo = t.unidad === 'dB' ? ' dB' : t.unidad === '°' ? '°' : ''
    lineas.push(`${t.etiqueta}: Δ ${textoMarca(b - a, sufijo ? '' : t.unidad)}${sufijo}`)
  }
  return lineas
}

const MAX_LINEAS_LECTURA = 9

function lecturaDeCursores(ctx: Lienzo2D, m: ModeloGrafica, v: VistaGrafica, g: Geometria, c: ColoresGrafica, tip: Tipografia, d: number, detalle: boolean): void {
  const lineas = (detalle ? lineasDeCursores(m, v, g) : lineasDeCursoresCompactas(m, v, g)).slice(0, MAX_LINEAS_LECTURA)
  if (!lineas.length) return
  const pan = g.paneles[0]
  ctx.font = fuenteCifras(tip, d)
  const ancho = Math.max(...lineas.map((x) => ctx.measureText(x).width)) + 12 * d
  const alto = (lineas.length * 15 + 8) * d
  const x = Math.max(pan.col.x + 4 * d, pan.col.x + pan.col.w - ancho - 6 * d)
  const y = pan.y0 + pan.col.y + 6 * d
  ctx.fillStyle = c.fondo
  ctx.fillRect(x, y, ancho, alto)
  ctx.strokeStyle = c.ejes
  ctx.lineWidth = d
  ctx.beginPath()
  ctx.rect(x + 0.5, y + 0.5, ancho - 1, alto - 1)
  ctx.stroke()
  ctx.fillStyle = c.texto
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  lineas.forEach((t, k) => ctx.fillText(t, x + 6 * d, y + (11.5 + 15 * k) * d))
}

/** La leyenda: una línea corta con el tono de cada traza y su nombre, en renglones que caben en `ancho`. Devuelve el alto usado. */
export function dibujarLeyenda(ctx: Lienzo2D, items: readonly { etiqueta: string; tono: TonoFigura; discontinua?: boolean }[], x: number, y: number, ancho: number, c: ColoresGrafica, tip: Tipografia, d: number, grosor = 2): number {
  const renglon = 18 * d
  ctx.font = fuenteCifras(tip, d)
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  let cx = x
  let cy = y + renglon / 2
  for (const it of items) {
    const w = ctx.measureText(it.etiqueta).width + 30 * d
    if (cx > x && cx + w > x + ancho) {
      cx = x
      cy += renglon
    }
    ctx.strokeStyle = c.linea(it.tono)
    ctx.lineWidth = Math.max(1, grosor * d)
    ctx.setLineDash(it.discontinua ? [4 * d, 3 * d] : [])
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(cx + 18 * d, cy)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = c.letra(it.tono)
    ctx.fillText(it.etiqueta, cx + 23 * d, cy)
    cx += w
  }
  return cy - y + renglon / 2
}

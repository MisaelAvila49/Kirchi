import { tamTextoMax, type Anotaciones } from '../../../../compartido/grafica/anotaciones'
import type { AspectoGrafica, AspectoTraza, LadoEjeY } from '../../../../compartido/grafica/aspecto'
import { TONOS_FIGURA, coloresFiguraPorOmision, type FamiliaFigura, type OpcionesFigura, type Tema, type TonoFigura } from '../../../../compartido/ajustes'
import { CANALES, DIVISIONES_H, DIVISIONES_V, MATEMATICO, type AjustesOsciloscopio, type Canal, type CanalOMatematico } from '../../instrumentos/ajustes'
import type { PantallaSab } from '../../sim/protocoloInstrumentos'
import { coloresDeTema } from '../colores'
import { temaEfectivo } from '../grafica/paleta'
import type { SerieFigura } from '../exportar/modelo'
import type { PrefijoEje } from '../../../../compartido/grafica/aspecto'
import type { RangoExportar, MapaX } from '../exportar/rango'
import type { Adornos } from '../exportar/preajustes'
import type { Dominio } from '../grafica/vista'
import { marcasRedondas, recortarCaptura, referenciaDelTiempo } from './recorte'
import { marcoDePantalla } from './marco'
import { conTamañoGeneral, escalaDeTexto } from '../../../../compartido/grafica/aspecto'
import { coloresPantalla, dibujarPantalla, TIPOGRAFIA_POR_OMISION, type ColoresPantalla, type Lienzo2D, type Tipografia } from './dibujar'
import { dominioConDato, lineasDeCaptura } from './exportarCaptura'
import { estiloCifrasDe, estiloDeAspecto } from './estilo'
import { dibujarNotas, letraDeTitulo, medirTexto } from '../exportar/editor/dibujoNotas'
import type { GeometriaFigura } from '../exportar/editor/geometria'
import { geometriaDeCaptura } from './geometriaCaptura'

/**
 * Figura de la captura: pantalla y leyenda. Una sola función de dibujo sirve a la vista previa, al PNG (1× a 4×), al SVG y al PDF (`ContextoSvg`).
 */

/** La pantalla de 10 por 8 divisiones a 800 por 640 px CSS, con la leyenda debajo. */
export const ANCHO_FIGURA = 800
export const ALTO_PANTALLA_FIGURA = 640
const RENGLON = 18
/** Los renglones de la leyenda (ajustes, escala de cada canal, medidas y tiempo de la captura). */
const RENGLONES_LEYENDA = 4
export const ALTO_FIGURA = ALTO_PANTALLA_FIGURA + RENGLONES_LEYENDA * RENGLON + 12
/** El margen del marco doble, la cabecera con título y subtítulo, y la fila de la leyenda. */
export const MARGEN_MARCO = 14
const ALTO_TITULO_FIGURA = 48
const ALTO_LEYENDA_FIGURA = 28

/** El marco doble de la figura «Instrumento»: dos rectángulos, uno dentro del otro. */
export function marcoDoble(ctx: Lienzo2D, w: number, h: number, k: number, color: string): void {
  ctx.strokeStyle = color
  for (const [d, grosor] of [[4, 1.4], [8, 0.8]] as const) {
    ctx.lineWidth = grosor * k
    ctx.beginPath()
    ctx.moveTo(d * k, d * k)
    ctx.lineTo((w - d) * k, d * k)
    ctx.lineTo((w - d) * k, (h - d) * k)
    ctx.lineTo(d * k, (h - d) * k)
    ctx.closePath()
    ctx.stroke()
  }
}

/** La leyenda de arriba (preajuste «Informe»): una muestra de línea y el nombre con la escala de cada canal. */
function leyendaDeCanales(ctx: Lienzo2D, trozos: readonly { texto: string; canal?: CanalOMatematico }[], x0: number, y: number, k: number, c: ColoresPantalla, tip: Tipografia, tam: number): void {
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.font = `${(tam + 1) * k}px ${tip.cifras}`
  let x = x0
  for (const t of trozos) {
    if (t.canal) {
      ctx.strokeStyle = c.canal[t.canal]
      ctx.lineWidth = 2.4 * k
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + 18 * k, y)
      ctx.stroke()
      x += 24 * k
    }
    ctx.fillStyle = t.canal ? c.canalTexto[t.canal] : c.texto
    ctx.fillText(t.texto.trimStart(), x, y)
    x += ctx.measureText(t.texto.trimStart()).width + (t.canal ? 4 * k : 14 * k)
  }
}

/** Las pilas CSS de las tres familias que Kirchi empaqueta (las variables de la interfaz o, sin ellas, las de siempre). */
export type PilasFuentes = Readonly<Record<FamiliaFigura, string>>
export const PILAS_POR_OMISION: PilasFuentes = { interfaz: TIPOGRAFIA_POR_OMISION.titulo, cifras: TIPOGRAFIA_POR_OMISION.cifras, serif: '"Source Serif 4 Variable", Georgia, serif' }

const SERIES: readonly CanalOMatematico[] = [...CANALES, MATEMATICO]

/** El tono de un canal: el de las opciones (si es de la lista) o el de siempre. */
export function tonoDeCanal(op: Pick<OpcionesFigura, 'colores'>, c: CanalOMatematico): TonoFigura {
  const t = Object.hasOwn(op.colores, c) ? op.colores[c] : undefined
  return t && (TONOS_FIGURA as readonly string[]).includes(t) ? t : (coloresFiguraPorOmision()[c] as TonoFigura)
}

/** El tema con que se pinta, para fondo, rejilla y escalas juntos: el del aspecto de la figura (o el de las opciones) y, si es «como la aplicación», el que se ve. */
export const temaDeFigura = (op: Pick<OpcionesFigura, 'tema'>, actual: Tema, asp?: Pick<AspectoDeCaptura, 'aspecto'>): Tema => temaEfectivo(asp?.aspecto.tema ?? op.tema, actual)

/**
 * Aspecto con que se dibuja la pantalla, el de la propiedad `aspecto`. Un tono cambiado en el diálogo manda sobre el de la pantalla.
 */
export interface AspectoDeCaptura {
  aspecto: AspectoGrafica
  canales: Readonly<Record<string, AspectoTraza>>
  /** El tramo del eje del tiempo que se exporta (en el eje de la figura); ausente, toda la pantalla. */
  rango?: RangoExportar | null
  /** Canales que no se exportan aunque estén encendidos en la pantalla («A», «B», «C», «D» o «M» para A − B). */
  apagados?: readonly string[]
  /** Lo que lleva la figura alrededor de la pantalla (título, leyenda, marco con la franja de escalas, resplandor); sin él, la de siempre. */
  adornos?: Adornos
  /** Textos, flechas, etiquetas de valor y estilos de ejes del editor de exportar. */
  anotaciones?: Anotaciones
}

/** Los ajustes sin los canales que el diálogo de exportar apagó: la figura y el CSV salen de la misma lista. */
export function conCanalesApagados(a: AjustesOsciloscopio, apagados?: readonly string[]): AjustesOsciloscopio {
  if (!apagados || apagados.length === 0) return a
  return { ...a, matematico: a.matematico && !apagados.includes('M'), canales: a.canales.map((c) => (apagados.includes(c.canal) ? { ...c, on: false } : c)) }
}

/**
 * Los canales con su Desde y Hasta escritos: el centro de la pantalla y los voltios por división que dejan esos valores en los bordes
 * (8 divisiones a lo alto; en X-Y, 10 a lo ancho para el canal horizontal, con el rango del eje horizontal o, sin él, el suyo).
 */
export function conRangosEscritos(a: AjustesOsciloscopio, asp?: Pick<AspectoDeCaptura, 'aspecto' | 'canales'>): AjustesOsciloscopio {
  if (!asp) return a
  const horizontal = a.modoXY === 'ba' ? 'A' : a.modoXY === 'ab' ? 'B' : null
  const ajustados = a.canales.map((c) => {
    const r = c.canal === horizontal ? (asp.aspecto.rangoX ?? asp.canales[c.canal]?.rango) : asp.canales[c.canal]?.rango
    if (!r || !(r.max > r.min)) return c
    const vdiv = (r.max - r.min) / (c.canal === horizontal ? DIVISIONES_H : DIVISIONES_V)
    return { ...c, vdiv, pos: -(r.min + r.max) / 2 / vdiv }
  })
  return ajustados.some((c, i) => c !== a.canales[i]) ? { ...a, canales: ajustados } : a
}

/** El tono de un canal en la figura: el del diálogo si lo cambió; si no, el que tiene en la pantalla; si no, el de siempre. */
function tonoFinal(op: Pick<OpcionesFigura, 'colores'>, c: CanalOMatematico, asp?: AspectoDeCaptura): TonoFigura {
  const deOmision = coloresFiguraPorOmision()[c] as TonoFigura
  const elDialogo = tonoDeCanal(op, c)
  const deLaPantalla = asp?.canales[c]?.color ?? null
  return elDialogo === deOmision && deLaPantalla ? deLaPantalla : elDialogo
}

/** Los colores de la pantalla con los tonos de cada canal y el fondo de las opciones. */
export function coloresDeFigura(op: OpcionesFigura, actual: Tema, asp?: AspectoDeCaptura): ColoresPantalla {
  const tema = temaDeFigura(op, actual, asp)
  // Claro es hoja blanca (papel); oscuro conserva el fondo del lienzo oscuro.
  const base = coloresPantalla(tema, tema === 'claro')
  const T = coloresDeTema(tema)
  const canal = { ...base.canal } as Record<CanalOMatematico, string>
  const canalTexto = { ...base.canalTexto } as Record<CanalOMatematico, string>
  for (const c of SERIES) {
    const tono = tonoFinal(op, c, asp)
    canal[c] = T[tono]
    canalTexto[c] = T[`${tono}-texto`]
  }
  return { ...base, canal, canalTexto }
}

/** Las letras de la figura: la familia elegida; con la de la interfaz, las cifras siguen en la mono (el aspecto de siempre). */
export function tipografiaDeFigura(op: Pick<OpcionesFigura, 'fuente' | 'tamañoLetra'>, pilas: PilasFuentes = PILAS_POR_OMISION): Tipografia {
  return { titulo: pilas[op.fuente], cifras: op.fuente === 'interfaz' ? pilas.cifras : pilas[op.fuente], px: op.tamañoLetra }
}

export interface FiguraCaptura {
  /** Tamaño en px CSS a 1×. */
  ancho: number
  alto: number
  /** Dibuja la figura en `ctx` con `k` px de lienzo por px CSS (el factor de la vista previa o la escala del PNG). */
  dibujar(ctx: Lienzo2D, k: number): void
  /** El color de fondo (el de la hoja). */
  fondo: string
  /** El eje horizontal de la figura, para elegir un tramo arrastrando sobre la vista previa; ausente si no tiene (barras). */
  eje?: EjeDeFigura
  /** Dónde cae cada cosa de la figura (para elegirla con el puntero y pegar etiquetas a las trazas); se arma al pedirla. */
  geometria?: () => GeometriaFigura
}

/** Qué se puede recortar de una figura: cómo pasar de un píxel a un valor, lo que abarca el eje completo y la unidad de sus números. */
export interface EjeDeFigura {
  mapa: MapaX
  total: Dominio
  unidad: string
  /** Prefijo elegido para sus números; null, el que mejor cabe. */
  prefijo: PrefijoEje | null
  /** El valor del eje que los campos del tramo llaman 0 (el principio de lo capturado); ausente, el 0 del eje. */
  origen?: number
}

/** Lo que abarca el eje del tiempo en común con el dato real: nunca antes de que empiece lo capturado ni después de que acabe. */
export function ejeConDato(total: Dominio, dato: Dominio | null): Dominio {
  if (!dato) return total
  const min = Math.max(total.min, dato.min)
  const max = Math.min(total.max, dato.max)
  return max > min ? { min, max } : total
}

/** La captura `p` de `ref` como figura con las opciones `op`; `actual` es el tema que se ve (para el fondo «tema actual»). */
export function figuraDeCaptura(ref: string, a0: AjustesOsciloscopio, p: PantallaSab, op: OpcionesFigura, actual: Tema, pilas: PilasFuentes = PILAS_POR_OMISION, asp0?: AspectoDeCaptura): FiguraCaptura {
  // El tamaño general de la letra llega a los ejes sin tamaño propio (y el reparto de la pantalla crece con él).
  const asp = asp0 ? { ...asp0, aspecto: conTamañoGeneral(asp0.aspecto, op.tamañoLetra) } : undefined
  const a = conRangosEscritos(conCanalesApagados(a0, asp?.apagados), asp)
  const c = coloresDeFigura(op, actual, asp)
  const lados = Object.fromEntries(Object.entries(asp?.canales ?? {}).map(([k, t]) => [k, t.lado])) as Partial<Record<Canal, LadoEjeY>>
  const tipografia = tipografiaDeFigura(op, pilas)
  const lineas = lineasDeCaptura(ref, a, p, asp?.rango)
  // El tramo recortado (si lo hay): las columnas de ese tramo y la base que las reparte en diez divisiones.
  const rec = recortarCaptura(a, p, asp?.rango)
  // Los adornos del preajuste: el marco doble deja un margen, el título y la leyenda una cabecera, y la franja de escalas va
  // con el marco; sin adornos (la figura de antes) no hay margen ni cabecera y la franja va siempre.
  const ad = asp?.adornos
  const m = ad?.marco ? MARGEN_MARCO : 0
  const anot = asp?.anotaciones
  // Título y subtítulo: lo de siempre o lo que reescribió el lector.
  const tTit = letraDeTitulo(anot?.estilos.titulo, { texto: `Captura de ${ref}`, px: op.tamañoLetra + 5, negrita: true, color: c.letra?.('negro') ?? c.texto }, (t) => c.letra?.(t) ?? c.texto)
  const tSub = letraDeTitulo(anot?.estilos.subtitulo, { texto: lineas[0].map((t) => t.texto).join(''), px: op.tamañoLetra + 1, negrita: false, color: c.texto }, (t) => c.letra?.(t) ?? c.texto)
  const hTit = ad?.titulo ? (tSub.texto.trim() === '' ? ALTO_TITULO_FIGURA - 20 : ALTO_TITULO_FIGURA) : 0
  const hCab = hTit + (ad?.leyenda ? ALTO_LEYENDA_FIGURA : 0)
  const franja = ad ? ad.marco : true
  // Un tramo exportado queda como se eligió: sus marcas caen en valores redondos dentro de él.
  const marcasT = rec.recortada ? marcasRedondas(rec.vista) : null
  const Wp = ANCHO_FIGURA - 2 * m
  const alto = 2 * m + hCab + ALTO_PANTALLA_FIGURA + (franja ? RENGLONES_LEYENDA * RENGLON + 12 : 10)
  const totalConDato = ejeConDato(rec.total, dominioConDato(a, p))
  const opMarco = { ejeX: asp?.aspecto.ejeX, lados, escalaTexto: escalaDeTexto(tamTextoMax(asp?.aspecto.textoTam, anot?.ejes)), estiloCifras: estiloCifrasDe(asp?.aspecto ?? { textoTam: null }, asp?.canales, anot?.ejes) }
  const marco = marcoDePantalla(rec.a, Wp, ALTO_PANTALLA_FIGURA, 1, opMarco)
  let guardada: GeometriaFigura | undefined
  /** La geometría se arma una vez por figura: el dibujo y el editor la piden varias veces. */
  const geometria = (): GeometriaFigura => (guardada ??= armarGeometria())
  const armarGeometria = (): GeometriaFigura => {
    const caja = (x: number, y: number, t: { texto: string; px: number }) => ({ x, y: y - t.px * 0.7, w: medirTexto(t.texto, t.px, true), h: t.px * 1.4 })
    return geometriaDeCaptura({
      a: rec.a,
      p: rec.p,
      referencia: referenciaDelTiempo(p),
      marco,
      ox: m,
      oy: m + hCab,
      tonos: Object.fromEntries(SERIES.map((k) => [k, tonoFinal(op, k, asp)])),
      ancho: ANCHO_FIGURA,
      alto,
      aspecto: asp?.aspecto,
      canales: asp?.canales,
      titulos: ad?.titulo ? { titulo: caja(m + 8, m + 16, tTit), subtitulo: tSub.texto.trim() === '' ? undefined : caja(m + 8, m + 36, tSub) } : undefined
    })
  }
  return {
    ancho: ANCHO_FIGURA,
    alto,
    fondo: c.fondo,
    eje: { mapa: { px0: m + marco.x, px1: m + marco.x + marco.w, dom: rec.vista, escala: 'lin' }, total: totalConDato, origen: totalConDato.min, unidad: 's', prefijo: asp?.aspecto.prefijoX ?? null },
    geometria,
    dibujar(ctx, k) {
      ctx.fillStyle = c.fondo
      ctx.fillRect(0, 0, ANCHO_FIGURA * k, alto * k)
      if (ad?.marco) marcoDoble(ctx, ANCHO_FIGURA, alto, k, c.ejes)
      if (ad?.titulo) {
        ctx.textBaseline = 'middle'
        ctx.textAlign = 'left'
        ctx.fillStyle = tTit.color
        ctx.font = `${tTit.peso} ${tTit.px * k}px ${tipografia.titulo}`
        ctx.fillText(tTit.texto, (m + 8) * k, (m + 16) * k)
        ctx.fillStyle = tSub.color
        ctx.font = `${tSub.peso === 650 ? 650 : ''} ${tSub.px * k}px ${tipografia.titulo}`.trim()
        if (tSub.texto.trim() !== '') ctx.fillText(tSub.texto, (m + 8) * k, (m + 36) * k)
      }
      if (ad?.leyenda) leyendaDeCanales(ctx, lineas[1], (m + 8) * k, (m + hTit + 12) * k, k, c, tipografia, op.tamañoLetra)
      ctx.save()
      ctx.translate(m * k, (m + hCab) * k)
      dibujarPantalla(ctx, rec.p, rec.a, Wp * k, ALTO_PANTALLA_FIGURA * k, c, {
        dpr: k,
        resplandor: ad?.resplandor, ejes: op.ejes, sinReticula: asp ? !asp.aspecto.rejilla : !op.rejilla, tipografia, marcas: asp?.aspecto.marcas, grosor: asp?.aspecto.grosor, marco: opMarco,
        estilo: asp ? { ...estiloDeAspecto(asp.aspecto, asp.canales, anot?.ejes), ...(rec.recortada ? { tiempoDesde: { valor: rec.vista.min, alDisparo: Number.isFinite(p.tDisparo) }, ...(marcasT ? { marcasTiempo: { ...marcasT, dominio: rec.vista } } : {}) } : {}) } : rec.recortada ? { textoTono: null, textoPeso: 'normal', rejillaEstilo: 'lineas', prefijoX: null, canales: {}, tiempoDesde: { valor: rec.vista.min, alDisparo: Number.isFinite(p.tDisparo) }, ...(marcasT ? { marcasTiempo: { ...marcasT, dominio: rec.vista } } : {}) } : undefined
      })
      ctx.restore()
      if (franja) franjaDeEscalas(ctx, k)
      if (anot && (anot.textos.length > 0 || anot.flechas.length > 0 || anot.etiquetas.length > 0)) {
        dibujarNotas(ctx, k, geometria(), anot, { fondo: c.fondo, texto: c.texto, letra: (t) => c.letra?.(t) ?? c.texto }, tipografia)
      }
    }
  }
  /** La franja de escalas, disparo y medidas bajo la pantalla (cuatro renglones). */
  function franjaDeEscalas(ctx: Lienzo2D, k: number): void {
    ctx.textBaseline = 'alphabetic'
    ctx.textAlign = 'left'
    ctx.font = `${(op.tamañoLetra + 2) * k}px ${tipografia.cifras}`
    lineas.forEach((l, n) => {
      let x = (m + 8) * k
      const y = (m + hCab + ALTO_PANTALLA_FIGURA + 8 + (n + 1) * RENGLON - 4) * k
      for (const trozo of l) {
        ctx.fillStyle = trozo.canal ? c.canalTexto[trozo.canal] : c.texto
        ctx.fillText(trozo.texto, x, y)
        x += ctx.measureText(trozo.texto).width
      }
    })
  }
}

/** Las series que se pueden pintar: los canales encendidos y A − B. */
export function seriesDeCaptura(a: AjustesOsciloscopio): SerieFigura[] {
  const s: SerieFigura[] = a.canales.filter((c) => c.on).map((c) => ({ id: c.canal, nombre: `Canal ${c.canal}` }))
  if (a.matematico) s.push({ id: MATEMATICO, nombre: 'A − B' })
  return s
}


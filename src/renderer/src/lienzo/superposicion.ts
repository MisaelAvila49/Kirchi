import { cajaDeSeleccion } from '../editor/cajaPieza'
import type { Conexiones } from '../conexiones/conexiones'
import { estiloDe } from '../doc/figuras'
import { esDeInstrumento, instrumentoDe, sondaDeEntrada } from '../doc/sondas'
import type { Documento, Figura, Id, Pieza, Punto } from '../doc/tipos'
import { asasDeFigura, type AsaFigura } from '../editor/figuras'
import type { Golpe } from '../editor/indice'
import { tamañoSeleccion, type Seleccion } from '../editor/seleccion'
import type { Fragmento } from '../editor/portapapeles'
import { pinesEnMundo } from '../piezas/transformar'
import type { Caja, PiezaDef } from '../piezas/tipos'
import type { Muestra } from './animaciones'
import { EscritorTrazos, EscritorTriangulos } from './buffers'
import { circulo, dibujarCable, dibujarPieza, rectangulo } from './escena'
import { dibujarFigura, nuevoPresupuesto } from './figuras'
import type { Bandera } from './sondas'
import { pantallaDeMedidor } from './medidores'
import { etiquetasHermanas } from '../ui/textosSonda'
import { ANCHO_CABLE, ANCHO_TRAZO, asasDeNota, CAJA_DESCONOCIDA, cajaNota, desplazarCaja, formaEtiqueta, MARGEN_CAJA, RADIO_ASA, type LadoAsa, type LadoVertical } from './medidas'
import { conAlfa, mezclar, TOKEN_DE_TINTA, type Paleta, type RGBA } from './paleta'

export const ALFA_FANTASMA = 0.45
export const ALFA_HOVER = 0.6
export const ALFA_RECTANGULO = 0.08
export const RADIO_PIN = 0.9
/** Radio de las esquinas del anillo de pulso, en unidades. */
export const RADIO_PULSO = 0.6

export interface EstadoVisual {
  seleccion: Seleccion
  hover: Golpe | null
  fantasma: Pieza | null
  /** La plantilla que sigue al ratón: sus piezas y cables, desplazados a `en`. */
  fantasmaFragmento?: { fragmento: Fragmento; en: Punto } | null
  cableEnCurso: Punto[] | null
  rectangulo: { a: Punto; b: Punto } | null
  /** El fantasma (o lo arrastrado si no hay fantasma) se encimaría con otra pieza. */
  choque?: { con: Id; ref: string } | null
  /** Asa de nota bajo el cursor o en arrastre: se dibuja más grande. */
  asa?: { nota: Id; lado: LadoAsa | null; vert: LadoVertical | null } | null
  /** Píxeles por unidad de mundo: el cuadrito de un asa nunca baja de 4 px de radio (su zona de clic es de 6 px). */
  zoom?: number
  /** Texto de pieza bajo el puntero (contorno tenue) o en arrastre (en color de selección): la caja que se resalta. */
  textoResaltado?: { caja: Caja; arrastrando: boolean } | null
  /** La figura que se está dibujando (herramienta Figura), con su estilo. */
  figuraEnCurso?: Figura | null
  /** Asa de figura bajo el cursor o en arrastre: se dibuja más grande. */
  asaFigura?: { figura: Id; asa: AsaFigura } | null
  /** Las conexiones y las banderas de la escena: con ellas se resaltan las sondas y lo que miden. */
  con?: Conexiones
  banderas?: ReadonlyMap<Id, Bandera>
  /** La sonda que se arrastra: su destino, en rojo si ahí no puede medir. */
  sondaArrastrada?: { id: Id; x: number; y: number; valida: boolean } | null
  /** Tutorial: las piezas esperadas (sombra translúcida, en su giro) y los cables esperados (punteados). */
  guiaTutorial?: GuiaTutorial | null
  /** Piezas, cables y etiquetas que una tarjeta del informe de importación pide ver: se pintan en el tono de la tarjeta y todo lo demás se atenúa. Sin animación. */
  resaltado?: Resaltado | null
}

export interface Resaltado {
  tono: 'ocre' | 'rojo' | 'azul' | 'verdeazul'
  piezas: readonly Id[]
  cables: readonly Id[]
  etiquetas: readonly Id[]
}

/** Cuánto se vela lo que no se resalta. */
export const ALFA_VELO = 0.7
/** Del tono de una tarjeta al color del lienzo que más se le parece. */
const COLOR_DE_TONO = { ocre: 'corriente', rojo: 'invalido', azul: 'seleccion', verdeazul: 'cable' } as const

export interface GuiaTutorial {
  piezas: readonly { tipo: string; x: number; y: number; rot: Pieza['rot']; props?: Readonly<Record<string, string>> }[]
  cables: readonly (readonly Punto[])[]
}

/** Opacidad de la sombra del tutorial: translúcida, se distingue de una pieza real. */
export const ALFA_SOMBRA_TUTORIAL = 0.35

/** Resalte de una sonda: bandera con contorno de selección, cables de lo que mide y, si es de instrumento, anillo en su
 * entrada y línea punteada de la bandera a la entrada. */
function resaltarSonda(t: EscritorTrazos, doc: Documento, lib: Map<string, PiezaDef>, ev: EstadoVisual, id: Id, color: RGBA, saltos?: Map<string, number[]>): void {
  const s = doc.sondas?.[id]
  const b = s?.tipo === 'medidor' ? { caja: pantallaDeMedidor(s).caja } : ev.banderas?.get(id)
  if (!s || !b) return
  const red = ev.con?.redDeSonda.get(id)
  const r = red === undefined ? undefined : ev.con!.redes[red]
  if (r) for (const cid of r.cables) if (doc.cables[cid]) dibujarCable(t, doc.cables[cid], color, saltos, ANCHO_CABLE * 3)
  const c = b.caja
  rectangulo(t, { minX: c.minX - 0.35, minY: c.minY - 0.35, maxX: c.maxX + 0.35, maxY: c.maxY + 0.35 }, ANCHO_TRAZO, color)
  if (!esDeInstrumento(s)) return
  const p = instrumentoDe(doc, s)
  const def = p ? lib.get(p.tipo) : undefined
  const pin = p && def ? pinesEnMundo(p, def).find((q) => q.id === s.entrada) : undefined
  if (!pin) return
  circulo(t, pin.x, pin.y, RADIO_PIN, 0.2, color)
  // La línea punteada de la bandera (su borde más cercano) a la entrada.
  punteada(t, Math.max(c.minX, Math.min(c.maxX, pin.x)), Math.max(c.minY, Math.min(c.maxY, pin.y)), pin.x, pin.y, color)
}

/** Una línea punteada de (x0, y0) a (x1, y1): guiones de 1.2 unidades, hasta 200 guiones. */
function punteada(t: EscritorTrazos, x0: number, y0: number, x1: number, y1: number, color: RGBA): void {
  const n = Math.min(400, Math.floor(Math.hypot(x1 - x0, y1 - y0) / 1.2))
  for (let k = 0; k < n; k += 2) {
    const a = k / n, z = Math.min(1, (k + 1) / n)
    t.segmento(x0 + (x1 - x0) * a, y0 + (y1 - y0) * a, x0 + (x1 - x0) * z, y0 + (y1 - y0) * z, ANCHO_TRAZO * 0.8, color)
  }
}

export interface Superposicion {
  trazos: Float32Array
  nTrazos: number
  triangulos: Float32Array
  nTriangulos: number
  /** Hay asas dibujadas: su tamaño depende del zoom, así que un cambio de cámara obliga a rehacer la superposición. */
  conAsas?: boolean
}

/** Rectángulo de esquinas redondeadas como una sola polilínea cerrada. */
export function rectanguloRedondeado(t: EscritorTrazos, c: Caja, r: number, ancho: number, color: RGBA, lados = 4): void {
  const rr = Math.max(0, Math.min(r, (c.maxX - c.minX) / 2, (c.maxY - c.minY) / 2))
  const pts: number[] = []
  const esquinas: [number, number, number][] = [
    [c.maxX - rr, c.minY + rr, -Math.PI / 2],
    [c.maxX - rr, c.maxY - rr, 0],
    [c.minX + rr, c.maxY - rr, Math.PI / 2],
    [c.minX + rr, c.minY + rr, Math.PI]
  ]
  for (const [cx, cy, a0] of esquinas)
    for (let k = 0; k <= lados; k++) {
      const a = a0 + ((Math.PI / 2) * k) / lados
      pts.push(cx + rr * Math.cos(a), cy + rr * Math.sin(a))
    }
  pts.push(pts[0], pts[1])
  t.polilinea(pts, ancho, color)
}

/** `saltos`: arcos de salto de la escena (`Escena.saltos`), para que el resalte de un cable seleccionado, bajo el cursor o
 * recién terminado siga sus arcos y no pase recto encima. */
export function construirSuperposicion(doc: Documento, lib: Map<string, PiezaDef>, ev: EstadoVisual, paleta: Paleta, anim?: Muestra, saltos?: Map<string, number[]>): Superposicion {
  const t = new EscritorTrazos()
  const tri = new EscritorTriangulos()
  const sel = paleta.seleccion
  const tenue = mezclar(sel, paleta.lienzo, ALFA_HOVER)
  const cajaPieza = (p: Pieza) => {
    const def = lib.get(p.tipo)
    return def ? cajaDeSeleccion(p, def, MARGEN_CAJA) : desplazarCaja(CAJA_DESCONOCIDA, p.x, p.y)
  }

  const r = ev.resaltado
  if (r) {
    const c = paleta[COLOR_DE_TONO[r.tono]]
    const G = 1e6
    const velo = conAlfa(paleta.lienzo, ALFA_VELO)
    tri.triangulo(-G, -G, G, -G, G, G, velo)
    tri.triangulo(-G, -G, G, G, -G, G, velo)
    const relleno = conAlfa(c, 0.18)
    for (const id of r.piezas) {
      const p = doc.piezas[id]
      if (!p) continue
      const cj = cajaPieza(p)
      tri.triangulo(cj.minX, cj.minY, cj.maxX, cj.minY, cj.maxX, cj.maxY, relleno)
      tri.triangulo(cj.minX, cj.minY, cj.maxX, cj.maxY, cj.minX, cj.maxY, relleno)
      dibujarPieza(t, null, p, lib.get(p.tipo), c)
      rectangulo(t, cj, ANCHO_TRAZO, c)
    }
    for (const id of r.cables) if (doc.cables[id]) dibujarCable(t, doc.cables[id], c, saltos)
    for (const id of r.etiquetas) if (doc.etiquetas[id]) t.polilinea(formaEtiqueta(doc.etiquetas[id]), ANCHO_TRAZO, c)
  }

  // Un arrastre que se encimaría pinta lo que se mueve en color inválido.
  const colorSel = ev.choque && !ev.fantasma && !ev.fantasmaFragmento && !ev.cableEnCurso ? paleta.invalido : sel
  for (const id of ev.seleccion.piezas) {
    const p = doc.piezas[id]
    if (p) dibujarPieza(t, null, p, lib.get(p.tipo), colorSel)
  }
  for (const id of ev.seleccion.cables) {
    const c = doc.cables[id]
    if (c) dibujarCable(t, c, colorSel, saltos)
  }
  for (const id of ev.seleccion.etiquetas) {
    const e = doc.etiquetas[id]
    if (e) t.polilinea(formaEtiqueta(e), ANCHO_TRAZO, sel)
  }
  for (const id of ev.seleccion.notas) {
    const n = doc.notas[id]
    if (n) rectangulo(t, cajaNota(n), ANCHO_TRAZO, sel)
  }
  // El resalte de lo seleccionado comparte el presupuesto de la escena: Ctrl+A sobre miles de figuras punteadas no se cuelga.
  const presupuesto = nuevoPresupuesto()
  for (const id of ev.seleccion.figuras) {
    const f = doc.figuras?.[id]
    if (f) dibujarFigura(t, null, f, colorSel, null, presupuesto)
  }
  // Una sola nota seleccionada (y nada más) muestra sus siete asas de tamaño.
  const total = tamañoSeleccion(ev.seleccion)
  const [unica] = ev.seleccion.notas
  const nota = total === 1 && unica ? doc.notas[unica] : undefined
  const base = Math.max(RADIO_ASA, 4 / (ev.zoom ?? Infinity))
  if (nota)
    for (const a of asasDeNota(nota)) {
      const r = ev.asa?.nota === nota.id && ev.asa.lado === a.lado && ev.asa.vert === a.vert ? base * 1.5 : base
      tri.triangulo(a.x - r, a.y - r, a.x + r, a.y - r, a.x + r, a.y + r, sel)
      tri.triangulo(a.x - r, a.y - r, a.x + r, a.y + r, a.x - r, a.y + r, sel)
    }
  // Una sola figura seleccionada (y nada más) muestra sus asas: ocho en la caja, dos en la línea y la flecha.
  const [unicaFigura] = ev.seleccion.figuras
  const figura = total === 1 && unicaFigura ? doc.figuras?.[unicaFigura] : undefined
  if (figura)
    for (const a of asasDeFigura(figura)) {
      const r = ev.asaFigura?.figura === figura.id && ev.asaFigura.asa === a.asa ? base * 1.5 : base
      tri.triangulo(a.x - r, a.y - r, a.x + r, a.y - r, a.x + r, a.y + r, sel)
      tri.triangulo(a.x - r, a.y - r, a.x + r, a.y + r, a.x - r, a.y + r, sel)
    }

  // Las sondas seleccionadas: el contorno de su bandera.
  for (const id of ev.seleccion.sondas) {
    const m = doc.sondas?.[id]
    const caja = m?.tipo === 'medidor' ? pantallaDeMedidor(m).caja : ev.banderas?.get(id)?.caja
    if (caja) rectangulo(t, { minX: caja.minX - 0.35, minY: caja.minY - 0.35, maxX: caja.maxX + 0.35, maxY: caja.maxY + 0.35 }, ANCHO_TRAZO, sel)
  }
  // La sonda arrastrada: un anillo en su destino (en rojo si ahí no mide) y una línea del punto de antes.
  const sa = ev.sondaArrastrada
  if (sa) {
    const color = sa.valida ? sel : paleta.invalido
    circulo(t, sa.x, sa.y, RADIO_PIN, 0.25, color)
    const antes = doc.sondas?.[sa.id]
    if (antes) t.segmento(antes.x, antes.y, sa.x, sa.y, ANCHO_TRAZO * 0.6, mezclar(color, paleta.lienzo, ALFA_HOVER))
  }

  // La referencia o el valor que se tomaría con un clic, o el que se arrastra.
  if (ev.textoResaltado) rectangulo(t, ev.textoResaltado.caja, 0, ev.textoResaltado.arrastrando ? sel : tenue)

  const h = ev.hover
  if (h?.tipo === 'pin') {
    circulo(t, h.x, h.y, RADIO_PIN, 0.2, sel)
    const p = doc.piezas[h.piezaId]
    if (p) rectangulo(t, cajaPieza(p), 0, tenue)
    // La entrada de un instrumento con sonda ilumina su sonda (y la sonda, su entrada).
    const s = sondaDeEntrada(doc, h.piezaId, h.pinId)
    if (s) resaltarSonda(t, doc, lib, ev, s.id, tenue, saltos)
  } else if (h?.tipo === 'sonda') {
    resaltarSonda(t, doc, lib, ev, h.id, tenue, saltos)
  } else if (h?.tipo === 'pieza') {
    const p = doc.piezas[h.id]
    if (p) rectangulo(t, cajaPieza(p), 0, tenue)
  } else if (h?.tipo === 'cable') {
    const c = doc.cables[h.id]
    if (c) dibujarCable(t, c, tenue, saltos)
  } else if (h?.tipo === 'etiqueta') {
    const e = doc.etiquetas[h.id]
    if (e) t.polilinea(formaEtiqueta(e), ANCHO_TRAZO, tenue)
    // Las del mismo nombre: resaltadas, con una línea punteada de esta a cada una («se une con»).
    if (e) for (const id of etiquetasHermanas(doc, h.id)) {
      const o = doc.etiquetas[id]
      t.polilinea(formaEtiqueta(o), ANCHO_TRAZO, tenue)
      punteada(t, e.x, e.y, o.x, o.y, tenue)
    }
  } else if (h?.tipo === 'nota') {
    const n = doc.notas[h.id]
    if (n) rectangulo(t, cajaNota(n), 0, tenue)
  } else if (h?.tipo === 'figura') {
    const f = doc.figuras?.[h.id]
    if (f) dibujarFigura(t, null, f, tenue, null)
  }

  if (anim) {
    for (const [id, dx] of anim.sacudidas) {
      const p = doc.piezas[id]
      const c = p ? undefined : doc.cables[id]
      if (p) dibujarPieza(t, tri, { ...p, x: p.x + dx }, lib.get(p.tipo), paleta.invalido)
      else if (c) dibujarCable(t, { ...c, puntos: c.puntos.map((q) => ({ x: q.x + dx, y: q.y })) }, paleta.invalido)
    }
    // Colores opacos mezclados (no alfa): con alfa las uniones entre tramos se pintan dos veces y el trazo se ve punteado.
    for (const b of anim.brillos) {
      const color = mezclar(sel, paleta.cable, b.alfa)
      for (const id of b.cables) {
        const c = doc.cables[id]
        if (c) dibujarCable(t, c, color, saltos, ANCHO_CABLE * b.ancho)
      }
    }
    for (const pu of anim.pulsos) {
      const cx = (pu.caja.minX + pu.caja.maxX) / 2, cy = (pu.caja.minY + pu.caja.maxY) / 2
      const mx = ((pu.caja.maxX - pu.caja.minX) / 2) * pu.escala, my = ((pu.caja.maxY - pu.caja.minY) / 2) * pu.escala
      rectanguloRedondeado(t, { minX: cx - mx, minY: cy - my, maxX: cx + mx, maxY: cy + my }, RADIO_PULSO * pu.escala, ANCHO_TRAZO, mezclar(sel, paleta.lienzo, pu.alfa))
    }
  }

  if (ev.figuraEnCurso) {
    const f = ev.figuraEnCurso
    dibujarFigura(t, tri, f, paleta[TOKEN_DE_TINTA[estiloDe(f).tinta]], null)
  }
  if (ev.fantasma) {
    const f = ev.fantasma
    const dx = anim?.sacudidas.get(f.id) ?? 0
    const color = ev.choque ? paleta.invalido : mezclar(paleta.pieza, paleta.lienzo, ALFA_FANTASMA)
    dibujarPieza(t, tri, dx ? { ...f, x: f.x + dx } : f, lib.get(f.tipo), color)
  }
  if (ev.fantasmaFragmento) {
    const { fragmento: fr, en } = ev.fantasmaFragmento
    const tenue = mezclar(paleta.pieza, paleta.lienzo, ALFA_FANTASMA)
    const color = ev.choque ? paleta.invalido : tenue
    for (const p of fr.piezas) dibujarPieza(t, tri, { ...p, x: p.x + en.x, y: p.y + en.y }, lib.get(p.tipo), color)
    for (const c of fr.cables) dibujarCable(t, { id: `fantasma:${c.id}`, puntos: c.puntos.map((q) => ({ x: q.x + en.x, y: q.y + en.y })) }, ev.choque ? paleta.invalido : mezclar(paleta.cable, paleta.lienzo, ALFA_FANTASMA))
  }
  if (ev.guiaTutorial) {
    const color = mezclar(paleta.sombraTutorial, paleta.lienzo, ALFA_SOMBRA_TUTORIAL)
    // La sombra es el símbolo exacto de la pieza (el mismo dibujo que en el lienzo), sin cajas ni trazos añadidos.
    ev.guiaTutorial.piezas.forEach((g, i) => {
      const p: Pieza = { id: `sombra:${i}`, tipo: g.tipo, ref: '', x: g.x, y: g.y, rot: g.rot, espejo: false, props: { ...g.props } }
      dibujarPieza(t, tri, p, lib.get(g.tipo), color)
    })
    for (const cable of ev.guiaTutorial.cables)
      for (let k = 0; k + 1 < cable.length; k++) punteada(t, cable[k].x, cable[k].y, cable[k + 1].x, cable[k + 1].y, color)
  }
  if (ev.cableEnCurso) {
    // Un cable en curso que cruzaría una pieza u otra red se pinta en rojo y, si se rechaza, se sacude.
    const dx = anim?.sacudidas.get('en-curso') ?? 0
    const puntos = dx ? ev.cableEnCurso.map((q) => ({ x: q.x + dx, y: q.y })) : ev.cableEnCurso
    dibujarCable(t, { id: 'en-curso', puntos }, ev.choque ? paleta.invalido : paleta.cable)
  }
  if (ev.rectangulo) {
    const { a, b } = ev.rectangulo
    const c = { minX: Math.min(a.x, b.x), minY: Math.min(a.y, b.y), maxX: Math.max(a.x, b.x), maxY: Math.max(a.y, b.y) }
    const f = conAlfa(sel, ALFA_RECTANGULO)
    tri.triangulo(c.minX, c.minY, c.maxX, c.minY, c.maxX, c.maxY, f)
    tri.triangulo(c.minX, c.minY, c.maxX, c.maxY, c.minX, c.maxY, f)
    rectangulo(t, c, 0, sel)
  }

  return { trazos: t.resultado(), nTrazos: t.cuenta, triangulos: tri.resultado(), nTriangulos: tri.cuenta, conAsas: !!nota || !!figura }
}

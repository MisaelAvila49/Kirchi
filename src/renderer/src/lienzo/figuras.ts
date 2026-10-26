import { conCaja, estiloDe } from '../doc/figuras'
import { MM_POR_UNIDAD, type Figura, type Punto } from '../doc/tipos'
import type { Caja } from '../piezas/tipos'
import type { EscritorTrazos, EscritorTriangulos } from './buffers'
import { conAlfa, contraste, mezclar, TOKEN_DE_TINTA, type Paleta, type RGBA } from './paleta'

/** Dibujo de las figuras en unidades de mundo, compartido por la escena (y la exportación), la superposición y el índice
 * de clics. Nada aquí escribe un color: la tinta sale de la paleta del tema. */

/** Ancho del trazo: el grosor de la pluma. */
export const anchoDeFigura = (f: Figura): number => estiloDe(f).grosor / MM_POR_UNIDAD
/** Radio de las esquinas del rectángulo (1 mm); con un lado corto, la mitad de ese lado. */
export const RADIO_ESQUINA = 1 / MM_POR_UNIDAD
/** Medio ángulo de la punta de la flecha. */
export const ANGULO_PUNTA = (24 * Math.PI) / 180
/** Largo de la punta: 2 mm o 5.7 grosores, lo que sea mayor. */
export const largoPunta = (f: Figura): number => Math.max(2, 5.7 * estiloDe(f).grosor) / MM_POR_UNIDAD
/** Opacidad del relleno suave. */
export const ALFA_RELLENO = { claro: 0.07, oscuro: 0.12 } as const
/** Al simular las figuras van a media opacidad. */
export const ATENUACION = 0.5

const NEGRO: RGBA = [0, 0, 0, 1]
const BLANCO: RGBA = [1, 1, 1, 1]
/** El relleno de un lienzo claro (el papel, y siempre la exportación) o de uno oscuro. */
export const alfaRelleno = (p: Paleta): number => (contraste(p.lienzo, NEGRO) >= contraste(p.lienzo, BLANCO) ? ALFA_RELLENO.claro : ALFA_RELLENO.oscuro)

/** Guiones de 6 grosores con huecos de 4; puntos (trazo de largo cero) cada 3.5 grosores; continuo, null. */
export function patronDe(f: Figura): { trazo: number; hueco: number } | null {
  const e = estiloDe(f)
  const g = e.grosor / MM_POR_UNIDAD
  if (e.trazo === 'guiones') return { trazo: 6 * g, hueco: 4 * g }
  if (e.trazo === 'puntos') return { trazo: 0, hueco: 3.5 * g }
  return null
}

/** Piezas de patrón (guiones o puntos) por figura, como mucho; más allá se dibuja continua. */
export const MAX_PIEZAS_PATRON = 4000

/** Tramos que dibujan entre todas las figuras de una escena (lienzo y exportación igual). Pasado el tope, las figuras
 * siguientes van continuas y la elipse con lados mínimos, y la escena lo dice (`figurasSimplificadas`): un `.kir`
 * alterado no cuelga la ventana. */
export const MAX_TRAMOS_FIGURAS = 300_000
export interface Presupuesto {
  restante: number
  /** Alguna figura se dibujó más simple de lo que pide su estilo. */
  agotado: boolean
}
export const nuevoPresupuesto = (tramos = MAX_TRAMOS_FIGURAS): Presupuesto => ({ restante: tramos, agotado: false })

/** Lados de la elipse: uno cada 0.4 unidades de perímetro (Ramanujan), de 24 a 256. */
export function ladosElipse(a: number, b: number): number {
  const h = ((a - b) / (a + b)) ** 2
  const perimetro = Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)))
  return Math.max(24, Math.min(256, Math.ceil(perimetro / 0.4)))
}

/** Rectángulo de esquinas redondeadas como polilínea cerrada, cuatro tramos por esquina (como `rectanguloRedondeado`). */
function cajaRedondeada(x1: number, y1: number, x2: number, y2: number): number[] {
  const r = Math.min(RADIO_ESQUINA, (x2 - x1) / 2, (y2 - y1) / 2)
  const pts: number[] = []
  const esquinas: [number, number, number][] = [
    [x2 - r, y1 + r, -Math.PI / 2],
    [x2 - r, y2 - r, 0],
    [x1 + r, y2 - r, Math.PI / 2],
    [x1 + r, y1 + r, Math.PI]
  ]
  for (const [cx, cy, a0] of esquinas)
    for (let k = 0; k <= 4; k++) {
      const a = a0 + (Math.PI / 2) * (k / 4)
      pts.push(cx + r * Math.cos(a), cy + r * Math.sin(a))
    }
  pts.push(pts[0], pts[1])
  return pts
}

function elipse(x1: number, y1: number, x2: number, y2: number, simple = false): number[] {
  const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2, a = (x2 - x1) / 2, b = (y2 - y1) / 2
  const n = simple ? ladosElipse(1, 1) : ladosElipse(a, b)
  const pts: number[] = []
  for (let k = 0; k < n; k++) {
    const t = (2 * Math.PI * k) / n
    pts.push(cx + a * Math.cos(t), cy + b * Math.sin(t))
  }
  pts.push(pts[0], pts[1])
  return pts
}

/** Trazos de la figura como polilíneas planas [x0, y0, x1, y1, …]: caja redondeada o elipse (cerradas) o tramo de línea.
 * El de la flecha se acorta bajo cada punta llena para que su extremo redondo no asome. */
export function contornosDe(f: Figura, simple = false): number[][] {
  if (f.tipo === 'rectangulo') return [cajaRedondeada(f.x1, f.y1, f.x2, f.y2)]
  if (f.tipo === 'elipse') return [elipse(f.x1, f.y1, f.x2, f.y2, simple)]
  if (f.tipo === 'linea') return [[f.x1, f.y1, f.x2, f.y2]]
  const punta = estiloDe(f).punta
  const dx = f.x2 - f.x1, dy = f.y2 - f.y1, l = Math.hypot(dx, dy)
  if (!(l > 0)) return [[f.x1, f.y1, f.x2, f.y2]]
  const ux = dx / l, uy = dy / l
  const corte = Math.min(largoPunta(f) * 0.6, l / 2)
  const fin = punta === 'abierta' ? 0 : corte
  const ini = punta === 'dos' ? corte : 0
  return [[f.x1 + ux * ini, f.y1 + uy * ini, f.x2 - ux * fin, f.y2 - uy * fin]]
}

/** Puntas de una flecha como [atrás1, punta, atrás2]: triángulo lleno (dos en «dos puntas») o las dos rayas de una punta
 * abierta. Ninguna en otras figuras. */
export function puntasDe(f: Figura): { llenas: number[][]; abiertas: number[][] } {
  if (f.tipo !== 'flecha') return { llenas: [], abiertas: [] }
  const L = largoPunta(f)
  const punta = (px: number, py: number, qx: number, qy: number): number[] => {
    const ang = Math.atan2(py - qy, px - qx)
    const a1 = ang + Math.PI - ANGULO_PUNTA, a2 = ang + Math.PI + ANGULO_PUNTA
    return [px + L * Math.cos(a1), py + L * Math.sin(a1), px, py, px + L * Math.cos(a2), py + L * Math.sin(a2)]
  }
  const fin = punta(f.x2, f.y2, f.x1, f.y1)
  const p = estiloDe(f).punta
  if (p === 'abierta') return { llenas: [], abiertas: [fin] }
  if (p === 'dos') return { llenas: [fin, punta(f.x1, f.y1, f.x2, f.y2)], abiertas: [] }
  return { llenas: [fin], abiertas: [] }
}

/** Recorre la polilínea `pts`: con `trazo` > 0 emite tramos de ese largo separados por `hueco` (el patrón sigue por las
 * esquinas); con `trazo` 0 emite un punto (tramo de largo cero, redondo en el lienzo y círculo en el SVG) cada `hueco`. */
export function conPatron(
  pts: ArrayLike<number>,
  patron: { trazo: number; hueco: number },
  emitir: (x0: number, y0: number, x1: number, y1: number) => void,
  presupuesto?: Presupuesto
): void {
  const periodo = patron.trazo + patron.hueco
  if (!(periodo > 0)) return
  // Tope de piezas (un `.kir` admite coordenadas de 2^20 y una figura así daría millones de puntos):
  // pasado el tope de la figura o lo que le queda a la escena, la figura se dibuja continua.
  let largo = 0
  for (let i = 2; i + 1 < pts.length; i += 2) largo += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1])
  const piezas = Math.ceil(largo / periodo) + pts.length / 2
  const sinPresupuesto = presupuesto !== undefined && piezas > presupuesto.restante
  if (largo / periodo > MAX_PIEZAS_PATRON || sinPresupuesto) {
    if (presupuesto) {
      if (sinPresupuesto) presupuesto.agotado = true
      presupuesto.restante -= pts.length / 2 - 1
    }
    for (let i = 2; i + 1 < pts.length; i += 2) emitir(pts[i - 2], pts[i - 1], pts[i], pts[i + 1])
    return
  }
  if (presupuesto) presupuesto.restante -= piezas
  if (patron.trazo === 0) {
    let siguiente = 0, recorrido = 0
    for (let i = 2; i + 1 < pts.length; i += 2) {
      const ax = pts[i - 2], ay = pts[i - 1], bx = pts[i], by = pts[i + 1]
      const l = Math.hypot(bx - ax, by - ay)
      while (siguiente <= recorrido + l + 1e-9) {
        const t = l > 0 ? (siguiente - recorrido) / l : 0
        const x = ax + (bx - ax) * t, y = ay + (by - ay) * t
        emitir(x, y, x, y)
        siguiente += patron.hueco
      }
      recorrido += l
    }
    return
  }
  let fase = 0
  for (let i = 2; i + 1 < pts.length; i += 2) {
    const ax = pts[i - 2], ay = pts[i - 1], bx = pts[i], by = pts[i + 1]
    const l = Math.hypot(bx - ax, by - ay)
    let s = 0
    while (s < l - 1e-9) {
      const enTrazo = fase < patron.trazo
      const paso = Math.min((enTrazo ? patron.trazo : periodo) - fase, l - s)
      if (enTrazo) {
        const t0 = s / l, t1 = (s + paso) / l
        emitir(ax + (bx - ax) * t0, ay + (by - ay) * t0, ax + (bx - ax) * t1, ay + (by - ay) * t1)
      }
      // Lo que falta del guion en curso, no una fase que se queda sin avanzar por un resto de coma flotante.
      if (!(paso > 0)) break
      s += paso
      fase += paso
      if (fase >= periodo - 1e-9) fase = 0
    }
  }
}

/** Una figura en `color`. Con `tri` y `relleno` agrega su relleno suave (abanico desde el centro: la caja redondeada y la
 * elipse son convexas) y las puntas llenas. Sin `tri` (resalte) solo contornos. Las puntas van siempre continuas. */
export function dibujarFigura(t: EscritorTrazos, tri: EscritorTriangulos | null, f: Figura, color: RGBA, relleno: RGBA | null, presupuesto?: Presupuesto): void {
  const ancho = anchoDeFigura(f)
  // Sin presupuesto para la escena: continua y con los lados mínimos.
  const simple = presupuesto !== undefined && presupuesto.restante <= 0
  if (simple && presupuesto) presupuesto.agotado = true
  const patron = simple ? null : patronDe(f)
  const contornos = contornosDe(f, simple)
  if (tri && relleno && estiloDe(f).relleno && conCaja(f.tipo)) {
    const c = contornos[0]
    const cx = (f.x1 + f.x2) / 2, cy = (f.y1 + f.y2) / 2
    for (let i = 2; i + 1 < c.length; i += 2) tri.triangulo(cx, cy, c[i - 2], c[i - 1], c[i], c[i + 1], relleno)
  }
  for (const c of contornos) {
    if (patron) conPatron(c, patron, (x0, y0, x1, y1) => t.segmento(x0, y0, x1, y1, ancho, color), presupuesto)
    else {
      t.polilinea(c, ancho, color)
      if (presupuesto) presupuesto.restante -= c.length / 2 - 1
    }
  }
  const { llenas, abiertas } = puntasDe(f)
  for (const p of llenas) {
    if (tri) tri.triangulo(p[0], p[1], p[2], p[3], p[4], p[5], color)
    t.polilinea([p[0], p[1], p[2], p[3], p[4], p[5], p[0], p[1]], ancho, color)
  }
  for (const p of abiertas) t.polilinea(p, ancho, color)
}

/** Figuras (en su orden de dibujo) con su tinta. Opacidad y `atenuar` (a la mitad al simular) se multiplican: el trazo va
 * mezclado con el lienzo (opaco, para no pintar dos veces las uniones) y el relleno con su alfa.
 * `sinOpacidad` (contraste alto de Windows) las dibuja opacas, y la atenuación al simular sigue. */
export function dibujarFiguras(
  t: EscritorTrazos,
  tri: EscritorTriangulos,
  figuras: readonly Figura[],
  paleta: Paleta,
  atenuar = false,
  presupuesto: Presupuesto = nuevoPresupuesto(),
  sinOpacidad = false
): void {
  const base = atenuar ? ATENUACION : 1
  const alfa = alfaRelleno(paleta)
  for (const f of figuras) {
    const e = estiloDe(f)
    const tinta = paleta[TOKEN_DE_TINTA[e.tinta]]
    const k = base * (sinOpacidad ? 1 : e.opacidad / 100)
    dibujarFigura(t, tri, f, k < 1 ? mezclar(tinta, paleta.lienzo, k) : tinta, conAlfa(tinta, alfa * k), presupuesto)
  }
}

function distanciaASegmento(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay
  const l2 = dx * dx + dy * dy
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/** Distancia de `p` al trazo de la figura (al contorno, no al interior); la flecha cuenta su tramo entero hasta la punta. */
export function distanciaAFigura(f: Figura, p: Punto): number {
  const pts = f.tipo === 'flecha' ? [f.x1, f.y1, f.x2, f.y2] : contornosDe(f)[0]
  let d = Infinity
  for (let i = 2; i + 1 < pts.length; i += 2) d = Math.min(d, distanciaASegmento(p.x, p.y, pts[i - 2], pts[i - 1], pts[i], pts[i + 1]))
  return d
}

/** El tramo de (ax, ay) a (bx, by) pasa por la caja (recorte de Liang y Barsky). */
function tramoTocaCaja(ax: number, ay: number, bx: number, by: number, c: Caja): boolean {
  let t0 = 0, t1 = 1
  const dx = bx - ax, dy = by - ay
  for (const [p, q] of [[-dx, ax - c.minX], [dx, c.maxX - ax], [-dy, ay - c.minY], [dy, c.maxY - ay]] as const) {
    if (p === 0) {
      if (q < 0) return false
    } else {
      const r = q / p
      if (p < 0) t0 = Math.max(t0, r)
      else t1 = Math.min(t1, r)
      if (t0 > t1) return false
    }
  }
  return true
}

/** El trazo de la figura pasa por la caja `c` (rectángulo de selección cruzando): su contorno y no su interior, para que
 * un rectángulo dentro de un marco de sección no tome el marco. Cuenta medio grosor. */
export function figuraTocaCaja(f: Figura, c: Caja): boolean {
  const m = anchoDeFigura(f) / 2
  const r: Caja = { minX: c.minX - m, minY: c.minY - m, maxX: c.maxX + m, maxY: c.maxY + m }
  const { llenas, abiertas } = puntasDe(f)
  const lineas = [f.tipo === 'flecha' ? [f.x1, f.y1, f.x2, f.y2] : contornosDe(f)[0], ...llenas, ...abiertas]
  for (const pts of lineas) for (let i = 2; i + 1 < pts.length; i += 2) if (tramoTocaCaja(pts[i - 2], pts[i - 1], pts[i], pts[i + 1], r)) return true
  return false
}

/** Caja de lo que dibuja la figura: sus extremos con medio grosor y, en la flecha, el ancho de la punta. */
export function cajaFigura(f: Figura): Caja {
  const m = anchoDeFigura(f) / 2 + (f.tipo === 'flecha' ? largoPunta(f) * Math.sin(ANGULO_PUNTA) : 0)
  return { minX: Math.min(f.x1, f.x2) - m, minY: Math.min(f.y1, f.y2) - m, maxX: Math.max(f.x1, f.x2) + m, maxY: Math.max(f.y1, f.y2) + m }
}

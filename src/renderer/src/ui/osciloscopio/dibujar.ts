import type { Tema, TonoFigura } from '../../../../compartido/ajustes'
import { tamTextoMax, type EstiloEje } from '../../../../compartido/grafica/anotaciones'
import type { Decimales, EstiloRejilla, LadoEjeY, PesoTexto, PrefijoEje } from '../../../../compartido/grafica/aspecto'
import { CANALES, DIVISIONES_H, DIVISIONES_V, MATEMATICO, type AjustesOsciloscopio, type Canal, type CanalOMatematico } from '../../instrumentos/ajustes'
import { tokensDeTema } from '../../lienzo/paleta'
import { CIFRAS_COLUMNA, type PantallaSab } from '../../sim/protocoloInstrumentos'
import { colorDeCanal, coloresDeTema, TONO_CANAL } from '../colores'
import { lecturaCursores, type CualCursor } from './cursores'
import { conversorXY, lecturaCursoresXY } from './xy'
import type { LecturaOsc } from './lectura'
import { escalaDeTexto } from '../../../../compartido/grafica/aspecto'
import { marcaHorizontalXY, marcasDeCero, marcoDePantalla, rotulosHorizontal, rotulosMarcas, rotulosTiempo, rotulosVoltaje, type Marco, type OpcionesMarco } from './marco'
import { conAlfa } from '../exportar/color'

/** Lo que se usa del contexto de Canvas2D (las pruebas lo reemplazan por uno que anota). */
export type Lienzo2D = Pick<
  CanvasRenderingContext2D,
  | 'fillStyle' | 'strokeStyle' | 'lineWidth' | 'font' | 'textAlign' | 'textBaseline' | 'fillRect' | 'beginPath' | 'moveTo' | 'lineTo' | 'stroke' | 'fill' | 'closePath' | 'rect' | 'clip' | 'save' | 'restore' | 'setLineDash' | 'fillText'
  | 'translate' | 'measureText'
>

export interface ColoresPantalla {
  fondo: string
  reticula: string
  ejes: string
  texto: string
  canal: Readonly<Record<CanalOMatematico, string>>
  /** El color de las cifras, letras y marcas de cada canal (4.5:1 sobre el fondo): el de `-texto` de su tono. */
  canalTexto: Readonly<Record<CanalOMatematico, string>>
  /** El color de las letras de un tono cualquiera (el texto de los ejes elegido aparte de los canales, N8b). */
  letra?: (t: TonoFigura) => string
}

/** Los colores de la pantalla: siguen el tema; para exportar, los del tema claro sobre blanco. */
export function coloresPantalla(tema: Tema, exportar = false, tonos: Readonly<Partial<Record<CanalOMatematico, TonoFigura | null>>> = {}): ColoresPantalla {
  const t: Tema = exportar ? 'claro' : tema
  const L = tokensDeTema(t)
  const T = coloresDeTema(t)
  const todos: CanalOMatematico[] = [...CANALES, MATEMATICO]
  // Un tono elegido (por ejemplo el negro) sustituye al del canal; sin él queda el de siempre.
  const canal = Object.fromEntries(todos.map((c) => [c, tonos[c] ? T[tonos[c]!] : colorDeCanal(t, c)])) as Record<CanalOMatematico, string>
  const canalTexto = Object.fromEntries(todos.map((c) => [c, tonos[c] ? T[`${tonos[c]}-texto`] : c === MATEMATICO ? L.textoSecundario : T[`${TONO_CANAL[c]}-texto`]])) as Record<CanalOMatematico, string>
  return { fondo: exportar ? L.paneles : L.lienzo, reticula: L.rejillaMenor, ejes: L.rejillaMayor, texto: L.textoSecundario, canal, canalTexto, letra: (t) => T[`${t}-texto`] }
}

/** Los cursores: tiempos absolutos (s) y voltajes en la escala del canal elegido. */
export interface CursoresPantalla {
  canal: CanalOMatematico
  t: readonly [number, number] | null
  v: readonly [number, number] | null
  /** En la pantalla X-Y los cursores son dos puntos de la curva, en voltios de los dos canales; `t` y `v` van vacíos. */
  xy?: readonly [{ x: number; y: number }, { x: number; y: number }] | null
}

/** Las letras de la pantalla: la pila de los títulos y las letras, la de las cifras y el tamaño base en px. */
export interface Tipografia {
  titulo: string
  cifras: string
  px: number
}
export const TIPOGRAFIA_POR_OMISION: Tipografia = { titulo: '"Mona Sans Variable", system-ui, sans-serif', cifras: '"Geist Mono Variable", monospace', px: 11 }

/** El estilo de la pantalla que no es de los datos: letras de los ejes, rejilla, grosor y unidad mostrada de cada canal. */
export interface EstiloPantalla {
  /** Tono de las letras de los ejes; null es el de cada canal. */
  textoTono: TonoFigura | null
  textoPeso: PesoTexto
  /** Tamaño en px de las letras y cifras de los ejes; null, el de la tipografía. */
  textoTam?: number | null
  /** Una captura recortada al exportar: dónde parte el eje del tiempo (en el eje de la figura) y si se cuenta desde el disparo. */
  tiempoDesde?: { valor: number; alDisparo: boolean } | null
  rejillaEstilo: EstiloRejilla
  /** Subdivisiones de cada eje: partes entre dos divisiones; ausente o null, ninguna. */
  subdivisionesX?: number | null
  subdivisionesY?: number | null
  /** Prefijo de las cifras del eje del tiempo; null, el de la base. */
  prefijoX: PrefijoEje | null
  /** Decimales de las cifras del eje del tiempo; ausente, 2. */
  decimalesX?: Decimales
  /** Un tramo exportado: las marcas del eje del tiempo en valores redondos, dentro del tramo (`valores` en el eje de la figura, `dominio` lo que abarca la pantalla). */
  marcasTiempo?: { valores: readonly number[]; paso: number; dominio: { min: number; max: number } }
  /** Grosor general de las rayitas de los ejes y de la rejilla en px; ausente, 1. */
  grosorEjes?: number
  grosorRejilla?: number
  /** Por canal: grosor propio de la línea y prefijo de las cifras de su escala. */
  canales: Readonly<Partial<Record<string, { grosor?: number | null; prefijo?: PrefijoEje | null; decimales?: Decimales }>>>
  /** El estilo propio de cada eje al exportar (título, tono, grosor y tamaño de sus números): `x` y, por canal, su letra. */
  ejes?: Readonly<Record<string, EstiloEje>>
}

export interface OpcionesDibujo {
  /** Píxeles de dispositivo por píxel CSS: grosores y letras. */
  dpr: number
  cursores?: CursoresPantalla | null
  /** Sin retícula ni ejes centrales (la rejilla apagada al exportar): quedan el fondo, las escalas y las trazas. */
  sinReticula?: boolean
  /** Otras letras (al exportar); sin ella, las de siempre. */
  tipografia?: Tipografia
  /** El cursor que se va a tomar (el puntero encima), se arrastra o el que mueven las flechas: más grueso y continuo. */
  resaltado?: CualCursor | null
  /**
   * Pantalla: retícula dentro del marco de `marco.ts`, con escalas, eje del tiempo arriba, marcas de 0 V y letra de cada traza. Sin marco, la retícula ocupa todo el lienzo.
   */
  ejes?: boolean
  /** Rayitas en los ejes: en el borde de la retícula, junto a las cifras de cada eje. */
  marcas?: boolean
  /** Grosor de las trazas en px CSS; sin él, 1.5 como siempre. */
  grosor?: number
  /** De qué lado va la escala de cada canal y dónde va el eje del tiempo; sin ellos, a la izquierda y arriba como siempre. */
  marco?: OpcionesMarco
  /** Letras, rejilla, grosores y unidades; sin él, lo de siempre. */
  estilo?: EstiloPantalla
  /** Las asas para mover los ejes (solo en pantalla: la captura exportada no las lleva). */
  asas?: boolean
  /** Lo que el puntero lee ahora (la cruz y el valor de cada canal); solo en pantalla. */
  lectura?: LecturaOsc | null
  /** Los cursores con todos sus datos (1/Δt y los dos valores de cada uno); sin esto, solo las diferencias. */
  detalleCursores?: boolean
  /** El resplandor de fósforo: cada traza lleva debajo un halo ancho y translúcido. */
  resplandor?: boolean
}

let dibujos = 0
/** Cuántas veces se dibujó una pantalla (la sonda de las pruebas:, ningún dibujo en reposo). */
export const dibujosDePantalla = (): number => dibujos

const DIVISIONES_MARCA = 5
export const BANDERA_VACIA = 8

/** Dónde caen (0 a 1) las marcas redondas del tiempo de un tramo exportado; undefined si la pantalla usa sus diez divisiones. */
function fraccionesDe(e: EstiloPantalla | undefined): number[] | undefined {
  const m = e?.marcasTiempo
  return m ? m.valores.map((v) => (v - m.dominio.min) / (m.dominio.max - m.dominio.min)) : undefined
}

function reticula(ctx: Lienzo2D, W: number, H: number, c: ColoresPantalla, dpr: number, estilo: EstiloRejilla = 'lineas', subX?: number | null, subY?: number | null, grosor = 1, fraccionesX?: readonly number[]): void {
  const dx = W / DIVISIONES_H
  const dy = H / DIVISIONES_V
  ctx.lineWidth = grosor * dpr
  ctx.strokeStyle = c.reticula
  ctx.setLineDash(estilo === 'guiones' ? [4 * dpr, 4 * dpr] : [])
  if (estilo === 'puntos') {
    // Un punto en cada cruce de la rejilla: el mismo lugar que las líneas, con menos tinta.
    ctx.fillStyle = c.ejes
    const lado = Math.max(1, Math.round(1.5 * dpr))
    for (let i = 1; i < DIVISIONES_H; i++)
      for (let j = 1; j < DIVISIONES_V; j++) ctx.fillRect(Math.round(i * dx - lado / 2), Math.round(j * dy - lado / 2), lado, lado)
  } else {
    ctx.beginPath()
    if (estilo !== 'horizontal')
      for (const f of fraccionesX ?? Array.from({ length: DIVISIONES_H - 1 }, (_, i) => (i + 1) / DIVISIONES_H)) {
        if (f <= 0 || f >= 1) continue
        ctx.moveTo(Math.round(f * W) + 0.5, 0)
        ctx.lineTo(Math.round(f * W) + 0.5, H)
      }
    if (estilo !== 'vertical')
      for (let i = 1; i < DIVISIONES_V; i++) {
        ctx.moveTo(0, Math.round(i * dy) + 0.5)
        ctx.lineTo(W, Math.round(i * dy) + 0.5)
      }
    ctx.stroke()
  }
  // Las subdivisiones de cada eje: rayas más tenues entre una división y la siguiente. Los puntos no las llevan.
  if (estilo !== 'puntos') {
    const nx = estilo === 'horizontal' || fraccionesX ? 0 : (subX ?? 1)
    const ny = estilo === 'vertical' ? 0 : (subY ?? 1)
    if (nx > 1 || ny > 1) {
      ctx.strokeStyle = conAlfa(c.reticula, 0.5)
      ctx.beginPath()
      if (nx > 1)
        for (let i = 0; i < DIVISIONES_H * nx; i++) {
          if (i % nx === 0) continue
          ctx.moveTo(Math.round((i * dx) / nx) + 0.5, 0)
          ctx.lineTo(Math.round((i * dx) / nx) + 0.5, H)
        }
      if (ny > 1)
        for (let i = 0; i < DIVISIONES_V * ny; i++) {
          if (i % ny === 0) continue
          ctx.moveTo(0, Math.round((i * dy) / ny) + 0.5)
          ctx.lineTo(W, Math.round((i * dy) / ny) + 0.5)
        }
      ctx.stroke()
    }
  }
  ctx.setLineDash([])
  // Los ejes centrales con sus marcas de quinto de división.
  ctx.strokeStyle = c.ejes
  ctx.beginPath()
  const [cx, cy] = [Math.round(W / 2) + 0.5, Math.round(H / 2) + 0.5]
  ctx.moveTo(cx, 0)
  ctx.lineTo(cx, H)
  ctx.moveTo(0, cy)
  ctx.lineTo(W, cy)
  const m = 3 * dpr
  for (let i = 1; i < DIVISIONES_H * DIVISIONES_MARCA; i++) {
    const x = Math.round((i * dx) / DIVISIONES_MARCA) + 0.5
    ctx.moveTo(x, cy - m)
    ctx.lineTo(x, cy + m)
  }
  for (let i = 1; i < DIVISIONES_V * DIVISIONES_MARCA; i++) {
    const y = Math.round((i * dy) / DIVISIONES_MARCA) + 0.5
    ctx.moveTo(cx - m, y)
    ctx.lineTo(cx + m, y)
  }
  ctx.stroke()
}

export interface Traza {
  id: CanalOMatematico
  /** Su bloque de columnas en la pantalla (A a D y A − B). */
  i: number
  vdiv: number
  pos: number
  /** La letra de su marca de tierra: con el acoplamiento si no es DC («A AC», «B GND»), para que se vea en la pantalla. */
  letra: string
}

/** Las trazas encendidas; A − B con la escala del canal A. */
export function trazas(a: AjustesOsciloscopio): Traza[] {
  const t: Traza[] = a.canales.flatMap((k, i) => (k.on ? [{ id: k.canal, i, vdiv: k.vdiv, pos: k.pos, letra: k.acople === 'DC' ? k.canal : `${k.canal} ${k.acople}` }] : []))
  // A − B con la escala de A y su posición: así se lee contra la columna de A.
  if (a.matematico) t.push({ id: MATEMATICO, i: CANALES.length, vdiv: a.canales[0].vdiv, pos: a.canales[0].pos, letra: 'A−B' })
  return t
}

/**
 * Dibuja la pantalla `p` con los ajustes `a` en un lienzo de `W` por `H` píxeles de dispositivo. Sin pantalla, fondo, retícula y, con `ejes`, sus escalas.
 */
export function dibujarPantalla(ctx: Lienzo2D, p: PantallaSab | null, a: AjustesOsciloscopio, W: number, H: number, c: ColoresPantalla, o: OpcionesDibujo): void {
  dibujos++
  TIP = o.tipografia ?? TIPOGRAFIA_POR_OMISION
  PX_EJE = o.estilo?.textoTam ?? TIP.px
  ESC = escalaDeTexto(tamTextoMax(o.estilo?.textoTam, o.estilo?.ejes))
  ctx.fillStyle = c.fondo
  ctx.fillRect(0, 0, W, H)
  const m = o.ejes ? marcoDePantalla(a, W, H, o.dpr, { ...o.marco, escalaTexto: ESC }) : null
  if (m) {
    ctx.save()
    ctx.translate(m.x, m.y)
  }
  const [w, h] = m ? [m.w, m.h] : [W, H]
  if (!o.sinReticula) reticula(ctx, w, h, c, o.dpr, o.estilo?.rejillaEstilo, o.estilo?.subdivisionesX, o.estilo?.subdivisionesY, o.estilo?.grosorRejilla, fraccionesDe(o.estilo))
  const conPantalla = !!p && p.ncol > 0 && Number.isFinite(p.t0)
  const xy = canalesXY(a)
  if (conPantalla && xy) dibujarXY(ctx, p!, a, xy, w, h, c, o)
  const ultimos = conPantalla && !xy ? dibujarTrazas(ctx, p!, a, w, h, c, o) : new Map<CanalOMatematico, number>()
  if (m) {
    if (conPantalla && !xy) marcaDeDisparo(ctx, p!, a, w, c, o.dpr)
    ctx.restore()
    dibujarEjes(ctx, m, a, conPantalla ? p : null, c, ultimos, !!o.marcas, o)
    if (o.lectura) dibujarLectura(ctx, o.lectura, m, c, o.dpr)
    return
  }
  if (conPantalla) marcasInternas(ctx, p!, a, W, H, c, o.dpr)
}

/** Los canales de la pantalla X-Y, el horizontal y el vertical (B/A: A en X y B en Y); null en el modo de tiempo. */
export function canalesXY(a: Pick<AjustesOsciloscopio, 'modoXY'>): readonly [Canal, Canal] | null {
  return a.modoXY === 'ba' ? ['A', 'B'] : a.modoXY === 'ab' ? ['B', 'A'] : null
}

/**
 * Pantalla X-Y (Lissajous): cada canal con su escala y posición. Cada columna aporta dos puntos; la que le falta un canal corta la línea.
 */
function dibujarXY(ctx: Lienzo2D, p: PantallaSab, a: AjustesOsciloscopio, [cx, cy]: readonly [Canal, Canal], W: number, H: number, c: ColoresPantalla, o: OpcionesDibujo): void {
  const [kx, ky] = [a.canales.find((k) => k.canal === cx)!, a.canales.find((k) => k.canal === cy)!]
  const [ix, iy] = [CANALES.indexOf(cx), CANALES.indexOf(cy)]
  const [dx, dy] = [W / DIVISIONES_H, H / DIVISIONES_V]
  const X = (v: number) => Math.max(-W, Math.min(2 * W, W / 2 + (v / kx.vdiv + kx.pos) * dx))
  const Y = (v: number) => Math.max(-H, Math.min(2 * H, H / 2 - (v / ky.vdiv + ky.pos) * dy))
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, W, H)
  ctx.clip()
  ctx.lineWidth = Math.max(1, (o.estilo?.canales[cy]?.grosor ?? o.grosor ?? 1.5) * o.dpr)
  ctx.strokeStyle = c.canal[cy]
  ctx.setLineDash([])
  ctx.beginPath()
  let abierta = false
  const col = p.columnas
  for (let j = 0; j < p.ncol; j++) {
    const [qx, qy] = [(ix * p.ncol + j) * CIFRAS_COLUMNA, (iy * p.ncol + j) * CIFRAS_COLUMNA]
    if (col[qx + 4] & BANDERA_VACIA || col[qy + 4] & BANDERA_VACIA) {
      abierta = false
      continue
    }
    for (const k of [2, 3]) {
      const [x, y] = [X(col[qx + k]), Y(col[qy + k])]
      if (abierta) ctx.lineTo(x, y)
      else ctx.moveTo(x, y)
      abierta = true
    }
  }
  ctx.stroke()
  if (o.cursores?.xy) cursoresXY(ctx, o.cursores.xy, a, W, H, c, o)
  ctx.restore()
  if (o.cursores?.xy && o.ejes) lecturaDeCursores(ctx, o.cursores, p, a, W, c, o.dpr, o.detalleCursores === true)
}

/** Los dos cursores de la pantalla X-Y: una cruz discontinua y un cuadro sobre cada punto, en el color del canal vertical. */
function cursoresXY(ctx: Lienzo2D, q: NonNullable<CursoresPantalla['xy']>, a: AjustesOsciloscopio, W: number, H: number, c: ColoresPantalla, o: OpcionesDibujo): void {
  const conv = conversorXY(a, { x: 0, y: 0, w: W, h: H })
  const d = o.dpr
  const cy = canalesXY(a)![1]
  ctx.strokeStyle = c.canal[cy]
  for (const i of [0, 1] as const) {
    const [x, y] = conv(q[i].x, q[i].y)
    const grueso = !!o.resaltado && (o.resaltado.endsWith('1') ? 0 : 1) === i
    ctx.setLineDash(grueso ? [] : [3 * d, 3 * d])
    ctx.lineWidth = grueso ? Math.max(2, 2.5 * d) : d
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, H)
    ctx.moveTo(0, y)
    ctx.lineTo(W, y)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = c.fondo
    ctx.fillRect(x - 5 * d, y - 5 * d, 10 * d, 10 * d)
    ctx.lineWidth = d
    ctx.beginPath()
    ctx.rect(x - 4 * d, y - 4 * d, 8 * d, 8 * d)
    ctx.stroke()
    ctx.fillStyle = c.canalTexto[cy]
    ctx.font = FUENTE_CIFRAS(d)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'bottom'
    ctx.fillText(String(i + 1), x + 7 * d, y - 4 * d)
  }
}

/** Las trazas encendidas y los cursores dentro de un rectángulo de `W` por `H`; da la altura del último punto de cada traza. */
function dibujarTrazas(ctx: Lienzo2D, p: PantallaSab, a: AjustesOsciloscopio, W: number, H: number, c: ColoresPantalla, o: OpcionesDibujo): Map<CanalOMatematico, number> {
  const div = H / DIVISIONES_V
  const span = DIVISIONES_H * a.base
  // Cada columna ocupa el tiempo que dura (dt) sobre lo que abarca la base de ahora: si el lector acercó o alejó y la pantalla que
  // llegó del motor es de la base anterior, la traza se estira o se encoge en el acto; con la misma base es W / ncol.
  const sx = p.dt > 0 && Number.isFinite(p.dt) ? (p.dt / span) * W : W / p.ncol
  const lista = trazas(a)
  const yDe = (t: Traza) => (v: number) => Math.max(-H, Math.min(2 * H, H / 2 - (v / t.vdiv + t.pos) * div))
  const ultimos = new Map<CanalOMatematico, number>()
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, W, H)
  ctx.clip()
  for (const t of lista) {
    ctx.lineWidth = Math.max(1, (o.estilo?.canales[t.id]?.grosor ?? o.grosor ?? 1.5) * o.dpr)
    const y = yDe(t)
    ctx.strokeStyle = c.canal[t.id]
    ctx.setLineDash(t.id === MATEMATICO ? [6 * o.dpr, 4 * o.dpr] : [])
    ctx.beginPath()
    let abierta = false
    const base: number = t.i * p.ncol * CIFRAS_COLUMNA
    const col = p.columnas
    for (let j = 0; j < p.ncol; j++) {
      const q = base + j * CIFRAS_COLUMNA
      if (col[q + 4] & BANDERA_VACIA) {
        abierta = false
        continue
      }
      // Del primero (borde izquierdo de la columna) al último (borde derecho): una senoidal se ve continua y no en escalones. Si
      // la columna tiene un pico que no está en sus extremos (un flanco de un solo paso), el máximo y el mínimo van al centro.
      const [xi, xd] = [j * sx, (j + 1) * sx]
      const [pr, ul, mn, mx] = [col[q + 2], col[q + 3], col[q], col[q + 1]]
      if (abierta) ctx.lineTo(xi, y(pr))
      else ctx.moveTo(xi, y(pr))
      const holgura = 0.02 * t.vdiv
      const arriba = mx > Math.max(pr, ul) + holgura
      const abajo = mn < Math.min(pr, ul) - holgura
      if (arriba || abajo) {
        // Solo se visita el extremo que se sale del trazo del primero al último: una cresta no baja a su propio mínimo (que es
        // el primero) y dibuja una espiga de la altura de la cresta en cada columna. Con los dos, primero el más cercano al primero.
        const xc = (j + 0.5) * sx
        if (arriba && abajo) {
          const [e1, e2] = mx - pr <= pr - mn ? [mx, mn] : [mn, mx]
          ctx.lineTo(xc, y(e1))
          ctx.lineTo(xc, y(e2))
        } else ctx.lineTo(xc, y(arriba ? mx : mn))
      }
      ctx.lineTo(xd, y(ul))
      ultimos.set(t.id, y(ul))
      abierta = true
    }
    if (o.resplandor) {
      // El halo de fósforo: el mismo camino, más ancho y translúcido, debajo de la línea.
      const [ancho, color] = [ctx.lineWidth, ctx.strokeStyle]
      ctx.lineWidth = ancho * 3.4
      ctx.strokeStyle = conAlfa(c.canal[t.id], 0.16)
      ctx.stroke()
      ctx.lineWidth = ancho
      ctx.strokeStyle = color
    }
    ctx.stroke()
  }
  ctx.setLineDash([])
  // Los cursores, en el color del canal elegido y discontinuos.
  const cur = o.cursores
  if (cur) {
    const t = lista.find((x) => x.id === cur.canal) ?? lista[0]
    ctx.strokeStyle = c.canal[cur.canal]
    ctx.lineWidth = o.dpr
    ctx.setLineDash([3 * o.dpr, 3 * o.dpr])
    ctx.beginPath()
    for (const tc of cur.t ?? []) {
      const x = ((tc - p.t0) / span) * W
      ctx.moveTo(x, 0)
      ctx.lineTo(x, H)
    }
    if (t)
      for (const v of cur.v ?? []) {
        const yv = yDe(t)(v)
        ctx.moveTo(0, yv)
        ctx.lineTo(W, yv)
      }
    ctx.stroke()
    ctx.setLineDash([])
    if (o.resaltado) {
      ctx.lineWidth = Math.max(2, 2.5 * o.dpr)
      ctx.beginPath()
      const i = o.resaltado.endsWith('1') ? 0 : 1
      if (o.resaltado[0] === 't' && cur.t) {
        const x = ((cur.t[i] - p.t0) / span) * W
        ctx.moveTo(x, 0)
        ctx.lineTo(x, H)
      } else if (o.resaltado[0] === 'v' && cur.v && t) {
        const yv = yDe(t)(cur.v[i])
        ctx.moveTo(0, yv)
        ctx.lineTo(W, yv)
      }
      ctx.stroke()
    }
    if (o.ejes) lecturaDeCursores(ctx, cur, p, a, W, c, o.dpr, o.detalleCursores === true)
  }
  ctx.restore()
  return ultimos
}

// La tipografía de la pantalla que se está dibujando (`dibujarPantalla` la fija al empezar; el dibujo es síncrono).
let TIP: Tipografia = TIPOGRAFIA_POR_OMISION
const FUENTE_TITULO = (dpr: number, peso = 500): string => `${peso} ${Math.round(TIP.px * dpr)}px ${TIP.titulo}`
const FUENTE_CIFRAS = (dpr: number, peso = 400): string => `${peso === 400 ? '' : `${peso} `}${Math.round(TIP.px * dpr)}px ${TIP.cifras}`
// Las letras y cifras de los ejes llevan el tamaño del aspecto (`textoTam`); `ESC` ensancha columnas y bandas con ellas.
let PX_EJE = TIPOGRAFIA_POR_OMISION.px
let ESC = 1
const FUENTE_TITULO_EJE = (dpr: number, peso = 500): string => `${peso} ${Math.round(PX_EJE * dpr)}px ${TIP.titulo}`
const FUENTE_CIFRAS_EJE = (dpr: number, peso = 400): string => `${peso === 400 ? '' : `${peso} `}${Math.round(PX_EJE * dpr)}px ${TIP.cifras}`
const PESO_CSS: Readonly<Record<PesoTexto, number>> = { normal: 400, medio: 500, negrita: 700 }

/** El recuadro con Δt, 1/Δt y ΔV junto al cursor de tiempo de la derecha (o arriba a la derecha sin cursores de tiempo). */
function lecturaDeCursores(ctx: Lienzo2D, cur: CursoresPantalla, p: PantallaSab, a: AjustesOsciloscopio, W: number, c: ColoresPantalla, dpr: number, detalle: boolean): void {
  const l = lecturaCursores(cur)
  // Compacto: solo las diferencias. Con el detalle, también 1/Δt y los dos valores de cada cursor.
  const lineas = cur.xy ? lecturaCursoresXY(cur, a).slice(detalle ? 0 : 2) : [l.dt && `Δt ${l.dt}`, detalle && l.inv && `1/Δt ${l.inv}`, l.dv && `ΔV ${l.dv}`, ...(detalle ? [l.t1 && `t1 ${l.t1}`, l.t2 && `t2 ${l.t2}`, l.v1 && `V1 ${l.v1}`, l.v2 && `V2 ${l.v2}`] : [])].filter((x): x is string => !!x)
  if (!lineas.length) return
  ctx.font = FUENTE_CIFRAS(dpr)
  const ancho = Math.max(...lineas.map((x) => ctx.measureText(x).width)) + 12 * dpr
  const alto = (lineas.length * 15 + 8) * dpr
  const span = DIVISIONES_H * a.base
  const xc = cur.t ? ((Math.max(cur.t[0], cur.t[1]) - p.t0) / span) * W + 10 * dpr : W - ancho - 6 * dpr
  const x = Math.max(4 * dpr, Math.min(W - ancho - 4 * dpr, xc))
  const y = 8 * dpr
  ctx.fillStyle = c.fondo
  ctx.fillRect(x, y, ancho, alto)
  ctx.strokeStyle = c.ejes
  ctx.lineWidth = dpr
  ctx.beginPath()
  ctx.rect(x + 0.5, y + 0.5, ancho - 1, alto - 1)
  ctx.stroke()
  ctx.fillStyle = c.canalTexto[cur.canal]
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  lineas.forEach((t, k) => ctx.fillText(t, x + 6 * dpr, y + (11.5 + 15 * k) * dpr))
}

/** El instante del disparo arriba, dentro de la retícula, en el color de su fuente. */
function marcaDeDisparo(ctx: Lienzo2D, p: PantallaSab, a: AjustesOsciloscopio, W: number, c: ColoresPantalla, dpr: number): void {
  if (!Number.isFinite(p.tDisparo)) return
  const m = 6 * dpr
  const x = ((p.tDisparo - p.t0) / (DIVISIONES_H * a.base)) * W
  if (x < 0 || x > W) return
  const fuente = a.canales.find((k) => k.canal === a.disparo.fuente && k.on)
  ctx.fillStyle = fuente ? c.canalTexto[fuente.canal] : c.texto
  ctx.beginPath()
  ctx.moveTo(x - m, 0)
  ctx.lineTo(x + m, 0)
  ctx.lineTo(x, m)
  ctx.closePath()
  ctx.fill()
  ctx.font = FUENTE_TITULO(dpr, 650)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText('T', x + m + 2 * dpr, m + 2 * dpr)
}

/** El color de las letras de la columna de un canal: el tono elegido para el texto de los ejes o, sin él, el del canal. */
function tintaDeCanal(c: ColoresPantalla, canal: CanalOMatematico, e?: EstiloPantalla): string {
  return e?.textoTono && c.letra ? c.letra(e.textoTono) : c.canalTexto[canal]
}

/** El color de las letras del eje del tiempo: el tono elegido o el gris de siempre. */
function colorDelTiempo(c: ColoresPantalla, e?: EstiloPantalla): string {
  return e?.textoTono && c.letra ? c.letra(e.textoTono) : c.texto
}

/** El asa de un eje: una pastilla con dos rayitas sobre su línea; se agarra para moverlo (solo en pantalla). */
function asa(ctx: Lienzo2D, c: ColoresPantalla, x: number, y: number, vertical: boolean, d: number): void {
  const [w, h] = vertical ? [7 * d, 22 * d] : [22 * d, 7 * d]
  ctx.fillStyle = c.fondo
  ctx.fillRect(x - w / 2, y - h / 2, w, h)
  ctx.strokeStyle = c.ejes
  ctx.lineWidth = d
  ctx.setLineDash([])
  ctx.beginPath()
  ctx.rect(x - w / 2 + 0.5, y - h / 2 + 0.5, w - 1, h - 1)
  if (vertical) {
    ctx.moveTo(x - d, y - 5 * d)
    ctx.lineTo(x - d, y + 5 * d)
    ctx.moveTo(x + d, y - 5 * d)
    ctx.lineTo(x + d, y + 5 * d)
  } else {
    ctx.moveTo(x - 5 * d, y - d)
    ctx.lineTo(x + 5 * d, y - d)
    ctx.moveTo(x - 5 * d, y + d)
    ctx.lineTo(x + 5 * d, y + d)
  }
  ctx.stroke()
}

/**
 * Eje del tiempo, escalas de cada canal, marcas de 0 V, letras y nivel del disparo. Con `marcas`, rayitas junto a las cifras; con `estilo`, tono, peso y prefijo elegidos; con `asas`, cada eje lleva su asa.
 */
function dibujarEjes(ctx: Lienzo2D, m: Marco, a: AjustesOsciloscopio, p: PantallaSab | null, c: ColoresPantalla, ultimos: ReadonlyMap<CanalOMatematico, number>, marcas: boolean, o: OpcionesDibujo): void {
  const d = m.dpr
  const e = o.estilo
  const peso = PESO_CSS[e?.textoPeso ?? 'normal']
  const pxGeneral = PX_EJE
  const ex = e?.ejes?.x
  ctx.textBaseline = 'middle'
  // El tiempo: arriba, el título y la escala en el renglón de arriba y las cifras en el de abajo; abajo, al revés; en medio, las
  // cifras bajo la línea central y el título arriba.
  const xy = canalesXY(a)
  const t = xy ? rotulosHorizontal(a.canales.find((k) => k.canal === xy[0])!, xy[0], e?.prefijoX, e?.decimalesX) : e?.marcasTiempo ? rotulosMarcas(e.marcasTiempo.valores, e.marcasTiempo.paso, e.tiempoDesde?.alDisparo ?? false, e.prefijoX, e.decimalesX) : rotulosTiempo(a, p ? { t0: p.t0, tDisparo: p.tDisparo } : null, e?.prefijoX, e?.tiempoDesde, e?.decimalesX)
  const yTitulo = m.ejePos === 'abajo' ? m.eje.y0 + 30 * d * ESC : 12 * d * ESC
  const yCifras = m.ejePos === 'arriba' ? 30 * d * ESC : m.ejePos === 'abajo' ? m.eje.y0 + 12 * d * ESC : m.lineaEje + 11 * d * ESC
  PX_EJE = ex?.tam ?? pxGeneral
  ctx.fillStyle = ex?.tono && c.letra ? c.letra(ex.tono) : colorDelTiempo(c, e)
  ctx.font = FUENTE_TITULO_EJE(d)
  ctx.textAlign = 'left'
  ctx.fillText(ex?.titulo ?? t.titulo, m.x, yTitulo)
  ctx.textAlign = 'right'
  ctx.fillText(t.porDivision, m.x + m.w, yTitulo)
  ctx.font = FUENTE_CIFRAS_EJE(d, ex?.peso ? PESO_CSS[ex.peso] : peso)
  const fr = fraccionesDe(e)
  t.valores.forEach((v, i) => {
    const f = fr ? fr[i] : i / DIVISIONES_H
    ctx.textAlign = f <= 0 ? 'left' : f >= 1 ? 'right' : 'center'
    ctx.fillText(v, m.x + f * m.w, yCifras)
  })
  // Una columna por canal encendido: «A V» arriba y sus nueve cifras en las líneas de la retícula, en el color del canal.
  for (const col of m.columnas) {
    if (xy && col.canal !== xy[1]) continue
    const k = a.canales.find((x) => x.canal === col.canal)!
    const r = rotulosVoltaje(k, e?.canales[col.canal]?.prefijo, e?.canales[col.canal]?.decimales)
    const derecha = col.lado === 'derecha'
    const x = derecha ? col.x0 + 6 * d : col.lado === 'centro' ? col.x1 - 5 * d : col.x1 - 6 * d
    const ec = e?.ejes && Object.hasOwn(e.ejes, col.canal) ? e.ejes[col.canal] : undefined
    PX_EJE = ec?.tam ?? pxGeneral
    const tinta = ec?.tono && c.letra ? c.letra(ec.tono) : tintaDeCanal(c, col.canal, e)
    ctx.fillStyle = tinta
    ctx.textAlign = derecha ? 'left' : 'right'
    ctx.font = FUENTE_TITULO_EJE(d, 650)
    const titulo = ec?.titulo ?? `${col.canal} ${r.unidad}`
    if (col.lado === 'centro') {
      // En medio el título va dentro de la retícula, con un fondo: arriba chocaría con las cifras del tiempo.
      const w = ctx.measureText(titulo).width
      ctx.fillStyle = c.fondo
      ctx.fillRect(x - w - 2 * d, m.y + 3 * d, w + 4 * d, 14 * d * ESC)
      ctx.fillStyle = tinta
      ctx.fillText(titulo, x, m.y + 10 * d * ESC)
    } else ctx.fillText(titulo, x, m.y - 16 * d * ESC)
    // El acoplamiento que no es DC, arriba del título (también en la captura exportada).
    if (k.acople !== 'DC') ctx.fillText(k.acople, x, 12 * d * ESC)
    ctx.font = FUENTE_CIFRAS_EJE(d, ec?.peso ? PESO_CSS[ec.peso] : peso)
    r.valores.forEach((v, j) => {
      const y = m.y + (j * m.h) / DIVISIONES_V
      if (col.lado === 'centro') {
        // Sobre la retícula: un fondo detrás para que la cifra no se pierda entre las líneas y las trazas.
        const w = ctx.measureText(v).width
        ctx.fillStyle = c.fondo
        ctx.fillRect(x - w - 2 * d, y - 6 * d * ESC, w + 4 * d, 12 * d * ESC)
        ctx.fillStyle = tinta
      }
      ctx.fillText(v, x, y)
    })
  }
  PX_EJE = pxGeneral
  // Las rayitas de los ejes, hacia afuera de la retícula: las nueve líneas en los lados que tienen escala y las once divisiones del tiempo.
  if (marcas) {
    ctx.strokeStyle = c.ejes
    ctx.lineWidth = (e?.grosorEjes ?? 1) * d
    ctx.setLineDash([])
    ctx.beginPath()
    const hay = (lado: LadoEjeY) => m.columnas.some((k) => k.lado === lado)
    for (let j = 0; j <= DIVISIONES_V; j++) {
      const y = Math.round(m.y + (j * m.h) / DIVISIONES_V) + 0.5
      if (hay('izquierda')) {
        ctx.moveTo(m.x - 4 * d, y)
        ctx.lineTo(m.x, y)
      }
      if (hay('derecha')) {
        ctx.moveTo(m.x + m.w, y)
        ctx.lineTo(m.x + m.w + 4 * d, y)
      }
    }
    if (m.ejePos !== 'centro')
      for (const f of fraccionesDe(e) ?? Array.from({ length: DIVISIONES_H + 1 }, (_, i) => i / DIVISIONES_H)) {
        const x = Math.round(m.x + f * m.w) + 0.5
        const borde = m.ejePos === 'arriba' ? m.y : m.y + m.h
        ctx.moveTo(x, borde)
        ctx.lineTo(x, borde + (m.ejePos === 'arriba' ? -4 : 4) * d)
      }
    ctx.stroke()
  }
  // Las asas: una por columna (entre la tercera y la cuarta línea, donde no hay cifras) y una en el eje del tiempo.
  if (o.asas) {
    for (const col of m.columnas) asa(ctx, c, col.lado === 'centro' ? col.x1 - 0.5 : (col.x0 + col.x1) / 2, m.y + (3.5 * m.h) / DIVISIONES_V, true, d)
    asa(ctx, c, m.x + m.w / 2, m.ejePos === 'arriba' ? m.y : m.ejePos === 'abajo' ? m.y + m.h : m.lineaEje, false, d)
  }
  // Las marcas de 0 V en el borde izquierdo de la retícula (se arrastran, `Pantalla.tsx`). Dos a la misma altura se ponen una
  // junto a la otra hacia la izquierda.
  ctx.font = FUENTE_TITULO(d, 700)
  for (const { canal, y, x1 } of marcasDeCero(m, a)) {
    const k = { canal }
    ctx.fillStyle = c.canalTexto[k.canal]
    ctx.beginPath()
    ctx.moveTo(x1 - 15 * d, y - 7 * d)
    ctx.lineTo(x1 - 6 * d, y - 7 * d)
    ctx.lineTo(x1, y)
    ctx.lineTo(x1 - 6 * d, y + 7 * d)
    ctx.lineTo(x1 - 15 * d, y + 7 * d)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = c.fondo
    ctx.textAlign = 'center'
    ctx.fillText(k.canal, x1 - 9 * d, y)
  }
  // En X-Y, la marca de 0 V del canal horizontal: una banderita sobre el borde de la retícula, con la punta hacia ella.
  const mh = marcaHorizontalXY(m, a)
  if (mh) {
    const s = mh.abajo ? -1 : 1
    ctx.fillStyle = c.canalTexto[mh.canal]
    ctx.beginPath()
    ctx.moveTo(mh.x, mh.y)
    ctx.lineTo(mh.x - 7 * d, mh.y + s * 6 * d)
    ctx.lineTo(mh.x - 7 * d, mh.y + s * 15 * d)
    ctx.lineTo(mh.x + 7 * d, mh.y + s * 15 * d)
    ctx.lineTo(mh.x + 7 * d, mh.y + s * 6 * d)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = c.fondo
    ctx.textAlign = 'center'
    ctx.fillText(mh.canal, mh.x, mh.y + s * 10.5 * d)
  }
  // La letra de cada traza a la derecha, a la altura de su último punto (la identidad no depende solo del color).
  ctx.font = FUENTE_TITULO(d, 650)
  ctx.textAlign = 'left'
  for (const [id, y] of ultimos) {
    if (id === MATEMATICO) continue
    ctx.fillStyle = c.canalTexto[id]
    ctx.fillText(id, m.x + m.w + 11 * d, Math.max(m.y + 6 * d, Math.min(m.y + m.h - 6 * d, m.y + y)))
  }
  // El nivel del disparo: un triángulo en el margen derecho, con la punta en el borde de la retícula.
  const fuente = a.canales.find((k) => k.canal === a.disparo.fuente && k.on)
  if (fuente) {
    const yn = Math.max(m.y, Math.min(m.y + m.h, m.y + m.h / 2 - (a.disparo.nivel / fuente.vdiv + fuente.pos) * (m.h / DIVISIONES_V)))
    ctx.fillStyle = c.canalTexto[fuente.canal]
    ctx.beginPath()
    ctx.moveTo(m.x + m.w, yn)
    ctx.lineTo(m.x + m.w + 8 * d, yn - 5 * d)
    ctx.lineTo(m.x + m.w + 8 * d, yn + 5 * d)
    ctx.closePath()
    ctx.fill()
  }
}

/** La cruz vertical, un punto en cada traza y un cuadro con el tiempo y el valor de cada canal junto al puntero (solo en pantalla). */
function dibujarLectura(ctx: Lienzo2D, l: LecturaOsc, m: Marco, c: ColoresPantalla, d: number): void {
  const xx = Math.round(l.xPx) + 0.5
  ctx.save()
  ctx.strokeStyle = c.texto
  ctx.lineWidth = d
  ctx.setLineDash([2 * d, 3 * d])
  ctx.beginPath()
  ctx.moveTo(xx, m.y)
  ctx.lineTo(xx, m.y + m.h)
  ctx.stroke()
  ctx.setLineDash([])
  const lado = 8 * d
  for (const f of l.filas) {
    ctx.fillStyle = c.fondo
    ctx.fillRect(xx - lado / 2 - d, f.yPx - lado / 2 - d, lado + 2 * d, lado + 2 * d)
    ctx.fillStyle = c.canal[f.canal]
    ctx.fillRect(xx - lado / 2, f.yPx - lado / 2, lado, lado)
  }
  ctx.font = FUENTE_CIFRAS(d)
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  const renglon = 16 * d
  const lineas: { texto: string; canal: CanalOMatematico | null }[] = [{ texto: l.encabezado, canal: null }, ...l.filas.map((f) => ({ texto: `${f.canal === MATEMATICO ? 'A−B' : f.canal}  ${f.texto}`, canal: f.canal }))]
  const ancho = Math.max(...lineas.map((q) => ctx.measureText(q.texto).width)) + 30 * d
  const alto = lineas.length * renglon + 8 * d
  let x = xx + 14 * d
  if (x + ancho > m.x + m.w) x = xx - 14 * d - ancho
  x = Math.max(m.x + 2 * d, x)
  const y = m.y + 6 * d
  ctx.fillStyle = c.fondo
  ctx.fillRect(x, y, ancho, alto)
  ctx.strokeStyle = c.ejes
  ctx.beginPath()
  ctx.rect(x + 0.5, y + 0.5, ancho - 1, alto - 1)
  ctx.stroke()
  lineas.forEach((q, k) => {
    const yy = y + 4 * d + (k + 0.5) * renglon
    if (q.canal) {
      ctx.fillStyle = c.canal[q.canal]
      ctx.fillRect(x + 7 * d, yy - 4 * d, 8 * d, 8 * d)
    }
    ctx.fillStyle = q.canal ? c.canalTexto[q.canal] : c.texto
    ctx.fillText(q.texto, x + (q.canal ? 20 : 8) * d, yy)
  })
  ctx.restore()
}

/** Las marcas (sin ejes): la tierra de cada canal a la izquierda con su letra; el disparo arriba y su nivel a la derecha. */
function marcasInternas(ctx: Lienzo2D, p: PantallaSab, a: AjustesOsciloscopio, W: number, H: number, c: ColoresPantalla, dpr: number): void {
  const div = H / DIVISIONES_V
  const span = DIVISIONES_H * a.base
  const lista = trazas(a)
  const yDe = (t: Traza) => (v: number) => Math.max(-H, Math.min(2 * H, H / 2 - (v / t.vdiv + t.pos) * div))
  const m = 6 * dpr
  ctx.font = FUENTE_CIFRAS(dpr)
  ctx.textBaseline = 'middle'
  // Dos o más tierras a menos de una marca de alto se ponen una junto a la otra (con su letra), no encimadas: la punta de
  // cada una sigue en su nivel. El ancho de una letra de 11 px en Geist Mono es de unos 7 px.
  const puestas: { y: number; x: number }[] = []
  for (const t of lista) {
    const y0 = Math.max(m, Math.min(H - m, yDe(t)(0)))
    const letra = t.letra
    const x0 = puestas.filter((q) => Math.abs(q.y - y0) < 2 * m).reduce((x, q) => Math.max(x, q.x), 0)
    ctx.fillStyle = c.canal[t.id]
    ctx.beginPath()
    ctx.moveTo(x0, y0 - m)
    ctx.lineTo(x0 + m, y0)
    ctx.lineTo(x0, y0 + m)
    ctx.closePath()
    ctx.fill()
    ctx.textAlign = 'left'
    ctx.fillText(letra, x0 + m + 2 * dpr, y0)
    puestas.push({ y: y0, x: x0 + m + (4 + 7 * letra.length) * dpr })
  }
  if (Number.isFinite(p.tDisparo)) {
    const x = ((p.tDisparo - p.t0) / span) * W
    const fuente = lista.find((t) => t.id === a.disparo.fuente)
    ctx.fillStyle = fuente ? c.canal[fuente.id] : c.texto
    ctx.beginPath()
    ctx.moveTo(x - m, 0)
    ctx.lineTo(x + m, 0)
    ctx.lineTo(x, m)
    ctx.closePath()
    ctx.fill()
    if (fuente) {
      const yn = Math.max(m, Math.min(H - m, yDe(fuente)(a.disparo.nivel)))
      ctx.beginPath()
      ctx.moveTo(W, yn - m)
      ctx.lineTo(W - m, yn)
      ctx.lineTo(W, yn + m)
      ctx.closePath()
      ctx.fill()
      ctx.textAlign = 'right'
      ctx.fillText('T', W - m - 2 * dpr, yn)
    }
  }
}

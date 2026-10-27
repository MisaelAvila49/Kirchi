/** Pantalla X-Y: la curva en voltios, la lectura bajo el puntero y los cursores (puntos de la curva con su pendiente). Sin DOM, en píxeles de dispositivo. */
import { avanzarEnCurva, pendiente, puntoMasCercano, type Curva } from '../../../../compartido/grafica/curva'
import type { PrefijoEje } from '../../../../compartido/grafica/aspecto'
import { prefijoParaRango, unidadConPrefijo, valorEnPrefijo } from '../../../../compartido/grafica/ejes'
import { CANALES, DIVISIONES_H, DIVISIONES_V, type AjustesOsciloscopio, type Canal } from '../../instrumentos/ajustes'
import { CIFRAS_COLUMNA, type PantallaSab } from '../../sim/protocoloInstrumentos'
import { formatearMedida } from '../../valores/valores'
import { BANDERA_VACIA, canalesXY, type CursoresPantalla } from './dibujar'
import type { LecturaOsc } from './lectura'
import type { Marco } from './marco'

export interface PuntoXY {
  x: number
  y: number
}

/** La curva de la pantalla en voltios: dos puntos por columna (el primero y el último) y un hueco (NaN) donde falta un canal. */
export function curvaXY(p: PantallaSab, a: AjustesOsciloscopio): (Curva & { x: Float64Array; y: Float64Array }) | null {
  const xy = canalesXY(a)
  if (!xy || p.ncol <= 0) return null
  const [ix, iy] = [CANALES.indexOf(xy[0]), CANALES.indexOf(xy[1])]
  const x: number[] = []
  const y: number[] = []
  let hueco = false
  for (let j = 0; j < p.ncol; j++) {
    const [qx, qy] = [(ix * p.ncol + j) * CIFRAS_COLUMNA, (iy * p.ncol + j) * CIFRAS_COLUMNA]
    if (p.columnas[qx + 4] & BANDERA_VACIA || p.columnas[qy + 4] & BANDERA_VACIA) {
      hueco = true
      continue
    }
    if (hueco && x.length > 0) {
      x.push(Number.NaN)
      y.push(Number.NaN)
    }
    hueco = false
    for (const k of [2, 3]) {
      x.push(p.columnas[qx + k])
      y.push(p.columnas[qy + k])
    }
  }
  return { x: Float64Array.from(x), y: Float64Array.from(y) }
}

const canal = (a: AjustesOsciloscopio, c: Canal) => a.canales.find((k) => k.canal === c)!

/** De voltios a píxeles del lienzo, con la escala y la posición de cada canal. */
export function conversorXY(a: AjustesOsciloscopio, m: Pick<Marco, 'x' | 'y' | 'w' | 'h'>): (x: number, y: number) => [number, number] {
  const [cx, cy] = canalesXY(a)!
  const [kx, ky] = [canal(a, cx), canal(a, cy)]
  return (x, y) => [m.x + m.w / 2 + (x / kx.vdiv + kx.pos) * (m.w / DIVISIONES_H), m.y + m.h / 2 - (y / ky.vdiv + ky.pos) * (m.h / DIVISIONES_V)]
}

const texto = (v: number, prefijo: PrefijoEje | null | undefined): string => {
  const pref = prefijo ?? prefijoParaRango(Math.abs(v), 'V')
  return `${valorEnPrefijo(v, pref, 3)} ${unidadConPrefijo('V', pref)}`.trim()
}

/** La lectura bajo el puntero: el punto de la curva más cercano en pantalla, con el voltaje de cada canal. */
export function lecturaXY(p: PantallaSab, a: AjustesOsciloscopio, m: Marco, px: number, py: number, prefijos: Readonly<Partial<Record<string, PrefijoEje | null>>> = {}): LecturaOsc | null {
  const curva = curvaXY(p, a)
  if (!curva || !Number.isFinite(p.t0)) return null
  const conv = conversorXY(a, m)
  const c = puntoMasCercano([curva], conv, px, py)
  if (!c) return null
  const [cx, cy] = canalesXY(a)!
  const [xPx, yPx] = conv(c.x, c.y)
  return {
    xPx,
    encabezado: `${cx} = ${texto(c.x, prefijos[cx])}`,
    filas: [{ canal: cy, voltaje: c.y, texto: texto(c.y, prefijos[cy]), yPx: Math.max(m.y, Math.min(m.y + m.h, yPx)) }]
  }
}

/** Los cursores al encenderse: sobre la curva, a un cuarto y tres cuartos de su recorrido. */
export function cursoresInicialesXY(p: PantallaSab, a: AjustesOsciloscopio): CursoresPantalla | null {
  const curva = curvaXY(p, a)
  const xy = canalesXY(a)
  if (!curva || !xy) return null
  const en = (f: number): PuntoXY | null => {
    for (let k = Math.round(f * (curva.x.length - 1)); k < curva.x.length; k++) if (Number.isFinite(curva.x[k]) && Number.isFinite(curva.y[k])) return { x: curva.x[k], y: curva.y[k] }
    return null
  }
  const [q1, q2] = [en(0.25), en(0.75)]
  return q1 && q2 ? { canal: xy[1], t: null, v: null, xy: [q1, q2] } : null
}

/** El cursor (0 o 1) a `radio` px o menos del puntero; el más cercano si hay dos. */
export function cursorXYCercano(c: CursoresPantalla, a: AjustesOsciloscopio, m: Marco, px: number, py: number, radio: number): 0 | 1 | null {
  if (!c.xy || !canalesXY(a)) return null
  const conv = conversorXY(a, m)
  let mejor: 0 | 1 | null = null
  let dist = Infinity
  for (const i of [0, 1] as const) {
    const [x, y] = conv(c.xy[i].x, c.xy[i].y)
    const d = Math.hypot(x - px, y - py)
    if (d <= radio && d < dist) [mejor, dist] = [i, d]
  }
  return mejor
}

const conPunto = (c: CursoresPantalla, i: 0 | 1, q: PuntoXY): CursoresPantalla => ({ ...c, xy: i === 0 ? [q, c.xy![1]] : [c.xy![0], q] })

/** El cursor `i` en el punto de la curva más cercano al puntero. */
export function ponerCursorXY(c: CursoresPantalla, i: 0 | 1, p: PantallaSab, a: AjustesOsciloscopio, m: Marco, px: number, py: number): CursoresPantalla {
  const curva = curvaXY(p, a)
  const q = curva && c.xy ? puntoMasCercano([curva], conversorXY(a, m), px, py) : null
  return q ? conPunto(c, i, { x: q.x, y: q.y }) : c
}

/** Con el teclado: el cursor `i` `pasos` vértices a lo largo de la curva (`grande`: diez veces más). */
export function moverCursorXYTecla(c: CursoresPantalla, i: 0 | 1, dir: 1 | -1, grande: boolean, p: PantallaSab, a: AjustesOsciloscopio, m: Marco): CursoresPantalla {
  const curva = curvaXY(p, a)
  if (!curva || !c.xy) return c
  const conv = conversorXY(a, m)
  const [px, py] = conv(c.xy[i].x, c.xy[i].y)
  const q = puntoMasCercano([curva], conv, px, py)
  const paso = Math.max(1, Math.round(curva.x.length / 100)) * (grande ? 10 : 1)
  const nuevo = q && avanzarEnCurva(curva, q, dir * paso)
  return nuevo ? conPunto(c, i, nuevo) : c
}

/** El texto de los dos cursores: Δ de cada canal y la pendiente (la ganancia en Vsal contra Ent) y, con detalle, los dos puntos. */
export function lecturaCursoresXY(c: CursoresPantalla, a: AjustesOsciloscopio): string[] {
  const xy = canalesXY(a)
  if (!c.xy || !xy) return []
  const [p1, p2] = c.xy
  const s = pendiente(p1, p2)
  const f = (v: number) => formatearMedida(v, 'V', 4)
  return [
    `1: ${xy[0]} ${f(p1.x)}, ${xy[1]} ${f(p1.y)}`,
    `2: ${xy[0]} ${f(p2.x)}, ${xy[1]} ${f(p2.y)}`,
    `Δ${xy[0]} ${f(Math.abs(p2.x - p1.x))}`,
    `Δ${xy[1]} ${f(Math.abs(p2.y - p1.y))}`,
    `Pendiente ${s === null ? 'sin dato' : String(Number(s.toPrecision(4))).replace('-', '−')}`
  ]
}

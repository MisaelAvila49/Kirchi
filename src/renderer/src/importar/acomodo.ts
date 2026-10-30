/** Acomodo de las piezas importadas: sobre la rejilla, sin encimarse y lo más cerca posible de donde estaban. */
import type { Pieza, Punto, Rotacion } from '../doc/tipos'
import { MM_POR_UNIDAD } from '../doc/tipos'
import { LIMITE_COORDENADA } from '../doc/limites'
import { cuerpoEnMundo } from '../editor/colision'
import { PASO_REJILLA } from '../editor/rutas'
import { cajaEnMundo, transformar } from '../piezas/transformar'
import type { Caja, PiezaDef } from '../piezas/tipos'
import type { CircuitoAjeno } from './ajeno'

export interface ElementoAcomodo {
  /** Se escriben `x`, `y`, `rot` y `espejo`. */
  pieza: Pieza
  /** La definición de esta instancia (con los pines propios si es una caja). */
  def: PiezaDef
  /** Pin de Kirchi a índice de red. */
  redes: Map<string, number>
  /** Pin de Kirchi a donde estaba el pin original, en unidades de Kirchi con decimales. */
  deseados?: Map<string, Punto>
}

/** Una coordenada del origen en unidades de Kirchi (con decimales): a milímetros, con Y hacia abajo. */
export function proyectar(a: Pick<CircuitoAjeno, 'unidadesPorMm' | 'yHaciaArriba'>, x: number, y: number): Punto {
  const upm = a.unidadesPorMm && a.unidadesPorMm > 0 && Number.isFinite(a.unidadesPorMm) ? a.unidadesPorMm : 1
  return { x: acotar(x / upm / MM_POR_UNIDAD), y: acotar((a.yHaciaArriba ? -y : y) / upm / MM_POR_UNIDAD) }
}

// Un archivo ajeno puede traer coordenadas absurdas: se acotan con holgura para las escalas del acomodo, así ningún recorrido por celdas se vuelve infinito.
const MAX_IMPORTADA = LIMITE_COORDENADA / 8
function acotar(v: number): number {
  if (!Number.isFinite(v)) return 0
  return Math.max(-MAX_IMPORTADA, Math.min(MAX_IMPORTADA, v))
}

/** Aire mínimo entre cuerpos al acomodar: deja pasar un cable entre dos piezas. */
const AIRE = 4
const ORIENTACIONES: { rot: Rotacion; espejo: boolean }[] = [0, 90, 180, 270].flatMap((rot) => [false, true].map((espejo) => ({ rot: rot as Rotacion, espejo })))
const ESCALAS = [1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4]
const par = (v: number): number => Math.round(v / PASO_REJILLA) * PASO_REJILLA + 0

const copiaPieza = (p: Pieza, x: number, y: number, o: { rot: Rotacion; espejo: boolean }): Pieza => ({ ...p, x, y, rot: o.rot, espejo: o.espejo })
const caja = (el: ElementoAcomodo, lib: Map<string, PiezaDef>): Caja => cuerpoEnMundo(el.pieza, lib.get(el.pieza.tipo))
const cruzan = (a: Caja, b: Caja): boolean => a.minX - AIRE < b.maxX && b.minX < a.maxX + AIRE && a.minY - AIRE < b.maxY && b.minY < a.maxY + AIRE

function pinesMundo(el: ElementoAcomodo): { id: string; x: number; y: number }[] {
  return el.def.pines.map((q) => {
    const [x, y] = transformar(q.x, q.y, el.pieza.rot, el.pieza.espejo)
    return { id: q.id, x: el.pieza.x + x, y: el.pieza.y + y }
  })
}

const CELDA = 20
const MAX_CELDAS = 256

/** Cajas repartidas en celdas: buscar las que pueden tocar a otra no recorre todas, que en esquemas de cientos de piezas
 * volvía cuadrático el acomodo. */
class IndiceDeCajas {
  private celdas = new Map<string, number[]>()
  // Cajas inválidas o desmedidas: se comparan con todas en vez de recorrer millones de celdas.
  private sueltas: number[] = []
  private rango(c: Caja): [number, number, number, number] | null {
    const r: [number, number, number, number] = [Math.floor((c.minX - AIRE) / CELDA), Math.floor((c.maxX + AIRE) / CELDA), Math.floor((c.minY - AIRE) / CELDA), Math.floor((c.maxY + AIRE) / CELDA)]
    return r.every(Number.isSafeInteger) && r[1] - r[0] <= MAX_CELDAS && r[3] - r[2] <= MAX_CELDAS ? r : null
  }
  poner(i: number, c: Caja): void {
    const r = this.rango(c)
    if (!r) return void this.sueltas.push(i)
    const [x0, x1, y0, y1] = r
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      const k = `${x},${y}`
      const l = this.celdas.get(k)
      if (l) l.push(i)
      else this.celdas.set(k, [i])
    }
  }
  cercanas(c: Caja): Set<number> {
    const r = this.rango(c)
    const res = new Set<number>(this.sueltas)
    if (!r) {
      for (const l of this.celdas.values()) for (const i of l) res.add(i)
      return res
    }
    const [x0, x1, y0, y1] = r
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (const i of this.celdas.get(`${x},${y}`) ?? []) res.add(i)
    return res
  }
}

/** Cuántos pares chocan: cuerpos a menos de `AIRE`, o pines de redes distintas en el mismo punto. */
function conflictos(els: ElementoAcomodo[], lib: Map<string, PiezaDef>): Set<number> {
  const malos = new Set<number>()
  const cajas = els.map((e) => caja(e, lib))
  const indice = new IndiceDeCajas()
  cajas.forEach((c, i) => indice.poner(i, c))
  cajas.forEach((c, i) => {
    for (const j of indice.cercanas(c)) if (j > i && cruzan(c, cajas[j]!)) (malos.add(i), malos.add(j))
  })
  const enPunto = new Map<string, { i: number; red: number | undefined }>()
  els.forEach((e, i) => {
    for (const q of pinesMundo(e)) {
      const k = `${q.x},${q.y}`
      const red = e.redes.get(q.id)
      const otro = enPunto.get(k)
      if (otro && otro.i !== i && (red === undefined || otro.red === undefined || red !== otro.red)) (malos.add(i), malos.add(otro.i))
      else if (!otro) enPunto.set(k, { i, red })
    }
  })
  return malos
}

interface Ajuste {
  rot: Rotacion
  espejo: boolean
  x: number
  y: number
  costo: number
}

/** Pines de alimentación: su terminal se pone junto al pin, así que pesan poco al elegir el giro. Si pesaran igual, un amp-op
 * con V− arriba en el origen (Proteus) se reflejaría y dejaría «+» arriba. */
const ALIMENTACION_DE_PIN = /^(v[+-]|vcc|vdd|vee|vss|gnd)$/i
const PESO_ALIMENTACION = 0.05
const pesoDe = (q: { id: string; nombre: string }): number => (ALIMENTACION_DE_PIN.test(q.id) || ALIMENTACION_DE_PIN.test(q.nombre) ? PESO_ALIMENTACION : 1)

/** El giro y reflejo que dejan los pines de la pieza más cerca de los deseados (a esa escala), y dónde poner la pieza. */
function mejorOrientacion(el: ElementoAcomodo, escala: number): Ajuste {
  const metas = el.def.pines.filter((q) => el.deseados?.has(q.id))
  // Con solo pines de alimentación, todos pesan igual.
  const pesos = metas.map(pesoDe)
  if (pesos.every((w) => w < 1)) pesos.fill(1)
  const total = pesos.reduce((s, w) => s + w, 0)
  let mejor: Ajuste | null = null
  for (const o of ORIENTACIONES) {
    let sx = 0, sy = 0
    const lugares = metas.map((q, i) => {
      const [tx, ty] = transformar(q.x, q.y, o.rot, o.espejo)
      const d = el.deseados!.get(q.id)!
      sx += pesos[i]! * (d.x * escala - tx)
      sy += pesos[i]! * (d.y * escala - ty)
      return { tx, ty, d, w: pesos[i]! }
    })
    const x = lugares.length ? par(sx / total) : 0
    const y = lugares.length ? par(sy / total) : 0
    // El giro se elige por la forma, no por el tamaño: el símbolo del origen (un NE555 de LTspice) puede medir el doble que el
    // de Kirchi, así que se compara con el original escalado al tamaño que mejor le queda.
    const ct = { x: 0, y: 0 }, cd = { x: 0, y: 0 }
    for (const l of lugares) (ct.x += l.w * l.tx), (ct.y += l.w * l.ty), (cd.x += l.w * l.d.x), (cd.y += l.w * l.d.y)
    const t = lugares.map((l) => ({ x: l.tx - ct.x / total, y: l.ty - ct.y / total, w: l.w }))
    const d = lugares.map((l) => ({ x: l.d.x - cd.x / total, y: l.d.y - cd.y / total }))
    let td = 0, dd = 0, tt = 0
    t.forEach((a, i) => ((td += a.w * (a.x * d[i]!.x + a.y * d[i]!.y)), (dd += a.w * (d[i]!.x ** 2 + d[i]!.y ** 2)), (tt += a.w * (a.x ** 2 + a.y ** 2))))
    const s = dd > 1e-12 ? Math.max(0, td / dd) : 0
    let costo = (o.espejo ? 0.01 : 0) + (tt - 2 * s * td + s * s * dd) / Math.max(tt, 1e-9)
    if (!mejor || costo < mejor.costo - 1e-9) mejor = { ...o, x, y, costo }
  }
  return mejor!
}

/** Mueve la pieza al lugar más cercano (en anillos de la rejilla) donde ya no choca con ninguna. Las demás no se mueven, así
 * que sus cajas y pines se calculan una vez y solo se prueba la pieza candidata. */
function apartar(els: ElementoAcomodo[], i: number, lib: Map<string, PiezaDef>): void {
  const el = els[i]!
  const x0 = el.pieza.x, y0 = el.pieza.y
  const cajas = els.map((e, j) => (j === i ? null : caja(e, lib)))
  const indice = new IndiceDeCajas()
  cajas.forEach((c, j) => c && indice.poner(j, c))
  const ocupados = new Map<string, (number | undefined)[]>()
  els.forEach((e, j) => {
    if (j === i) return
    for (const q of pinesMundo(e)) {
      const k = `${q.x},${q.y}`
      ocupados.set(k, [...(ocupados.get(k) ?? []), e.redes.get(q.id)])
    }
  })
  const choca = (): boolean => {
    const c = caja(el, lib)
    for (const j of indice.cercanas(c)) if (cajas[j] && cruzan(c, cajas[j]!)) return true
    return pinesMundo(el).some((q) => {
      const red = el.redes.get(q.id)
      return (ocupados.get(`${q.x},${q.y}`) ?? []).some((o) => red === undefined || o === undefined || o !== red)
    })
  }
  for (let r = 1; r <= 40; r++) {
    const candidatos: Punto[] = []
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) if (Math.max(Math.abs(dx), Math.abs(dy)) === r) candidatos.push({ x: x0 + dx * PASO_REJILLA, y: y0 + dy * PASO_REJILLA })
    candidatos.sort((a, b) => Math.hypot(a.x - x0, a.y - y0) - Math.hypot(b.x - x0, b.y - y0))
    for (const c of candidatos) {
      el.pieza = copiaPieza(el.pieza, c.x, c.y, el.pieza)
      if (!choca()) return
    }
  }
  el.pieza = copiaPieza(el.pieza, x0, y0, el.pieza)
}

/** Lo que ocupa el conjunto con patas, o null si está vacío. */
function cajaTotal(els: ElementoAcomodo[], lib: Map<string, PiezaDef>): Caja | null {
  let c: Caja | null = null
  for (const e of els) {
    const b = cajaEnMundo(e.pieza, lib.get(e.pieza.tipo) ?? e.def)
    c = c ? { minX: Math.min(c.minX, b.minX), minY: Math.min(c.minY, b.minY), maxX: Math.max(c.maxX, b.maxX), maxY: Math.max(c.maxY, b.maxY) } : b
  }
  return c
}

function desplazar(els: ElementoAcomodo[], dx: number, dy: number): void {
  for (const e of els) e.pieza = copiaPieza(e.pieza, e.pieza.x + dx, e.pieza.y + dy, e.pieza)
}

/** Con posiciones: cada pieza va donde mejor deja sus pines; si algo choca, todo el esquema se ensancha (la forma se
 * conserva) y, si aún así queda algo, esa pieza se aparta lo mínimo. */
function conPosiciones(els: ElementoAcomodo[], lib: Map<string, PiezaDef>): number {
  const colocar = (escala: number): Set<number> => {
    for (const e of els) {
      const a = mejorOrientacion(e, escala)
      e.pieza = copiaPieza(e.pieza, a.x, a.y, a)
    }
    return conflictos(els, lib)
  }
  let escogida = ESCALAS[0]!
  let menos = Infinity
  for (const s of ESCALAS) {
    const n = colocar(s).size
    if (n < menos) (menos = n, escogida = s)
    if (n === 0) break
  }
  let malos = colocar(escogida)
  for (const i of [...malos]) {
    if (!malos.has(i)) continue
    apartar(els, i, lib)
    malos = conflictos(els, lib)
  }
  return escogida
}

const esFuente = (d: PiezaDef): boolean => ['V', 'I', 'senoidal', 'pulso', 'generador', 'pwl', 'alimentacion'].includes(d.modelo?.tipo ?? '')

/** Sin posiciones: fuentes a la izquierda, después por distancia en el grafo de redes, tierra hacia abajo. */
function enCapas(els: ElementoAcomodo[], tierras: Set<number>, lib: Map<string, PiezaDef>): void {
  const n = els.length
  const enRed = new Map<number, number[]>()
  els.forEach((e, i) => {
    for (const r of new Set(e.redes.values())) {
      if (tierras.has(r)) continue
      const l = enRed.get(r)
      if (l) l.push(i)
      else enRed.set(r, [i])
    }
  })
  const capa = new Array<number>(n).fill(-1)
  let frente: number[] = els.map((e, i) => (esFuente(e.def) ? i : -1)).filter((i) => i >= 0)
  if (!frente.length && n) frente = [0]
  for (const i of frente) capa[i] = 0
  while (frente.length) {
    const sig: number[] = []
    for (const i of frente) for (const r of new Set(els[i]!.redes.values())) for (const j of enRed.get(r) ?? []) if (capa[j] < 0) (capa[j] = capa[i]! + 1, sig.push(j))
    frente = sig
  }
  const mayor = Math.max(0, ...capa)
  els.forEach((_, i) => {
    if (capa[i]! < 0) capa[i] = mayor + 1
  })

  // Giro y reflejo: la tierra hacia abajo, lo que viene de capas anteriores a la izquierda y lo que va a las siguientes a la derecha.
  els.forEach((e, i) => {
    let mejor: { o: (typeof ORIENTACIONES)[number]; puntos: number } | null = null
    for (const o of ORIENTACIONES) {
      let puntos = 0
      for (const q of e.def.pines) {
        const red = e.redes.get(q.id)
        if (red === undefined) continue
        const [tx, ty] = transformar(q.x, q.y, o.rot, o.espejo)
        const norma = Math.hypot(tx, ty) || 1
        if (tierras.has(red)) puntos += (3 * ty) / norma
        else {
          const otros = (enRed.get(red) ?? []).filter((j) => j !== i)
          if (!otros.length) continue
          const d = otros.reduce((s, j) => s + capa[j]!, 0) / otros.length - capa[i]!
          if (d === 0) puntos += (-0.5 * ty) / norma
          else puntos += (Math.sign(d) * tx) / norma
        }
      }
      if (o.espejo) puntos -= 0.01
      if (!mejor || puntos > mejor.puntos + 1e-9) mejor = { o, puntos }
    }
    e.pieza = copiaPieza(e.pieza, 0, 0, mejor!.o)
  })

  const capas: number[][] = []
  els.forEach((_, i) => (capas[capa[i]!] ??= []).push(i))
  const fila = new Map<number, number>()
  capas.forEach((l) => l?.forEach((i, k) => fila.set(i, k)))
  // Dos pasadas por el centro de gravedad de los vecinos de capas anteriores para acortar cruces.
  for (let pasada = 0; pasada < 2; pasada++) {
    for (let c = 1; c < capas.length; c++) {
      const l = capas[c]
      if (!l) continue
      const peso = (i: number): number => {
        const vecinos = new Set<number>()
        for (const r of new Set(els[i]!.redes.values())) for (const j of enRed.get(r) ?? []) if (j !== i && capa[j]! < c) vecinos.add(j)
        return vecinos.size ? [...vecinos].reduce((s, j) => s + (fila.get(j) ?? 0), 0) / vecinos.size : (fila.get(i) ?? 0)
      }
      l.sort((a, b) => peso(a) - peso(b) || a - b)
      l.forEach((i, k) => fila.set(i, k))
    }
  }

  const sep = 14
  let x = 0
  for (const l of capas) {
    if (!l?.length) continue
    const cajas = l.map((i) => cajaEnMundo(els[i]!.pieza, lib.get(els[i]!.pieza.tipo) ?? els[i]!.def))
    const ancho = Math.max(...cajas.map((b) => b.maxX - b.minX))
    let y = 0
    l.forEach((i, k) => {
      const b = cajas[k]!
      const bx = x + (ancho - (b.maxX - b.minX)) / 2
      els[i]!.pieza = copiaPieza(els[i]!.pieza, par(bx - b.minX), par(y - b.minY), els[i]!.pieza)
      y += b.maxY - b.minY + sep
    })
    x += ancho + sep + 6
  }
}

/** Lo que no trae posición: las piezas con conexiones, en una columna a la izquierda; las sueltas, a la derecha. */
function aparte(sueltos: ElementoAcomodo[], resto: ElementoAcomodo[], lib: Map<string, PiezaDef>): void {
  const base = cajaTotal(resto, lib) ?? { minX: 0, minY: 0, maxX: 0, maxY: 0 }
  const conRed = sueltos.filter((e) => e.redes.size > 0)
  const sinRed = sueltos.filter((e) => e.redes.size === 0)
  const columna = (l: ElementoAcomodo[], lado: 'izq' | 'der'): void => {
    let y = base.minY
    let ancho = 0
    const cajas = l.map((e) => cajaEnMundo(copiaPieza(e.pieza, 0, 0, e.pieza), lib.get(e.pieza.tipo) ?? e.def))
    for (const b of cajas) ancho = Math.max(ancho, b.maxX - b.minX)
    l.forEach((e, k) => {
      const b = cajas[k]!
      const bx = lado === 'izq' ? base.minX - 16 - ancho : base.maxX + 16
      e.pieza = copiaPieza(e.pieza, par(bx - b.minX), par(y - b.minY), e.pieza)
      y += b.maxY - b.minY + 8
    })
  }
  columna(conRed, 'izq')
  columna(sinRed, 'der')
}

/** Cómo quedó el origen en Kirchi: un punto del origen, ya proyectado, va a `escala` veces su lugar más el desplazamiento. */
export interface Encuadre {
  escala: number
  dx: number
  dy: number
}

/** Escribe `x`, `y`, `rot` y `espejo` de cada pieza. Con posiciones del origen las respeta; sin ellas arma capas. Al final el
 * conjunto queda en positivo, a 8 unidades del borde. */
export function acomodar(els: ElementoAcomodo[], tierras: Set<number>, lib: Map<string, PiezaDef>): Encuadre {
  const posicionados = els.filter((e) => e.deseados && e.deseados.size > 0)
  let escala = 1
  if (posicionados.length === 0) enCapas(els, tierras, lib)
  else {
    escala = conPosiciones(posicionados, lib)
    const sueltos = els.filter((e) => !posicionados.includes(e))
    if (sueltos.length) {
      aparte(sueltos, posicionados, lib)
      const malos = conflictos(els, lib)
      for (const i of [...malos]) if (!posicionados.includes(els[i]!) && conflictos(els, lib).has(i)) apartar(els, i, lib)
    }
  }
  const c = cajaTotal(els, lib)
  const dx = c ? par(8 - c.minX) : 0, dy = c ? par(8 - c.minY) : 0
  if (c) desplazar(els, dx, dy)
  return { escala, dx, dy }
}

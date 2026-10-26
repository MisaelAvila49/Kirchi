import type { Documento, Id, Pieza } from '../doc/tipos'
import { cuerpoEnMundo } from '../editor/colision'
import { cajaEnMundo, transformar } from '../piezas/transformar'
import type { Caja, PiezaDef } from '../piezas/tipos'
import type { Aviso } from '../sim/avisos'
import { AIRE_TEXTO, cajaTexto, valores } from './apartar'
import type { EscritorTrazos, EscritorTriangulos } from './buffers'
import { Cubetas } from './cubetas'
import type { Texto } from './etiquetas'
import { ANCHO_CABLE, ANCHO_TRAZO } from './medidas'
import type { Paleta, Token } from './paleta'

/** Lo que la vista previa dibuja junto a una pieza. Los avisos de sobrecorriente no dependen del color: triángulo con «!»
 * arriba a la derecha, contorno de 2 px y chip con la cifra. Además rpm y sentido del motor, arcos del zumbador y marca
 * de pieza quemada. */

/** Alto de la letra de un chip junto a una pieza (como los de voltaje). */
export const TAM_CHIP_PIEZA = 1.4
/** Ancho del contorno del aviso, en unidades: unos 2 px al 100 %. */
export const ANCHO_AVISO = 0.4
/** Lado del triángulo de aviso. */
export const LADO_TRIANGULO = 1.8
/** Margen del contorno alrededor del cuerpo. */
const MARGEN_CONTORNO = 0.6
const CELDA = 10

/** Un texto que se pide junto a una pieza. */
export interface TextoJunto {
  pieza: Pieza
  texto: string
  color: Token
}

/** Coloca cada texto junto a su pieza en el primer lugar libre (arriba, abajo, derecha, izquierda y luego más lejos), sin
 * encimarse con cuerpos, cables, textos, chips de voltaje ni lo ya puesto. Si todo está ocupado, el primero. */
export function textosJuntoAPiezas(doc: Documento, lib: Map<string, PiezaDef>, pedidos: readonly TextoJunto[], textos: readonly Texto[], chips: readonly Texto[]): Texto[] {
  if (pedidos.length === 0) return []
  const piezas = valores(doc.piezas), cables = valores(doc.cables)
  let n = textos.length + chips.length + piezas.length
  for (const c of cables) n += Math.max(0, c.puntos.length - 1)
  const fijos = new Cubetas(n, CELDA, 0)
  for (const t of [...textos, ...chips]) {
    const b = cajaTexto(t)
    fijos.agregar(b.minX, b.minY, b.maxX, b.maxY)
  }
  for (const p of piezas) {
    const c = cuerpoEnMundo(p, lib.get(p.tipo))
    fijos.agregar(c.minX, c.minY, c.maxX, c.maxY)
  }
  const m = ANCHO_CABLE / 2
  for (const c of cables)
    for (let i = 1; i < c.puntos.length; i++) {
      const a = c.puntos[i - 1], b = c.puntos[i]
      fijos.agregar(Math.min(a.x, b.x) - m, Math.min(a.y, b.y) - m, Math.max(a.x, b.x) + m, Math.max(a.y, b.y) + m)
    }
  fijos.indexar()
  const puestos = new Cubetas(pedidos.length, CELDA, 0)
  puestos.indexar()
  const out: Texto[] = []
  for (const q of pedidos) {
    const def = lib.get(q.pieza.tipo)
    if (!def) continue
    const c = cajaEnMundo(q.pieza, def)
    const cx = (c.minX + c.maxX) / 2
    const h = TAM_CHIP_PIEZA
    const lugares: [number, number, Texto['alinear']][] = []
    for (const lejos of [0, 1.6, 3.2])
      lugares.push([cx, c.minY - h * 0.8 - lejos, 'centro'], [cx, c.maxY + h * 0.8 + lejos, 'centro'], [c.maxX + 0.8 + lejos, (c.minY + c.maxY) / 2, 'izq'], [c.minX - 0.8 - lejos, (c.minY + c.maxY) / 2, 'der'])
    let elegido: Texto | null = null
    for (const [x, y, alinear] of lugares) {
      const t: Texto = { texto: q.texto, x, y, alinear, tamaño: h, color: q.color, fuente: 'cifras', chip: true }
      const b = cajaTexto(t, AIRE_TEXTO)
      if (!fijos.choca(b) && !puestos.choca(b)) {
        elegido = t
        break
      }
    }
    const [x, y, alinear] = lugares[0]
    const t = elegido ?? { texto: q.texto, x, y, alinear, tamaño: h, color: q.color, fuente: 'cifras', chip: true }
    const b = cajaTexto(t, AIRE_TEXTO)
    puestos.agregar(b.minX, b.minY, b.maxX, b.maxY)
    out.push(t)
  }
  return out
}

/** El contorno del cuerpo, ampliado `margen`, como rectángulo de trazos. */
function contorno(t: EscritorTrazos, c: Caja, margen: number, ancho: number, color: Paleta[Token]): void {
  const [x0, y0, x1, y1] = [c.minX - margen, c.minY - margen, c.maxX + margen, c.maxY + margen]
  t.polilinea([x0, y0, x1, y0, x1, y1, x0, y1, x0, y0], ancho, color)
}

/** Marcas de los avisos: contorno ámbar y triángulo con «!» (sus textos van en `textos`). Las piezas quemadas llevan
 * además una cruz roja. */
export function marcasDeAvisos(t: EscritorTrazos, tri: EscritorTriangulos, doc: Documento, lib: Map<string, PiezaDef>, avisos: ReadonlyMap<Id, Aviso>, quemadas: ReadonlySet<Id>, paleta: Paleta, textos: Texto[]): void {
  for (const id of avisos.keys()) {
    const p = doc.piezas[id]
    const def = p && lib.get(p.tipo)
    if (!p || !def) continue
    const cuerpo = cuerpoEnMundo(p, def)
    contorno(t, cuerpo, MARGEN_CONTORNO, ANCHO_AVISO, paleta.aviso)
    const caja = cajaEnMundo(p, def)
    // El triángulo junto a la esquina superior derecha de la caja, por fuera (no tapa el dibujo, como las flechas de luz del LED),
    // con su «!» en el color del lienzo.
    const l = LADO_TRIANGULO
    const [x, y] = [caja.maxX + l / 2, caja.minY - l * 0.37]
    tri.triangulo(x, y - l * 0.5, x + l / 2, y + l * 0.37, x - l / 2, y + l * 0.37, paleta.aviso)
    textos.push({ texto: '!', x, y: y + l * 0.05, alinear: 'centro', tamaño: l * 0.6, color: 'lienzo', fuente: 'interfaz', negrita: true })
  }
  for (const id of quemadas) {
    const p = doc.piezas[id]
    if (!p) continue
    const c = cuerpoEnMundo(p, lib.get(p.tipo))
    t.segmento(c.minX, c.minY, c.maxX, c.maxY, ANCHO_AVISO, paleta.invalido)
    t.segmento(c.minX, c.maxY, c.maxX, c.minY, ANCHO_AVISO, paleta.invalido)
  }
}

/** Radio de la flecha de sentido del motor y el arco que cubre: esquina superior derecha del cuerpo, entre la referencia y
 * la patilla derecha (`giroLibre` la pasa a otra esquina si un texto la tapa). */
const RADIO_SENTIDO = 2.7
const ARCO_SENTIDO: readonly [number, number] = [(-65 * Math.PI) / 180, (-5 * Math.PI) / 180]

/** Los cuatro lados donde puede ir una marca alrededor del cuerpo, como giros de 90° de su dibujo en el marco del símbolo;
 * un giro conserva el sentido de la flecha del motor. */
const GIROS: readonly ((x: number, y: number) => [number, number])[] = [(x, y) => [x, y], (x, y) => [-y, x], (x, y) => [-x, -y], (x, y) => [y, -x]]

/** Giro con que la marca tapa menos los textos `cajas` (referencia, valor y cercanos); arriba si ninguno la toca. */
function giroLibre(p: Pieza, lineas: readonly (readonly number[])[], cajas: readonly Caja[]): (x: number, y: number) => [number, number] {
  if (!cajas.length) return GIROS[0]
  let mejor = GIROS[0], menos = Number.POSITIVE_INFINITY
  for (const g of GIROS) {
    let n = 0
    for (const l of lineas)
      for (let i = 0; i + 1 < l.length; i += 2) {
        // Cada punto y el medio de cada tramo.
        const pts = i + 3 < l.length ? [[l[i], l[i + 1]], [(l[i] + l[i + 2]) / 2, (l[i + 1] + l[i + 3]) / 2]] : [[l[i], l[i + 1]]]
        for (const [a, b] of pts) {
          const [u, w] = transformar(...g(a, b), p.rot, p.espejo)
          const x = p.x + u, y = p.y + w
          if (cajas.some((c) => x > c.minX && x < c.maxX && y > c.minY && y < c.maxY)) n++
        }
      }
    if (n < menos) [mejor, menos] = [g, n]
    if (n === 0) break
  }
  return mejor
}

/** Dibuja líneas del marco del símbolo, giradas al lado libre, en el lugar de la pieza. */
function trazarGiradas(t: EscritorTrazos, p: Pieza, lineas: readonly (readonly number[])[], cajas: readonly Caja[], paleta: Paleta): void {
  const g = giroLibre(p, lineas, cajas)
  for (const l of lineas) {
    const m: number[] = []
    for (let i = 0; i + 1 < l.length; i += 2) m.push(...transformar(...g(l[i], l[i + 1]), p.rot, p.espejo))
    for (let i = 2; i + 1 < m.length; i += 2) t.segmento(p.x + m[i - 2], p.y + m[i - 1], p.x + m[i], p.y + m[i + 1], ANCHO_TRAZO, paleta.pieza)
  }
}

/** Flecha curva quieta con el sentido de giro del motor (positivo, horario en pantalla sin espejo), arriba del cuerpo o en
 * el lado que no tape los textos `cajas`. */
export function flechaDeSentido(t: EscritorTrazos, p: Pieza, sentido: 1 | -1, paleta: Paleta, cajas: readonly Caja[] = []): void {
  const lados = 12
  const pts: number[] = []
  const [a0, a1] = ARCO_SENTIDO
  for (let k = 0; k <= lados; k++) {
    const a = a0 + ((a1 - a0) * k) / lados
    pts.push(RADIO_SENTIDO * Math.cos(a), RADIO_SENTIDO * Math.sin(a))
  }
  // La punta en el extremo hacia donde gira.
  const fin = sentido > 0 ? a1 : a0
  const [fx, fy] = [RADIO_SENTIDO * Math.cos(fin), RADIO_SENTIDO * Math.sin(fin)]
  const tg = sentido > 0 ? [-Math.sin(fin), Math.cos(fin)] : [Math.sin(fin), -Math.cos(fin)]
  const normal = [Math.cos(fin), Math.sin(fin)]
  const punta = [fx - 0.7 * tg[0] + 0.45 * normal[0], fy - 0.7 * tg[1] + 0.45 * normal[1], fx, fy, fx - 0.7 * tg[0] - 0.45 * normal[0], fy - 0.7 * tg[1] - 0.45 * normal[1]]
  trazarGiradas(t, p, [pts, punta], cajas, paleta)
}

/** Tres arcos de sonido quietos arriba de la cúpula del zumbador mientras suena, o en el lado que no tapa los textos `cajas`. */
export function arcosDeZumbador(t: EscritorTrazos, p: Pieza, paleta: Paleta, cajas: readonly Caja[] = []): void {
  const lineas = [2.7, 3.3, 3.9].map((r) => {
    const pts: number[] = []
    for (let k = 0; k <= 8; k++) {
      // En la esquina de arriba a la derecha de la cúpula, como la flecha del motor.
      const a = ((-55 + (50 * k) / 8) * Math.PI) / 180
      pts.push(r * Math.cos(a), r * Math.sin(a))
    }
    return pts
  })
  trazarGiradas(t, p, lineas, cajas, paleta)
}

/** «6,000 rpm» con separador de miles, sin decimales. */
export const textoRpm = (rpm: number): string => `${Math.round(Math.abs(rpm)).toLocaleString('en-US')} rpm`

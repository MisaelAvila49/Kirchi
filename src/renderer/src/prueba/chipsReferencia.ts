import { partirClavePin, type Conexiones, type Red } from '../conexiones/conexiones'
import type { Documento, Punto } from '../doc/tipos'
import { cajaTexto } from '../lienzo/apartar'
import { acotarAlAlcance, limitarDesplazo } from '../lienzo/ajusteChips'
import { candidatosEnEntrada } from '../lienzo/anclaChip'
import { FACTOR_ANILLO, HUECO_MISMA_LINEA, MARGEN_PIN_X, MARGEN_PIN_Y, SEPARACION_CHIP, TAM_CHIP, type OpcionesChips } from '../lienzo/chips'
import type { Texto } from '../lienzo/etiquetas'
import { ANCHO_TRAZO } from '../lienzo/medidas'
import { cajaEnMundo, pinesEnMundo } from '../piezas/transformar'
import type { Caja, PiezaDef } from '../piezas/tipos'
import { textoNivelRed, type Lectura } from '../sim/lectura'
import { ordenRef } from '../ui/redes'
import { formatearMedida } from '../valores/valores'

/** Versión de referencia de `chipsDeVoltaje` antes de acelerarla: índice en un Map de arreglos de cajas, un objeto por
 * candidato y llave de red con `reduce`. Lenta a propósito: las pruebas exigen que la rápida dé lo mismo; si cambia dónde
 * van los chips, se cambia aquí también. */

/** Llave de una red como la arma `claveDeRedChip` (lienzo/ajusteChips.ts). */
function claveDeRedChip(r: Pick<Red, 'pines' | 'cables'>): string {
  const menor = (xs: readonly string[]) => xs.reduce((a, b) => (b < a ? b : a))
  return r.pines.length ? `p:${menor(r.pines)}` : r.cables.length ? `c:${menor(r.cables)}` : ''
}

const tocan = (a: Caja, b: Caja) => a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY

/** Lado de la celda del índice de obstáculos, en unidades: del orden de un chip y su vecino. */
const CELDA = 10
/** Máximo de celdas por caja, como en `apartar.ts`: una caja de punta a punta del mundo (±2^20) ocuparía ~10^10 celdas. La
 * que ocupa más (o con coordenadas no finitas) va a `grandes` y una consulta mayor revisa todos los obstáculos; ambos son
 * lineales en obstáculos. */
const MAX_CELDAS = 64

/** Índice por celdas de los obstáculos (cuerpos, textos y chips puestos): preguntar si una caja toca algo cuesta sus
 * celdas y no el total de piezas, así una escena de 5,000 piezas no se come el cuadro. Dos celdas pueden compartir llave:
 * solo suma candidatos, que `tocan` descarta. */
class Obstaculos {
  private celdas = new Map<number, Caja[]>()
  private todos: Caja[] = []
  private grandes: Caja[] = []
  /** Rango de celdas de la caja, o null si ocupa más de `MAX_CELDAS` (o no es finita). */
  private rango(c: Caja): [number, number, number, number] | null {
    const x0 = Math.floor(c.minX / CELDA), y0 = Math.floor(c.minY / CELDA)
    const x1 = Math.floor(c.maxX / CELDA), y1 = Math.floor(c.maxY / CELDA)
    return (x1 - x0 + 1) * (y1 - y0 + 1) <= MAX_CELDAS ? [x0, y0, x1, y1] : null
  }
  agregar(c: Caja): void {
    this.todos.push(c)
    const r = this.rango(c)
    if (!r) {
      this.grandes.push(c)
      return
    }
    for (let x = r[0]; x <= r[2]; x++)
      for (let y = r[1]; y <= r[3]; y++) {
        const k = x * 100003 + y
        const l = this.celdas.get(k)
        if (l) l.push(c)
        else this.celdas.set(k, [c])
      }
  }
  toca(c: Caja): boolean {
    const r = this.rango(c)
    if (!r) return this.todos.some((x) => tocan(c, x))
    if (this.grandes.some((x) => tocan(c, x))) return true
    for (let x = r[0]; x <= r[2]; x++)
      for (let y = r[1]; y <= r[3]; y++) if (this.celdas.get(x * 100003 + y)?.some((o) => tocan(c, o))) return true
    return false
  }
}

/** Tramo más largo de la red: horizontal si lo hay; si no, vertical. */
function tramoMasLargo(doc: Documento, r: Red): { a: Punto; b: Punto; horizontal: boolean } | null {
  let mejor: { a: Punto; b: Punto; horizontal: boolean; largo: number } | null = null
  for (const id of r.cables) {
    const pts = doc.cables[id]?.puntos ?? []
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i]
      const horizontal = a.y === b.y
      const largo = Math.abs(b.x - a.x) + Math.abs(b.y - a.y)
      // Un tramo horizontal gana a cualquier vertical: el chip se lee mejor encima de una línea acostada.
      const gana = !mejor || (horizontal && !mejor.horizontal) || (horizontal === mejor.horizontal && largo > mejor.largo)
      if (gana) mejor = { a, b, horizontal, largo }
    }
  }
  return mejor
}

const SIN_TEXTOS: readonly Texto[] = []

/** Lo que no cambia con las lecturas: cuerpos, luz de los LED, textos de la escena con su margen, y los textos sin margen. */
interface Fijos {
  fijos: Obstaculos
  lineas: Obstaculos
  /** Hueco alrededor del extremo de cada pin: solo una preferencia. */
  pines: Obstaculos
}
let cacheFijos: { doc: Documento; lib: Map<string, PiezaDef>; con: Conexiones; textos: readonly Texto[]; fijos: Fijos } | null = null

/** Obstáculos fijos de una escena, guardados por identidad de documento, librería, conexiones y textos: con la vista
 * previa nada de eso cambia, así el índice no se rehace diez veces por segundo. */
function obstaculosFijos(doc: Documento, lib: Map<string, PiezaDef>, con: Conexiones, textos: readonly Texto[]): Fijos {
  const c = cacheFijos
  if (c && c.doc === doc && c.lib === lib && c.con === con && c.textos === textos && textos !== SIN_TEXTOS) return c.fijos
  const fijos = new Obstaculos()
  const lineas = new Obstaculos()
  const pines = new Obstaculos()
  for (const t of textos) {
    const b = cajaTexto(t, 0)
    lineas.agregar(b)
    // Un chip pegado a una referencia o un valor se lee como parte de ella: margen de un em a los lados.
    fijos.agregar({ minX: b.minX - t.tamaño, minY: b.minY, maxX: b.maxX + t.tamaño, maxY: b.maxY })
  }
  for (const p of Object.values(doc.piezas)) {
    const def = lib.get(p.tipo)
    if (!def) continue
    const caja = cajaEnMundo(p, def)
    fijos.agregar(caja)
    for (const q of pinesEnMundo(p, def)) pines.agregar({ minX: q.x - MARGEN_PIN_X, minY: q.y - MARGEN_PIN_Y, maxX: q.x + MARGEN_PIN_X, maxY: q.y + MARGEN_PIN_Y })
    // El disco de luz de un LED (y su anillo) también estorba: un chip sobre él no se lee.
    if (def.modelo?.tipo === 'D' && def.props.some((d) => d.id === 'color' && d.opciones)) {
      const cx = (caja.minX + caja.maxX) / 2, cy = (caja.minY + caja.maxY) / 2
      const r = (Math.max(caja.maxX - caja.minX, caja.maxY - caja.minY) / 2) * FACTOR_ANILLO + ANCHO_TRAZO
      fijos.agregar({ minX: cx - r, minY: cy - r, maxX: cx + r, maxY: cy + r })
    }
  }
  const nuevo = { fijos, lineas, pines }
  cacheFijos = { doc, lib, con, textos, fijos: nuevo }
  return nuevo
}

/** Chip con el voltaje de cada red simulada de dos conexiones o más, salvo la tierra. Va centrado sobre el tramo
 * horizontal más largo (debajo si choca), a la derecha del vertical más largo, o sobre el pin de menor referencia si no
 * hay cables. Los textos de la escena también son obstáculos. */
export function chipsDeVoltajeReferencia(doc: Documento, lib: Map<string, PiezaDef>, con: Conexiones, l: Lectura, textos: readonly Texto[] = SIN_TEXTOS, opciones: OpcionesChips = { redes: null }): Texto[] {
  const { fijos, lineas, pines } = obstaculosFijos(doc, lib, con, textos)
  // Los chips ya puestos también estorban: lo que cambia con cada lectura va aparte de lo cacheado.
  const puestos = new Obstaculos()
  for (const c of opciones.estorbos ?? []) puestos.agregar(c)
  const libre = (t: Texto) => {
    const c = cajaTexto(t)
    return !fijos.toca(c) && !puestos.toca(c)
  }
  /** Sin un texto de la escena en su línea a menos de `HUECO_MISMA_LINEA`: no se lee como el valor de una pieza. */
  const lejosDeTextos = (t: Texto) => {
    const c = cajaTexto(t, 0)
    return !lineas.toca({ minX: c.minX - HUECO_MISMA_LINEA, maxX: c.maxX + HUECO_MISMA_LINEA, minY: c.minY, maxY: c.maxY })
  }
  /** Los candidatos y, si ninguno sirve, los mismos alejados de a un renglón por arriba y por abajo. */
  const buscar = (candidatos: Texto[], sirve: (t: Texto) => boolean): Texto | undefined => {
    let e = candidatos.find(sirve)
    for (let k = 1; !e && k <= 6; k++)
      e = candidatos.flatMap((c) => [{ ...c, y: c.y - k * SEPARACION_CHIP }, { ...c, y: c.y + k * SEPARACION_CHIP }]).find(sirve)
    return e
  }
  const out: Texto[] = []
  for (const r of con.redes) {
    const v = l.redes.get(r.id)
    const dg = l.digitales?.get(r.id)
    if ((v === undefined && !dg) || r.tierra || r.pines.length + r.cables.length < 2) continue
    if (opciones.redes && !opciones.redes.has(r.id)) continue
    const texto = dg && (v === undefined || (dg.conmuta && dg.f > 0)) ? textoNivelRed(dg) : formatearMedida(v!, 'V')
    const clave = claveDeRedChip(r)
    const chip = (x: number, y: number, alinear: Texto['alinear']): Texto => ({ texto, x, y, alinear, tamaño: TAM_CHIP, color: 'trazo', fuente: 'cifras', chip: true, clave })
    const t = tramoMasLargo(doc, r)
    let candidatos: Texto[]
    const enEntrada = candidatosEnEntrada(doc, lib, r)
    if (enEntrada) candidatos = enEntrada.map((c) => chip(c.x, c.y, c.alinear))
    else if (t?.horizontal) {
      const cx = (t.a.x + t.b.x) / 2
      candidatos = [chip(cx, t.a.y - SEPARACION_CHIP, 'centro'), chip(cx, t.a.y + SEPARACION_CHIP, 'centro')]
    } else if (t) {
      const cy = (t.a.y + t.b.y) / 2
      candidatos = [chip(t.a.x + SEPARACION_CHIP / 2, cy, 'izq'), chip(t.a.x - SEPARACION_CHIP / 2, cy, 'der')]
    } else {
      const menor = [...r.pines].sort((x, y) => ordenRef(doc.piezas[partirClavePin(x).piezaId]?.ref ?? '', doc.piezas[partirClavePin(y).piezaId]?.ref ?? ''))[0]
      const { piezaId, pinId } = partirClavePin(menor)
      const p = doc.piezas[piezaId]
      const def = p ? lib.get(p.tipo) : undefined
      const pin = p && def ? pinesEnMundo(p, def).find((q) => q.id === pinId) : undefined
      if (!pin) continue
      const m = SEPARACION_CHIP / 2
      candidatos = [chip(pin.x, pin.y - SEPARACION_CHIP, 'centro'), chip(pin.x, pin.y + SEPARACION_CHIP, 'centro'), chip(pin.x + m, pin.y - m, 'izq'), chip(pin.x - m, pin.y - m, 'der')]
    }
    // Primero libre y lejos de los textos de su línea; si no se puede, solo libre; si todo está ocupado, el primero.
    const elegido = candidatos.find((t) => libre(t) && lejosDeTextos(t) && !pines.toca(cajaTexto(t, 0))) ?? buscar(candidatos, (t) => libre(t) && lejosDeTextos(t)) ?? buscar(candidatos, libre) ?? candidatos[0]
    puestos.agregar(cajaTexto(elegido))
    // El desplazo del lector va después del reparto: no cambia dónde se buscó lugar ni a los demás chips.
    const d = clave ? opciones.desplazos?.get(clave) : undefined
    if (d) {
      const m = limitarDesplazo(d.dx, d.dy)
      const q = acotarAlAlcance(doc, lib, r, elegido.x + m.dx, elegido.y + m.dy)
      out.push({ ...elegido, x: q.x, y: q.y })
    } else out.push(elegido)
  }
  return out
}

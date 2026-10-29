import { partirClavePin, type Conexiones, type Red } from '../conexiones/conexiones'
import type { Documento, Punto } from '../doc/tipos'
import { cajaEnMundo, pinesEnMundo } from '../piezas/transformar'
import type { Caja, PiezaDef } from '../piezas/tipos'
import type { Lectura } from '../sim/lectura'
import { ordenRef } from '../ui/redes'
import { formatearMedida } from '../valores/valores'
import { textoNivelRed } from '../sim/lectura'
import { AIRE_TEXTO, cajaTexto, valores } from './apartar'
import { acotarAlAlcance, claveDeRedChip, limitarDesplazo, redLlevaChip, type Desplazos } from './ajusteChips'
import { candidatosEnEntrada } from './anclaChip'
import { Cubetas } from './cubetas'
import { ANCHO_TRAZO, anchoTexto } from './medidas'
import type { Texto } from './etiquetas'

/** Alto de la letra de un chip, en unidades. */
export const TAM_CHIP = 1.4
/** Distancia del centro del chip al cable, en unidades: el chip queda encima del tramo sin taparlo. */
export const SEPARACION_CHIP = 1.6
/** Radio del anillo de luz de un LED entre la mitad de su cuerpo (lo dibuja `capaSim.ts`). */
export const FACTOR_ANILLO = 1.35
/** Hueco mínimo, en unidades, entre un chip y un texto de la escena de su misma línea: más cerca se lee como su valor. */
export const HUECO_MISMA_LINEA = 6

/** Medio ancho y medio alto, en unidades, del hueco que un chip deja, si puede, alrededor del extremo de cada pin: pegado a él se lee como parte de la pieza. */
export const MARGEN_PIN_X = 1.5
export const MARGEN_PIN_Y = 1

/** Lado de la celda del índice de obstáculos, en unidades: del orden de un chip y su vecino. */
const CELDA = 10

/** Tramo más largo de la red: horizontal si lo hay; si no, vertical. */
function tramoMasLargo(doc: Documento, r: Red): { a: Punto; b: Punto; horizontal: boolean } | null {
  // El mejor tramo en variables sueltas: un objeto por tramo que gana se tiraba en cada lectura.
  let a: Punto | null = null, b: Punto | null = null, horizontal = false, largo = 0
  for (const id of r.cables) {
    const pts = doc.cables[id]?.puntos ?? []
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1], q = pts[i]
      const h = p.y === q.y
      const l = Math.abs(q.x - p.x) + Math.abs(q.y - p.y)
      // Un tramo horizontal gana a cualquier vertical: el chip se lee mejor encima de una línea acostada.
      const gana = a === null || (h && !horizontal) || (h === horizontal && l > largo)
      if (gana) {
        a = p
        b = q
        horizontal = h
        largo = l
      }
    }
  }
  return a && b ? { a, b, horizontal } : null
}

/** Voltajes ya escritos («2.50 V»): `formatearMedida` cuesta cerca de medio microsegundo y la capa lo pide por red y
 * lectura. Función pura del número; la tabla se vacía al llegar a `MAX_VOLTAJES`. */
const voltajesEscritos = new Map<number, string>()
const MAX_VOLTAJES = 4096
function textoDeVoltaje(v: number): string {
  let t = voltajesEscritos.get(v)
  if (t === undefined) {
    t = formatearMedida(v, 'V')
    if (voltajesEscritos.size >= MAX_VOLTAJES) voltajesEscritos.clear()
    voltajesEscritos.set(v, t)
  }
  return t
}

const SIN_TEXTOS: readonly Texto[] = []

/** Lo que no cambia con las lecturas: cuerpos, luz de los LED, textos de la escena con su margen, y los textos sin margen. */
interface Fijos {
  fijos: Cubetas
  lineas: Cubetas
  /** Un hueco alrededor del extremo de cada pin: solo una preferencia (si no cabe un chip sin tocarlo, se ignora). */
  pines: Cubetas
}
let cacheFijos: { doc: Documento; lib: Map<string, PiezaDef>; con: Conexiones; textos: readonly Texto[]; fijos: Fijos } | null = null

/** Obstáculos fijos de una escena, guardados por identidad de documento, librería, conexiones y textos: con la vista
 * previa nada de eso cambia, así el índice no se rehace diez veces por segundo. Un `textos` nuevo lo reconstruye. */
function obstaculosFijos(doc: Documento, lib: Map<string, PiezaDef>, con: Conexiones, textos: readonly Texto[]): Fijos {
  const c = cacheFijos
  if (c && c.doc === doc && c.lib === lib && c.con === con && c.textos === textos && textos !== SIN_TEXTOS) return c.fijos
  const piezas = valores(doc.piezas)
  // Sin tolerancia (`eps` 0): cualquier cruce de cajas cuenta.
  const fijos = new Cubetas(textos.length + 2 * piezas.length, CELDA, 0)
  const lineas = new Cubetas(textos.length, CELDA, 0)
  const pines = new Cubetas(12 * Object.keys(doc.piezas).length, CELDA, 0)
  for (const t of textos) {
    const b = cajaTexto(t, 0)
    lineas.agregar(b.minX, b.minY, b.maxX, b.maxY)
    // Un chip pegado a una referencia o un valor se lee como parte de ella: margen de un em a los lados.
    fijos.agregar(b.minX - t.tamaño, b.minY, b.maxX + t.tamaño, b.maxY)
  }
  for (const p of piezas) {
    const def = lib.get(p.tipo)
    if (!def) continue
    const caja = cajaEnMundo(p, def)
    fijos.agregar(caja.minX, caja.minY, caja.maxX, caja.maxY)
    for (const q of pinesEnMundo(p, def)) pines.agregar(q.x - MARGEN_PIN_X, q.y - MARGEN_PIN_Y, q.x + MARGEN_PIN_X, q.y + MARGEN_PIN_Y)
    // El disco de luz de un LED (y su anillo) también estorba: un chip sobre él no se lee.
    if (def.modelo?.tipo === 'D' && def.props.some((d) => d.id === 'color' && d.opciones)) {
      const cx = (caja.minX + caja.maxX) / 2, cy = (caja.minY + caja.maxY) / 2
      const r = (Math.max(caja.maxX - caja.minX, caja.maxY - caja.minY) / 2) * FACTOR_ANILLO + ANCHO_TRAZO
      fijos.agregar(cx - r, cy - r, cx + r, cy + r)
    }
  }
  fijos.indexar()
  lineas.indexar()
  pines.indexar()
  const nuevo = { fijos, lineas, pines }
  cacheFijos = { doc, lib, con, textos, fijos: nuevo }
  return nuevo
}

/** Qué chips se dibujan y dónde: `redes` son las mostradas (null: todas) y `desplazos` lo que el lector movió cada chip
 * del reparto (por llave de red, `claveDeRedChip`). */
export interface OpcionesChips {
  redes: ReadonlySet<number> | null
  desplazos?: Desplazos
  /** Cajas que cambian con la lectura (banderas, pantallas de medidores, cifras de instrumentos): un chip no las cubre. */
  estorbos?: readonly Caja[]
}

/** Chip con el voltaje de cada red simulada de dos conexiones o más, salvo la tierra. Va sobre el tramo horizontal más
 * largo (debajo si choca), a la derecha del vertical más largo, o sobre el pin de menor referencia sin cables. Los textos
 * de la escena también son obstáculos. */
export function chipsDeVoltaje(doc: Documento, lib: Map<string, PiezaDef>, con: Conexiones, l: Lectura, textos: readonly Texto[] = SIN_TEXTOS, opciones: OpcionesChips = { redes: null }): Texto[] {
  const { fijos, lineas, pines } = obstaculosFijos(doc, lib, con, textos)
  // Los chips ya puestos también estorban: lo que cambia con cada lectura va aparte de lo cacheado.
  const estorbos = opciones.estorbos ?? []
  const puestos = new Cubetas(con.redes.length + estorbos.length, CELDA, 0, fijos.zonaDensa)
  puestos.indexar()
  for (const c of estorbos) puestos.agregar(c.minX, c.minY, c.maxX, c.maxY)
  // Los candidatos de la red en curso (a lo más cuatro) como números; solo el elegido se vuelve un `Texto`.
  const xs = [0, 0, 0, 0], ys = [0, 0, 0, 0]
  const als: Texto['alinear'][] = ['centro', 'centro', 'centro', 'centro']
  let n = 0
  let ancho = 0
  /** Caja de consulta que se reescribe: la de `cajaTexto` del chip en (x, y), con el mismo cálculo. */
  const caja: Caja = { minX: 0, minY: 0, maxX: 0, maxY: 0 }
  const cajaDe = (x: number, y: number, al: Texto['alinear'], aire: number) => {
    const izq = al === 'izq' ? x : al === 'der' ? x - ancho : x - ancho / 2
    caja.minX = izq - aire
    caja.minY = y - TAM_CHIP / 2 - aire
    caja.maxX = izq + ancho + aire
    caja.maxY = y + TAM_CHIP / 2 + aire
  }
  const libre = (x: number, y: number, al: Texto['alinear']) => {
    cajaDe(x, y, al, AIRE_TEXTO)
    return !fijos.choca(caja) && !puestos.choca(caja)
  }
  /** Sin un texto de la escena en su línea a menos de `HUECO_MISMA_LINEA`: no se lee como el valor de una pieza. */
  const lejosDeTextos = (x: number, y: number, al: Texto['alinear']) => {
    cajaDe(x, y, al, 0)
    caja.minX -= HUECO_MISMA_LINEA
    caja.maxX += HUECO_MISMA_LINEA
    return !lineas.choca(caja)
  }
  const libreYLejos = (x: number, y: number, al: Texto['alinear']) => libre(x, y, al) && lejosDeTextos(x, y, al)
  /** Además, sin tocar el hueco de ningún extremo de pin. */
  const conMargen = (x: number, y: number, al: Texto['alinear']) => {
    if (!libreYLejos(x, y, al)) return false
    cajaDe(x, y, al, 0)
    return !pines.choca(caja)
  }
  let ex = 0, ey = 0, eal: Texto['alinear'] = 'centro'
  /** Los candidatos y, si ninguno sirve, los mismos alejados de 1 a 6 renglones por arriba y por abajo. Deja el que sirve
   * en ex, ey y eal. */
  const buscar = (sirve: (x: number, y: number, al: Texto['alinear']) => boolean): boolean => {
    for (let j = 0; j < n; j++)
      if (sirve(xs[j], ys[j], als[j])) {
        ex = xs[j]
        ey = ys[j]
        eal = als[j]
        return true
      }
    for (let k = 1; k <= 6; k++)
      for (let j = 0; j < n; j++) {
        const arriba = ys[j] - k * SEPARACION_CHIP
        if (sirve(xs[j], arriba, als[j])) {
          ex = xs[j]
          ey = arriba
          eal = als[j]
          return true
        }
        const abajo = ys[j] + k * SEPARACION_CHIP
        if (sirve(xs[j], abajo, als[j])) {
          ex = xs[j]
          ey = abajo
          eal = als[j]
          return true
        }
      }
    return false
  }
  /** Solo los candidatos mismos (a 1.6 unidades del cable), sin alejarlos. */
  const buscarCerca = (sirve: (x: number, y: number, al: Texto['alinear']) => boolean): boolean => {
    for (let j = 0; j < n; j++)
      if (sirve(xs[j], ys[j], als[j])) {
        ex = xs[j]
        ey = ys[j]
        eal = als[j]
        return true
      }
    return false
  }
  const poner = (x: number, y: number, al: Texto['alinear']) => {
    xs[n] = x
    ys[n] = y
    als[n] = al
    n++
  }
  const out: Texto[] = []
  for (const r of con.redes) {
    const v = l.redes.get(r.id)
    const dg = l.digitales?.get(r.id)
    if ((v === undefined && !dg) || !redLlevaChip(r)) continue
    if (opciones.redes && !opciones.redes.has(r.id)) continue
    // Una red digital pura dice su nivel y su voltaje nominal, y una que conmuta, su frecuencia.
    const texto = dg && (v === undefined || (dg.conmuta && dg.f > 0)) ? textoNivelRed(dg) : textoDeVoltaje(v!)
    const clave = claveDeRedChip(r)
    ancho = anchoTexto(texto, TAM_CHIP)
    n = 0
    const t = tramoMasLargo(doc, r)
    const enEntrada = candidatosEnEntrada(doc, lib, r)
    if (enEntrada) for (const c of enEntrada) poner(c.x, c.y, c.alinear)
    else if (t?.horizontal) {
      const cx = (t.a.x + t.b.x) / 2
      poner(cx, t.a.y - SEPARACION_CHIP, 'centro')
      poner(cx, t.a.y + SEPARACION_CHIP, 'centro')
    } else if (t) {
      const cy = (t.a.y + t.b.y) / 2
      poner(t.a.x + SEPARACION_CHIP / 2, cy, 'izq')
      poner(t.a.x - SEPARACION_CHIP / 2, cy, 'der')
    } else {
      const menor = [...r.pines].sort((x, y) => ordenRef(doc.piezas[partirClavePin(x).piezaId]?.ref ?? '', doc.piezas[partirClavePin(y).piezaId]?.ref ?? ''))[0]
      const { piezaId, pinId } = partirClavePin(menor)
      const p = doc.piezas[piezaId]
      const def = p ? lib.get(p.tipo) : undefined
      const pin = p && def ? pinesEnMundo(p, def).find((q) => q.id === pinId) : undefined
      if (!pin) continue
      const m = SEPARACION_CHIP / 2
      poner(pin.x, pin.y - SEPARACION_CHIP, 'centro')
      poner(pin.x, pin.y + SEPARACION_CHIP, 'centro')
      poner(pin.x + m, pin.y - m, 'izq')
      poner(pin.x - m, pin.y - m, 'der')
    }
    // Primero libre, lejos de los textos de su línea y con margen de los pines, sin alejarse del cable (un cable corto
    // nunca da margen: ahí manda el lugar de siempre); si no, libre y lejos; si no, solo libre; si todo está ocupado, el primero.
    if (!buscarCerca(conMargen) && !buscar(libreYLejos) && !buscar(libre)) {
      ex = xs[0]
      ey = ys[0]
      eal = als[0]
    }
    const elegido: Texto = { texto, x: ex, y: ey, alinear: eal, tamaño: TAM_CHIP, color: 'trazo', fuente: 'cifras', chip: true, clave }
    cajaDe(ex, ey, eal, AIRE_TEXTO)
    puestos.agregar(caja.minX, caja.minY, caja.maxX, caja.maxY)
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

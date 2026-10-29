import { porId } from '../conexiones/conexiones'
import type { Cable, Documento, Etiqueta, Id, Nota, Pieza } from '../doc/tipos'
import { cuerpoEnMundo } from '../editor/colision'
import { transformar } from '../piezas/transformar'
import type { Caja, PiezaDef } from '../piezas/tipos'
import { rotulosDePieza, textoEnPieza, textosLocales, type PuntoLocal, type Texto, type TextoDePieza } from './etiquetas'
import { textosManuales } from './textosManuales'
import { Cubetas, hipotenusa } from './cubetas'
import { ANCHO_CABLE, anchoTexto, cajaEtiqueta, cajaNota, TAM_ETIQUETA } from './medidas'
import type { Token } from './paleta'
import { defDe } from '../piezas/sinEquivalencia'

/** Aire alrededor de cada texto, en unidades, para que no quede pegado a un cable o a un cuerpo. */
export const AIRE_TEXTO = 0.2
/** Lugares que se prueban para una referencia o valor, en unidades del símbolo: [afuera, de lado]. «Afuera» se aleja del
 * cuerpo sobre el eje de la etiqueta, «de lado» va en perpendicular. El primero es el de la definición y gana el primero
 * que no choca. */
export const CANDIDATOS: readonly (readonly [number, number])[] = [[0, 0], [2, 0], [4, 0], [0, 2], [0, -2], [0, 4], [0, -4], [2, 2], [2, -2]]
const N_CANDIDATOS = CANDIDATOS.length
/** Lugares de un texto en el renglón de un rótulo (el voltaje tras el nombre de un terminal): corrimientos a lo largo del
 * renglón, hacia donde crece el texto, que nunca lo sacan del renglón ni lo pasan antes del nombre. */
export const CORRIMIENTOS_RENGLON: readonly number[] = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4]

/** Tolerancia de las cajas: coordenadas de SVG con decimales; una arista que apenas toca no cuenta. */
const EPS = 1e-6
/** Lado de la cubeta, en unidades. */
const CELDA = 16
/** Hasta cuántos lugares libres se cuentan por rótulo para decidir el orden de colocación. */
const TOPE_LIBRES = 3

export function cajaTexto(t: Texto, aire = AIRE_TEXTO): Caja {
  const w = t.ancho ?? anchoTexto(t.texto, t.tamaño)
  if (t.giro) {
    // Girado un cuarto de vuelta: el largo corre a lo alto.
    const arriba = t.alinear === 'izq' ? t.y : t.alinear === 'der' ? t.y - w : t.y - w / 2
    return { minX: t.x - t.tamaño / 2 - aire, minY: arriba - aire, maxX: t.x + t.tamaño / 2 + aire, maxY: arriba + w + aire }
  }
  const izq = t.alinear === 'izq' ? t.x : t.alinear === 'der' ? t.x - w : t.x - w / 2
  return { minX: izq - aire, minY: t.y - t.tamaño / 2 - aire, maxX: izq + w + aire, maxY: t.y + t.tamaño / 2 + aire }
}

/** Hueco en unidades bajo el cual el texto de una pieza se lee como vecino del de otra («V1 5 V 10 kΩ» parece que el 10 kΩ
 * es de V1). Un lugar con texto ajeno más cerca es apretado. */
export const ESPACIO_TEXTOS = 1.6
/** Aire de la caja con que se busca un texto vecino: el de siempre más el hueco. */
export const AIRE_APRETADO = AIRE_TEXTO + ESPACIO_TEXTOS

/** Bloque apilado: referencia, valor y ajuste de una pieza uno bajo el otro, del mismo lado y con la misma alineación. */
export const SEPARACION_LINEAS = 1.8
/** Distancia del bloque al cuerpo de su pieza, en unidades. */
export const SEPARACION_BLOQUE = 1
/** Cuánto se corre el bloque a lo largo de su lado en cada intento (arriba y abajo en x, a los lados en y). */
export const SALTO_BLOQUE = 2.8
/** Radios con que se mide la holgura de un bloque: el más grande con el que sigue sin tocar nada. */
export const RADIOS_HOLGURA: readonly number[] = [0.5, 1, 2, 3, 4]

export type LadoBloque = 'derecha' | 'abajo' | 'izquierda' | 'arriba'
const LADOS: readonly LadoBloque[] = ['derecha', 'abajo', 'izquierda', 'arriba']

/** El lado del cuerpo en que cae un punto: el eje dominante de su separación del centro (horizontal si empatan). */
export function ladoDePunto(cuerpo: Caja, x: number, y: number): LadoBloque {
  const dx = x - (cuerpo.minX + cuerpo.maxX) / 2, dy = y - (cuerpo.minY + cuerpo.maxY) / 2
  return Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'derecha' : 'izquierda') : dy > 0 ? 'abajo' : 'arriba'
}

/** Distancia entre dos cajas: 0 si se tocan o se cruzan. */
const distanciaEntreCajas = (a: Caja, b: Caja): number => hipotenusa(Math.max(0, a.minX - b.maxX, b.minX - a.maxX), Math.max(0, a.minY - b.maxY, b.minY - a.maxY))

/** Dos cajas se cruzan (con la tolerancia de las cubetas). */
export const cajasSeCruzan = (a: Caja, b: Caja): boolean => a.minX < b.maxX - EPS && b.minX < a.maxX - EPS && a.minY < b.maxY - EPS && b.minY < a.maxY - EPS

/** Área en que se encima la caja `c` con `o` (0 si no se tocan). */
export function areaEncimada(o: Caja, c: Caja): number {
  const w = Math.min(o.maxX, c.maxX) - Math.max(o.minX, c.minX)
  const h = Math.min(o.maxY, c.maxY) - Math.max(o.minY, c.minY)
  return w > 0 && h > 0 ? w * h : 0
}

/** Lugares de un bloque apilado para las `lineas` de una pieza (referencia arriba, valor abajo): los cuatro lados del
 * cuerpo empezando por el `preferido`, y en cada uno centrado y corrido a ambos lados. Es el orden de preferencia ante
 * igual holgura. */
export function bloquesApilados(cuerpo: Caja, lineas: readonly { texto: string; color: Token }[], preferido: LadoBloque): Texto[][] {
  const n = lineas.length
  const lados = [preferido, ...LADOS.filter((l) => l !== preferido)]
  const cx = (cuerpo.minX + cuerpo.maxX) / 2, cy = (cuerpo.minY + cuerpo.maxY) / 2
  const out: Texto[][] = []
  for (const lado of lados)
    for (const corrimiento of [0, SALTO_BLOQUE, -SALTO_BLOQUE]) {
      const bloque: Texto[] = []
      for (let i = 0; i < n; i++) {
        const { texto, color } = lineas[i]
        let x: number, y: number, alinear: Texto['alinear']
        if (lado === 'derecha' || lado === 'izquierda') {
          x = lado === 'derecha' ? cuerpo.maxX + SEPARACION_BLOQUE : cuerpo.minX - SEPARACION_BLOQUE
          y = cy + corrimiento + (i - (n - 1) / 2) * SEPARACION_LINEAS
          alinear = lado === 'derecha' ? 'izq' : 'der'
        } else {
          x = cx + corrimiento
          y = lado === 'abajo' ? cuerpo.maxY + SEPARACION_BLOQUE + TAM_ETIQUETA / 2 + i * SEPARACION_LINEAS : cuerpo.minY - SEPARACION_BLOQUE - TAM_ETIQUETA / 2 - (n - 1 - i) * SEPARACION_LINEAS
          alinear = 'centro'
        }
        bloque.push({ texto, x, y, alinear, tamaño: TAM_ETIQUETA, color, fuente: 'cifras' })
      }
      out.push(bloque)
    }
  return out
}

type TextoLocal = ReturnType<typeof textosLocales>[number]

/** Punto local (en unidades del símbolo) del k-ésimo lugar de `CANDIDATOS` para un texto con su punto en (lx, ly). */
function localDeCandidato(lx: number, ly: number, k: number): [number, number] {
  // Afuera: el eje dominante del punto local (vertical si empatan); de lado, el otro.
  const vertical = Math.abs(ly) >= Math.abs(lx)
  const s = vertical ? Math.sign(ly) || -1 : Math.sign(lx)
  const [a, b] = CANDIDATOS[k]
  return vertical ? [lx + b, ly + s * a] : [lx + s * a, ly + b]
}

/** El k-ésimo lugar de `CANDIDATOS` (o de `CORRIMIENTOS_RENGLON`, si va en el renglón de un rótulo) para un texto local de una pieza. */
function candidatoDeTexto(p: Pieza, t: TextoLocal, k: number): Texto {
  const r = t.local.renglon
  if (r) return textoEnPieza(p, t.texto, t.local.x, t.local.y, t.color, r * CORRIMIENTOS_RENGLON[k])
  const [x, y] = localDeCandidato(t.local.x, t.local.y, k)
  return textoEnPieza(p, t.texto, x, y, t.color)
}

/** Por punto local de un texto (el de la definición), sus candidatos girados en cada orientación. */
const girados = new WeakMap<PuntoLocal, { x: number; y: number; porOrientacion: (Float64Array | undefined)[] }>()

/** Puntos de `CANDIDATOS` del texto con su punto local en `local`, ya reflejados y girados como `transformar` (sin
 * trasladar): [x0, y0, x1, y1, …]. Las piezas de un tipo comparten esos puntos, así que se calculan una vez por tipo y
 * orientación (y de nuevo si el punto cambió). */
function candidatosGirados(local: PuntoLocal, rot: Pieza['rot'], espejo: boolean): Float64Array {
  let g = girados.get(local)
  if (!g || g.x !== local.x || g.y !== local.y) girados.set(local, (g = { x: local.x, y: local.y, porOrientacion: [] }))
  const i = (rot === 0 ? 0 : rot === 90 ? 1 : rot === 180 ? 2 : 3) + (espejo ? 4 : 0)
  let tabla = g.porOrientacion[i]
  if (!tabla) {
    tabla = new Float64Array(2 * N_CANDIDATOS)
    const r = local.renglon
    for (let k = 0; k < N_CANDIDATOS; k++) {
      if (r) {
        // A lo largo del renglón: se gira el punto y se corre en x del mundo, como `textoEnPieza` con `corrido`.
        const [tx, ty] = transformar(local.x, local.y, rot, espejo)
        tabla[2 * k] = tx + r * CORRIMIENTOS_RENGLON[k]
        tabla[2 * k + 1] = ty
        continue
      }
      const [lx, ly] = localDeCandidato(local.x, local.y, k)
      const [tx, ty] = transformar(lx, ly, rot, espejo)
      tabla[2 * k] = tx
      tabla[2 * k + 1] = ty
    }
    g.porOrientacion[i] = tabla
  }
  return tabla
}

/** Los lugares que se prueban para un texto local de una pieza, en el orden de `CANDIDATOS`. */
export const candidatosDeTexto = (p: Pieza, t: TextoLocal): Texto[] => CANDIDATOS.map((_, k) => candidatoDeTexto(p, t, k))

/** Los elementos de cada colección del documento, en su orden. */
export interface ListasDelDocumento {
  piezas: Pieza[]
  cables: Cable[]
  etiquetas: Etiqueta[]
  notas: Nota[]
}

export const listasDe = (doc: Documento): ListasDelDocumento => ({
  piezas: valores(doc.piezas), cables: valores(doc.cables), etiquetas: valores(doc.etiquetas), notas: valores(doc.notas)
})

/** Lo mismo que `Object.values`, en el orden de `Object.keys`: con miles de elementos el objeto pasa a modo diccionario y
 * `Object.values` tarda el doble que sacar claves y leerlas. */
export function valores<T>(o: Record<string, T>): T[] {
  const claves = Object.keys(o)
  const out: T[] = []
  for (let i = 0; i < claves.length; i++) out.push(o[claves[i]])
  return out
}

/** Alineación de un candidato guardada como número: la de `alineacionPorX` (izq, der o centro). */
const IZQ = 0, DER = 1, CENTRO = 2
/** Bits del estado de un candidato. */
const ACEPTABLE = 1, SABIDO = 2, LIBRE = 4

/** Referencias y valores de todas las piezas: cada uno en su lugar de la definición o, si ahí se encima, en el primer
 * candidato libre y más cerca de su propia pieza que de otra. Por id (no depende del orden del documento). Da lo mismo
 * que `prueba/apartarReferencia.ts`. `listas`: elementos ya extraídos (`Object.values` de 5,000 cuesta casi 1 ms). */
export function etiquetasSinChoques(doc: Documento, lib: Map<string, PiezaDef>, listas: ListasDelDocumento = listasDe(doc)): Map<Id, Texto[]> {
  // Cuántas cajas lleva cada rejilla, para no hacer crecer sus arreglos de a poco.
  const piezas = listas.piezas.slice().sort(porId)
  const defs = piezas.map((p) => defDe(p, lib.get(p.tipo)))
  // Los textos de cada pieza y los que se movieron a mano: esos quedan donde se pusieron, no se
  // reparten, y son obstáculos fijos para todos los demás textos, también los de su pieza.
  const localesDe: (TextoDePieza[] | null)[] = []
  const manuales: (Map<number, Texto> | null)[] = []
  let nManuales = 0
  for (let ip = 0; ip < piezas.length; ip++) {
    const def = defs[ip]
    const l = def ? textosLocales(piezas[ip], def, doc) : null
    localesDe.push(l)
    const m = def && l && piezas[ip].textos ? textosManuales(piezas[ip], def, l) : null
    manuales.push(m && m.size > 0 ? m : null)
    nManuales += m?.size ?? 0
  }
  let nFijos = piezas.length + listas.etiquetas.length + listas.notas.length + nManuales
  for (const c of listas.cables) nFijos += Math.max(0, c.puntos.length - 1)
  for (const def of defs) nFijos += def?.rotulos?.length ?? 0
  const fijos = new Cubetas(nFijos, CELDA, EPS)
  /** Solo los cuerpos, para medir qué pieza queda más cerca de un texto. */
  const cuerpos = new Cubetas(listas.piezas.length, CELDA, EPS)
  const agregarCaja = (c: Caja) => fijos.agregar(c.minX, c.minY, c.maxX, c.maxY)
  const m = ANCHO_CABLE / 2
  for (const c of listas.cables)
    for (let i = 1; i < c.puntos.length; i++) {
      const a = c.puntos[i - 1], b = c.puntos[i]
      fijos.agregar(Math.min(a.x, b.x) - m, Math.min(a.y, b.y) - m, Math.max(a.x, b.x) + m, Math.max(a.y, b.y) + m)
    }
  const suyos: Caja[] = []
  piezas.forEach((p, i) => {
    const def = defs[i]
    const cuerpo = cuerpoEnMundo(p, def)
    suyos.push(cuerpo)
    fijos.agregar(cuerpo.minX, cuerpo.minY, cuerpo.maxX, cuerpo.maxY, i)
    cuerpos.agregar(cuerpo.minX, cuerpo.minY, cuerpo.maxX, cuerpo.maxY, i)
    // Los rótulos del símbolo (nombres y números de pin) tampoco se pisan con la referencia ni el valor.
    if (def?.rotulos) for (const r of rotulosDePieza(p, def)) agregarCaja(cajaTexto(r))
  })
  for (const e of listas.etiquetas) agregarCaja(cajaEtiqueta(e))
  for (const n of listas.notas) agregarCaja(cajaNota(n))
  for (const m of manuales) if (m) for (const t of m.values()) agregarCaja(cajaTexto(t))
  fijos.indexar()
  cuerpos.indexar()

  // Rótulos: pieza, lugar entre los de su pieza, texto local y ancho de su caja.
  const ipDe: number[] = [], posDe: number[] = [], locales: TextoLocal[] = [], anchos: number[] = [], giros: Float64Array[] = []
  /** Por pieza con textos: el primero de sus rótulos y cuántos son (están seguidos). */
  const iniGrupo: number[] = [], nGrupo: number[] = [], ipGrupo: number[] = []
  for (let ip = 0; ip < piezas.length; ip++) {
    const def = defs[ip]
    if (!def) continue
    const p = piezas[ip]
    let pos = 0
    const ini = locales.length
    const manual = manuales[ip]
    for (const t of localesDe[ip]!) {
      if (manual?.has(pos)) {
        pos++
        continue
      }
      ipDe.push(ip)
      posDe.push(pos++)
      locales.push(t)
      anchos.push(anchoTexto(t.texto, TAM_ETIQUETA))
      giros.push(candidatosGirados(t.local, p.rot, p.espejo))
    }
    if (locales.length > ini) {
      iniGrupo.push(ini)
      nGrupo.push(locales.length - ini)
      ipGrupo.push(ip)
    }
  }
  const nRotulos = locales.length
  const puestos = new Cubetas(nRotulos, CELDA, EPS, fijos.zonaDensa)
  puestos.indexar()
  // Candidatos de cada rótulo, `N_CANDIDATOS` por rótulo, evaluados de a uno cuando hacen falta.
  const cx = new Float64Array(nRotulos * N_CANDIDATOS), cy = new Float64Array(nRotulos * N_CANDIDATOS)
  const propias = new Float64Array(nRotulos * N_CANDIDATOS)
  const alineaciones = new Uint8Array(nRotulos * N_CANDIDATOS), estados = new Uint8Array(nRotulos * N_CANDIDATOS)
  const evaluados = new Uint8Array(nRotulos), libres = new Uint8Array(nRotulos)
  /** Caja de consulta que se reescribe en cada candidato. */
  const caja: Caja = { minX: 0, minY: 0, maxX: 0, maxY: 0 }
  // Lo mismo que `cajaTexto` del `Texto` del candidato: mismas operaciones en el mismo orden.
  const cajaDe = (r: number, o: number, aire: number) => {
    const w = anchos[r], x = cx[o], y = cy[o], al = alineaciones[o]
    const izq = al === IZQ ? x : al === DER ? x - w : x - w / 2
    caja.minX = izq - aire
    caja.minY = y - TAM_ETIQUETA / 2 - aire
    caja.maxX = izq + w + aire
    caja.maxY = y + TAM_ETIQUETA / 2 + aire
  }
  // Cuál es aceptable (más cerca de su pieza que de otra); si es libre de obstáculos fijos se sabe aparte.
  const evaluar = (r: number): number => {
    const k = evaluados[r]++
    const o = r * N_CANDIDATOS + k
    const p = piezas[ipDe[r]]
    // Como `textoEnPieza`: el punto girado con la pieza y la alineación por su x girada.
    const giro = giros[r]
    const tx = giro[2 * k], ty = giro[2 * k + 1]
    cx[o] = p.x + tx
    cy[o] = p.y + ty
    alineaciones[o] = tx > 0 ? IZQ : tx < 0 ? DER : CENTRO
    cajaDe(r, o, 0)
    const s = suyos[ipDe[r]]
    const propia = hipotenusa(Math.max(0, caja.minX - s.maxX, s.minX - caja.maxX), Math.max(0, caja.minY - s.maxY, s.minY - caja.maxY))
    propias[o] = propia
    estados[o] = cuerpos.masCercaQue(caja, propia, ipDe[r]) ? 0 : ACEPTABLE
    return o
  }

  // Antes de poner ningún texto se cuentan los lugares aceptables y libres de obstáculos fijos
  // (cuerpos, cables, rótulos del símbolo, etiquetas y notas) hasta `TOPE_LIBRES`: con eso basta
  // para saber qué rótulos tienen pocas salidas.
  for (let r = 0; r < nRotulos; r++)
    while (libres[r] < TOPE_LIBRES && evaluados[r] < N_CANDIDATOS) {
      const o = evaluar(r)
      if (!(estados[o] & ACEPTABLE)) continue
      cajaDe(r, o, AIRE_TEXTO)
      if (fijos.choca(caja, ipDe[r])) estados[o] |= SABIDO
      else {
        estados[o] |= SABIDO | LIBRE
        libres[r]++
      }
    }
  // Primero las piezas con menos lugares buenos (el menor de sus rótulos), para que otra no les quite el único que
  // tienen; a igual número, el orden de siempre (por id de pieza). Orden estable por cubetas.
  const nGrupos = iniGrupo.length
  const clave = new Uint8Array(nGrupos)
  for (let g = 0; g < nGrupos; g++) {
    let m = TOPE_LIBRES
    for (let r = iniGrupo[g]; r < iniGrupo[g] + nGrupo[g]; r++) if (libres[r] < m) m = libres[r]
    clave[g] = m
  }
  const orden: number[] = []
  for (let l = 0; l <= TOPE_LIBRES; l++) for (let g = 0; g < nGrupos; g++) if (clave[g] === l) orden.push(g)
  // Los textos de la definición de las piezas que aún no se colocan ya cuentan como vecinos de los demás: así la que se
  // coloca primero también se aparta del texto de otra que todavía no se coloca. El dueño es el lugar de la pieza en `orden`.
  const defectos = new Cubetas(nRotulos, CELDA, EPS, fijos.zonaDensa)
  defectos.indexar()
  for (let rango = 0; rango < orden.length; rango++) {
    const g = orden[rango]
    for (let r = iniGrupo[g]; r < iniGrupo[g] + nGrupo[g]; r++) {
      cajaDe(r, r * N_CANDIDATOS, AIRE_TEXTO)
      defectos.agregar(caja.minX, caja.minY, caja.maxX, caja.maxY, rango)
    }
  }
  const elegidos: Texto[][] = piezas.map((_, ip) => {
    const m = manuales[ip]
    const l: Texto[] = []
    if (m) for (const [pos, t] of m) l[pos] = t
    return l
  })
  /** Cajas (con aire) de los textos ya decididos de la pieza en curso. */
  const propios: Caja[] = []
  const chocaPropios = (c: Caja) => {
    for (let i = 0; i < propios.length; i++) if (cajasSeCruzan(propios[i], c)) return true
    return false
  }
  const decididos: Texto[] = []
  let rango = 0
  /** Apretado por un texto ya puesto o por el de la definición de una pieza que aún no se coloca. */
  const apretadoCaja = (c: Caja) => puestos.choca(c) || defectos.chocaDeRango(c, rango)
  for (rango = 0; rango < orden.length; rango++) {
    const g = orden[rango]
    const ip = ipGrupo[g], ini = iniGrupo[g], n = nGrupo[g]
    propios.length = 0
    decididos.length = 0
    let completo = true
    // 1. Texto por texto: el primer lugar aceptable, libre y holgado (sin el texto de otra pieza a menos de ESPACIO_TEXTOS).
    for (let r = ini; r < ini + n && completo; r++) {
      let elegido = -1
      for (let k = 0; k < N_CANDIDATOS; k++) {
        const o = k < evaluados[r] ? r * N_CANDIDATOS + k : evaluar(r)
        if (!(estados[o] & ACEPTABLE)) continue
        cajaDe(r, o, AIRE_TEXTO)
        const libreDeFijos = estados[o] & SABIDO ? (estados[o] & LIBRE) !== 0 : !fijos.choca(caja, ip)
        if (!libreDeFijos || puestos.choca(caja, ip) || chocaPropios(caja)) continue
        cajaDe(r, o, AIRE_APRETADO)
        if (apretadoCaja(caja)) continue
        elegido = k
        break
      }
      if (elegido < 0) completo = false
      else {
        const q = candidatoDeTexto(piezas[ip], locales[r], elegido)
        decididos.push(q)
        propios.push(cajaTexto(q))
      }
    }
    // 2. Referencia, valor y ajuste apilados del lado con más holgura (no si alguno va en el renglón de un rótulo: no lo deja).
    if (!completo && n >= 2 && !locales.slice(ini, ini + n).some((t) => t.local.renglon)) {
      const suyo = suyos[ip]
      const primero = candidatoDeTexto(piezas[ip], locales[ini], 0)
      const bloques = bloquesApilados(suyo, locales.slice(ini, ini + n), ladoDePunto(suyo, primero.x, primero.y))
      let mejor = -1
      for (const bloque of bloques) {
        const cajas = bloque.map((q) => cajaTexto(q))
        let buenos = true
        for (let i = 0; i < bloque.length && buenos; i++) {
          const caja0 = cajaTexto(bloque[i], 0)
          const d = distanciaEntreCajas(caja0, suyo)
          buenos = !cuerpos.masCercaQue(caja0, d, ip) && !fijos.choca(cajas[i], ip) && !puestos.choca(cajas[i], ip) && !apretadoCaja(cajaTexto(bloque[i], AIRE_APRETADO))
        }
        if (!buenos) continue
        const union: Caja = {
          minX: Math.min(...cajas.map((c) => c.minX)), minY: Math.min(...cajas.map((c) => c.minY)),
          maxX: Math.max(...cajas.map((c) => c.maxX)), maxY: Math.max(...cajas.map((c) => c.maxY))
        }
        let holgura = 0
        for (const radio of RADIOS_HOLGURA) {
          const amplia: Caja = { minX: union.minX - radio, minY: union.minY - radio, maxX: union.maxX + radio, maxY: union.maxY + radio }
          if (fijos.choca(amplia, ip) || puestos.choca(amplia, ip)) break
          holgura++
        }
        if (holgura > mejor) {
          mejor = holgura
          decididos.length = 0
          decididos.push(...bloque)
          completo = true
        }
      }
    }
    // 3. La regla de antes, texto por texto.
    if (!completo) {
      decididos.length = 0
      propios.length = 0
      for (let r = ini; r < ini + n; r++) {
        // El primer lugar aceptable y libre; si ninguno, el aceptable que menos área encime; si no hay
        // ninguno aceptable, el más cercano a su cuerpo.
        let elegido = -1, encimado = -1, masCerca = -1
        let menor = Infinity, dMin = Infinity
        for (let k = 0; k < N_CANDIDATOS; k++) {
          const o = k < evaluados[r] ? r * N_CANDIDATOS + k : evaluar(r)
          if (propias[o] < dMin) {
            dMin = propias[o]
            masCerca = k
          }
          if (!(estados[o] & ACEPTABLE)) continue
          cajaDe(r, o, AIRE_TEXTO)
          const libreDeFijos = estados[o] & SABIDO ? (estados[o] & LIBRE) !== 0 : !fijos.choca(caja, ip)
          if (libreDeFijos && !puestos.choca(caja, ip) && !chocaPropios(caja)) {
            elegido = k
            break
          }
          let area = Cubetas.areaSolapada(fijos, puestos, caja, ip)
          for (let i = 0; i < propios.length; i++) area += areaEncimada(propios[i], caja)
          if (area < menor - 1e-9) {
            menor = area
            encimado = k
          }
        }
        if (elegido < 0) elegido = encimado >= 0 ? encimado : masCerca
        const q = candidatoDeTexto(piezas[ip], locales[r], elegido)
        decididos.push(q)
        propios.push(cajaTexto(q))
      }
    }
    for (let i = 0; i < n; i++) {
      const c = cajaTexto(decididos[i])
      puestos.agregar(c.minX, c.minY, c.maxX, c.maxY)
      elegidos[ip][posDe[ini + i]] = decididos[i]
    }
  }
  const out = new Map<Id, Texto[]>()
  piezas.forEach((p, ip) => {
    if (defs[ip]) out.set(p.id, elegidos[ip])
  })
  return out
}

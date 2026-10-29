/** La «Pieza sin equivalencia»: una caja de integrado con los pines de la pieza ajena, dibujada por instancia porque sus
 * pines viven en el documento y no en el `pieza.json`. */
import { MM_POR_UNIDAD, type Pieza, type PinPropio } from '../doc/tipos'
import { anchoEnEm } from '../lienzo/metricas'
import type { PiezaDef, PinDef, Rotulo } from './tipos'

export const ID_SIN_EQUIVALENCIA = 'sin-equivalencia'
/** El motivo por el que una caja gris impide simular, analizar y exportar; lo comparten los avisos y la netlist. */
export const textoSinEquivalencia = (ref: string): string => `${ref} no tiene equivalencia en Kirchi: reemplázala para simular.`
/** Tope de pines de una caja (el de un `.kir` no confiable). */
export const MAX_PINES_CAJA = 128

/** Alto de los textos: a menos de unos 6 px el lienzo los omite, y con 1 mm ya no se leían a zoom normal. */
const TAM_TITULO = 1.6
const TAM_PIN = 1.4
/** Ancho real de un texto en unidades, con las métricas de las fuentes del lienzo (`tam` va en mm). */
const anchoDe = (texto: string, tam: number, fuente: 'sans' | 'mono' = 'sans') => anchoEnEm(texto, { fuente, negrita: false, cursiva: false }) * (tam / MM_POR_UNIDAD)
/** El nombre del pin se escribe dentro solo si dice algo que el número no dice (en SPICE el nombre es el número). */
const nombreUtil = (p: PinPropio) => p.nombre !== '' && p.nombre !== p.numero
const multiplo4 = (n: number) => 4 * Math.ceil(n / 4)

interface Disenio {
  pines: PinDef[]
  geometria: PiezaDef['geometria']
  rotulos: Rotulo[]
  etiquetas: PiezaDef['etiquetas']
}

/** Pines a izquierda y derecha en columnas de 2 unidades, el cuerpo en múltiplos de 4 y las patas de 2 unidades fuera
 * del borde, como los integrados generados: todo cae en coordenadas pares. */
export function disenarCaja(pines: readonly PinPropio[], titulo: string): Disenio {
  const izq = pines.filter((p) => p.lado === 'izq')
  const der = pines.filter((p) => p.lado === 'der')
  const n = Math.max(izq.length, der.length, 1)
  const alto = multiplo4(2 * n + 4)
  const sup = -alto / 2
  const inf = alto / 2
  const y0 = sup + 4
  const lado = (l: readonly PinPropio[]) => Math.max(0, ...l.filter(nombreUtil).map((p) => anchoDe(p.nombre, TAM_PIN) + 0.8))
  // El nombre de la caja y los nombres de pin de ambos lados caben con aire entre contorno y texto.
  const ancho = multiplo4(Math.max(8, lado(izq) + lado(der) + 2, anchoDe(titulo, TAM_TITULO) + 3))
  const x0 = -ancho / 2
  const x1 = ancho / 2

  const defs: PinDef[] = []
  const trazos: number[][] = [[x0, sup, x1, sup, x1, inf, x0, inf, x0, sup]]
  const rotulos: Rotulo[] = []
  if (titulo) rotulos.push({ texto: titulo, x: 0, y: sup + 1.6, tam: TAM_TITULO, alinear: 'centro', fuente: 'sans', tinta: 'pieza' })
  const poner = (l: readonly PinPropio[], borde: number, hacia: 1 | -1) => {
    l.forEach((p, i) => {
      const y = y0 + 2 * i
      const x = borde - 2 * hacia
      defs.push({ id: p.id, nombre: p.nombre, x, y })
      trazos.push([x, y, borde, y])
      if (nombreUtil(p)) rotulos.push({ texto: p.nombre, x: borde + 0.8 * hacia, y, tam: TAM_PIN, alinear: hacia === 1 ? 'izq' : 'der', fuente: 'sans', tinta: 'pieza' })
      // Sin número, el nombre vacío no deja nada que mostrar; con nombre igual al número, sale solo el número, afuera.
      if (p.numero) rotulos.push({ texto: p.numero, x: x + hacia, y: y - 0.9, tam: 1.4, alinear: 'centro', fuente: 'mono', tinta: 'valor' })
    })
  }
  poner(izq, x0, 1)
  poner(der, x1, -1)

  const xs = [x0 - 2, x1 + 2]
  return {
    pines: defs,
    geometria: { trazos, rellenos: [], caja: { minX: xs[0], minY: sup, maxX: xs[1], maxY: inf } },
    rotulos,
    etiquetas: { ref: { x: 0, y: sup - 2 }, valor: { x: 0, y: inf + 2 } }
  }
}

const memo = new WeakMap<readonly PinPropio[], { titulo: string; def: PiezaDef }>()

/** La definición de la pieza tal como es para esta instancia: la caja con sus pines si es una «sin equivalencia» y trae
 * pines; la de la librería en cualquier otro caso. Una caja por lista de pines y nombre, para que las cachés por
 * definición (giros, cuerpos) se compartan. */
export function defDe(p: Pieza, def: PiezaDef): PiezaDef
export function defDe(p: Pieza, def: PiezaDef | undefined): PiezaDef | undefined
export function defDe(p: Pieza, def: PiezaDef | undefined): PiezaDef | undefined {
  if (!def || !p.pines || def.id !== ID_SIN_EQUIVALENCIA) return def
  const titulo = (p.props.nombre ?? '').slice(0, 24)
  const hecha = memo.get(p.pines)
  if (hecha && hecha.titulo === titulo) return hecha.def
  const d = disenarCaja(p.pines, titulo)
  const nueva: PiezaDef = { ...def, pines: d.pines, geometria: d.geometria, rotulos: d.rotulos, etiquetas: d.etiquetas }
  memo.set(p.pines, { titulo, def: nueva })
  return nueva
}

/** Los pines de la instancia: los suyos si es una caja con pines, los de la definición si no. */
export function pinesDe(p: Pieza, def: PiezaDef): PinDef[] {
  return defDe(p, def).pines
}

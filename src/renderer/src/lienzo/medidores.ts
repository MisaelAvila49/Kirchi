import type { Id, Punto, Sonda } from '../doc/tipos'
import type { Caja } from '../piezas/tipos'
import type { LecturaMedidor } from '../sim/medidor'
import { partirValor } from '../valores/unidades'
import type { EscritorTrazos, EscritorTriangulos } from './buffers'
import type { Texto } from './etiquetas'
import { ANCHO_TRAZO } from './medidas'
import type { Paleta, RGBA } from './paleta'

/** Medidor rápido en el lienzo: cuerpo oscuro con pantalla verde grisácea, función y referencia arriba en Geist Mono y
 * cifra en seminegrita (texto normal, no de siete segmentos, para leerla a primera vista). Guía punteada al punto que
 * mide. La escena dibuja cuerpo y reposo; la capa de la vista previa, la lectura. Textos de al menos 8 px. */

/** Tamaño de letra de la cifra, en unidades de rejilla fina (sus dígitos miden cerca de 0.7 de esto: ~55 % del vidrio). */
export const TAM_CIFRAS = 2.7
/** Alto reservado a la cifra, de la arista de arriba a la de abajo. */
const ALTO_CIFRAS = 2.4
/** Lo que mide el cuerpo: ancho fijo, y alto con una fila más de pantalla en AC (para la frecuencia). */
export const ANCHO_CUERPO = 13.6
export const ALTO_CUERPO_DC = 6.3
export const ALTO_CUERPO_AC = 7.8
/** Alto de la tira de arriba (función y referencia) y aire de la pantalla dentro del cuerpo. */
const TIRA = 1.9
const MARGEN = 0.6
/** Lo que reserva a la derecha de las cifras la unidad («mA»). */
const RESERVA_UNIDAD = 2.6
/** Tamaño de letra de la función y la referencia, de la unidad y de la frecuencia. */
export const TAM_FUNCION = 1.2
const TAM_UNIDAD = 1.3
const TAM_FRECUENCIA = 1.1
/** Los textos del medidor no se dibujan bajo 8 px. */
export const MINIMO_PX_MEDIDOR = 8

/** La función que mide, como la dice el multímetro («V DC», «A AC»). */
export const funcionDeMedidor = (s: Sonda): string => `${s.magnitud === 'corriente' ? 'A' : 'V'} ${s.modo === 'ac' ? 'AC' : 'DC'}`

export interface PantallaMedidor {
  sonda: Id
  /** El cuerpo: centrado en el punto más el desplazamiento de `pantalla` (en DC) y con el borde de arriba fijo al crecer en AC. */
  caja: Caja
  /** El vidrio de la pantalla dentro del cuerpo. */
  vidrio: Caja
  /** Del punto medido a la esquina del cuerpo más cercana. */
  guia: [Punto, Punto]
  /** Borde derecho donde terminan las cifras (se alinean a la derecha) y su arista de arriba (la cifra se centra en esa franja). */
  cifrasDerecha: number
  cifrasY: number
}

/** El cuerpo, su vidrio y su guía. */
export function pantallaDeMedidor(s: Sonda): PantallaMedidor {
  const cx = s.x + (s.pantalla?.dx ?? 0)
  const cy = s.y + (s.pantalla?.dy ?? 0)
  const alto = s.modo === 'ac' ? ALTO_CUERPO_AC : ALTO_CUERPO_DC
  // El borde de arriba no se mueve al pasar a AC: el cuerpo crece hacia abajo.
  const minY = cy - ALTO_CUERPO_DC / 2
  const caja = { minX: cx - ANCHO_CUERPO / 2, minY, maxX: cx + ANCHO_CUERPO / 2, maxY: minY + alto }
  const vidrio = { minX: caja.minX + MARGEN, minY: caja.minY + TIRA, maxX: caja.maxX - MARGEN, maxY: caja.maxY - MARGEN }
  // La esquina más cercana al punto.
  const ex = Math.abs(s.x - caja.minX) <= Math.abs(s.x - caja.maxX) ? caja.minX : caja.maxX
  const ey = Math.abs(s.y - caja.minY) <= Math.abs(s.y - caja.maxY) ? caja.minY : caja.maxY
  return { sonda: s.id, caja, vidrio, guia: [{ x: s.x, y: s.y }, { x: ex, y: ey }], cifrasDerecha: vidrio.maxX - RESERVA_UNIDAD, cifrasY: vidrio.minY + 0.7 }
}

const TEXTOS_DE_MOTIVO: Record<string, string> = {
  'sin-red': 'El punto no está sobre un cable ni una etiqueta.',
  flotante: 'La red del punto no está conectada a nada que se simule.',
  'sin-tramo': 'El punto no está sobre un tramo de cable.',
  esperando: 'Esperando la primera lectura de la corriente.',
  'sin-ventana': 'Todavía no hay un ciclo completo que medir.',
  'no-disponible': 'La corriente AC se mide con el multímetro completo en serie.',
  'fuera-de-rango': 'El valor no cabe en la pantalla.'
}

export interface TextoDePantalla {
  /** Lo que muestra la cifra («7.050», «‒.‒‒‒», «‒‒‒‒»). */
  cifras: string
  /** La unidad con su prefijo («mA»). */
  unidad: string
  /** «50.0 Hz» en AC con frecuencia conocida. */
  frecuencia: string | null
  /** Hay un dato de verdad. */
  hayDato: boolean
  /** La causa de que no haya dato, en palabras (para el globo), o null. */
  titulo: string | null
}

/** Siempre cuatro cifras significativas («2.500», «7.050», «12.34», «123.4»), o null si no caben en la pantalla (fuera de rango). */
function cifrasDe(numero: number): string | null {
  const abs = Math.abs(numero)
  const redondo = Number(abs.toPrecision(4))
  if (redondo >= 9999.5) return null
  const enteras = redondo < 1 ? 1 : Math.floor(Math.log10(redondo)) + 1
  const t = redondo.toFixed(Math.max(0, 4 - enteras))
  return (numero < 0 && redondo !== 0 ? '-' : '') + t
}

/** Lo que dice la pantalla de `s` con la lectura dada: null es «sin lectura» (la vista previa no corre). */
export function textoDePantalla(s: Sonda, lectura: LecturaMedidor | null | undefined): TextoDePantalla {
  const base = s.magnitud === 'corriente' ? 'A' : 'V'
  if (!lectura) return { cifras: '‒.‒‒‒', unidad: base, frecuencia: null, hayDato: false, titulo: null }
  if (lectura.estado === 'sin-dato') return { cifras: '‒‒‒‒', unidad: base, frecuencia: null, hayDato: false, titulo: TEXTOS_DE_MOTIVO[lectura.motivo] ?? null }
  const { numero, prefijo } = partirValor(lectura.valor, base)
  const cifras = cifrasDe(Number(numero))
  if (cifras === null) return { cifras: '‒‒‒‒', unidad: base, frecuencia: null, hayDato: false, titulo: TEXTOS_DE_MOTIVO['fuera-de-rango'] }
  let frecuencia: string | null = null
  if (s.modo === 'ac' && lectura.frecuencia !== undefined && Number.isFinite(lectura.frecuencia) && lectura.frecuencia > 0) {
    const f = partirValor(lectura.frecuencia, 'Hz')
    frecuencia = `${Number(f.numero).toPrecision(3)} ${f.prefijo}Hz`
  }
  return { cifras, unidad: `${prefijo}${base}`, frecuencia, hayDato: true, titulo: null }
}

const rectRelleno = (tri: EscritorTriangulos, c: Caja, color: RGBA): void => {
  tri.triangulo(c.minX, c.minY, c.maxX, c.minY, c.maxX, c.maxY, color)
  tri.triangulo(c.minX, c.minY, c.maxX, c.maxY, c.minX, c.maxY, color)
}

const marco = (t: EscritorTrazos, c: Caja, ancho: number, color: RGBA): void => {
  t.segmento(c.minX, c.minY, c.maxX, c.minY, ancho, color)
  t.segmento(c.maxX, c.minY, c.maxX, c.maxY, ancho, color)
  t.segmento(c.maxX, c.maxY, c.minX, c.maxY, ancho, color)
  t.segmento(c.minX, c.maxY, c.minX, c.minY, ancho, color)
}

/** Guiones de `largo` y huecos de `hueco` a lo largo de un segmento. */
function punteada(t: EscritorTrazos, a: Punto, z: Punto, ancho: number, color: RGBA, largo = 0.7, hueco = 0.5): void {
  const dx = z.x - a.x, dy = z.y - a.y
  const total = Math.hypot(dx, dy)
  if (total === 0) return
  const [ux, uy] = [dx / total, dy / total]
  for (let d = 0; d < total; d += largo + hueco) {
    const fin = Math.min(d + largo, total)
    t.segmento(a.x + ux * d, a.y + uy * d, a.x + ux * fin, a.y + uy * fin, ancho, color)
  }
}

export interface Escritores {
  t: EscritorTrazos
  tri: EscritorTriangulos
  textos: Texto[]
}

/** Cuerpo del medidor: guía punteada, cuerpo con contorno, tira con función y referencia y vidrio vacío. Es lo fijo, no
 * depende de la lectura. */
export function dibujarCuerpoDeMedidor({ t, tri, textos }: Escritores, s: Sonda, paleta: Paleta): void {
  const p = pantallaDeMedidor(s)
  punteada(t, p.guia[0], p.guia[1], ANCHO_TRAZO * 0.6, paleta.textoSecundario)
  t.segmento(s.x, s.y, s.x, s.y, 0.9, paleta.textoSecundario)
  rectRelleno(tri, p.caja, paleta.medidorCuerpo)
  marco(t, p.caja, ANCHO_TRAZO * 0.6, paleta.bordes)
  rectRelleno(tri, p.vidrio, paleta.medidorLcd)
  const y = p.caja.minY + TIRA / 2
  const comun = { y, tamaño: TAM_FUNCION, color: 'medidorLcd' as const, fuente: 'cifras' as const, minimoPx: MINIMO_PX_MEDIDOR }
  textos.push({ ...comun, texto: funcionDeMedidor(s), x: p.caja.minX + MARGEN + 0.2, alinear: 'izq' })
  textos.push({ ...comun, texto: s.ref ?? '', x: p.caja.maxX - MARGEN - 0.2, alinear: 'der' })
}

/** Pantalla con su lectura: vidrio, cifra alineada a la derecha, unidad y, en AC con frecuencia, «50.0 Hz» debajo. Con
 * `lectura` null dibuja el reposo («‒.‒‒‒»). */
export function dibujarPantallaDeMedidor({ tri, textos }: Escritores, s: Sonda, paleta: Paleta, lectura: LecturaMedidor | null | undefined): TextoDePantalla {
  const p = pantallaDeMedidor(s)
  const dato = textoDePantalla(s, lectura)
  rectRelleno(tri, p.vidrio, paleta.medidorLcd)
  const comun = { color: 'medidorTinta' as const, fuente: 'cifras' as const, negrita: true, minimoPx: MINIMO_PX_MEDIDOR }
  textos.push({ ...comun, texto: dato.cifras, x: p.cifrasDerecha, y: p.cifrasY + ALTO_CIFRAS / 2, alinear: 'der', tamaño: TAM_CIFRAS })
  textos.push({ ...comun, texto: dato.unidad, x: p.cifrasDerecha + 0.5, y: p.cifrasY + ALTO_CIFRAS - TAM_UNIDAD * 0.5, alinear: 'izq', tamaño: TAM_UNIDAD })
  if (dato.frecuencia) textos.push({ texto: dato.frecuencia, x: p.vidrio.maxX - 0.5, y: p.vidrio.maxY - 0.9, alinear: 'der', tamaño: TAM_FRECUENCIA, color: 'medidorTinta', fuente: 'cifras', minimoPx: MINIMO_PX_MEDIDOR })
  return dato
}

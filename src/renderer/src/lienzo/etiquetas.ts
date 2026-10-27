import type { CualTexto, Pieza } from '../doc/tipos'
import { destransformar, transformar } from '../piezas/transformar'
import { MAX_TEXTO_PROP, type PiezaDef, type Rotulo } from '../piezas/tipos'
import { rielDeTerminal, SIN_RIELES, type ConRieles } from '../netlist/alimentaciones'
import { formatearValor, leerValor } from '../valores/valores'
import { partesDeAjuste, PROP_JUNTO, SEPARADOR_AJUSTE } from './ajusteEnPieza'
import { alineacionPorX, emDeTam, TAM_ETIQUETA, type Alineacion } from './medidas'
import { anchoEnEm } from './metricas'
import type { Token } from './paleta'

export type { Alineacion }

/** Texto en coordenadas de mundo; `y` es su centro vertical y `tamaño` su alto en unidades. */
export interface Texto {
  texto: string
  x: number
  y: number
  alinear: Alineacion
  tamaño: number
  color: Token
  /** Mona Sans (interfaz), Geist Mono (cifras) o Source Serif. */
  fuente: 'interfaz' | 'cifras' | 'serif'
  negrita?: boolean
  cursiva?: boolean
  /** Ancho ya medido con las métricas de la fuente (notas y etiquetas de red); sin él se estima. */
  ancho?: number
  /** Texto girado un cuarto de vuelta en sentido horario (se lee de arriba abajo) sobre su punto (x, y); sin él, horizontal. */
  giro?: 90
  /** Largo del subrayado desde el inicio del texto, en unidades de mundo. */
  subrayado?: number
  /** Chip de la vista previa: el texto va sobre una placa redondeada del color de los paneles. */
  chip?: boolean
  /** Tamaño en píxeles bajo el cual el texto no se dibuja (por omisión `TEXTO_MINIMO_PX`); el medidor rápido pide 8. */
  minimoPx?: number
  /** Llave de la red de un chip de voltaje (`claveDeRedChip`): con ella el lector lo mueve un poco. */
  clave?: string
  /** Valor de una pieza con resistencia en vivo (termistor, fotorresistencia) mientras simula: este texto es lo que no cambia y la
   * capa de la vista previa escribe tras él la resistencia del motor; `respaldo` es la del documento si aún no hay lectura. */
  vivo?: { id: string; respaldo: string }
}

/** Texto de la primera propiedad numérica (sin `opciones`) o, si no hay, la opción elegida de la primera lista con
 * `mostrar`; null si ninguna. En un terminal de alimentación es el voltaje de su riel, de la tabla de `doc`. */
export function textoDeValor(p: Pieza, def: PiezaDef, doc: ConRieles = SIN_RIELES): string | null {
  // Un terminal de alimentación muestra el voltaje de su riel; con un nombre que ya es un voltaje («+15V»), nada.
  const riel = rielDeTerminal(doc, p, def)
  if (riel) return riel.deNombre ? null : riel.valor === null ? riel.texto : formatearValor(riel.valor, 'V')
  // Con la opción «Mostrar» (junto), el valor lleva el ajuste y la resistencia tras él; el ajuste de la perilla no es el valor.
  const conJunto = def.props.some((d) => d.id === PROP_JUNTO)
  const prop = def.props.find((d) => !d.opciones && !d.texto && !d.ajuste && !(conJunto && d.enVivo))
  let base: string | null
  if (!prop) {
    const lista = conJunto ? undefined : def.props.find((d) => d.mostrar && d.opciones)
    base = lista ? (p.props[lista.id] ?? lista.defecto) : null
  } else base = valorFormateado(p.props[prop.id] ?? prop.defecto, prop.unidad)
  if (!conJunto) return base
  const { ajuste, resistencia } = partesDeAjuste(p, def)
  const partes = [base, ajuste, resistencia].filter((x): x is string => x !== null && x !== '')
  return partes.length ? partes.join(SEPARADOR_AJUSTE) : null
}

/** Valores ya leídos y formateados, por unidad y texto guardado: leer y formatear cuesta cerca de medio microsegundo por
 * pieza y la escena lo pide siempre, aunque miles repitan pocos valores. Función pura, así que guardarla no cambia nada;
 * cada tabla se vacía al llegar a `MAX_VALORES`. */
const valoresFormateados = new Map<string | undefined, Map<string, string>>()
const MAX_VALORES = 4096

function valorFormateado(texto: string, unidad: string | undefined): string {
  let porTexto = valoresFormateados.get(unidad)
  if (!porTexto) valoresFormateados.set(unidad, (porTexto = new Map()))
  let f = porTexto.get(texto)
  if (f === undefined) {
    const v = leerValor(texto)
    f = v ? formatearValor(v.valor, unidad ?? v.unidad) : texto
    if (porTexto.size >= MAX_VALORES) porTexto.clear()
    porTexto.set(texto, f)
  }
  return f
}

/** Punto local de un texto de pieza. Con `renglon` va en el renglón de un rótulo (el voltaje tras el nombre): sus lugares
 * alternativos solo se corren a lo largo del renglón, hacia donde crece el texto (+1 derecha, −1 izquierda), sin pasar
 * antes del rótulo. */
export interface PuntoLocal {
  x: number
  y: number
  renglon?: 1 | -1
}

/** Un texto de pieza (su referencia o su valor) con su punto de la definición. */
export interface TextoDePieza {
  cual: CualTexto
  texto: string
  local: PuntoLocal
  color: Token
}

/** Textos de la pieza con su punto en coordenadas del símbolo (antes de girar), en el orden en que se dibujan. */
export function textosLocales(p: Pieza, def: PiezaDef, doc: ConRieles = SIN_RIELES): TextoDePieza[] {
  const out: TextoDePieza[] = []
  // La tierra y el terminal de alimentación no rotulan su referencia (el terminal rotula su nombre).
  if (def.modelo?.tipo !== 'tierra' && def.modelo?.tipo !== 'alimentacion' && p.ref !== '') out.push({ cual: 'ref', texto: p.ref, local: def.etiquetas.ref, color: 'pieza' })
  const valor = textoDeValor(p, def, doc)
  if (valor !== null && valor !== '') out.push({ cual: 'valor', texto: valor, local: puntoDelValor(p, def), color: 'valor' })
  return out
}

/** Hueco entre un rótulo y el valor que va tras él (`etiquetas.valor.trasRotulo`), en unidades: poco más de un espacio. */
export const HUECO_TRAS_ROTULO = 1

/** Por definición, el punto local del valor que sigue a un rótulo, por orientación y ancho del rótulo (el mismo objeto cada vez). */
const puntosTrasRotulo = new WeakMap<PiezaDef, Map<string, PuntoLocal>>()

/** Punto local del valor. Con `trasRotulo`, girado con la pieza, cae en el renglón del rótulo (que se queda derecho) justo
 * después de él, del lado en que crece. Se comparte entre piezas con la misma orientación y ancho de rótulo para calcular
 * una vez los lugares de `etiquetasSinChoques`. */
function puntoDelValor(p: Pieza, def: PiezaDef): PuntoLocal {
  const i = def.etiquetas.valor.trasRotulo
  if (i === undefined || !def.rotulos?.[i]) return def.etiquetas.valor
  const r = rotuloDePieza(p, def, def.rotulos[i])
  const w = r.ancho ?? 0
  const rx = r.x - p.x, ry = r.y - p.y
  const wx = r.alinear === 'der' ? rx - w - HUECO_TRAS_ROTULO : r.alinear === 'izq' ? rx + w + HUECO_TRAS_ROTULO : rx + w / 2 + HUECO_TRAS_ROTULO
  const renglon: 1 | -1 = r.alinear === 'der' ? -1 : 1
  const clave = `${p.rot} ${p.espejo ? 1 : 0} ${wx} ${ry} ${renglon}`
  let tabla = puntosTrasRotulo.get(def)
  if (!tabla) puntosTrasRotulo.set(def, (tabla = new Map()))
  let punto = tabla.get(clave)
  if (!punto) {
    const [x, y] = destransformar(wx, ry, p.rot, p.espejo)
    punto = { x, y, renglon }
    if (tabla.size > 512) tabla.clear()
    tabla.set(clave, punto)
  }
  return punto
}

/** Texto de la pieza anclado en el punto local (lx, ly): se gira con ella y se queda derecho. */
export function textoEnPieza(p: Pieza, texto: string, lx: number, ly: number, color: Token, corrido = 0): Texto {
  const [tx, y] = transformar(lx, ly, p.rot, p.espejo)
  // `corrido`: unidades del mundo en x (a lo largo del renglón de un rótulo), después de girar.
  const x = tx + corrido
  return { texto, x: p.x + x, y: p.y + y, alinear: alineacionPorX(x), tamaño: TAM_ETIQUETA, color, fuente: 'cifras' }
}

export function etiquetasDePieza(p: Pieza, def: PiezaDef, doc: ConRieles = SIN_RIELES): Texto[] {
  return textosLocales(p, def, doc).map((t) => textoEnPieza(p, t.texto, t.local.x, t.local.y, t.color))
}

/** Rótulos del símbolo ya en el mundo. El ancla gira y se refleja con la pieza pero el texto se queda horizontal y
 * legible. La dirección de crecimiento (izq → +x, der → −x, arriba → −y, abajo → +y) gira con la pieza: horizontal crece
 * hacia ese lado (espejo y 180° la invierten), vertical se centra. */
const DIRECCION: Record<'izq' | 'der' | 'arriba' | 'abajo', [number, number]> = { izq: [1, 0], der: [-1, 0], arriba: [0, -1], abajo: [0, 1] }

/** Texto de un rótulo ligado a una propiedad `texto`: el de la pieza, recortado a su largo máximo, o el de omisión si falta. */
function textoDePropiedad(p: Pieza, r: Rotulo): string {
  const guardado = p.props[r.prop!]
  const valor = typeof guardado === 'string' && guardado.trim() !== '' ? guardado : r.texto
  // Con `valores` (la letra del modo del multímetro), el texto de la opción; una opción que no está ahí, la de omisión.
  const t = r.valores ? (Object.hasOwn(r.valores, valor) ? r.valores[valor] : (r.valores[r.texto] ?? valor)) : valor
  return t.length > MAX_TEXTO_PROP ? t.slice(0, MAX_TEXTO_PROP) : t
}

/** Rótulos del símbolo en mundo. `reemplazos` (por texto fijo) cambia texto y color de alguno: la entrada del osciloscopio
 * con sonda dice de dónde mide («A ← R1:2»). */
export function rotulosDePieza(p: Pieza, def: PiezaDef, reemplazos?: ReadonlyMap<string, { texto: string; color: Token }>): Texto[] {
  if (!def.rotulos) return []
  return def.rotulos.map((r) => {
    const c = reemplazos?.get(r.texto)
    return c && r.prop === undefined ? { ...rotuloDePieza(p, def, { ...r, texto: c.texto }), color: c.color } : rotuloDePieza(p, def, r)
  })
}

/** Un rótulo que no está en la definición, puesto como los suyos (gira y se refleja con la pieza, y se lee derecho). */
export function rotuloDePieza(p: Pieza, def: PiezaDef, r: Rotulo): Texto {
  const [x, y] = transformar(r.x, r.y, p.rot, p.espejo)
  let alinear: Alineacion = 'centro'
  if (r.alinear !== 'centro') {
    const [dx, dy] = transformar(...DIRECCION[r.alinear], p.rot, p.espejo)
    alinear = Math.abs(dy) > Math.abs(dx) ? 'centro' : dx > 0 ? 'izq' : 'der'
  }
  const tamaño = emDeTam(r.tam)
  const texto = r.prop === undefined ? r.texto : textoDePropiedad(p, r)
  const ancho = anchoEnEm(texto, { fuente: r.fuente, negrita: false, cursiva: false }) * tamaño
  return { texto, x: p.x + x, y: p.y + y, alinear, tamaño, color: r.tinta, fuente: r.fuente === 'sans' ? 'interfaz' : 'cifras', ancho }
}

import { strFromU8, strToU8, zipSync } from 'fflate'
import { descomprimirLimitado } from './zipLimitado'
import { ALTO_NOTA_MAX, ANCHO_NOTA_MIN, leerFormato } from '../doc/formato'
import { leerFigura, MAX_FIGURAS } from '../doc/figuras'
import { esDeInstrumento, haySondas, leerSonda, MAX_SONDAS, nombreDeSonda } from '../doc/sondas'
import { coordenadaValida, LIMITE_COORDENADA } from '../doc/limites'
import { limpiarTexto } from '../doc/limpiar'
import { documentoVacio, type Documento, type Pieza } from '../doc/tipos'
import { leerSpice } from '../doc/spice'
import { invarianteDePaquete, PROPS_DE_DOCUMENTO } from '../doc/paquetes'
import { hayAnalisis, leerAnalisis, MAX_ANALISIS } from '../doc/analisis'
import { leerTextos } from '../doc/textos'
import { claveDeNombre, voltajeDeNombre, voltajeDeOmision } from '../netlist/alimentaciones'
import { formatoDe } from './formatos'
import { requisitosDe, requisitosLeidos } from './requisitos'
import { formatearValor, leerValor } from '../valores/valores'

/** Formatos: 2 alimentaciones, 3 textos de pieza, 4 figuras, 5 sondas, 6 `spice` propio, 7 análisis, 8 medidores rápidos.
 * Solo un circuito que use la novedad sube de formato (así una versión anterior lo abre en solo lectura); sin ella los
 * bytes no cambian. */
export const FORMATO_ACTUAL = 8
/** Tamaño máximo descomprimido de cada entrada que se lee. */
export const LIMITE_BYTES = 64 * 2 ** 20
/** Conversor de un formato al siguiente; los avisos de lo que cambió se agregan a `avisos`. */
export type Migracion = (datos: unknown, avisos: string[]) => unknown
/** Conversores: MIGRACIONES[n] lleva datos del formato n al n + 1. */
const MIGRACIONES: Record<number, Migracion> = { 1: voltajesATabla, 2: (datos) => datos, 3: (datos) => datos, 4: (datos) => datos, 5: (datos) => datos, 6: (datos) => datos, 7: (datos) => datos }
export const FECHA_FIJA = new Date(2026, 0, 1)

export type Lectura = { ok: true; doc: Documento; soloLectura: boolean; avisos: string[]; requiere: string[] } | { ok: false; error: string }

/** Mensajes de lectura: oraciones completas con punto, con la referencia o el nombre como sujeto y sin nombres internos
 * del archivo. */
export const ERRORES_KIR = {
  noZip: 'El archivo no es un circuito de Kirchi: no se pudo descomprimir.',
  grande: 'El archivo es demasiado grande para ser un circuito.',
  incompleto: 'El archivo no es un circuito de Kirchi completo: le faltan partes.',
  version: 'El archivo está dañado: no se pudo leer su versión.',
  ajeno: 'El archivo no es un circuito de Kirchi: es de otro programa.',
  circuito: 'El archivo está dañado: no se pudo leer el circuito.',
  danado: 'El archivo está dañado.'
} as const

/** Mensaje de una migración que falló, con el mismo estilo que `ERRORES_KIR`. */
export const errorDeConversion = (formato: number): string => `No se pudo convertir el archivo del formato ${formato}.`

function ordenar(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(ordenar)
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {}
    for (const k of Object.keys(v).sort()) if (k !== '__proto__') o[k] = ordenar((v as Record<string, unknown>)[k])
    return o
  }
  return v
}

/** Rieles de la tabla que usa algún terminal (sin nombre es VCC). Un riel sin terminales no se escribe, pero sigue en la
 * sesión para que deshacer lo recupere. */
function rielesQueSeEscriben(doc: Documento): Documento['alimentaciones'] {
  const t = doc.alimentaciones
  if (!t || Object.keys(t).length === 0) return undefined
  const usados = new Set<string>()
  for (const id in doc.piezas) {
    const p = doc.piezas[id]
    if (p.tipo === 'alimentacion') usados.add(claveDeNombre((typeof p.props.nombre === 'string' ? p.props.nombre.trim() : '') || 'VCC'))
  }
  const out: NonNullable<Documento['alimentaciones']> = {}
  for (const [id, a] of Object.entries(t)) if (usados.has(claveDeNombre(a.nombre))) out[id] = a
  return Object.keys(out).length > 0 ? out : undefined
}

/** Las piezas con un `textos` o un `spice` vacío lo pierden: todo automático no deja rastro en el archivo (mismos bytes que antes). */
function sinTextosVacios(doc: Documento): Documento {
  let piezas: Documento['piezas'] | null = null
  for (const id in doc.piezas) {
    let p = doc.piezas[id]
    if (p.textos && Object.keys(p.textos).length === 0) {
      const { textos: _vacio, ...resto } = p
      p = resto
      piezas ??= { ...doc.piezas }
      piezas[id] = p
    }
    if (p.spice && Object.keys(p.spice).length === 0) {
      const { spice: _vacio, ...resto } = p
      piezas ??= { ...doc.piezas }
      piezas[id] = resto
    }
  }
  return piezas ? { ...doc, piezas } : doc
}

/** JSON con llaves ordenadas y sangría de 2: comparable con Git. Solo se escriben los rieles que usa algún terminal y las figuras y sondas si hay. */
export function serializarDocumento(doc: Documento): string {
  const { alimentaciones: _todas, figuras, sondas, analisis, ...resto } = sinTextosVacios(doc)
  const rieles = rielesQueSeEscriben(doc)
  const conFiguras = figuras && Object.keys(figuras).length > 0 ? { figuras } : {}
  const conSondas = sondas && Object.keys(sondas).length > 0 ? { sondas } : {}
  const conAnalisis = analisis && Object.keys(analisis).length > 0 ? { analisis } : {}
  return JSON.stringify(ordenar({ ...resto, ...conFiguras, ...conSondas, ...conAnalisis, ...(rieles ? { alimentaciones: rieles } : {}) }), null, 2) + '\n'
}

/** El formato que necesita el documento: el máximo de las reglas de `formatos.ts`. */
export { formatoDe }

/** `extras`: entradas del zip además del circuito. El lector solo mira `manifest.json` y `circuito.json`, así que
 * cualquier versión abre un `.kir` con extras. */
export function escribirKir(doc: Documento, version: string, extras: Record<string, Uint8Array> = {}): Uint8Array {
  const requiere = requisitosDe(doc)
  const manifiesto = JSON.stringify({ app: 'kirchi', formato: formatoDe(doc), version, ...(requiere.length > 0 ? { requiere } : {}) }, null, 2) + '\n'
  return zipSync(
    { ...extras, 'manifest.json': strToU8(manifiesto), 'circuito.json': [strToU8(serializarDocumento(doc)), { level: 6 }] },
    { mtime: FECHA_FIJA }
  )
}

export function leerKir(bytes: Uint8Array, limite = LIMITE_BYTES): Lectura {
  return leerKirCon(bytes, MIGRACIONES, FORMATO_ACTUAL, limite)
}

/** Igual que `leerKir` con migraciones, formato actual y límite de tamaño inyectables (para pruebas). */
export function leerKirCon(
  bytes: Uint8Array,
  migraciones: Record<number, Migracion>,
  formatoActual: number,
  limite = LIMITE_BYTES
): Lectura {
  const z = descomprimirLimitado(bytes, (n) => (n === 'manifest.json' || n === 'circuito.json' ? limite : null))
  if (!z.ok) return { ok: false, error: z.motivo === 'grande' ? ERRORES_KIR.grande : ERRORES_KIR.noZip }
  const archivos = z.archivos
  const man = archivos['manifest.json'], cir = archivos['circuito.json']
  if (!man || !cir) return { ok: false, error: ERRORES_KIR.incompleto }
  let m: any
  try {
    m = JSON.parse(strFromU8(man))
  } catch {
    return { ok: false, error: ERRORES_KIR.version }
  }
  if (m?.app !== 'kirchi' || !Number.isInteger(m.formato) || m.formato < 1) return { ok: false, error: ERRORES_KIR.ajeno }
  let datos: any
  try {
    datos = JSON.parse(strFromU8(cir))
  } catch {
    return { ok: false, error: ERRORES_KIR.circuito }
  }
  const avisos: string[] = []
  let soloLectura = false
  if (m.formato > formatoActual) {
    soloLectura = true
    avisos.push(`El archivo es de una versión más nueva de Kirchi (formato ${m.formato}): se abre en solo lectura.`)
  } else {
    try {
      for (let f = m.formato; f < formatoActual; f++) datos = migraciones[f](datos, avisos)
    } catch {
      return { ok: false, error: errorDeConversion(m.formato) }
    }
  }
  try {
    return { ok: true, doc: validarDocumento(datos, avisos), soloLectura, avisos, requiere: requisitosLeidos(m.requiere) }
  } catch {
    return { ok: false, error: ERRORES_KIR.danado }
  }
}

/** Documento armado con `datos` (JSON ya en el formato actual) con las mismas reglas que al abrir un `.kir`. null si no es
 * un objeto. */
export function documentoDeDatos(datos: unknown): { doc: Documento; avisos: string[] } | null {
  if (!datos || typeof datos !== 'object' || Array.isArray(datos)) return null
  const avisos: string[] = []
  try {
    return { doc: validarDocumento(datos, avisos), avisos }
  } catch {
    return null
  }
}

const ROT = new Set([0, 90, 180, 270])
const ent = Number.isInteger
const MAX = LIMITE_COORDENADA
const ID = /^[A-Za-z0-9_-]{1,64}$/
/** Llaves que, usadas como id de un objeto común, tocan su prototipo o se confunden con sus métodos. */
const ID_RESERVADO = new Set(['__proto__', 'constructor', 'prototype'])
const enRango = coordenadaValida

type Resultado = { valor: any } | { error: string }
type Constructor = (x: any, avisos: string[]) => Resultado

/** Nombre de la colección en plural, para «Se descartaron las piezas: …». */
const PLURAL: Record<keyof Documento, string> = {
  piezas: 'las piezas', cables: 'los cables', etiquetas: 'las etiquetas de red', notas: 'las notas', alimentaciones: 'los rieles de alimentación', figuras: 'las figuras', sondas: 'las sondas', analisis: 'los análisis'
}
const textoDe = (v: unknown): string | null => (typeof v === 'string' && limpiarTexto(v).trim() ? limpiarTexto(v).trim() : null)
/** Sujeto del aviso de un elemento descartado: su referencia o su nombre si los trae; si no, «una pieza». */
function sujeto(col: keyof Documento, item: any): string {
  if (col === 'piezas') return textoDe(item?.ref) ? `la pieza ${textoDe(item.ref)}` : 'una pieza'
  if (col === 'etiquetas') return textoDe(item?.nombre) ? `la etiqueta de red ${textoDe(item.nombre)}` : 'una etiqueta de red'
  if (col === 'alimentaciones') return textoDe(item?.nombre) ? `el riel ${textoDe(item.nombre)}` : 'un riel'
  if (col === 'figuras') return 'una figura'
  if (col === 'analisis') return typeof item?.nombre === 'string' && textoDe(item.nombre) ? `el análisis ${textoDe(item.nombre)}` : 'un análisis'
  if (col === 'sondas') return nombreDeSonda(item ?? {})
  return col === 'cables' ? 'un cable' : 'una nota'
}

function coleccion(datos: any, nombre: keyof Documento, construir: Constructor, avisos: string[]): Record<string, any> {
  const fuente = datos?.[nombre]
  const out: Record<string, any> = {}
  if (fuente === undefined) return out
  if (typeof fuente !== 'object' || fuente === null || Array.isArray(fuente)) {
    avisos.push(`Se descartaron ${PLURAL[nombre]}: la lista está dañada.`)
    return out
  }
  for (const [id, item] of Object.entries(fuente)) {
    const r: Resultado = !ID.test(id) || ID_RESERVADO.has(id)
      ? { error: 'identificador inválido' }
      : !item || typeof item !== 'object' || (item as any).id !== id
        ? { error: 'su id no coincide con la llave' }
        : construir(item, avisos)
    if ('error' in r) avisos.push(`Se descartó ${sujeto(nombre, item)}: ${r.error}.`)
    else out[id] = r.valor
  }
  return out
}

const pieza: Constructor = (p, avisos) => {
  if (typeof p.tipo !== 'string') return { error: 'sin tipo' }
  if (typeof p.ref !== 'string') return { error: 'sin referencia' }
  if (!ent(p.x) || !ent(p.y)) return { error: 'posición no entera' }
  if (!enRango(p.x, p.y)) return { error: 'posición fuera de rango' }
  if (!ROT.has(p.rot)) return { error: 'rotación inválida' }
  if (typeof p.espejo !== 'boolean') return { error: 'espejo inválido' }
  if (typeof p.props !== 'object' || p.props === null || Array.isArray(p.props) || Object.values(p.props).some((v) => typeof v !== 'string'))
    return { error: 'propiedades inválidas' }
  const props: Record<string, string> = {}
  for (const [k, v] of Object.entries(p.props as Record<string, string>)) {
    if (k === '__proto__') avisos.push(`Se descartó la propiedad «__proto__» de ${sujeto('piezas', p)}.`)
    else props[limpiarTexto(k)] = limpiarTexto(v)
  }
  // Paquete y unidad solo valen si la referencia es su suma: si no, la pieza queda como encapsulado propio.
  if (!invarianteDePaquete(limpiarTexto(p.ref), props)) {
    for (const k of PROPS_DE_DOCUMENTO) delete props[k]
    avisos.push(`Se quitaron el paquete y la unidad de ${textoDe(p.ref) ?? p.id}: no coinciden con su referencia.`)
  }
  // El nombre de un terminal es su red: se recorta al largo de una propiedad de texto, como lo dibuja el rótulo.
  if (p.tipo === 'alimentacion' && typeof props.nombre === 'string' && props.nombre.length > MAX_NOMBRE_RIEL) {
    props.nombre = props.nombre.slice(0, MAX_NOMBRE_RIEL)
    avisos.push(`Se recortó el nombre de ${textoDe(p.ref) ?? p.id} a ${MAX_NOMBRE_RIEL} caracteres.`)
  }
  // Textos movidos a mano: lo que no vale se descarta con un aviso y la pieza se queda.
  let textos: Pieza['textos'] | null = null
  if (Object.hasOwn(p, 'textos')) {
    const t = leerTextos(p.textos)
    textos = t.textos
    if (t.descartados !== 0) {
      const cuantos = t.descartados < 0 ? 'los textos' : t.descartados === 1 ? 'un texto' : `${t.descartados} textos`
      avisos.push(`Se descartó la posición a mano de ${cuantos} de ${textoDe(p.ref) ?? p.id}: no es válida.`)
    }
  }
  // Modelo propio de SPICE: lo que no vale se descarta con un aviso y la pieza se queda con lo demás.
  let spice: Pieza['spice'] | null = null
  if (Object.hasOwn(p, 'spice')) {
    const s = leerSpice(p.spice, null)
    spice = s.spice
    if (s.descartados !== 0) {
      const cuantos = s.descartados < 0 ? 'el modelo propio' : s.descartados === 1 ? 'un parámetro del modelo propio' : `${s.descartados} parámetros del modelo propio`
      avisos.push(`Se descartó ${cuantos} de ${textoDe(p.ref) ?? p.id}: no es válido.`)
    }
  }
  return { valor: { id: p.id, tipo: p.tipo, ref: limpiarTexto(p.ref), x: p.x, y: p.y, rot: p.rot, espejo: p.espejo, props, ...(textos ? { textos } : {}), ...(spice ? { spice } : {}) } }
}

const cable: Constructor = (c) => {
  if (!Array.isArray(c.puntos)) return { error: 'menos de dos puntos' }
  const puntos: { x: number; y: number }[] = []
  for (const q of c.puntos) {
    if (!ent(q?.x) || !ent(q?.y)) return { error: 'punto no entero' }
    if (!enRango(q.x, q.y)) return { error: 'posición fuera de rango' }
    const u = puntos[puntos.length - 1]
    if (!u || u.x !== q.x || u.y !== q.y) puntos.push({ x: q.x, y: q.y })
  }
  if (puntos.length < 2) return { error: 'menos de dos puntos' }
  for (let i = 1; i < puntos.length; i++) {
    if (puntos[i - 1].x !== puntos[i].x && puntos[i - 1].y !== puntos[i].y) return { error: 'tramo no ortogonal' }
  }
  return { valor: { id: c.id, puntos } }
}

const etiqueta: Constructor = (e, avisos) => {
  if (typeof e.nombre !== 'string' || !e.nombre.trim()) return { error: 'sin nombre' }
  if (!ent(e.x) || !ent(e.y)) return { error: 'posición no entera' }
  if (!enRango(e.x, e.y)) return { error: 'posición fuera de rango' }
  if (!ROT.has(e.rot)) return { error: 'rotación inválida' }
  // El formato malo no tira la etiqueta: se descarta lo que no vale y se avisa.
  const f = leerFormato(e.formato, 'etiqueta', `de la etiqueta ${e.nombre.trim()}`)
  avisos.push(...f.avisos)
  return { valor: { id: e.id, nombre: limpiarTexto(e.nombre), x: e.x, y: e.y, rot: e.rot, ...(f.formato ? { formato: f.formato } : {}) } }
}

const nota: Constructor = (n, avisos) => {
  if (typeof n.texto !== 'string') return { error: 'sin texto' }
  // La posición puede estar fuera de la rejilla (Alt): finita y a centésimas de unidad. El ancho sigue entero.
  if (!Number.isFinite(n.x) || !Number.isFinite(n.y) || !ent(n.ancho)) return { error: 'posición no válida' }
  n = { ...n, x: Math.round(n.x * 100) / 100 + 0, y: Math.round(n.y * 100) / 100 + 0 }
  if (!enRango(n.x, n.y) || n.ancho <= 0 || n.ancho > MAX) return { error: 'posición fuera de rango' }
  const f = leerFormato(n.formato, 'nota', 'de la nota')
  avisos.push(...f.avisos)
  const ancho = Math.max(n.ancho, ANCHO_NOTA_MIN)
  if (ancho !== n.ancho) avisos.push(`Se ajustó el ancho de la nota a ${ANCHO_NOTA_MIN * 1.25} mm.`)
  if (n.anchoFijo !== undefined && n.anchoFijo !== true) avisos.push('Se descartó «anchoFijo» de la nota: solo admite true.')
  // El alto fijado es un entero de 1 a 400 mm; cualquier otro valor se descarta y la caja mide lo que su texto.
  const altoValido = n.alto === undefined ? undefined : ent(n.alto) && n.alto >= 1 && n.alto <= ALTO_NOTA_MAX ? (n.alto as number) : null
  if (altoValido === null) avisos.push(`Se descartó «alto» de la nota: debe ser un entero de 1 a ${ALTO_NOTA_MAX}.`)
  return {
    valor: {
      id: n.id, x: n.x, y: n.y, ancho, texto: limpiarTexto(n.texto), ...(f.formato ? { formato: f.formato } : {}),
      ...(n.anchoFijo === true ? { anchoFijo: true } : {}), ...(altoValido ? { alto: altoValido } : {})
    }
  }
}

const figura: Constructor = (f, avisos) => {
  const r = leerFigura(f)
  if ('error' in r) return r
  avisos.push(...r.avisos)
  return { valor: r.figura }
}

/** Un riel: nombre (que no sea ya un voltaje, sin repetir) y voltaje en V. `vistos` lleva los nombres ya leídos. */
const riel = (vistos: Set<string>): Constructor => (a) => {
  const nombre = typeof a.nombre === 'string' ? limpiarTexto(a.nombre).trim() : ''
  if (!nombre) return { error: 'sin nombre' }
  if (nombre.length > MAX_NOMBRE_RIEL) return { error: 'nombre demasiado largo' }
  if (voltajeDeNombre(nombre) !== null) return { error: 'su nombre ya es un voltaje' }
  const voltaje = typeof a.voltaje === 'string' ? limpiarTexto(a.voltaje).trim() : ''
  if (voltios(voltaje) === null) return { error: 'voltaje no válido' }
  // «V-» y «V−» son el mismo riel (`claveDeNombre`).
  const clave = claveDeNombre(nombre)
  if (vistos.has(clave)) return { error: 'está repetido' }
  vistos.add(clave)
  return { valor: { id: a.id, nombre, voltaje } }
}

/** Largo máximo de un nombre de terminal (el de las propiedades de texto). */
const MAX_NOMBRE_RIEL = 24
/** Un voltaje en V (sin unidad o con «V»), con el menos tipográfico y la raya corta como guion; null si no se lee. */
function voltios(texto: string): number | null {
  const v = leerValor(texto.replace(/[\u2212\u2013]/g, '-'))
  return v && Number.isFinite(v.valor) && (v.unidad === '' || v.unidad === 'V') ? v.valor : null
}

const enLista = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`)
const nombreDe = (v: number) => `${v < 0 ? '-' : '+'}${Math.abs(v)}V`

/** Formato 1 a 2: el voltaje de cada terminal pasa a su riel (manda el nombre si ya es un voltaje, si no el primer
 * terminal).
 * Los discrepantes se avisan una vez por riel y un riel con voltaje de omisión no se guarda. El archivo nunca se rechaza. */
function voltajesATabla(datos: unknown, avisos: string[]): unknown {
  const d = datos as any
  const piezas = d?.piezas
  if (!piezas || typeof piezas !== 'object' || Array.isArray(piezas)) return datos
  const rieles = new Map<string, { nombre: string; texto: string; valor: number; refs: string[]; otros: number[] }>()
  // Sin prototipo: un id «__proto__» queda como llave propia y la validación lo descarta como identificador inválido.
  const nuevas: Record<string, unknown> = Object.create(null)
  for (const [id, p] of Object.entries(piezas as Record<string, any>)) {
    const props = p?.props
    const idMalo = !ID.test(id) || ID_RESERVADO.has(id)
    if (idMalo || p?.tipo !== 'alimentacion' || !props || typeof props !== 'object' || Array.isArray(props) || !Object.hasOwn(props, 'voltaje')) {
      nuevas[id] = p
      continue
    }
    const { voltaje, ...resto } = props
    nuevas[id] = { ...p, props: resto }
    // Limpios como al validar: los avisos no llevan caracteres de control y los nombres se agrupan como quedarán.
    const ref = (typeof p.ref === 'string' ? limpiarTexto(p.ref).trim() : '') || id
    const nombre = (typeof resto.nombre === 'string' ? limpiarTexto(resto.nombre) : '').trim() || 'VCC'
    const texto = typeof voltaje === 'string' ? limpiarTexto(voltaje).trim() : ''
    const valor = voltios(texto)
    if (valor === null) {
      avisos.push(`Se descartó el voltaje «${typeof voltaje === 'string' ? texto : String(voltaje)}» de ${ref}: no es un valor válido.`)
      continue
    }
    const propio = voltajeDeNombre(nombre)
    if (propio !== null) {
      if (propio !== valor) avisos.push(`${nombre} tenía ${formatearValor(valor, 'V')} en ${ref}: ahora el voltaje sale del nombre (${formatearValor(propio, 'V')}).`)
      continue
    }
    const r = rieles.get(claveDeNombre(nombre))
    if (!r) rieles.set(claveDeNombre(nombre), { nombre, texto, valor, refs: [ref], otros: [] })
    else if (valor !== r.valor && !r.otros.includes(valor)) {
      r.otros.push(valor)
      r.refs.push(ref)
    }
  }
  const tabla: Record<string, unknown> = {}
  let n = 0
  for (const r of rieles.values()) {
    const nombre = r.nombre
    if (r.otros.length > 0) {
      const voltajes = [r.valor, ...r.otros].map((v) => formatearValor(v, 'V'))
      const sugerencia = r.otros.length === 1 ? `Renombra uno como «${nombreDe(r.otros[0])}».` : `Renombra los demás con su voltaje, como ${enLista(r.otros.map((v) => `«${nombreDe(v)}»`))}.`
      avisos.push(`${nombre} tenía ${enLista(voltajes)} en ${enLista(r.refs)}: se usó ${voltajes[0]}. ${sugerencia}`)
    }
    if (r.valor === voltios(voltajeDeOmision(nombre))) continue
    const id = `a_${++n}`
    tabla[id] = { id, nombre, voltaje: r.texto }
  }
  return { ...d, piezas: nuevas, ...(n > 0 ? { alimentaciones: tabla } : {}) }
}

/** Con más figuras que `MAX_FIGURAS` se quedan las primeras (en el orden del archivo) y se dice cuántas se descartan. */
function conTopeDeFiguras(datos: any, avisos: string[]): any {
  const f = datos?.figuras
  if (!f || typeof f !== 'object' || Array.isArray(f)) return datos
  const ids = Object.keys(f)
  if (ids.length <= MAX_FIGURAS) return datos
  const n = ids.length - MAX_FIGURAS
  const tope = MAX_FIGURAS.toLocaleString('es-MX')
  avisos.push(n === 1 ? `Se descartó 1 figura: un circuito admite hasta ${tope}.` : `Se descartaron ${n.toLocaleString('es-MX')} figuras: un circuito admite hasta ${tope}.`)
  return { ...datos, figuras: Object.fromEntries(ids.slice(0, MAX_FIGURAS).map((id) => [id, f[id]])) }
}

/** Con más de `MAX_SONDAS` sondas válidas se quedan las primeras y se avisa cuántas se descartan. */
// Un `.kir` alterado puede traer miles de análisis: se leen los primeros MAX_ANALISIS y se avisa de los demás.
function conTopeDeAnalisis(datos: any, avisos: string[]): any {
  const fuente = datos?.analisis
  if (typeof fuente !== 'object' || fuente === null || Array.isArray(fuente)) return datos
  const ids = Object.keys(fuente)
  if (ids.length <= MAX_ANALISIS) return datos
  avisos.push(`Se descartaron ${(ids.length - MAX_ANALISIS).toLocaleString('es-MX')} análisis: un circuito admite hasta ${MAX_ANALISIS}.`)
  return { ...datos, analisis: Object.fromEntries(ids.slice(0, MAX_ANALISIS).map((id) => [id, fuente[id]])) }
}

function conTopeDeSondas(sondas: Record<string, any>, avisos: string[]): Record<string, any> {
  const ids = Object.keys(sondas)
  if (ids.length <= MAX_SONDAS) return sondas
  const n = ids.length - MAX_SONDAS
  avisos.push(n === 1 ? `Se descartó 1 sonda: un circuito admite hasta ${MAX_SONDAS}.` : `Se descartaron ${n.toLocaleString('es-MX')} sondas: un circuito admite hasta ${MAX_SONDAS}.`)
  return Object.fromEntries(ids.slice(0, MAX_SONDAS).map((id) => [id, sondas[id]]))
}

/** Se descartan las sondas de un instrumento que no está en el circuito y, de dos en la misma entrada, queda la de menor
 * id (una entrada mide una red).
 * El tipo de la pieza no se revisa aquí (no hay librería). */
function depurarSondas(d: Documento, sondas: Record<string, any>, avisos: string[]): void {
  const vistas = new Set<string>()
  for (const id of Object.keys(sondas).sort()) {
    const s = sondas[id]
    if (!esDeInstrumento(s)) continue
    const p = Object.hasOwn(d.piezas, s.instrumento) ? d.piezas[s.instrumento] : undefined
    if (!p) {
      avisos.push(`Se descartó la sonda ${s.entrada} de un instrumento que no está en el circuito.`)
      delete sondas[id]
      continue
    }
    const k = `${s.instrumento}\0${s.entrada}`
    if (vistas.has(k)) {
      avisos.push(`Se descartó una sonda repetida de la entrada ${s.entrada} de ${p.ref}.`)
      delete sondas[id]
    } else vistas.add(k)
  }
}

function validarDocumento(datos: any, avisos: string[]): Documento {
  const d = documentoVacio()
  d.piezas = coleccion(datos, 'piezas', pieza, avisos)
  d.cables = coleccion(datos, 'cables', cable, avisos)
  d.etiquetas = coleccion(datos, 'etiquetas', etiqueta, avisos)
  d.notas = coleccion(datos, 'notas', nota, avisos)
  const rieles = coleccion(datos, 'alimentaciones', riel(new Set()), avisos)
  if (Object.keys(rieles).length > 0) d.alimentaciones = rieles
  const figuras = coleccion(conTopeDeFiguras(datos, avisos), 'figuras', figura, avisos)
  if (Object.keys(figuras).length > 0) d.figuras = figuras
  const sondas = conTopeDeSondas(coleccion(datos, 'sondas', (x, av) => leerSonda(x, av), avisos), avisos)
  depurarSondas(d, sondas, avisos)
  if (Object.keys(sondas).length > 0) d.sondas = sondas
  const analisis = coleccion(conTopeDeAnalisis(datos, avisos), 'analisis', (x) => leerAnalisis(x), avisos)
  if (Object.keys(analisis).length > 0) d.analisis = analisis
  return d
}

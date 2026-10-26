/**
 * Cabecera de las grabaciones WebM: `MediaRecorder` escribe el segmento sin `Duration`, así que no se puede adelantar el video. Solo se toca `Info`; un `SeekHead` pasa a `Void` porque sus posiciones se mueven.
 * Sin dependencias: unos cientos de bytes de EBML no justifican una librería.
 */

const ID_EBML = 0x1a45dfa3
const ID_SEGMENTO = 0x18538067
const ID_INFO = 0x1549a966
const ID_SEEKHEAD = 0x114d9b74
const ID_CLUSTER = 0x1f43b675
const ID_ESCALA = 0x2ad7b1
const ID_DURACION = 0x4489
const ID_VOID = 0xec
/** Nanosegundos por tick cuando `Info` no declara `TimecodeScale`. */
const ESCALA_POR_OMISION = 1_000_000

/** Tamaño desconocido: todos los bits de valor en 1. */
const DESCONOCIDO = -1

function ancho(primero: number): number {
  if (primero === 0) throw new Error('WebM inválido: vint con ancho mayor que 8')
  return Math.clz32(primero) - 23
}

/** El ID conserva sus bits de marca, como se escribe en el archivo. */
function leerId(b: Uint8Array, pos: number): { id: number; largo: number } {
  if (pos >= b.length) throw new Error('WebM truncado')
  const largo = ancho(b[pos])
  if (largo > 4 || pos + largo > b.length) throw new Error('WebM inválido: ID de elemento')
  let id = 0
  for (let i = 0; i < largo; i++) id = id * 256 + b[pos + i]
  return { id, largo }
}

function leerTamaño(b: Uint8Array, pos: number): { valor: number; largo: number } {
  if (pos >= b.length) throw new Error('WebM truncado')
  const largo = ancho(b[pos])
  if (pos + largo > b.length) throw new Error('WebM truncado')
  let valor = b[pos] & (0xff >> largo)
  let todosUnos = valor === 0xff >> largo
  for (let i = 1; i < largo; i++) {
    valor = valor * 256 + b[pos + i]
    if (b[pos + i] !== 0xff) todosUnos = false
  }
  return { valor: todosUnos ? DESCONOCIDO : valor, largo }
}

function anchoMinimo(valor: number): number {
  let n = 1
  while (n < 8 && valor >= 2 ** (7 * n) - 1) n++
  return n
}

function escribirTamaño(valor: number, largo: number): Uint8Array {
  const out = new Uint8Array(largo)
  let v = valor
  for (let i = largo - 1; i >= 0; i--) {
    out[i] = v % 256
    v = Math.floor(v / 256)
  }
  out[0] |= 1 << (8 - largo)
  return out
}

function idABytes(id: number): Uint8Array {
  const out: number[] = []
  for (let v = id; v > 0; v = Math.floor(v / 256)) out.unshift(v % 256)
  return new Uint8Array(out)
}

function unir(...partes: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(partes.reduce((s, p) => s + p.length, 0))
  let o = 0
  for (const p of partes) {
    out.set(p, o)
    o += p.length
  }
  return out
}

interface Hijo {
  id: number
  inicio: number
  inicioDatos: number
  fin: number
}

/** Hijos de un elemento maestro con tamaños declarados; se detiene en el primero de tamaño desconocido. */
function hijos(b: Uint8Array, desde: number, hasta: number, alParar?: (id: number) => boolean): Hijo[] {
  const lista: Hijo[] = []
  let pos = desde
  while (pos < hasta) {
    const { id, largo: li } = leerId(b, pos)
    if (alParar?.(id)) break
    const { valor, largo: ls } = leerTamaño(b, pos + li)
    if (valor === DESCONOCIDO) break
    const inicioDatos = pos + li + ls
    const fin = inicioDatos + valor
    if (fin > hasta) throw new Error('WebM truncado')
    lista.push({ id, inicio: pos, inicioDatos, fin })
    pos = fin
  }
  return lista
}

interface Estructura {
  tamañoSegmento: { pos: number; largo: number; valor: number }
  info: Hijo
  hijosSegmento: Hijo[]
}

function analizar(b: Uint8Array): Estructura {
  const [ebml] = hijos(b, 0, b.length, (i) => i === ID_SEGMENTO)
  if (!ebml || ebml.id !== ID_EBML) throw new Error('No es un WebM: falta la cabecera EBML')
  const { id, largo: li } = leerId(b, ebml.fin)
  if (id !== ID_SEGMENTO) throw new Error('WebM inválido: falta el segmento')
  const posTamaño = ebml.fin + li
  const t = leerTamaño(b, posTamaño)
  const inicioSegmento = posTamaño + t.largo
  const finSegmento = t.valor === DESCONOCIDO ? b.length : Math.min(inicioSegmento + t.valor, b.length)
  // Los clusters (de tamaño desconocido en directo) vienen después de Info: no hace falta entrar.
  const hs = hijos(b, inicioSegmento, finSegmento, (i) => i === ID_CLUSTER)
  const info = hs.find((h) => h.id === ID_INFO)
  if (!info) throw new Error('WebM inválido: falta Info')
  return { tamañoSegmento: { pos: posTamaño, largo: t.largo, valor: t.valor }, info, hijosSegmento: hs }
}

function leerFlotante(b: Uint8Array, h: Hijo): number {
  const n = h.fin - h.inicioDatos
  const v = new DataView(b.buffer, b.byteOffset + h.inicioDatos, n)
  if (n === 4) return v.getFloat32(0)
  if (n === 8) return v.getFloat64(0)
  throw new Error('WebM inválido: Duration')
}

function leerEntero(b: Uint8Array, h: Hijo): number {
  let v = 0
  for (let i = h.inicioDatos; i < h.fin; i++) v = v * 256 + b[i]
  return v
}

/** Duración declarada en milisegundos, o `null` si el archivo no la trae. */
export function leerDuracionMs(webm: Uint8Array): number | null {
  const { info } = analizar(webm)
  const hs = hijos(webm, info.inicioDatos, info.fin)
  const dur = hs.find((h) => h.id === ID_DURACION)
  if (!dur) return null
  const esc = hs.find((h) => h.id === ID_ESCALA)
  const escala = esc ? leerEntero(webm, esc) : ESCALA_POR_OMISION
  return (leerFlotante(webm, dur) * escala) / 1e6
}

/** Copia del WebM con `Duration` igual a `duracionMs`, sin modificar la entrada. */
export function escribirDuracion(webm: Uint8Array, duracionMs: number): Uint8Array {
  if (!Number.isFinite(duracionMs) || duracionMs < 0) throw new Error('Duración inválida')
  const copia = webm.slice()
  const est = analizar(copia)
  // Las posiciones del SeekHead dejan de valer al crecer Info: se invalida como relleno.
  for (const h of est.hijosSegmento) {
    if (h.id !== ID_SEEKHEAD) continue
    const total = h.fin - h.inicio
    const lt = leerTamaño(copia, h.inicio + leerId(copia, h.inicio).largo).largo
    const datos = total - 1 - lt
    if (datos < 0) continue
    copia[h.inicio] = ID_VOID
    copia.set(escribirTamaño(datos, lt), h.inicio + 1)
    copia.fill(0, h.inicio + 1 + lt, h.fin)
  }
  const { info } = est
  const hs = hijos(copia, info.inicioDatos, info.fin)
  const esc = hs.find((h) => h.id === ID_ESCALA)
  const escala = esc ? leerEntero(copia, esc) : ESCALA_POR_OMISION
  const valor = new Uint8Array(8)
  new DataView(valor.buffer).setFloat64(0, (duracionMs * 1e6) / escala)
  const elemento = unir(idABytes(ID_DURACION), escribirTamaño(8, 1), valor)
  const conservados = hs.filter((h) => h.id !== ID_DURACION).map((h) => copia.subarray(h.inicio, h.fin))
  const datosInfo = unir(...conservados, elemento)
  const idInfo = idABytes(ID_INFO)
  const lenInfoViejo = leerTamaño(copia, info.inicio + idInfo.length).largo
  const tamInfo = escribirTamaño(datosInfo.length, Math.max(lenInfoViejo, anchoMinimo(datosInfo.length)))
  const infoNueva = unir(idInfo, tamInfo, datosInfo)
  const delta = infoNueva.length - (info.fin - info.inicio)
  const ts = est.tamañoSegmento
  const tamSegmento =
    ts.valor === DESCONOCIDO
      ? copia.subarray(ts.pos, ts.pos + ts.largo)
      : escribirTamaño(ts.valor + delta, Math.max(ts.largo, anchoMinimo(ts.valor + delta)))
  return unir(
    copia.subarray(0, ts.pos),
    tamSegmento,
    copia.subarray(ts.pos + ts.largo, info.inicio),
    infoNueva,
    copia.subarray(info.fin)
  )
}

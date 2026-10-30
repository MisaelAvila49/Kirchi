/** Recorrido secuencial de la lista de objetos de ROOT.DSN: los objetos no llevan longitud, así que se lee en orden. */

export class ErrorFormato extends Error {}

export interface Etiqueta {
  texto: string
  x: number
  y: number
  estilo: string
}

export interface Vertice {
  x: number
  y: number
}

/** Desplazamientos absolutos de cable: 0 es «sin conectar». Giro en décimas de grado, banderas: 1 espejo X, 2 espejo Y. */
export type ObjetoDsn =
  | { tipo: 'componente'; desp: number; ref?: string; valor?: string; dispositivo: string; x: number; y: number; giro: number; banderas: number; id: number; pines: number[]; props: string }
  | { tipo: 'cable'; desp: number; bus: boolean; estilo: string; vertices: Vertice[]; etiquetas: Etiqueta[] }
  | { tipo: 'union'; desp: number; x: number; y: number; cables: number[] }
  | { tipo: 'terminal'; desp: number; x: number; y: number; giro: number; banderas: number; dispositivo: string; nombre: string; cable: number }
  | { tipo: 'generador' | 'sonda'; desp: number; x: number; y: number; giro: number; banderas: number; ident: string; dispositivo: string; nombre: string; props: string; alambres: [number, number] }
  | { tipo: 'grafica'; desp: number; titulo: string; ejeX: string; inicio: number; fin: number; caja: [number, number, number, number]; rangoY?: [number, number]; trazas: { expresion: string; ident: string; nombre: string }[] }
  | { tipo: 'texto'; desp: number; x: number; y: number; texto: string }
  | { tipo: 'subcircuito'; desp: number; nombre: string; hoja: string }
  | { tipo: 'grafico2d'; desp: number }

export interface HojaDsn {
  desp: number
  objetos: ObjetoDsn[]
  error?: string
}

/** El archivo como cadena binaria (un carácter por byte): permite buscar con indexOf y expresiones regulares sin cambiar desplazamientos. */
export function cadenaBinaria(d: Uint8Array): string {
  let s = ''
  for (let i = 0; i < d.length; i += 8192) s += String.fromCharCode(...d.subarray(i, Math.min(i + 8192, d.length)))
  return s
}

export class Lector {
  readonly v: DataView
  constructor(
    readonly d: Uint8Array,
    public o: number
  ) {
    this.v = new DataView(d.buffer, d.byteOffset, d.byteLength)
  }
  u8(): number {
    if (this.o >= this.d.length) throw new ErrorFormato('lectura fuera del archivo')
    return this.d[this.o++]
  }
  i16(): number {
    const x = this.v.getInt16(this.o, true)
    this.o += 2
    return x
  }
  i32(): number {
    const x = this.v.getInt32(this.o, true)
    this.o += 4
    return x
  }
  texto(desde: number, hasta: number): string {
    if (desde < 0 || hasta > this.d.length) throw new ErrorFormato('texto fuera del archivo')
    let s = ''
    for (let i = desde; i < hasta; i++) s += String.fromCharCode(this.d[i])
    return s
  }
  /** Cadena con prefijo de longitud de un byte. */
  ps(): string {
    const n = this.u8()
    const s = this.texto(this.o, this.o + n)
    this.o += n
    return s
  }
  /** Cadena terminada en cero. */
  cs(): string {
    let e = this.o
    while (e < this.d.length && this.d[e] !== 0) e++
    if (e >= this.d.length) throw new ErrorFormato('cadena sin terminar')
    const s = this.texto(this.o, e)
    this.o = e + 1
    return s
  }
  salta(n: number): void {
    if (n < 0 || this.o + n > this.d.length) throw new ErrorFormato('bloque fuera del archivo')
    this.o += n
  }
}

function etiqueta(r: Lector): Etiqueta {
  if (r.u8() !== 0xff) throw new ErrorFormato(`etiqueta sin marca en ${r.o - 1}`)
  const texto = r.ps()
  const x = r.i32()
  const y = r.i32()
  // Seis bytes de control, cuatro enteros (alineación, alto, ancho, cero) y cuatro de banderas.
  r.salta(6 + 16 + 4)
  r.cs()
  const estilo = r.cs()
  r.i32()
  return { texto, x, y, estilo }
}

/** Las etiquetas de un objeto: la de propiedades (o de script) es la última y puede traer su texto aparte. */
function etiquetas(r: Lector, fin: string[] = ['PROPERTIES']): Etiqueta[] {
  const lista: Etiqueta[] = []
  while (r.d[r.o] === 0xff) {
    const e = etiqueta(r)
    lista.push(e)
    if (e.estilo === 'PROPERTIES' || e.estilo === 'SCRIPT') {
      const n = r.i32()
      if (n > 0 && e.texto === '') {
        e.texto = r.texto(r.o, r.o + n)
        r.o += n
      }
      break
    }
    if (fin.includes(e.estilo)) break
  }
  return lista
}

const porEstilo = (l: Etiqueta[], estilo: string): string | undefined => l.find((e) => e.estilo === estilo)?.texto

const TRAZA = /([\x01-\x20])([ -~]{1,32})\x09([A-Z][0-9A-F]{8})([\x00-\x40])/

function grafica(r: Lector, desp: number): ObjetoDsn {
  const titulo = r.ps()
  r.salta(4)
  r.cs()
  const ejeX = r.ps()
  // La caja en el esquema (x1, y1, x2, y2), en las unidades del archivo.
  const caja: [number, number, number, number] = [r.i32(), r.i32(), r.i32(), r.i32()]
  const inicio = r.v.getFloat64(r.o, true)
  const fin = r.v.getFloat64(r.o + 8, true)
  // Los cuatro últimos son los extremos de los ejes; el infinito marca un eje sin datos.
  const ejes = [32, 40, 48, 56].map((k) => r.v.getFloat64(r.o + k, true)).filter(Number.isFinite)
  r.salta(64)
  const trazas: { expresion: string; ident: string; nombre: string }[] = []
  for (;;) {
    const m = TRAZA.exec(r.texto(r.o, Math.min(r.d.length, r.o + 800)))
    if (!m) break
    // Tras la expresión y el identificador (pstr de 9) va el nombre de la sonda.
    let p = r.o + m.index + 1 + m[2].length + 10
    const nombre = r.texto(p + 1, p + 1 + r.d[p])
    p += 1 + r.d[p] + 14
    const muestras = r.v.getUint32(p, true)
    p += 4
    if (p + 16 * muestras > r.d.length) throw new ErrorFormato('traza con más muestras que archivo')
    trazas.push({ expresion: m[2], ident: m[3], nombre })
    r.o = p + 16 * muestras
    // 0x00 seguido de 0xFF anuncia otra traza; si no, termina la gráfica.
    if (!(r.d[r.o] === 0x00 && r.d[r.o + 1] === 0xff)) break
  }
  r.salta(3)
  return { tipo: 'grafica', desp, titulo, ejeX, inicio, fin, caja, ...(ejes.length ? { rangoY: [Math.min(...ejes), Math.max(...ejes)] as [number, number] } : {}), trazas }
}

/** Lista de objetos desde `desde` hasta el byte 0xFF. `filever` ≤ 806 acorta el tramo del componente. */
export function listaObjetos(d: Uint8Array, desde: number, filever: number): ObjetoDsn[] {
  const r = new Lector(d, desde)
  const objetos: ObjetoDsn[] = []
  for (;;) {
    const st = r.o
    if (st >= d.length) throw new ErrorFormato('la lista de objetos no termina')
    let c = d[st]
    // El bit alto sobre un generador no cambia cómo se lee.
    if (c !== 0xff && c & 0x80) c &= 0x7f
    if (c === 0xff) return objetos
    r.u8()
    if ((c & 0xf0) === 0x00 && c !== 0x01 && d[r.o] === 0xff) {
      const l = etiquetas(r)
      const np = r.i16()
      const dispositivo = r.ps()
      const x = r.i32()
      const y = r.i32()
      const giro = r.i16()
      const banderas = r.i16()
      const id = r.i32()
      r.salta(filever <= 806 ? 5 : 9)
      if (np < 0 || np > 5000) throw new ErrorFormato(`componente con ${np} pines en ${st}`)
      const pines: number[] = []
      for (let i = 0; i < np; i++) pines.push(r.i32())
      objetos.push({ tipo: 'componente', desp: st, ref: porEstilo(l, 'COMPONENT ID'), valor: porEstilo(l, 'COMPONENT VALUE'), dispositivo, x, y, giro, banderas, id, pines, props: porEstilo(l, 'PROPERTIES') ?? '' })
    } else if ((c === 0x00 || c === 0x01) && d[st + 23] === 2 && d[st + 24] === 0x7f && d[st + 25] > 32 && d[st + 25] < 127) {
      // Cable (0x00) o bus (0x01): estilo de 24 bytes, nombre del estilo, etiquetas de red y vértices.
      r.salta(24)
      const estilo = r.cs()
      const nEt = r.i16()
      if (nEt < 0 || nEt > 16) throw new ErrorFormato(`cable con ${nEt} etiquetas en ${st}`)
      const ets: Etiqueta[] = []
      for (let i = 0; i < nEt; i++) ets.push(etiqueta(r))
      const n = r.i16()
      if (n < 0 || n > 10000) throw new ErrorFormato(`cable con ${n} vértices en ${st}`)
      const vertices: Vertice[] = []
      for (let i = 0; i < n; i++) vertices.push({ x: r.i32(), y: r.i32() })
      objetos.push({ tipo: 'cable', desp: st, bus: estilo === 'BUS WIRE', estilo, vertices, etiquetas: ets })
    } else if (c === 0x01) {
      const x = r.i32()
      const y = r.i32()
      objetos.push({ tipo: 'union', desp: st, x, y, cables: [r.i32(), r.i32(), r.i32(), r.i32()] })
    } else if ((c & 0xf0) === 0x10) {
      const x = r.i32()
      const y = r.i32()
      const giro = r.i16()
      const banderas = r.i16()
      const dispositivo = r.ps()
      r.salta(6)
      const l = etiquetas(r, ['TERMINAL LABEL', 'PROPERTIES'])
      objetos.push({ tipo: 'terminal', desp: st, x, y, giro, banderas, dispositivo, nombre: l[0]?.texto ?? '', cable: r.i32() })
    } else if ((c & 0x70) === 0x30) {
      const x = r.i32()
      const y = r.i32()
      const giro = r.i16()
      const banderas = r.i16()
      r.i16()
      const ident = r.ps()
      const dispositivo = r.ps()
      const l = etiquetas(r)
      r.i16()
      const alambres: [number, number] = [r.i32(), r.i32()]
      const sonda = dispositivo.includes('PROBE')
      if (!sonda) {
        // Un byte y un bloque con su propia longitud (que se cuenta a sí misma).
        r.u8()
        const largo = r.v.getUint32(r.o, true)
        if (largo < 4 || largo >= 4096) throw new ErrorFormato(`generador con bloque de ${largo} bytes en ${st}`)
        r.salta(largo)
      }
      objetos.push({ tipo: sonda ? 'sonda' : 'generador', desp: st, x, y, giro, banderas, ident, dispositivo, nombre: l[0]?.texto ?? '', props: porEstilo(l, 'PROPERTIES') ?? '', alambres })
    } else if (c === 0x02) {
      const x = r.i32()
      const y = r.i32()
      r.i32()
      objetos.push({ tipo: 'texto', desp: st, x, y, texto: porEstilo(etiquetas(r), 'SCRIPT') ?? '' })
    } else if (c === 0x05) {
      r.salta(16)
      r.i16()
      const l = etiquetas(r)
      objetos.push({ tipo: 'subcircuito', desp: st, nombre: porEstilo(l, 'SUBCKT ID') ?? '', hoja: porEstilo(l, 'SUBCKT NAME') ?? '' })
    } else if (c === 0x20) {
      // Gráfico 2D (líneas, cajas, marco): su primer entero es su longitud total.
      r.salta(12)
      const largo = r.v.getUint32(r.o, true)
      if (largo < 9 || largo >= 1 << 20) throw new ErrorFormato(`gráfico 2D con longitud ${largo} en ${st}`)
      r.salta(largo)
      objetos.push({ tipo: 'grafico2d', desp: st })
    } else if ((c & 0xf8) === 0x28) {
      objetos.push(grafica(r, st))
    } else {
      throw new ErrorFormato(`clase desconocida 0x${c.toString(16)} en ${st}`)
    }
  }
}

/** Tope de hojas por proyecto: un archivo fabricado no puede multiplicar el trabajo con encabezados repetidos. */
const MAX_HOJAS = 64

/** Cada hoja del proyecto (`ISIS CIRCUIT FILE`) con sus objetos; una hoja ilegible lleva su error y no impide leer las demás. */
export function leerHojas(d: Uint8Array, s: string, filever: number): HojaDsn[] {
  const hojas: HojaDsn[] = []
  const re = /ISIS CIRCUIT FILE /g
  for (let m = re.exec(s); m; m = re.exec(s)) {
    if (hojas.length >= MAX_HOJAS) {
      hojas.push({ desp: m.index, objetos: [], error: `el proyecto trae más de ${MAX_HOJAS} hojas y se omitieron las demás` })
      break
    }
    const i = s.indexOf('OBJECT DATA ', m.index)
    if (i < 0) {
      // Ningún encabezado posterior tendrá datos: basta un error.
      hojas.push({ desp: m.index, objetos: [], error: 'sin datos de objetos' })
      break
    }
    // Los encabezados que preceden al mismo bloque no lo repiten.
    re.lastIndex = i + 12
    try {
      hojas.push({ desp: m.index, objetos: listaObjetos(d, i + 12, filever) })
    } catch (e) {
      hojas.push({ desp: m.index, objetos: [], error: e instanceof Error ? e.message : String(e) })
    }
  }
  return hojas
}

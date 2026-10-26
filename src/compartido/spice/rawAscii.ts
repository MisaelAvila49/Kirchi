/** Lector del `raw` ASCII de ngspice, único formato de resultados que se lee. Es un archivo ajeno: tiene topes, no reserva memoria por lo que dice la cabecera y rechaza lo que no tenga la forma exacta. */

export interface TopesRaw {
  /** Caracteres del texto. */
  bytes: number
  /** Gráficos (`Plotname`) en un mismo archivo. */
  graficos: number
  /** Variables de un gráfico. */
  variables: number
  /** Puntos de un gráfico. */
  puntos: number
  /** Valores en total (variables por puntos, de todos los gráficos). */
  valores: number
}

export const TOPES_RAW: TopesRaw = { bytes: 128 * 1024 * 1024, graficos: 256, variables: 4096, puntos: 5_000_000, valores: 20_000_000 }

export interface VariableRaw {
  nombre: string
  /** `voltage`, `current`, `time`, `frequency`... tal como lo escribe ngspice. */
  tipo: string
  re: Float64Array
  /** La parte imaginaria; null en un gráfico real. */
  im: Float64Array | null
}

export interface GraficoRaw {
  /** `Plotname`: «Transient Analysis», «AC Analysis», «Operating Point»... */
  nombre: string
  complejo: boolean
  puntos: number
  variables: VariableRaw[]
}

const error = (texto: string): Error => new Error(`Archivo raw no válido: ${texto}`)

const ENTERO = /^\d+$/
// Un número como lo escribe ngspice (`1.5e-003`, `-1`, `nan`, `inf`); nada de hexadecimales ni de separadores.
const NUMERO = /^[+-]?(?:\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?|nan|inf(?:inity)?)$/i

function numero(t: string): number {
  if (!NUMERO.test(t)) throw error(`el valor «${t.slice(0, 24)}» no es un número`)
  return Number(t.toLowerCase().replace(/^([+-]?)inf(?:inity)?$/, '$1Infinity'))
}

/** Un cursor sobre los renglones: el archivo se lee de a pedazos y nunca se parte entero en memoria. */
class Cursor {
  private mirado: string | undefined
  private hay = false
  /** Caracteres leídos hasta ahora (con su salto de renglón). */
  consumidos = 0
  constructor(
    private readonly it: Iterator<string>,
    private readonly tope: number
  ) {}
  mirar(): string | undefined {
    if (!this.hay) {
      const r = this.it.next()
      this.mirado = r.done ? undefined : r.value
      this.hay = true
      if (this.mirado !== undefined) {
        this.consumidos += this.mirado.length + 1
        if (this.consumidos > this.tope + 1) throw error(`el tamaño supera el tope de ${this.tope} caracteres`)
      }
    }
    return this.mirado
  }
  sig(): string | undefined {
    const l = this.mirar()
    this.hay = false
    return l
  }
}

/** Lee todos los gráficos de un archivo `raw` ASCII ya en memoria (pruebas y archivos chicos). */
export function leerRawAscii(texto: string, topes: TopesRaw = TOPES_RAW): GraficoRaw[] {
  if (texto.length > topes.bytes) throw error(`el tamaño (${texto.length} caracteres) supera el tope de ${topes.bytes}`)
  return leerRawAsciiLineas(texto.split(/\r?\n/)[Symbol.iterator](), topes, texto.length)
}

/** Lee los gráficos del `raw` renglón por renglón con un tope corrido de caracteres. `bytesTotal` evita reservar por lo que miente la cabecera (cada valor ocupa al menos dos caracteres). */
export function leerRawAsciiLineas(lineas: Iterator<string>, topes: TopesRaw = TOPES_RAW, bytesTotal: number = topes.bytes): GraficoRaw[] {
  const c = new Cursor(lineas, topes.bytes)
  const graficos: GraficoRaw[] = []
  let valoresTotal = 0
  const saltarBlancas = () => {
    for (let l = c.mirar(); l !== undefined && l.trim() === ''; l = c.mirar()) c.sig()
  }
  for (saltarBlancas(); c.mirar() !== undefined; saltarBlancas()) {
    if (graficos.length >= topes.graficos) throw error(`más de ${topes.graficos} gráficos`)
    // Cabecera: pares «Clave: valor» hasta «Variables:».
    const cab = new Map<string, string>()
    let tieneVariables = false
    for (let l = c.sig(); l !== undefined; l = c.sig()) {
      if (l.trim() === 'Variables:') {
        tieneVariables = true
        break
      }
      const m = /^([A-Za-z. ]+):\s?(.*)$/.exec(l)
      if (!m) throw error(`renglón de cabecera inesperado «${l.slice(0, 40)}»`)
      cab.set(m[1].trim().toLowerCase(), m[2].trim())
    }
    if (!tieneVariables) throw error('falta «Variables:»')
    const flags = cab.get('flags')
    if (flags === undefined) throw error('falta «Flags:»')
    const banderas = flags.toLowerCase().split(/\s+/)
    if (!banderas.includes('real') && !banderas.includes('complex')) throw error(`«Flags: ${flags.slice(0, 30)}» no es real ni complex`)
    const complejo = banderas.includes('complex')
    const nv = cab.get('no. variables')
    const np = cab.get('no. points')
    if (nv === undefined || !ENTERO.test(nv)) throw error('«No. Variables» no es un entero')
    if (np === undefined || !ENTERO.test(np)) throw error('«No. Points» no es un entero positivo')
    const nVars = Number(nv)
    const nPuntos = Number(np)
    if (nVars < 1 || nVars > topes.variables) throw error(`${nVars} variables: el tope es ${topes.variables}`)
    if (nPuntos > topes.puntos) throw error(`${nPuntos} puntos: el tope es ${topes.puntos}`)
    valoresTotal += nVars * nPuntos
    if (valoresTotal > topes.valores) throw error(`más de ${topes.valores} valores en total`)
    const variables: VariableRaw[] = []
    for (let k = 0; k < nVars; k++) {
      const l = c.sig()
      const m = l === undefined ? null : /^\s*(\d+)\s+(\S+)\s+(\S+)(?:\s+\S+=\S+)*\s*$/.exec(l)
      if (!m || Number(m[1]) !== k) throw error(`falta la variable ${k}`)
      variables.push({ nombre: m[2], tipo: m[3], re: new Float64Array(0), im: null })
    }
    if (c.sig()?.trim() !== 'Values:') throw error('falta «Values:»')
    // No se reserva por lo que dice la cabecera: cada valor ocupa al menos dos caracteres de lo que queda del archivo.
    if (nVars * nPuntos * 2 > bytesTotal - c.consumidos) throw error('el archivo trae menos valores de los que anuncia la cabecera')
    const re = variables.map(() => new Float64Array(nPuntos))
    const im = complejo ? variables.map(() => new Float64Array(nPuntos)) : null
    for (let p = 0; p < nPuntos; p++) {
      for (let k = 0; k < nVars; k++) {
        let l = c.sig()
        if (l === undefined) throw error('el archivo termina antes de lo que anuncia la cabecera')
        l = l.trim()
        if (k === 0) {
          const m = /^(\d+)\s+(\S+)$/.exec(l)
          if (!m || Number(m[1]) !== p) throw error(`el punto ${p} no está en su lugar`)
          l = m[2]
        }
        if (im) {
          const partes = l.split(',')
          if (partes.length !== 2) throw error(`el valor complejo «${l.slice(0, 30)}» no es «re,im»`)
          re[k][p] = numero(partes[0])
          im[k][p] = numero(partes[1])
        } else {
          re[k][p] = numero(l)
        }
      }
      saltarBlancas()
    }
    variables.forEach((v, k) => {
      v.re = re[k]
      v.im = im ? im[k] : null
    })
    graficos.push({ nombre: cab.get('plotname') ?? '', complejo, puntos: nPuntos, variables })
  }
  if (graficos.length === 0) throw error('no trae ningún gráfico')
  return graficos
}

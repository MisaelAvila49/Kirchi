/** Tablas de verdad de las piezas `lut` y `msi`: filas como las de la hoja ("0 1 X > 1 Z") compiladas a una fila de la
 * tabla del motor por cada combinación de entradas. El primer dato del índice es el bit más significativo y la primera
 * salida ocupa los dos bits bajos (0, 1, Z = 2, X = 3), como lee `engine/src/digital/lut.rs`. */

export interface TablaDef {
  columnas: string[]
  salidas: string[]
  filas: string[]
}

export interface OpcionesTabla {
  /** Ancho de la columna «estado» de un `msi` (el registro del núcleo). Sin él, «estado» no es una columna. */
  bitsEstado?: number
  /** Pines que son entrada y salida a la vez: su salida no puede depender de su propia entrada. */
  bidireccionales?: string[]
}

export interface TablaCompilada {
  filas: number[] | bigint[]
  errores: string[]
  /** Bits del índice (una fila de la tabla por cada una de las 2^bits combinaciones). */
  bits: number
}

/** Más bits son 16,384 filas: el tope del motor. */
export const MAX_BITS_TABLA = 14

const VALOR: Record<string, bigint> = { '0': 0n, '1': 1n, Z: 2n, X: 3n }
const FUENTE_BIT = /^[qa]\d+$/

type Condicion = { mascara: number; valor: number } | { desde: number; hasta: number; desplazo: number; ancho: number }

interface Fila {
  condiciones: Condicion[]
  celdas: string[]
}

/** Cada columna con su valor en una combinación, para decir qué falta o qué se cruza. */
function describir(indice: number, columnas: string[], anchos: number[]): string {
  let resto = indice
  const partes: string[] = []
  for (let k = columnas.length - 1; k >= 0; k--) {
    partes.unshift(`${columnas[k]} = ${resto & ((1 << anchos[k]) - 1)}`)
    resto >>= anchos[k]
  }
  return partes.join(', ')
}

export function compilarTabla(def: TablaDef, nombres: string[], opciones: OpcionesTabla = {}): TablaCompilada {
  const errores: string[] = []
  const vacio = (): TablaCompilada => ({ filas: [], errores, bits: 0 })
  const { bitsEstado } = opciones
  const permitido = (n: string) => nombres.includes(n) || n === 'estado' || FUENTE_BIT.test(n)
  for (const c of def.columnas) if (!permitido(c)) errores.push(`la columna «${c}» no es un pin de la pieza`)
  for (const s of def.salidas) if (!nombres.includes(s)) errores.push(`la salida «${s}» no es un pin de la pieza`)
  if (def.columnas.includes('estado') && bitsEstado === undefined) errores.push('la columna «estado» solo existe en un modelo msi')
  if (new Set(def.columnas).size !== def.columnas.length) errores.push('hay una columna repetida')

  const anchos = def.columnas.map((c) => (c === 'estado' ? (bitsEstado ?? 1) : 1))
  const bits = anchos.reduce((a, b) => a + b, 0)
  if (bits > MAX_BITS_TABLA) errores.push(`la tabla tiene ${bits} bits de entrada y el máximo es ${MAX_BITS_TABLA}`)
  if (errores.length) return vacio()

  // Peso del bit menos significativo de cada columna dentro del índice.
  const pesos: number[] = []
  let resto = bits
  for (const a of anchos) {
    resto -= a
    pesos.push(resto)
  }

  const filas: Fila[] = []
  def.filas.forEach((texto, n) => {
    const partes = texto.split('>')
    const izq = partes[0]?.trim().split(/\s+/).filter(Boolean) ?? []
    const der = partes[1]?.trim().split(/\s+/).filter(Boolean) ?? []
    if (partes.length !== 2 || izq.length !== def.columnas.length || der.length !== def.salidas.length) {
      errores.push(`la fila ${n + 1} debe tener ${def.columnas.length} celdas, «>» y ${def.salidas.length} salidas`)
      return
    }
    const condiciones: Condicion[] = []
    izq.forEach((celda, k) => {
      const c = def.columnas[k]
      const mala = () => errores.push(`la fila ${n + 1} trae «${celda}» en ${c}: ${c === 'estado' ? 'va un número, un rango como 0-4 o X' : 'va 0, 1 o X'}`)
      if (/^[xX]$/.test(celda)) return
      if (c === 'estado') {
        const m = /^(\d+)(?:-(\d+))?$/.exec(celda)
        if (!m) return mala()
        const desde = Number(m[1]), hasta = Number(m[2] ?? m[1])
        if (hasta < desde || hasta >= 2 ** anchos[k]) return void errores.push(`la fila ${n + 1} trae «${celda}» en estado: fuera de 0 a ${2 ** anchos[k] - 1}`)
        condiciones.push({ desde, hasta, desplazo: pesos[k], ancho: anchos[k] })
      } else if (celda === '0' || celda === '1') condiciones.push({ mascara: 1 << pesos[k], valor: celda === '1' ? 1 << pesos[k] : 0 })
      else mala()
    })
    // Cada celda de salida: 0, 1, Z, X, una columna (su valor) o su negada con «!».
    der.forEach((celda, j) => {
      if (esLiteral(celda, def.columnas)) return
      const nombre = celda.startsWith('!') ? celda.slice(1) : celda
      if (!def.columnas.includes(nombre) && !(bitsEstado !== undefined && /^q\d+$/.test(nombre) && Number(nombre.slice(1)) < bitsEstado)) {
        errores.push(`la fila ${n + 1} trae «${celda}» en ${def.salidas[j]}: va 0, 1, Z, X o el nombre de una columna (con ! si se niega)`)
      }
    })
    filas.push({ condiciones, celdas: der })
  })
  if (errores.length) return vacio()

  const coincide = (f: Fila, i: number) =>
    f.condiciones.every((c) => {
      if ('mascara' in c) return (i & c.mascara) === c.valor
      const v = (i >> c.desplazo) & ((1 << c.ancho) - 1)
      return v >= c.desde && v <= c.hasta
    })
  /** Bit del índice que una celda copia: el de una columna o el qK del estado. */
  const bitDe = (nombre: string, i: number): bigint => {
    const k = def.columnas.indexOf(nombre)
    if (k >= 0) return BigInt((i >> pesos[k]) & 1)
    const e = def.columnas.indexOf('estado')
    return BigInt((i >> (pesos[e] + Number(nombre.slice(1)))) & 1)
  }
  const valorDe = (celda: string, i: number): bigint => {
    if (esLiteral(celda, def.columnas)) return VALOR[celda.toUpperCase()]
    return celda.startsWith('!') ? 1n - bitDe(celda.slice(1), i) : bitDe(celda, i)
  }
  const empaca = (f: Fila, i: number): bigint => f.celdas.reduce((acc, c, j) => acc | (valorDe(c, i) << BigInt(2 * j)), 0n)

  const total = 2 ** bits
  const salida: bigint[] = new Array(total)
  let falta = -1
  let cruce: string | null = null
  for (let i = 0; i < total; i++) {
    let primera = -1
    for (let r = 0; r < filas.length; r++) {
      if (!coincide(filas[r], i)) continue
      const v = empaca(filas[r], i)
      if (primera < 0) {
        primera = r
        salida[i] = v
      } else if (v !== salida[i] && cruce === null) cruce = `las filas ${primera + 1} y ${r + 1} se cruzan en ${describir(i, def.columnas, anchos)}`
    }
    if (primera < 0 && falta < 0) falta = i
  }
  if (falta >= 0) errores.push(`la tabla no dice qué pasa con ${describir(falta, def.columnas, anchos)}`)
  if (cruce) errores.push(cruce)

  for (const b of opciones.bidireccionales ?? []) {
    const k = def.columnas.indexOf(b), j = def.salidas.indexOf(b)
    if (k < 0 || j < 0 || errores.length) continue
    for (let i = 0; i < total; i++) {
      if (((salida[i] >> BigInt(2 * j)) & 3n) !== ((salida[i ^ (1 << pesos[k])] >> BigInt(2 * j)) & 3n)) {
        errores.push(`la salida ${b} depende de la entrada ${b} de su propio pin`)
        break
      }
    }
  }
  if (errores.length) return vacio()
  // Con más de 26 salidas la fila no cabe en los 53 bits de un número de JavaScript.
  return { filas: def.salidas.length * 2 <= 53 ? salida.map(Number) : salida, errores, bits }
}

/** 0, 1, Z o X, salvo que una columna se llame igual. */
function esLiteral(celda: string, columnas: string[]): boolean {
  return Object.hasOwn(VALOR, celda.toUpperCase()) && !columnas.includes(celda)
}

/** La tabla de función de una hoja (las pruebas la cargan de `__fixtures__/funciones`) como definición de pieza. */
export function tablaHoja(fixture: { columnas: string[]; salidas: string[]; filas: string[] }): TablaDef {
  return { columnas: fixture.columnas, salidas: fixture.salidas, filas: fixture.filas }
}

/** Tablas de las funciones que la hoja no trae como tabla (sumador, comparador de magnitud). Son funciones puras: dan la
 * misma `TablaDef` que escribiría una pieza a mano, con una fila por combinación. */
import type { TablaDef } from './tablaVerdad'

export interface GenerarSuma {
  tipo: 'suma'
  /** Bit menos significativo primero. */
  a: string[]
  b: string[]
  acarreo: string
  suma: string[]
  salida_acarreo: string
}

export interface GenerarCompara {
  tipo: 'compara'
  /** Bit menos significativo primero. */
  a: string[]
  b: string[]
  /** Entradas de cascada: A<B, A=B y A>B del chip anterior. */
  cascada: { menor: string; igual: string; mayor: string }
  /** Salidas A<B, A=B y A>B. */
  salidas: { menor: string; igual: string; mayor: string }
}

export type GenerarDef = GenerarSuma | GenerarCompara

/** Todas las filas de n bits, la primera columna como bit más significativo. */
function combinaciones(n: number): number[][] {
  return Array.from({ length: 2 ** n }, (_, i) => Array.from({ length: n }, (_, k) => (i >> (n - 1 - k)) & 1))
}

const numero = (bits: number[]) => bits.reduce((acc, b, k) => acc + b * 2 ** k, 0)

/** A + B + acarreo de entrada en binario: la suma en `suma` y el acarreo de salida. */
export function suma(g: GenerarSuma): TablaDef {
  const n = g.a.length
  const filas = combinaciones(2 * n + 1).map((c) => {
    const total = numero(c.slice(0, n)) + numero(c.slice(n, 2 * n)) + c[2 * n]
    const salida = [...Array.from({ length: n }, (_, k) => (total >> k) & 1), (total >> n) & 1]
    return `${c.join(' ')} > ${salida.join(' ')}`
  })
  return { columnas: [...g.a, ...g.b, g.acarreo], salidas: [...g.suma, g.salida_acarreo], filas }
}

/** Comparador de magnitud con cascada. Con A = B las salidas siguen a la cascada como en la hoja del 7485: A=B de
 * entrada manda, y las combinaciones ilegales dan 0 0 (A>B y A<B altas) o 1 1 (las dos bajas). */
export function compara(g: GenerarCompara): TablaDef {
  const n = g.a.length
  const filas = combinaciones(2 * n + 3).map((c) => {
    const a = numero(c.slice(0, n)), b = numero(c.slice(n, 2 * n))
    const [menorIn, igualIn, mayorIn] = c.slice(2 * n)
    let s: [number, number, number]
    if (a > b) s = [0, 0, 1]
    else if (a < b) s = [1, 0, 0]
    else if (igualIn) s = [0, 1, 0]
    else if (mayorIn && menorIn) s = [0, 0, 0]
    else if (!mayorIn && !menorIn) s = [1, 0, 1]
    else s = [menorIn, 0, mayorIn]
    return `${c.join(' ')} > ${s.join(' ')}`
  })
  const { menor, igual, mayor } = g.cascada
  return { columnas: [...g.a, ...g.b, menor, igual, mayor], salidas: [g.salidas.menor, g.salidas.igual, g.salidas.mayor], filas }
}

export function generar(g: GenerarDef): TablaDef {
  return g.tipo === 'suma' ? suma(g) : compara(g)
}

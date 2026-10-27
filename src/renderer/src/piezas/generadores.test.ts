import { describe, expect, it } from 'vitest'
import comparador85 from './__fixtures__/funciones/comparador-magnitud-85.json'
import { compara, suma } from './generadores'
import { compilarTabla } from './tablaVerdad'

const sal = (fila: number | bigint, j: number) => Number((BigInt(fila) >> BigInt(2 * j)) & 3n)

describe('suma', () => {
  const def = suma({ tipo: 'suma', a: ['A1', 'A2', 'A3', 'A4'], b: ['B1', 'B2', 'B3', 'B4'], acarreo: 'C0', suma: ['S1', 'S2', 'S3', 'S4'], salida_acarreo: 'C4' })

  it('da la suma binaria de las 512 combinaciones', () => {
    const r = compilarTabla(def, [...def.columnas, ...def.salidas])
    expect(r.errores).toEqual([])
    expect(r.filas).toHaveLength(512)
    for (let i = 0; i < 512; i++) {
      // Primera columna = bit más significativo del índice; A1 y B1 son los bits bajos de cada número.
      const bits = Array.from({ length: 9 }, (_, k) => (i >> (8 - k)) & 1)
      const total = bits[0] + bits[1] * 2 + bits[2] * 4 + bits[3] * 8 + (bits[4] + bits[5] * 2 + bits[6] * 4 + bits[7] * 8) + bits[8]
      const obtenido = [0, 1, 2, 3, 4].reduce((acc, j) => acc + sal(r.filas[i], j) * 2 ** j, 0)
      expect(obtenido, `fila ${i}`).toBe(total)
    }
  })
})

describe('compara', () => {
  const def = compara({ tipo: 'compara', a: ['A0', 'A1', 'A2', 'A3'], b: ['B0', 'B1', 'B2', 'B3'], cascada: { menor: 'IL', igual: 'IE', mayor: 'IG' }, salidas: { menor: 'OL', igual: 'OE', mayor: 'OG' } })
  const r = compilarTabla(def, [...def.columnas, ...def.salidas])
  const salidas = (a: number, b: number, il: number, ie: number, ig: number) => {
    const bits = [0, 1, 2, 3].map((k) => (a >> k) & 1).concat([0, 1, 2, 3].map((k) => (b >> k) & 1), [il, ie, ig])
    const i = bits.reduce((acc, v) => (acc << 1) | v, 0)
    return [sal(r.filas[i], 0), sal(r.filas[i], 1), sal(r.filas[i], 2)]
  }

  it('compila completa y sin cruces', () => {
    expect(r.errores).toEqual([])
    expect(r.filas).toHaveLength(2048)
  })

  it('compara enteros en las combinaciones de cascada legales', () => {
    for (let a = 0; a < 16; a++)
      for (let b = 0; b < 16; b++) {
        if (a > b) expect(salidas(a, b, 0, 1, 0)).toEqual([0, 0, 1])
        else if (a < b) expect(salidas(a, b, 1, 0, 0)).toEqual([1, 0, 0])
        else {
          expect(salidas(a, b, 0, 0, 1)).toEqual([0, 0, 1])
          expect(salidas(a, b, 1, 0, 0)).toEqual([1, 0, 0])
          expect(salidas(a, b, 0, 1, 0)).toEqual([0, 1, 0])
        }
      }
  })

  it('coincide con las filas de cascada de la hoja, incluidas las ilegales', () => {
    // Las cinco últimas filas de la hoja: A = B, cascada (A>B, A<B, A=B) y salidas (A>B, A<B, A=B).
    const hoja = comparador85.filas.slice(-5).map((f) => f.split(/\s+/).filter((t) => t !== '>' && t !== '=').slice(-6))
    for (const f of hoja) {
      const [ig, il, ie, og, ol, oe] = f.map((t) => (t === 'X' ? null : Number(t)))
      for (const x of [0, 1]) {
        const e = ie ?? x, g = ig ?? x, l = il ?? x
        // La fila «X X 1» solo aplica con A=B de entrada en 1.
        if (ie === null && e !== 1) continue
        expect(salidas(5, 5, l, e, g), f.join(' ')).toEqual([ol, oe, og])
      }
    }
  })
})

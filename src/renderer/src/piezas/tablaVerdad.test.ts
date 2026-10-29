import { describe, expect, it } from 'vitest'
import { compilarTabla, tablaHoja } from './tablaVerdad'
import decodificador138 from './__fixtures__/funciones/decodificador-138.json'
import multiplexor151 from './__fixtures__/funciones/multiplexor-151.json'

const todos = (def: { columnas: string[]; salidas: string[] }) => [...def.columnas, ...def.salidas]
const bit = (i: number, k: number, n: number) => (i >> (n - 1 - k)) & 1
/** Valor de la salida j de una fila del motor (dos bits por salida, la primera en los bajos). */
const sal = (fila: number | bigint, j: number) => Number((BigInt(fila) >> BigInt(2 * j)) & 3n)

describe('compilarTabla', () => {
  it('una NAND da la fila que lee el motor: primera columna en el bit más significativo', () => {
    const r = compilarTabla({ columnas: ['A', 'B'], salidas: ['Y'], filas: ['0 X > 1', '1 0 > 1', '1 1 > 0'] }, ['A', 'B', 'Y'])
    expect(r.errores).toEqual([])
    expect(r.filas).toEqual([1, 1, 1, 0])
  })

  it('la primera salida ocupa los dos bits bajos, con Z = 2 y X = 3', () => {
    const r = compilarTabla({ columnas: ['A'], salidas: ['P', 'Q'], filas: ['0 > Z 0', '1 > 1 X'] }, ['A', 'P', 'Q'])
    expect(r.filas).toEqual([2, 1 | (3 << 2)])
  })

  it('una salida en Z o en 1 con la otra en 0 da las filas del motor [2, 5]', () => {
    const r = compilarTabla({ columnas: ['A'], salidas: ['P', 'Q'], filas: ['0 > Z 0', '1 > 1 1'] }, ['A', 'P', 'Q'])
    expect(r.filas).toEqual([2 | (0 << 2), 1 | (1 << 2)])
  })

  it('el decodificador 138 de la hoja se compila aunque sus tres primeras filas se solapan con la misma salida', () => {
    const def = tablaHoja(decodificador138)
    const r = compilarTabla(def, todos(def))
    expect(r.errores).toEqual([])
    expect(r.bits).toBe(6)
    for (let i = 0; i < 64; i++) {
      const [g1, g2a, g2b, c, b, a] = [0, 1, 2, 3, 4, 5].map((k) => bit(i, k, 6))
      const activo = g1 === 1 && g2a === 0 && g2b === 0 ? c * 4 + b * 2 + a : -1
      for (let j = 0; j < 8; j++) expect(sal(r.filas[i], j), `fila ${i} salida ${j}`).toBe(j === activo ? 0 : 1)
    }
  })

  it('el multiplexor 151 copia el dato elegido en Y y su negado en W', () => {
    const def = tablaHoja(multiplexor151)
    const r = compilarTabla(def, todos(def))
    expect(r.errores).toEqual([])
    for (let i = 0; i < 4096; i++) {
      const v = Array.from({ length: 12 }, (_, k) => bit(i, k, 12))
      const sel = v[1] * 4 + v[2] * 2 + v[3]
      const y = v[0] === 1 ? 0 : v[4 + sel]
      expect([sal(r.filas[i], 0), sal(r.filas[i], 1)], `fila ${i}`).toEqual([y, 1 - y])
    }
  })

  it('el estado acepta número y rango, y q0 copia un bit del registro', () => {
    const def = { columnas: ['ENT', 'estado'], salidas: ['RCO', 'B0'], filas: ['1 15 > 1 q0', '1 0-14 > 0 q0', '0 X > 0 q0'] }
    const r = compilarTabla(def, ['ENT', 'RCO', 'B0'], { bitsEstado: 4 })
    expect(r.errores).toEqual([])
    expect(r.bits).toBe(5)
    for (let i = 0; i < 32; i++) {
      const ent = i >> 4, estado = i & 15
      expect([sal(r.filas[i], 0), sal(r.filas[i], 1)]).toEqual([ent && estado === 15 ? 1 : 0, estado & 1])
    }
  })

  it('dice qué combinación falta', () => {
    const r = compilarTabla({ columnas: ['A', 'B'], salidas: ['Y'], filas: ['0 X > 1', '1 0 > 1'] }, ['A', 'B', 'Y'])
    expect(r.errores).toEqual(['la tabla no dice qué pasa con A = 1, B = 1'])
  })

  it('dice qué filas se cruzan y dónde', () => {
    const r = compilarTabla({ columnas: ['A', 'B'], salidas: ['Y'], filas: ['0 X > 1', '1 X > 0', 'X 1 > 1'] }, ['A', 'B', 'Y'])
    expect(r.errores).toEqual(['las filas 2 y 3 se cruzan en A = 1, B = 1'])
  })

  it('rechaza celdas, columnas y salidas que no existen', () => {
    const base = { columnas: ['A'], salidas: ['Y'], filas: ['0 > 1', '1 > 0'] }
    expect(compilarTabla({ ...base, filas: ['2 > 1', '1 > 0'] }, ['A', 'Y']).errores[0]).toContain('va 0, 1 o X')
    expect(compilarTabla({ ...base, filas: ['0 > 7', '1 > 0'] }, ['A', 'Y']).errores[0]).toContain('trae «7» en Y')
    expect(compilarTabla({ ...base, columnas: ['B'] }, ['A', 'Y']).errores[0]).toContain('«B» no es un pin')
    expect(compilarTabla({ ...base, filas: ['0 1 > 1'] }, ['A', 'Y']).errores[0]).toContain('la fila 1 debe tener')
    expect(compilarTabla({ columnas: ['estado'], salidas: ['Y'], filas: ['X > 1'] }, ['Y']).errores[0]).toContain('solo existe en un modelo msi')
    expect(compilarTabla({ columnas: ['estado'], salidas: ['Y'], filas: ['16 > 1'] }, ['Y'], { bitsEstado: 4 }).errores[0]).toContain('fuera de 0 a 15')
  })

  it('una salida bidireccional no puede depender de la entrada de su propio pin', () => {
    const def = { columnas: ['DIR', 'A'], salidas: ['A'], filas: ['0 X > A', '1 X > 0'] }
    expect(compilarTabla(def, ['DIR', 'A'], { bidireccionales: ['A'] }).errores).toEqual(['la salida A depende de la entrada A de su propio pin'])
    expect(compilarTabla(def, ['DIR', 'A']).errores).toEqual([])
  })

  it('más de 14 bits de entrada se rechaza', () => {
    const columnas = Array.from({ length: 15 }, (_, k) => `E${k}`)
    expect(compilarTabla({ columnas, salidas: ['Y'], filas: [`${columnas.map(() => 'X').join(' ')} > 1`] }, [...columnas, 'Y']).errores[0]).toContain('el máximo es 14')
  })

  it('con más de 26 salidas las filas son bigint', () => {
    const salidas = Array.from({ length: 30 }, (_, k) => `S${k}`)
    const r = compilarTabla({ columnas: ['A'], salidas, filas: [`X > ${salidas.map(() => '1').join(' ')}`] }, ['A', ...salidas])
    expect(r.errores).toEqual([])
    expect(typeof r.filas[0]).toBe('bigint')
    expect(r.filas[0]).toBe(BigInt('0x' + '5'.repeat(15)))
  })
})

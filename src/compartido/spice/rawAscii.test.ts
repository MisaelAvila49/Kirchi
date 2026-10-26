import { describe, expect, it } from 'vitest'
import { leerRawAscii, TOPES_RAW } from './rawAscii'

const REAL = `Title: * prueba
Date: Tue Oct 20 21:00:00  2026
Plotname: Transient Analysis
Flags: real
No. Variables: 3
No. Points: 3
Variables:
\t0\ttime\ttime
\t1\tv(n1)\tvoltage
\t2\ti(v1)\tcurrent
Values:
 0\t0.000000000000000e+000
\t1.000000000000000e+000
\t-1.000000000000000e-003

 1\t1.000000000000000e-003
\t2.5e+000
\t-2.5e-003

 2\t2.000000000000000e-003
\t5.000000000000000e+000
\t-5.000000000000000e-003
`

const COMPLEJO = `Title: * ac
Date: hoy
Plotname: AC Analysis
Flags: complex
No. Variables: 2
No. Points: 2
Variables:
\t0\tfrequency\tfrequency
\t1\tv(n2)\tvoltage
Values:
 0\t1.000000000000000e+003,0.000000000000000e+000
\t7.071067811865475e-001,-7.071067811865475e-001

 1\t1.000000000000000e+004,0.000000000000000e+000
\t9.950371902099892e-002,-9.950371902099892e-001
`

describe('leerRawAscii', () => {
  it('lee un grafico real con sus variables y puntos', () => {
    const [g] = leerRawAscii(REAL)
    expect(g.nombre).toBe('Transient Analysis')
    expect(g.complejo).toBe(false)
    expect(g.puntos).toBe(3)
    expect(g.variables.map((v) => [v.nombre, v.tipo])).toEqual([['time', 'time'], ['v(n1)', 'voltage'], ['i(v1)', 'current']])
    expect([...g.variables[1].re]).toEqual([1, 2.5, 5])
    expect([...g.variables[2].re]).toEqual([-1e-3, -2.5e-3, -5e-3])
    expect([...g.variables[0].re]).toEqual([0, 1e-3, 2e-3])
    expect(g.variables[1].im).toBeNull()
  })

  it('lee vectores complejos como parejas re,im', () => {
    const [g] = leerRawAscii(COMPLEJO)
    expect(g.complejo).toBe(true)
    expect([...g.variables[1].re]).toEqual([0.7071067811865475, 0.09950371902099892])
    expect([...g.variables[1].im!]).toEqual([-0.7071067811865475, -0.9950371902099892])
  })

  it('lee varios graficos seguidos', () => {
    const gs = leerRawAscii(REAL + COMPLEJO)
    expect(gs.map((g) => g.nombre)).toEqual(['Transient Analysis', 'AC Analysis'])
  })

  it('acepta renglones con fin CRLF', () => {
    expect(leerRawAscii(REAL.replace(/\n/g, '\r\n'))[0].puntos).toBe(3)
  })

  it('lee nan e inf como numeros no finitos sin romperse', () => {
    const t = REAL.replace('2.5e+000', 'nan').replace('5.000000000000000e+000', 'inf')
    const [g] = leerRawAscii(t)
    expect(Number.isNaN(g.variables[1].re[1])).toBe(true)
    expect(g.variables[1].re[2]).toBe(Infinity)
  })

  it.each([
    ['sin Values', REAL.replace('Values:', '')],
    ['sin Flags', REAL.replace('Flags: real\n', '')],
    ['variables que no son numero', REAL.replace('No. Variables: 3', 'No. Variables: tres')],
    ['puntos negativos', REAL.replace('No. Points: 3', 'No. Points: -3')],
    ['menos valores de los anunciados', REAL.slice(0, REAL.lastIndexOf('\t-5'))],
    ['un valor que no es numero', REAL.replace('2.5e+000', 'abc')],
    ['indice de punto fuera de orden', REAL.replace('\n 1\t1.0', '\n 7\t1.0')],
    ['un renglon de variable sin tipo', REAL.replace('\t1\tv(n1)\tvoltage', '\t1\tv(n1)')],
    ['faltan variables declaradas', REAL.replace('\t2\ti(v1)\tcurrent\n', '')],
    ['complejo sin coma', COMPLEJO.replace('7.071067811865475e-001,-7.071067811865475e-001', '7.0e-001')],
    ['vacio', ''],
    ['basura binaria', '\u0000\u0001\u0002 basura']
  ])('rechaza un archivo malformado: %s', (_c, texto) => {
    expect(() => leerRawAscii(texto)).toThrow(/raw/i)
  })

  it('respeta el tope de bytes', () => {
    expect(() => leerRawAscii(REAL, { ...TOPES_RAW, bytes: 100 })).toThrow(/tamaño/i)
  })

  it('respeta el tope de puntos por variable', () => {
    expect(() => leerRawAscii(REAL, { ...TOPES_RAW, puntos: 2 })).toThrow(/puntos/i)
  })

  it('respeta el tope de variables', () => {
    expect(() => leerRawAscii(REAL, { ...TOPES_RAW, variables: 2 })).toThrow(/variables/i)
  })

  it('respeta el tope de graficos', () => {
    expect(() => leerRawAscii(REAL + REAL + REAL, { ...TOPES_RAW, graficos: 2 })).toThrow(/gráficos/i)
  })

  it('no reserva memoria por lo que dice la cabecera: un archivo corto que anuncia mil millones de puntos falla antes', () => {
    const t = REAL.replace('No. Points: 3', 'No. Points: 1000000000')
    expect(() => leerRawAscii(t)).toThrow(/raw/i)
  })
})

describe('variables con parametros extra', () => {
  it('acepta el grid=3 que ngspice agrega a la frecuencia', () => {
    const g = leerRawAscii(COMPLEJO.replace('frequency	frequency', 'frequency	frequency grid=3'))
    expect(g[0].variables[0].tipo).toBe('frequency')
  })
})

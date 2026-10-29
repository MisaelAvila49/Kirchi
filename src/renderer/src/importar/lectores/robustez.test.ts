import { describe, expect, it } from 'vitest'
import { leerFalstad } from './falstad'
import { leerKicad } from './kicad'
import { leerLtspice } from './ltspice'
import { leerSpice } from './spice'

const rapido = (f: () => unknown, ms: number): void => {
  const t0 = performance.now()
  f()
  expect(performance.now() - t0).toBeLessThan(ms)
}

describe('líneas hostiles', () => {
  it('SPICE no se atasca con un .print de 200 KB de «v(» sin cerrar', () => {
    const texto = `titulo\nR1 a 0 1k\n.print tran ${'v('.repeat(100_000)}\n.end\n`
    rapido(() => leerSpice(texto, 'x.cir'), 200)
  })
  it('las líneas pasan de 4,000 caracteres se recortan con aviso en los tres lectores de texto', () => {
    const larga = 'x'.repeat(10_000)
    expect(leerSpice(`t\n* ${larga}\nR1 a 0 1k\n.end`, 'x').avisos.some((a) => /recort/.test(a))).toBe(true)
    expect(leerLtspice(`Version 4\nTEXT 0 0 Left 2 ;${larga}\n`, 'x').avisos.some((a) => /recort/.test(a))).toBe(true)
    expect(leerFalstad(`$ 1 0.000005 10 50 5 50\n${larga}\n`, 'x').avisos.some((a) => /recort/.test(a))).toBe(true)
  })
})

describe('claves tomadas del archivo no alcanzan el prototipo de los objetos', () => {
  it('KiCad no toma «constructor» como el nombre de una hoja hija', () => {
    const texto = '(kicad_sch (version 20250114) (sheet (at 0 0) (size 10 10) (property "Sheetname" "x") (property "Sheetfile" "constructor")))'
    const c = leerKicad(texto, 'x.kicad_sch')
    expect(c.avisos.some((a) => /no se encontró/.test(a))).toBe(true)
  })
  it('Falstad no toma «constructor» como un código de elemento con prefijo', () => {
    const c = leerFalstad('$ 1 0.000005 10 50 5 50\nconstructor 0 0 32 0 0\n', 'x.txt')
    expect(c.piezas.every((p) => /^[A-Z]+\d+$/.test(p.ref))).toBe(true)
  })
})

describe('datos fuera de rango en las piezas', () => {
  it('SPICE ignora una línea que solo trae paréntesis', () => {
    expect(() => leerSpice(['t', '(', ',,', 'R1 a 0 1k', '.end'].join('\n'), 'x.cir')).not.toThrow()
  })
  const simbolo = (unidad: string): string =>
    `(kicad_sch (version 20250114) (lib_symbols (symbol "X:U" (symbol "U_1_1" (pin passive line (at 0 0 0) (length 1) (name "a") (number "1"))) (symbol "U_2_1" (pin passive line (at 5 0 0) (length 1) (name "b") (number "2")))))` +
    ` (symbol (lib_id "X:U") (at 10 10 0) (unit ${unidad}) (property "Reference" "U1") (property "Value" "u")))`
  it('KiCad rotula la unidad con letra solo entre A y Z', () => {
    expect(leerKicad(simbolo('2'), 'x').piezas[0]?.unidad).toBe('B')
    for (const u of ['99', '-3', '1.5', '1e20']) expect(leerKicad(simbolo(u), 'x').piezas[0]?.unidad).toMatch(/^[0-9.e+-]+$/)
  })
  it('SPICE no toma «off» como cuarto nodo de un transistor', () => {
    const c = leerSpice('t\nQ1 c b e modelo off\nQ2 c b e s modelo\nQ3 c b e modelo area=2\n.end\n', 'x.cir')
    const nodos = (ref: string): number => c.piezas.find((p) => p.ref === ref)!.pines.length
    expect([nodos('Q1'), nodos('Q2'), nodos('Q3')]).toEqual([3, 4, 3])
    expect(c.piezas.find((p) => p.ref === 'Q1')!.modelo).toBe('modelo')
  })
})

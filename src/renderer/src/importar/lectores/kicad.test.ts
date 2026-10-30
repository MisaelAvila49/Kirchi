import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { claseDe } from '../familias'
import { colocarPunto, leerKicad, MAX_INSTANCIAS_HOJA } from './kicad'

const fx = (n: string): string => readFileSync(join(__dirname, '..', '__fixtures__', 'kicad', n), 'utf8')
const leer = (n: string, hojas?: Record<string, string>) => leerKicad(fx(n), n, hojas)
type C = ReturnType<typeof leerKicad>
const pieza = (c: C, ref: string, unidad?: string) => c.piezas.find((p) => p.ref === ref && p.unidad === unidad)!
const pin = (c: C, ref: string, numero: string, unidad?: string) => pieza(c, ref, unidad).pines.find((p) => p.numero === numero)!
const red = (c: C, ref: string, p: string) => c.redes.find((r) => r.pines.some((q) => q.ref === ref && q.pin === p))
const mismaRed = (c: C, a: [string, string], b: [string, string]) => red(c, ...a) !== undefined && red(c, ...a) === red(c, ...b)

describe('divisor.kicad_sch', () => {
  const c = leer('divisor.kicad_sch')
  it('lee versión, unidades, piezas, valores y propiedades de simulación', () => {
    expect(c.formato).toBe('kicad')
    expect(c.version).toBe('9')
    // 100 mil del origen son una celda de 2.5 mm de Kirchi.
    expect(c.unidadesPorMm! * 2.5).toBeCloseTo(2.54)
    expect(c.piezas.map((p) => p.ref)).toEqual(['V1', 'R1', 'R2'])
    expect(pieza(c, 'R1')).toMatchObject({ tipo: 'Device:R', valor: '10k', x: 76.2, y: 40.64, giro: 0 })
    expect(pieza(c, 'R1').props.Footprint).toBe('Resistor_SMD:R_0805_2012Metric')
    expect(pieza(c, 'V1')).toMatchObject({ tipo: 'Simulation_SPICE:VDC', valor: '10' })
    expect(pieza(c, 'V1').props).toMatchObject({ 'Sim.Device': 'V', 'Sim.Type': 'DC', 'Sim.Pins': '1=+ 2=-' })
  })
  it('da a los pines su posición absoluta con Y hacia abajo', () => {
    expect(pieza(c, 'R1').pines.map((p) => [p.numero, p.x, p.y])).toEqual([['1', 76.2, 36.83], ['2', 76.2, 44.45]])
    expect(pieza(c, 'V1').pines).toMatchObject([{ numero: '1', nombre: '+', x: 50.8, y: 45.72 }, { numero: '2', nombre: '-', x: 50.8, y: 55.88 }])
  })
  it('une por cables, por una etiqueta sobre un cable y por un extremo sobre el interior de otro', () => {
    expect(mismaRed(c, ['V1', '1'], ['R1', '1'])).toBe(true)
    expect(mismaRed(c, ['R1', '2'], ['R2', '1'])).toBe(true)
    expect(red(c, 'R1', '2')!.nombre).toBe('out')
    expect(mismaRed(c, ['V1', '2'], ['R2', '2'])).toBe(true)
    expect(mismaRed(c, ['V1', '1'], ['R2', '1'])).toBe(false)
  })
  it('la tierra nombra su red y queda como terminal, no como pieza', () => {
    expect(red(c, 'V1', '2')!.nombre).toBe('GND')
    expect(c.piezas.some((p) => p.ref.startsWith('#'))).toBe(false)
    expect(c.dibujo!.terminales).toEqual([{ nombre: 'GND', tipo: 'tierra', x: 50.8, y: 66.04, giro: 0 }])
    expect(c.dibujo!.cables).toHaveLength(6)
    expect(c.dibujo!.etiquetas).toEqual([{ nombre: 'out', x: 76.2, y: 48.895, giro: 0 }])
  })
  it('sin avisos y con clases que el convertidor reconoce', () => {
    expect(c.avisos).toEqual([])
    expect(claseDe('kicad', pieza(c, 'R1'))).toBe('resistencia')
    expect(claseDe('kicad', pieza(c, 'V1'))).toBe('fuente-voltaje')
  })
})

describe('ampop.kicad_sch', () => {
  const c = leer('ampop.kicad_sch')
  it('lee el amp-op con sus cinco pines y la versión 8', () => {
    expect(c.version).toBe('8')
    expect(pieza(c, 'U1')).toMatchObject({ tipo: 'Amplifier_Operational:TL081', valor: 'TL081' })
    expect(pieza(c, 'U1').pines.map((p) => [p.numero, p.nombre, p.x, p.y])).toEqual([
      ['2', '-', 92.38, 47.46], ['3', '+', 92.38, 52.54], ['6', undefined, 107.62, 50], ['7', 'V+', 97.46, 42.38], ['4', 'V-', 97.46, 57.62]
    ])
    expect(claseDe('kicad', pieza(c, 'U1'))).toBe('amp-op')
  })
  it('las alimentaciones nombran sus redes y salen como terminales', () => {
    expect(red(c, 'U1', '7')!.nombre).toBe('+15V')
    expect(red(c, 'U1', '4')!.nombre).toBe('-15V')
    expect(red(c, 'U1', '3')!.nombre).toBe('GND')
    expect(c.dibujo!.terminales.map((t) => [t.nombre, t.tipo]).sort()).toEqual([['+15V', 'alimentacion'], ['-15V', 'alimentacion'], ['GND', 'tierra']])
  })
  it('une la realimentación con una unión sobre el interior de un cable', () => {
    expect(mismaRed(c, ['R1', '2'], ['U1', '2'])).toBe(true)
    expect(mismaRed(c, ['R2', '1'], ['U1', '2'])).toBe(true)
    expect(mismaRed(c, ['R2', '2'], ['U1', '6'])).toBe(true)
    expect(red(c, 'U1', '6')!.nombre).toBe('vout')
    expect(red(c, 'R1', '1')!.nombre).toBe('vin')
  })
})

describe('hc00.kicad_sch', () => {
  const c = leer('hc00.kicad_sch')
  it('cada unidad colocada es una pieza con su letra y solo sus pines', () => {
    expect(c.piezas.map((p) => [p.ref, p.unidad])).toEqual([['U1', 'A'], ['U1', 'B'], ['U1', 'C']])
    expect(pieza(c, 'U1', 'A').pines.map((p) => p.numero)).toEqual(['1', '2', '3'])
    expect(pieza(c, 'U1', 'B').pines.map((p) => p.numero)).toEqual(['4', '5', '6'])
    expect(pieza(c, 'U1', 'C').pines.map((p) => p.numero)).toEqual(['14', '7'])
    expect(pin(c, 'U1', '3', 'A')).toMatchObject({ x: 67.62, y: 40 })
    expect(pin(c, 'U1', '4', 'B')).toMatchObject({ x: 52.38, y: 67.46 })
  })
  it('une las unidades por etiquetas y la alimentación por sus símbolos power', () => {
    expect(mismaRed(c, ['U1', '3'], ['U1', '4'])).toBe(true)
    expect(red(c, 'U1', '3')!.nombre).toBe('n1')
    expect(mismaRed(c, ['U1', '1'], ['U1', '2'])).toBe(true)
    expect(red(c, 'U1', '1')!.nombre).toBe('in')
    expect(red(c, 'U1', '14')!.nombre).toBe('+5V')
    expect(red(c, 'U1', '7')!.nombre).toBe('GND')
  })
})

describe('etiquetas.kicad_sch', () => {
  const c = leer('etiquetas.kicad_sch')
  it('dos etiquetas locales iguales unen sus redes', () => {
    expect(mismaRed(c, ['R1', '2'], ['R2', '1'])).toBe(true)
    expect(red(c, 'R1', '2')!.nombre).toBe('A')
  })
  it('dos etiquetas globales iguales unen sus redes', () => {
    expect(mismaRed(c, ['R3', '2'], ['R4', '1'])).toBe(true)
    expect(red(c, 'R3', '2')!.nombre).toBe('VSIG')
  })
  it('una etiqueta global no se une con una local del mismo nombre', () => {
    expect(mismaRed(c, ['R1', '2'], ['R5', '1'])).toBe(false)
    expect(red(c, 'R5', '1')!.nombre).toBe('A')
  })
  it('guarda el texto del esquema en el dibujo', () => {
    expect(c.dibujo!.textos).toEqual([{ texto: 'Etiquetas locales y globales', x: 20, y: 15 }])
  })
})

describe('hojas jerárquicas', () => {
  const hojas = { 'hijo.kicad_sch': fx('hijo.kicad_sch') }
  const c = leer('padre.kicad_sch', hojas)
  it('aplana la hoja hija y prefija la referencia repetida con el nombre de la hoja', () => {
    expect(c.piezas.map((p) => p.ref).sort()).toEqual(['C1', 'Filtro/R1', 'R1', 'R2'])
    expect(c.avisos).toEqual([])
  })
  it('une el pin de hoja del padre con la etiqueta jerárquica del mismo nombre', () => {
    expect(mismaRed(c, ['R1', '2'], ['Filtro/R1', '1'])).toBe(true)
    expect(mismaRed(c, ['Filtro/R1', '2'], ['C1', '1'])).toBe(true)
    expect(mismaRed(c, ['C1', '1'], ['R2', '1'])).toBe(true)
  })
  it('la tierra es global y la etiqueta local de la hoja lleva su prefijo', () => {
    expect(mismaRed(c, ['C1', '2'], ['R2', '2'])).toBe(true)
    expect(red(c, 'R2', '2')!.nombre).toBe('GND')
    expect(red(c, 'R2', '1')!.nombre).toBe('Filtro/interna')
    expect(red(c, 'R1', '1')!.nombre).toBe('vin')
  })
  it('coloca la hoja hija a la derecha de la raíz para que no se encimen', () => {
    const maxPadre = Math.max(...['R1', 'R2'].map((r) => pieza(c, r).x as number))
    expect(pieza(c, 'C1').x as number).toBeGreaterThan(maxPadre)
  })
  it('avisa si falta el archivo de la hoja', () => {
    const sin = leer('padre.kicad_sch')
    expect(sin.piezas.map((p) => p.ref).sort()).toEqual(['R1', 'R2'])
    expect(sin.avisos.join(' ')).toMatch(/hoja «Filtro» \(hijo\.kicad_sch\) no se encontró/)
  })
})

describe('rotaciones y espejos', () => {
  const c = leer('rotaciones.kicad_sch')
  const rel = (ref: string, n: string): [number, number] => {
    const p = pieza(c, ref)
    const q = pin(c, ref, n)
    return [Math.round(((q.x as number) - (p.x as number)) * 100) / 100, Math.round(((q.y as number) - (p.y as number)) * 100) / 100]
  }
  const esperado: Record<string, [number, number][]> = {
    T0: [[-5.08, 0], [2.54, -5.08], [2.54, 5.08]],
    T90: [[0, 5.08], [-5.08, -2.54], [5.08, -2.54]],
    T180: [[5.08, 0], [-2.54, 5.08], [-2.54, -5.08]],
    T270: [[0, -5.08], [5.08, 2.54], [-5.08, 2.54]],
    TMX: [[-5.08, 0], [2.54, 5.08], [2.54, -5.08]],
    TMY: [[5.08, 0], [-2.54, -5.08], [-2.54, 5.08]],
    T270MX: [[0, 5.08], [5.08, -2.54], [-5.08, -2.54]]
  }
  for (const [ref, pines] of Object.entries(esperado))
    it(`${ref}: los tres pines caen donde KiCad los pinta`, () => {
      expect(['1', '2', '3'].map((n) => rel(ref, n))).toEqual(pines)
    })
  it('guarda el giro de cada símbolo', () => {
    expect([0, 90, 180, 270].map((g) => pieza(c, g === 0 ? 'T0' : `T${g}`).giro)).toEqual([0, 90, 180, 270])
  })
  it('colocarPunto no deja ceros negativos', () => {
    expect(Object.is(colocarPunto(0, 0, 180, true, true)[0], 0)).toBe(true)
  })
})

describe('entradas inválidas', () => {
  it('rechaza un archivo que no es un esquema', () => {
    expect(() => leerKicad('(otra_cosa (version 1))', 'x')).toThrow(/kicad_sch/)
  })
  it('avisa si la versión es anterior a KiCad 7 o no se declara y sigue leyendo', () => {
    expect(leerKicad('(kicad_sch (version 20211123))', 'x').avisos[0]).toMatch(/anterior a KiCad 7/)
    expect(leerKicad('(kicad_sch)', 'x').avisos[0]).toMatch(/no declara/)
  })
  it('avisa si el símbolo no está en la librería incrustada', () => {
    const c = leerKicad('(kicad_sch (version 20250114) (symbol (lib_id "X:Y") (at 0 0 0) (property "Reference" "U1") (property "Value" "Y")))', 'x')
    expect(c.piezas).toHaveLength(1)
    expect(c.avisos.join(' ')).toMatch(/«X:Y» \(U1\) no está en la librería/)
  })
  it('un símbolo extends hereda los pines de su padre', () => {
    const t = `(kicad_sch (version 20250114)
      (lib_symbols
        (symbol "L:Base" (symbol "Base_1_1" (pin passive line (at 0 2.54 270) (length 1) (name "a") (number "1"))))
        (symbol "L:Hijo" (extends "Base")))
      (symbol (lib_id "L:Hijo") (at 10 10 0) (unit 1) (property "Reference" "U1") (property "Value" "H")))`
    const c = leerKicad(t, 'x')
    expect(c.piezas[0]!.pines).toMatchObject([{ numero: '1', nombre: 'a', x: 10, y: 7.46 }])
  })
  it('un bus se avisa y sus etiquetas con corchetes no forman red', () => {
    const t = '(kicad_sch (version 20250114) (bus (pts (xy 0 0) (xy 10 0))) (label "D[0..7]" (at 0 0 0)))'
    const c = leerKicad(t, 'x')
    expect(c.avisos.join(' ')).toMatch(/bus/)
    expect(c.redes).toEqual([])
  })
})

describe('hojas repetidas en cada nivel', () => {
  // Cada nivel cita 20 veces al siguiente: sin tope, aplanar crecería de forma exponencial.
  const hoja = (siguiente: string | null, n: number): string => {
    const hojas = siguiente
      ? Array.from({ length: n }, (_, i) => `(sheet (at ${i * 40} 0) (size 30 15) (uuid "s${i}") (property "Sheetname" "H${i}" (at 0 0 0)) (property "Sheetfile" "${siguiente}" (at 0 0 0)))`).join('\n')
      : ''
    return `(kicad_sch (version 20250114) (generator "eeschema") (uuid "u") (paper "A4") (lib_symbols) ${hojas})`
  }
  it('se omiten las instancias que pasan del máximo y se avisa', () => {
    const hojas = { 'a.kicad_sch': hoja('b.kicad_sch', 20), 'b.kicad_sch': hoja('c.kicad_sch', 20), 'c.kicad_sch': hoja(null, 0) }
    const t0 = performance.now()
    const c = leerKicad(hoja('a.kicad_sch', 20), 'raiz', hojas)
    expect(performance.now() - t0).toBeLessThan(5000)
    expect(c.avisos.some((a) => a.includes(String(MAX_INSTANCIAS_HOJA)))).toBe(true)
  })
})

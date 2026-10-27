import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { pathToFileURL } from 'node:url'
import type { NucleoMsi } from '../netlistMotor'
import { generarSintesis, sintetizarLut, sintetizarMsi, type ParamsLut, type ParamsMsi } from './sintesis'

const { expandirGenerados } = (await import(pathToFileURL(join(import.meta.dirname, '../../../scripts/referencias-ngspice.mjs')).href)) as { expandirGenerados(texto: string): string }

const texto = (s: { modelos: string[]; lineas: string[] }): string => [...s.modelos, ...s.lineas].join('\n')
const cuenta = (t: string, patron: RegExp): number => (t.match(patron) ?? []).length

describe('LUT', () => {
  it('pasa las entradas en orden inverso a la d_genlut y deja la tabla en el orden del índice', () => {
    // Fila 1 es (a=0, b=1): en la d_genlut la primera entrada es el bit bajo, así que b va primero y la fila sigue siendo la 1.
    const t = texto(sintetizarLut('u3', { comunes: [], rebanadas: [{ entradas: ['da', 'db'], salidas: ['dy'] }], tabla: [0, 1, 0, 0], retardos: [[1e-8, 1e-8]] }))
    expect(t).toMatch(/\[db da\] \[u3n\d+\]/)
    expect(t).toContain('table_values "0100"')
  })

  it('pone las comunes después de las entradas de la rebanada, también en orden inverso', () => {
    const t = texto(sintetizarLut('u3', { comunes: ['s', 'e'], rebanadas: [{ entradas: ['a', 'b'], salidas: ['y'] }], tabla: Array.from({ length: 16 }, (_, i) => (i ^ (i >> 1) ^ (i >> 2) ^ (i >> 3)) & 1), retardos: [[1e-8, 1e-8]] }))
    expect(t).toMatch(/\[b a e s\]/)
  })

  it('cada rebanada lleva su d_genlut y comparten el modelo', () => {
    const t = sintetizarLut('u3', { comunes: ['s'], rebanadas: [0, 1, 2].map((k) => ({ entradas: [`a${k}`], salidas: [`y${k}`] })), tabla: [0, 1, 1, 0], retardos: [[1e-8, 2e-8]] })
    expect(t.lineas.filter((l) => /\[a\d s\]/.test(l))).toHaveLength(3)
    expect(t.modelos.filter((m) => m.includes('d_genlut'))).toHaveLength(1)
  })

  it('un retardo inercial de subida y bajada por salida sigue a cada tabla', () => {
    const t = sintetizarLut('u3', { comunes: [], rebanadas: [{ entradas: ['a'], salidas: ['y'] }], tabla: [1, 0], retardos: [[1.2e-8, 1.8e-8]] })
    expect(t.modelos.join('\n')).toContain('d_buffer(rise_delay=1.1998e-8 fall_delay=1.7998e-8 inertial_delay=true)')
  })

  it('una salida que puede dar Z lleva dato y habilitación a un d_tristate', () => {
    const t = texto(sintetizarLut('u3', { comunes: ['oe'], rebanadas: [{ entradas: ['a'], salidas: ['y'] }], tabla: [0, 1, 2, 2], retardos: [[1e-8, 1e-8]] }))
    expect(t).toContain('d_tristate(delay=1e-12)')
    // El dato es 1 solo con oe = 0 y a = 1 (lee a y oe) y la habilitación es 1 con oe = 0 (lee solo oe).
    expect(t).toContain('table_values "0100"')
    expect(t).toContain('table_values "10"')
    expect(cuenta(t, /d_genlut/g)).toBe(2)
  })

  it('una salida abierta sin Z pasa por un d_open_c', () => {
    const t = texto(sintetizarLut('u3', { comunes: [], rebanadas: [{ entradas: ['a'], salidas: ['y'] }], tabla: [1, 0], retardos: [[1e-8, 1e-8]], abierta: [true] }))
    expect(t).toContain('d_open_c(')
    expect(t).not.toContain('d_tristate')
  })

  it('una salida lee solo las entradas de las que depende', () => {
    // Un transceptor: la salida A depende de DIR, OE y B, y la B de DIR, OE y A; ninguna lee su propia patilla.
    const Z = 2
    const tabla = Array.from({ length: 16 }, (_, i) => {
      const [dir, oe, a, b] = [(i >> 3) & 1, (i >> 2) & 1, (i >> 1) & 1, i & 1]
      return (!oe && !dir ? b : Z) + 4 * (!oe && dir ? a : Z)
    })
    const t = sintetizarLut('u3', { comunes: ['dir', 'oe'], rebanadas: [{ entradas: ['a', 'b'], salidas: ['a', 'b'] }], tabla, retardos: [[1e-8, 1e-8], [1e-8, 1e-8]] })
    // Las entradas van de la menos a la más significativa. La habilitación de cada lado lee DIR y OE y su dato, el lado contrario:
    // un lado en Z no vuelve desconocida la habilitación del otro.
    expect(t.lineas.filter((l) => /^au3c\d+ \[oe dir\] /.test(l))).toHaveLength(1)
    expect(t.lineas.filter((l) => /^au3c\d+ \[b oe dir\] /.test(l))).toHaveLength(1)
    expect(t.lineas.filter((l) => /^au3c\d+ \[a oe dir\] /.test(l))).toHaveLength(1)
    expect(t.lineas.filter((l) => /^au3c\d+ \[b a oe dir\] /.test(l))).toHaveLength(0)
  })

  it.each<[string, Partial<ParamsLut>]>([
    ['la tabla no tiene las filas del índice', { tabla: [0, 1, 1] }],
    ['una fila no es un entero', { tabla: [0, 1.5, 1, 0] }],
    ['faltan retardos', { retardos: [] }],
    ['un retardo no es positivo', { retardos: [[0, 1e-8]] }],
    ['las marcas de colector abierto no son una por salida', { abierta: [true, false] }]
  ])('rechaza que %s', (_, cambio) => {
    expect(() => sintetizarLut('u3', { comunes: [], rebanadas: [{ entradas: ['a', 'b'], salidas: ['y'] }], tabla: [0, 1, 1, 0], retardos: [[1e-8, 1e-8]], ...cambio })).toThrow()
  })
})

const bits = (n: number) => Array.from({ length: n }, (_, b) => ({ tipo: 'directa' as const, fuente: { bit: b } }))
const msi = (nucleo: NucleoMsi, entradas: string[], salidas: string[], resto: Partial<ParamsMsi> = {}): ParamsMsi => ({
  entradas,
  salidas,
  nucleo,
  de: bits(salidas.length),
  retardos: salidas.map(() => [1e-8, 1e-8]),
  ...resto
})

describe('MSI', () => {
  it('un contador lleva un d_dff por bit y el reloj efectivo entra como la Y de sus señales con su polaridad', () => {
    const t = texto(sintetizarMsi('u4', msi({ tipo: 'contador', bits: 4, modulo: 16, reloj: { senales: [{ entrada: 0 }, { entrada: 1, bajo: true }] } }, ['clk', 'inh'], ['q0', 'q1', 'q2', 'q3'])))
    expect(cuenta(t, /\.model \S+ d_dff/g)).toBe(1)
    // CLK y no INH: un inversor para INH y una Y de las dos.
    expect(t).toMatch(/^au4c\d+ inh u4n\d+ u4m\d+$/m)
    expect(t).toMatch(/^au4c\d+ \[clk u4n\d+\] u4n\d+ u4m\d+$/m)
    // Una celda de d_dff por bit: las que llevan el modelo de d_dff y seis redes.
    const modeloDff = /\.model (\S+) d_dff/.exec(t)![1]
    expect(cuenta(t, new RegExp(`^a\\S+ \\S+ \\S+ \\S+ \\S+ \\S+ \\S+ ${modeloDff}$`, 'gm'))).toBe(4)
  })

  it('el contador de dos relojes usa un d_srlatch para el sentido y el reloj de los dos en reposo', () => {
    const nucleo: NucleoMsi = { tipo: 'contador', bits: 4, modulo: 16, reloj: { senales: [{ entrada: 0 }] }, abajo: { senales: [{ entrada: 1 }] } }
    const t = texto(sintetizarMsi('u4', msi(nucleo, ['up', 'down'], ['q0', 'q1', 'q2', 'q3'])))
    expect(t).toContain('d_srlatch(')
    expect(cuenta(t, /d_and\(/g)).toBe(1)
  })

  it('un desplazamiento con almacén lleva dos bancos de biestables y el almacén toma el dato de la salida del principal', () => {
    const nucleo: NucleoMsi = { tipo: 'desplazamiento', bits: 8, reloj: { senales: [{ entrada: 0 }] }, serie: [{ entrada: 2 }], almacen: { senales: [{ entrada: 1 }] } }
    const t = texto(sintetizarMsi('u4', msi(nucleo, ['sr', 'rc', 'ser'], Array.from({ length: 8 }, (_, k) => `q${k}`))))
    const modeloDff = /\.model (\S+) d_dff/.exec(t)![1]
    expect(cuenta(t, new RegExp(` ${modeloDff}$`, 'gm'))).toBe(16)
  })

  it('el convertidor de aproximaciones queda con sus salidas fijas en el código pedido y sin biestables', () => {
    const nucleo: NucleoMsi = { tipo: 'aproximaciones', bits: 8, cs: { entrada: 0 }, wr: { entrada: 1 }, rd: { entrada: 2 }, comparador: 3, reloj: { tipo: 'interno', periodo: 1e-6 }, ciclos_inicio: 4, ciclos_bit: 8 }
    const t = texto(sintetizarMsi('u4', msi(nucleo, ['cs', 'wr', 'rd', 'cmp'], ['d0', 'd1'], { codigo: 0b10100101 })))
    expect(t).not.toContain('d_dff')
    // Los unos y los ceros del código son una red fija de cada nivel.
    expect(cuenta(t, /d_pullup/g)).toBe(1)
    expect(cuenta(t, /d_pulldown/g)).toBe(1)
  })

  it.each([
    ['una entrada que no existe', msi({ tipo: 'contador', bits: 2, modulo: 4, reloj: { senales: [{ entrada: 5 }] } }, ['clk'], ['q0', 'q1'])],
    ['un módulo mayor que 2^bits', msi({ tipo: 'contador', bits: 2, modulo: 5, reloj: { senales: [{ entrada: 0 }] } }, ['clk'], ['q0', 'q1'])],
    ['una salida de tabla sin tabla', msi({ tipo: 'contador', bits: 2, modulo: 4, reloj: { senales: [{ entrada: 0 }] } }, ['clk'], ['q0'], { de: [{ tipo: 'tabla', columna: 0 }], fuentes: [{ bit: 0 }] })],
    ['más de catorce fuentes', msi({ tipo: 'contador', bits: 2, modulo: 4, reloj: { senales: [{ entrada: 0 }] } }, ['clk'], ['q0'], { de: [{ tipo: 'tabla', columna: 0 }], fuentes: Array.from({ length: 15 }, () => ({ bit: 0 })), tabla: [] })]
  ])('rechaza %s', (_, params) => {
    expect(() => sintetizarMsi('u4', params)).toThrow()
  })

  it('dos corridas con lo mismo dan el mismo texto', () => {
    const p = msi({ tipo: 'contador', bits: 4, modulo: 10, reloj: { senales: [{ entrada: 0 }] }, borra: { senal: { entrada: 1, bajo: true }, sincrona: false } }, ['clk', 'clr'], ['q0', 'q1', 'q2', 'q3'])
    expect(texto(sintetizarMsi('u4', p))).toBe(texto(sintetizarMsi('u4', p)))
  })
})

describe('el generador compartido con scripts/referencias-ngspice.mjs', () => {
  it('un renglón *@generar de lut o msi se sustituye por el mismo texto que da el exportador', () => {
    const params = { comunes: [], rebanadas: [{ entradas: ['da'], salidas: ['dy'] }], tabla: [1, 0], retardos: [[1e-8, 1e-8]] }
    expect(expandirGenerados(`*@generar lut u1 ${JSON.stringify(params)}`)).toBe(generarSintesis('lut', 'u1', params))
    const nucleo = { tipo: 'contador', bits: 1, modulo: 2, reloj: { senales: [{ entrada: 0 }] } }
    const m = { entradas: ['clk'], salidas: ['q'], nucleo, de: [{ tipo: 'directa', fuente: { bit: 0 } }], retardos: [[1e-8, 1e-8]] }
    expect(expandirGenerados(`antes\n*@generar msi u2 ${JSON.stringify(m)}\ndespués`)).toBe(`antes\n${generarSintesis('msi', 'u2', m)}\ndespués`)
  })

  it('una clase sin generador se rechaza', () => {
    expect(() => generarSintesis('otra', 'u1', {})).toThrow(/otra/)
  })
})

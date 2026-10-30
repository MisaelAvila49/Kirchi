import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { decodificarTexto } from '../detectar'
import { claseDe } from '../familias'
import { leerLtspice } from './ltspice'
import { pinesColocados, simboloLtspice, transformar } from './ltspiceSimbolos'

const bytes = (n: string) => new Uint8Array(readFileSync(join(__dirname, '..', '__fixtures__', 'ltspice', n)))
const leer = (n: string) => leerLtspice(decodificarTexto(bytes(n)), n)
type C = ReturnType<typeof leerLtspice>
const pieza = (c: C, ref: string) => c.piezas.find((p) => p.ref === ref)!
const red = (c: C, ref: string, pin: string) => c.redes.find((r) => r.pines.some((q) => q.ref === ref && q.pin === pin))
const mismaRed = (c: C, a: [string, string], b: [string, string]) => red(c, ...a) !== undefined && red(c, ...a) === red(c, ...b)

describe('divisor.asc', () => {
  const c = leer('divisor.asc')
  it('lee piezas, valores, giro y pines absolutos', () => {
    expect(c.formato).toBe('ltspice')
    expect(c.version).toBe('4')
    expect(c.piezas.map((p) => p.ref)).toEqual(['V1', 'R1', 'R2'])
    expect(pieza(c, 'R1')).toMatchObject({ tipo: 'res', valor: '10k', x: 192, y: 64, giro: 270 })
    expect(pieza(c, 'R1').pines.map((p) => [p.x, p.y])).toEqual([[176, 80], [96, 80]])
    expect(pieza(c, 'R2').pines.map((p) => [p.x, p.y])).toEqual([[176, 112], [176, 192]])
    expect(pieza(c, 'V1').pines).toMatchObject([{ nombre: '+', x: 64, y: 80 }, { nombre: '−', x: 64, y: 160 }])
  })
  it('une por cables, nombra con FLAG y da 0 a la tierra', () => {
    expect(mismaRed(c, ['V1', '1'], ['R1', '2'])).toBe(true)
    expect(red(c, 'R1', '1')!.nombre).toBe('out')
    expect(mismaRed(c, ['R1', '1'], ['R2', '1'])).toBe(true)
    const t = red(c, 'R2', '2')!
    expect(t.nombre).toBe('0')
    expect(t.pines.map((p) => p.ref).sort()).toEqual(['R2', 'V1'])
    expect(red(c, 'V1', '1')!.nombre).toMatch(/^N\d{3}$/)
  })
  it('guarda cables, etiquetas y tierra en el dibujo y pasa la directiva al lector SPICE', () => {
    expect(c.dibujo!.cables).toHaveLength(4)
    expect(c.dibujo!.etiquetas).toEqual([{ nombre: 'out', x: 176, y: 112 }])
    expect(c.dibujo!.terminales).toEqual([{ nombre: '0', tipo: 'tierra', x: 64, y: 192 }])
    expect(c.directivas).toEqual([{ tipo: 'analisis', analisis: 'op', parametros: {}, trazas: [] }])
    expect(c.avisos).toEqual([])
  })
  it('las clases salen del nombre del símbolo', () => {
    expect(claseDe('ltspice', pieza(c, 'R1'))).toBe('resistencia')
    expect(claseDe('ltspice', pieza(c, 'V1'))).toBe('fuente-voltaje')
  })
})

describe('divisor-utf16.asc', () => {
  it('lee igual un archivo UTF-16 LE con BOM', () => {
    const b = bytes('divisor-utf16.asc')
    expect([b[0], b[1]]).toEqual([0xff, 0xfe])
    const a = leer('divisor-utf16.asc')
    const base = leer('divisor.asc')
    expect(a.piezas).toEqual(base.piezas)
    expect(a.redes).toEqual(base.redes)
  })
})

describe('rc.asc', () => {
  const c = leer('rc.asc')
  it('lee un archivo con CRLF, WINDOW y un valor con micro', () => {
    expect(pieza(c, 'C1')).toMatchObject({ tipo: 'cap', valor: '1µ' })
    expect(mismaRed(c, ['R1', '1'], ['C1', '1'])).toBe(true)
    expect(red(c, 'C1', '2')!.nombre).toBe('0')
  })
  it('la fuente PULSE da su generador sobre la red del positivo', () => {
    expect(c.instrumentos).toEqual([
      { tipo: 'generador', forma: 'pulso', nombre: 'V1', red: red(c, 'V1', '1')!.nombre, referencia: '0', parametros: { v1: 0, v2: 5, td: 0, tr: 1e-6, tf: 1e-6, pw: 5e-3, per: 1e-2 } }
    ])
  })
  it('lee .tran y deja el comentario como texto del dibujo', () => {
    expect(c.directivas).toEqual([{ tipo: 'analisis', analisis: 'tran', parametros: { fin: 0.02 }, trazas: [] }])
    expect(c.dibujo!.textos).toEqual([{ texto: 'Carga de un RC', x: 40, y: 256 }])
  })
})

describe('inversor.asc', () => {
  const c = leer('inversor.asc')
  it('el símbolo de la carpeta Opamps conserva su nombre y trae cinco pines', () => {
    expect(pieza(c, 'U1').tipo).toBe('Opamps/UniversalOpamp2')
    expect(claseDe('ltspice', pieza(c, 'U1'))).toBe('amp-op')
    expect(pieza(c, 'U1').pines.map((p) => [p.nombre, p.x, p.y])).toEqual([
      ['In+', 224, 112], ['In−', 224, 144], ['V+', 256, 160], ['V−', 256, 96], ['OUT', 288, 128]
    ])
  })
  it('conecta entrada inversora, realimentación y salida', () => {
    expect(red(c, 'U1', '1')!.nombre).toBe('0')
    expect(mismaRed(c, ['U1', '2'], ['Rin', '1'])).toBe(true)
    expect(mismaRed(c, ['U1', '2'], ['Rf', '2'])).toBe(true)
    expect(red(c, 'U1', '5')!.nombre).toBe('out')
    expect(mismaRed(c, ['U1', '5'], ['Rf', '1'])).toBe(true)
    expect(mismaRed(c, ['V1', '1'], ['Rin', '2'])).toBe(true)
    expect(mismaRed(c, ['U1', '2'], ['Rf', '1'])).toBe(false)
  })
  it('SINE da un generador senoidal y el \\n literal separa dos directivas', () => {
    expect(c.instrumentos).toContainEqual({ tipo: 'generador', forma: 'senoidal', nombre: 'V1', red: red(c, 'V1', '1')!.nombre, referencia: '0', parametros: { vo: 0, va: 1, freq: 1000 } })
    expect(c.directivas.map((d) => (d.tipo === 'analisis' ? d.analisis : d.tipo))).toEqual(['tran', 'ac'])
  })
})

describe('npn.asc', () => {
  const c = leer('npn.asc')
  it('toma el modelo del Value y lo cruza con el .model del texto', () => {
    expect(pieza(c, 'Q1')).toMatchObject({ tipo: 'npn', modelo: '2N3904' })
    expect(pieza(c, 'Q1').valor).toBeUndefined()
    expect(c.directivas).toContainEqual({ tipo: 'modelo', nombre: '2N3904', clase: 'npn', parametros: { is: 6.7e-15, bf: 416, vaf: 74 } })
    expect(c.directivas).toContainEqual(expect.objectContaining({ tipo: 'analisis', analisis: 'dc' }))
  })
  it('colector, base y emisor caen en sus redes', () => {
    expect(pieza(c, 'Q1').pines.map((p) => [p.nombre, p.x, p.y])).toEqual([['C', 256, 96], ['B', 192, 144], ['E', 256, 192]])
    expect(mismaRed(c, ['Q1', '1'], ['RC', '2'])).toBe(true)
    expect(mismaRed(c, ['Q1', '2'], ['RB', '1'])).toBe(true)
    expect(red(c, 'Q1', '3')!.nombre).toBe('0')
    expect(red(c, 'RC', '1')!.nombre).toBe('vcc')
    expect(mismaRed(c, ['RC', '1'], ['V1', '1'])).toBe(true)
  })
})

describe('ne555.asc', () => {
  const c = leer('ne555.asc')
  it('conecta GND, OUT, VCC y DIS por sus posiciones medidas y se clasifica como 555', () => {
    expect(pieza(c, 'U1').pines).toHaveLength(8)
    expect(red(c, 'U1', '1')!.nombre).toBe('0')
    expect(red(c, 'U1', '3')!.nombre).toBe('Vout')
    expect(red(c, 'U1', '8')!.nombre).toBe('Vcc')
    expect(red(c, 'U1', '7')!.nombre).toBe('Descarga')
    expect(claseDe('ltspice', pieza(c, 'U1'))).toBe('temporizador-555')
    expect(c.avisos).toEqual([])
  })
})

describe('desconocido.asc', () => {
  const c = leer('desconocido.asc')
  it('un símbolo sin tabla queda sin pines y con aviso', () => {
    expect(pieza(c, 'U1').pines).toEqual([])
    expect(pieza(c, 'U1').tipo).toBe('Misc/Foo555')
    expect(c.avisos.some((a) => a.includes('Misc/Foo555') && a.includes('sin conexiones'))).toBe(true)
  })
  it('no inventa conexiones a un cable que termina cerca ni cuenta el IOPIN como pin', () => {
    expect(c.redes.flatMap((r) => r.pines).some((p) => p.ref === 'U1')).toBe(false)
    expect(c.dibujo!.terminales).toContainEqual({ nombre: 'In', tipo: 'entrada', x: 112, y: 80 })
  })
})

describe('redes', () => {
  const base = (cuerpo: string) => leerLtspice(`Version 4\nSHEET 1 880 680\n${cuerpo}`, 'x.asc')
  it('un pin sobre el interior de un cable se une a él', () => {
    // R1 queda con su pin 1 en (16,16) = (16,16); el cable vertical pasa por encima.
    const c = base('WIRE 16 -32 16 64\nWIRE 16 64 80 64\nSYMBOL res 0 0 R0\nSYMATTR InstName R1\nSYMBOL res 64 48 R0\nSYMATTR InstName R2\n')
    expect(mismaRed(c, ['R1', '1'], ['R2', '1'])).toBe(true)
    expect(c.redes).toHaveLength(1)
  })
  it('un extremo de cable sobre el interior de otro lo une', () => {
    const c = base('WIRE 0 16 100 16\nWIRE 50 16 50 96\nSYMBOL res -16 0 R0\nSYMATTR InstName R1\nSYMBOL res 34 0 R0\nSYMATTR InstName R2\n')
    expect(mismaRed(c, ['R1', '1'], ['R2', '1'])).toBe(true)
  })
  it('dos FLAG con el mismo nombre unen redes separadas', () => {
    const c = base('WIRE 16 16 16 -16\nFLAG 16 -16 a\nWIRE 116 16 116 -16\nFLAG 116 -16 a\nSYMBOL res 0 0 R0\nSYMATTR InstName R1\nSYMBOL res 100 0 R0\nSYMATTR InstName R2\n')
    expect(mismaRed(c, ['R1', '1'], ['R2', '1'])).toBe(true)
    expect(red(c, 'R1', '1')!.nombre).toBe('a')
  })
  it('cables que se cruzan sin extremo en común no se unen', () => {
    const c = base('WIRE 0 16 100 16\nWIRE 50 -20 50 100\nSYMBOL res -16 0 R0\nSYMATTR InstName R1\nSYMBOL res 34 80 R0\nSYMATTR InstName R2\n')
    // El segundo cable atraviesa el primero en (50,16) y su extremo no cae en él: son redes distintas.
    expect(mismaRed(c, ['R1', '1'], ['R2', '1'])).toBe(false)
  })
})

describe('SYMATTR', () => {
  it('SpiceModel manda sobre el Value, Value2 y SpiceLine van a props y un amp-op con nombre de parte usa la parte como modelo', () => {
    const c = leerLtspice('Version 4\nSHEET 1 880 680\nSYMBOL diode 0 0 R0\nSYMATTR InstName D1\nSYMATTR Value D\nSYMATTR SpiceModel "1N4148"\nSYMBOL res 100 0 R0\nSYMATTR InstName R1\nSYMATTR Value 1k\nSYMATTR Value2 tol=1\nSYMATTR SpiceLine Rser=0.1\nSYMBOL Opamps\\\\LT1001 200 0 R0\nSYMATTR InstName U1\n', 'x.asc')
    expect(pieza(c, 'D1').modelo).toBe('1N4148')
    expect(pieza(c, 'R1').props).toEqual({ value2: 'tol=1', spiceLine: 'Rser=0.1' })
    expect(pieza(c, 'U1')).toMatchObject({ tipo: 'Opamps/LT1001', modelo: 'LT1001' })
    expect(pieza(c, 'U1').pines).toHaveLength(5)
  })
})

describe('tabla de símbolos', () => {
  const en = (nombre: string, giro: 0 | 90 | 180 | 270, espejo = false) =>
    pinesColocados(simboloLtspice(nombre)!, 1000, 2000, giro, espejo).map((p) => [(p.x as number) - 1000, (p.y as number) - 2000])

  it('transformar: R90 lleva +X hacia abajo, R180 invierte, R270 hacia arriba, M gira y luego espeja en X', () => {
    expect(transformar(10, 0, 90, false)).toEqual([0, 10])
    expect(transformar(10, 0, 180, false)).toEqual([-10, 0])
    expect(transformar(10, 0, 270, false)).toEqual([0, -10])
    expect(transformar(10, 4, 0, true)).toEqual([-10, 4])
    expect(transformar(10, 4, 180, true)).toEqual([10, -4])
    expect(transformar(10, 4, 90, true)).toEqual([4, 10])
  })
  it('res en los cuatro giros y espejada (calculado a mano)', () => {
    expect(en('res', 0)).toEqual([[16, 16], [16, 96]])
    expect(en('res', 90)).toEqual([[-16, 16], [-96, 16]])
    expect(en('res', 180)).toEqual([[-16, -16], [-16, -96]])
    expect(en('res', 270)).toEqual([[16, -16], [96, -16]])
    expect(en('res', 0, true)).toEqual([[-16, 16], [-16, 96]])
    expect(en('res', 90, true)).toEqual([[16, 16], [96, 16]])
    expect(en('res', 270, true)).toEqual([[-16, -16], [-96, -16]])
  })
  it('npn y pnp: el pnp trae el colector abajo', () => {
    expect(en('npn', 0)).toEqual([[64, 0], [0, 48], [64, 96]])
    expect(en('pnp', 0)).toEqual([[64, 96], [0, 48], [64, 0]])
    expect(en('npn', 90)).toEqual([[0, 64], [-48, 0], [-96, 64]])
    expect(en('pnp', 180, true)).toEqual([[64, -96], [0, -48], [64, 0]])
  })
  it('cada símbolo de la tabla da pines distintos en los cuatro giros y el espejo', () => {
    const nombres = ['res', 'cap', 'polcap', 'ind', 'ind2', 'diode', 'zener', 'LED', 'schottky', 'varactor', 'npn', 'pnp', 'npn2', 'pnp2', 'nmos', 'pmos', 'nmos4', 'pmos4', 'njf', 'pjf', 'voltage', 'current', 'bv', 'bi', 'e', 'e2', 'f', 'g', 'g2', 'h', 'sw', 'csw', 'Opamps/opamp', 'Opamps/opamp2', 'Opamps/UniversalOpamp2', 'Opamps/LT1001']
    for (const n of nombres) {
      const s = simboloLtspice(n)
      expect(s, n).toBeDefined()
      for (const [g, m] of [[0, false], [90, false], [180, false], [270, false], [0, true]] as const) {
        const claves = en(n, g, m).map((p) => p.join(','))
        expect(new Set(claves).size, `${n} ${g} ${m}`).toBe(s!.pines.length)
      }
    }
  })
  it('amp-op: In+ arriba del In−, V+ arriba y OUT a la derecha; el UniversalOpamp2 lleva In− arriba', () => {
    expect(en('Opamps/opamp', 0)).toEqual([[-32, 48], [-32, 80], [0, 32], [0, 96], [32, 64]])
    expect(en('Opamps\\\\LM741', 0)).toEqual(en('Opamps/opamp', 0))
    expect(en('Opamps/UniversalOpamp2', 0)).toEqual([[-32, 16], [-32, -16], [0, -32], [0, 32], [32, 0]])
  })
  it('mosfet: el nmos tiene el drenaje arriba y el pmos la fuente arriba', () => {
    expect(en('nmos', 0)).toEqual([[48, 0], [0, 80], [48, 96]])
    expect(en('pmos', 0)).toEqual([[48, 96], [0, 80], [48, 0]])
    expect(en('nmos4', 0)).toEqual([[48, 0], [0, 80], [48, 96], [48, 48]])
  })
  it('un símbolo fuera de la tabla no existe', () => {
    expect(simboloLtspice('Misc/Foo555')).toBeUndefined()
  })
  it('NE555: ocho pines en el orden del patillaje, tres a cada lado más los extremos', () => {
    expect(en('Misc/NE555', 0)).toEqual([[-112, -96], [-112, -32], [-112, 32], [-112, 96], [112, 96], [112, 32], [112, -32], [112, -96]])
  })
})

// Espera KIRCHI_LOTE_IMPORTAR con lote/ltspice; sin la variable se omite.
const LOTE = process.env.KIRCHI_LOTE_IMPORTAR ? join(process.env.KIRCHI_LOTE_IMPORTAR, 'lote', 'ltspice') : ''
describe.skipIf(LOTE === '' || !existsSync(LOTE))('lote de esquemas reales', () => {
  const archivos = LOTE !== '' && existsSync(LOTE) ? readdirSync(LOTE).filter((f) => f.endsWith('.asc')) : []
  it('ninguno lanza excepción y los símbolos comunes no quedan con pines sueltos', () => {
    let sueltos = 0
    let conPines = 0
    const desconocidos = new Map<string, number>()
    const sinConectar = new Map<string, number>()
    for (const f of archivos) {
      const c = leerLtspice(decodificarTexto(new Uint8Array(readFileSync(join(LOTE, f)))), f)
      const conectados = new Set(c.redes.flatMap((r) => r.pines.map((p) => `${p.ref}/${p.pin}`)))
      for (const p of c.piezas) {
        if (p.pines.length === 0) desconocidos.set(p.tipo, (desconocidos.get(p.tipo) ?? 0) + 1)
        for (const pin of p.pines) {
          conPines++
          if (!conectados.has(`${p.ref}/${pin.numero}`)) {
            sueltos++
            sinConectar.set(p.tipo, (sinConectar.get(p.tipo) ?? 0) + 1)
          }
        }
      }
    }
    const lista = (m: Map<string, number>) => [...m].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(' ')
    process.stdout.write(`\n[lote ltspice] ${archivos.length} archivos, ${conPines} pines, ${sueltos} sin red.\n  sin red por símbolo: ${lista(sinConectar)}\n  desconocidos: ${lista(desconocidos)}\n`)
    expect(archivos.length).toBeGreaterThan(0)
    // Un pin suelto es normal (alimentación de un amp-op sin cablear); más de un 5 % indica una fila mal medida.
    expect(sueltos / conPines).toBeLessThan(0.05)
  })
})

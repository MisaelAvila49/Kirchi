import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { decodificarTexto } from '../detectar'
import { claseDe } from '../familias'
import { leerFalstad } from './falstad'

const leer = (n: string) => leerFalstad(readFileSync(join(__dirname, '..', '__fixtures__', 'falstad', n), 'utf8'), n)
type C = ReturnType<typeof leerFalstad>
const pieza = (c: C, ref: string) => c.piezas.find((p) => p.ref === ref)!
const red = (c: C, ref: string, pin: string) => c.redes.find((r) => r.pines.some((q) => q.ref === ref && q.pin === pin))!
const mismaRed = (c: C, a: [string, string], b: [string, string]) => red(c, ...a) === red(c, ...b)

describe('divisor.txt', () => {
  const c = leer('divisor.txt')
  it('lee piezas con referencias por prefijo, valores y geometría', () => {
    expect(c.formato).toBe('falstad')
    expect(c.unidadesPorMm).toBeCloseTo(6.4, 5)
    expect(c.piezas.map((p) => p.ref)).toEqual(['V1', 'GND1', 'R1', 'R2'])
    expect(pieza(c, 'R1')).toMatchObject({ tipo: 'r', valor: '10000', x: 192, y: 152, giro: 270 })
    expect(pieza(c, 'R1').pines.map((p) => [p.x, p.y])).toEqual([[192, 112], [192, 192]])
  })
  it('la fuente tiene el positivo en el segundo extremo', () => {
    expect(pieza(c, 'V1').pines).toMatchObject([{ nombre: '+', x: 96, y: 112 }, { nombre: '−', x: 96, y: 256 }])
    expect(pieza(c, 'V1').valor).toBe('12')
  })
  it('forma redes por puntos coincidentes y da 0 a la tierra', () => {
    expect(red(c, 'V1', '1').pines).toEqual([{ ref: 'V1', pin: '1' }, { ref: 'R1', pin: '1' }])
    expect(red(c, 'R1', '2').pines).toEqual([{ ref: 'R1', pin: '2' }, { ref: 'R2', pin: '1' }])
    const t = red(c, 'GND1', '1')
    expect(t.nombre).toBe('0')
    expect(t.pines.map((p) => p.ref).sort()).toEqual(['GND1', 'R2', 'V1'])
  })
  it('guarda cables y textos en el dibujo y no deja avisos ni instrumentos', () => {
    expect(c.dibujo!.cables).toHaveLength(3)
    expect(c.dibujo!.textos).toEqual([{ texto: 'Vout', x: 210, y: 190 }])
    expect(c.instrumentos).toEqual([])
    expect(c.directivas).toEqual([])
    expect(c.avisos).toEqual([])
  })
})

describe('rc.txt', () => {
  const c = leer('rc.txt')
  it('lee interruptor, capacitor y fuente cuadrada con su generador', () => {
    expect(pieza(c, 'SW1').props.cerrado).toBe('1')
    expect(pieza(c, 'C1')).toMatchObject({ valor: '0.000001', props: { vInicial: '0' } })
    expect(pieza(c, 'V1').props).toMatchObject({ forma: 'cuadrada', frecuencia: '100', offset: '2.5', ciclo: '0.5' })
    expect(c.instrumentos).toContainEqual({
      tipo: 'generador', forma: 'otra', nombre: 'V1', red: red(c, 'V1', '1').nombre, referencia: '0',
      parametros: { forma: 'cuadrada', frecuencia: 100, amplitud: 5, offset: 2.5, fase: 0, ciclo: 0.5 }
    })
  })
  it('la marca O es una sonda de voltaje en la red del capacitor', () => {
    expect(c.instrumentos).toContainEqual({ tipo: 'sonda', magnitud: 'voltaje', nombre: 'S1', red: red(c, 'C1', '1').nombre, x: 256, y: 112 })
  })
  it('un osciloscopio sobre el capacitor propone un análisis transitorio', () => {
    expect(c.instrumentos.find((i) => i.tipo === 'virtual')).toMatchObject({ clase: 'osciloscopio', redes: [red(c, 'C1', '1').nombre] })
    expect(c.directivas).toEqual([{ tipo: 'analisis', analisis: 'tran', parametros: { paso: 5e-6, fin: 5e-3 }, trazas: [red(c, 'C1', '1').nombre] }])
  })
})

describe('inversor.txt', () => {
  const c = leer('inversor.txt')
  it('calcula los pines del amp-op desde la geometría', () => {
    expect(pieza(c, 'U1').pines).toMatchObject([
      { nombre: '-', x: 192, y: 160 }, { nombre: '+', x: 192, y: 192 }, { nombre: 'salida', x: 336, y: 176 }
    ])
    expect(claseDe('falstad', pieza(c, 'U1'))).toBe('amp-op')
  })
  it('une la entrada inversora con el resistor, el positivo con tierra y la salida con la realimentación', () => {
    expect(mismaRed(c, ['U1', '1'], ['R1', '2'])).toBe(true)
    expect(mismaRed(c, ['U1', '1'], ['R2', '1'])).toBe(true)
    expect(red(c, 'U1', '2').nombre).toBe('0')
    expect(mismaRed(c, ['U1', '3'], ['R2', '2'])).toBe(true)
  })
  it('la fuente senoidal da un generador', () => {
    expect(c.instrumentos[0]).toMatchObject({ tipo: 'generador', forma: 'senoidal', nombre: 'V1', parametros: { frecuencia: 1000, amplitud: 1 } })
  })
})

describe('led-npn.txt', () => {
  const c = leer('led-npn.txt')
  it('ubica colector, base y emisor del NPN', () => {
    expect(pieza(c, 'Q1').pines).toMatchObject([
      { nombre: 'C', x: 272, y: 224 }, { nombre: 'B', x: 224, y: 240 }, { nombre: 'E', x: 272, y: 256 }
    ])
    expect(claseDe('falstad', pieza(c, 'Q1'))).toBe('npn')
    expect(pieza(c, 'Q1').props.beta).toBe('100')
  })
  it('conecta el LED al colector y el emisor a tierra', () => {
    expect(pieza(c, 'LED1').pines.map((p) => p.nombre)).toEqual(['A', 'K'])
    expect(mismaRed(c, ['LED1', '2'], ['Q1', '1'])).toBe(true)
    expect(red(c, 'Q1', '3').nombre).toBe('0')
  })
  it('los rieles son piezas de un terminal y alimentaciones en el dibujo', () => {
    expect(pieza(c, 'V1')).toMatchObject({ tipo: 'R', valor: '5' })
    expect(pieza(c, 'V1').pines).toHaveLength(1)
    expect(c.dibujo!.terminales).toMatchObject([{ nombre: '5V', tipo: 'alimentacion' }, { nombre: '3V' }])
  })
})

describe('transistores de polaridad contraria', () => {
  it('el PNP pone el colector del otro lado', () => {
    const c = leerFalstad('$ 1 5e-6 10 50 5\nt 272 176 320 176 0 -1 1.3 -0.7 100\n', 'pnp')
    expect(pieza(c, 'Q1').pines).toMatchObject([{ nombre: 'C', x: 320, y: 192 }, { nombre: 'B', x: 272, y: 176 }, { nombre: 'E', x: 320, y: 160 }])
    expect(claseDe('falstad', pieza(c, 'Q1'))).toBe('pnp')
  })
  it('los MOSFET dan D, G, S y el canal P cambia fuente y drenaje de lugar', () => {
    const n = leerFalstad('$ 1 5e-6 10 50 5\nf 304 240 352 240 32 1.5 0.02\n', 'n')
    expect(pieza(n, 'M1').pines).toMatchObject([{ nombre: 'D', x: 352, y: 224 }, { nombre: 'G', x: 304, y: 240 }, { nombre: 'S', x: 352, y: 256 }])
    expect(claseDe('falstad', pieza(n, 'M1'))).toBe('nmos')
    const p = leerFalstad('$ 1 5e-6 10 50 5\nf 208 176 272 176 1\n', 'p')
    expect(pieza(p, 'M1').pines).toMatchObject([{ nombre: 'D', x: 272, y: 192 }, { nombre: 'G' }, { nombre: 'S', x: 272, y: 160 }])
    expect(claseDe('falstad', pieza(p, 'M1'))).toBe('pmos')
  })
  it('el JFET es D, G, S', () => {
    const j = leerFalstad('$ 1 5e-6 10 50 5\nj 224 208 272 208 0\n', 'j')
    expect(pieza(j, 'J1').pines).toMatchObject([{ nombre: 'D', x: 272, y: 192 }, { nombre: 'G' }, { nombre: 'S', x: 272, y: 224 }])
    expect(claseDe('falstad', pieza(j, 'J1'))).toBe('njf')
  })
})

describe('osciloscopio.txt', () => {
  const c = leer('osciloscopio.txt')
  it('junta las dos trazas en un solo osciloscopio virtual', () => {
    const o = c.instrumentos.filter((i) => i.tipo === 'virtual')
    expect(o).toHaveLength(1)
    expect(o[0]).toMatchObject({ clase: 'osciloscopio', redes: [red(c, 'R1', '1').nombre, red(c, 'R1', '2').nombre] })
  })
  it('sin osciloscopio no se propone análisis', () => {
    expect(leer('divisor.txt').directivas).toEqual([])
  })
  it('avisa si el osciloscopio apunta a un elemento que no existe', () => {
    const r = leerFalstad('$ 1 5e-6 10 50 5\nr 0 0 16 0 0 100\no 9 64 0 2 5 0.1\n', 'x')
    expect(r.avisos[0]).toMatch(/^Línea 3: .*elemento 9/)
  })
})

describe('desconocido.txt', () => {
  const c = leer('desconocido.txt')
  it('guarda el elemento ajeno como pieza de dos pines con aviso y número de línea', () => {
    const p = pieza(c, 'X1')
    expect(p).toMatchObject({ tipo: '370', props: { parametros: '3 4.5' } })
    expect(p.pines).toMatchObject([{ numero: '1', x: 192, y: 112 }, { numero: '2', x: 192, y: 192 }])
    expect(c.avisos).toEqual(['Línea 5: el elemento «370» no se reconoce y se guardó como pieza genérica.'])
    expect(claseDe('falstad', p)).toBeNull()
  })
})

describe('sobre-cable.txt', () => {
  const c = leer('sobre-cable.txt')
  it('un extremo sobre el interior de un cable recto se une a él', () => {
    expect(mismaRed(c, ['R1', '1'], ['V1', '1'])).toBe(true)
    expect(mismaRed(c, ['R1', '1'], ['R2', '1'])).toBe(true)
  })
  it('también un cable que termina en el interior de otro', () => {
    expect(red(c, 'R1', '2').nombre).toBe('0')
  })
  it('marca las uniones del dibujo', () => {
    expect(c.dibujo!.uniones).toEqual(expect.arrayContaining([{ x: 160, y: 112 }, { x: 160, y: 256 }]))
  })
})

describe('deslizadores', () => {
  it('anota el rango del deslizador conocido en la pieza', () => {
    const c = leerFalstad('$ 1 5e-6 10 50 5\nv 0 0 0 64 0 5 100 5 0 0 0.5\n38 0 5 0 100 Duty\\sCycle\n', 'x')
    expect(pieza(c, 'V1').props['deslizador Duty Cycle']).toBe('0 a 100')
    expect(c.avisos).toEqual([])
  })
  it('avisa si el deslizador apunta a algo que no es pieza', () => {
    const c = leerFalstad('$ 1 5e-6 10 50 5\nw 0 0 16 0 0\n38 0 5 0 100 Duty\n', 'x')
    expect(c.avisos[0]).toMatch(/^Línea 3:/)
  })
})

describe('compuertas.txt', () => {
  const c = leer('compuertas.txt')
  it('una compuerta de dos entradas pone A y B a 16 px del eje y la salida en el segundo extremo', () => {
    expect(pieza(c, 'U1')).toMatchObject({ tipo: '151', props: { entradas: '2' } })
    expect(pieza(c, 'U1').pines).toMatchObject([
      { nombre: 'A', x: 160, y: 144 },
      { nombre: 'B', x: 160, y: 112 },
      { nombre: 'Y', x: 272, y: 128 }
    ])
  })
  it('con tres entradas la central queda sobre el eje', () => {
    expect(pieza(c, 'U3').pines.map((p) => [p.nombre, p.y])).toEqual([['A', 336], ['B', 320], ['C', 304], ['Y', 320]])
    expect(pieza(c, 'U3').props.entradas).toBe('3')
  })
  it('el inversor tiene A al inicio y Y al final', () => {
    expect(pieza(c, 'U2').pines).toMatchObject([{ nombre: 'A', x: 160, y: 224 }, { nombre: 'Y', x: 272, y: 224 }])
  })
  it('las entradas lógicas guardan su estado y las salidas conectan a la compuerta por coincidencia de puntos', () => {
    expect(pieza(c, 'IN1').props.estado).toBe('1')
    expect(pieza(c, 'IN2').props.estado).toBe('0')
    expect(mismaRed(c, ['IN1', '1'], ['U1', '2'])).toBe(true)
    expect(mismaRed(c, ['IN2', '1'], ['U1', '1'])).toBe(true)
    expect(mismaRed(c, ['OUT1', '1'], ['U1', '3'])).toBe(true)
    expect(mismaRed(c, ['IN3', '1'], ['U2', '1'])).toBe(true)
  })
  it('el riel variable es un riel con el valor actual del deslizador', () => {
    expect(pieza(c, 'V1')).toMatchObject({ tipo: '172', valor: '3.5', props: { forma: 'cd' } })
    expect(c.dibujo!.terminales).toContainEqual({ nombre: '3.5V', tipo: 'alimentacion', x: 400, y: 128, giro: 180 })
  })
  it('no deja avisos y las clases salen de las compuertas', () => {
    expect(c.avisos).toEqual([])
    expect(c.piezas.map((p) => claseDe('falstad', p))).toEqual([
      'entrada-logica', 'entrada-logica', 'nand', 'salida-logica', 'entrada-logica', 'not', 'salida-logica',
      'entrada-logica', 'entrada-logica', 'entrada-logica', 'compuerta-and', 'salida-logica', null
    ])
  })
  it('con el bit de tamaño pequeño las entradas van a 8 px', () => {
    const p = leerFalstad('150 0 0 64 0 1 2 0.0', 'x').piezas[0]!
    expect(p.pines.map((q) => q.y)).toEqual([8, -8, 0])
  })
})

describe('lote local de Falstad', () => {
  // Espera KIRCHI_LOTE_IMPORTAR con lote/falstad; sin la variable se omite.
  const dir = process.env.KIRCHI_LOTE_IMPORTAR ? join(process.env.KIRCHI_LOTE_IMPORTAR, 'lote', 'falstad') : ''
  const existe = dir !== '' && existsSync(dir)
  it.skipIf(!existe)('lee los archivos sin lanzar excepciones', () => {
    const archivos = readdirSync(dir).filter((f) => f.endsWith('.txt'))
    let conAvisos = 0
    const codigos = new Map<string, number>()
    for (const f of archivos) {
      const c = leerFalstad(decodificarTexto(readFileSync(join(dir, f))), f)
      if (c.avisos.length) conAvisos++
      for (const a of c.avisos) {
        const m = /«([^»]+)»/.exec(a)
        if (m) codigos.set(m[1] as string, (codigos.get(m[1] as string) ?? 0) + 1)
      }
    }
    process.stdout.write(`Lote Falstad: ${archivos.length} archivos, ${conAvisos} con avisos; códigos sin lector: ${JSON.stringify(Object.fromEntries(codigos))}\n`)
    expect(archivos.length).toBeGreaterThan(0)
  })
})

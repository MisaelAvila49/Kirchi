import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { claseDe } from '../../familias'
import { cadenaBinaria, listaObjetos } from './dsn'
import { leerProteus } from './proteus'
import { Simbolos, transformar } from './simbolos'
import { abrirProyecto } from './zip'

const CELDA = 254000

// ---------------------------------------------------------------- constructor de bytes
class Bytes {
  b: number[] = []
  get largo(): number {
    return this.b.length
  }
  u8(...v: number[]): this {
    this.b.push(...v)
    return this
  }
  i16(v: number): this {
    this.b.push(v & 255, (v >> 8) & 255)
    return this
  }
  i32(v: number): this {
    this.b.push(v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255)
    return this
  }
  ps(t: string): this {
    this.b.push(t.length, ...[...t].map((c) => c.charCodeAt(0)))
    return this
  }
  cs(t: string): this {
    this.b.push(...[...t].map((c) => c.charCodeAt(0)), 0)
    return this
  }
  ceros(n: number): this {
    for (let i = 0; i < n; i++) this.b.push(0)
    return this
  }
  bytes(o: Bytes): this {
    this.b.push(...o.b)
    return this
  }
  f64(v: number): this {
    const a = new Uint8Array(8)
    new DataView(a.buffer).setFloat64(0, v, true)
    this.b.push(...a)
    return this
  }
}

function etiqueta(texto: string, estilo: string, x = 0, y = 0): Bytes {
  const e = new Bytes().u8(0xff).ps(texto).i32(x).i32(y).ceros(6).i32(0x30).i32(0).i32(0).i32(0).u8(1, 0x20, 0xff, 1).cs('Default Font').cs(estilo).i32(0)
  if (estilo === 'PROPERTIES' || estilo === 'SCRIPT') e.i32(texto.length)
  return e
}

const componente = (ref: string, valor: string, disp: string, props: string, x: number, y: number, giro: number, banderas: number, pines: number[]): Bytes =>
  new Bytes()
    .u8(0x00)
    .bytes(etiqueta(ref, 'COMPONENT ID'))
    .bytes(etiqueta(valor, 'COMPONENT VALUE'))
    .bytes(etiqueta(disp, 'SUBCKT NAME'))
    .bytes(etiqueta(props, 'PROPERTIES'))
    .i16(pines.length)
    .ps(disp)
    .i32(x)
    .i32(y)
    .i16(giro)
    .i16(banderas)
    .i32(1)
    .ceros(9)
    .bytes(pines.reduce((a, p) => a.i32(p), new Bytes()))

const cable = (v: [number, number][], etiquetas: [string, number, number][] = []): Bytes => {
  const c = new Bytes().u8(0x00).ceros(22).u8(2, 0x7f).cs('WIRE').i16(etiquetas.length)
  for (const [t, x, y] of etiquetas) c.bytes(etiqueta(t, 'WIRE LABEL', x, y))
  c.i16(v.length)
  for (const [x, y] of v) c.i32(x).i32(y)
  return c
}

const union = (x: number, y: number, c: number[]): Bytes => new Bytes().u8(0x01).i32(x).i32(y).bytes([...c, 0, 0, 0, 0].slice(0, 4).reduce((a, p) => a.i32(p), new Bytes()))

const terminal = (disp: string, nombre: string, x: number, y: number, cable: number): Bytes =>
  new Bytes().u8(0x10).i32(x).i32(y).i16(0).i16(0).ps(disp).ceros(6).bytes(etiqueta(nombre, 'TERMINAL LABEL')).i32(cable)

const generador = (disp: string, ident: string, nombre: string, props: string, x: number, y: number, cables: [number, number]): Bytes =>
  new Bytes()
    .u8(0x38)
    .i32(x)
    .i32(y)
    .i16(0)
    .i16(0)
    .i16(2)
    .ps(ident)
    .ps(disp)
    .bytes(etiqueta(nombre, 'GENERATOR LABEL'))
    .bytes(etiqueta(props, 'PROPERTIES'))
    .i16(0)
    .i32(cables[0])
    .i32(cables[1])
    .u8(0)
    .i32(8)
    .ceros(4)

const sonda = (disp: string, ident: string, nombre: string, x: number, y: number, cables: [number, number]): Bytes =>
  new Bytes()
    .u8(0x30)
    .i32(x)
    .i32(y)
    .i16(0)
    .i16(0)
    .i16(3)
    .ps(ident)
    .ps(disp)
    .bytes(etiqueta(nombre, 'VPROBE LABEL'))
    .bytes(etiqueta('', 'PROPERTIES'))
    .i16(0)
    .i32(cables[0])
    .i32(cables[1])

/** Símbolo RES con el pin 1 en el origen y el pin 2 a 3 celdas girado 180°, y el marcador de conexión de un pin corto. */
function librería(): Bytes {
  const pin = (x: number, giro: number, nombre: string): Bytes => new Bytes().u8(0, 0x0a, 0, 0).i32(x).i32(0).i16(giro).i16(0).cs('$PINSHORT').cs(nombre).cs('')
  return new Bytes()
    .ps('$PINSHORT')
    .i32(-CELDA)
    .i32(0)
    .ceros(4)
    .cs('$MKRNODE')
    .ps('RES')
    .bytes(pin(0, 0, '1'))
    .bytes(pin(3 * CELDA, 1800, '2'))
    .cs('{*DEVICE}')
}

/** DSN mínimo: cabecera, librería y una hoja; los objetos se arman dos veces para conocer los desplazamientos. */
function armarDsn(hoja: (desp: (i: number) => number) => Bytes[], filever = 830): Uint8Array {
  const construir = (offs: number[]): { todo: Bytes; inicios: number[] } => {
    const cab = new Bytes().cs('ISIS SCHEMATIC FILE\x1a').ceros(0xa7 - 21).i16(813).i16(filever).ceros(0xb0 - 0xab)
    const todo = new Bytes().bytes(cab).bytes(librería()).cs('ISIS CIRCUIT FILE\x1a').cs('OBJECT DATA')
    const inicios: number[] = []
    for (const o of hoja((i) => offs[i] ?? 0)) {
      inicios.push(todo.largo)
      todo.bytes(o)
    }
    todo.u8(0xff)
    return { todo, inicios }
  }
  const { inicios } = construir([])
  return new Uint8Array(construir(inicios).todo.b)
}

const proyecto = (dsn: Uint8Array): Uint8Array => zipSync({ 'ROOT.DSN': dsn, 'PROJECT.XML': strToU8('<?xml version="1.0"?><PROJECT RELEASE="813" FILEVER="830"/>') })

// ---------------------------------------------------------------- pruebas con bytes armados
describe('recorrido del DSN con bytes armados', () => {
  // Objetos: 0 R1, 1 cable de pin 1 a la tierra, 2 terminal tierra, 3 cable de pin 2, 4 unión en su extremo.
  const hoja = (o: (i: number) => number): Bytes[] => [
    componente('R1', '1k', 'RES', '{PRIMITIVE=ANALOGUE}{MODFILE=X}{TOL=5}{PACKAGE=AXIAL}', 0, 0, 0, 0, [o(1), o(3)]),
    cable([[-CELDA, 0], [-CELDA, -CELDA]]),
    terminal('$TERGROUND', '', -CELDA, -CELDA, o(1)),
    cable([[4 * CELDA, 0], [4 * CELDA, CELDA]]),
    union(4 * CELDA, CELDA, [o(3)])
  ]
  const dsn = armarDsn(hoja)

  it('recorre un componente, dos cables, una terminal y una unión hasta el fin', () => {
    const s = cadenaBinaria(dsn)
    const inicio = s.indexOf('OBJECT DATA\0') + 12
    const objs = listaObjetos(dsn, inicio, 830)
    expect(objs.map((o) => o.tipo)).toEqual(['componente', 'cable', 'terminal', 'cable', 'union'])
    expect(objs[0]).toMatchObject({ ref: 'R1', valor: '1k', dispositivo: 'RES', x: 0, y: 0 })
    expect(objs[1]).toMatchObject({ vertices: [{ x: -CELDA, y: 0 }, { x: -CELDA, y: -CELDA }], bus: false })
  })

  it('rechaza una clase de objeto desconocida en vez de adivinar', () => {
    const malo = new Uint8Array([0x7e, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff])
    expect(() => listaObjetos(malo, 0, 830)).toThrow(/clase desconocida/)
  })

  it('el pin se ubica con el marcador del símbolo y se une al cable que guarda', () => {
    const c = leerProteus(proyecto(dsn), 'mini.pdsprj')
    expect(c.piezas).toHaveLength(1)
    expect(c.piezas[0].pines).toEqual([
      { nombre: '1', x: -CELDA, y: 0 },
      { nombre: '2', x: 4 * CELDA, y: 0 }
    ])
    expect(c.redes).toEqual([
      { nombre: '0', pines: [{ ref: 'R1', pin: '1' }] },
      { nombre: 'N1', pines: [{ ref: 'R1', pin: '2' }] }
    ])
    expect(c.avisos).toEqual([])
  })

  it('declara unidades de 10 nm, eje Y hacia arriba, versión y el dibujo', () => {
    const c = leerProteus(proyecto(dsn), 'mini.pdsprj')
    expect(c).toMatchObject({ formato: 'proteus', version: '8.13', yHaciaArriba: true, nombre: 'mini.pdsprj' })
    // Una celda de 0.1 in del origen es una de 2.5 mm de Kirchi.
    expect(c.unidadesPorMm! * 2.5).toBeCloseTo(CELDA)
    expect(c.dibujo!.cables).toHaveLength(2)
    expect(c.dibujo!.terminales).toMatchObject([{ nombre: 'GND', tipo: 'tierra', x: -CELDA, y: -CELDA }])
    expect(c.dibujo!.uniones).toEqual([])
  })

  it('las propiedades útiles pasan y las de presentación o de modelo no', () => {
    const c = leerProteus(proyecto(dsn), 'mini.pdsprj')
    expect(c.piezas[0].props).toEqual({ TOL: '5' })
    expect(claseDe('proteus', c.piezas[0])).toBe('resistencia')
  })
})

describe('posición del cursor de los potenciómetros', () => {
  const pot = (disp: string, props: string) => leerProteus(proyecto(armarDsn(() => [componente('RV1', '10k', disp, props, 0, 0, 0, 0, [0, 0, 0])])), 'pot.pdsprj').piezas[0]

  it('POT guarda STATE en pasos del 10 %', () => {
    expect(pot('POT', '{STATE=1}').props.posicion).toBe('0.1')
    expect(pot('POT', '{STATE=10}').props.posicion).toBe('1')
  })

  it('POT-HG guarda POS en por ciento y manda sobre STATE, que solo es el dibujo', () => {
    expect(pot('POT-HG', '{POS=47}{STATE=5}').props.posicion).toBe('0.47')
  })

  it('sin posición guardada no se inventa una', () => {
    expect(pot('POT', '{TOL=5}').props.posicion).toBeUndefined()
  })
})

describe('giro y espejo', () => {
  it('el espejo se aplica antes que el giro, con el giro en décimas de grado', () => {
    expect(transformar(100, 0, -900, 0)).toEqual([0, -100])
    expect(transformar(100, 0, 0, 1)).toEqual([-100, 0])
    expect(transformar(100, 50, 900, 1)).toEqual([-50, -100])
    expect(transformar(100, 0, 1800, 0)).toEqual([-100, 0])
  })

  it('giro negativo se lee antihorario positivo y el doble espejo equivale a 180°', () => {
    const hoja = (): Bytes[] => [
      componente('R1', '1k', 'RES', '', 0, 0, -900, 0, [0, 0]),
      componente('R2', '1k', 'RES', '', 0, 0, 0, 3, [0, 0]),
      componente('R3', '1k', 'RES', '', 0, 0, -1800, 0, [0, 0]),
      componente('R4', '1k', 'RES', '', 0, 0, 0, 1, [0, 0])
    ]
    const c = leerProteus(proyecto(armarDsn(hoja)), 'giros.pdsprj')
    const [r1, r2, r3, r4] = c.piezas
    expect(r1).toMatchObject({ giro: 270, espejoX: false, espejoY: false })
    expect(r1.pines.map((p) => [p.x, p.y])).toEqual([[0, CELDA], [0, -4 * CELDA]])
    expect(r2).toMatchObject({ giro: 0, espejoX: true, espejoY: true })
    expect(r3).toMatchObject({ giro: 180 })
    expect(r3.pines.map((p) => [p.x, p.y])).toEqual(r2.pines.map((p) => [p.x, p.y]))
    expect(r4).toMatchObject({ espejoX: true, espejoY: false })
    expect(r4.pines.map((p) => p.x)).toEqual([CELDA, -4 * CELDA])
  })

  it('la posición de un pin sale del símbolo incrustado y no del nombre', () => {
    const dsn = armarDsn(() => [])
    const sim = new Simbolos(dsn, cadenaBinaria(dsn))
    expect(sim.pines('RES')!.map((p) => [p.nombre, p.x, p.estilo])).toEqual([['1', 0, '$PINSHORT'], ['2', 3 * CELDA, '$PINSHORT']])
    expect(sim.pines('NOEXISTE')).toBeNull()
    expect(sim.nodoDePin('$PINSHORT')).toEqual([-CELDA, 0])
  })
})

describe('etiquetas, generadores y sondas', () => {
  const hoja = (o: (i: number) => number): Bytes[] => [
    componente('R1', '1k', 'RES', '', 0, 0, 0, 0, [o(1), o(2)]),
    cable([[-CELDA, 0], [-CELDA, CELDA]], [['ENT', -CELDA, CELDA]]),
    cable([[4 * CELDA, 0], [4 * CELDA, CELDA]], [['ENT', 4 * CELDA, CELDA]]),
    generador('$PULSEGEN', 'M00000002', 'G1', '{TD=0}{TR=1u}{TF=1u}{PW=50%}{PER=20}{V1=0}{V2=1}', 0, 0, [o(1), 0]),
    sonda('$VPROBE', 'P00000008', 'R1(2)', 0, 0, [o(2), 0])
  ]
  const c = leerProteus(proyecto(armarDsn(hoja)), 'etq.pdsprj')

  it('una etiqueta con el mismo nombre une dos cables en una sola red', () => {
    expect(c.redes).toHaveLength(1)
    expect(c.redes[0]).toMatchObject({ nombre: 'ENT', pines: [{ ref: 'R1', pin: '1' }, { ref: 'R1', pin: '2' }] })
    expect(c.dibujo!.etiquetas).toHaveLength(2)
  })

  it('el pulso porcentual se vuelve segundos y la referencia sin cable es tierra', () => {
    expect(c.instrumentos[0]).toMatchObject({
      tipo: 'generador',
      forma: 'pulso',
      nombre: 'G1',
      red: 'ENT',
      referencia: '0',
      parametros: { v1: 0, v2: 1, td: 0, tr: 1e-6, tf: 1e-6, per: 20, pwPorcentaje: 50, pw: 10 }
    })
  })

  it('la sonda de voltaje lleva su nombre y la red que mide', () => {
    expect(c.instrumentos[1]).toMatchObject({ tipo: 'sonda', magnitud: 'voltaje', nombre: 'R1(2)', red: 'ENT' })
  })
})

describe('archivo contenedor', () => {
  it('solo abre ROOT.DSN y PROJECT.XML y lee RELEASE y FILEVER', () => {
    const p = abrirProyecto(zipSync({ 'ROOT.DSN': new Uint8Array([1, 2, 3]), 'PROJECT.XML': strToU8('<P RELEASE="805" FILEVER="806"/>'), 'ROOT.CDB': new Uint8Array(10) }))
    expect(p).toMatchObject({ release: 805, filever: 806 })
    expect([...p.dsn]).toEqual([1, 2, 3])
  })

  it('un archivo que no es un zip o no trae el esquema da un error claro', () => {
    expect(() => abrirProyecto(new Uint8Array([1, 2, 3, 4, 5]))).toThrow(/no es un proyecto de Proteus/)
    expect(() => abrirProyecto(zipSync({ 'otro.txt': strToU8('x') }))).toThrow(/ROOT\.DSN/)
  })

  it('un esquema que no empieza con la cabecera de Proteus se rechaza', () => {
    expect(() => leerProteus(proyecto(new Uint8Array(300)), 'x')).toThrow(/formato de Proteus/)
  })
})

// ---------------------------------------------------------------- pruebas locales con archivos del usuario
// Espera KIRCHI_LOTE_IMPORTAR con proteus/ (proyecto del usuario y netlists) y lote/proteus/; sin la variable se omite.
const BASE = process.env.KIRCHI_LOTE_IMPORTAR ?? ''
const CARPETA = BASE ? join(BASE, 'proteus') : ''
const LOTE = BASE ? join(BASE, 'lote', 'proteus') : ''

/** Redes de una netlist de referencia: solo los pines, como `ref.pin`. */
function redesDeReferencia(archivo: string): string[] {
  const lineas = readFileSync(join(CARPETA, 'netlists', archivo), 'utf8').split(/\r?\n/)
  const redes: string[] = []
  for (const l of lineas) {
    const i = l.lastIndexOf('] [')
    if (!l.startsWith('[') || i < 0) continue
    const pines = [...l.slice(i + 3).matchAll(/'([^']+)'/g)].map((m) => m[1]).sort()
    if (pines.length) redes.push(pines.join(' '))
  }
  return redes.sort()
}

const redesLeidas = (c: ReturnType<typeof leerProteus>): string[] =>
  c.redes
    .map((r) =>
      r.pines
        .map((p) => `${p.ref}.${p.pin}`)
        .sort()
        .join(' ')
    )
    .sort()

describe.skipIf(CARPETA === '' || !existsSync(join(CARPETA, 'New Project.pdsprj')))('archivos propios del usuario', () => {
  const leer = (n: string) => leerProteus(new Uint8Array(readFileSync(join(CARPETA, n))), n)

  it('New Project: piezas, redes de la netlist de referencia, fuentes, sondas y transitorio', () => {
    const c = leer('New Project.pdsprj')
    const refs = c.piezas.map((p) => p.ref)
    expect(refs.filter((r) => r.startsWith('U'))).toHaveLength(7)
    expect(c.piezas.filter((p) => p.tipo === 'TL081')).toHaveLength(7)
    for (const r of ['R1', 'R12', 'C1', 'C2', 'RV1', 'RV2']) expect(refs).toContain(r)
    expect(refs.filter((r) => /^R\d/.test(r))).toHaveLength(12)
    expect(redesLeidas(c)).toEqual(redesDeReferencia('New Project.txt'))
    const gen = c.instrumentos.filter((i) => i.tipo === 'generador')
    expect(gen.find((g) => g.forma === 'pulso')!.parametros).toMatchObject({ per: 20, v1: 0, v2: 1 })
    expect(gen.filter((g) => g.forma === 'cd').map((g) => [g.red, g.parametros.valor]).sort()).toEqual([['V+', 15], ['V-', -15]])
    const sondas = c.instrumentos.filter((i) => i.tipo === 'sonda').map((i) => i.nombre)
    expect(sondas).toEqual(expect.arrayContaining(['R1(1)', 'U4(OP)']))
    const tran = c.directivas.find((d) => d.tipo === 'analisis')!
    expect(tran).toMatchObject({ tipo: 'analisis', analisis: 'tran', parametros: { inicio: 0, fin: 50 } })
    const redDe = (n: string) => (c.instrumentos.find((i) => i.tipo === 'sonda' && i.nombre === n) as { red: string }).red
    expect((tran as { trazas: string[] }).trazas).toEqual(expect.arrayContaining([redDe('R1(1)'), redDe('U4(OP)')]))
    expect(c.avisos).toEqual([])
  })

  it('New Project: la gráfica analógica también es un osciloscopio con su ventana, su rango y su lugar', () => {
    const c = leer('New Project.pdsprj')
    const osc = c.instrumentos.find((i) => i.tipo === 'virtual' && i.clase === 'osciloscopio')
    expect(osc).toMatchObject({ nombre: 'ANALOGUE ANALYSIS', ventana: [0, 50] })
    const o = osc as { redes: string[]; rangoY: [number, number]; x: number; y: number }
    expect(o.redes).toHaveLength(2)
    expect(o.rangoY[0]).toBeCloseTo(-0.198, 3)
    expect(o.rangoY[1]).toBeCloseTo(1.194, 3)
    // La caja (-43, -25) a (-16, -2) en cuadros de 100 mil.
    expect(o.x).toBeCloseTo(-29.5 * CELDA, 0)
    expect(o.y).toBeCloseTo(-13.5 * CELDA, 0)
  })

  it('Resistencia: cuatro resistencias sin cables, con giro y espejos', () => {
    const c = leer('Resistencia.pdsprj')
    expect(c.piezas).toHaveLength(4)
    expect(c.piezas.every((p) => p.tipo === 'RES')).toBe(true)
    expect(c.redes).toEqual([])
    expect(redesLeidas(c)).toEqual(redesDeReferencia('Resistencia.txt'))
  })

  it('Cables: varios cables en un pin, una T y una cruz dan una sola red', () => {
    const c = leer('Cables.pdsprj')
    expect(redesLeidas(c)).toEqual(redesDeReferencia('Cables.txt'))
  })
})

describe.skipIf(LOTE === '' || !existsSync(LOTE))('lote público de proyectos de Proteus', () => {
  it('ninguno lanza, y los pines sueltos y fuera de su cable se cuentan', () => {
    let piezas = 0
    let pines = 0
    let sueltos = 0
    let fuera = 0
    let virtuales = 0
    const falla: string[] = []
    const filas: string[] = []
    for (const f of readdirSync(LOTE).filter((n) => n.endsWith('.pdsprj'))) {
      try {
        const c = leerProteus(new Uint8Array(readFileSync(join(LOTE, f))), f)
        const conInstrumento = new Set(c.instrumentos.flatMap((i) => (i.tipo === 'sonda' ? [i.red] : i.tipo === 'generador' ? [i.red, i.referencia] : i.redes)))
        const s = c.redes.filter((r) => r.pines.length === 1 && r.nombre?.startsWith('N') && !conInstrumento.has(r.nombre)).length
        // Solo los instrumentos que son componentes del archivo: el osciloscopio que sale de una gráfica (con `ventana`) no lo es.
        virtuales += c.instrumentos.filter((i) => i.tipo === 'virtual' && !('ventana' in i)).length
        const fu = c.avisos.filter((a) => a.startsWith('Pines que no coinciden')).length
        piezas += c.piezas.length
        pines += c.piezas.reduce((a, p) => a + p.pines.length, 0)
        sueltos += s
        fuera += fu
        filas.push(`${f.slice(0, 36).padEnd(36)} piezas ${String(c.piezas.length).padStart(4)} redes ${String(c.redes.length).padStart(4)} sueltos ${s} avisos ${c.avisos.length}`)
      } catch (e) {
        falla.push(`${f}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    process.stdout.write(`${filas.join('\n')}\nTotal: ${piezas} piezas, ${pines} pines, ${sueltos} redes de un pin sin nombre, ${fuera} archivos con pines fuera de su cable\n`)
    expect(falla).toEqual([])
    // Los 1,771 componentes del lote: los instrumentos virtuales no son piezas.
    expect(piezas + virtuales).toBe(1771)
    expect(sueltos).toBeLessThanOrEqual(1)
    expect(fuera).toBe(0)
  })
})

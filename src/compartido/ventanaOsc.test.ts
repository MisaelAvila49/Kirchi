import { describe, expect, it } from 'vitest'
import { esJsonPlano, esRutaOsc, RUTA_OSC, urlDeOsc, validarComandoOsc, validarDatosOsc, validarPantallaOsc, type DatosOsc, type PantallaOsc } from './ventanaOsc'

const pantalla = (o: Partial<PantallaOsc> = {}): PantallaOsc => ({
  version: 3,
  t0: 0,
  dt: 1e-5,
  ncol: 4,
  tDisparo: 0,
  estado: 'disparado',
  tCaptura: 0.01,
  csv: { t0: 0, dt: 1e-5, n: 3 },
  completoHasta: [0.01, 0.01, 0, 0, 0.01],
  medidas: [[{ valor: 1, razon: '' }], [], [], [], []],
  columnas: new Float32Array(5 * 4 * 5),
  muestras: new Float32Array(5 * 3),
  ...o
})

const datos = (o: Partial<DatosOsc> = {}): DatosOsc => ({
  tema: 'claro',
  osciloscopios: [{ id: 'p1', ref: 'OSC1' }],
  elegido: 'p1',
  ajustes: { base: 1e-3, canales: [{ canal: 'A', on: true, vdiv: 1, pos: 0, acople: 'DC' }], medidas: [] },
  aspecto: { tema: 'tema', grosor: 1.5 },
  aspectoCanales: { A: { lado: 'izquierda', color: null } },
  fase: 'corriendo',
  teclaSimular: 'F5',
  estadoDisparo: 'Disparado',
  fuentes: { A: 'R1:2', B: null },
  aviso: null,
  notaAjuste: null,
  cursores: null,
  capturada: false,
  pantalla: pantalla(),
  congelada: null,
  ...o
})

describe('ventana aparte del osciloscopio: lo que viaja', () => {
  it('la ruta y la URL se arman sin duplicar el hash', () => {
    expect(RUTA_OSC).toBe('#osciloscopio')
    expect(urlDeOsc('app://kirchi/index.html#graficas')).toBe('app://kirchi/index.html#osciloscopio')
    expect(esRutaOsc('#osciloscopio')).toBe(true)
    expect(esRutaOsc('#graficas')).toBe(false)
  })

  it('unos datos completos pasan con sus arreglos tipados intactos', () => {
    const d = datos()
    const v = validarDatosOsc(d)!
    expect(v).not.toBeNull()
    expect(v.pantalla!.columnas).toBeInstanceOf(Float32Array)
    expect(v.pantalla!.columnas.length).toBe(100)
    expect(v.elegido).toBe('p1')
  })

  it('sin pantalla ni congelada (sin cambios) las deja ausentes; con null las baja', () => {
    const { pantalla: _p, congelada: _c, ...resto } = datos()
    const v = validarDatosOsc(resto)!
    expect('pantalla' in v).toBe(false)
    expect('congelada' in v).toBe(false)
    expect(validarDatosOsc(datos({ congelada: null }))!.congelada).toBeNull()
  })

  it('una congelada trae su pantalla y los ajustes con que se congeló', () => {
    const c = { pantalla: pantalla({ version: 9 }), ajustes: { base: 2e-3 } }
    expect(validarDatosOsc(datos({ congelada: c }))!.congelada).toEqual(c)
    expect(validarDatosOsc(datos({ congelada: { pantalla: pantalla(), ajustes: { f: (() => 1) as never } } }))).toBeNull()
  })

  it('rechaza lo que no tiene la forma: tema, lista de osciloscopios, cursores y arreglos que no son Float32', () => {
    expect(validarDatosOsc(null)).toBeNull()
    expect(validarDatosOsc(datos({ tema: 'rojo' as never }))).toBeNull()
    expect(validarDatosOsc(datos({ osciloscopios: new Array(5).fill({ id: 'a', ref: 'b' }) }))).toBeNull()
    expect(validarDatosOsc(datos({ cursores: { canal: 'A', t: [1, Number.NaN], v: null } }))).toBeNull()
    expect(validarDatosOsc(datos({ pantalla: pantalla({ columnas: [1, 2] as never }) }))).toBeNull()
    expect(validarDatosOsc(datos({ pantalla: pantalla({ ncol: 9999 }) }))).toBeNull()
    expect(validarDatosOsc(datos({ pantalla: pantalla({ csv: { t0: 0, dt: 1, n: 5000 } }) }))).toBeNull()
  })

  it('los ajustes son datos planos y acotados: sin funciones, sin ciclos profundos ni cantidades desmedidas', () => {
    expect(esJsonPlano({ a: [1, 'b', true, null, { c: 2 }] })).toBe(true)
    expect(esJsonPlano({ f: () => 1 })).toBe(false)
    expect(esJsonPlano({ n: Number.POSITIVE_INFINITY })).toBe(false)
    expect(esJsonPlano(new Array(30_000).fill(1))).toBe(false)
    let hondo: unknown = 1
    for (let i = 0; i < 20; i++) hondo = { x: hondo }
    expect(esJsonPlano(hondo)).toBe(false)
    expect(esJsonPlano('x'.repeat(401))).toBe(false)
  })

  it('la pantalla de «esperando disparo» (origen y disparo en NaN) pasa: por eso la ventana no abría', () => {
    const espera = pantalla({ t0: Number.NaN, tDisparo: Number.NaN, ncol: 0, csv: { t0: Number.NaN, dt: 0, n: 0 }, estado: 'esperando' })
    const v = validarDatosOsc(datos({ pantalla: espera }))!
    expect(v).not.toBeNull()
    expect(Number.isNaN(v.pantalla!.t0)).toBe(true)
    expect(validarPantallaOsc(pantalla({ t0: Number.POSITIVE_INFINITY }))).toBeNull()
    expect(validarPantallaOsc(pantalla({ dt: Number.NaN }))).toBeNull()
  })

  it('una pantalla suelta se revisa igual', () => {
    expect(validarPantallaOsc(pantalla())).not.toBeNull()
    expect(validarPantallaOsc(pantalla({ estado: 'x'.repeat(100) }))).toBeNull()
    expect(validarPantallaOsc(pantalla({ medidas: [[{ valor: 1, razon: 'x'.repeat(100) }]] }))).toBeNull()
  })
})

describe('ventana aparte del osciloscopio: las órdenes que vuelven al editor', () => {
  it('acepta cada orden con su forma y descarta el resto', () => {
    for (const tipo of ['pausar', 'reanudar', 'forzar', 'auto', 'rearmar', 'exportar'] as const) expect(validarComandoOsc({ tipo, extra: 1 })).toEqual({ tipo })
    expect(validarComandoOsc({ tipo: 'elegir', id: 'p2' })).toEqual({ tipo: 'elegir', id: 'p2' })
    expect(validarComandoOsc({ tipo: 'columnas', id: 'p1', n: 640 })).toEqual({ tipo: 'columnas', id: 'p1', n: 640 })
    expect(validarComandoOsc({ tipo: 'cursores', cursores: { canal: 'A', t: [0, 1], v: null } })).toEqual({ tipo: 'cursores', cursores: { canal: 'A', t: [0, 1], v: null } })
    expect(validarComandoOsc({ tipo: 'cursores', cursores: null })).toEqual({ tipo: 'cursores', cursores: null })
    expect(validarComandoOsc({ tipo: 'escala', eje: { tipo: 'tiempo' }, dir: -1 })).toEqual({ tipo: 'escala', eje: { tipo: 'tiempo' }, dir: -1 })
    expect(validarComandoOsc({ tipo: 'escala', eje: { tipo: 'canal', canal: 'B' }, dir: 1 })).toEqual({ tipo: 'escala', eje: { tipo: 'canal', canal: 'B' }, dir: 1 })
    expect(validarComandoOsc({ tipo: 'posicion', canal: 'A', pos: 1.5, gesto: 'a_pos' })).toEqual({ tipo: 'posicion', canal: 'A', pos: 1.5, gesto: 'a_pos' })
    expect(validarComandoOsc({ tipo: 'ajuste', prop: 'base', texto: '2 ms' })).toEqual({ tipo: 'ajuste', prop: 'base', texto: '2 ms' })
    expect(validarComandoOsc({ tipo: 'ajuste', prop: 'base', texto: '2 ms', gesto: 'g' })).toEqual({ tipo: 'ajuste', prop: 'base', texto: '2 ms', gesto: 'g' })
  })

  it('rechaza órdenes desconocidas, números fuera de rango y textos desmedidos', () => {
    expect(validarComandoOsc(null)).toBeNull()
    expect(validarComandoOsc({ tipo: 'borrar-todo' })).toBeNull()
    expect(validarComandoOsc({ tipo: 'columnas', id: 'p1', n: 99999 })).toBeNull()
    expect(validarComandoOsc({ tipo: 'columnas', id: 'p1', n: 1.5 })).toBeNull()
    expect(validarComandoOsc({ tipo: 'escala', eje: { tipo: 'tiempo' }, dir: 2 })).toBeNull()
    expect(validarComandoOsc({ tipo: 'posicion', canal: 'A', pos: Number.NaN, gesto: 'x' })).toBeNull()
    expect(validarComandoOsc({ tipo: 'ajuste', prop: 'base', texto: 'x'.repeat(500) })).toBeNull()
    expect(validarComandoOsc({ tipo: 'cursores', cursores: { canal: 'A', t: [1], v: null } })).toBeNull()
  })
})

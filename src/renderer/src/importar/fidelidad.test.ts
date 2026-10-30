// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { calcularConexiones, clavePin } from '../conexiones/conexiones'
import { idSecuencial } from '../doc/ids'
import type { Documento, Pieza } from '../doc/tipos'
import { violaciones } from '../editor/conflictos'
import { pinesEnMundo } from '../piezas/transformar'
import { problemasDeRedes } from '../prueba/ayudaImportar'
import { libreriaDePrueba } from '../prueba/libreria'
import type { CircuitoAjeno } from './ajeno'
import { proyectar } from './acomodo'
import { convertir } from './convertir'
import { armarDocumento } from './importar'
import { leerFalstad } from './lectores/falstad'
import { leerKicad } from './lectores/kicad'
import { leerLtspice } from './lectores/ltspice'

// El esquema importado se tiene que reconocer como el original: escala, giro, cables, terminales y fuentes en su lugar.
const lib = libreriaDePrueba().piezas

function importar(a: CircuitoAjeno): Documento {
  const gen = idSecuencial()
  const doc = armarDocumento(convertir(a, lib, gen), lib, gen).doc
  expect(violaciones(doc, lib)).toEqual([])
  expect(problemasDeRedes(a, doc, lib)).toEqual([])
  return doc
}
const porRef = (d: Documento, ref: string): Pieza => Object.values(d.piezas).find((p) => p.ref === ref)!
const pin = (d: Documento, ref: string, id: string): { x: number; y: number } => {
  const p = porRef(d, ref)
  return pinesEnMundo(p, lib.get(p.tipo)!).find((q) => q.id === id)!
}

describe('escala de cada formato: una celda del origen es una de Kirchi (2 unidades, 2.5 mm)', () => {
  it('LTspice y Falstad, 16 unidades; KiCad, 100 mil', () => {
    const lt = leerLtspice('Version 4\nSHEET 1 880 680\nWIRE 0 0 16 0\n', 'a.asc')
    expect(proyectar(lt, 16, 0).x).toBeCloseTo(2)
    const fa = leerFalstad('$ 1 0.000005 10 50 5 50\nw 0 0 16 0 0\n', 'a.txt')
    expect(proyectar(fa, 16, 0).x).toBeCloseTo(2)
    const ki = leerKicad('(kicad_sch (version 20250114) (generator "eeschema") (uuid "x") (paper "A4") (lib_symbols))', 'a.kicad_sch', {})
    expect(proyectar(ki, 2.54, 0).x).toBeCloseTo(2)
  })
})

/** Amp-op inversor como lo da Proteus (Y hacia arriba): «−» y V− arriba, V+ abajo, cada pin de alimentación con su
 * terminal a dos celdas y un generador de CD que da 15 V a V+ y −15 V a V−. */
function inversorProteus(): CircuitoAjeno {
  const c = 254000
  return {
    formato: 'proteus',
    nombre: 'inversor.pdsprj',
    unidadesPorMm: 254000 / 2.5,
    yHaciaArriba: true,
    piezas: [
      {
        ref: 'U1', tipo: 'TL081', valor: 'TL081', modelo: 'TL081', props: {}, x: 0, y: 0, giro: 0, espejoY: true,
        pines: [
          { nombre: '+IP', numero: '3', x: -4 * c, y: -c },
          { nombre: '-IP', numero: '2', x: -4 * c, y: c },
          { nombre: 'OP', numero: '6', x: 4 * c, y: 0 },
          { nombre: 'V+', numero: '7', x: -c, y: -4 * c },
          { nombre: 'V-', numero: '4', x: -c, y: 4 * c }
        ]
      },
      { ref: 'R1', tipo: 'RES', valor: '1k', props: {}, x: -11 * c, y: c, giro: 0, pines: [{ nombre: '1', x: -14 * c, y: c }, { nombre: '2', x: -9 * c, y: c }] },
      { ref: 'R2', tipo: 'RES', valor: '1k', props: {}, x: 0, y: 6 * c, giro: 0, pines: [{ nombre: '1', x: -6 * c, y: 6 * c }, { nombre: '2', x: 6 * c, y: 6 * c }] }
    ],
    redes: [
      { nombre: 'N1', pines: [{ ref: 'U1', pin: '-IP' }, { ref: 'R1', pin: '2' }, { ref: 'R2', pin: '1' }] },
      { nombre: 'N2', pines: [{ ref: 'U1', pin: 'OP' }, { ref: 'R2', pin: '2' }] },
      { nombre: 'ENT', pines: [{ ref: 'R1', pin: '1' }] },
      { nombre: '0', pines: [{ ref: 'U1', pin: '+IP' }] },
      { nombre: 'V+', pines: [{ ref: 'U1', pin: 'V+' }] },
      { nombre: 'V-', pines: [{ ref: 'U1', pin: 'V-' }] }
    ],
    dibujo: {
      cables: [
        [{ x: -9 * c, y: c }, { x: -6 * c, y: c }, { x: -4 * c, y: c }],
        [{ x: -6 * c, y: c }, { x: -6 * c, y: 6 * c }],
        [{ x: 4 * c, y: 0 }, { x: 6 * c, y: 0 }, { x: 6 * c, y: 6 * c }],
        [{ x: -4 * c, y: -c }, { x: -6 * c, y: -c }, { x: -6 * c, y: -3 * c }],
        [{ x: -c, y: -4 * c }, { x: -c, y: -6 * c }],
        [{ x: -c, y: 4 * c }, { x: -c, y: 6 * c - c }],
        [{ x: -20 * c, y: -8 * c }, { x: -18 * c, y: -8 * c }],
        [{ x: -20 * c, y: -10 * c }, { x: -18 * c, y: -10 * c }]
      ],
      uniones: [{ x: -6 * c, y: c }],
      etiquetas: [],
      terminales: [
        { nombre: 'GND', tipo: 'tierra', x: -6 * c, y: -3 * c, giro: 0 },
        { nombre: 'V+', tipo: 'alimentacion', x: -c, y: -6 * c, giro: 0 },
        { nombre: 'V-', tipo: 'alimentacion', x: -c, y: 5 * c, giro: 0 },
        { nombre: 'V+', tipo: 'alimentacion', x: -18 * c, y: -8 * c, giro: 0 },
        { nombre: 'V-', tipo: 'alimentacion', x: -18 * c, y: -10 * c, giro: 0 }
      ],
      textos: []
    },
    instrumentos: [
      { tipo: 'generador', forma: 'cd', nombre: 'V+', red: 'V+', referencia: '0', parametros: { valor: 15 }, x: -20 * c, y: -8 * c },
      { tipo: 'generador', forma: 'cd', nombre: 'V-', red: 'V-', referencia: '0', parametros: { valor: -15 }, x: -20 * c, y: -10 * c }
    ],
    directivas: [],
    avisos: []
  }
}

describe('Proteus: amp-op con terminales de alimentación', () => {
  const d = importar(inversorProteus())
  it('el amp-op conserva «−» arriba, como en el original, y no se refleja por sus pines de alimentación', () => {
    expect(pin(d, 'U1', '-').y).toBeLessThan(pin(d, 'U1', '+').y)
    expect(pin(d, 'U1', 'OUT').x).toBeGreaterThan(pin(d, 'U1', '-').x)
  })
  it('cada pin de alimentación lleva su terminal junto al pin, unido con un tramo corto', () => {
    const con = calcularConexiones(d, lib)
    for (const [id, nombre] of [['V+', 'V+'], ['V-', 'V-']] as const) {
      const red = con.redDePin.get(clavePin(porRef(d, 'U1').id, id))
      const terminales = Object.values(d.piezas).filter((p) => p.tipo === 'alimentacion' && p.props.nombre === nombre)
      const junto = terminales.find((t) => con.redDePin.get(clavePin(t.id, '1')) === red)
      expect(junto, nombre).toBeDefined()
      const q = pin(d, 'U1', id)
      expect(Math.abs(junto!.x - q.x) + Math.abs(junto!.y - q.y), nombre).toBeLessThanOrEqual(8)
    }
  })
  it('el generador de CD de cada terminal es el voltaje de su riel, no una pieza', () => {
    expect(Object.values(d.piezas).some((p) => p.tipo === 'fuente-dc')).toBe(false)
    expect(Object.fromEntries(Object.values(d.alimentaciones ?? {}).map((a) => [a.nombre, a.voltaje]))).toEqual({ 'V+': '15', 'V-': '-15' })
  })
  it('ningún cable recorre el esquema: todos son cortos o del dibujo original', () => {
    const largo = (pts: { x: number; y: number }[]): number => pts.reduce((s, p, i) => (i ? s + Math.abs(p.x - pts[i - 1]!.x) + Math.abs(p.y - pts[i - 1]!.y) : 0), 0)
    for (const c of Object.values(d.cables)) expect(largo(c.puntos)).toBeLessThanOrEqual(30)
  })
})

describe('Falstad: una fuente de un solo terminal va referida a tierra', () => {
  const texto = ['$ 1 0.000005 10 50 5 50', 'R 240 64 64 64 0 1 80 2.5 2.5 0 0.5', 'r 240 64 240 192 0 1000', 'g 240 192 240 208 0', ''].join('\n')
  const a = leerFalstad(texto, 'fuente.txt')
  const d = importar(a)
  it('su polo negativo queda en la red de tierra y se dibuja hacia donde iba en el original', () => {
    const con = calcularConexiones(d, lib)
    const v = Object.values(d.piezas).find((p) => p.tipo === 'generador')!
    const menos = lib.get('generador')!.pines.find((q) => q.id === '-' || q.id === 'COM')!.id
    const red = con.redDePin.get(clavePin(v.id, menos))
    expect(red).toBeDefined()
    expect(con.redes[red!]!.tierra).toBe(true)
    // En el original crece del terminal hacia la izquierda: el polo libre queda a la izquierda del positivo.
    expect(pin(d, v.ref, menos).x).toBeLessThan(pin(d, v.ref, '+').x)
  })
})

describe('LTspice: cables del original, banderas y fuentes de CD', () => {
  // Dos resistencias unidas por un cable que sube, cruza y baja: el enrutador iría derecho, el original no.
  const texto = [
    'Version 4',
    'SHEET 1 880 680',
    'WIRE 0 96 0 128',
    'WIRE 0 -32 0 16',
    'WIRE 0 -32 192 -32',
    'WIRE 192 -32 192 16',
    'WIRE 192 96 192 128',
    'FLAG 0 128 0',
    'FLAG 192 128 0',
    'FLAG 320 16 Vcc',
    'FLAG 320 96 0',
    'FLAG 0 -32 Vcc',
    'SYMBOL res -16 0 R0',
    'SYMATTR InstName R1',
    'SYMATTR Value 1k',
    'SYMBOL res 176 0 R0',
    'SYMATTR InstName R2',
    'SYMATTR Value 1k',
    'SYMBOL voltage 320 0 R0',
    'SYMATTR InstName V1',
    'SYMATTR Value 6',
    ''
  ].join('\n')
  const a = leerLtspice(texto, 'puente.asc')
  const d = importar(a)
  it('el cable conserva su recorrido: pasa por las esquinas del original llevadas a la rejilla', () => {
    const r1 = pin(d, 'R1', '1'), r2 = pin(d, 'R2', '1')
    // El tramo de arriba va de la columna de R1 a la de R2, unas celdas por encima de los pines (48 unidades de LTspice).
    const arriba = Object.values(d.cables).some((c) =>
      c.puntos.some((p, i) => {
        const q = c.puntos[i - 1]
        return q !== undefined && p.y === q.y && p.y <= Math.min(r1.y, r2.y) - 4 && Math.min(p.x, q.x) <= r1.x && Math.max(p.x, q.x) >= r2.x
      })
    )
    expect(arriba).toBe(true)
  })
  it('la fuente de CD entre tierra y la bandera Vcc es el voltaje del riel Vcc, y la bandera es un terminal', () => {
    expect(Object.values(d.piezas).some((p) => p.tipo === 'fuente-dc')).toBe(false)
    expect(Object.values(d.alimentaciones ?? {}).map((x) => [x.nombre, x.voltaje])).toEqual([['Vcc', '6']])
    expect(Object.values(d.piezas).filter((p) => p.tipo === 'alimentacion').map((p) => p.props.nombre)).toEqual(['Vcc'])
  })
})

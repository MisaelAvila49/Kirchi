import { describe, expect, it } from 'vitest'
import type { AnalisisDoc } from '../../../compartido/analisis/config'
import { documentoVacio, type Documento, type Pieza } from '../doc/tipos'
import { REGLAS, RESERVADOS, formatoDe } from './formatos'
import { formatoDe as formatoDeKir } from './kir'

const pieza = (tipo: string, extra: Partial<Pieza> = {}): Pieza => ({ id: 'p', tipo, ref: 'X1', x: 0, y: 0, rot: 0, espejo: false, props: {}, ...extra })
const con = (p: Pieza, resto: Partial<Documento> = {}): Documento => ({ ...documentoVacio(), piezas: { p }, ...resto })
const bode: AnalisisDoc = { id: 'a1', nombre: 'Bode', config: { tipo: 'ac', barrido: 'dec', puntos: 20, desde: 10, hasta: 1e5, fuente: 'v', magnitud: 1 } }

describe('reglas de formato', () => {
  it('cada documento da el formato de siempre', () => {
    expect(formatoDe(documentoVacio())).toBe(1)
    expect(formatoDe(con(pieza('resistencia')))).toBe(1)
    expect(formatoDe(con(pieza('alimentacion')))).toBe(2)
    expect(formatoDe(con(pieza('resistencia', { textos: { ref: { lugar: 'abajo' } } })))).toBe(3)
    expect(formatoDe(con(pieza('alimentacion', { textos: { ref: { lugar: 'abajo' } } })))).toBe(3)
    expect(formatoDe(con(pieza('potenciometro', { textos: { ajuste: { lugar: 'abajo' } } })))).toBe(3)
    expect(formatoDe({ ...documentoVacio(), figuras: { f: { id: 'f', tipo: 'linea', x: 0, y: 0, x2: 5, y2: 5 } as any } })).toBe(4)
    expect(formatoDe({ ...documentoVacio(), sondas: { s: { id: 's', tipo: 'voltaje', x: 0, y: 0 } } })).toBe(5)
    expect(formatoDe(con(pieza('npn', { spice: { bf: 100 } })))).toBe(6)
    expect(formatoDe(con(pieza('npn', { spice: {} })))).toBe(1)
    expect(formatoDe({ ...documentoVacio(), analisis: { a1: bode } })).toBe(7)
    expect(formatoDe(con(pieza('npn', { spice: { bf: 100 } }), { analisis: { a1: bode } }))).toBe(7)
  })
  it('las posiciones fuera de la rejilla de notas, figuras y pantallas de medidor piden el formato 8', () => {
    const d = documentoVacio()
    expect(formatoDe({ ...d, notas: { n: { id: 'n', x: 1, y: 2, ancho: 8, texto: 'a' } } })).toBe(1)
    expect(formatoDe({ ...d, notas: { n: { id: 'n', x: 1.5, y: 2, ancho: 8, texto: 'a' } } })).toBe(8)
    expect(formatoDe({ ...d, figuras: { f: { id: 'f', tipo: 'linea', x1: 0, y1: 0, x2: 5, y2: 5.25, orden: 0 } as any } })).toBe(8)
    const m = { id: 'm', tipo: 'medidor', x: 0, y: 0, magnitud: 'voltaje', modo: 'dc', ref: 'M1' } as const
    expect(formatoDe({ ...d, sondas: { m: { ...m, pantalla: { dx: 2, dy: -1.5 } } as any } })).toBe(8)
  })
  it('kir.ts reexporta la misma función', () => {
    expect(formatoDeKir).toBe(formatoDe)
  })
  it('no hay dos reglas con el mismo número', () => {
    const numeros = REGLAS.map((r) => r.formato)
    expect(new Set(numeros).size).toBe(numeros.length)
    expect(REGLAS.map((r) => r.nombre).every((n) => n.length > 0)).toBe(true)
  })
  it('los números reservados no los usa ninguna regla', () => {
    expect(RESERVADOS).toEqual({ 10: 'bloques', 11: 'protoboard', 12: 'microcontroladores' })
    for (const r of REGLAS) expect(Object.keys(RESERVADOS)).not.toContain(String(r.formato))
  })
})

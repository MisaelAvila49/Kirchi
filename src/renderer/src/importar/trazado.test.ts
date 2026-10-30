// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { idSecuencial } from '../doc/ids'
import { libreriaDePrueba } from '../prueba/libreria'
import type { CircuitoAjeno, PuntoAjeno } from './ajeno'
import { convertir } from './convertir'
import { armarDocumento } from './importar'
import { calcularConexiones } from '../conexiones/conexiones'
import { documentoVacio, type Pieza } from '../doc/tipos'
import { cajaEtiqueta } from '../lienzo/medidas'
import { cuerpoEnMundo } from '../editor/colision'
import { cajasSeCruzan } from '../lienzo/apartar'
import { pinesEnMundo } from '../piezas/transformar'
import { mejorGiro } from '../editor/etiquetaEnTramo'
import { Celdas, puntoParaSonda, trazar } from './trazado'

const lib = libreriaDePrueba().piezas
const c = 254000

/** Dos resistencias en serie con su cable, a las que se añade el dibujo hostil que se pida. */
function conCables(extra: PuntoAjeno[][]): CircuitoAjeno {
  return {
    formato: 'proteus',
    nombre: 'hostil.pdsprj',
    unidadesPorMm: 254000 / 2.5,
    yHaciaArriba: true,
    piezas: [
      { ref: 'R1', tipo: 'RES', valor: '1k', props: {}, x: 0, y: 0, giro: 0, pines: [{ nombre: '1', numero: '1', x: -3 * c, y: 0 }, { nombre: '2', numero: '2', x: 3 * c, y: 0 }] },
      { ref: 'R2', tipo: 'RES', valor: '1k', props: {}, x: 12 * c, y: 0, giro: 0, pines: [{ nombre: '1', numero: '1', x: 9 * c, y: 0 }, { nombre: '2', numero: '2', x: 15 * c, y: 0 }] }
    ],
    redes: [{ nombre: 'A', pines: [{ ref: 'R1', pin: '2' }, { ref: 'R2', pin: '1' }] }],
    dibujo: { cables: [[{ x: 3 * c, y: 0 }, { x: 9 * c, y: 0 }], ...extra], uniones: [], etiquetas: [], terminales: [], textos: [] },
    instrumentos: [],
    directivas: [],
    avisos: []
  }
}

function tarda(a: CircuitoAjeno): number {
  const gen = idSecuencial()
  const t0 = performance.now()
  const r = armarDocumento(convertir(a, lib, gen), lib, gen)
  return performance.now() - t0
}

describe('trazado con un dibujo hostil', () => {
  it('cuarenta mil cables oblicuos terminan con un tope holgado', () => {
    const oblicuos = Array.from({ length: 40000 }, (_, i): PuntoAjeno[] => [{ x: (i % 200) * c, y: 5 * c + i * 7 }, { x: (i % 200) * c + 3 * c + i, y: 9 * c + i * 3 }])
    expect(tarda(conCables(oblicuos))).toBeLessThan(30000)
  })
  it('cables de largo absurdo terminan con un tope holgado y no estiran el esquema', () => {
    const gen = idSecuencial()
    const a = conCables([[{ x: 0, y: 3 * c }, { x: 1e300, y: 3 * c }], [{ x: -1e15, y: -1e15 }, { x: 1e15, y: 1e15 }], [{ x: 0, y: 4 * c }, { x: NaN, y: 4 * c }]])
    const t0 = performance.now()
    const doc = armarDocumento(convertir(a, lib, gen), lib, gen).doc
    expect(performance.now() - t0).toBeLessThan(30000)
    for (const cab of Object.values(doc.cables)) for (const p of cab.puntos) expect(Math.abs(p.x) + Math.abs(p.y)).toBeLessThan(5000)
  })
  it('un cable de cientos de miles de vértices se descarta con aviso y no lanza', () => {
    const gen = idSecuencial()
    const muchos = Array.from({ length: 200000 }, (_, i): PuntoAjeno => ({ x: (i % 50) * c, y: 6 * c + (i % 2) * c }))
    const doc = armarDocumento(convertir(conCables([muchos]), lib, gen), lib, gen)
    expect(doc.avisos.join(' ')).toContain('vértices')
  })
  it('un cable largo ocupa las celdas de sus tramos y no las de su caja', () => {
    const celdas = new Celdas<string>()
    const L = [{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 4000 }]
    celdas.ponerLinea(L, 'a')
    // Dos tramos de 4000 unidades: unas 2 x 250 celdas, no las 63 mil de la caja.
    expect(celdas.ocupadas).toBeLessThan(600)
    expect(celdas.en({ minX: 2000, minY: 0, maxX: 2000, maxY: 0 }).has('a')).toBe(true)
    expect(celdas.en({ minX: 100, minY: 3000, maxX: 100, maxY: 3000 }).has('a')).toBe(false)
    celdas.quitarLinea(L, 'a')
    expect(celdas.en({ minX: 2000, minY: 0, maxX: 2000, maxY: 0 }).has('a')).toBe(false)
  })
  it('lo que ocuparía demasiadas celdas va aparte y toda consulta lo ve', () => {
    const celdas = new Celdas<string>()
    const zigzag = Array.from({ length: 400 }, (_, i) => ({ x: i % 2 ? 90000 : 0, y: i * 200 }))
    celdas.ponerLinea(zigzag, 'z')
    expect(celdas.ocupadas).toBe(0)
    expect(celdas.en({ minX: 5, minY: 5, maxX: 6, maxY: 6 }).has('z')).toBe(true)
    celdas.quitarLinea(zigzag, 'z')
    expect(celdas.en({ minX: 5, minY: 5, maxX: 6, maxY: 6 }).has('z')).toBe(false)
  })
})

const R = (id: string, x: number, y: number, rot: Pieza['rot'] = 0): Pieza => ({ id, tipo: 'resistencia', ref: id.toUpperCase(), x, y, rot, espejo: false, props: {} })

describe('etiquetas y sondas con lugar', () => {
  it('una etiqueta cuyos cuatro lados están tapados se corre por su cable hasta un lugar libre', () => {
    const doc = documentoVacio()
    const r1 = R('r1', 10, 0), r2 = R('r2', 60, 0)
    // Arriba y abajo del pin de R1 hay otras piezas; a la izquierda, R1; a la derecha, su propio cable.
    for (const p of [r1, r2, R('arriba', 14, -5, 90), R('abajo', 14, 5, 90)]) doc.piezas[p.id] = p
    const t = trazar({
      doc, lib, gen: idSecuencial(), proyectar: (x, y) => ({ x, y }),
      cables: [[{ x: 14, y: 0 }, { x: 16, y: 0 }], [{ x: 16, y: 0 }, { x: 56, y: 0 }]], uniones: [],
      pines: [{ x: 14, y: 0, pieza: r1, pin: '2', red: 0 }, { x: 56, y: 0, pieza: r2, pin: '1', red: 0 }],
      marcas: [{ x: 14, y: 0, red: 0, tipo: 'etiqueta' }],
      redes: [{ nombre: 'A', marca: 'A', clase: 'etiqueta', pines: [{ pieza: r1, pin: '2' }, { pieza: r2, pin: '1' }] }],
      nuevaPieza: () => r1
    })
    const e = t.etiquetas[0]!
    expect(e.y).toBe(0)
    expect(e.x).toBeGreaterThan(14)
    expect(e.x).toBeLessThan(56)
    for (const p of Object.values(doc.piezas)) expect(cajasSeCruzan(cajaEtiqueta(e), cuerpoEnMundo(p, lib.get(p.tipo)))).toBe(false)
    // El cable que quedaba más allá de la etiqueta se recorta: ningún extremo queda al aire.
    const toca = (q: { x: number; y: number }, id: string): boolean =>
      [...Object.values(doc.piezas).flatMap((p) => pinesEnMundo(p, lib.get(p.tipo)!)), ...Object.values(doc.etiquetas)].some((o) => o.x === q.x && o.y === q.y) ||
      Object.values(doc.cables).some((c) => c.id !== id && c.puntos.some((v, i) => (v.x === q.x && v.y === q.y) || (i > 0 && c.puntos[i - 1]!.y === v.y && v.y === q.y && q.x >= Math.min(c.puntos[i - 1]!.x, v.x) && q.x <= Math.max(c.puntos[i - 1]!.x, v.x))))
    for (const c of t.cables) for (const q of [c.puntos[0]!, c.puntos[c.puntos.length - 1]!]) expect(toca(q, c.id), JSON.stringify(q)).toBe(true)
  })
  it('la sonda de una red pegada a una pieza va al punto de sus cables con más aire', () => {
    const doc = documentoVacio()
    for (const p of [R('r1', 10, 0), R('r2', 60, 0)]) doc.piezas[p.id] = p
    doc.cables.c = { id: 'c', puntos: [{ x: 14, y: 0 }, { x: 56, y: 0 }] }
    const con = calcularConexiones(doc, lib)
    const red = con.redDeCable.get('c')
    const q = puntoParaSonda(doc, lib, con, red, { x: 14, y: 0 })
    expect(q.y).toBe(0)
    expect(q.x).toBeGreaterThan(20)
    expect(q.x).toBeLessThan(50)
  })
})

describe('trozos grandes de una red nombrada', () => {
  it('dos trozos de miles de puntos cada uno no arman todos los pares y terminan con un tope holgado', () => {
    const doc = documentoVacio()
    const r1 = R('r1', 10, 0), r2 = R('r2', 60, 0)
    doc.piezas.r1 = r1
    doc.piezas.r2 = r2
    // Serpentina ortogonal: miles de puntos en poco espacio.
    const zig = (x0: number): { x: number; y: number }[] => Array.from({ length: 4000 }, (_, i) => ({ x: x0 + (Math.floor((i + 1) / 2) % 2) * 5, y: -20 - Math.floor(i / 2) * 2.5 }))
    const t0 = performance.now()
    const t = trazar({
      doc, lib, gen: idSecuencial(), proyectar: (x, y) => ({ x, y }),
      cables: [[{ x: 14, y: 0 }, ...zig(14)], [{ x: 56, y: 0 }, ...zig(28)]], uniones: [],
      pines: [{ x: 14, y: 0, pieza: r1, pin: '2', red: 0 }, { x: 56, y: 0, pieza: r2, pin: '1', red: 0 }],
      marcas: [],
      redes: [{ nombre: 'VCC', marca: 'VCC', clase: 'alimentacion', pines: [{ pieza: r1, pin: '2' }, { pieza: r2, pin: '1' }] }],
      nuevaPieza: () => r1
    })
    expect(performance.now() - t0).toBeLessThan(30000)
    expect(t.cables.length + t.etiquetas.length + t.marcas.length).toBeGreaterThan(0)
  })
})

describe('orientación de etiquetas con índice de cables', () => {
  it('con un índice solo se consultan los cables cercanos y el giro es el mismo', () => {
    const doc = documentoVacio()
    doc.piezas.r1 = R('r1', 10, 0)
    for (let i = 0; i < 3000; i++) doc.cables[`l${i}`] = { id: `l${i}`, puntos: [{ x: 1000 + i * 4, y: 500 }, { x: 1000 + i * 4, y: 540 }] }
    doc.cables.cerca = { id: 'cerca', puntos: [{ x: 14, y: 0 }, { x: 30, y: 0 }] }
    const base = mejorGiro(doc, lib, { x: 14, y: 0 }, 'A')
    let entregados = 0
    const con = mejorGiro(doc, lib, { x: 14, y: 0 }, 'A', undefined, undefined, (caja) => {
      const r = Object.values(doc.cables).filter((c) => c.puntos.some((q) => q.x >= caja.minX && q.x <= caja.maxX && q.y >= caja.minY && q.y <= caja.maxY))
      entregados += r.length
      return r
    })
    expect(con).toEqual(base)
    expect(entregados).toBe(1)
  })
})

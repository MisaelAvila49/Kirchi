import { describe, expect, it } from 'vitest'
import {
  bytesSabInstrumentos, CANALES_PANTALLA, CIFRAS_COLUMNA, COLUMNAS_PANTALLA, crearVistas, escribirMultimetro, escribirPantalla, leerInstrumentos,
  MUESTRAS_CSV, N_MEDIDAS, versionDePantalla, type LecturaMultimetroSab, type PantallaSab
} from './protocoloInstrumentos'

const lecturaMm = (valor: number): LecturaMultimetroSab => ({ lecturas: 3, t: 0.75, ventana: 0.25, valor, frecuencia: Number.NaN, rango: 1e4, estado: 'ok', modo: 0, fundido: false, periodos: 0 })

function pantalla(ncol: number, version = 1): PantallaSab {
  const columnas = new Float32Array(CANALES_PANTALLA * ncol * CIFRAS_COLUMNA)
  for (let i = 0; i < columnas.length; i++) columnas[i] = i % 97
  return {
    version, t0: 0.01, dt: 1e-5, ncol, tDisparo: 0.0101, estado: 'disparado', tCaptura: 0.02, csv: { t0: 0.01, dt: 5e-6, n: MUESTRAS_CSV },
    completoHasta: [0.02, 0.02, 0.02, 0.02, 0.02],
    medidas: Array.from({ length: CANALES_PANTALLA }, (_, c) => Array.from({ length: N_MEDIDAS }, (_, m) => ({ valor: c * 10 + m, razon: m === 5 ? 'sin-periodos' : '' }))),
    columnas,
    muestras: new Float32Array(CANALES_PANTALLA * MUESTRAS_CSV).fill(1.5)
  } as PantallaSab
}

describe('sabInstrumentos', () => {
  it('sin instrumentos no hay memoria y con ellos mide lo justo', () => {
    expect(bytesSabInstrumentos(0, 0)).toBe(0)
    const uno = bytesSabInstrumentos(1, 1)
    const f32 = CANALES_PANTALLA * (COLUMNAS_PANTALLA * CIFRAS_COLUMNA + MUESTRAS_CSV) * 4
    expect(uno).toBeGreaterThan(f32)
    expect(bytesSabInstrumentos(2, 1) - uno).toBeGreaterThanOrEqual(f32)
    // Cuatro osciloscopios y dieciséis multímetros, el máximo: menos de 2 MB.
    expect(bytesSabInstrumentos(4, 16)).toBeLessThan(2e6)
  })

  it('lo escrito se lee igual: multímetros y pantallas', () => {
    const sab = new SharedArrayBuffer(bytesSabInstrumentos(2, 2))
    const v = crearVistas(sab, 2, 2)
    escribirMultimetro(v, 1, lecturaMm(2.381))
    const p = pantalla(1000)
    escribirPantalla(v, 1, p)
    const r = leerInstrumentos(v, { osciloscopio: 1 })
    expect(r.consistente).toBe(true)
    expect(r.multimetros[1]).toEqual({ ...lecturaMm(2.381), frecuencia: Number.NaN })
    const q = r.pantalla!
    expect(q).toMatchObject({ version: 1, t0: 0.01, dt: 1e-5, ncol: 1000, tDisparo: 0.0101, estado: 'disparado', tCaptura: 0.02, csv: { n: MUESTRAS_CSV } })
    expect(q.medidas[3][7]).toEqual({ valor: 37, razon: '' })
    expect(q.medidas[0][5].razon).toBe('sin-periodos')
    expect(Array.from(q.columnas.subarray(0, 5))).toEqual([0, 1, 2, 3, 4])
    expect(q.columnas).toHaveLength(CANALES_PANTALLA * 1000 * CIFRAS_COLUMNA)
    expect(q.muestras[0]).toBe(1.5)
    // El otro osciloscopio no se tocó.
    expect(leerInstrumentos(v, { osciloscopio: 0 }).pantalla!.version).toBe(0)
  })

  it('sin pedir un osciloscopio solo se leen los multímetros (lo que la interfaz lee a 10 Hz)', () => {
    const sab = new SharedArrayBuffer(bytesSabInstrumentos(1, 1))
    const v = crearVistas(sab, 1, 1)
    escribirPantalla(v, 0, pantalla(10))
    expect(leerInstrumentos(v).pantalla).toBeUndefined()
  })

  it('una escritura a medias no se acepta: reintenta y avisa', () => {
    const sab = new SharedArrayBuffer(bytesSabInstrumentos(0, 1))
    const v = crearVistas(sab, 0, 1)
    escribirMultimetro(v, 0, lecturaMm(1))
    Atomics.add(new Int32Array(sab), 0, 1) // el escritor empezó otra escritura
    expect(leerInstrumentos(v).consistente).toBe(false)
  })

  it('la lectura es una copia', () => {
    const sab = new SharedArrayBuffer(bytesSabInstrumentos(1, 0))
    const v = crearVistas(sab, 1, 0)
    escribirPantalla(v, 0, pantalla(4))
    const r = leerInstrumentos(v, { osciloscopio: 0 })
    escribirPantalla(v, 0, { ...pantalla(4, 2), columnas: new Float32Array(CANALES_PANTALLA * 4 * CIFRAS_COLUMNA).fill(-1) })
    expect(r.pantalla!.columnas[1]).toBe(1)
  })
})

describe('versión de una pantalla', () => {
  it('se lee sin copiar la pantalla; 0 sin osciloscopio', () => {
    const v = crearVistas(new SharedArrayBuffer(bytesSabInstrumentos(2, 0)), 2, 0)
    expect(versionDePantalla(v, 1)).toBe(0)
    escribirPantalla(v, 1, { ...leerInstrumentos(v, { osciloscopio: 1 }).pantalla!, version: 7 })
    expect(versionDePantalla(v, 1)).toBe(7)
    expect(versionDePantalla(v, 0)).toBe(0)
    expect(versionDePantalla(v, 5)).toBe(0)
  })
})

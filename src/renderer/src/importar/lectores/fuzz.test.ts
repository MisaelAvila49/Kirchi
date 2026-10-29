// @vitest-environment happy-dom
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { idSecuencial } from '../../doc/ids'
import { libreriaDePrueba } from '../../prueba/libreria'
import { decodificarTexto, detectarFormato } from '../detectar'
import { importarBytes } from '../importar'
import { leerFalstad } from './falstad'
import { leerKicad } from './kicad'
import { leerLtspice } from './ltspice'
import { leerProteus } from './proteus/proteus'
import { leerSpice } from './spice'

const lib = libreriaDePrueba().piezas
const FIXTURES = join(__dirname, '..', '__fixtures__')
const TOPE_MS = 1000
/** Tiempo de cada prueba completa (cientos de importaciones); el tope por entrada es TOPE_MS. */
const TIEMPO_TOTAL = 120_000

/** Generador pseudoaleatorio con semilla (mulberry32): las corridas se repiten igual. */
function semilla(s: number): () => number {
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const aleatorios = (az: () => number, n: number): Uint8Array => Uint8Array.from({ length: n }, () => Math.floor(az() * 256))
const texto = (s: string): Uint8Array => new TextEncoder().encode(s)

function mutar(az: () => number, b: Uint8Array): Uint8Array {
  const o = Array.from(b)
  const veces = 1 + Math.floor(az() * 20)
  for (let i = 0; i < veces && o.length; i++) {
    const p = Math.floor(az() * o.length)
    const k = az()
    if (k < 0.4) o[p] = Math.floor(az() * 256)
    else if (k < 0.6) o.splice(p, Math.floor(az() * 40))
    else if (k < 0.8) o.splice(p, 0, ...o.slice(p, p + Math.floor(az() * 60)))
    else o.splice(p, 0, ...aleatorios(az, 1 + Math.floor(az() * 8)))
  }
  return Uint8Array.from(o)
}

type LectorTexto = (t: string, n: string) => unknown
const LECTORES_TEXTO: Record<string, { leer: LectorTexto; vocabulario: string[]; unir: string }> = {
  spice: {
    leer: leerSpice,
    unir: ' ',
    vocabulario: ['R1', 'C2', 'L3', 'Q1', 'M1', 'K1', 'X1', 'V1', 'I1', 'E1', 'B1', '.subckt', '.ends', '.model', '.tran', '.ac', '.dc', '.print', '.control', '.endc', '.param', '+', '*', '0', 'a', 'b', '1k', '4.7u', 'pulse(', 'sin(', 'v(', ')', '(', '=', ',', 'off', '\n', '\n']
  },
  falstad: {
    leer: leerFalstad,
    unir: ' ',
    vocabulario: ['$', 'w', 'r', 'c', 'l', 'v', 'R', '38', 'o', 't', 'g', 'a', '0', '16', '32', '-16', '1000', '0.5', 'x', '\n', '\n']
  },
  ltspice: {
    leer: leerLtspice,
    unir: ' ',
    vocabulario: ['Version', 'SHEET', 'WIRE', 'FLAG', 'SYMBOL', 'SYMATTR', 'InstName', 'Value', 'TEXT', 'R0', 'M90', 'res', '0', '16', '-32', '!', '.tran', ';', '\\n', '\n', '\n']
  },
  kicad: {
    leer: (t, n) => leerKicad(t, n),
    unir: '',
    vocabulario: ['(', ')', '(', ')', 'kicad_sch', 'version', 'wire', 'pts', 'xy', 'symbol', 'lib_symbols', 'lib_id', 'at', 'unit', 'pin', 'label', 'sheet', 'property', '"', 'x', '0', '10', '-5.5', ' ', ' ']
  }
}
const EXTENSION: Record<string, string> = { spice: 'cir', falstad: 'txt', ltspice: 'asc', kicad: 'kicad_sch' }

function sopa(az: () => number, formato: string, n: number): Uint8Array {
  const { vocabulario, unir } = LECTORES_TEXTO[formato] as (typeof LECTORES_TEXTO)[string]
  return texto(Array.from({ length: n }, () => vocabulario[Math.floor(az() * vocabulario.length)]).join(unir))
}

/** El resultado de importar siempre es {ok} y, si falla, trae su motivo; y no tarda más del tope. */
function importaBien(nombre: string, b: Uint8Array): void {
  const t0 = performance.now()
  const r = importarBytes(nombre, b, lib, idSecuencial())
  const ms = performance.now() - t0
  expect(typeof r.ok, nombre).toBe('boolean')
  if (!r.ok) expect(typeof r.motivo).toBe('string')
  expect(ms, `${nombre} tardó ${ms.toFixed(0)} ms`).toBeLessThan(TOPE_MS)
}

/** Los lectores solo lanzan errores propios del formato, nunca fallos de programación ni desbordes de pila. */
function leeBien(leer: () => unknown, etiqueta: string): void {
  const t0 = performance.now()
  try {
    leer()
  } catch (e) {
    const pila = e instanceof Error ? (e.stack ?? '').split(/\n/).slice(1, 3).join(' | ') : ''
    expect(e instanceof Error && !['RangeError', 'TypeError', 'ReferenceError'].includes(e.name), `${etiqueta} lanzó ${String(e)} ${pila}`).toBe(true)
  }
  expect(performance.now() - t0, etiqueta).toBeLessThan(TOPE_MS)
}

function fixtures(): { formato: string; nombre: string; bytes: Uint8Array }[] {
  return Object.keys(LECTORES_TEXTO).flatMap((formato) =>
    readdirSync(join(FIXTURES, formato)).map((nombre) => ({ formato, nombre, bytes: new Uint8Array(readFileSync(join(FIXTURES, formato, nombre))) }))
  )
}

/** Proyecto de Proteus mínimo: un zip con el esquema (encabezado, bloque de objetos y relleno) y su XML. */
const proyecto = (dsn: Uint8Array): Uint8Array => zipSync({ 'ROOT.DSN': dsn, 'PROJECT.XML': texto('<PROJECT RELEASE="813" FILEVER="812"/>') })
const dsnBase = (az: () => number): Uint8Array => Uint8Array.from([...texto('ISIS CIRCUIT FILE\x1a\x00'), ...aleatorios(az, 40), ...texto('OBJECT DATA\0'), ...aleatorios(az, 300), 0xff])

describe('fuzz de los lectores', () => {
  it('bytes aleatorios con cada extensión no rompen la importación', () => {
    const az = semilla(1)
    for (const nombre of ['a.cir', 'a.txt', 'a.asc', 'a.kicad_sch', 'a.pdsprj', 'a.dsn'])
      for (let i = 0; i < 40; i++) importaBien(nombre, aleatorios(az, Math.floor(az() * 3000)))
  }, TIEMPO_TOTAL)
  it('texto armado con el vocabulario de cada formato no rompe ni tarda', () => {
    const az = semilla(2)
    for (const [formato, { leer }] of Object.entries(LECTORES_TEXTO))
      for (let i = 0; i < 25; i++) {
        const b = sopa(az, formato, Math.floor(az() * 2000))
        const nombre = `a.${EXTENSION[formato]}`
        leeBien(() => leer(decodificarTexto(b), nombre), `sopa ${formato} #${i}`)
        importaBien(nombre, b)
      }
  }, TIEMPO_TOTAL)
  it('los ejemplos truncados en 50 puntos no rompen la importación', () => {
    for (const f of fixtures())
      for (let i = 0; i < 50; i++) importaBien(f.nombre, f.bytes.subarray(0, Math.floor((f.bytes.length * i) / 50)))
  }, TIEMPO_TOTAL)
  it('los ejemplos con bytes mutados no rompen los lectores ni la importación', () => {
    const az = semilla(3)
    for (const f of fixtures())
      for (let i = 0; i < 40; i++) {
        const b = mutar(az, f.bytes)
        leeBien(() => (LECTORES_TEXTO[f.formato] as (typeof LECTORES_TEXTO)[string]).leer(decodificarTexto(b), f.nombre), `${f.nombre} mutado #${i}`)
        importaBien(f.nombre, b)
      }
  }, TIEMPO_TOTAL)
  it('un proyecto de Proteus con esquema aleatorio, truncado o mutado no rompe la importación', () => {
    const az = semilla(4)
    for (let i = 0; i < 40; i++) {
      const dsn = dsnBase(az)
      const pr = proyecto(dsn)
      leeBien(() => leerProteus(pr, 'a.pdsprj'), `proteus #${i}`)
      importaBien('a.pdsprj', pr)
      importaBien('a.pdsprj', proyecto(mutar(az, dsn)))
      importaBien('a.pdsprj', pr.subarray(0, Math.floor(az() * pr.length)))
      importaBien('a.pdsprj', mutar(az, pr))
    }
  }, TIEMPO_TOTAL)
  it('detectarFormato acepta cualquier entrada sin lanzar', () => {
    const az = semilla(5)
    for (let i = 0; i < 100; i++) expect(() => detectarFormato('a.bin', aleatorios(az, Math.floor(az() * 500)))).not.toThrow()
  }, TIEMPO_TOTAL)
})

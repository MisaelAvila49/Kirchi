// @vitest-environment happy-dom
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { buscar } from '../buscador/buscar'
import { calcularConexiones, clavePin } from '../conexiones/conexiones'
import { documentoVacio, type Documento, type Pieza, type PinPropio } from '../doc/tipos'
import { colisiona, cuerpoEnMundo } from '../editor/colision'
import type { Informe } from '../importar/informe'
import { defDe } from '../piezas/sinEquivalencia'
import { pinesEnMundo } from '../piezas/transformar'
import { libreriaDePrueba } from '../prueba/libreria'
import { catalogo } from '../ui/catalogo'
import { escribirKir, FORMATO_ACTUAL, formatoDe, leerKir, serializarDocumento } from './kir'

const lib = libreriaDePrueba().piezas
const base = lib.get('sin-equivalencia')!
const pines: PinPropio[] = [
  { id: 'a', nombre: 'VCC', numero: '8', lado: 'der' },
  { id: 'b', nombre: 'IN', numero: '1', lado: 'izq' },
  { id: 'c', nombre: 'OUT', numero: '2', lado: 'izq' },
  { id: 'd', nombre: 'GND', numero: '4', lado: 'izq' },
  { id: 'e', nombre: 'CTRL', numero: '5', lado: 'der' },
  { id: 'f', nombre: 'NC', lado: 'der' }
]
const caja = (extra: Partial<Pieza> = {}): Pieza => ({ id: 'u1', tipo: 'sin-equivalencia', ref: 'U1', x: 20, y: 10, rot: 0, espejo: false, props: { nombre: 'XYZ123', origen: 'KiCad' }, pines, ...extra })
const resistencia = (x: number, y: number): Pieza => ({ id: 'r1', tipo: 'resistencia', ref: 'R1', x, y, rot: 0, espejo: false, props: {} })
const informe: Informe = {
  origen: { formato: 'kicad', version: '8', nombre: 'placa.kicad_sch' },
  total: 3,
  convertidas: 2,
  aproximadas: [],
  sinEquivalencia: [{ id: 'u1', ref: 'U1', tipo: 'XYZ123' }],
  redesConEtiqueta: [],
  analisis: [],
  omitidas: [],
  avisos: ['Una nota']
}
const zip = (archivos: Record<string, string>) => zipSync(Object.fromEntries(Object.entries(archivos).map(([k, v]) => [k, strToU8(v)])))
const manif = (formato: number) => JSON.stringify({ app: 'kirchi', formato, version: 'x' })
const docCon = (p: Pieza, resto: Partial<Documento> = {}): Documento => ({ ...documentoVacio(), piezas: { [p.id]: p }, ...resto })

describe('.kir con caja gris e informe (formato 9)', () => {
  it('una caja de 6 pines y el informe hacen la ida y vuelta y piden el formato 9', () => {
    const d = docCon(caja(), { importacion: informe })
    expect(formatoDe(d)).toBe(9)
    const bytes = escribirKir(d, '2.2.0')
    expect(JSON.parse(strFromU8(unzipSync(bytes)['manifest.json'])).formato).toBe(9)
    const r = leerKir(bytes)
    if (!r.ok) throw new Error(r.error)
    expect(r.avisos).toEqual([])
    expect(r.doc).toEqual(d)
  })

  it('sin cajas ni informe el archivo sigue siendo el de antes', () => {
    expect(FORMATO_ACTUAL).toBe(9)
    expect(formatoDe(docCon(resistencia(0, 0)))).toBe(1)
  })

  it('un archivo de formato 8 abre igual y en edición', () => {
    const r = leerKir(zip({ 'manifest.json': manif(8), 'circuito.json': serializarDocumento(docCon(resistencia(0, 0))) }))
    if (!r.ok) throw new Error(r.error)
    expect(r.soloLectura).toBe(false)
    expect(r.avisos).toEqual([])
  })

  it('un archivo de formato mayor se abre en solo lectura', () => {
    const r = leerKir(zip({ 'manifest.json': manif(FORMATO_ACTUAL + 1), 'circuito.json': '{}' }))
    if (!r.ok) throw new Error(r.error)
    expect(r.soloLectura).toBe(true)
  })

  it('los pines en una pieza que no es la caja se descartan con aviso', () => {
    const d = docCon({ ...resistencia(0, 0), pines })
    const r = leerKir(zip({ 'manifest.json': manif(9), 'circuito.json': JSON.stringify(d) }))
    if (!r.ok) throw new Error(r.error)
    expect(r.doc.piezas.r1.pines).toBeUndefined()
    expect(r.avisos).toEqual(['Se descartaron los pines de R1: solo los lleva una pieza sin equivalencia.'])
  })

  it('los pines repetidos, sin lado o sin nombre se descartan con aviso y los buenos se quedan; el tope es 128', () => {
    const raros = [...pines, { id: 'a', nombre: 'DUP', lado: 'izq' }, { id: 'z', nombre: 'Z', lado: 'arriba' }, { id: 'y', nombre: '', lado: 'izq' }]
    const r = leerKir(zip({ 'manifest.json': manif(9), 'circuito.json': JSON.stringify(docCon(caja({ pines: raros as PinPropio[] }))) }))
    if (!r.ok) throw new Error(r.error)
    expect(r.doc.piezas.u1.pines).toEqual(pines)
    expect(r.avisos).toEqual(['Se descartaron 3 pines de U1: no son válidos.'])
    const muchos = Array.from({ length: 130 }, (_, i) => ({ id: `p${i}`, nombre: `P${i}`, lado: 'izq' }))
    const m = leerKir(zip({ 'manifest.json': manif(9), 'circuito.json': JSON.stringify(docCon(caja({ pines: muchos as PinPropio[] }))) }))
    if (!m.ok) throw new Error(m.error)
    expect(m.doc.piezas.u1.pines).toHaveLength(128)
  })

  it('un informe que no valida se descarta con aviso', () => {
    const d = { ...docCon(caja()), importacion: { origen: 3 } }
    const r = leerKir(zip({ 'manifest.json': manif(9), 'circuito.json': JSON.stringify(d) }))
    if (!r.ok) throw new Error(r.error)
    expect(r.doc.importacion).toBeUndefined()
    expect(r.avisos).toEqual(['Se descartó el informe de importación: no es válido.'])
  })
})

describe('caja gris en el editor', () => {
  it('girada 90 y reflejada, un cable en un pin suyo lo une a la resistencia', () => {
    const u = caja({ rot: 90, espejo: true })
    const r = resistencia(0, 0)
    const pr = pinesEnMundo(r, lib.get('resistencia')!)[0]
    const b = pinesEnMundo(u, base).find((q) => q.id === 'b')!
    const d: Documento = { ...documentoVacio(), piezas: { u1: u, r1: r }, cables: { c1: { id: 'c1', puntos: [{ x: b.x, y: b.y }, { x: b.x, y: pr.y }, { x: pr.x, y: pr.y }] } } }
    const con = calcularConexiones(d, lib)
    const red = con.redDePin.get(clavePin('u1', 'b'))
    expect(red).toBeDefined()
    expect(red).toBe(con.redDePin.get(clavePin('r1', pr.id)))
    expect(con.redDePin.get(clavePin('u1', 'c'))).not.toBe(red)
  })

  it('la colisión usa el tamaño de la caja: una pieza dentro de su cuerpo choca y una lejos no', () => {
    const u = caja({ x: 0, y: 0 })
    const cuerpo = cuerpoEnMundo(u, defDe(u, base))
    const doc = docCon(u)
    expect(colisiona(doc, lib, resistencia(0, 0))).toBe('u1')
    expect(colisiona(doc, lib, resistencia(cuerpo.maxX + 30, 0))).toBeNull()
  })

  it('la Librería y el buscador no la ofrecen', () => {
    expect(buscar('sin equivalencia', lib).map((r) => r.def.id)).not.toContain('sin-equivalencia')
    expect(buscar('u', lib).map((r) => r.def.id)).not.toContain('sin-equivalencia')
    expect(JSON.stringify(catalogo(lib))).not.toContain('sin-equivalencia')
  })
})

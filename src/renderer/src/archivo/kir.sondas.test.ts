import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import type { Documento } from '../doc/tipos'
import { escribirKir, FORMATO_ACTUAL, formatoDe, leerKir, leerKirCon, serializarDocumento } from './kir'

const osc = { id: 'o', tipo: 'osciloscopio', ref: 'XSC1', x: 80, y: 0, rot: 0 as const, espejo: false, props: {} }
const base = (): Documento => ({ piezas: { o: osc }, cables: { c: { id: 'c', puntos: [{ x: 0, y: 0 }, { x: 20, y: 0 }] } }, etiquetas: {}, notas: {} })
const conSondas = (): Documento => ({
  ...base(),
  sondas: {
    s1: { id: 's1', tipo: 'osciloscopio', x: 10, y: 0, instrumento: 'o', entrada: 'A' },
    s2: { id: 's2', tipo: 'voltaje', x: 4, y: 0 },
    s3: { id: 's3', tipo: 'corriente', x: 14, y: 0, sentido: 'derecha' }
  }
})
const crudo = (datos: unknown, formato = 5) =>
  zipSync({ 'manifest.json': strToU8(JSON.stringify({ app: 'kirchi', formato, version: 'x' })), 'circuito.json': strToU8(JSON.stringify(datos)) })

describe('sondas en el .kir (formato 5)', () => {
  it('sin sondas, el archivo es el de antes', () => {
    expect(FORMATO_ACTUAL).toBe(9)
    expect(formatoDe(base())).toBe(1)
    expect(formatoDe({ ...base(), sondas: {} })).toBe(1)
    expect(serializarDocumento({ ...base(), sondas: {} })).toBe(serializarDocumento(base()))
    expect(escribirKir({ ...base(), sondas: {} }, 't')).toEqual(escribirKir(base(), 't'))
  })

  it('con sondas va en formato 5 y vuelve igual', () => {
    const doc = conSondas()
    expect(formatoDe(doc)).toBe(5)
    const bytes = escribirKir(doc, 't')
    expect(JSON.parse(strFromU8(unzipSync(bytes)['manifest.json'])).formato).toBe(5)
    const l = leerKir(bytes)
    expect(l.ok).toBe(true)
    if (!l.ok) return
    expect(l.doc.sondas).toEqual(doc.sondas)
    expect(l.soloLectura).toBe(false)
    expect(l.avisos).toEqual([])
  })

  it('una versión que solo conoce el formato 4 lo abre en solo lectura', () => {
    const l = leerKirCon(escribirKir(conSondas(), 't'), { 1: (d) => d, 2: (d) => d, 3: (d) => d }, 4)
    expect(l.ok && l.soloLectura).toBe(true)
  })

  it('un archivo de formato 4 se abre sin sondas', () => {
    const l = leerKir(crudo(JSON.parse(serializarDocumento(base())), 4))
    expect(l.ok && l.doc.sondas).toBeUndefined()
  })

  it('lo alterado se descarta con su aviso y el archivo se abre', () => {
    const datos = JSON.parse(serializarDocumento(conSondas()))
    datos.sondas.s4 = { id: 's4', tipo: 'osciloscopio', x: 1, y: 1, instrumento: 'nadie', entrada: 'B' }
    datos.sondas.s5 = { id: 's5', tipo: 'osciloscopio', x: 2, y: 2, instrumento: 'o', entrada: 'A' }
    datos.sondas.s6 = { id: 's6', tipo: 'corriente', x: 3, y: 3, sentido: 'diagonal' }
    datos.sondas.s7 = { id: 's7', tipo: 'voltaje', x: 2 ** 21, y: 0 }
    datos.sondas.mal = { id: 'otro', tipo: 'voltaje', x: 0, y: 0 }
    const l = leerKir(crudo(datos))
    expect(l.ok).toBe(true)
    if (!l.ok) return
    expect(Object.keys(l.doc.sondas!).sort()).toEqual(['s1', 's2', 's3'])
    expect(l.avisos).toEqual(
      expect.arrayContaining([
        'Se descartó la sonda B de un instrumento que no está en el circuito.',
        'Se descartó una sonda repetida de la entrada A de XSC1.',
        'Se descartó una sonda de corriente: sentido inválido.',
        'Se descartó una sonda de voltaje: posición fuera de rango.',
        'Se descartó una sonda de voltaje: su id no coincide con la llave.'
      ])
    )
    expect(l.avisos).toHaveLength(5)
  })

  it('una sonda de un instrumento que no está, aunque se llame como un método de los objetos, se descarta', () => {
    const datos = JSON.parse(serializarDocumento(base()))
    datos.sondas = { s: { id: 's', tipo: 'multimetro', x: 1, y: 1, instrumento: 'toString', entrada: '+' } }
    const l = leerKir(crudo(datos))
    expect(l.ok && l.doc.sondas).toBeUndefined()
    expect(l.ok && l.avisos).toEqual(['Se descartó una sonda: sin instrumento.'])
  })

  it('una lista dañada se descarta entera', () => {
    const datos = { ...JSON.parse(serializarDocumento(base())), sondas: [1, 2] }
    const l = leerKir(crudo(datos))
    expect(l.ok && l.doc.sondas).toBeUndefined()
    expect(l.ok && l.avisos).toEqual(['Se descartaron las sondas: la lista está dañada.'])
  })

  it('las que no valen no cuentan para el tope', () => {
    const datos = JSON.parse(serializarDocumento(base()))
    const malas = Array.from({ length: 10 }, (_, i) => [`m${i}`, { id: `m${i}`, tipo: 'voltaje', x: 0.5, y: 0 }])
    const buenas = Array.from({ length: 250 }, (_, i) => [`v${i}`, { id: `v${i}`, tipo: 'voltaje', x: i, y: 0 }])
    datos.sondas = Object.fromEntries([...malas, ...buenas])
    const l = leerKir(crudo(datos))
    expect(l.ok && Object.keys(l.doc.sondas!).length).toBe(250)
    expect(l.ok && l.avisos.filter((a) => a.includes('admite hasta'))).toEqual([])
  })

  it('con más de 256 se quedan las primeras', () => {
    const datos = JSON.parse(serializarDocumento(base()))
    datos.sondas = Object.fromEntries(Array.from({ length: 260 }, (_, i) => [`v${i}`, { id: `v${i}`, tipo: 'voltaje', x: i, y: 0 }]))
    const l = leerKir(crudo(datos))
    expect(l.ok && Object.keys(l.doc.sondas!).length).toBe(256)
    expect(l.ok && l.avisos).toContain('Se descartaron 4 sondas: un circuito admite hasta 256.')
  })

  it('un medidor rápido pide el formato 8, conserva todos sus campos y una versión de formato 7 lo abre en solo lectura', () => {
    const doc = base()
    const medidor = { id: 'm1', tipo: 'medidor' as const, x: 3, y: 4, magnitud: 'corriente' as const, modo: 'ac' as const, pantalla: { dx: -2, dy: 5 }, ref: 'M1' }
    doc.sondas = { m1: medidor }
    expect(formatoDe(doc)).toBe(8)
    expect(formatoDe(base())).toBe(1)
    const bytes = escribirKir(doc, 't')
    expect(JSON.parse(strFromU8(unzipSync(bytes)['manifest.json'])).formato).toBe(8)
    const l = leerKir(bytes)
    expect(l.ok && l.soloLectura).toBe(false)
    expect(l.ok && l.doc.sondas).toEqual({ m1: medidor })
    const vieja = leerKirCon(bytes, { 1: (d) => d, 2: (d) => d, 3: (d) => d, 4: (d) => d, 5: (d) => d, 6: (d) => d }, 7)
    expect(vieja.ok && vieja.soloLectura).toBe(true)
  })
})

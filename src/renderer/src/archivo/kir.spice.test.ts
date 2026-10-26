import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { documentoVacio, type Documento } from '../doc/tipos'
import { escribirKir, formatoDe, leerKir, serializarDocumento } from './kir'

const base = (): Documento => {
  const d = documentoVacio()
  d.piezas.q = { id: 'q', tipo: 'npn', ref: 'Q1', x: 0, y: 0, rot: 0, espejo: false, props: { modelo: '2N2222' } }
  return d
}
const conSpice = (): Documento => {
  const d = base()
  d.piezas.q = { ...d.piezas.q, spice: { bf: 200, is: 1e-14 } }
  return d
}
const crudo = (datos: unknown, formato = 6) =>
  zipSync({ 'manifest.json': strToU8(JSON.stringify({ app: 'kirchi', formato, version: 'x' })), 'circuito.json': strToU8(JSON.stringify(datos)) })

describe('modelo Personalizado en el .kir (formato 6)', () => {
  it('sin modelo propio, el archivo es el de antes (mismos bytes), también con un spice vacío', () => {
    expect(formatoDe(base())).toBe(1)
    const vacio = base()
    vacio.piezas.q = { ...vacio.piezas.q, spice: {} }
    expect(formatoDe(vacio)).toBe(1)
    expect(serializarDocumento(vacio)).toBe(serializarDocumento(base()))
    expect(escribirKir(vacio, 't')).toEqual(escribirKir(base(), 't'))
  })

  it('con modelo propio va en formato 6 y vuelve igual', () => {
    const doc = conSpice()
    expect(formatoDe(doc)).toBe(6)
    const bytes = escribirKir(doc, 't')
    expect(JSON.parse(strFromU8(unzipSync(bytes)['manifest.json'])).formato).toBe(6)
    const l = leerKir(bytes)
    expect(l.ok).toBe(true)
    if (!l.ok) return
    expect(l.doc.piezas.q.spice).toEqual({ bf: 200, is: 1e-14 })
    expect(l.soloLectura).toBe(false)
    expect(l.avisos).toEqual([])
  })

  it('un archivo del formato 5 abre sin tocar nada y sin modelo propio', () => {
    const datos = JSON.parse(serializarDocumento(base()))
    const l = leerKir(crudo(datos, 5))
    expect(l.ok).toBe(true)
    if (!l.ok) return
    expect(l.doc.piezas.q.spice).toBeUndefined()
    expect(l.soloLectura).toBe(false)
  })

  it('lo que no vale del modelo propio se descarta con un aviso y la pieza se queda', () => {
    const datos = JSON.parse(serializarDocumento(conSpice()))
    datos.piezas.q.spice = { bf: 150, nada: 'x', xx: Infinity }
    const l = leerKir(crudo(datos))
    expect(l.ok).toBe(true)
    if (!l.ok) return
    expect(l.doc.piezas.q.spice).toEqual({ bf: 150 })
    expect(l.avisos).toEqual(['Se descartó 2 parámetros del modelo propio de Q1: no es válido.'])
    datos.piezas.q.spice = 7
    const m = leerKir(crudo(datos))
    expect(m.ok && m.doc.piezas.q.spice).toBeUndefined()
    expect(m.ok && m.avisos).toEqual(['Se descartó el modelo propio de Q1: no es válido.'])
  })
})

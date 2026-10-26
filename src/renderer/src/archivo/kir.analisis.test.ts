import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import type { AnalisisDoc } from '../../../compartido/analisis/config'
import { documentoVacio, type Documento } from '../doc/tipos'
import { escribirKir, formatoDe, leerKir, serializarDocumento } from './kir'

const base = (): Documento => {
  const d = documentoVacio()
  d.piezas.r = { id: 'r', tipo: 'resistencia', ref: 'R1', x: 0, y: 0, rot: 0, espejo: false, props: { valor: '1k' } }
  return d
}
const bode: AnalisisDoc = { id: 'a1', nombre: 'Bode', config: { tipo: 'ac', barrido: 'dec', puntos: 20, desde: 10, hasta: 1e5, fuente: 'v', magnitud: 1 }, parametro: { pieza: 'r', modo: 'lista', valores: [100, 1000] } }
const crudo = (datos: unknown, formato = 7) =>
  zipSync({ 'manifest.json': strToU8(JSON.stringify({ app: 'kirchi', formato, version: 'x' })), 'circuito.json': strToU8(JSON.stringify(datos)) })

describe('analisis en el .kir (formato 7)', () => {
  it('sin analisis el archivo es el de antes, tambien con la coleccion vacia', () => {
    const vacio = { ...base(), analisis: {} }
    expect(formatoDe(vacio)).toBe(1)
    expect(serializarDocumento(vacio)).toBe(serializarDocumento(base()))
    expect(escribirKir(vacio, 't')).toEqual(escribirKir(base(), 't'))
  })
  it('con analisis va en formato 7 y vuelve igual', () => {
    const doc = { ...base(), analisis: { a1: bode } }
    expect(formatoDe(doc)).toBe(7)
    const bytes = escribirKir(doc, 't')
    expect(JSON.parse(strFromU8(unzipSync(bytes)['manifest.json'])).formato).toBe(7)
    const l = leerKir(bytes)
    expect(l.ok && l.doc.analisis).toEqual({ a1: bode })
    expect(l.ok && l.soloLectura).toBe(false)
  })
  it('un archivo del formato 6 abre sin analisis', () => {
    const l = leerKir(crudo(JSON.parse(serializarDocumento(base())), 6))
    expect(l.ok && l.doc.analisis).toBeUndefined()
  })
  it('lo malo se descarta con aviso y lo bueno se queda', () => {
    const datos = {
      ...JSON.parse(serializarDocumento(base())),
      analisis: {
        a1: bode,
        a2: { id: 'a2', nombre: 'Malo', config: { tipo: 'tran', fin: -1 } },
        a3: { id: 'a3', nombre: 'Enorme', config: { tipo: 'tran', fin: 1, maximo: 1e-9 } },
        a4: { id: 'a4', nombre: 'Corridas', config: { tipo: 'op' }, parametro: { pieza: 'r', modo: 'lista', valores: Array(500).fill(1) } },
        a5: { id: 'otro', nombre: 'Id distinto', config: { tipo: 'op' } },
        __proto__: { id: '__proto__', nombre: 'x', config: { tipo: 'op' } }
      }
    }
    const l = leerKir(crudo(datos))
    expect(l.ok).toBe(true)
    if (!l.ok) return
    expect(Object.keys(l.doc.analisis ?? {})).toEqual(['a1'])
    expect(l.avisos.filter((a) => a.includes('análisis')).length).toBeGreaterThanOrEqual(4)
  })
  it('tope de analisis por documento', () => {
    const analisis = Object.fromEntries(Array.from({ length: 70 }, (_, i) => [`a${i}`, { id: `a${i}`, nombre: 'x', config: { tipo: 'op' } }]))
    const l = leerKir(crudo({ ...JSON.parse(serializarDocumento(base())), analisis }))
    expect(l.ok && Object.keys(l.doc.analisis!).length).toBe(64)
  })
})

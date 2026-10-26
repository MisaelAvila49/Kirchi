import { describe, expect, it } from 'vitest'
import { idSecuencial } from './ids'
import { siguienteReferencia, siguienteReferenciaMedidor } from './referencias'
import { documentoVacio, type Documento } from './tipos'

const con = (...refs: string[]): Documento => {
  const d = documentoVacio()
  refs.forEach((ref, i) => (d.piezas[`p${i}`] = { id: `p${i}`, tipo: 't', ref, x: 0, y: 0, rot: 0, espejo: false, props: {} }))
  return d
}

describe('referencias', () => {
  it('empieza en 1 y sigue al mayor existente', () => {
    expect(siguienteReferencia(documentoVacio(), 'R')).toBe('R1')
    expect(siguienteReferencia(con('R1', 'R3', 'C7'), 'R')).toBe('R4')
    expect(siguienteReferencia(con('RV2'), 'R')).toBe('R1')
  })

  it('el prefijo se escapa para la expresión regular', () => {
    expect(siguienteReferencia(con('RX1', 'R5'), 'R.')).toBe('R.1')
    expect(siguienteReferencia(con('R.2'), 'R.')).toBe('R.3')
  })

  it('idSecuencial es determinista', () => {
    const g = idSecuencial()
    expect([g('p'), g('c'), g('p')]).toEqual(['p_0001', 'c_0002', 'p_0003'])
  })

  it('el medidor rápido sigue su propia serie M y no repite la de una pieza', () => {
    expect(siguienteReferenciaMedidor(documentoVacio())).toBe('M1')
    const d = con('M2', 'R9')
    expect(siguienteReferenciaMedidor(d)).toBe('M3')
    d.sondas = { a: { id: 'a', tipo: 'medidor', x: 0, y: 0, magnitud: 'voltaje', modo: 'dc', pantalla: { dx: 0, dy: 0 }, ref: 'M5' } }
    expect(siguienteReferenciaMedidor(d)).toBe('M6')
  })
})

import { describe, expect, it } from 'vitest'
import { cadenaBinaria, leerHojas } from './dsn'
import { Simbolos } from './simbolos'

const ENCABEZADO = 'ISIS CIRCUIT FILE\x1a\x00'
const bytes = (s: string): Uint8Array => Uint8Array.from(s, (c) => c.charCodeAt(0))
const rapido = (f: () => unknown, ms: number): void => {
  const t0 = performance.now()
  f()
  expect(performance.now() - t0).toBeLessThan(ms)
}

describe('hojas de Proteus con encabezados repetidos', () => {
  it('10,000 encabezados ante un solo bloque de objetos dan una sola hoja', () => {
    const d = bytes(ENCABEZADO.repeat(10_000) + 'OBJECT DATA\0\xff')
    let hojas: ReturnType<typeof leerHojas> = []
    rapido(() => (hojas = leerHojas(d, cadenaBinaria(d), 813)), 500)
    expect(hojas).toHaveLength(1)
  })
  it('10,000 encabezados sin bloque de objetos terminan rápido con un solo error', () => {
    const d = bytes(ENCABEZADO.repeat(10_000) + 'x'.repeat(2_000_000))
    let hojas: ReturnType<typeof leerHojas> = []
    rapido(() => (hojas = leerHojas(d, cadenaBinaria(d), 813)), 500)
    expect(hojas).toHaveLength(1)
    expect(hojas[0]?.error).toMatch(/sin datos/)
  })
  it('lee a lo más 64 hojas y deja constancia', () => {
    const d = bytes((ENCABEZADO + 'OBJECT DATA\0\xff').repeat(200))
    const hojas = leerHojas(d, cadenaBinaria(d), 813)
    expect(hojas).toHaveLength(65)
    expect(hojas[64]?.error).toMatch(/64/)
  })
})

describe('búsqueda de símbolos incrustados', () => {
  it('no se vuelve cuadrática con el nombre repetido miles de veces', () => {
    const s = '\x03ABC'.repeat(50_000) + '$PIN'.repeat(10) + '{*DEVICE}' + 'ISIS CIRCUIT FILE'
    const d = bytes(s)
    rapido(() => new Simbolos(d, s).pines('ABC'), 300)
  })
})

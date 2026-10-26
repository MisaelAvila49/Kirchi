import { describe, expect, it } from 'vitest'
import { documentoVacio } from '../doc/tipos'
import { documentoDemo } from './demo'

describe('documentoDemo', () => {
  it('genera n resistencias reales con un cable cada una y referencias únicas', () => {
    const d = documentoDemo(25)
    expect(Object.keys(d.piezas)).toHaveLength(25)
    expect(Object.keys(d.cables)).toHaveLength(25)
    expect(new Set(Object.values(d.piezas).map((p) => p.ref)).size).toBe(25)
    expect(d.piezas.p24).toMatchObject({ tipo: 'resistencia', x: 80, y: 80, props: { valor: '1k' } })
    expect(documentoDemo(0)).toEqual(documentoVacio())
  })
})

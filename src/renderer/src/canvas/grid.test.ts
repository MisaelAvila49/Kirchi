import { describe, expect, it } from 'vitest'
import { FS_REJILLA } from './grid'

describe('sombreador de la rejilla', () => {
  it('el punto oscuro cae cada 6 celdas (12 unidades, 15 mm) y los niveles gruesos conservan la razón de 6', () => {
    expect(FS_REJILLA).toContain('float paso = 12.0;')
    expect(FS_REJILLA.match(/paso \*= 6.0;/g)).toHaveLength(2)
    expect(FS_REJILLA).toContain('punto(w, paso * 6.0, 1.6)')
    expect(FS_REJILLA).toContain('punto(w, 2.0, 1.0)')
    expect(FS_REJILLA).not.toMatch(/5\.0|10\.0/)
  })
})

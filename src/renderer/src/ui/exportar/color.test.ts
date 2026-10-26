import { describe, expect, it } from 'vitest'
import { conAlfa } from './color'

describe('color con transparencia', () => {
  it('pasa #rrggbb a rgba y acota la transparencia', () => {
    expect(conAlfa('#00876F', 0.2)).toBe('rgba(0, 135, 111, 0.2)')
    expect(conAlfa('#ffffff', 3)).toBe('rgba(255, 255, 255, 1)')
    expect(conAlfa('#ffffff', -1)).toBe('rgba(255, 255, 255, 0)')
  })
  it('lo que no es de seis cifras queda igual', () => {
    expect(conAlfa('#fff', 0.5)).toBe('#fff')
    expect(conAlfa('rgb(1, 2, 3)', 0.5)).toBe('rgb(1, 2, 3)')
  })
})

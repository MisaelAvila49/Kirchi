import { describe, expect, it } from 'vitest'
import { controlesDelPanel } from './rielUtil'

describe('aria-controls del riel', () => {
  it('apunta al panel solo si está abierto', () => {
    expect(controlesDelPanel(true, 'panel-lateral')).toBe('panel-lateral')
    expect(controlesDelPanel(false, 'panel-lateral')).toBeUndefined()
  })
})

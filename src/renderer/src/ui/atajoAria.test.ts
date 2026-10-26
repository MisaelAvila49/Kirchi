import { describe, expect, it } from 'vitest'
import { atajoAria } from './atajoAria'

describe('atajoAria', () => {
  it('nombra las teclas completas para aria-keyshortcuts', () => {
    expect(atajoAria('Shift+R')).toBe('Shift+R')
    expect(atajoAria('Ctrl+Z')).toBe('Control+Z')
    expect(atajoAria('R')).toBe('R')
  })
})

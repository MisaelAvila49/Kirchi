import { describe, expect, it } from 'vitest'
import { esPropia } from './origen'

describe('esPropia', () => {
  it('acepta app://kirchi y el servidor de desarrollo exacto', () => {
    expect(esPropia('app://kirchi/index.html')).toBe(true)
    expect(esPropia('http://localhost:5173/', 'http://localhost:5173')).toBe(true)
  })

  it('rechaza puertos o hosts que solo comparten prefijo', () => {
    expect(esPropia('http://localhost:51739/', 'http://localhost:5173')).toBe(false)
    expect(esPropia('http://localhost:5173.evil.com/', 'http://localhost:5173')).toBe(false)
    expect(esPropia('app://kirchi.evil/x')).toBe(false)
    expect(esPropia('app://kirchi@evil/x')).toBe(false)
  })

  it('rechaza lo vacío, lo inválido y el desarrollo sin servidor', () => {
    expect(esPropia(undefined)).toBe(false)
    expect(esPropia('no es url')).toBe(false)
    expect(esPropia('http://localhost:5173/')).toBe(false)
  })
})

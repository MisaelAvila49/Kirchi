import { describe, expect, it } from 'vitest'
import { join, resolve } from 'node:path'
import { resolveAppPath } from './resolveAppPath'

const root = resolve('/tmp/kirchi-test/renderer')
const u = (p: string): string => `app://kirchi${p}`

describe('resolveAppPath', () => {
  it('resuelve un archivo normal', () => {
    expect(resolveAppPath(root, u('/assets/a.js'))).toEqual({ file: join(root, 'assets', 'a.js') })
  })
  it('mapea / a index.html', () => {
    expect(resolveAppPath(root, u('/'))).toEqual({ file: join(root, 'index.html') })
  })
  it('rechaza escapes de directorio', () => {
    expect(resolveAppPath(root, u('/..%2Frenderer2%2Fx'))).toEqual({ status: 403 })
    expect(resolveAppPath(root, u('/..%5Crenderer-evil%5Cx'))).toEqual({ status: 403 })
  })
  it('no sale de root con %2e%2e', () => {
    const r = resolveAppPath(root, u('/%2e%2e/main/index.js'))
    if ('file' in r) expect(r.file.startsWith(root)).toBe(true)
    else expect(r.status).toBe(403)
  })
  it('400 con codificación mal formada', () => {
    expect(resolveAppPath(root, u('/%E0%A4%A'))).toEqual({ status: 400 })
  })
  it('404 con otro host', () => {
    expect(resolveAppPath(root, 'app://otro/index.html')).toEqual({ status: 404 })
  })
})

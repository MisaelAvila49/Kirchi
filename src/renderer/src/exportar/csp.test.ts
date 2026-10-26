import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/** La política de contenido de la interfaz, directiva por directiva. */
function politica(): Map<string, string> {
  const html = readFileSync(join(import.meta.dirname, '../../index.html'), 'utf8')
  const csp = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(html)![1]
  return new Map(csp.split(';').map((d) => d.trim().split(/\s+/)).map(([k, ...v]) => [k, v.join(' ')]))
}

describe('política de contenido', () => {
  it('las imágenes solo pueden venir de la aplicación o de un blob (el PNG se dibuja desde el SVG exportado)', () => {
    expect(politica().get('img-src')).toBe("'self' blob:")
  })

  it('sin red: nada se pide fuera de la aplicación', () => {
    const p = politica()
    expect(p.get('default-src')).toBe("'self'")
    expect(p.get('connect-src')).toBe("'self'")
    for (const v of p.values()) expect(v).not.toMatch(/https?:|\*/)
  })
})

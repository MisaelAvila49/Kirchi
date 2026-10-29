import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { leerHojasKicad, MAX_CITAS_HOJAS } from './hojasKicad'

const carpetas: string[] = []
afterEach(() => {
  for (const c of carpetas.splice(0)) rmSync(c, { recursive: true, force: true })
})

describe('leerHojasKicad', () => {
  it('con miles de citas procesa un número acotado y lo avisa una vez', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kicad-hojas-'))
    carpetas.push(dir)
    const citas = Array.from({ length: 2000 }, (_, i) => `(property "Sheetfile" "no-existe-${i}.kicad_sch")`).join('\n')
    writeFileSync(join(dir, 'padre.kicad_sch'), citas)
    const r = leerHojasKicad(join(dir, 'padre.kicad_sch'), new TextEncoder().encode(citas))
    expect(r.avisos.length).toBeLessThanOrEqual(MAX_CITAS_HOJAS + 1)
    expect(r.avisos[r.avisos.length - 1]).toMatch(/más citas de hojas/)
  })
})

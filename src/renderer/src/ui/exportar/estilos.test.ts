import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(join(import.meta.dirname, 'exportar.css'), 'utf8')
/** El cuerpo de la primera regla cuyo selector es exactamente `selector`. */
const regla = (selector: string): string => {
  const i = css.indexOf(`\n${selector} {`)
  if (i < 0) return ''
  const abre = css.indexOf('{', i)
  return css.slice(abre + 1, css.indexOf('}', abre))
}

describe('diálogo de exportar: la vista previa queda fija mientras los ajustes se desplazan', () => {
  it('la vista previa es pegajosa bajo la cabecera, que también lo es', () => {
    expect(regla('.dialogo.exportar-vista .exportar-vista-previa')).toMatch(/position:\s*sticky/)
    expect(regla('.dialogo.exportar-vista .dialogo-cabeza')).toMatch(/position:\s*sticky/)
  })
  it('la vista previa tiene fondo propio para que los ajustes no se lean a través de ella', () => {
    expect(regla('.dialogo.exportar-vista .exportar-vista-previa')).toMatch(/background:\s*var\(--paneles\)/)
  })
})

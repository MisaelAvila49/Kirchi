import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/** Los globos de la cinta y de los botones usan los tokens del tema vigente: nunca una pareja invertida que los deje oscuros en el tema claro. */
describe('globos con los tokens del tema', () => {
  const css = (ruta: string) => readFileSync(join(import.meta.dirname, ruta), 'utf8')
  const regla = (texto: string, selector: string) => texto.split('\n').find((l) => l.startsWith(`${selector} {`)) ?? ''
  it.each([
    ['cinta.css', '.globo-cinta'],
    ['../../styles.css', '.globo-boton'],
    ['../../styles.css', '.globo']
  ])('%s %s', (archivo, selector) => {
    const r = regla(css(archivo), selector)
    expect(r).toContain('background: var(--paneles)')
    expect(r).toContain('color: var(--trazo)')
    expect(r).toContain('border: 1px solid var(--bordes)')
  })
})

import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

const raiz = join(__dirname, '..', '..')
const n = (await import(pathToFileURL(join(raiz, 'scripts/notas-release.mjs')).href)) as {
  cuerpo(changelog: string, version: string): string
}

const muestra = `# Historial de cambios

## 1.3.0

Esta versión mejora la vista previa.

### Nuevo

- Un botón.

### Diseño

### Arreglos

- Un fallo.

## 1.2.2

- Antiguo.
`

describe('cuerpo del Release', () => {
  const t = n.cuerpo(muestra, '1.3.0')
  it('lleva resumen, descargas, zonas con contenido y la nota de instalación, en ese orden', () => {
    const orden = ['Esta versión mejora', '## Descargas', '### Nuevo', '### Arreglos', 'cómo instalar']
    const pos = orden.map((s) => t.indexOf(s))
    expect(pos.every((p) => p >= 0)).toBe(true)
    expect([...pos].sort((a, b) => a - b)).toEqual(pos)
    expect(t).not.toContain('### Diseño')
    expect(t).not.toContain('Antiguo')
  })
  it('enlaza cada archivo con su nombre', () => {
    expect(t).toContain('https://github.com/MisaelAvila49/Kirchi/releases/download/v1.3.0/Kirchi-1.3.0-Windows-instalador.exe')
    expect(t).toContain('Kirchi-1.3.0-fuentes-de-terceros.zip')
    expect(t.indexOf('Windows portable')).toBeLessThan(t.indexOf('Linux deb'))
  })
  it('tolera una sección sin resumen ni zonas', () => {
    const v = n.cuerpo('## 2.0.0\n\n## 1.0.0\n', '2.0.0')
    expect(v).toContain('## Descargas')
    expect(v).not.toContain('###')
  })
  it('falla si no existe la versión', () => {
    expect(() => n.cuerpo(muestra, '9.9.9')).toThrow(/9\.9\.9/)
  })
})

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(join(import.meta.dirname, 'editor.css'), 'utf8')
const analisis = readFileSync(join(import.meta.dirname, '../../analisis.css'), 'utf8')
/** El cuerpo de la primera regla cuyo selector es exactamente `selector`. */
const regla = (hoja: string, selector: string): string => {
  const i = hoja.indexOf(`\n${selector} {`)
  if (i < 0) return ''
  const abre = hoja.indexOf('{', i)
  return hoja.slice(abre + 1, hoja.indexOf('}', abre))
}

describe('editor de exportar: la disposición no depende del contenido', () => {
  it('lo de fuera del área se atenúa con un velo translúcido y el área queda clara, sin relleno que tape el dibujo', () => {
    expect(regla(css, '.editor-atenuado')).toMatch(/color-mix\(in srgb, var\(--lienzo\) 55%, transparent\)/)
    const r = regla(css, '.editor-recuadro')
    expect(r).not.toMatch(/background/)
  })
  it('el diálogo tiene alto fijo y el cuerpo no se desplaza: lo que se desplaza es el panel de propiedades', () => {
    expect(regla(css, '.dialogo.exportar-editor')).toMatch(/height:\s*min\(/)
    expect(regla(css, '.dialogo.exportar-editor')).toMatch(/overflow:\s*hidden/)
    expect(regla(css, '.editor-propiedades')).toMatch(/overflow:\s*auto/)
  })
  it('herramientas, vista y propiedades van en tres columnas, con la vista como la que crece', () => {
    expect(regla(css, '.editor-cuerpo')).toMatch(/grid-template-columns:\s*52px minmax\(0, 1fr\) 300px/)
  })
  it('la vista recorta lo que sobra y no deja que el navegador tome el gesto (zoom y arrastre propios)', () => {
    const r = regla(css, '.editor-vista')
    expect(r).toMatch(/overflow:\s*hidden/)
    expect(r).toMatch(/touch-action:\s*none/)
  })
  it('la barra flotante y el zoom quedan por encima de la figura', () => {
    expect(regla(css, '.editor-barra-lugar')).toMatch(/z-index:\s*5/)
    expect(regla(css, '.editor-zoom')).toMatch(/z-index:\s*4/)
  })
  it('los interruptores no animan con movimiento reducido', () => {
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{[^}]*transition: none/)
  })
})

describe('hoja de aspecto P2', () => {
  it('mide 400 px, va sobre la franja a la derecha y su deslizamiento se apaga con movimiento reducido', () => {
    const r = regla(analisis, '.hoja-aspecto')
    expect(r).toMatch(/width:\s*min\(400px, 100%\)/)
    expect(r).toMatch(/position:\s*absolute/)
    expect(r).toMatch(/right:\s*0/)
    expect(analisis).toMatch(/prefers-reduced-motion: reduce\) \{ \.hoja-aspecto \{ animation: none; \} \}/)
  })
  it('el cuerpo se desplaza y la cabecera y el pie no', () => {
    expect(regla(analisis, '.hoja-cuerpo')).toMatch(/overflow:\s*auto/)
    expect(regla(analisis, '.hoja-cabeza')).toMatch(/flex:\s*0 0 auto/)
    expect(regla(analisis, '.hoja-pie')).toMatch(/flex:\s*0 0 auto/)
  })
})

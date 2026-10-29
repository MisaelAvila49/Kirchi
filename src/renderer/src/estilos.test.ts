import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { INTERFAZ_CLARA, INTERFAZ_OSCURA, TOKENS_CLAROS, TOKENS_OSCUROS, variableCss } from './lienzo/paleta'

const css = readFileSync(join(import.meta.dirname, 'styles.css'), 'utf8')

/** Texto de la primera regla con ese selector exacto, hasta su llave de cierre. */
function bloque(selector: string): string {
  const i = css.indexOf(`${selector} {`)
  expect(i, selector).toBeGreaterThanOrEqual(0)
  return css.slice(i, css.indexOf('}', i))
}

describe('styles.css', () => {
  it('la barra superior toma su alto de la cinta, y la hoja de la cinta no escribe colores ni sigue al sistema', () => {
    expect(bloque('.marco')).toContain('grid-template-rows: auto minmax(0, 1fr) auto 22px;')
    const cinta = readFileSync(join(import.meta.dirname, 'ui/cinta/cinta.css'), 'utf8')
    expect(cinta).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(cinta).not.toMatch(/rgba?\(|hsla?\(/)
    expect(cinta).not.toContain('prefers-color-scheme')
  })

  it('declara en :root cada token claro con el mismo color que usa el lienzo', () => {
    const b = bloque(':root')
    for (const [t, hex] of Object.entries({ ...TOKENS_CLAROS, ...INTERFAZ_CLARA })) expect(b, t).toContain(`${variableCss(t)}: ${hex};`)
  })

  it('la caja de la referencia crece con el texto (hasta las 24 letras que admite) en lugar de recortarlo', () => {
    const valores = readFileSync(join(import.meta.dirname, 'ui/valores.css'), 'utf8')
    // Un motor sin `field-sizing` conserva los 6ch de antes.
    expect(valores).toContain('.caja-referencia input { width: 6ch;')
    const i = valores.indexOf('@supports (field-sizing: content) {')
    expect(i).toBeGreaterThanOrEqual(0)
    const regla = valores.slice(i, valores.indexOf('}', valores.indexOf('.caja-referencia input', i)))
    for (const d of ['width: auto;', 'field-sizing: content;', 'min-width: 6ch;', 'max-width: 24ch;']) expect(regla).toContain(d)
  })

  it('la nota de la referencia fija (al simular) queda solo para lectores y no tapa el campo Valor', () => {
    const valores = readFileSync(join(import.meta.dirname, 'ui/valores.css'), 'utf8')
    const i = valores.indexOf('.caja-referencia-envoltura > .en-linea-nota {')
    expect(i).toBeGreaterThanOrEqual(0)
    const regla = valores.slice(i, valores.indexOf('}', i))
    expect(regla).toContain('position: absolute;')
    expect(regla).toContain('clip: rect(0 0 0 0);')
    expect(regla).not.toContain('max-content')
  })

  it('el tema oscuro redefine los mismos tokens con sus colores', () => {
    const b = bloque(":root[data-tema='oscuro']")
    for (const [t, hex] of Object.entries({ ...TOKENS_OSCUROS, ...INTERFAZ_OSCURA })) expect(b, t).toContain(`${variableCss(t)}: ${hex};`)
    expect(b).toContain('color-scheme: dark;')
  })

  it('las pilas de fuentes empiezan con las incluidas, con el nombre que les dan sus paquetes', () => {
    expect(css).toContain("--fuente-interfaz: 'Mona Sans Variable', 'Source Serif 4 Variable', system-ui,")
    expect(css).toContain("--fuente-cifras: 'Geist Mono Variable', 'Source Serif 4 Variable', ui-monospace,")
    expect(css).toContain("--fuente-serif: 'Source Serif 4 Variable', Georgia,")
    const paquete = (ruta: string) => readFileSync(join(import.meta.dirname, '../../../node_modules/@fontsource-variable', ruta), 'utf8')
    expect(paquete('mona-sans/wdth.css')).toContain("font-family: 'Mona Sans Variable';")
    expect(paquete('geist-mono/index.css')).toContain("font-family: 'Geist Mono Variable';")
    const main = readFileSync(join(import.meta.dirname, 'main.tsx'), 'utf8')
    expect(main).toContain("import '@fontsource-variable/mona-sans/wdth.css'")
    expect(main).toContain("import '@fontsource-variable/geist-mono'")
  })

  it('no sigue al tema del sistema', () => {
    expect(css).not.toContain('prefers-color-scheme')
  })

  it('fuera de sus bloques de tokens ninguna hoja escribe un color, y colores.css va después de styles.css', () => {
    const sinTokens = (texto: string) => texto.replace(/:root(\[data-tema='oscuro'\])? \{[^}]*\}/g, '')
    for (const archivo of ['styles.css', 'ui/colores.css', 'ui/cinta/cinta.css', 'ui/paneles.css', 'ui/calculadoras.css', 'ui/analisis.css', 'ui/osciloscopio/osciloscopio.css', 'ui/exportar/exportar.css', 'ui/exportar/editor/editor.css']) {
      const t = sinTokens(readFileSync(join(import.meta.dirname, archivo), 'utf8'))
      expect(t, archivo).not.toMatch(/#[0-9a-f]{3,8}\b/i)
      expect(t, archivo).not.toMatch(/rgba?\(|hsla?\(/)
    }
    const main = readFileSync(join(import.meta.dirname, 'main.tsx'), 'utf8')
    expect(main.indexOf("import './ui/colores.css'")).toBeGreaterThan(main.indexOf("import './styles.css'"))
    expect(main.indexOf("import './ui/paneles.css'")).toBeGreaterThan(main.indexOf("import './styles.css'"))
    expect(main.indexOf("import './ui/colores.css'")).toBeGreaterThan(main.indexOf("import './ui/paneles.css'"))
    expect(main.indexOf("import './ui/colores.css'")).toBeGreaterThan(main.indexOf("import './ui/osciloscopio/osciloscopio.css'"))
  })

  // Lo que se ve (tonos, tintes, tamaños) lo comprueba con estilos calculados <scratchpad>/check-color/ui.mjs; aquí quedan
  // solo las trampas que un estilo calculado no deja ver o que ya mordieron.
  it('color: trampas de la hoja', () => {
    const cinta = readFileSync(join(import.meta.dirname, 'ui/cinta/cinta.css'), 'utf8')
    // Un custom property declarado en el propio elemento anula el heredado: --t y --m solo los reparten los atajos de colores.css.
    for (const [archivo, texto] of [['styles.css', css], ['cinta.css', cinta]]) expect(texto, archivo).not.toMatch(/--[tm](-[a-z]+)?:/)
    // Barra de estado: ningún elemento se encima; el botón de texto no hereda el ancho fijo de los de signo.
    expect(css).toMatch(/\.boton-estado\.estado-texto \{[^}]*width: auto;/)
    expect(css).toMatch(/\.estado-barra > \* \{[^}]*flex: 0 0 auto;/)
    expect(css).toMatch(/\.estado-barra > \.estado-pista \{[^}]*flex: 1 1 0;[^}]*text-overflow: ellipsis;/)
    // 0 cuadros en reposo: nada del color se anima.
    for (const [archivo, texto] of [['styles.css', css], ['cinta.css', cinta]]) expect(texto, archivo).not.toMatch(/animation|transition|@keyframes/)
    // Sin marcas de color por grupo ni duotono: el color está solo en los iconos.
    expect(cinta).not.toMatch(/grupo-nombre::before|--dt\b/)
    // Sobre el azul claro de la barra al simular, --corriente quedaba en 4.33:1.
    expect(bloque('.estado-lento')).toContain('color: var(--ambar-texto);')
    // El borde de simulación va sobre la fila de arriba (.barra, 30) y debajo de lo que flota: menús, buscador, globos.
    expect(bloque('.marco::before')).toContain('z-index: 31;')
    // La disposición de la cabecera de una pieza no depende de que su categoría tenga tono (las que agregue el usuario).
    expect(css).toContain('.inspector .panel-cabeza.de-pieza { align-items: flex-start;')
    expect(css).toContain('.inspector[data-tono] .panel-cabeza.de-pieza { background: var(--t-suave); }')
  })

  // Un elemento absoluto (`.solo-lectores`) solo lo recorta el panel que se desplaza si ese panel es su bloque
  // contenedor. La columna de ajustes del osciloscopio no lo era y la página crecía 106 px a 1920×1080.
  it('los paneles que se desplazan son el bloque contenedor de su texto para lectores', () => {
    const osc = readFileSync(join(import.meta.dirname, 'ui/osciloscopio/osciloscopio.css'), 'utf8')
    const regla = (texto: string, selector: string) => {
      const i = texto.indexOf(`${selector} {`)
      expect(i, selector).toBeGreaterThanOrEqual(0)
      return texto.slice(i, texto.indexOf('}', i))
    }
    for (const [texto, selector] of [[css, '.instrumentos-panel'], [css, '.panel-cuerpo'], [osc, '.osc-lateral']]) {
      const r = regla(texto, selector)
      expect(r, selector).toMatch(/overflow(-y)?: auto/)
      expect(r, selector).toContain('position: relative;')
    }
  })
})

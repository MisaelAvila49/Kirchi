import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TEMAS, type Tema } from '../../../compartido/ajustes'
import { contraste, hexARgba, interfazDeTema, tokensDeTema } from '../lienzo/paleta'
import { NIVELES_REGISTRO } from './registro'
import { CATEGORIA_TONO, COLORES_CLAROS, COLORES_OSCUROS, colorDeCanal, coloresDeTema, MAGNITUDES, NOMBRES_TOKEN, TOKENS_CON_ALFA, TONO_CANAL, TONOS, TONOS_CATEGORIA, tonoDeCategoria } from './colores'
import { CANALES, MATEMATICO } from '../instrumentos/ajustes'

const css = readFileSync(join(import.meta.dirname, 'colores.css'), 'utf8')
/** Texto de la primera regla con ese selector exacto, hasta su llave de cierre. */
function bloque(selector: string): string {
  const i = css.indexOf(`${selector} {`)
  expect(i, selector).toBeGreaterThanOrEqual(0)
  return css.slice(i, css.indexOf('}', i))
}
const k = (a: string, b: string) => contraste(hexARgba(a), hexARgba(b))

describe('tokens de color (D4 + R1)', () => {
  it('los dos temas declaran los mismos 79 tokens, cada uno con un color de seis cifras', () => {
    expect(NOMBRES_TOKEN).toHaveLength(79)
    for (const c of [COLORES_CLAROS, COLORES_OSCUROS]) {
      expect(Object.keys(c).sort()).toEqual([...NOMBRES_TOKEN].sort())
      for (const [n, v] of Object.entries(c)) expect(v, n).toMatch(/^#[0-9A-F]{6}$/)
    }
  })

  it('colores.css declara cada token con el valor de su tema, y ningún otro color', () => {
    const claro = bloque(':root')
    const oscuro = bloque(":root[data-tema='oscuro']")
    for (const n of NOMBRES_TOKEN) {
      expect(claro, n).toContain(`--${n}: ${COLORES_CLAROS[n]};`)
      expect(oscuro, n).toContain(`--${n}: ${COLORES_OSCUROS[n]};`)
    }
    for (const [tema, bloqueTema] of [['claro', claro], ['oscuro', oscuro]] as const)
      for (const [n, v] of Object.entries(TOKENS_CON_ALFA[tema])) expect(bloqueTema, n).toContain(`--${n}: ${v};`)
    // Los dos tokens con transparencia del tutorial (velo y relleno del foco) y la sombra del aviso son los seis colores de ocho cifras de más.
    expect(css.match(/#[0-9a-f]{3,8}\b/gi)).toHaveLength(2 * NOMBRES_TOKEN.length + 6)
    expect(css).not.toMatch(/rgba?\(|hsla?\(|prefers-color-scheme/)
  })

  it('cada tono reparte --t y cada magnitud reparte --m', () => {
    for (const t of TONOS) expect(css, t).toContain(`[data-tono='${t}'] { --t: var(--${t}); --t-suave: var(--${t}-suave); --t-tenue: var(--${t}-tenue); --t-texto: var(--${t}-texto); }`)
    for (const m of MAGNITUDES) expect(css, m).toContain(`[data-magnitud='${m}'] { --m: var(--lectura-${m}); --m-suave: var(--lectura-${m}-suave); --m-texto: var(--lectura-${m}-texto); }`)
  })

  it('las nueve categorías usan los tonos que pasaron el validador, en el orden validado (vecinos de la Librería)', () => {
    expect(Object.entries(CATEGORIA_TONO)).toEqual([
      ['pasivos', 'azul'], ['fuentes', 'ocre'], ['semiconductores', 'violeta'], ['interruptores', 'verdeazul'],
      ['electromecanicos', 'naranja'], ['indicadores', 'cian'], ['digitales', 'magenta'], ['integrados', 'oliva'], ['instrumentos', 'ciruela']
    ])
    expect(TONOS_CATEGORIA.map((t) => COLORES_CLAROS[t])).toEqual(['#2F6FBF', '#A86A12', '#7A4FC9', '#00876F', '#C8581C', '#127FA6', '#B83C7A', '#5F7F1E', '#8B4E8F'])
    expect(TONOS_CATEGORIA.map((t) => COLORES_OSCUROS[t])).toEqual(['#5B8FD8', '#B8842E', '#9A7BD8', '#2E9E86', '#D4743A', '#3D9DBF', '#CC5E8A', '#7D9B3C', '#B777BB'])
    expect(tonoDeCategoria('semiconductores')).toBe('violeta')
    expect(tonoDeCategoria('misterio')).toBeUndefined()
    expect(tonoDeCategoria('constructor')).toBeUndefined()
  })

  it('cada nivel del Registro reparte --n (icono y contador) y --n-texto (el mensaje) con el tono de su icono', () => {
    for (const n of NIVELES_REGISTRO) expect(css, n.id).toContain(`[data-nivel='${n.id}'] { --n: var(--${n.tono}); --n-texto: var(--${n.tono}-texto); }`)
  })

  it('cada tono reparte --h, --h-tenue y --h-borde a un icono (data-h), y --h2 como segundo color (data-h2)', () => {
    for (const t of TONOS) {
      expect(css, t).toContain(`.icono[data-h='${t}'] { --h: var(--${t}); --h-tenue: var(--${t}-tenue); --h-borde: var(--${t}-texto); --h2: var(--${t}); }`)
      expect(css, t).toContain(`.icono[data-h2='${t}'] { --h2: var(--${t}); }`)
    }
    // El segundo color va después: con la misma especificidad, gana al --h2 que pone data-h.
    expect(css.indexOf(".icono[data-h2='azul']")).toBeGreaterThan(css.indexOf(".icono[data-h='gris']"))
  })
})

describe.each(TEMAS)('contraste calculado de los tokens, tema %s', (tema: Tema) => {
  it('el texto de cada canal (cifras de la pantalla y banderas de las sondas) da 4.5:1 sobre el lienzo', () => {
    const fondo = hexARgba(tokensDeTema(tema).lienzo)
    for (const c of CANALES) expect(contraste(hexARgba(coloresDeTema(tema)[`${TONO_CANAL[c]}-texto`]), fondo), c).toBeGreaterThanOrEqual(4.5)
  })

  const C = coloresDeTema(tema)
  const L = tokensDeTema(tema)
  const I = interfazDeTema(tema)
  const fondos = { paneles: L.paneles, barra: I.barra, lienzo: L.lienzo, resalte: I.resalte, pulsado: I.seleccionFondo }

  it('cada tono, como icono o marca, queda en 3:1 o más sobre la cinta, la fila de arriba, el panel, el resalte del ratón y lo pulsado', () => {
    for (const t of TONOS) for (const [f, hex] of Object.entries(fondos)) expect(k(C[t], hex), `${t} sobre ${f}`).toBeGreaterThanOrEqual(3)
  })

  it('el texto en tono: 4.5:1 sobre el panel, el resalte y su tinte; como contorno de icono, 3:1 sobre la cinta y la fila', () => {
    for (const t of TONOS) {
      const tx = C[`${t}-texto`]
      for (const f of [L.paneles, I.resalte, C[`${t}-suave`]]) expect(k(tx, f), `${t}-texto sobre ${f}`).toBeGreaterThanOrEqual(4.5)
      for (const f of [I.barra, L.lienzo]) expect(k(tx, f), `${t}-texto sobre ${f}`).toBeGreaterThanOrEqual(3)
    }
  })

  it('sobre cada tinte se leen la tinta (4.5:1, también sobre el tinte fuerte) y el texto secundario propio de los tintes', () => {
    const tintes = [...TONOS.map((t) => C[`${t}-suave`]), ...MAGNITUDES.map((m) => C[`lectura-${m}-suave`])]
    for (const t of TONOS) expect(k(L.trazo, C[`${t}-tenue`]), `tinta sobre ${t}-tenue`).toBeGreaterThanOrEqual(4.5)
    for (const f of tintes) {
      expect(k(L.trazo, f), `tinta sobre ${f}`).toBeGreaterThanOrEqual(4.5)
      expect(k(C['texto-sobre-tinte'], f), `texto-sobre-tinte sobre ${f}`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('el detalle de un icono plano se distingue de su relleno, y el gris de los iconos de su fondo', () => {
    for (const t of TONOS) expect(k(C['ic-contra'], C[t]), `contra sobre ${t}`).toBeGreaterThanOrEqual(3)
    for (const f of [I.barra, L.lienzo, I.resalte]) expect(k(C['ic-gris'], f)).toBeGreaterThanOrEqual(3)
  })

  it('los niveles del Registro: el mensaje en 4.5:1 sobre el panel y la cifra del contador (10 px) en 4.5:1 sobre su tono', () => {
    for (const n of NIVELES_REGISTRO) {
      expect(k(C[`${n.tono}-texto`], L.paneles), n.id).toBeGreaterThanOrEqual(4.5)
      expect(k(C['ic-contra'], C[n.tono]), n.id).toBeGreaterThanOrEqual(4.5)
      // El icono del nivel, sobre el panel, como cualquier marca: 3:1.
      expect(k(C[n.tono], L.paneles), n.id).toBeGreaterThanOrEqual(3)
    }
  })

  it('las lecturas: el símbolo de la magnitud en 4.5:1 sobre su ficha', () => {
    for (const m of MAGNITUDES) expect(k(C[`lectura-${m}-texto`], C[`lectura-${m}-suave`]), m).toBeGreaterThanOrEqual(4.5)
  })

  it('al simular: el borde de 2 px sobre la fila de arriba y los textos de la barra de estado sobre el azul claro', () => {
    expect(k(L.seleccion, L.lienzo)).toBeGreaterThanOrEqual(3)
    for (const tx of [L.textoSecundario, L.trazo, L.seleccion, C['ambar-texto']]) expect(k(tx, I.seleccionFondo), tx).toBeGreaterThanOrEqual(4.5)
    expect(k(C['ambar-texto'], I.barra)).toBeGreaterThanOrEqual(4.5)
  })

  it('«Listo para simular»: la palomita en el panel sobre su disco y una lectura en alerta sobre el resalte', () => {
    expect(k(L.paneles, C['verdeazul-texto'])).toBeGreaterThanOrEqual(3)
    expect(k(L.invalido, I.resalte)).toBeGreaterThanOrEqual(4.5)
  })
})

describe('contraste alto de Windows (forced-colors)', () => {
  // Chromium no fuerza fill ni stroke de un SVG: sin este bloque los iconos y los símbolos conservan los colores del tema
  // sobre el Canvas del sistema (el ámbar quedaba en 1.9:1 sobre el blanco). Se comprueba también sin ventana (forzado.mjs).
  const i = css.indexOf('@media (forced-colors: active) {')
  const forzado = i < 0 ? '' : css.slice(i)
  it('va al final de colores.css, después de los atajos data-h que tiene que vencer', () => {
    expect(i).toBeGreaterThan(css.lastIndexOf(".icono[data-h2='gris']"))
  })
  it('los iconos en ButtonText sobre ButtonFace, y los deshabilitados en GrayText sin filtro', () => {
    expect(forzado).toContain('.icono, .icono[data-h], .icono[data-h2] { --h: ButtonText; --h2: ButtonText; --h-borde: ButtonText; --h-tenue: ButtonFace; --ic-gris: ButtonText; --ic-contra: ButtonFace; }')
    expect(forzado).toMatch(/\[aria-disabled='true'\] > \.icono:is\(\.plano, \.linea\) \{ --h: GrayText; --h2: GrayText; --h-borde: GrayText; --ic-gris: GrayText; filter: none; opacity: 1; \}/)
  })
  it('los símbolos en CanvasText; el paso actual, la pestaña elegida y el borde de simulación en Highlight', () => {
    expect(forzado).toContain('.simbolo polyline, .buscador-simbolo polyline { stroke: CanvasText; }')
    expect(forzado).toContain('.simbolo polygon, .buscador-simbolo polygon { fill: CanvasText; }')
    expect(forzado).toContain('.region-paso.actual { outline: 2px solid Highlight; outline-offset: -2px; }')
    // Sin tapar el anillo de foco de la pestaña.
    expect(forzado).toContain(".pestaña[aria-selected='true']:not(:focus-visible) { outline: 1px solid Highlight; outline-offset: -1px; }")
    expect(forzado).toContain('.marco::before { forced-color-adjust: none; background: Highlight; }')
  })
  it('el contador del Registro conserva su contorno (el fondo de su tono desaparece) y los iconos de nivel siguen al texto', () => {
    expect(forzado).toContain('.contador { outline: 1px solid CanvasText; outline-offset: -1px; }')
  })
})

describe('los canales del osciloscopio (preguntas 76 y 88)', () => {
  it('cuatro tonos propios de los canales, validados todos contra todos en los dos temas, y A − B en gris', () => {
    expect(TONO_CANAL).toEqual({ A: 'canal-a', B: 'canal-b', C: 'canal-c', D: 'canal-d', M: 'gris' })
    // validate_palette.js de dataviz con --pairs all: claro sobre #F7F6F2 y #FFFFFF, oscuro sobre #17181B (ALL CHECKS PASS).
    expect(CANALES.map((c) => colorDeCanal('claro', c))).toEqual(['#00876F', '#2F6FBF', '#A86A12', '#8B4E8F'])
    // En oscuro, D deja la ciruela de la categoría Instrumentos (B y D en ΔE 4.8 con protanopía) por #A1529B (ΔE 9.4).
    expect(CANALES.map((c) => colorDeCanal('oscuro', c))).toEqual(['#2E9E86', '#5B8FD8', '#B8842E', '#A1529B'])
    // Los tonos de las categorías no cambian.
    expect(COLORES_OSCUROS.ciruela).toBe('#B777BB')
  })

  it.each(TEMAS)('en el tema %s cada traza queda en 3:1 o más sobre la pantalla y su letra en 4.5:1 sobre el panel', (tema: Tema) => {
    const C = coloresDeTema(tema)
    const L = tokensDeTema(tema)
    for (const c of [...CANALES, MATEMATICO] as const) {
      expect(k(colorDeCanal(tema, c), L.lienzo), c).toBeGreaterThanOrEqual(3)
      expect(k(C[`${TONO_CANAL[c]}-texto`], L.paneles), c).toBeGreaterThanOrEqual(4.5)
      expect(k(C[`${TONO_CANAL[c]}-texto`], C[`${TONO_CANAL[c]}-suave`]), c).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('data-canal reparte --c, --c-suave y --c-texto, y en contraste alto pasa a los colores del sistema', () => {
    for (const [c, t] of Object.entries(TONO_CANAL)) expect(css, c).toContain(`[data-canal='${c}'] { --c: var(--${t}); --c-suave: var(--${t}-suave); --c-texto: var(--${t}-texto); }`)
    const forzado = css.slice(css.indexOf('@media (forced-colors: active)'))
    expect(forzado).toContain('[data-canal] { --c: CanvasText; --c-suave: Canvas; --c-texto: CanvasText; }')
  })
})

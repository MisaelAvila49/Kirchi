// @vitest-environment happy-dom
import { PASO_REJILLA_MAYOR, PASO_REJILLA_MENOR } from '../lienzo/medidas'
import { describe, expect, it } from 'vitest'
import { calcularConexiones } from '../conexiones/conexiones'
import { documentoVacio, type Documento } from '../doc/tipos'
import { construirEscena } from '../lienzo/escena'
import { hexARgba, PALETA_CLARA, PALETA_OSCURA, type Paleta } from '../lienzo/paleta'
import { divisor } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import { anchoTexto } from '../lienzo/medidas'
import { AVISO_FUENTES, cajaLamina, crearBaseDeTexto, escaparXml, hexDe, MARGEN_EXPORTAR, num, svgDeEscena, type OpcionesSvg } from './svg'

const lib = libreriaDePrueba().piezas
const FUENTES = { interfaz: "'Mona Sans Variable', sans-serif", cifras: "'Geist Mono Variable', monospace", serif: "'Source Serif 4 Variable', serif" }
const escena = (d: Documento, p: Paleta = PALETA_CLARA) => construirEscena(d, lib, calcularConexiones(d, lib), p)
const opciones = (extra: Partial<OpcionesSvg> = {}): OpcionesSvg => ({ paleta: PALETA_CLARA, fondo: hexARgba('#F7F6F2'), rejilla: false, fuentes: FUENTES, base: () => 0.25, ...extra })

/** El divisor con una T en el cable de abajo (una unión), una etiqueta y una nota con formato. */
function ejemplo(): Documento {
  const d = divisor()
  d.cables.c_t = { id: 'c_t', puntos: [{ x: 7, y: 8 }, { x: 7, y: 14 }] }
  d.etiquetas.e1 = { id: 'e1', nombre: 'VSAL', x: 14, y: -12, rot: 0, formato: { negrita: true } }
  d.notas.n1 = { id: 'n1', x: 20, y: 20, ancho: 40, texto: 'Práctica <3> & más', formato: { cursiva: true, subrayado: true, alinear: 'centro' } }
  return d
}
const cuenta = (s: string, patron: RegExp) => (s.match(patron) ?? []).length

describe('svgDeEscena con caracteres que XML no admite', () => {
  it('un control en una nota no rompe el XML', () => {
    const d = ejemplo()
    d.notas.n1 = { ...d.notas.n1, texto: 'a\u000Bb\u0000c\uFFFEd\uD800e' }
    const l = svgDeEscena(escena(d), opciones())!
    const xml = new DOMParser().parseFromString(l.svg, 'image/svg+xml')
    expect(xml.getElementsByTagName('parsererror')).toHaveLength(0)
    expect(escaparXml('x\u000By')).toBe('xy')
  })
})

describe('svgDeEscena con etiquetas verticales', () => {
  it('el nombre de una etiqueta vertical gira un cuarto de vuelta sobre su punto y el horizontal no', () => {
    const d = documentoVacio()
    d.etiquetas.h = { id: 'h', nombre: 'HOR', x: 0, y: 0, rot: 180 }
    d.etiquetas.v = { id: 'v', nombre: 'VER', x: 20, y: 0, rot: 270 }
    const svg = svgDeEscena(escena(d), opciones())!.svg
    const textos = svg.match(/<text [^>]*>[A-Z]+<\/text>/g)!
    const hor = textos.find((t) => t.includes('>HOR<'))!, ver = textos.find((t) => t.includes('>VER<'))!
    expect(hor).not.toContain('transform')
    expect(hor).toContain('text-anchor="end"')
    expect(ver).toContain('transform="rotate(90 20 -1.4)"')
    expect(ver).toContain('text-anchor="end"')
  })
})

describe('svgDeEscena', () => {
  it('las figuras van antes que el circuito (debajo), con sus guiones y puntos; sin figuras el SVG no cambia', () => {
    const d = ejemplo()
    const antes = svgDeEscena(escena(d), opciones())!.svg
    d.figuras = {
      f1: { id: 'f1', tipo: 'rectangulo', x1: -30, y1: -30, x2: 40, y2: 30, orden: 0, trazo: 'guiones', relleno: true, tinta: 'azul' },
      f2: { id: 'f2', tipo: 'elipse', x1: 10, y1: 10, x2: 20, y2: 16, orden: 1, trazo: 'puntos', tinta: 'rojo' }
    }
    const svg = svgDeEscena(escena(d), opciones())!.svg
    expect(svgDeEscena(escena(ejemplo()), opciones())!.svg).toBe(antes)
    const azul = hexDe(PALETA_CLARA.textoAzul), rojo = hexDe(PALETA_CLARA.textoRojo), trazo = hexDe(PALETA_CLARA.pieza)
    // Relleno suave al 7 % y trazo azul antes del primer trazo de las piezas.
    expect(svg).toMatch(new RegExp(`fill="${azul}" fill-opacity="0.07"`))
    expect(svg.indexOf(`stroke="${azul}"`)).toBeLessThan(svg.indexOf(`stroke="${trazo}"`))
    // Los puntos de la elipse son círculos rojos.
    expect(cuenta(svg, new RegExp(`<circle [^>]*fill="${rojo}"`, 'g'))).toBeGreaterThan(10)
    // Dos grupos de trazos: el de las figuras y el del circuito.
    expect(cuenta(svg, /<g fill="none" stroke-linecap="round"/g)).toBe(2)
    expect(cuenta(antes, /<g fill="none" stroke-linecap="round"/g)).toBe(1)
  })

  it('sin dibujo no hay lámina', () => {
    expect(svgDeEscena(escena(documentoVacio()), opciones())).toBeNull()
  })

  it('es un SVG válido en mm, recortado al dibujo con 5 mm de margen en la rejilla fina', () => {
    const e = escena(ejemplo())
    const l = svgDeEscena(e, opciones({ titulo: 'p.kir' }))!
    const xml = new DOMParser().parseFromString(l.svg, 'image/svg+xml')
    expect(xml.getElementsByTagName('parsererror')).toHaveLength(0)
    const raiz = xml.documentElement
    expect(raiz.getAttribute('viewBox')).toBe(`${l.caja.minX} ${l.caja.minY} ${l.caja.maxX - l.caja.minX} ${l.caja.maxY - l.caja.minY}`)
    expect(raiz.getAttribute('width')).toBe(`${num(l.anchoMm)}mm`)
    expect(l.anchoMm).toBe((l.caja.maxX - l.caja.minX) * 1.25)
    for (const k of ['minX', 'minY', 'maxX', 'maxY'] as const) expect(Number.isInteger(l.caja[k])).toBe(true)
    expect(l.caja.minX).toBeLessThanOrEqual(e.caja!.minX - MARGEN_EXPORTAR)
    expect(l.caja.maxY).toBeGreaterThanOrEqual(e.caja!.maxY + MARGEN_EXPORTAR)
    expect(l.svg).toContain('<title>p.kir</title>')
    expect(l.svg).toContain(escaparXml(AVISO_FUENTES))
  })

  it('cada texto de la escena es un <text>, escapado; cada unión un círculo', () => {
    const e = escena(ejemplo())
    const s = svgDeEscena(e, opciones())!.svg
    expect(cuenta(s, /<text /g)).toBe(e.textos.length)
    expect(cuenta(s, /<circle /g)).toBe(calcularConexiones(ejemplo(), lib).uniones.length)
    expect(cuenta(s, /<circle /g)).toBeGreaterThan(0)
    expect(s).toContain('&lt;3&gt; &amp; más')
    expect(s).not.toContain('<3>')
  })

  it('el formato llega al texto: negrita, cursiva, centrado, subrayado y el ancho del reparto', () => {
    const e = escena(ejemplo())
    const s = svgDeEscena(e, opciones())!.svg
    const vsal = s.split('\n').find((l) => l.includes('>VSAL<'))!
    expect(vsal).toContain('font-weight="700"')
    expect(vsal).toContain(`font-family="${escaparXml(FUENTES.cifras)}"`)
    const nota = e.textos.find((t) => t.texto.startsWith('Práctica'))!
    const linea = s.split('\n').find((l) => l.includes('>Práctica'))!
    expect(linea).toContain('font-style="italic"')
    // La nota centrada llega ya colocada por el reparto (cada renglón con su x): no lleva text-anchor.
    expect(nota.alinear).toBe('izq')
    expect(linea).not.toContain('text-anchor')
    expect(linea).toContain(`textLength="${num(nota.ancho!)}"`)
    // La línea base cae base × alto bajo el centro del texto.
    expect(linea).toContain(`y="${num(nota.y + 0.25 * nota.tamaño)}"`)
    expect(cuenta(s, /<rect /g)).toBe(2) // el fondo y un subrayado
  })

  it('un texto centrado usa text-anchor (el cuadro de una pieza desconocida)', () => {
    const d = documentoVacio()
    d.piezas.x = { id: 'x', tipo: 'no-existe', ref: 'X1', x: 0, y: 0, rot: 0, espejo: false, props: {} }
    const s = svgDeEscena(escena(d), opciones())!.svg
    expect(s.split('\n').find((l) => l.includes('desconocida: no-existe'))).toContain('text-anchor="middle"')
  })

  it('los colores salen de la paleta que se le da (la exportación usa la clara aunque se vea la oscura)', () => {
    const clara = svgDeEscena(escena(ejemplo(), PALETA_CLARA), opciones())!.svg
    expect(clara).toContain(`stroke="${hexDe(PALETA_CLARA.pieza)}"`)
    expect(clara).toContain(`stroke="${hexDe(PALETA_CLARA.cable)}"`)
    const oscura = svgDeEscena(escena(ejemplo(), PALETA_OSCURA), opciones({ paleta: PALETA_OSCURA }))!.svg
    expect(oscura).toContain(`stroke="${hexDe(PALETA_OSCURA.pieza)}"`)
    expect(oscura).not.toContain(`stroke="${hexDe(PALETA_CLARA.pieza)}"`)
  })

  it('un cable de varios tramos es un solo camino continuo', () => {
    const d = documentoVacio()
    d.cables.c = { id: 'c', puntos: [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 6 }, { x: 2, y: 6 }] }
    const s = svgDeEscena(escena(d), opciones())!.svg
    expect(s).toContain('<path d="M0 0L8 0L8 6L2 6" stroke-width="0.25"')
  })

  it('los rellenos de un color van en un solo camino, todos con la misma orientación', () => {
    const d = documentoVacio()
    d.piezas.d = { id: 'd', tipo: 'diodo', ref: 'D1', x: 0, y: 0, rot: 0, espejo: false, props: {} }
    const e = escena(d)
    const s = svgDeEscena(e, opciones())!.svg
    const relleno = s.split('\n').filter((l) => l.startsWith('<path') && l.includes('stroke="none"'))
    expect(e.nTriangulos).toBeGreaterThan(0)
    expect(relleno).toHaveLength(1)
    for (const t of relleno[0].match(/M[^Z]+Z/g)!) {
      const [a, b, c] = t.slice(1, -1).split('L').map((p) => p.split(' ').map(Number))
      expect((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])).toBeGreaterThanOrEqual(0)
    }
  })

  it('fondo transparente y rejilla de puntos opcionales', () => {
    const sin = svgDeEscena(escena(ejemplo()), opciones({ fondo: null }))!.svg
    expect(sin).not.toContain(`fill="${hexDe(PALETA_CLARA.lienzo)}"`)
    expect(sin).not.toContain('pattern')
    const con = svgDeEscena(escena(ejemplo()), opciones({ rejilla: true }))!.svg
    expect(cuenta(con, /<pattern /g)).toBe(2)
    expect(con).toContain(`fill="${hexDe(PALETA_CLARA.rejillaMenor)}"`)
  })

  it('el punto oscuro de la rejilla cae cada 6 celdas (12 unidades, 15 mm) y el claro en cada celda', () => {
    const con = svgDeEscena(escena(ejemplo()), opciones({ rejilla: true }))!.svg
    expect(con).toMatch(/<pattern id="rejilla-menor"[^>]*width="2" height="2"/)
    expect(con).toMatch(/<pattern id="rejilla-mayor"[^>]*width="12" height="12"/)
    expect(PASO_REJILLA_MAYOR).toBe(6 * PASO_REJILLA_MENOR)
    expect(PASO_REJILLA_MAYOR * 1.25).toBe(15)
  })

  it('sin textos: solo la geometría, sin <text>, subrayados ni fuentes', () => {
    const s = svgDeEscena(escena(ejemplo()), opciones({ sinTextos: true, css: '@font-face{}' }))!.svg
    expect(s).not.toContain('<text')
    expect(s).not.toContain('<style>')
    expect(cuenta(s, /<rect /g)).toBe(1)
    expect(cuenta(s, /<circle /g)).toBeGreaterThan(0)
  })

  it('las fuentes incrustadas van en el <style>', () => {
    const s = svgDeEscena(escena(ejemplo()), opciones({ css: "@font-face{font-family:'X'}" }))!.svg
    expect(s).toContain("<style>@font-face{font-family:'X'}\ntext{font-kerning:none;white-space:pre}</style>")
  })

  it('cajaLamina: el dibujo con su margen y los bordes enteros', () => {
    expect(cajaLamina({ minX: 0.4, minY: -2.5, maxX: 10, maxY: 3.2 })).toEqual({ caja: { minX: -4, minY: -7, maxX: 14, maxY: 8 }, anchoMm: 22.5, altoMm: 18.75 })
  })

  it('num y hexDe', () => {
    expect([num(0.25), num(-12), num(3.12549), num(-0.0001), num(1e-9)]).toEqual(['0.25', '-12', '3.125', '0', '0'])
    expect(hexDe([1, 0, 0.5, 1])).toBe('#ff0080')
  })
})

describe('crearBaseDeTexto', () => {
  const t = { texto: 'Ω', x: 0, y: 0, tamaño: 2, color: 'pieza', fuente: 'serif', alinear: 'izq', negrita: false, cursiva: true } as const
  it('no guarda la base medida con una fuente que aún no cargó y sí la ya cargada', () => {
    let cargada = false, medidas = 0
    const base = crearBaseDeTexto(() => (medidas++, cargada ? 0.3 : 0.27), () => cargada)
    expect(base(t, FUENTES)).toBe(0.27)
    expect(base(t, FUENTES)).toBe(0.27)
    expect(medidas).toBe(2)
    cargada = true
    expect(base(t, FUENTES)).toBe(0.3)
    expect(base(t, FUENTES)).toBe(0.3)
    expect(medidas).toBe(3)
  })
})

describe('svgDeEscena: detalles', () => {
  it('declara xml:space="preserve" en la raíz', () => {
    const l = svgDeEscena(escena(ejemplo()), opciones())!
    expect(l.svg).toMatch(/<svg [^>]*xml:space="preserve"/)
  })

  it('el subrayado sin ancho medido usa el mismo ancho estimado que el lienzo', () => {
    const e = escena(ejemplo())
    const t = { texto: 'Hola mundo', x: 10, y: 10, alinear: 'centro', tamaño: 2.5, color: 'pieza', fuente: 'interfaz', subrayado: 5 } as const
    e.textos = [t]
    const l = svgDeEscena(e, opciones())!
    const w = anchoTexto(t.texto, t.tamaño)
    expect(w).toBeGreaterThan(0)
    expect(l.svg).toContain(`<rect x="${num(t.x - w / 2)}" y="`)
  })
})

describe('svgDeEscena: textos movidos a mano', () => {
  it('el SVG pone la referencia donde la dejó el usuario, igual que el lienzo', () => {
    const d = divisor()
    const libre = svgDeEscena(escena(d), opciones())!.svg
    d.piezas.p_r1 = { ...d.piezas.p_r1, textos: { ref: { x: 0, y: 12 } } }
    const e = escena(d)
    const r1 = e.textos.find((t) => t.texto === 'R1')!
    // El centro del texto en (10, -8) + (0, 12) del símbolo sin girar.
    expect([r1.x, r1.y, r1.alinear]).toEqual([10, 4, 'centro'])
    const svg = svgDeEscena(e, opciones())!.svg
    expect(svg).not.toBe(libre)
    const nodo = [...new DOMParser().parseFromString(svg, 'image/svg+xml').querySelectorAll('text')].find((t) => t.textContent === 'R1')!
    expect(nodo.getAttribute('text-anchor')).toBe('middle')
  })
})

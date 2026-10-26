// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { figuraPorOmision, type OpcionesFigura } from '../../../../compartido/ajustes'
import { ASPECTO_OSCILOSCOPIO } from '../../../../compartido/grafica/aspecto'
import { LIMITE_EXPORTAR } from '../../../../compartido/archivos'
import { svgValido } from '../../../../main/pdf'
import { ContextoSvg } from '../../exportar/contextoSvg'
import type { AjustesOsciloscopio } from '../../instrumentos/ajustes'
import { CANALES_PANTALLA, CIFRAS_COLUMNA, MUESTRAS_CSV, type PantallaSab } from '../../sim/protocoloInstrumentos'
import { coloresDeTema } from '../colores'
import { tokensDeTema } from '../../lienzo/paleta'
import { celdaDeTexto, csvDeCaptura } from './exportarCaptura'
import { svgDeFigura } from './exportarFigura'
import { ALTO_FIGURA, ANCHO_FIGURA, coloresDeFigura, conCanalesApagados, figuraDeCaptura, tipografiaDeFigura } from './figura'

const a: AjustesOsciloscopio = {
  canales: (['A', 'B', 'C', 'D'] as const).map((canal) => ({ canal, on: canal === 'A' || canal === 'B', vdiv: 1, pos: 0, acople: 'DC' as const })),
  matematico: false, base: 1e-3, disparoCentro: false, disparo: { fuente: 'A', subida: true, nivel: 0.5, modo: 'auto' }, medidas: [{ canal: 'A', medida: 'vpp' }], ideal: false
}

/** Una senoide en A y una constante en B, con sus 100 columnas llenas. */
function pantalla(): PantallaSab {
  const ncol = 100
  const columnas = new Float32Array(CANALES_PANTALLA * ncol * CIFRAS_COLUMNA)
  for (let j = 0; j < ncol; j++) {
    const v = Math.sin((j / ncol) * 2 * Math.PI * 3)
    columnas.set([v, v, v, v, 0], j * CIFRAS_COLUMNA)
    columnas.set([0.5, 0.5, 0.5, 0.5, 0], (ncol + j) * CIFRAS_COLUMNA)
  }
  const medidas = Array.from({ length: CANALES_PANTALLA }, () => Array.from({ length: 8 }, () => ({ valor: 2, razon: '' as const })))
  return {
    version: 1, t0: 0, dt: 1e-4, ncol, tDisparo: 1e-3, estado: 'disparado', tCaptura: 0.01, csv: { t0: 0, dt: 5e-6, n: 0 },
    completoHasta: Array(CANALES_PANTALLA).fill(0.01), medidas, columnas, muestras: new Float32Array(CANALES_PANTALLA * MUESTRAS_CSV)
  }
}

const op = (parche: Partial<OpcionesFigura> = {}): OpcionesFigura => ({ ...figuraPorOmision(), ...parche })
const svgDe = async (o: OpcionesFigura) => (await svgDeFigura(figuraDeCaptura('XSC1', a, pantalla(), o, 'claro'), 'Captura XSC1')).svg
const trazos = (svg: string) => [...svg.matchAll(/<path d="[^"]*" fill="none" stroke="([^"]+)" stroke-width="([\d.]+)"/g)].map((m) => ({ color: m[1], ancho: Number(m[2]) }))

describe('la figura de la captura del osciloscopio', () => {
  it('el SVG pasa la lista blanca del PDF, con el tamaño en mm de la figura', async () => {
    const f = figuraDeCaptura('XSC1', a, pantalla(), op(), 'claro')
    const l = await svgDeFigura(f, 'Captura XSC1')
    expect(svgValido(l.svg, LIMITE_EXPORTAR)).toBe(true)
    expect(l.anchoMm).toBeCloseTo((ANCHO_FIGURA * 25.4) / 96, 3)
    expect(l.altoMm).toBeCloseTo((ALTO_FIGURA * 25.4) / 96, 3)
    expect(l.svg).toContain(`viewBox="0 0 ${ANCHO_FIGURA} ${ALTO_FIGURA}"`)
    // El texto de los ejes y el de la leyenda están como texto del SVG.
    expect(l.svg).toContain('>Tiempo desde el disparo, en ms<')
    expect(l.svg).toContain('Captura a t = 10.00 ms')
  })

  it('el color de cada canal sale del tono elegido, en el tema que corresponde, y nunca de un valor escrito', async () => {
    const T = coloresDeTema('claro')
    const por = trazos(await svgDe(op({ colores: { A: 'naranja', B: 'magenta', C: 'canal-c', D: 'canal-d', M: 'gris' } })))
    const colores = new Set(por.map((t) => t.color))
    expect(colores.has(T.naranja)).toBe(true)
    expect(colores.has(T.magenta)).toBe(true)
    expect(colores.has(T['canal-a'])).toBe(false)
    // Un tono que no es de la lista (un color escrito en un settings.json alterado) cae al de siempre.
    const raro = coloresDeFigura(op({ colores: { A: '#ff0000' as never } }), 'claro')
    expect(raro.canal.A).toBe(T['canal-a'])
    // «Tema actual» oscuro usa los colores del oscuro.
    expect(coloresDeFigura(op({ tema: 'app' }), 'oscuro').canal.A).toBe(coloresDeTema('oscuro')['canal-a'])
    expect(coloresDeFigura(op({ tema: 'claro' }), 'oscuro').canal.A).toBe(T['canal-a'])
  })

  it('un solo tema cambia fondo, rejilla y escalas juntos: el del aspecto manda sobre el de las opciones', () => {
    const oscuro = { aspecto: { ...ASPECTO_OSCILOSCOPIO, tema: 'oscuro' as const }, canales: {} }
    const c = coloresDeFigura(op({ tema: 'claro' }), 'claro', oscuro)
    const L = tokensDeTema('oscuro')
    expect(c.fondo).toBe(L.lienzo)
    expect(c.reticula).toBe(L.rejillaMenor)
    expect(c.ejes).toBe(L.rejillaMayor)
    expect(c.texto).toBe(L.textoSecundario)
    expect(c.canal.A).toBe(coloresDeTema('oscuro')['canal-a'])
  })

  it('el fondo es blanco o el del tema que se ve', () => {
    expect(figuraDeCaptura('XSC1', a, pantalla(), op({ tema: 'claro' }), 'oscuro').fondo.toLowerCase()).toBe('#ffffff')
    expect(figuraDeCaptura('XSC1', a, pantalla(), op({ tema: 'app' }), 'oscuro').fondo.toLowerCase()).not.toBe('#ffffff')
  })

  it('sin ejes no hay rótulos de escala y sin rejilla no hay retícula', async () => {
    const con = await svgDe(op())
    const sinEjes = await svgDe(op({ ejes: false }))
    expect(con).toContain('Tiempo desde el disparo')
    expect(sinEjes).not.toContain('Tiempo desde el disparo')
    const sinRejilla = await svgDe(op({ rejilla: false }))
    expect(trazos(sinRejilla).length).toBeLessThan(trazos(con).length)
  })

  it('la familia y el tamaño de la letra llegan al SVG', async () => {
    const svg = await svgDe(op({ fuente: 'serif', tamañoLetra: 13 }))
    expect(svg).toMatch(/font-family="'Source Serif 4 Variable'[^"]*" font-size="13"/)
    // La leyenda va dos px más grande.
    expect(svg).toMatch(/font-size="15"/)
    const t = tipografiaDeFigura({ fuente: 'interfaz', tamañoLetra: 10 })
    expect(t.titulo).toContain('Mona Sans')
    expect(t.cifras).toContain('Geist Mono')
    expect(tipografiaDeFigura({ fuente: 'cifras', tamañoLetra: 10 }).titulo).toContain('Geist Mono')
  })

  it('el CSV conserva el escape de fórmulas de hoja de cálculo con una referencia peligrosa', () => {
    const csv = csvDeCaptura('=HYPERLINK("http://x","clic")', a, pantalla())
    // La referencia va dentro de un comentario de una sola celda, con sus comillas duplicadas (RFC 4180).
    expect(csv.split('\n')[0]).toBe('"# Kirchi · osciloscopio =HYPERLINK(""http://x"",""clic"")"')
    expect(celdaDeTexto('=1+1')).toBe("'=1+1")
  })
})

describe('el contexto SVG', () => {
  it('recorta, traslada y restaura sin dejar grupos abiertos, y escapa el texto', () => {
    const c = new ContextoSvg(100, 50)
    c.save()
    c.translate(10, 5)
    c.beginPath()
    c.rect(0, 0, 20, 20)
    c.clip()
    c.strokeStyle = '#112233'
    c.lineWidth = 2
    c.setLineDash([3, 3])
    c.beginPath()
    c.moveTo(0, 0)
    c.lineTo(10, 10)
    c.stroke()
    c.restore()
    c.fillStyle = '#000000'
    c.textAlign = 'right'
    c.textBaseline = 'middle'
    c.font = '650 11px "Mona Sans Variable", system-ui, sans-serif'
    c.fillText('A < B & "C"', 50, 25)
    const svg = c.svg({ titulo: 'x' })
    expect(svg).toContain('<g clip-path="url(#recorte-1)">')
    expect(svg).toContain('M10 5L20 15')
    expect(svg).toContain('stroke-dasharray="3 3"')
    // Tras el restore el texto ya no está recortado ni trasladado.
    expect(svg.indexOf('</g>')).toBeLessThan(svg.indexOf('<text'))
    expect(svg).toContain('text-anchor="end"')
    expect(svg).toContain('dominant-baseline="central"')
    expect(svg).toContain('A &lt; B &amp; &quot;C&quot;')
    expect(svgValido(svg, LIMITE_EXPORTAR)).toBe(true)
    expect(c.textos()).toEqual([{ texto: 'A < B & "C"', fuente: 'interfaz', cursiva: false }])
  })

  it('un restore sin su save no rompe y un recorte sin restore se cierra al armar el SVG', () => {
    const c = new ContextoSvg(10, 10)
    c.restore()
    c.save()
    c.beginPath()
    c.rect(0, 0, 5, 5)
    c.clip()
    expect(svgValido(c.svg({ titulo: 'x' }), LIMITE_EXPORTAR)).toBe(true)
  })
})

describe('el aspecto de la pantalla en la captura exportada', () => {
  const asp = { aspecto: { ...ASPECTO_OSCILOSCOPIO, tema: 'claro' as const, grosor: 3, rejilla: true, marcas: true, ejeX: 'abajo' as const }, canales: { A: { lado: 'derecha' as const, color: 'negro' as const } } }
  const svgConAspecto = async (o: OpcionesFigura, actual: 'claro' | 'oscuro' = 'claro') => (await svgDeFigura(figuraDeCaptura('XSC1', a, pantalla(), o, actual, undefined, asp), 'Captura XSC1')).svg

  it('el canal negro de la pantalla sale negro, y el grosor llega a la traza', async () => {
    const t = trazos(await svgConAspecto(op()))
    expect(t.some((x) => x.color.toLowerCase() === coloresDeTema('claro').negro.toLowerCase() && x.ancho === 3)).toBe(true)
  })
  it('un tono que el diálogo cambió gana al de la pantalla', async () => {
    const t = trazos(await svgConAspecto(op({ colores: { ...figuraPorOmision().colores, A: 'naranja' } })))
    expect(t.some((x) => x.color.toLowerCase() === coloresDeTema('claro').naranja.toLowerCase())).toBe(true)
    expect(t.some((x) => x.color.toLowerCase() === coloresDeTema('claro').negro.toLowerCase())).toBe(false)
  })
  it('la rejilla apagada de la pantalla se respeta aunque el diálogo la ofrezca', async () => {
    const con = trazos(await svgConAspecto(op()))
    const sinRejilla = (await svgDeFigura(figuraDeCaptura('XSC1', a, pantalla(), op(), 'claro', undefined, { ...asp, aspecto: { ...asp.aspecto, rejilla: false } }), 'x')).svg
    expect(trazos(sinRejilla).length).toBeLessThan(con.length)
  })
  it('el estilo configurado (unidad, peso del texto y grosor de un canal) sale en la figura (N8b)', async () => {
    const conEstilo = { aspecto: { ...asp.aspecto, prefijoX: 'u' as const, textoPeso: 'negrita' as const }, canales: { A: { lado: 'izquierda' as const, color: null, prefijo: 'base' as const, grosor: 4 } } }
    const svg = (await svgDeFigura(figuraDeCaptura('XSC1', a, pantalla(), op(), 'claro', undefined, conEstilo), 'x')).svg
    expect(svg).toContain('en µs')
    expect(svg).toContain('font-weight="700"')
    expect(svg).toContain('>A V<')
    expect(trazos(svg).some((x) => x.ancho === 4)).toBe(true)
  })
  it('el tema oscuro del aspecto pinta el fondo oscuro', async () => {
    const f = figuraDeCaptura('XSC1', a, pantalla(), op(), 'claro', undefined, { ...asp, aspecto: { ...asp.aspecto, tema: 'oscuro' } })
    expect(f.fondo).toBe('#17181B')
  })
})

describe('canales apagados en el diálogo de exportar', () => {
  const aj = (): AjustesOsciloscopio => ({
    canales: [{ canal: 'A', on: true, vdiv: 1, pos: 0, acople: 'DC' }, { canal: 'B', on: true, vdiv: 1, pos: 0, acople: 'DC' }, { canal: 'C', on: false, vdiv: 1, pos: 0, acople: 'DC' }, { canal: 'D', on: false, vdiv: 1, pos: 0, acople: 'DC' }],
    matematico: true, base: 1e-3, disparoCentro: false, disparo: { fuente: 'A', subida: true, nivel: 0, modo: 'auto' }, medidas: [], ideal: false
  })
  it('apaga solo los que se piden y no toca los ajustes que recibe', () => {
    const a = aj()
    const r = conCanalesApagados(a, ['B', 'M'])
    expect(r.canales.map((c) => c.on)).toEqual([true, false, false, false])
    expect(r.matematico).toBe(false)
    expect(a.canales[1].on).toBe(true)
    expect(a.matematico).toBe(true)
  })
  it('sin lista devuelve los mismos ajustes', () => {
    const a = aj()
    expect(conCanalesApagados(a)).toBe(a)
    expect(conCanalesApagados(a, [])).toBe(a)
  })
})

describe('el tramo que se puede exportar parte del dato real', () => {
  /** La pantalla de arriba con las primeras `vacias` columnas sin dato (antes de t = 0 o de un cambio de escala) y las últimas `finales` también. */
  function conVacias(vacias: number, finales = 0): PantallaSab {
    const p = pantalla()
    for (let c = 0; c < CANALES_PANTALLA; c++)
      for (let j = 0; j < p.ncol; j++) if (j < vacias || j >= p.ncol - finales) p.columnas[(c * p.ncol + j) * CIFRAS_COLUMNA + 4] = 8
    return p
  }
  it('con la pantalla llena, el eje es el de siempre y su 0 es el principio de la pantalla', () => {
    const f = figuraDeCaptura('XSC1', a, pantalla(), op(), 'claro')
    expect(f.eje!.total.min).toBeCloseTo(-1e-3, 9)
    expect(f.eje!.total.max).toBeCloseTo(9e-3, 9)
    expect(f.eje!.origen).toBeCloseTo(-1e-3, 9)
  })
  it('lo que quedó vacío al principio y al final de la pantalla no se ofrece', () => {
    const f = figuraDeCaptura('XSC1', a, conVacias(20, 10), op(), 'claro')
    expect(f.eje!.total.min).toBeCloseTo(1e-3, 9)
    expect(f.eje!.total.max).toBeCloseTo(8e-3, 9)
    expect(f.eje!.origen).toBeCloseTo(1e-3, 9)
  })
  it('el tramo nunca sale del dato aunque el eje de la pantalla sí', () => {
    const p = conVacias(50)
    const f = figuraDeCaptura('XSC1', a, p, op(), 'claro')
    expect(f.eje!.total.min).toBeGreaterThanOrEqual(f.eje!.mapa.dom.min)
    expect(f.eje!.total.min).toBeCloseTo(4e-3, 9)
  })
  it('sin ningún dato queda el eje de la pantalla', () => {
    const f = figuraDeCaptura('XSC1', a, conVacias(100), op(), 'claro')
    expect(f.eje!.total.min).toBeCloseTo(-1e-3, 9)
  })
})

describe('los adornos de los preajustes Instrumento e Informe', () => {
  const conAdornos = async (adornos: { titulo: boolean; leyenda: boolean; marco: boolean; resplandor: boolean }) => {
    const asp = { aspecto: ASPECTO_OSCILOSCOPIO, canales: {}, adornos }
    const f = figuraDeCaptura('XSC1', a, pantalla(), op(), 'claro', undefined, asp)
    return { f, svg: (await svgDeFigura(f, 'Captura XSC1')).svg }
  }
  it('Instrumento: marco doble, franja de escalas y halo bajo las líneas; sin título', async () => {
    const { f, svg } = await conAdornos({ titulo: false, leyenda: false, marco: true, resplandor: true })
    expect(svg).toContain('Captura a t = 10.00 ms')
    expect(svg).toContain('1 V/div DC')
    expect(svg).not.toContain('>Captura de XSC1<')
    expect(svg).toMatch(/stroke="rgba\(\d+, \d+, \d+, 0\.16\)"/)
    expect(f.alto).toBeGreaterThan(ALTO_FIGURA)
    expect(svgValido(svg, LIMITE_EXPORTAR)).toBe(true)
  })
  it('Informe: título y subtítulo, leyenda arriba, sin franja ni marco ni halo', async () => {
    const { f, svg } = await conAdornos({ titulo: true, leyenda: true, marco: false, resplandor: false })
    expect(svg).toContain('>Captura de XSC1<')
    expect(svg).toContain('XSC1 · 1 ms/div')
    expect(svg).not.toContain('Captura a t = ')
    expect(svg).not.toMatch(/rgba\(\d+, \d+, \d+, 0\.16\)/)
    expect(f.alto).toBeLessThan(ALTO_FIGURA + 100)
    expect(svgValido(svg, LIMITE_EXPORTAR)).toBe(true)
  })
  it('el eje de la vista previa sigue en los píxeles de la retícula con marco', async () => {
    const sin = (await conAdornos({ titulo: false, leyenda: false, marco: false, resplandor: false })).f
    const con = (await conAdornos({ titulo: false, leyenda: false, marco: true, resplandor: false })).f
    expect(con.eje!.mapa.px0).toBeGreaterThan(sin.eje!.mapa.px0)
    expect(con.eje!.mapa.px1 - con.eje!.mapa.px0).toBeLessThan(sin.eje!.mapa.px1 - sin.eje!.mapa.px0)
  })
})

// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { figuraPorOmision } from '../../../../../compartido/ajustes'
import { anotacionesVacias, type Anotaciones } from '../../../../../compartido/grafica/anotaciones'
import { ASPECTO_INFORME, ASPECTO_OSCILOSCOPIO } from '../../../../../compartido/grafica/aspecto'
import { ContextoSvg } from '../../../exportar/contextoSvg'
import type { AjustesOsciloscopio } from '../../../instrumentos/ajustes'
import { CANALES_PANTALLA, CIFRAS_COLUMNA, MUESTRAS_CSV, type PantallaSab } from '../../../sim/protocoloInstrumentos'
import { COLORES_CLAROS } from '../../colores'
import { figuraDeGrafica } from '../../grafica/figura'
import { VISTA_COMPLETA, type ModeloGrafica } from '../../grafica/modelo'
import { figuraDeCaptura } from '../../osciloscopio/figura'
import { pngDeFigura, svgDeFigura } from '../../osciloscopio/exportarFigura'
import type { Lienzo2D } from '../../osciloscopio/dibujar'
import { medirEstimado, puntoGlobal } from './etiquetas'
import { objetoEn } from './objetos'

const con = (p: Partial<Anotaciones>): Anotaciones => ({ ...anotacionesVacias(), ...p })

// ---------- La gráfica de un análisis: un Bode con magnitud y fase ----------
const x = Float64Array.from([10, 100, 1000])
const bode: ModeloGrafica = {
  tipo: 'lineas',
  ejeX: { nombre: 'Frecuencia', unidad: 'Hz', escala: 'log', datos: { min: 10, max: 1000 } },
  paneles: [{ titulo: 'Magnitud' }, { titulo: 'Fase' }],
  trazas: [
    { clave: 'V(s)', etiqueta: 'V(s)', unidad: 'dB', x, y: Float64Array.from([0, -3, -20]), panel: 0, tono: 'canal-a', lado: 'izquierda' },
    { clave: 'V(s)', etiqueta: 'V(s)', unidad: '°', x, y: Float64Array.from([-5, -45, -85]), panel: 1, tono: 'canal-a', lado: 'izquierda' }
  ]
}
const adornos = { titulo: true, leyenda: true, marco: false, resplandor: false }
const entrada = (anotaciones?: Anotaciones) => ({ titulo: 'Bode del RC', subtitulo: 'CA de 10 Hz a 1 kHz', modelo: bode, vista: VISTA_COMPLETA, aspecto: ASPECTO_INFORME, adornos, anotaciones })
const svgGrafica = (a?: Anotaciones) => {
  const f = figuraDeGrafica(entrada(a), figuraPorOmision(), 'claro')
  const c = new ContextoSvg(f.ancho, f.alto)
  f.dibujar(c, 1)
  return c.svg({ titulo: 'x' })
}

describe('figura de una gráfica con anotaciones', () => {
  it('la geometría trae cada traza con su unidad, distinguiendo magnitud y fase, y sus ejes', () => {
    const g = figuraDeGrafica(entrada(), figuraPorOmision(), 'claro').geometria!()
    expect(g.trazas.map((t) => t.id)).toEqual(['V(s)', 'V(s)#°'])
    expect(g.trazas[0]).toMatchObject({ unidadX: 'Hz', unidadY: 'dB' })
    expect(g.objetos.map((o) => o.id)).toEqual(expect.arrayContaining(['titulo', 'subtitulo', 'eje:x', 'eje:V(s)#dB', 'eje:V(s)#°']))
    // Los puntos caen dentro de la figura y dentro de la retícula de su panel.
    for (const t of g.trazas) for (let i = 0; i < t.px.length; i++) expect(t.px[i]).toBeGreaterThan(0), expect(t.py[i]).toBeLessThan(g.alto)
  })
  it('un texto, una flecha y una etiqueta de valor salen en el SVG, con x e y en unidades del SI', () => {
    const g0 = figuraDeGrafica(entrada(), figuraPorOmision(), 'claro').geometria!()
    const p = g0.trazas[0]
    const sinNotas = svgGrafica()
    const svg = svgGrafica(
      con({
        textos: [{ id: 't1', texto: 'Aquí cae 3 dB', fx: 0.5, fy: 0.3, tam: 18, negrita: true, tono: 'negro' }],
        flechas: [{ id: 'f1', x1: 0.5, y1: 0.35, x2: 0.4, y2: 0.5, tono: 'naranja', grosor: 3 }],
        etiquetas: [{ id: 'e1', traza: 'V(s)', x: p.x[1], dx: 24, dy: -40, tono: null }]
      })
    )
    expect(svg).toContain('Aquí cae 3 dB')
    expect(svg).toContain('x: 100 Hz')
    expect(svg).toContain('y: −3 dB')
    expect(svg.length).toBeGreaterThan(sinNotas.length)
    expect(sinNotas).not.toContain('Aquí cae 3 dB')
    expect(svg.toLowerCase()).toContain(COLORES_CLAROS['naranja-texto'].toLowerCase())
  })
  it('la etiqueta pide el punto de la traza más cercano al puntero y queda donde se pidió', () => {
    const g = figuraDeGrafica(entrada(), figuraPorOmision(), 'claro').geometria!()
    const q = g.trazas[0]
    const r = puntoGlobal(g.trazas, q.px[1] + 3, q.py[1] - 2)!
    expect(r.traza.id).toBe('V(s)')
    // Cae sobre el tramo junto a la muestra (valor interpolado), no encima de ella.
    expect(Math.abs(r.punto.x - 100)).toBeLessThan(2)
    expect(Math.abs(r.punto.px - q.px[1])).toBeLessThan(5)
  })
  it('reescribir el título y el eje horizontal cambia los textos del SVG y nada más', () => {
    const svg = svgGrafica(con({ estilos: { titulo: { texto: 'Filtro pasa bajas' } }, ejes: Object.assign(Object.create(null), { x: { titulo: 'f' } }) }))
    expect(svg).toContain('Filtro pasa bajas')
    expect(svg).not.toContain('>Bode del RC<')
    expect(svg).not.toContain('Frecuencia')
  })
  it('el estilo propio de un eje cambia solo sus letras: el color pedido aparece y el resto de la figura no se mueve', () => {
    const base = svgGrafica()
    const azul = svgGrafica(con({ ejes: Object.assign(Object.create(null), { 'V(s)#dB': { tono: 'magenta', tam: 14 } }) }))
    expect(azul.toLowerCase()).toContain(COLORES_CLAROS['magenta-texto'].toLowerCase())
    expect(base.toLowerCase()).not.toContain(COLORES_CLAROS['magenta-texto'].toLowerCase())
  })
})

// ---------- La captura del osciloscopio ----------
const a: AjustesOsciloscopio = {
  canales: (['A', 'B', 'C', 'D'] as const).map((canal) => ({ canal, on: canal === 'A' || canal === 'B', vdiv: 1, pos: 0, acople: 'DC' as const })),
  matematico: false, base: 1e-3, disparoCentro: false, disparo: { fuente: 'A', subida: true, nivel: 0.5, modo: 'auto' }, medidas: [{ canal: 'A', medida: 'vpp' }], ideal: false
}
function pantalla(): PantallaSab {
  const ncol = 100
  const columnas = new Float32Array(CANALES_PANTALLA * ncol * CIFRAS_COLUMNA)
  for (let j = 0; j < ncol; j++) {
    const v = Math.sin((j / ncol) * 2 * Math.PI * 3)
    columnas.set([v, v, v, v, 0], j * CIFRAS_COLUMNA)
    columnas.set([0.5, 0.5, 0.5, 0.5, 0], (ncol + j) * CIFRAS_COLUMNA)
  }
  const medidas = Array.from({ length: CANALES_PANTALLA }, () => Array.from({ length: 8 }, () => ({ valor: 2, razon: '' as const })))
  return { version: 1, t0: 0, dt: 1e-4, ncol, tDisparo: 1e-3, estado: 'disparado', tCaptura: 0.01, csv: { t0: 0, dt: 5e-6, n: 0 }, completoHasta: Array(CANALES_PANTALLA).fill(0.01), medidas, columnas, muestras: new Float32Array(CANALES_PANTALLA * MUESTRAS_CSV) }
}
const asp = (anotaciones?: Anotaciones) => ({ aspecto: ASPECTO_OSCILOSCOPIO, canales: {}, adornos: { titulo: true, leyenda: true, marco: true, resplandor: false }, anotaciones })
const figCaptura = (an?: Anotaciones) => figuraDeCaptura('XSC1', a, pantalla(), figuraPorOmision(), 'claro', undefined, asp(an))

describe('figura de la captura del osciloscopio con anotaciones', () => {
  it('la geometría trae un punto por columna de cada canal, con el tiempo desde el disparo y su voltaje', () => {
    const g = figCaptura().geometria!()
    expect(g.trazas.map((t) => t.id)).toEqual(['A', 'B'])
    const A = g.trazas[0]
    expect(A.px.length).toBe(100)
    expect(A.x[10]).toBeCloseTo(10 * 1e-4 - 1e-3, 9)
    expect(A.y[0]).toBeCloseTo(0, 6)
    expect(A.unidadY).toBe('V')
    expect(g.area.w).toBeGreaterThan(300)
    for (let i = 1; i < A.px.length; i++) expect(A.px[i]).toBeGreaterThanOrEqual(A.px[i - 1])
    expect(g.objetos.map((o) => o.id)).toEqual(expect.arrayContaining(['titulo', 'subtitulo', 'eje:x', 'eje:A', 'eje:B']))
  })
  it('los títulos y los ejes de la figura se eligen con el puntero', () => {
    const f = figCaptura()
    const g = f.geometria!()
    const pick = (o: string) => {
      const r = g.objetos.find((q) => q.id === o)!.rect
      return objetoEn({ geo: g, anot: anotacionesVacias(), medir: medirEstimado, x: r.x + 2, y: r.y + 2 })
    }
    expect(pick('titulo')).toEqual({ tipo: 'fijo', id: 'titulo' })
    expect(pick('eje:B')?.id).toBe('eje:B')
    expect(pick('eje:x')?.tipo).toBe('eje')
  })
  it('una etiqueta de valor sale en el SVG con el tiempo y el voltaje del punto', async () => {
    const t = figCaptura().geometria!().trazas[0]
    const r = await svgDeFigura(figCaptura(con({ etiquetas: [{ id: 'e1', traza: 'A', x: t.x[25], dx: 20, dy: -40, tono: null }] })), 'x')
    expect(r.svg).toContain('x: 1.50 ms')
    expect(r.svg).toMatch(/y: −?\d+\.\d+ V/)
  })
  it('el título del instrumento se puede reescribir, con su tamaño y su negrita', async () => {
    const r = await svgDeFigura(figCaptura(con({ estilos: { titulo: { texto: 'Rizado de la fuente', tam: 30, negrita: false } } })), 'x')
    expect(r.svg).toContain('Rizado de la fuente')
    expect(r.svg).not.toContain('Captura de XSC1<')
    expect(r.svg).toContain('font-size="30"')
  })
  it('el estilo de un canal cambia el color y el texto de su título de eje', async () => {
    const r = await svgDeFigura(figCaptura(con({ ejes: Object.assign(Object.create(null), { A: { titulo: 'Entrada', tono: 'magenta' } }) })), 'x')
    expect(r.svg).toContain('>Entrada<')
    expect(r.svg.toLowerCase()).toContain(COLORES_CLAROS['magenta-texto'].toLowerCase())
  })
})

// ---------- Lo que se exporta es lo que se ve ----------
/** Un lienzo que anota cada llamada y cada asignación, para comparar dos dibujos sin pixeles. */
function grabadora(): { ctx: Lienzo2D; log: string[] } {
  const log: string[] = []
  const ctx = new Proxy(
    {},
    {
      get: (_o, k: string) => (k === 'measureText' ? (t: string) => ({ width: t.length * 6 }) : (...args: unknown[]) => void log.push(`${k}(${args.map((v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : String(v))).join(',')})`)),
      set: (_o, k: string, v) => (log.push(`${k}=${typeof v === 'number' ? Math.round(v * 1000) / 1000 : String(v)}`), true)
    }
  ) as unknown as Lienzo2D
  return { ctx, log }
}

describe('lo que se exporta es lo que se ve', () => {
  const notas = con({
    textos: [{ id: 't1', texto: 'Pico', fx: 0.4, fy: 0.2, tam: 16, negrita: false, tono: 'negro' }],
    flechas: [{ id: 'f1', x1: 0.4, y1: 0.25, x2: 0.5, y2: 0.4, tono: 'naranja', grosor: 2 }],
    ejes: Object.assign(Object.create(null), { x: { tono: 'gris' } })
  })
  it('la vista previa y el PNG llaman a la misma función de dibujo con las mismas órdenes (a la misma escala)', async () => {
    const fig = figCaptura(notas)
    const vista = grabadora()
    fig.dibujar(vista.ctx, 2)
    let alPng: string[] = []
    await pngDeFigura(fig, { escala: 2 }, async (_svg, _w, _h, _ppp, encima) => {
      const g = grabadora()
      encima(g.ctx as unknown as CanvasRenderingContext2D)
      alPng = g.log
      return new Uint8Array()
    }, 96)
    expect(alPng.length).toBeGreaterThan(100)
    expect(alPng).toEqual(vista.log)
  })
  it('el SVG de la gráfica sale igual dos veces y trae todo lo anotado', async () => {
    const e = entrada(notas)
    const una = await svgDeFigura(figuraDeGrafica(e, figuraPorOmision(), 'claro'), 'x')
    const otra = await svgDeFigura(figuraDeGrafica(e, figuraPorOmision(), 'claro'), 'x')
    expect(una.svg).toBe(otra.svg)
    expect(una.svg).toContain('Pico')
  })
})

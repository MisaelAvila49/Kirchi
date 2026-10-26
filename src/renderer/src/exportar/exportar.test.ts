// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { exportarPorOmision, type OpcionesExportar } from '../../../compartido/ajustes'
import type { ApiArchivos, PaginaPdf } from '../../../compartido/archivos'
import { calcularConexiones } from '../conexiones/conexiones'
import { documentoVacio } from '../doc/tipos'
import { construirEscena } from '../lienzo/escena'
import { paletaDeTema, TOKENS_CLAROS, TOKENS_OSCUROS } from '../lienzo/paleta'
import { divisor } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import { cajaLamina } from './svg'
import { cajaDeNotas, cajaVisibleDeNota, conNotasEnSvg, crearLectura, editarNota } from '../ui/exportar/marco/notasEsquema'
import { aspecto, exportar, vistaPreviaExportar, type DependenciasExportar } from './exportar'

const lib = libreriaDePrueba().piezas
const FUENTES = { interfaz: "'Mona Sans Variable'", cifras: "'Geist Mono Variable'", serif: "'Source Serif 4 Variable'" }

function armar(o: { ruta?: string | null; doc?: ReturnType<typeof divisor>; tema?: 'claro' | 'oscuro'; falla?: string } = {}) {
  const escritos = new Map<string, Uint8Array>()
  const pdfs: { ruta: string; svg: string; pagina: PaginaPdf }[] = []
  const pedidos: string[] = []
  const rasters: number[][] = []
  const eventos: string[] = []
  const dibujados: { n: number; zoom: number }[] = []
  const api = {
    rutaExportar: async (f: string, s: string) => (pedidos.push(`${f} ${s}`), o.ruta === undefined ? `/x/esquema.${f}` : o.ruta),
    escribirExportacion: async (ruta: string, b: Uint8Array) => (o.falla ? { ok: false, error: o.falla } : (escritos.set(ruta, b), { ok: true, recientes: [] })),
    pdf: async (ruta: string, svg: string, pagina: PaginaPdf) => (pdfs.push({ ruta, svg, pagina }), { ok: true, recientes: [] })
  } as unknown as ApiArchivos
  const doc = o.doc ?? divisor()
  const d: DependenciasExportar = {
    api,
    escena: (p) => construirEscena(doc, lib, calcularConexiones(doc, lib), p),
    paleta: (t) => paletaDeTema(t, 'verde'),
    temaActual: o.tema ?? 'claro',
    fuentes: FUENTES,
    cargarFuentes: async () => {
      await Promise.resolve()
      eventos.push('cargar')
    },
    css: async () => (eventos.push('css'), '/* fuentes */'),
    base: () => (eventos.push('base'), 0.27),
    rasterizar: async (svg, w, h, ppp, encima) => {
      rasters.push([w, h, ppp])
      expect(svg).not.toContain('<text')
      encima({} as CanvasRenderingContext2D)
      return new Uint8Array([137, 80])
    },
    dibujarTextos: (_ctx, ts, cam) => dibujados.push({ n: ts.length, zoom: cam.zoom }),
    nombre: 'practica-3.kir'
  }
  return { d, escritos, pdfs, pedidos, rasters, dibujados, eventos }
}
const op = (extra: Partial<OpcionesExportar> = {}): OpcionesExportar => ({ ...exportarPorOmision(), ...extra })
const texto = (b: Uint8Array) => new TextDecoder().decode(b)

describe('la vista previa de exportar', () => {
  it('arma el SVG con sus textos y las fuentes sin pedir archivo ni escribir nada, también para PNG', async () => {
    const t = armar()
    for (const f of ['png', 'svg', 'pdf'] as const) {
      const v = await vistaPreviaExportar(f, op(), t.d)
      expect(v?.svg).toContain('<title>practica-3.kir</title>')
      expect(v?.svg).toContain('<text')
      expect(v?.svg).toContain('/* fuentes */')
      expect(v!.anchoMm).toBeGreaterThan(10)
    }
    expect(t.pedidos).toEqual([])
    expect(t.escritos.size).toBe(0)
    expect(t.pdfs).toEqual([])
    expect(t.rasters).toEqual([])
  })

  it('sigue las opciones: fondo transparente (solo PNG y SVG), rejilla y el tema del fondo «tema»', async () => {
    const t = armar()
    expect((await vistaPreviaExportar('png', op({ fondo: 'transparente' }), t.d))?.transparente).toBe(true)
    // Un PDF no tiene fondo transparente: sale en blanco.
    expect((await vistaPreviaExportar('pdf', op({ fondo: 'transparente' }), t.d))?.transparente).toBe(false)
    expect((await vistaPreviaExportar('svg', op({ rejilla: true }), t.d))?.svg).toContain('rejilla-menor')
    expect((await vistaPreviaExportar('svg', op({ rejilla: false }), t.d))?.svg).not.toContain('rejilla-menor')
  })

  it('un dibujo vacío no tiene vista previa', async () => {
    const t = armar({ doc: documentoVacio() as ReturnType<typeof divisor> })
    expect(await vistaPreviaExportar('svg', op(), t.d)).toBeNull()
  })
})

describe('exportar', () => {
  it('SVG: sugiere el nombre del circuito y escribe el SVG en blanco (el fondo por omisión) con las fuentes', async () => {
    const t = armar()
    const r = await exportar('svg', op(), t.d)
    expect(r).toEqual({ ok: true, ruta: '/x/esquema.svg', mensaje: 'Se exportó esquema.svg.' })
    expect(t.pedidos).toEqual(['svg practica-3.svg'])
    const svg = texto(t.escritos.get('/x/esquema.svg')!)
    expect(svg).toContain('<title>practica-3.kir</title>')
    expect(svg).toContain('/* fuentes */')
    expect(svg).toContain('fill="#ffffff"')
    expect(svg).not.toContain(`fill="${TOKENS_CLAROS.lienzo.toLowerCase()}"`)
    expect(exportarPorOmision().fondo).toBe('blanco')
    // El papel claro sigue disponible si se elige.
    const papel = armar()
    await exportar('svg', op({ fondo: 'papel' }), papel.d)
    expect(texto(papel.escritos.get('/x/esquema.svg')!)).toContain(`fill="${TOKENS_CLAROS.lienzo.toLowerCase()}"`)
  })

  it('una figura a media opacidad sale en el SVG mezclada con el fondo de la hoja (blanco por omisión), no con el papel', async () => {
    const doc = divisor()
    doc.figuras = { f1: { id: 'f1', tipo: 'linea', x1: -40, y1: -40, x2: -20, y2: -40, orden: 0, tinta: 'tinta', opacidad: 50 } }
    const t = armar({ doc })
    await exportar('svg', op(), t.d)
    // Tinta #1E2430 a la mitad sobre blanco: (30+255)/2, (36+255)/2, (48+255)/2.
    expect(texto(t.escritos.get('/x/esquema.svg')!)).toMatch(/stroke="#8f9298"|stroke="#8e9298"|stroke="#8f9297"|stroke="#8e9197"/)
  })

  it('carga las fuentes de los textos antes de medir la línea base y de leer los archivos de fuente', async () => {
    for (const formato of ['svg', 'pdf'] as const) {
      const t = armar()
      await exportar(formato, op(), t.d)
      expect(t.eventos[0]).toBe('cargar')
      expect(t.eventos).toContain('base')
    }
    const png = armar()
    await exportar('png', op(), png.d)
    expect(png.eventos[0]).toBe('cargar')
  })

  it('el tema elegido manda sobre el de la aplicación: claro con la app en oscuro y oscuro con la app en claro', async () => {
    const claro = armar({ tema: 'oscuro' })
    await exportar('svg', op({ fondo: 'papel' }), claro.d)
    expect(texto(claro.escritos.get('/x/esquema.svg')!)).not.toContain(TOKENS_OSCUROS.pieza.toLowerCase())
    const oscuro = armar({ tema: 'claro' })
    await exportar('svg', op({ fondo: 'oscuro' }), oscuro.d)
    const s = texto(oscuro.escritos.get('/x/esquema.svg')!)
    expect(s).toContain(TOKENS_OSCUROS.pieza.toLowerCase())
    expect(s).toContain(`fill="${TOKENS_OSCUROS.lienzo.toLowerCase()}"`)
  })

  it('PNG: a la escala elegida y con su resolución en ppp', async () => {
    const t = armar()
    expect(await exportar('png', op({ escala: 3 }), t.d)).toMatchObject({ ok: true, ruta: '/x/esquema.png' })
    expect(t.rasters[0][2]).toBe(288)
    expect(t.escritos.get('/x/esquema.png')).toEqual(new Uint8Array([137, 80]))
    // Los textos van encima con Canvas2D, a los mismos píxeles por unidad que la imagen (3 × 96 ppp × 1.25 mm).
    expect(t.dibujados[0].n).toBeGreaterThan(0)
    expect(t.dibujados[0].zoom).toBeCloseTo((288 / 25.4) * 1.25, 1)
  })

  it('PNG reducido por tamaño: el ppp del archivo es 96 por la escala que de verdad se usó', async () => {
    const t = armar()
    const r = await exportar('png', op({ escala: 1000 as unknown as OpcionesExportar['escala'] }), t.d)
    expect(r).toMatchObject({ ok: true })
    expect('aviso' in r && r.aviso).toMatch(/salió a/)
    const esc = t.d.escena(t.d.paleta('claro'), op())
    const { anchoMm } = cajaLamina(esc.caja!)
    const [ancho, alto, ppp] = t.rasters[0]
    const usada = ppp / 96
    expect(usada).toBeLessThan(1000)
    expect(ancho).toBe(Math.floor(anchoMm * (96 / 25.4) * usada))
    expect(ancho).toBeLessThanOrEqual(16384)
    expect(ancho * alto).toBeLessThanOrEqual(32_000_000)
  })

  it('PDF: manda el SVG con la página y el tamaño de la lámina', async () => {
    const t = armar()
    await exportar('pdf', op({ pagina: 'carta' }), t.d)
    expect(t.pdfs[0].ruta).toBe('/x/esquema.pdf')
    expect(t.pdfs[0].pagina.tipo).toBe('carta')
    expect(t.pdfs[0].pagina.anchoMm).toBeGreaterThan(0)
    expect(t.pdfs[0].svg).toMatch(/^<\?xml/)
  })

  it('cancelar el diálogo no arma nada; un error de escritura se devuelve', async () => {
    const t = armar({ ruta: null })
    expect(await exportar('png', op(), t.d)).toEqual({ ok: false, cancelado: true })
    expect(t.rasters).toEqual([])
    expect(await exportar('svg', op(), armar({ falla: 'No se pudo exportar esquema.svg: el disco está lleno.' }).d)).toEqual({ ok: false, error: 'No se pudo exportar esquema.svg: el disco está lleno.' })
  })

  it('el circuito vacío no se exporta', async () => {
    expect(await exportar('svg', op(), armar({ doc: documentoVacio() }).d)).toEqual({ ok: false, error: 'El circuito está vacío: no hay nada que exportar.' })
  })

  it('fondo: papel, blanco, transparente (en PDF, blanco) y oscuro', () => {
    const p = (t: 'claro' | 'oscuro') => paletaDeTema(t)
    expect(aspecto(op({ fondo: 'papel' }), 'png', 'oscuro', p).fondo).toEqual(p('claro').lienzo)
    expect(aspecto(op({ fondo: 'blanco' }), 'png', 'claro', p).fondo).toEqual([1, 1, 1, 1])
    expect(aspecto(op({ fondo: 'transparente' }), 'svg', 'claro', p).fondo).toBeNull()
    expect(aspecto(op({ fondo: 'transparente' }), 'pdf', 'claro', p).fondo).toEqual([1, 1, 1, 1])
    expect(aspecto(op({ fondo: 'oscuro' }), 'png', 'claro', p).paleta).toBe(p('oscuro'))
    expect(aspecto(op({ fondo: 'papel' }), 'png', 'oscuro', p).paleta).toBe(p('claro'))
  })
})

describe('el margen y el área de la lámina', () => {
  it('margenMm cambia el tamaño de la lámina, y una caja de área la ciñe', async () => {
    const t = armar()
    const a0 = (await vistaPreviaExportar('svg', op({ margenMm: 0 }), t.d))!.anchoMm
    const a30 = (await vistaPreviaExportar('svg', op({ margenMm: 30 }), t.d))!.anchoMm
    expect(a30 - a0).toBeCloseTo(60, 0)
    const area = (await vistaPreviaExportar('svg', op({ margenMm: 5 }), { ...t.d, caja: { minX: 0, minY: 0, maxX: 20, maxY: 10 } }))!
    expect(area.anchoMm).toBeCloseTo(20 * 1.25 + 10, 0)
    expect(area.altoMm).toBeCloseTo(10 * 1.25 + 10, 0)
  })
})

describe('las anotaciones del diálogo en el archivo exportado', () => {
  it('SVG, PDF y PNG llevan lo que superpone el diálogo, con el tema del fondo', async () => {
    const t = armar()
    const temas: string[] = []
    t.d.superponer = (svg, tema) => (temas.push(tema), svg.replace('</svg>', '<g id="anotaciones"/></svg>'))
    await exportar('svg', op({ fondo: 'oscuro' }), t.d)
    expect(texto(t.escritos.get('/x/esquema.svg')!)).toContain('<g id="anotaciones"/>')
    await exportar('pdf', op({ fondo: 'blanco' }), t.d)
    expect(t.pdfs[0].svg).toContain('<g id="anotaciones"/>')
    expect(temas).toEqual(['oscuro', 'claro'])
    // La vista previa del diálogo no las lleva: las pinta aparte para poder editarlas.
    const sin = armar()
    expect((await vistaPreviaExportar('svg', op(), sin.d))?.svg).not.toContain('anotaciones')
  })
})

describe('la lámina abarca las anotaciones', () => {
  it('una etiqueta fuera del dibujo agranda la lámina y cae entera dentro del viewBox', async () => {
    const t = armar()
    const sola = (await vistaPreviaExportar('svg', op({ margenMm: 5 }), t.d))!
    const dibujo = t.d.escena(paletaDeTema('claro', 'verde'), op()).caja!
    const puesta = crearLectura([], { x: dibujo.minX * 1.25 + 4, y: dibujo.minY * 1.25 + 2, magnitud: 'voltaje', cable: 'c1', pin: null })!
    // El punto medido cae dentro del dibujo y el globo, 30 mm más arriba, fuera de él.
    const notas = editarNota(puesta.notas, puesta.id, { dy: -30 })
    const ctx = { texto: () => '12.34 V' }
    t.d.cajaNotas = (d) => cajaDeNotas(notas, ctx, d)
    t.d.superponer = (svg, tema) => conNotasEnSvg(svg, notas, { tema, ctx })
    const v = (await vistaPreviaExportar('svg', op({ margenMm: 5 }), t.d))!
    expect(v.altoMm).toBeGreaterThan(sola.altoMm)
    const vb = /viewBox="(\S+) (\S+) (\S+) (\S+)"/.exec(v.svg)!.slice(1).map(Number)
    const g = cajaVisibleDeNota(notas[0], ctx)
    expect(g.y / 1.25).toBeGreaterThanOrEqual(vb[1])
    expect(g.x / 1.25).toBeGreaterThanOrEqual(vb[0])
    expect((g.y + g.h) / 1.25).toBeLessThanOrEqual(vb[1] + vb[3])
    expect((g.x + g.w) / 1.25).toBeLessThanOrEqual(vb[0] + vb[2])
  })
})

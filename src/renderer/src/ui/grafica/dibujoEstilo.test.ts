import { describe, expect, it } from 'vitest'
import { ASPECTO_ANALISIS as ASPECTO_INSTRUMENTO, ASPECTO_INFORME as ASPECTO_ANALISIS, type AspectoGrafica } from '../../../../compartido/grafica/aspecto'
import type { Lienzo2D } from '../osciloscopio/dibujar'
import { dibujarGrafica, geometriaGrafica, lineasDeCursores, lineasDeCursoresCompactas } from './dibujo'
import { lecturaEn } from './lectura'
import { marcasLineales } from '../../../../compartido/grafica/ticks'
import { VISTA_COMPLETA, type ModeloGrafica, type VistaGrafica } from './modelo'
import { coloresGrafica } from './paleta'

/** Un contexto que anota lo que se escribe (con su relleno y su fuente), los trazos (con su ancho y guiones) y los rellenos. */
function contexto() {
  const textos: string[] = []
  const rotulos: { texto: string; relleno: string; fuente: string }[] = []
  const trazos: { estilo: string; n: number; ancho: number; guiones: number }[] = []
  let rellenos = 0
  let n = 0
  let guiones: number[] = []
  const ctx = {
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: 'left', textBaseline: 'alphabetic',
    fillRect: () => void rellenos++,
    beginPath: () => void (n = 0),
    moveTo: () => void n++,
    lineTo: () => void n++,
    stroke: () => trazos.push({ estilo: String(ctx.strokeStyle), n, ancho: ctx.lineWidth, guiones: guiones.length }),
    fill: () => {}, closePath: () => {}, rect: () => {}, clip: () => {}, save: () => {}, restore: () => {},
    setLineDash: (g: number[]) => void (guiones = g),
    translate: () => {},
    measureText: (t: string) => ({ width: t.length * 7 }),
    fillText: (t: string) => {
      textos.push(t)
      rotulos.push({ texto: t, relleno: String(ctx.fillStyle), fuente: ctx.font })
    }
  }
  return { ctx: ctx as unknown as Lienzo2D, textos, rotulos, trazos, rellenos: () => rellenos }
}

const claro = coloresGrafica('claro')
const t5 = Float64Array.from([0, 0.001, 0.002, 0.003, 0.004])
const mV: ModeloGrafica = {
  tipo: 'lineas',
  ejeX: { nombre: 'Tiempo', unidad: 's', escala: 'lin', datos: { min: 0, max: 0.004 } },
  paneles: [{ titulo: '' }],
  trazas: [
    { clave: 'V(a)', etiqueta: 'V(a)', unidad: 'V', x: t5, y: Float64Array.from([0, 0.0005, 0.001, 0.0015, 0.002]), panel: 0, tono: 'canal-a', lado: 'izquierda' },
    { clave: 'V(b)', etiqueta: 'V(b)', unidad: 'V', x: t5, y: Float64Array.from([0.002, 0.0015, 0.001, 0.0005, 0]), panel: 0, tono: 'canal-b', lado: 'izquierda' }
  ]
}
const eje = Float64Array.from([10, 100, 1000, 10000])
const bode: ModeloGrafica = {
  tipo: 'lineas',
  ejeX: { nombre: 'Frecuencia', unidad: 'Hz', escala: 'log', datos: { min: 10, max: 10000 } },
  paneles: [{ titulo: 'Magnitud' }, { titulo: 'Fase' }],
  trazas: [
    { clave: 'V(s)', etiqueta: 'V(s)', unidad: 'dB', x: eje, y: Float64Array.from([0, -0.04, -3, -20]), panel: 0, tono: 'canal-a', lado: 'izquierda' },
    { clave: 'V(s)', etiqueta: 'V(s)', unidad: '°', x: eje, y: Float64Array.from([-0.5, -6, -45, -84]), panel: 1, tono: 'canal-a', lado: 'izquierda' }
  ]
}

const soloCifras = (t: string) => /^[\d.−]+$/.test(t)

describe('estilo de los ejes, rejilla y unidades (N8b)', () => {
  it('la unidad sale del rango y va una sola vez: ms al final del tiempo y mV sobre el eje vertical', () => {
    const { ctx, textos } = contexto()
    dibujarGrafica(ctx, mV, VISTA_COMPLETA, ASPECTO_ANALISIS, claro, 800, 400, { dpr: 1 })
    expect(textos.filter((t) => t === 'ms')).toHaveLength(1)
    expect(textos.filter((t) => t === 'mV')).toHaveLength(1)
    // Ninguna cifra lleva la unidad pegada.
    expect(textos.some((t) => /\d\s?(m|k|µ)?(V|s)$/.test(t))).toBe(false)
  })
  it('la unidad mostrada se elige aparte de la escala: en V las cifras son 0, 0.0005… y el rótulo dice V', () => {
    const { ctx, textos } = contexto()
    const m: ModeloGrafica = { ...mV, trazas: mV.trazas.map((t) => ({ ...t, prefijo: 'base' as const })) }
    dibujarGrafica(ctx, m, VISTA_COMPLETA, ASPECTO_ANALISIS, claro, 800, 400, { dpr: 1 })
    expect(textos).toContain('V')
    expect(textos).not.toContain('mV')
    expect(textos.some((t) => /^0\.00\d+$/.test(t))).toBe(true)
  })
  it('el eje del tiempo en µs (elegido) escribe los números en µs aunque el rango pida ms', () => {
    const { ctx, textos } = contexto()
    dibujarGrafica(ctx, mV, VISTA_COMPLETA, { ...ASPECTO_ANALISIS, prefijoX: 'u' }, claro, 800, 400, { dpr: 1 })
    expect(textos).toContain('µs')
    expect(textos).toContain('2000')
  })
  it('los decimales elegidos del eje horizontal mandan sobre los de omisión', () => {
    const { ctx, textos } = contexto()
    dibujarGrafica(ctx, mV, VISTA_COMPLETA, { ...ASPECTO_ANALISIS, prefijoX: 'u', decimalesX: 0 }, claro, 800, 400, { dpr: 1 })
    expect(textos).toContain('2000')
    expect(textos).not.toContain('2000.00')
  })
  it('el texto de los ejes lleva el tono elegido y el de la traza solo cuando se pide', () => {
    const tonos = (a: AspectoGrafica) => {
      const { ctx, rotulos } = contexto()
      dibujarGrafica(ctx, mV, VISTA_COMPLETA, a, claro, 800, 400, { dpr: 1 })
      return [...new Set(rotulos.filter((r) => soloCifras(r.texto)).map((r) => r.relleno))]
    }
    expect(tonos(ASPECTO_ANALISIS)).toEqual([claro.letra('negro')])
    expect(tonos({ ...ASPECTO_ANALISIS, textoTono: 'naranja' })).toEqual([claro.letra('naranja')])
    // Dos trazas en un mismo eje: el texto «de la traza» cae al gris del tema.
    expect(tonos({ ...ASPECTO_ANALISIS, textoTono: null })).toEqual([claro.texto])
  })
  it('el peso del texto llega a la fuente de las cifras', () => {
    const fuentes = (a: AspectoGrafica) => {
      const { ctx, rotulos } = contexto()
      dibujarGrafica(ctx, mV, VISTA_COMPLETA, a, claro, 800, 400, { dpr: 1 })
      return rotulos.filter((r) => soloCifras(r.texto)).map((r) => r.fuente)
    }
    expect(fuentes({ ...ASPECTO_ANALISIS, textoPeso: 'negrita' }).every((f) => f.startsWith('700 '))).toBe(true)
    expect(fuentes({ ...ASPECTO_ANALISIS, textoPeso: 'medio' }).every((f) => f.startsWith('500 '))).toBe(true)
    expect(fuentes(ASPECTO_ANALISIS).every((f) => !/^\d{3} /.test(f))).toBe(true)
  })
  it('el tamaño del texto llega a las cifras de los ejes y ensancha la columna de la escala', () => {
    const px = (a: AspectoGrafica) => {
      const { ctx, rotulos } = contexto()
      const g = dibujarGrafica(ctx, mV, VISTA_COMPLETA, a, claro, 800, 400, { dpr: 1 })
      return { tam: [...new Set(rotulos.filter((r) => soloCifras(r.texto)).map((r) => /(\d+)px/.exec(r.fuente)![1]))], x: g.paneles[0].col.x }
    }
    const base = px(ASPECTO_ANALISIS)
    const grande = px({ ...ASPECTO_ANALISIS, textoTam: 22 })
    expect(base.tam).toEqual(['11'])
    expect(grande.tam).toEqual(['22'])
    expect(grande.x).toBeGreaterThan(base.x)
  })
  it('cada traza usa su grosor y, sin él, el de la gráfica', () => {
    const m: ModeloGrafica = { ...mV, trazas: [{ ...mV.trazas[0], grosor: 4 }, mV.trazas[1]] }
    const { ctx, trazos } = contexto()
    dibujarGrafica(ctx, m, VISTA_COMPLETA, { ...ASPECTO_ANALISIS, grosor: 2 }, claro, 800, 400, { dpr: 1 })
    const de = (tono: 'canal-a' | 'canal-b') => trazos.filter((t) => t.estilo === claro.linea(tono) && t.n > 3).map((t) => t.ancho)
    expect(de('canal-a')).toContain(4)
    expect(de('canal-b')).toContain(2)
  })
  it('la rejilla de guiones usa guiones, la de puntos pinta cuadritos y la horizontal quita las verticales', () => {
    const medir = (e: AspectoGrafica['rejillaEstilo']) => {
      const r = contexto()
      dibujarGrafica(r.ctx, mV, VISTA_COMPLETA, { ...ASPECTO_ANALISIS, rejillaEstilo: e }, claro, 800, 400, { dpr: 1 })
      return { rejilla: r.trazos.filter((t) => t.estilo === claro.reticula), rellenos: r.rellenos() }
    }
    const lineas = medir('lineas')
    expect(medir('guiones').rejilla[0].guiones).toBeGreaterThan(0)
    expect(lineas.rejilla[0].guiones).toBe(0)
    expect(medir('puntos').rellenos).toBeGreaterThan(lineas.rellenos)
    expect(medir('puntos').rejilla).toHaveLength(0)
    expect(medir('horizontal').rejilla[0].n).toBeLessThan(lineas.rejilla[0].n)
    expect(medir('vertical').rejilla[0].n).toBeLessThan(lineas.rejilla[0].n)
    expect(medir('vertical').rejilla[0].n + medir('horizontal').rejilla[0].n).toBe(lineas.rejilla[0].n)
  })
  it('las subdivisiones lineales pintan rayas más tenues entre las marcas de cada eje', () => {
    const medir = (p: Partial<AspectoGrafica>) => {
      const r = contexto()
      dibujarGrafica(r.ctx, mV, VISTA_COMPLETA, { ...ASPECTO_ANALISIS, ...p }, claro, 800, 400, { dpr: 1 })
      return r.trazos.filter((t) => t.estilo !== claro.reticula && t.estilo.startsWith('rgba') && t.estilo.includes(', 0.5)'))
    }
    expect(medir({})).toHaveLength(0)
    const g = geometriaGrafica(mV, VISTA_COMPLETA, ASPECTO_ANALISIS, 800, 400, 1)
    const marcasX = marcasLineales(g.x.min, g.x.max, Math.max(2, Math.floor(g.paneles[0].col.w / 86))).length
    expect(medir({ subdivisionesX: 4 })[0].n).toBe((marcasX - 1) * 3 * 2)
    expect(medir({ subdivisionesY: 2 })[0].n).toBeGreaterThan(0)
    expect(medir({ subdivisionesX: 4, rejillaEstilo: 'horizontal' })).toHaveLength(0)
    expect(medir({ subdivisionesY: 2, rejillaEstilo: 'vertical' })).toHaveLength(0)
    expect(medir({ subdivisionesX: 4, rejillaEstilo: 'puntos' })).toHaveLength(0)
    expect(medir({ subdivisionesX: 4, rejilla: false })).toHaveLength(0)
  })
  it('en un eje logarítmico las subdivisiones pintan las marcas 2 a 9 de cada década más tenues y las décadas quedan normales', () => {
    const rej = (p: Partial<AspectoGrafica>) => {
      const r = contexto()
      dibujarGrafica(r.ctx, bode, VISTA_COMPLETA, { ...ASPECTO_ANALISIS, ...p }, claro, 800, 600, { dpr: 1 })
      return { normal: r.trazos.filter((t) => t.estilo === claro.reticula), tenue: r.trazos.filter((t) => t.estilo !== claro.reticula && t.estilo.startsWith('rgba') && t.estilo.includes(', 0.5)')) }
    }
    // De omisión (3 décadas): las 2 a 9 ya salían como rayas normales y no hay tenues.
    const base = rej({})
    expect(base.tenue).toHaveLength(0)
    // Con subdivisiones elegidas: las décadas (4 rayas por panel) normales y 2 a 9 de tres décadas (24 por panel) tenues, 2 puntos cada raya.
    const sub = rej({ subdivisionesX: 2 })
    expect(sub.tenue[0].n).toBe(24 * 2)
    expect(sub.normal[0].n).toBeLessThan(base.normal[0].n)
    // «Ninguna» deja solo las décadas.
    expect(rej({ subdivisionesX: 1 }).tenue).toHaveLength(0)
  })
  it('las asas de los ejes solo se dibujan en pantalla', () => {
    const con = contexto()
    dibujarGrafica(con.ctx, mV, VISTA_COMPLETA, ASPECTO_ANALISIS, claro, 800, 400, { dpr: 1, asas: true })
    const sin = contexto()
    dibujarGrafica(sin.ctx, mV, VISTA_COMPLETA, ASPECTO_ANALISIS, claro, 800, 400, { dpr: 1 })
    expect(con.rellenos()).toBeGreaterThan(sin.rellenos())
  })
  it('la lectura al pasar el ratón escribe su encabezado y el valor de cada traza', () => {
    const g = geometriaGrafica(mV, VISTA_COMPLETA, ASPECTO_ANALISIS, 800, 400, 1)
    const l = lecturaEn(mV, VISTA_COMPLETA, g, g.paneles[0].col.x + g.paneles[0].col.w / 2)!
    const { ctx, textos } = contexto()
    dibujarGrafica(ctx, mV, VISTA_COMPLETA, ASPECTO_ANALISIS, claro, 800, 400, { dpr: 1, lectura: l })
    expect(textos).toContain('t = 2 ms')
    expect(textos.some((t) => t.startsWith('V(a)') && t.includes('1 mV'))).toBe(true)
  })
  it('la lectura no se dibuja al exportar (sin ejes)', () => {
    const g = geometriaGrafica(mV, VISTA_COMPLETA, ASPECTO_ANALISIS, 800, 400, 1)
    const l = lecturaEn(mV, VISTA_COMPLETA, g, g.paneles[0].col.x + g.paneles[0].col.w / 2)!
    const { ctx, textos } = contexto()
    dibujarGrafica(ctx, mV, VISTA_COMPLETA, ASPECTO_ANALISIS, claro, 800, 400, { dpr: 1, lectura: l, sinEjes: true })
    expect(textos).not.toContain('t = 2 ms')
  })
})

describe('cursores compactos', () => {
  const vista: VistaGrafica = { ...VISTA_COMPLETA, cursores: [100, 1000] }
  it('muestran solo las diferencias', () => {
    const g = geometriaGrafica(bode, vista, ASPECTO_ANALISIS, 800, 600, 1)
    const l = lineasDeCursoresCompactas(bode, vista, g)
    expect(l[0]).toBe('Δf 900 Hz (×10)')
    expect(l.every((x) => !x.includes('→'))).toBe(true)
    expect(l.some((x) => x.startsWith('V(s)') && x.includes('Δ'))).toBe(true)
    expect(l.length).toBeLessThanOrEqual(lineasDeCursores(bode, vista, g).length)
  })
  it('el detalle sigue mostrando los dos valores de cada cursor', () => {
    const g = geometriaGrafica(bode, vista, ASPECTO_ANALISIS, 800, 600, 1)
    expect(lineasDeCursores(bode, vista, g).some((x) => x.includes('→'))).toBe(true)
  })
  it('el cuadro de la gráfica es compacto salvo que se pida el detalle', () => {
    const compacto = contexto()
    dibujarGrafica(compacto.ctx, bode, vista, ASPECTO_ANALISIS, claro, 800, 600, { dpr: 1 })
    expect(compacto.textos.some((t) => t.includes('→'))).toBe(false)
    const detalle = contexto()
    dibujarGrafica(detalle.ctx, bode, vista, ASPECTO_ANALISIS, claro, 800, 600, { dpr: 1, detalleCursores: true })
    expect(detalle.textos.some((t) => t.includes('→'))).toBe(true)
  })
})

describe('la columna de cada eje mide sus cifras', () => {
  const lado = (i: 0 | 1, dec: 0 | 4) => {
    const m: ModeloGrafica = { ...mV, trazas: mV.trazas.map((t) => ({ ...t, decimales: dec })) }
    return geometriaGrafica(m, VISTA_COMPLETA, ASPECTO_ANALISIS, 800, 400, 1).paneles[i]
  }
  it('con menos decimales o letra más chica la retícula crece, y nada pasa del borde', () => {
    const ancho = lado(0, 4)
    const angosto = lado(0, 0)
    expect(angosto.col.w).toBeGreaterThan(ancho.col.w)
    const grande = geometriaGrafica(mV, VISTA_COMPLETA, { ...ASPECTO_ANALISIS, textoTam: 20 }, 800, 400, 1).paneles[0]
    const normal = geometriaGrafica(mV, VISTA_COMPLETA, ASPECTO_ANALISIS, 800, 400, 1).paneles[0]
    expect(grande.col.w).toBeLessThan(normal.col.w)
    for (const k of grande.col.columnas) expect(k.x1).toBeLessThanOrEqual(800)
    expect(grande.col.x + grande.col.w).toBeLessThanOrEqual(800)
  })
})

describe('límites bonitos: los dos extremos de cada eje llevan cifra (X-Y de ±9.6 mV contra ±140 mV)', () => {
  const n = 41
  const x = Float64Array.from({ length: n }, (_, i) => 9.6e-3 * Math.sin((i / (n - 1)) * 2 * Math.PI))
  const y = Float64Array.from({ length: n }, (_, i) => 0.14 * Math.sin((i / (n - 1)) * 2 * Math.PI + 0.3))
  const xy: ModeloGrafica = {
    tipo: 'lineas',
    ejeX: { nombre: 'V(in)', unidad: 'V', escala: 'lin', datos: { min: -9.6e-3, max: 9.6e-3 } },
    paneles: [{ titulo: '' }],
    trazas: [{ clave: 'V(out)', etiqueta: 'V(out)', unidad: 'V', x, y, panel: 0, tono: 'canal-a', lado: 'izquierda' }],
    xy: true
  }
  it('el rango automático llega hasta la marca redonda siguiente: −10 a 10 mV y −150 a 150 mV', () => {
    const g = geometriaGrafica(xy, VISTA_COMPLETA, ASPECTO_ANALISIS, 800, 400, 1)
    expect(g.x.min).toBeCloseTo(-0.01, 12)
    expect(g.x.max).toBeCloseTo(0.01, 12)
    expect(g.paneles[0].grupos[0].dominio.min).toBeCloseTo(-0.15, 12)
    expect(g.paneles[0].grupos[0].dominio.max).toBeCloseTo(0.15, 12)
  })
  it('se escriben las cifras de los extremos de los dos ejes', () => {
    const { ctx, textos } = contexto()
    dibujarGrafica(ctx, xy, VISTA_COMPLETA, ASPECTO_ANALISIS, claro, 800, 400, { dpr: 1 })
    for (const t of ['−10', '10', '−150', '150']) expect(textos).toContain(t)
  })
  it('en la pantalla «Instrumento» el rango queda centrado y también lleva cifra en los bordes', () => {
    const g = geometriaGrafica(xy, VISTA_COMPLETA, ASPECTO_INSTRUMENTO, 800, 400, 1)
    const d = g.paneles[0].grupos[0].dominio
    expect(d.min).toBeCloseTo(-d.max, 12)
    expect(d.max).toBeGreaterThanOrEqual(0.14)
    const { ctx, textos } = contexto()
    dibujarGrafica(ctx, xy, VISTA_COMPLETA, ASPECTO_INSTRUMENTO, claro, 800, 400, { dpr: 1 })
    expect(textos).toContain('−200')
    expect(textos).toContain('200')
    expect(textos).toContain('10')
  })
})

describe('rango escrito a mano (X-Y de ±9.6 mV contra ±140 mV)', () => {
  const n = 41
  const x = Float64Array.from({ length: n }, (_, i) => 9.6e-3 * Math.sin((i / (n - 1)) * 2 * Math.PI))
  const y = Float64Array.from({ length: n }, (_, i) => 0.14 * Math.sin((i / (n - 1)) * 2 * Math.PI + 0.3))
  const modelo = (rango?: { min: number; max: number }): ModeloGrafica => ({
    tipo: 'lineas',
    ejeX: { nombre: 'V(in)', unidad: 'V', escala: 'lin', datos: { min: -9.6e-3, max: 9.6e-3 } },
    paneles: [{ titulo: '' }],
    trazas: [{ clave: 'V(out)', etiqueta: 'V(out)', unidad: 'V', x, y, panel: 0, tono: 'canal-a', lado: 'izquierda', ...(rango ? { rango } : {}) }]
  })
  it('el desde y el hasta mandan sobre los límites automáticos, en X y en Y', () => {
    const g = geometriaGrafica(modelo({ min: -0.2, max: 0.2 }), VISTA_COMPLETA, { ...ASPECTO_ANALISIS, rangoX: { min: -0.02, max: 0.02 } }, 800, 400, 1)
    expect(g.x).toEqual({ min: -0.02, max: 0.02 })
    expect(g.paneles[0].grupos[0].dominio).toEqual({ min: -0.2, max: 0.2 })
  })
  it('también en la pantalla «Instrumento» y sin rango vuelve a los límites bonitos', () => {
    const g = geometriaGrafica(modelo({ min: -0.3, max: 0.1 }), VISTA_COMPLETA, { ...ASPECTO_INSTRUMENTO, rangoX: { min: -0.015, max: 0.005 } }, 800, 400, 1)
    expect(g.x).toEqual({ min: -0.015, max: 0.005 })
    expect(g.divisionesX).toBe(false)
    expect(g.paneles[0].grupos[0].dominio).toEqual({ min: -0.3, max: 0.1 })
    const auto = geometriaGrafica(modelo(), VISTA_COMPLETA, ASPECTO_ANALISIS, 800, 400, 1)
    expect(auto.x.max).toBeCloseTo(0.01, 12)
  })
  it('las cifras de los extremos del rango escrito se dibujan', () => {
    const { ctx, textos } = contexto()
    dibujarGrafica(ctx, modelo({ min: -0.2, max: 0.2 }), VISTA_COMPLETA, { ...ASPECTO_ANALISIS, rangoX: { min: -0.02, max: 0.02 } }, claro, 800, 400, { dpr: 1 })
    for (const t of ['−200', '200', '−20', '20']) expect(textos).toContain(t)
  })
})


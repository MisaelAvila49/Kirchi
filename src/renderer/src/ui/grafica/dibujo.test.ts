import { describe, expect, it } from 'vitest'
import { ASPECTO_INFORME as ASPECTO_ANALISIS, type AspectoGrafica } from '../../../../compartido/grafica/aspecto'
import { COLORES_CLAROS, COLORES_OSCUROS } from '../colores'
import type { Lienzo2D } from '../osciloscopio/dibujar'
import { dibujarGrafica, geometriaGrafica, lineasDeCursores } from './dibujo'
import { VISTA_COMPLETA, type ModeloGrafica, type VistaGrafica } from './modelo'
import { coloresGrafica } from './paleta'

function contexto() {
  const textos: string[] = []
  const trazos: { estilo: string; n: number }[] = []
  let n = 0
  let guiones: number[] = []
  const ctx = {
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: 'left', textBaseline: 'alphabetic',
    fillRect: () => {},
    beginPath: () => void (n = 0),
    moveTo: () => void n++,
    lineTo: () => void n++,
    stroke: () => trazos.push({ estilo: String(ctx.strokeStyle), n }),
    fill: () => {}, closePath: () => {}, rect: () => {}, clip: () => {}, save: () => {}, restore: () => {},
    setLineDash: (g: number[]) => void (guiones = g),
    translate: () => {},
    measureText: (t: string) => ({ width: t.length * 7 }),
    fillText: (t: string) => textos.push(t)
  }
  void guiones
  return { ctx: ctx as unknown as Lienzo2D, textos, trazos }
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
const claro = coloresGrafica('claro')

describe('geometría de la gráfica', () => {
  it('un Bode son dos paneles apilados; solo el de abajo lleva el eje de frecuencia', () => {
    const g = geometriaGrafica(bode, VISTA_COMPLETA, ASPECTO_ANALISIS, 800, 600, 1)
    expect(g.paneles).toHaveLength(2)
    expect(g.paneles[0].col.eje.posicion).toBe('ninguno')
    expect(g.paneles[1].col.eje.posicion).toBe('abajo')
    expect(g.paneles[1].y0).toBe(g.paneles[0].alto)
    expect(g.paneles[0].alto + g.paneles[1].alto).toBe(600)
    expect(g.escalaX).toBe('log')
  })
  it('con el eje arriba el panel de arriba lleva la banda', () => {
    const g = geometriaGrafica(bode, VISTA_COMPLETA, { ...ASPECTO_ANALISIS, ejeX: 'arriba' }, 800, 600, 1)
    expect(g.paneles.map((p) => p.col.eje.posicion)).toEqual(['arriba', 'ninguno'])
  })
  it('un eje a la derecha y otro en medio acomodan las columnas sin tocar la retícula de la izquierda', () => {
    const m: ModeloGrafica = { ...bode, paneles: [{ titulo: '' }], trazas: [{ ...bode.trazas[0], panel: 0, lado: 'derecha' }, { ...bode.trazas[1], panel: 0, lado: 'centro' }] }
    const g = geometriaGrafica(m, VISTA_COMPLETA, ASPECTO_ANALISIS, 800, 400, 1)
    expect(g.paneles[0].grupos.map((k) => k.lado)).toEqual(['derecha', 'centro'])
    const col = g.paneles[0].col
    expect(col.columnas[0].x0).toBeGreaterThan(col.x + col.w)
    expect(col.columnas[1].linea).toBeCloseTo(col.x + col.w / 2, 6)
  })
  it('el zoom horizontal recalcula el rango vertical con solo los datos visibles', () => {
    const vista: VistaGrafica = { ...VISTA_COMPLETA, x: { min: 10, max: 100 } }
    const g = geometriaGrafica(bode, vista, ASPECTO_ANALISIS, 800, 600, 1)
    const entero = geometriaGrafica(bode, VISTA_COMPLETA, ASPECTO_ANALISIS, 800, 600, 1)
    expect(g.paneles[0].grupos[0].auto.min).toBeGreaterThan(entero.paneles[0].grupos[0].auto.min)
  })
  it('una traza oculta no tiene eje', () => {
    const g = geometriaGrafica(bode, { ...VISTA_COMPLETA, ocultas: new Set(['V(s)']) }, ASPECTO_ANALISIS, 800, 600, 1)
    expect(g.paneles.every((p) => p.grupos.length === 0)).toBe(true)
  })
})

describe('dibujo de la gráfica', () => {
  it('rotula el eje logarítmico con potencias de diez y los dos paneles con su unidad', () => {
    const { ctx, textos } = contexto()
    dibujarGrafica(ctx, bode, VISTA_COMPLETA, ASPECTO_ANALISIS, claro, 800, 600, { dpr: 1 })
    // Las cifras van sin unidad y la unidad se escribe una sola vez, al final del eje.
    expect(textos).toContain('100')
    expect(textos).toContain('1 k')
    expect(textos).toContain('Frecuencia')
    expect(textos.filter((t) => t === 'Hz')).toHaveLength(1)
    expect(textos).toContain('dB')
    expect(textos).toContain('°')
    expect(textos).toContain('Magnitud')
    expect(textos).toContain('Fase')
  })
  it('las marcas agregan rayitas a cada eje; sin ellas hay menos trazos', () => {
    const cuenta = (a: AspectoGrafica) => {
      const { ctx, trazos } = contexto()
      dibujarGrafica(ctx, bode, VISTA_COMPLETA, a, claro, 800, 600, { dpr: 1 })
      return trazos.reduce((s, t) => s + t.n, 0)
    }
    expect(cuenta({ ...ASPECTO_ANALISIS, marcas: true })).toBeGreaterThan(cuenta({ ...ASPECTO_ANALISIS, marcas: false }))
  })
  it('la rejilla apagada quita sus trazos', () => {
    const cuenta = (a: AspectoGrafica) => {
      const { ctx, trazos } = contexto()
      dibujarGrafica(ctx, bode, VISTA_COMPLETA, a, claro, 800, 600, { dpr: 1 })
      return trazos.reduce((s, t) => s + t.n, 0)
    }
    expect(cuenta({ ...ASPECTO_ANALISIS, rejilla: false })).toBeLessThan(cuenta(ASPECTO_ANALISIS))
  })
  it('una traza negra se pinta con el token negro del tema de la gráfica, claro u oscuro', () => {
    const negra: ModeloGrafica = { ...bode, trazas: bode.trazas.map((t) => ({ ...t, tono: 'negro' as const })) }
    for (const [tema, tabla] of [['claro', COLORES_CLAROS], ['oscuro', COLORES_OSCUROS]] as const) {
      const { ctx, trazos } = contexto()
      dibujarGrafica(ctx, negra, VISTA_COMPLETA, ASPECTO_ANALISIS, coloresGrafica(tema), 800, 600, { dpr: 1 })
      expect(trazos.some((t) => t.estilo === tabla.negro)).toBe(true)
    }
  })
  it('el grosor de la línea llega al dibujo', () => {
    let ancho = 0
    const { ctx } = contexto()
    const espia = new Proxy(ctx, { set: (o, k, v) => { if (k === 'lineWidth' && v > 2.5) ancho = v; return Reflect.set(o, k, v) } })
    dibujarGrafica(espia, bode, VISTA_COMPLETA, { ...ASPECTO_ANALISIS, grosor: 3 }, claro, 800, 600, { dpr: 1 })
    expect(ancho).toBe(3)
  })
  it('con muchísimos puntos no dibuja uno por punto', () => {
    const n = 200000
    const x = Float64Array.from({ length: n }, (_, i) => i / n)
    const y = Float64Array.from({ length: n }, (_, i) => Math.sin(i / 50))
    const m: ModeloGrafica = { tipo: 'lineas', ejeX: { nombre: 'Tiempo', unidad: 's', escala: 'lin', datos: { min: 0, max: 1 } }, paneles: [{ titulo: '' }], trazas: [{ clave: 'a', etiqueta: 'a', unidad: 'V', x, y, panel: 0, tono: 'canal-a', lado: 'izquierda' }] }
    const { ctx, trazos } = contexto()
    dibujarGrafica(ctx, m, VISTA_COMPLETA, ASPECTO_ANALISIS, claro, 800, 400, { dpr: 1 })
    expect(Math.max(...trazos.map((t) => t.n))).toBeLessThan(10 * 800)
  })
})

describe('lectura de los cursores', () => {
  it('da la diferencia, la razón en log y el valor de cada traza en cada cursor', () => {
    const vista: VistaGrafica = { ...VISTA_COMPLETA, cursores: [100, 1000] }
    const g = geometriaGrafica(bode, vista, ASPECTO_ANALISIS, 800, 600, 1)
    const l = lineasDeCursores(bode, vista, g)
    expect(l[0]).toContain('100 Hz')
    expect(l[1]).toContain('×10')
    expect(l.some((x) => x.includes('V(s)') && x.includes('dB'))).toBe(true)
    expect(l.some((x) => x.includes('°'))).toBe(true)
  })
  it('el valor en la frecuencia de corte (1 kHz) es −3 dB', () => {
    const vista: VistaGrafica = { ...VISTA_COMPLETA, cursores: [1000, 10000] }
    const g = geometriaGrafica(bode, vista, ASPECTO_ANALISIS, 800, 600, 1)
    expect(lineasDeCursores(bode, vista, g)[2]).toContain('−3 dB')
  })
  it('sin cursores no hay lectura', () => {
    expect(lineasDeCursores(bode, VISTA_COMPLETA, geometriaGrafica(bode, VISTA_COMPLETA, ASPECTO_ANALISIS, 800, 600, 1))).toEqual([])
  })
})

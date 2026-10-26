import { describe, expect, it } from 'vitest'
import { ASPECTO_ANALISIS, ASPECTO_INFORME } from '../../../../compartido/grafica/aspecto'
import type { Lienzo2D } from '../osciloscopio/dibujar'
import { DIVISIONES_X, DIVISIONES_Y, dibujarGrafica, geometriaGrafica } from './dibujo'
import { VISTA_COMPLETA, type ModeloGrafica } from './modelo'
import { coloresGrafica } from './paleta'

/** Un contexto que solo anota lo que se escribe y los trazos de cada pasada de `stroke`. */
function contexto() {
  const textos: string[] = []
  const trazos: { estilo: string; n: number }[] = []
  let n = 0
  const ctx = {
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: 'left', textBaseline: 'alphabetic',
    fillRect: () => {}, beginPath: () => void (n = 0), moveTo: () => void n++, lineTo: () => void n++,
    stroke: () => trazos.push({ estilo: String(ctx.strokeStyle), n }),
    fill: () => {}, closePath: () => {}, rect: () => {}, clip: () => {}, save: () => {}, restore: () => {}, setLineDash: () => {}, translate: () => {},
    measureText: (t: string) => ({ width: t.length * 7 }), fillText: (t: string) => textos.push(t)
  }
  return { ctx: ctx as unknown as Lienzo2D, textos, trazos }
}

const eje = Float64Array.from([10, 100, 1000, 10000])
const bode: ModeloGrafica = {
  tipo: 'lineas',
  ejeX: { nombre: 'Frecuencia', unidad: 'Hz', escala: 'log', datos: { min: 10, max: 10000 } },
  paneles: [{ titulo: 'Magnitud' }, { titulo: 'Fase' }],
  trazas: [
    { clave: 'V(s)', etiqueta: 'V(s)', unidad: 'dB', x: eje, y: Float64Array.from([0, -0.04, -3, -20]), panel: 0, tono: 'canal-a', lado: 'izquierda' },
    { clave: 'V(s)', etiqueta: 'V(s)', unidad: '°', x: eje, y: Float64Array.from([-0.5, -6, -45, -84]), panel: 1, tono: 'canal-b', lado: 'izquierda' }
  ]
}
const tiempo: ModeloGrafica = {
  tipo: 'lineas',
  ejeX: { nombre: 'Tiempo', unidad: 's', escala: 'lin', datos: { min: 0, max: 0.0047 } },
  paneles: [{ titulo: '' }],
  trazas: [{ clave: 'V(s)', etiqueta: 'V(s)', unidad: 'V', x: Float64Array.from([0, 0.0047]), y: Float64Array.from([0, 3.2]), panel: 0, tono: 'canal-a', lado: 'izquierda' }]
}
const claro = coloresGrafica('claro')

describe('gráficas de análisis en estilo Instrumento', () => {
  it('de omisión el Bode es una sola pantalla con la magnitud y la fase como columnas A y B; Informe sigue apilado', () => {
    const g = geometriaGrafica(bode, VISTA_COMPLETA, ASPECTO_ANALISIS, 800, 600, 1)
    expect(g.instrumento).toBe(true)
    expect(g.paneles).toHaveLength(1)
    expect(g.paneles[0].grupos.map((k) => k.unidad)).toEqual(['dB', '°'])
    expect(g.paneles[0].titulo).toBe('')
    expect(g.paneles[0].alto).toBe(600)
    const informe = geometriaGrafica(bode, VISTA_COMPLETA, ASPECTO_INFORME, 800, 600, 1)
    expect(informe.instrumento).toBe(false)
    expect(informe.paneles).toHaveLength(2)
  })

  it('cada eje vertical se reparte en ocho divisiones con marcas redondas, y el eje de la frecuencia va arriba', () => {
    const g = geometriaGrafica(bode, VISTA_COMPLETA, ASPECTO_ANALISIS, 800, 600, 1)
    for (const k of g.paneles[0].grupos) {
      expect(k.divisiones).toBe(true)
      expect(DIVISIONES_Y).toBe(8)
      const paso = (k.dominio.max - k.dominio.min) / DIVISIONES_Y
      expect(Math.abs(k.dominio.min / paso - Math.round(k.dominio.min / paso))).toBeLessThan(1e-9)
      // Los datos caben, salvo una holgura de 2 % del rango para no gastar una división por una décima de más.
      const holgura = 0.02 * (k.auto.max - k.auto.min) + 1e-9
      expect(k.dominio.min).toBeLessThanOrEqual(k.auto.min + holgura)
      expect(k.dominio.max).toBeGreaterThanOrEqual(k.auto.max - holgura)
    }
    expect(g.paneles[0].col.eje.posicion).toBe('arriba')
  })

  it('un eje de tiempo lineal se reparte en diez divisiones; con zoom del lector ya no se ajusta', () => {
    const g = geometriaGrafica(tiempo, VISTA_COMPLETA, ASPECTO_ANALISIS, 800, 400, 1)
    expect(g.divisionesX).toBe(true)
    expect(DIVISIONES_X).toBe(10)
    expect(g.x).toEqual({ min: 0, max: 0.005 })
    const zoom = geometriaGrafica(tiempo, { ...VISTA_COMPLETA, x: { min: 0.001, max: 0.0023 } }, ASPECTO_ANALISIS, 800, 400, 1)
    expect(zoom.divisionesX).toBe(false)
    expect(zoom.x).toEqual({ min: 0.001, max: 0.0023 })
    // El eje logarítmico conserva sus décadas.
    expect(geometriaGrafica(bode, VISTA_COMPLETA, ASPECTO_ANALISIS, 800, 600, 1).divisionesX).toBe(false)
  })

  it('con dos columnas las unidades llevan su letra (A dB, B °); con una sola, no', () => {
    const { ctx, textos } = contexto()
    dibujarGrafica(ctx, bode, VISTA_COMPLETA, ASPECTO_ANALISIS, claro, 800, 600, { dpr: 1 })
    expect(textos).toContain('A dB')
    expect(textos).toContain('B °')
    const uno = contexto()
    dibujarGrafica(uno.ctx, tiempo, VISTA_COMPLETA, ASPECTO_ANALISIS, claro, 800, 400, { dpr: 1 })
    expect(uno.textos).toContain('V')
    expect(uno.textos).not.toContain('A V')
  })

  it('las dos trazas del Bode se dibujan en la única pantalla, cada una con su tono', () => {
    const { ctx, trazos } = contexto()
    dibujarGrafica(ctx, bode, VISTA_COMPLETA, ASPECTO_ANALISIS, claro, 800, 600, { dpr: 1 })
    // Cada tono pinta el eje de su columna y su curva: con la curva faltando (como cuando se perdía la fase) solo queda el eje.
    expect(trazos.filter((t) => t.estilo === claro.linea('canal-a')).length).toBeGreaterThanOrEqual(2)
    expect(trazos.filter((t) => t.estilo === claro.linea('canal-b')).length).toBeGreaterThanOrEqual(2)
  })

  it('la cruz central lleva rayitas finas (cinco por división) solo en Instrumento y solo con marcas', () => {
    const cuenta = (a: typeof ASPECTO_ANALISIS) => {
      const { ctx, trazos } = contexto()
      dibujarGrafica(ctx, tiempo, VISTA_COMPLETA, a, claro, 800, 400, { dpr: 1 })
      return trazos.reduce((s, t) => s + t.n, 0)
    }
    const con = cuenta(ASPECTO_ANALISIS)
    expect(con).toBeGreaterThan(cuenta({ ...ASPECTO_ANALISIS, marcas: false }) + (DIVISIONES_X * 5 + DIVISIONES_Y * 5))
  })

  it('las cifras de cada eje llevan el tono de su traza, no el negro del informe', () => {
    expect(ASPECTO_ANALISIS.textoTono).toBeNull()
    expect(ASPECTO_INFORME.textoTono).toBe('negro')
  })
})

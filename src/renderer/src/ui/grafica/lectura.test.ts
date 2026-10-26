import { describe, expect, it } from 'vitest'
import { ASPECTO_ANALISIS } from '../../../../compartido/grafica/aspecto'
import { geometriaGrafica } from './dibujo'
import { lecturaEn } from './lectura'
import { VISTA_COMPLETA, type ModeloGrafica } from './modelo'

const t = Float64Array.from({ length: 101 }, (_, i) => i * 1e-5)
const modelo: ModeloGrafica = {
  tipo: 'lineas',
  ejeX: { nombre: 'Tiempo', unidad: 's', escala: 'lin', datos: { min: 0, max: 1e-3 } },
  paneles: [{ titulo: '' }],
  trazas: [
    { clave: 'V(a)', etiqueta: 'V(a)', unidad: 'V', x: t, y: Float64Array.from(t, (x) => x * 1000), panel: 0, tono: 'canal-a', lado: 'izquierda' },
    { clave: 'I(R1)', etiqueta: 'I(R1)', unidad: 'A', x: t, y: Float64Array.from(t, (x) => x * 2), panel: 0, tono: 'canal-b', lado: 'derecha' }
  ]
}
const geo = () => geometriaGrafica(modelo, VISTA_COMPLETA, ASPECTO_ANALISIS, 800, 400, 1)
const mitad = (g: ReturnType<typeof geo>) => g.paneles[0].col.x + g.paneles[0].col.w / 2

describe('lectura al pasar el ratón', () => {
  it('fuera de la retícula no lee nada', () => {
    const g = geo()
    expect(lecturaEn(modelo, VISTA_COMPLETA, g, g.paneles[0].col.x - 3)).toBeNull()
    expect(lecturaEn(modelo, VISTA_COMPLETA, g, g.paneles[0].col.x + g.paneles[0].col.w + 3)).toBeNull()
  })
  it('lee el valor de cada traza en el punto bajo el puntero, con el prefijo de su eje', () => {
    const g = geo()
    const l = lecturaEn(modelo, VISTA_COMPLETA, g, mitad(g))!
    expect(l.encabezado).toMatch(/^t = 0\.5 ms$/)
    const a = l.filas.find((f) => f.clave === 'V(a)')!
    expect(a.valor).toBeCloseTo(0.5, 6)
    expect(a.texto).toBe('0.5 V')
    const b = l.filas.find((f) => f.clave === 'I(R1)')!
    expect(b.texto).toBe('1 mA')
    expect(a.yPx).not.toBeNull()
  })
  it('una traza apagada no aparece', () => {
    const g = geo()
    const l = lecturaEn(modelo, { ...VISTA_COMPLETA, ocultas: new Set(['I(R1)']) }, g, mitad(g))!
    expect(l.filas.map((f) => f.clave)).toEqual(['V(a)'])
  })
  it('con pocos puntos la cruz se pega al dato más cercano', () => {
    const x = Float64Array.from([0, 0.5, 1])
    const m: ModeloGrafica = { ...modelo, ejeX: { nombre: 'Tiempo', unidad: 's', escala: 'lin', datos: { min: 0, max: 1 } }, trazas: [{ ...modelo.trazas[0], x, y: Float64Array.from([0, 10, 4]) }] }
    const g = geometriaGrafica(m, VISTA_COMPLETA, ASPECTO_ANALISIS, 800, 400, 1)
    const col = g.paneles[0].col
    const l = lecturaEn(m, VISTA_COMPLETA, g, col.x + col.w * 0.5 + 4)!
    expect(l.xPx).toBeCloseTo(col.x + col.w * 0.5, 6)
    expect(l.filas[0].valor).toBe(10)
    // Lejos de un dato no se pega: se interpola.
    const lejos = lecturaEn(m, VISTA_COMPLETA, g, col.x + col.w * 0.75)!
    expect(lejos.xPx).toBeCloseTo(col.x + col.w * 0.75, 6)
    expect(lejos.filas[0].valor).toBeCloseTo(7, 6)
  })
  it('en un eje logarítmico escribe la frecuencia compacta y el valor de cada traza', () => {
    const f = Float64Array.from([10, 100, 1000, 10000])
    const m: ModeloGrafica = { tipo: 'lineas', ejeX: { nombre: 'Frecuencia', unidad: 'Hz', escala: 'log', datos: { min: 10, max: 10000 } }, paneles: [{ titulo: '' }], trazas: [{ clave: 'g', etiqueta: 'Ganancia', unidad: 'dB', x: f, y: Float64Array.from([0, -1, -3, -20]), panel: 0, tono: 'canal-a', lado: 'izquierda' }] }
    const g = geometriaGrafica(m, VISTA_COMPLETA, ASPECTO_ANALISIS, 800, 400, 1)
    const col = g.paneles[0].col
    const l = lecturaEn(m, VISTA_COMPLETA, g, col.x + col.w * (2 / 3))!
    expect(l.encabezado).toBe('f = 1 kHz')
    expect(l.filas[0].texto).toBe('−3 dB')
  })
  it('las barras leen la categoría bajo el puntero', () => {
    const m: ModeloGrafica = {
      tipo: 'barras', ejeX: { nombre: 'Armónico', unidad: '', escala: 'lin', datos: { min: 0, max: 3 } }, paneles: [{ titulo: '' }], trazas: [],
      barras: { categorias: ['1', '2', '3'], unidad: 'V', frecuencias: Float64Array.from([1, 2, 3]), nota: '', series: [{ clave: 's', etiqueta: 'V(a)', tono: 'canal-a', unidad: 'V', valores: Float64Array.from([2, 0.5, 0.25]) }] }
    }
    const g = geometriaGrafica(m, VISTA_COMPLETA, ASPECTO_ANALISIS, 600, 300, 1)
    const col = g.paneles[0].col
    const l = lecturaEn(m, VISTA_COMPLETA, g, col.x + col.w * 0.5)!
    expect(l.encabezado).toBe('Armónico 2')
    expect(l.filas[0].texto).toBe('0.5 V')
  })
})

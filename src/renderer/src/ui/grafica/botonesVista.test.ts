import { describe, expect, it } from 'vitest'
import { ASPECTO_INFORME as ASPECTO_ANALISIS } from '../../../../compartido/grafica/aspecto'
import { geometriaGrafica } from './dibujo'
import { desplazarBoton, puedeDesplazar, zoomBoton, ZOOM_MAXIMO } from './gestos'
import { VISTA_COMPLETA, type ModeloGrafica, type VistaGrafica } from './modelo'

const x = Float64Array.from({ length: 101 }, (_, i) => i)
const m: ModeloGrafica = {
  tipo: 'lineas',
  ejeX: { nombre: 'Tiempo', unidad: 's', escala: 'lin', datos: { min: 0, max: 100 } },
  paneles: [{ titulo: '' }],
  trazas: [{ clave: 'a', etiqueta: 'a', unidad: 'V', x, y: Float64Array.from(x, (v) => Math.sin(v / 10)), panel: 0, tono: 'canal-a', lado: 'izquierda' }]
}
const g = (v: VistaGrafica = VISTA_COMPLETA) => geometriaGrafica(m, v, ASPECTO_ANALISIS, 800, 400, 1)

describe('botones de zoom y desplazamiento', () => {
  it('«Acercar» en ambos ejes reduce la ventana horizontal y la vertical a la mitad de lo que se ve, hacia el centro', () => {
    const v = zoomBoton(g(), VISTA_COMPLETA, -1, 'ambos', m.ejeX.datos)
    expect(v.x!.max - v.x!.min).toBeLessThan(100)
    expect((v.x!.min + v.x!.max) / 2).toBeCloseTo(50, 6)
    expect(v.y[0]![1] - v.y[0]![0]).toBeLessThan(1)
  })
  it('solo horizontal no toca el vertical y solo vertical no toca el horizontal', () => {
    const h = zoomBoton(g(), VISTA_COMPLETA, -1, 'x', m.ejeX.datos)
    expect(h.x).not.toBeNull()
    expect(h.y[0] ?? null).toBeNull()
    const vv = zoomBoton(g(), VISTA_COMPLETA, -1, 'y', m.ejeX.datos)
    expect(vv.x).toBeNull()
    expect(vv.y[0]).not.toBeNull()
  })
  it('«Alejar» vuelve a la vista completa y nunca pasa de ella', () => {
    let v = zoomBoton(g(), VISTA_COMPLETA, -1, 'ambos', m.ejeX.datos)
    for (let i = 0; i < 12; i++) v = zoomBoton(g(v), v, 1, 'ambos', m.ejeX.datos)
    expect(v.x).toBeNull()
    expect(v.y[0] ?? null).toBeNull()
  })
  it('el zoom tiene un tope: acercar sin fin no pasa del máximo', () => {
    let v: VistaGrafica = VISTA_COMPLETA
    for (let i = 0; i < 200; i++) v = zoomBoton(g(v), v, -1, 'ambos', m.ejeX.datos)
    expect((m.ejeX.datos.max - m.ejeX.datos.min) / (v.x!.max - v.x!.min)).toBeLessThanOrEqual(ZOOM_MAXIMO * 1.0001)
  })
  it('sin acercar no hay a dónde desplazarse', () => {
    expect(puedeDesplazar(VISTA_COMPLETA)).toEqual({ x: false, y: false })
    expect(desplazarBoton(g(), VISTA_COMPLETA, 1, 1, m.ejeX.datos)).toBe(VISTA_COMPLETA)
  })
  it('acercado, las flechas mueven la ventana una fracción de lo que se ve sin salirse de los datos', () => {
    const z1 = zoomBoton(g(), VISTA_COMPLETA, -1, 'ambos', m.ejeX.datos)
    const z = zoomBoton(g(z1), z1, -1, 'ambos', m.ejeX.datos)
    expect(puedeDesplazar(z)).toEqual({ x: true, y: true })
    const ancho = z.x!.max - z.x!.min
    const der = desplazarBoton(g(z), z, 1, 0, m.ejeX.datos)
    expect(der.x!.min - z.x!.min).toBeCloseTo(0.25 * ancho, 6)
    let v = z
    for (let i = 0; i < 40; i++) v = desplazarBoton(g(v), v, 1, 0, m.ejeX.datos)
    expect(v.x!.max).toBeLessThanOrEqual(100 + 1e-9)
    for (let i = 0; i < 80; i++) v = desplazarBoton(g(v), v, -1, 0, m.ejeX.datos)
    expect(v.x!.min).toBeGreaterThanOrEqual(-1e-9)
  })
  it('arriba y abajo mueven la ventana vertical y la acotan a [0, 1]', () => {
    const z = zoomBoton(g(), VISTA_COMPLETA, -1, 'y', m.ejeX.datos)
    const arriba = desplazarBoton(g(z), z, 0, 1, m.ejeX.datos)
    expect(arriba.y[0]![0]).toBeGreaterThan(z.y[0]![0])
    let v = z
    for (let i = 0; i < 20; i++) v = desplazarBoton(g(v), v, 0, 1, m.ejeX.datos)
    expect(v.y[0]![1]).toBeLessThanOrEqual(1 + 1e-9)
    for (let i = 0; i < 40; i++) v = desplazarBoton(g(v), v, 0, -1, m.ejeX.datos)
    expect(v.y[0]![0]).toBeGreaterThanOrEqual(-1e-9)
  })
})

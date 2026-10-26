import { describe, expect, it } from 'vitest'
import { ASPECTO_INFORME as ASPECTO_ANALISIS } from '../../../../compartido/grafica/aspecto'
import { geometriaGrafica } from './dibujo'
import { cursorBajo, cursoresIniciales, desplazarTeclado, panelEn, ponerCursorEn, zoomCajaEn, zoomRueda, zoomTeclado } from './gestos'
import { VISTA_COMPLETA, type ModeloGrafica, type VistaGrafica } from './modelo'

const x = Float64Array.from([1, 10, 100, 1000])
const m: ModeloGrafica = {
  tipo: 'lineas',
  ejeX: { nombre: 'Frecuencia', unidad: 'Hz', escala: 'log', datos: { min: 1, max: 1000 } },
  paneles: [{ titulo: 'Magnitud' }, { titulo: 'Fase' }],
  trazas: [
    { clave: 'a', etiqueta: 'a', unidad: 'dB', x, y: Float64Array.from([0, 0, -3, -20]), panel: 0, tono: 'canal-a', lado: 'izquierda' },
    { clave: 'a', etiqueta: 'a', unidad: '°', x, y: Float64Array.from([0, -5, -45, -85]), panel: 1, tono: 'canal-a', lado: 'izquierda' }
  ]
}
const g = (v: VistaGrafica = VISTA_COMPLETA) => geometriaGrafica(m, v, ASPECTO_ANALISIS, 800, 600, 1)

describe('gestos sobre la gráfica', () => {
  it('sabe en qué panel está el puntero', () => {
    const geo = g()
    expect(panelEn(geo, 400, 10)).toBe(0)
    expect(panelEn(geo, 400, geo.paneles[1].y0 + 10)).toBe(1)
    expect(panelEn(geo, 400, 700)).toBeNull()
  })
  it('los cursores iniciales quedan a un cuarto y tres cuartos del ancho visible, en log a la misma distancia en décadas', () => {
    const [a, b] = cursoresIniciales(g())
    expect(Math.log10(a)).toBeCloseTo(0.75, 6)
    expect(Math.log10(b)).toBeCloseTo(2.25, 6)
  })
  it('el cursor bajo el puntero se toma dentro de 8 px y el más cercano gana', () => {
    const v: VistaGrafica = { ...VISTA_COMPLETA, cursores: [10, 100] }
    const geo = g(v)
    const c = geo.paneles[0].col
    const px10 = c.x + c.w / 3
    expect(cursorBajo(geo, v, px10 + 4, 50, 8)).toBe(0)
    expect(cursorBajo(geo, v, px10 + 30, 50, 8)).toBeNull()
    expect(cursorBajo(geo, VISTA_COMPLETA, px10, 50, 8)).toBeNull()
  })
  it('arrastrar un cursor lo pone en el valor del eje bajo el puntero', () => {
    const v: VistaGrafica = { ...VISTA_COMPLETA, cursores: [10, 100] }
    const geo = g(v)
    const c = geo.paneles[0].col
    const nv = ponerCursorEn(geo, v, 0, c.x + (2 * c.w) / 3)
    expect(nv.cursores![0]).toBeCloseTo(100, 4)
    expect(nv.cursores![1]).toBe(100)
  })
  it('la rueda acerca el eje horizontal alrededor del puntero; con Shift, el vertical del panel', () => {
    const geo = g()
    const c = geo.paneles[0].col
    const v1 = zoomRueda(geo, VISTA_COMPLETA, c.x + c.w / 2, 40, -1, false)
    expect(Math.log10(v1.x!.max) - Math.log10(v1.x!.min)).toBeLessThan(3)
    expect(Math.log10(v1.x!.min) + Math.log10(v1.x!.max)).toBeCloseTo(3, 6)
    const v2 = zoomRueda(geo, VISTA_COMPLETA, c.x + c.w / 2, 40, -1, true)
    expect(v2.x).toBeNull()
    expect(v2.y[0]![1] - v2.y[0]![0]).toBeLessThan(1)
  })
  it('alejar nunca pasa de los datos', () => {
    const geo = g()
    const c = geo.paneles[0].col
    const v1 = zoomRueda(geo, VISTA_COMPLETA, c.x + 10, 40, 1, false)
    expect(v1.x).toBeNull()
  })
  it('una caja arrastrada fija ambos ejes del panel', () => {
    const geo = g()
    const c = geo.paneles[0].col
    const v = zoomCajaEn(geo, VISTA_COMPLETA, 0, c.x + c.w / 3, c.y + c.h / 4, c.x + (2 * c.w) / 3, c.y + (3 * c.h) / 4)
    expect(v.x!.min).toBeCloseTo(10, 4)
    expect(v.x!.max).toBeCloseTo(100, 4)
    expect(v.y[0]![0]).toBeCloseTo(0.25, 6)
    expect(v.y[0]![1]).toBeCloseTo(0.75, 6)
  })
  it('una caja diminuta (un clic) no cambia nada', () => {
    const geo = g()
    const c = geo.paneles[0].col
    expect(zoomCajaEn(geo, VISTA_COMPLETA, 0, c.x + 50, c.y + 50, c.x + 52, c.y + 51)).toBe(VISTA_COMPLETA)
  })
  it('con el teclado + acerca al centro y − aleja hasta volver a todo; Ctrl y flechas desplazan sin salirse', () => {
    const acercada = zoomTeclado(g(), VISTA_COMPLETA, -1, m.ejeX.datos)
    expect(acercada.x).not.toBeNull()
    const ancho = Math.log10(acercada.x!.max) - Math.log10(acercada.x!.min)
    expect(ancho).toBeCloseTo(3 * 0.8, 6)
    // Sin acercar, desplazar no hace nada.
    expect(desplazarTeclado(g(), VISTA_COMPLETA, 1, m.ejeX.datos)).toBe(VISTA_COMPLETA)
    const derecha = desplazarTeclado(g(acercada), acercada, 1, m.ejeX.datos)
    expect(derecha.x!.min).toBeGreaterThan(acercada.x!.min)
    expect(derecha.x!.max).toBeLessThanOrEqual(1000 * (1 + 1e-9))
    const alFondo = desplazarTeclado(g(derecha), derecha, 1, m.ejeX.datos)
    const otra = desplazarTeclado(g(alFondo), alFondo, 1, m.ejeX.datos)
    expect(otra.x!.max).toBeLessThanOrEqual(1000 * (1 + 1e-9))
    let v = acercada
    for (let k = 0; k < 4; k++) v = zoomTeclado(g(v), v, 1, m.ejeX.datos)
    expect(v.x).toBeNull()
  })
})

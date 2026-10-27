import { describe, expect, it } from 'vitest'
import { ASPECTO_INFORME } from '../../../../compartido/grafica/aspecto'
import { geometriaGrafica } from './dibujo'
import { lecturaEn } from './lectura'
import { VISTA_COMPLETA, type ModeloGrafica, type VistaGrafica } from './modelo'
import { cursorXYBajo, cursoresInicialesXY, lineasDeCursoresXY, moverCursorXY, ponerCursorXY } from './xy'

function modelo(x: Float64Array, y: Float64Array): ModeloGrafica {
  return {
    tipo: 'lineas',
    xy: true,
    ejeX: { nombre: 'V(in)', unidad: 'V', escala: 'lin', datos: { min: Math.min(...x), max: Math.max(...x) } },
    paneles: [{ titulo: '' }],
    trazas: [{ clave: 'V(out)', etiqueta: 'V(out)', unidad: 'V', x, y, panel: 0, tono: 'canal-a', lado: 'izquierda' }]
  }
}
const geo = (m: ModeloGrafica, v: VistaGrafica = VISTA_COMPLETA) => geometriaGrafica(m, v, ASPECTO_INFORME, 900, 600, 1)

const recta = (() => {
  const x = Float64Array.from({ length: 201 }, (_, k) => -1 + k * 0.01)
  return modelo(x, x.map((v) => -14 * v))
})()

// Circunferencia de radio 1 V recorrida dos veces (Lissajous cerrada), con x creciente solo a tramos.
const circulo = (() => {
  const n = 720
  const x = Float64Array.from({ length: n + 1 }, (_, k) => Math.cos((2 * Math.PI * k) / n))
  const y = Float64Array.from({ length: n + 1 }, (_, k) => Math.sin((2 * Math.PI * k) / n))
  return modelo(x, y)
})()

describe('cursores en una gráfica X-Y', () => {
  it('la pendiente entre dos cursores de y = −14x lee −14 con error menor a 1 %', () => {
    const g = geo(recta)
    let v: VistaGrafica = { ...VISTA_COMPLETA, ...cursoresInicialesXY(recta, VISTA_COMPLETA) }
    const col = g.paneles[0].col
    // Se arrastran a puntos cualesquiera del lienzo: el cursor cae en el punto de la curva más cercano.
    v = ponerCursorXY(recta, v, g, 0, col.x + col.w * 0.3, col.y + col.h * 0.4)
    v = ponerCursorXY(recta, v, g, 1, col.x + col.w * 0.7, col.y + col.h * 0.6)
    const linea = lineasDeCursoresXY(recta, v, false).find((l) => l.startsWith('Pendiente'))!
    const s = Number(linea.replace('Pendiente ', '').replace('−', '-'))
    expect(Math.abs(s + 14) / 14).toBeLessThan(0.01)
  })

  it('con misma unidad la pendiente va sin unidad y con detalle se ven los dos puntos', () => {
    const v: VistaGrafica = { ...VISTA_COMPLETA, cursores: [0.2, 0.6], cursoresY: [-2.8, -8.4] }
    const l = lineasDeCursoresXY(recta, v, true)
    expect(l[0]).toBe('1: V(in) 200 mV, V(out) −2.8 V')
    expect(l).toContain('ΔV(in) 400 mV')
    expect(l).toContain('Pendiente −14')
  })

  it('el cursor de una circunferencia se toma por distancia al punto y no por x', () => {
    const v: VistaGrafica = { ...VISTA_COMPLETA, cursores: [0, 0], cursoresY: [1, -1] }
    const gg = geo(circulo, v)
    const pan = gg.paneles[0]
    const gr = pan.grupos[0]
    const pxY = (y: number) => pan.y0 + pan.col.y + ((gr.dominio.max - y) / (gr.dominio.max - gr.dominio.min)) * pan.col.h
    const pxX = (x: number) => pan.col.x + ((x - gg.x.min) / (gg.x.max - gg.x.min)) * pan.col.w
    // Los dos cursores comparten x = 0; cada uno se toma solo cerca de su punto.
    expect(cursorXYBajo(circulo, v, gg, pxX(0), pxY(1), 8)).toBe(0)
    expect(cursorXYBajo(circulo, v, gg, pxX(0), pxY(-1), 8)).toBe(1)
    expect(cursorXYBajo(circulo, v, gg, pxX(0), pxY(0), 8)).toBeNull()
  })

  it('las flechas recorren la curva y no saltan al otro lado de la circunferencia', () => {
    const v0: VistaGrafica = { ...VISTA_COMPLETA, cursores: [1, 1], cursoresY: [0, 0] }
    const g = geo(circulo, v0)
    const v = moverCursorXY(circulo, v0, g, 0, 90)
    expect(v.cursores![0]).toBeCloseTo(Math.cos(Math.PI / 4), 3)
    expect(v.cursoresY![0]).toBeCloseTo(Math.sin(Math.PI / 4), 3)
    expect(v.cursores![1]).toBe(1)
  })
})

describe('lectura bajo el puntero en una gráfica X-Y', () => {
  it('en la circunferencia da la y del lado donde está el puntero', () => {
    const g = geo(circulo)
    const pan = g.paneles[0]
    const gr = pan.grupos[0]
    const pxY = (y: number) => pan.y0 + pan.col.y + ((gr.dominio.max - y) / (gr.dominio.max - gr.dominio.min)) * pan.col.h
    const pxX = (x: number) => pan.col.x + ((x - g.x.min) / (g.x.max - g.x.min)) * pan.col.w
    const arriba = lecturaEn(circulo, VISTA_COMPLETA, g, pxX(0.5) + 1, pxY(0.87))!
    const abajo = lecturaEn(circulo, VISTA_COMPLETA, g, pxX(0.5) + 1, pxY(-0.87))!
    expect(arriba.filas[0].valor).toBeCloseTo(Math.sqrt(0.75), 2)
    expect(abajo.filas[0].valor).toBeCloseTo(-Math.sqrt(0.75), 2)
    expect(arriba.encabezado.startsWith('V(in) = ')).toBe(true)
    expect(arriba.filas[0].etiqueta).toBe('V(out)')
  })

  it('en la recta la cruz queda sobre la curva', () => {
    const g = geo(recta)
    const pan = g.paneles[0]
    const l = lecturaEn(recta, VISTA_COMPLETA, g, pan.col.x + pan.col.w / 2, pan.y0 + pan.col.y + pan.col.h * 0.2)!
    const f = l.filas[0]
    const pxX = (x: number) => pan.col.x + ((x - g.x.min) / (g.x.max - g.x.min)) * pan.col.w
    const x = (l.xPx - pan.col.x) / pan.col.w * (g.x.max - g.x.min) + g.x.min
    expect(f.valor).toBeCloseTo(-14 * x, 1)
    expect(pxX(x)).toBeCloseTo(l.xPx, 3)
  })
})

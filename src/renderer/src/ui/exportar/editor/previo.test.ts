import { describe, expect, it } from 'vitest'
import { puntoDeValor, puntoMasCercano } from './etiquetas'
import { previoDe, rangoAlBajar, rangoAlMover, rangoAlSubir, type GestoRango } from './previo'
import type { GeometriaFigura } from './geometria'

const geo = { ancho: 400, alto: 300, area: { x: 50, y: 20, w: 300, h: 200 }, objetos: [], trazas: [{ id: 'A', etiqueta: 'A', tono: 'azul', unidadX: 's', unidadY: 'V', px: Float64Array.from([50, 150, 350]), py: Float64Array.from([100, 80, 120]), x: Float64Array.from([0, 1, 3]), y: Float64Array.from([0, 2, 1]) }] } as unknown as GeometriaFigura
const eje = { mapa: { px0: 50, px1: 350, dom: { min: 0, max: 3 }, escala: 'lin' }, total: { min: 0, max: 3 }, origen: 0, unidad: 's', prefijo: null } as never

describe('tramo en dos tiempos', () => {
  it('arrastrar y soltar completa el tramo ordenado', () => {
    let g = rangoAlBajar(null, 200, 1).gesto as GestoRango
    g = rangoAlMover(g, 120)
    expect(rangoAlSubir(g, 1)).toEqual({ gesto: null, aplicar: [120, 200] })
  })
  it('un clic fija el primer extremo, el ratón sigue y el segundo clic completa', () => {
    const g0 = rangoAlBajar(null, 100, 1).gesto as GestoRango
    const fija = rangoAlSubir(g0, 1)
    expect(fija.gesto?.fijado).toBe(true)
    const g = rangoAlMover(fija.gesto!, 180)
    expect(previoDe({ herramienta: 'rango', gesto: g, cursor: [180, 50], geo, eje })).toMatchObject({ tipo: 'tramo', desde: 100, hasta: 180 })
    expect(rangoAlBajar(g, 180, 1)).toEqual({ gesto: null, aplicar: [100, 180] })
  })
  it('un segundo clic casi encima del primero cancela sin tramo', () => {
    const g = rangoAlSubir(rangoAlBajar(null, 100, 1).gesto as GestoRango, 1).gesto as GestoRango
    expect(rangoAlBajar(g, 102, 1)).toEqual({ gesto: null })
  })
})

describe('vista previa antes de colocar', () => {
  const base = { gesto: null, geo, eje }
  it('el tramo muestra una guía con el valor bajo el cursor', () => {
    expect(previoDe({ ...base, herramienta: 'rango', cursor: [200, 60] })).toMatchObject({ tipo: 'guia', fx: 200 })
    expect(previoDe({ ...base, herramienta: 'rango', cursor: [200, 60] })).toHaveProperty('texto', expect.stringContaining('1.5'))
    expect(previoDe({ ...base, herramienta: 'rango', cursor: [20, 60] })).toBeNull()
  })
  it('la flecha no muestra nada antes de presionar y, al arrastrar, va del punto de presión', () => {
    expect(previoDe({ ...base, herramienta: 'flecha', cursor: [200, 100] })).toBeNull()
    expect(previoDe({ ...base, herramienta: 'flecha', cursor: [260, 100], gesto: { tipo: 'flecha', x1: 100, y1: 90, x2: 260, y2: 100 } as never })).toMatchObject({ x1: 100, x2: 260, fantasma: false })
  })
  it('la etiqueta de valor muestra el punto más cercano sobre el tramo de la traza, con sus renglones', () => {
    const r = previoDe({ ...base, herramienta: 'etiqueta', cursor: [160, 90] })
    expect(r).toMatchObject({ tipo: 'etiqueta' })
    expect(r!.tipo === 'etiqueta' && r!.px).toBeCloseTo(161.538, 2)
    expect(r!.tipo === 'etiqueta' && r!.py).toBeCloseTo(82.308, 2)
  })
  it('la etiqueta de valor no muestra fantasma lejos de toda traza', () => {
    expect(previoDe({ ...base, herramienta: 'etiqueta', cursor: [160, 200] })).toBeNull()
  })
  it('seleccionar y sin cursor no muestran nada', () => {
    expect(previoDe({ ...base, herramienta: 'seleccionar', cursor: [1, 1] })).toBeNull()
    expect(previoDe({ ...base, herramienta: 'texto', cursor: null })).toBeNull()
  })
})

describe('la etiqueta de valor sobre el tramo, no solo sobre las muestras', () => {
  // Fase de un Bode: dos muestras lejanas unidas por un tramo casi vertical (de 40 px a 190 px de alto en 4 px de ancho).
  const empinada = (logX: boolean) =>
    ({
      ...geo,
      trazas: [{ id: 'F', etiqueta: 'Fase', tono: 'azul', unidadX: 'Hz', unidadY: '°', ...(logX ? { logX: true } : {}), px: Float64Array.from([50, 200, 204, 350]), py: Float64Array.from([40, 40, 190, 190]), x: Float64Array.from([1, 100, 1000, 10000]), y: Float64Array.from([0, 0, -90, -90]) }]
    }) as unknown as GeometriaFigura
  it('acepta la etiqueta a la mitad de un tramo casi vertical, lejos de ambas muestras, con el valor interpolado', () => {
    const g = empinada(false)
    // Las muestras quedan a 75 px del puntero (más que el radio): antes no se podía poner.
    const r = previoDe({ herramienta: 'etiqueta', gesto: null, cursor: [202, 115], geo: g, eje })
    expect(r).toMatchObject({ tipo: 'etiqueta', px: 202, py: 115 })
    expect(r!.tipo === 'etiqueta' && r!.renglones[1]).toBe('y: −45°')
  })
  it('el punto cae sobre el tramo y su x se interpola en el espacio del eje (logarítmico)', () => {
    const lin = puntoMasCercano(empinada(false).trazas[0], 202, 115)!
    expect(lin.x).toBeCloseTo(550, 3)
    expect(lin.y).toBeCloseTo(-45, 6)
    const log = puntoMasCercano(empinada(true).trazas[0], 202, 115)!
    expect(log.x).toBeCloseTo(Math.sqrt(100 * 1000), 3)
    expect(log.y).toBeCloseTo(-45, 6)
  })
  it('una etiqueta guardada vuelve a su punto interpolado por el valor horizontal', () => {
    const p = puntoDeValor(empinada(true).trazas[0], Math.sqrt(100 * 1000))!
    expect(p.px).toBeCloseTo(202, 3)
    expect(p.py).toBeCloseTo(115, 3)
    expect(p.y).toBeCloseTo(-45, 6)
  })
})

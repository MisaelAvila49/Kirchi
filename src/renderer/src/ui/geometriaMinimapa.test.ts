import { describe, expect, it } from 'vitest'
import { documentoVacio, type Figura } from '../doc/tipos'
import { aMinimapa, cablesDelMinimapa, cajaDeDocumento, encuadreConVista, MAX_CABLES_MINIMAPA, minimapaVisible, rectDeCaja, figurasDelMinimapa, MAX_FIGURAS_MINIMAPA, deMinimapa, encuadreMinimapa, ponerRespaldo, respaldoMinimapa, unirCajas } from './geometriaMinimapa'

describe('minimapa', () => {
  // 100 × 50 en 180 × 120 con margen 6: escala min(168/100, 108/50) = 1.68; sobra (120 − 84)/2 = 18 arriba.
  it('encuadra la caja centrada', () => {
    const e = encuadreMinimapa({ minX: 0, minY: 0, maxX: 100, maxY: 50 }, 180, 120)
    expect(e.escala).toBeCloseTo(1.68, 9)
    expect(e.ox).toBeCloseTo(6, 9)
    expect(e.oy).toBeCloseTo(18, 9)
    const m = aMinimapa(e, { x: 100, y: 50 })
    expect(m.x).toBeCloseTo(174, 9)
    expect(m.y).toBeCloseTo(102, 9)
  })

  it('ida y vuelta entre mundo y minimapa', () => {
    const e = encuadreMinimapa({ minX: -30, minY: 10, maxX: 70, maxY: 90 }, 180, 120)
    const p = deMinimapa(e, aMinimapa(e, { x: 12, y: 34 }))
    expect(p.x).toBeCloseTo(12, 9)
    expect(p.y).toBeCloseTo(34, 9)
  })

  it('une cajas, aunque falte una', () => {
    const a = { minX: 0, minY: 0, maxX: 10, maxY: 10 }
    expect(unirCajas(a, { minX: -5, minY: 2, maxX: 4, maxY: 20 })).toEqual({ minX: -5, minY: 0, maxX: 10, maxY: 20 })
    expect(unirCajas(null, a)).toEqual(a)
    expect(unirCajas(null, null)).toBeNull()
  })

  it('la caja del documento usa las posiciones con un margen', () => {
    const d = documentoVacio()
    expect(cajaDeDocumento(d)).toBeNull()
    d.piezas.p = { id: 'p', tipo: 'resistencia', ref: 'R1', x: 10, y: 0, rot: 0, espejo: false, props: {} }
    d.cables.c = { id: 'c', puntos: [{ x: -2, y: 6 }, { x: 0, y: 6 }] }
    expect(cajaDeDocumento(d)).toEqual({ minX: -2, minY: -4, maxX: 14, maxY: 6 })
  })
})

describe('minimapa legible', () => {
  const vista = { minX: 0, minY: 0, maxX: 100, maxY: 60 }

  it('se oculta cuando todo el circuito cabe en la vista o no hay nada que ubicar', () => {
    expect(minimapaVisible(null, vista)).toBe(false)
    expect(minimapaVisible({ minX: 10, minY: 10, maxX: 90, maxY: 50 }, vista)).toBe(false)
    expect(minimapaVisible({ minX: 0, minY: 0, maxX: 100, maxY: 60 }, vista)).toBe(false)
  })
  it('se muestra apenas algo del circuito queda fuera de la vista, aunque sea por un lado', () => {
    expect(minimapaVisible({ minX: 10, minY: 10, maxX: 101, maxY: 50 }, vista)).toBe(true)
    expect(minimapaVisible({ minX: -5, minY: 10, maxX: 50, maxY: 50 }, vista)).toBe(true)
    expect(minimapaVisible({ minX: 200, minY: 200, maxX: 220, maxY: 210 }, vista)).toBe(true)
  })

  it('la caja del documento usa la caja real de cada pieza cuando se la dan, y ± margen si no', () => {
    const d = documentoVacio()
    d.piezas.p = { id: 'p', tipo: 'a', ref: 'R1', x: 10, y: 0, rot: 0, espejo: false, props: {} }
    d.piezas.q = { id: 'q', tipo: 'b', ref: 'R2', x: 50, y: 0, rot: 0, espejo: false, props: {} }
    const cajaDe = (p: { id: string }) => (p.id === 'p' ? { minX: 6, minY: -2, maxX: 14, maxY: 2 } : null)
    expect(cajaDeDocumento(d, 4, cajaDe)).toEqual({ minX: 6, minY: -4, maxX: 54, maxY: 4 })
  })

  it('el rectángulo de una pieza nunca baja de 3 px y queda centrado en su caja', () => {
    const e = encuadreMinimapa({ minX: 0, minY: 0, maxX: 1000, maxY: 600 }, 180, 120)
    const r = rectDeCaja(e, { minX: 100, minY: 100, maxX: 108, maxY: 104 })
    expect(r.ancho).toBe(3)
    expect(r.alto).toBe(3)
    const c = aMinimapa(e, { x: 104, y: 102 })
    expect(r.x + r.ancho / 2).toBeCloseTo(c.x, 9)
    expect(r.y + r.alto / 2).toBeCloseTo(c.y, 9)
    const g = rectDeCaja(e, { minX: 0, minY: 0, maxX: 500, maxY: 300 })
    expect(g.ancho).toBeCloseTo(500 * e.escala, 9)
  })

  it('los cables van como polilíneas en píxeles del minimapa, con tope, sin los de un solo punto', () => {
    const d = documentoVacio()
    const e = encuadreMinimapa({ minX: 0, minY: 0, maxX: 100, maxY: 50 }, 180, 120)
    d.cables = { a: { id: 'a', puntos: [{ x: 0, y: 0 }, { x: 100, y: 50 }] }, b: { id: 'b', puntos: [{ x: 1, y: 1 }] } }
    const cs = cablesDelMinimapa(d, e)
    expect(cs).toHaveLength(1)
    expect(cs[0][1].x).toBeCloseTo(174, 9)
    const muchos = Object.fromEntries(Array.from({ length: MAX_CABLES_MINIMAPA + 10 }, (_, i) => [`c${i}`, { id: `c${i}`, puntos: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }]))
    expect(cablesDelMinimapa({ cables: muchos }, e)).toHaveLength(MAX_CABLES_MINIMAPA)
  })

  it('el encuadre incluye la vista si se salió del circuito, y no cambia mientras se arrastra', () => {
    const caja = { minX: 0, minY: 0, maxX: 100, maxY: 50 }
    const lejos = { minX: 400, minY: 300, maxX: 500, maxY: 360 }
    const e = encuadreConVista(caja, lejos, 180, 120, null)
    const m = aMinimapa(e, { x: 500, y: 360 })
    expect(m.x).toBeLessThanOrEqual(180)
    expect(m.y).toBeLessThanOrEqual(120)
    const congelado = encuadreMinimapa(caja, 180, 120)
    expect(encuadreConVista(caja, lejos, 180, 120, congelado)).toBe(congelado)
    // Sin circuito, solo la vista.
    expect(encuadreConVista(null, lejos, 180, 120, null).escala).toBeGreaterThan(0)
  })
})

describe('respaldo del minimapa', () => {
  it('se ve: tamaño de la vista por la densidad; oculto: 0 × 0', () => {
    expect(respaldoMinimapa(true, 180, 120, 1.5)).toEqual({ w: 270, h: 180 })
    expect(respaldoMinimapa(false, 180, 120, 1.5)).toEqual({ w: 0, h: 0 })
  })

  it('ponerRespaldo solo escribe cuando cambia', () => {
    const c = { width: 180, height: 120 }
    expect(ponerRespaldo(c, { w: 180, h: 120 })).toBe(false)
    expect(ponerRespaldo(c, { w: 0, h: 0 })).toBe(true)
    expect(c).toEqual({ width: 0, height: 0 })
    expect(ponerRespaldo(c, { w: 180, h: 120 })).toBe(true)
  })

  // Con solo una línea en el lienzo el minimapa se veía vacío.
  it('la caja del documento cuenta las figuras: un circuito con solo una línea tiene caja', () => {
    const d = documentoVacio()
    d.figuras = { l: { id: 'l', tipo: 'linea', x1: -10, y1: 4, x2: 30, y2: 20, orden: 0 } }
    expect(cajaDeDocumento(d)).toEqual({ minX: -10, minY: 4, maxX: 30, maxY: 20 })
  })

  it('las figuras van al minimapa en sus coordenadas, del fondo al frente, con su tinta y su opacidad', () => {
    const d = documentoVacio()
    d.figuras = {
      a: { id: 'a', tipo: 'rectangulo', x1: 0, y1: 0, x2: 100, y2: 50, orden: 2, tinta: 'azul' },
      b: { id: 'b', tipo: 'flecha', x1: 0, y1: 50, x2: 100, y2: 0, orden: 1, opacidad: 50 }
    }
    const e = encuadreMinimapa({ minX: 0, minY: 0, maxX: 100, maxY: 50 }, 180, 120)
    const fs = figurasDelMinimapa(d, e)
    expect(fs.map((f) => [f.tipo, f.tinta, f.opacidad])).toEqual([['flecha', 'gris', 50], ['rectangulo', 'azul', 100]])
    expect(fs[1].x1).toBeCloseTo(6, 9)
    expect(fs[1].y1).toBeCloseTo(18, 9)
    expect(fs[1].x2).toBeCloseTo(174, 9)
    expect(fs[1].y2).toBeCloseTo(102, 9)
  })

  it('con muchas figuras dibuja solo las del frente, hasta el tope', () => {
    const d = documentoVacio()
    const n = MAX_FIGURAS_MINIMAPA + 500
    const figuras: Record<string, Figura> = {}
    for (let i = 0; i < n; i++) figuras[`f${i}`] = { id: `f${i}`, tipo: 'linea', x1: i, y1: 0, x2: i + 1, y2: 1, orden: i }
    d.figuras = figuras
    const fs = figurasDelMinimapa(d, encuadreMinimapa({ minX: 0, minY: 0, maxX: n, maxY: 1 }, 180, 120))
    expect(fs).toHaveLength(MAX_FIGURAS_MINIMAPA)
    expect(MAX_FIGURAS_MINIMAPA).toBeLessThanOrEqual(2000)
    const e = encuadreMinimapa({ minX: 0, minY: 0, maxX: n, maxY: 1 }, 180, 120)
    expect(fs.at(-1)!.x1).toBeCloseTo(aMinimapa(e, { x: n - 1, y: 0 }).x, 9)
  })
})

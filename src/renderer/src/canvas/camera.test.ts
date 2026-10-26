import { describe, expect, it } from 'vitest'
import { PASO_ZOOM_ENCUADRE, ZOOM_100, ZOOM_ENCUADRE_MAX } from '../lienzo/medidas'
import { encuadrarConReservas, fitCamera, margenEncuadre, pan, screenToWorld, worldToScreen, zoomAt, ZOOM_MAX, type Bounds, type Camera } from './camera'

const cam: Camera = { x: 100, y: 50, zoom: 2 }

describe('cámara', () => {
  it('pantalla y mundo son inversas', () => {
    const w = screenToWorld(cam, 30, 40)
    expect(w).toEqual({ x: 115, y: 70 })
    expect(worldToScreen(cam, w.x, w.y)).toEqual({ x: 30, y: 40 })
  })

  it('el zoom deja fijo el punto bajo el cursor', () => {
    const before = screenToWorld(cam, 200, 120)
    const z = zoomAt(cam, 200, 120, 1.5)
    expect(z.zoom).toBe(3)
    const after = screenToWorld(z, 200, 120)
    expect(after.x).toBeCloseTo(before.x, 9)
    expect(after.y).toBeCloseTo(before.y, 9)
  })

  it('el zoom respeta sus límites', () => {
    expect(zoomAt(cam, 0, 0, 1000).zoom).toBe(ZOOM_MAX)
    expect(ZOOM_MAX / ((96 / 25.4) * 1.25)).toBeCloseTo(9, 12)
    expect(zoomAt(cam, 0, 0, 1e-6).zoom).toBe(0.02)
  })

  it('el paneo mueve la vista con el mouse', () => {
    expect(pan(cam, 20, -10)).toEqual({ x: 90, y: 55, zoom: 2 })
  })

  it('encuadra y centra un rectángulo', () => {
    const c = fitCamera({ minX: 0, minY: 0, maxX: 100, maxY: 50 }, 240, 140, 20)
    expect(c.zoom).toBe(2)
    expect(screenToWorld(c, 120, 70)).toEqual({ x: 50, y: 25 })
  })
})

describe('encuadrarConReservas', () => {
  /** Rectángulo del minimapa (180×120 más su borde, a 12 px de la esquina inferior derecha). */
  const minimapa = (w: number, h: number): Bounds => ({ minX: w - 12 - 182, minY: h - 12 - 122, maxX: w - 12, maxY: h - 12 })
  const enPantalla = (c: Camera, b: Bounds): Bounds => {
    const a = worldToScreen(c, b.minX, b.minY), z = worldToScreen(c, b.maxX, b.maxY)
    return { minX: a.x, minY: a.y, maxX: z.x, maxY: z.y }
  }
  const cruzan = (a: Bounds, b: Bounds) => a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY
  const revisar = (b: Bounds, w: number, h: number) => {
    const m = margenEncuadre(w, h)
    const r = minimapa(w, h)
    const c = encuadrarConReservas(b, w, h, m, [r])
    const s = enPantalla(c, b)
    const e = 1e-6
    expect(s.minX).toBeGreaterThanOrEqual(m - e)
    expect(s.minY).toBeGreaterThanOrEqual(m - e)
    expect(s.maxX).toBeLessThanOrEqual(w - m + e)
    expect(s.maxY).toBeLessThanOrEqual(h - m + e)
    expect(cruzan(s, { minX: r.minX - m + e, minY: r.minY - m + e, maxX: r.maxX, maxY: r.maxY })).toBe(false)
    return c
  }

  it('con un tope de zoom, un dibujo chico se queda en el tope y centrado en el área libre', () => {
    // Dos resistencias: 28 × 4 unidades; sin tope el zoom pasaría de 43.
    const b = { minX: 0, minY: -2, maxX: 28, maxY: 2 }
    const w = 1280, h = 800, m = margenEncuadre(w, h)
    const c = encuadrarConReservas(b, w, h, m, [minimapa(w, h)], ZOOM_ENCUADRE_MAX)
    expect(c.zoom).toBeCloseTo(ZOOM_ENCUADRE_MAX, 9)
    const s = enPantalla(c, b)
    expect((s.minX + s.maxX) / 2).toBeCloseTo(w / 2, 6)
    expect((s.minY + s.maxY) / 2).toBeCloseTo(h / 2, 6)
    expect(cruzan(s, minimapa(w, h))).toBe(false)
    expect(encuadrarConReservas(b, w, h, m, [minimapa(w, h)]).zoom).toBeGreaterThan(ZOOM_ENCUADRE_MAX)
  })

  it('con un tope, un dibujo grande se encuadra igual que sin él', () => {
    const b = { minX: 0, minY: 0, maxX: 400, maxY: 200 }
    const sin = encuadrarConReservas(b, 1280, 800, 32, [minimapa(1280, 800)])
    expect(sin.zoom).toBeLessThan(ZOOM_ENCUADRE_MAX)
    expect(encuadrarConReservas(b, 1280, 800, 32, [minimapa(1280, 800)], ZOOM_ENCUADRE_MAX)).toEqual(sin)
  })

  it('el margen es el mayor entre 24 px y el 4 % del lado menor', () => {
    expect(margenEncuadre(1280, 800)).toBe(32)
    expect(margenEncuadre(700, 450)).toBe(24)
  })

  it('sin choque con la reserva da el mismo encuadre que fitCamera con ese margen', () => {
    const b = { minX: 0, minY: 0, maxX: 20, maxY: 20 }
    expect(encuadrarConReservas(b, 1280, 800, 32, [minimapa(1280, 800)])).toEqual(fitCamera(b, 1280, 800, 32))
  })

  it('a 1280×800 un dibujo ancho se encoge para quedar arriba del minimapa', () => {
    const c = revisar({ minX: 0, minY: 0, maxX: 100, maxY: 50 }, 1280, 800)
    // Todo el alto sobre el minimapa: (666 − 2·32) / 50.
    expect(c.zoom).toBeCloseTo(602 / 50, 9)
  })

  it('a 700×450 un dibujo alto se encoge para quedar a la izquierda del minimapa', () => {
    const c = revisar({ minX: 0, minY: 0, maxX: 60, maxY: 40 }, 700, 450)
    // Todo el ancho a la izquierda del minimapa: (506 − 2·24) / 60.
    expect(c.zoom).toBeCloseTo(458 / 60, 9)
  })

  it('cumple con varias formas de dibujo en los dos tamaños', () => {
    for (const [w, h] of [[1280, 800], [700, 450]])
      for (const b of [
        { minX: -5, minY: -5, maxX: 5, maxY: 5 },
        { minX: 0, minY: 0, maxX: 300, maxY: 10 },
        { minX: 0, minY: 0, maxX: 10, maxY: 300 },
        { minX: -40, minY: -20, maxX: 40, maxY: 25 }
      ])
        revisar(b, w, h)
  })
})

describe('encuadre en múltiplos de 50 %', () => {
  const minimapa: Bounds = { minX: 1280 - 12 - 182, minY: 800 - 12 - 122, maxX: 1280 - 12, maxY: 800 - 12 }
  const pct = (c: Camera) => (c.zoom / ZOOM_100) * 100
  const enPantalla = (c: Camera, b: Bounds): Bounds => {
    const a = worldToScreen(c, b.minX, b.minY), z = worldToScreen(c, b.maxX, b.maxY)
    return { minX: a.x, minY: a.y, maxX: z.x, maxY: z.y }
  }

  it('el paso es medio zoom real (50 %)', () => {
    expect(PASO_ZOOM_ENCUADRE).toBeCloseTo(ZOOM_100 / 2, 12)
  })

  it('baja al múltiplo de 50 % más alto que cabe', () => {
    // Cabe a 257 %: baja a 250 %; otro que cabe a 171 % queda en 150 %; uno diminuto se queda en el tope de 500 %.
    const w = 1280, h = 800
    for (const [ancho, esperado] of [[100, 250], [150, 150], [250, 100], [400, 50], [20, 500]] as const) {
      // Ancho en unidades tal que el ajuste continuo da ~ esperado + algo: se mide después.
      const b = { minX: 0, minY: 0, maxX: ancho, maxY: 10 }
      const c = encuadrarConReservas(b, w, h, 32, [], ZOOM_ENCUADRE_MAX, PASO_ZOOM_ENCUADRE)
      const continuo = encuadrarConReservas(b, w, h, 32, [], ZOOM_ENCUADRE_MAX)
      expect(pct(c) % 50).toBeCloseTo(0, 9)
      expect(pct(c)).toBeLessThanOrEqual(pct(continuo) + 1e-9)
      expect(pct(c) + 50).toBeGreaterThan(pct(continuo) - 1e-9)
      expect(pct(c)).toBeLessThanOrEqual(500 + 1e-9)
      expect(pct(c)).toBeCloseTo(esperado, 9)
    }
  })

  it('el centro del dibujo no se mueve en la pantalla y el dibujo sigue cabiendo con sus márgenes y sin tocar el minimapa', () => {
    const b = { minX: -10, minY: -4, maxX: 115, maxY: 40 }
    const sin = encuadrarConReservas(b, 1280, 800, 32, [minimapa], ZOOM_ENCUADRE_MAX)
    const con = encuadrarConReservas(b, 1280, 800, 32, [minimapa], ZOOM_ENCUADRE_MAX, PASO_ZOOM_ENCUADRE)
    const s0 = enPantalla(sin, b), s1 = enPantalla(con, b)
    expect((s1.minX + s1.maxX) / 2).toBeCloseTo((s0.minX + s0.maxX) / 2, 6)
    expect((s1.minY + s1.maxY) / 2).toBeCloseTo((s0.minY + s0.maxY) / 2, 6)
    expect(s1.minX).toBeGreaterThanOrEqual(32 - 1e-6)
    expect(s1.maxX).toBeLessThanOrEqual(1280 - 32 + 1e-6)
    expect(s1.maxY).toBeLessThanOrEqual(800 - 32 + 1e-6)
    expect(s1.minX < minimapa.maxX && minimapa.minX < s1.maxX && s1.minY < minimapa.maxY && minimapa.minY < s1.maxY).toBe(false)
  })

  it('un dibujo que solo cabe por debajo de 50 % se ajusta exacto en vez de saltar a un múltiplo que no cabe', () => {
    const b = { minX: 0, minY: 0, maxX: 600, maxY: 300 }
    const c = encuadrarConReservas(b, 1280, 800, 32, [], ZOOM_ENCUADRE_MAX, PASO_ZOOM_ENCUADRE)
    expect(pct(c)).toBeLessThan(50)
    expect(c).toEqual(encuadrarConReservas(b, 1280, 800, 32, [], ZOOM_ENCUADRE_MAX))
  })

  it('un dibujo diminuto se queda en el tope de 500 %, centrado', () => {
    const c = encuadrarConReservas({ minX: 0, minY: 0, maxX: 4, maxY: 2 }, 1280, 800, 32, [], ZOOM_ENCUADRE_MAX, PASO_ZOOM_ENCUADRE)
    expect(pct(c)).toBeCloseTo(500, 9)
  })
})


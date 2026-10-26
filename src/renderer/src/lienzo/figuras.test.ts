import { describe, expect, it } from 'vitest'
import type { Figura } from '../doc/tipos'
import { EscritorTrazos, EscritorTriangulos, FLOTANTES_TRAZO } from './buffers'
import {
  alfaRelleno, ALFA_RELLENO, anchoDeFigura, ATENUACION, cajaFigura, conPatron, contornosDe, dibujarFigura, dibujarFiguras, distanciaAFigura,
  ladosElipse, largoPunta, MAX_PIEZAS_PATRON, MAX_TRAMOS_FIGURAS, nuevoPresupuesto, patronDe, puntasDe, RADIO_ESQUINA
} from './figuras'
import { mezclar, PALETA_CLARA, PALETA_OSCURA } from './paleta'

const F = (extra: Partial<Figura> & Pick<Figura, 'tipo'>): Figura => ({ id: 'f', x1: 0, y1: 0, x2: 20, y2: 10, orden: 0, ...extra })
const segmentos = (t: EscritorTrazos) => {
  const d = t.resultado()
  const out: number[][] = []
  for (let i = 0; i < t.cuenta; i++) out.push(Array.from(d.subarray(i * FLOTANTES_TRAZO, (i + 1) * FLOTANTES_TRAZO)))
  return out
}

describe('medidas de la pluma', () => {
  it('el grosor va de mm a unidades de mundo y la punta mide 2 mm o 5.7 grosores', () => {
    expect(anchoDeFigura(F({ tipo: 'linea' }))).toBeCloseTo(0.2)
    expect(anchoDeFigura(F({ tipo: 'linea', grosor: 0.7 }))).toBeCloseTo(0.56)
    expect(largoPunta(F({ tipo: 'flecha' }))).toBeCloseTo(1.6)
    expect(largoPunta(F({ tipo: 'flecha', grosor: 0.7 }))).toBeCloseTo((5.7 * 0.7) / 1.25)
  })

  it('el patrón escala con la pluma: guiones de 6 grosores con huecos de 4 y puntos cada 3.5; continuo no tiene', () => {
    expect(patronDe(F({ tipo: 'linea' }))).toBeNull()
    const g = patronDe(F({ tipo: 'linea', trazo: 'guiones', grosor: 0.5 }))!
    expect(g.trazo).toBeCloseTo(2.4)
    expect(g.hueco).toBeCloseTo(1.6)
    const p = patronDe(F({ tipo: 'linea', trazo: 'puntos' }))!
    expect(p.trazo).toBe(0)
    expect(p.hueco).toBeCloseTo(0.7)
  })

  it('el relleno suave es de 7 % sobre papel claro y 12 % en el tema oscuro', () => {
    expect(alfaRelleno(PALETA_CLARA)).toBe(ALFA_RELLENO.claro)
    expect(alfaRelleno(PALETA_OSCURA)).toBe(ALFA_RELLENO.oscuro)
    expect(ALFA_RELLENO).toEqual({ claro: 0.07, oscuro: 0.12 })
  })
})

describe('contornos', () => {
  it('el rectángulo es una polilínea cerrada con esquinas de 1 mm que no sale de su caja', () => {
    const [c] = contornosDe(F({ tipo: 'rectangulo' }))
    expect(c.length).toBe(2 * (4 * 5 + 1))
    expect([c[0], c[1]]).toEqual([c[c.length - 2], c[c.length - 1]])
    for (let i = 0; i < c.length; i += 2) {
      expect(c[i]).toBeGreaterThanOrEqual(-1e-9)
      expect(c[i]).toBeLessThanOrEqual(20 + 1e-9)
      expect(c[i + 1]).toBeGreaterThanOrEqual(-1e-9)
      expect(c[i + 1]).toBeLessThanOrEqual(10 + 1e-9)
    }
    expect(RADIO_ESQUINA).toBeCloseTo(0.8)
  })

  it('la elipse toca el centro de cada lado de su caja y cierra; sus lados crecen con el tamaño, de 24 a 256', () => {
    const [c] = contornosDe(F({ tipo: 'elipse' }))
    expect([c[0], c[1]]).toEqual([20, 5])
    expect([c[c.length - 2], c[c.length - 1]]).toEqual([20, 5])
    expect(ladosElipse(1, 1)).toBe(24)
    expect(ladosElipse(1000, 1000)).toBe(256)
    expect(ladosElipse(40, 20)).toBeGreaterThan(ladosElipse(10, 5))
  })

  it('la flecha llena acorta su tramo bajo la punta; la abierta llega a la punta; la de dos puntas se acorta en los dos lados', () => {
    const L = largoPunta(F({ tipo: 'flecha' })) * 0.6
    expect(contornosDe(F({ tipo: 'flecha', y2: 0 }))[0]).toEqual([0, 0, 20 - L, 0])
    expect(contornosDe(F({ tipo: 'flecha', y2: 0, punta: 'abierta' }))[0]).toEqual([0, 0, 20, 0])
    expect(contornosDe(F({ tipo: 'flecha', y2: 0, punta: 'dos' }))[0]).toEqual([L, 0, 20 - L, 0])
    expect(contornosDe(F({ tipo: 'linea' }))[0]).toEqual([0, 0, 20, 10])
  })

  it('las puntas: una llena en la punta, una abierta en la punta, o una llena en cada extremo', () => {
    const llena = puntasDe(F({ tipo: 'flecha', y2: 0 }))
    expect(llena.abiertas).toEqual([])
    expect(llena.llenas).toHaveLength(1)
    // La punta del triángulo es el extremo (x2, y2) y sus otros dos vértices quedan atrás, simétricos.
    const [p] = llena.llenas
    expect([p[2], p[3]]).toEqual([20, 0])
    expect(p[0]).toBeCloseTo(p[4])
    expect(p[1]).toBeCloseTo(-p[5])
    expect(p[0]).toBeLessThan(20)
    expect(puntasDe(F({ tipo: 'flecha', punta: 'abierta' })).abiertas).toHaveLength(1)
    expect(puntasDe(F({ tipo: 'flecha', punta: 'dos' })).llenas).toHaveLength(2)
    expect(puntasDe(F({ tipo: 'linea' }))).toEqual({ llenas: [], abiertas: [] })
  })
})

describe('patrón a lo largo de una polilínea', () => {
  it('guiones: trazo y hueco alternan, también a través de una esquina', () => {
    const out: number[][] = []
    conPatron([0, 0, 5, 0, 5, 5], { trazo: 2, hueco: 1 }, (...s) => out.push(s))
    // 10 unidades de largo: trazos de 0 a 2, 3 a 5 (hasta la esquina), y 6 a 8 y 9 a 10 en el segundo tramo.
    expect(out).toEqual([[0, 0, 2, 0], [3, 0, 5, 0], [5, 1, 5, 3], [5, 4, 5, 5]])
  })

  it('una figura enorme (un .kir admite 2^20) no da millones de guiones: pasado el tope va continua', () => {
    const out: number[][] = []
    conPatron([0, 0, 2 ** 20, 0], { trazo: 0, hueco: 0.7 }, (...s) => out.push(s))
    expect(out).toEqual([[0, 0, 2 ** 20, 0]])
    expect(MAX_PIEZAS_PATRON).toBe(4000)
  })

  it('puntos: un punto (tramo de largo cero) cada hueco, desde el principio', () => {
    const out: number[][] = []
    conPatron([0, 0, 3, 0], { trazo: 0, hueco: 1 }, (...s) => out.push(s))
    expect(out).toEqual([[0, 0, 0, 0], [1, 0, 1, 0], [2, 0, 2, 0], [3, 0, 3, 0]])
  })
})

describe('dibujar', () => {
  it('una línea continua es un solo tramo del grosor de su pluma en su tinta', () => {
    const t = new EscritorTrazos()
    dibujarFigura(t, new EscritorTriangulos(), F({ tipo: 'linea', tinta: 'rojo' }), PALETA_CLARA.textoRojo, null)
    // El búfer es de 32 bits: los extremos enteros salen exactos y el ancho y el color, muy cerca.
    expect(segmentos(t)).toHaveLength(1)
    const [s] = segmentos(t)
    expect(s.slice(0, 4)).toEqual([0, 0, 20, 10])
    expect(s[4]).toBeCloseTo(0.2)
    PALETA_CLARA.textoRojo.forEach((v, i) => expect(s[5 + i]).toBeCloseTo(v, 5))
  })

  it('el relleno suave solo va con relleno y sin pasar de la caja; la línea nunca lleva', () => {
    const tri = new EscritorTriangulos()
    dibujarFigura(new EscritorTrazos(), tri, F({ tipo: 'rectangulo' }), PALETA_CLARA.textoGris, [0, 0, 0, 0.07])
    expect(tri.cuenta).toBe(0)
    dibujarFigura(new EscritorTrazos(), tri, F({ tipo: 'rectangulo', relleno: true }), PALETA_CLARA.textoGris, [0, 0, 0, 0.07])
    expect(tri.cuenta).toBe(4 * 5)
  })

  it('dibujarFiguras pinta con la tinta de cada una y, atenuadas, con el trazo mezclado con el lienzo y el relleno a la mitad', () => {
    const f = F({ tipo: 'elipse', tinta: 'azul', relleno: true })
    const normal = { t: new EscritorTrazos(), tri: new EscritorTriangulos() }
    const tenue = { t: new EscritorTrazos(), tri: new EscritorTriangulos() }
    dibujarFiguras(normal.t, normal.tri, [f], PALETA_CLARA)
    dibujarFiguras(tenue.t, tenue.tri, [f], PALETA_CLARA, true)
    const tenueEsperado = mezclar(PALETA_CLARA.textoAzul, PALETA_CLARA.lienzo, ATENUACION)
    PALETA_CLARA.textoAzul.forEach((v, i) => expect(segmentos(normal.t)[0][5 + i]).toBeCloseTo(v, 5))
    tenueEsperado.forEach((v, i) => expect(segmentos(tenue.t)[0][5 + i]).toBeCloseTo(v, 5))
    const alfa = (tri: EscritorTriangulos) => tri.resultado()[5]
    expect(alfa(normal.tri)).toBeCloseTo(0.07)
    expect(alfa(tenue.tri)).toBeCloseTo(0.035)
  })

  it('la opacidad de la figura se mezcla con el lienzo y se suma a la atenuación; con el contraste alto no cuenta', () => {
    const f = F({ tipo: 'rectangulo', tinta: 'rojo', relleno: true, opacidad: 50 })
    const pintar = (atenuar: boolean, sinOpacidad = false) => {
      const t = new EscritorTrazos(), tri = new EscritorTriangulos()
      dibujarFiguras(t, tri, [f], PALETA_CLARA, atenuar, undefined, sinOpacidad)
      return { trazo: segmentos(t)[0].slice(5, 9), alfa: tri.resultado()[5] }
    }
    const media = pintar(false)
    mezclar(PALETA_CLARA.textoRojo, PALETA_CLARA.lienzo, 0.5).forEach((v, i) => expect(media.trazo[i]).toBeCloseTo(v, 5))
    expect(media.alfa).toBeCloseTo(0.035)
    const simulando = pintar(true)
    mezclar(PALETA_CLARA.textoRojo, PALETA_CLARA.lienzo, 0.25).forEach((v, i) => expect(simulando.trazo[i]).toBeCloseTo(v, 5))
    expect(simulando.alfa).toBeCloseTo(0.0175)
    const forzado = pintar(false, true)
    PALETA_CLARA.textoRojo.forEach((v, i) => expect(forzado.trazo[i]).toBeCloseTo(v, 5))
    expect(forzado.alfa).toBeCloseTo(0.07)
  })
})

describe('caja y distancia (el clic)', () => {
  it('la caja cubre los extremos con medio grosor y, en la flecha, el ancho de su punta', () => {
    const c = cajaFigura(F({ tipo: 'rectangulo' }))
    expect(c.minX).toBeCloseTo(-0.1)
    expect(c.maxY).toBeCloseTo(10.1)
    const a = cajaFigura(F({ tipo: 'flecha', y2: 0 }))
    expect(a.maxY).toBeGreaterThan(0.1 + 0.5)
  })

  it('la distancia es al contorno, no al interior: el centro de un rectángulo queda lejos', () => {
    const r = F({ tipo: 'rectangulo' })
    expect(distanciaAFigura(r, { x: 10, y: 0 })).toBeCloseTo(0)
    expect(distanciaAFigura(r, { x: 10, y: 5 })).toBeCloseTo(5)
    expect(distanciaAFigura(F({ tipo: 'elipse' }), { x: 10, y: 5 })).toBeGreaterThan(4.9)
    expect(distanciaAFigura(F({ tipo: 'linea', y2: 0 }), { x: 7, y: 2 })).toBeCloseTo(2)
  })
})

describe('presupuesto de toda la escena (un .kir alterado no cuelga la ventana)', () => {
  it('muchas figuras punteadas, cada una bajo su tope, se dibujan continuas pasado el presupuesto común y lo dicen', () => {
    // 2,000 líneas de 3,000 puntos cada una: 6 millones de puntos sin el presupuesto común.
    const figs = Array.from({ length: 2000 }, (_, i): Figura => F({ id: `f${i}`, tipo: 'linea', x1: 0, y1: i, x2: 3000 * 0.7, y2: i, trazo: 'puntos', grosor: 0.25 }))
    const t = new EscritorTrazos()
    const p = nuevoPresupuesto()
    dibujarFiguras(t, new EscritorTriangulos(), figs, PALETA_CLARA, false, p)
    expect(p.agotado).toBe(true)
    expect(t.cuenta).toBeLessThanOrEqual(MAX_TRAMOS_FIGURAS + figs.length)
  })

  it('agotado, una elipse se dibuja con los lados mínimos y sin patrón', () => {
    const t = new EscritorTrazos()
    const p = nuevoPresupuesto(0)
    dibujarFiguras(t, new EscritorTriangulos(), [F({ tipo: 'elipse', x2: 4000, y2: 3000, trazo: 'guiones' })], PALETA_CLARA, false, p)
    expect(t.cuenta).toBe(ladosElipse(1, 1))
    expect(p.agotado).toBe(true)
  })

  it('sin pasar del presupuesto nada cambia y no se dice nada', () => {
    const p = nuevoPresupuesto()
    const t = new EscritorTrazos()
    dibujarFiguras(t, new EscritorTriangulos(), [F({ tipo: 'linea', x2: 7, y2: 0, trazo: 'puntos' })], PALETA_CLARA, false, p)
    expect(p.agotado).toBe(false)
    expect(t.cuenta).toBeGreaterThan(1)
  })
})

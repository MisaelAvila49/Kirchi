import { describe, expect, it } from 'vitest'
import { EscritorTriangulos, FLOTANTES_VERTICE } from './buffers'
import { BRILLO_MINIMO, brilloDeLuz, CAMBIO_MINIMO, CAMBIOS_ENTRA, CAMBIOS_SALE, colorDeFoco, luzDeFoco, resplandor, VigiaDeDestellos } from './luces'
import { PALETA_CLARA } from './paleta'

describe('luces', () => {
  it('el brillo es la raíz de la corriente media entre la nominal: a 2 mA un LED de 20 mA se ve claramente encendido', () => {
    expect(brilloDeLuz(0.02, 0.02)).toBe(1)
    expect(brilloDeLuz(0.002, 0.02)).toBeCloseTo(Math.sqrt(0.1), 12)
    expect(brilloDeLuz(0.002, 0.02)).toBeGreaterThan(0.3)
    expect(brilloDeLuz(0.05, 0.02)).toBe(1)
    expect(brilloDeLuz(-0.01, 0.02)).toBe(0)
    expect(brilloDeLuz(Number.NaN, 0.02)).toBe(0)
    // Un dígito del display multiplexado a un cuarto del tiempo con pulsos de 20 mA: media de 5 mA, la mitad del brillo.
    expect(brilloDeLuz(0.005, 0.02)).toBeCloseTo(0.5, 12)
    expect(brilloDeLuz(0.0004, 0.02)).toBeCloseTo(BRILLO_MINIMO, 12)
  })

  it('el foco crece con el cuadrado del calentamiento y pasa del naranja apagado al blanco cálido', () => {
    expect(luzDeFoco(0.5)).toBe(0.25)
    expect(luzDeFoco(1.3)).toBe(1)
    expect(luzDeFoco(-1)).toBe(0)
    expect(colorDeFoco(0, PALETA_CLARA)).toEqual(PALETA_CLARA.focoTibio)
    expect(colorDeFoco(1, PALETA_CLARA)).toEqual(PALETA_CLARA.focoPleno)
  })

  it('el resplandor se desvanece hacia afuera: opacidad por vértice, cero en el borde exterior', () => {
    const tri = new EscritorTriangulos()
    resplandor(tri, 0, 0, 1, 1.6, PALETA_CLARA.ledRojo, 0.35, 8)
    expect(tri.cuenta).toBe(16)
    const d = tri.resultado()
    const alfas = Array.from({ length: d.length / FLOTANTES_VERTICE }, (_, k) => [Math.hypot(d[k * FLOTANTES_VERTICE], d[k * FLOTANTES_VERTICE + 1]), d[k * FLOTANTES_VERTICE + 5]])
    for (const [r, a] of alfas) expect(a).toBeCloseTo(r > 1.3 ? 0 : 0.35, 6)
  })

  it('una luz que cambia de sentido más de seis veces por segundo se dibuja quieta con su brillo medio; a 1 Hz parpadea', () => {
    const v = new VigiaDeDestellos()
    // 10 Hz leída a 60 cuadros por segundo, cada cuadro una muestra nueva: unos 20 cambios por segundo.
    let ultimo = { brillo: 0, conmuta: false }
    for (let t = 0; t <= 1500; t += 1000 / 60) ultimo = v.revisar('d1', Math.floor(t / 50) % 2 ? 1 : 0, t, t)
    expect(ultimo.conmuta).toBe(true)
    expect(ultimo.brillo).toBeGreaterThan(0.4)
    expect(ultimo.brillo).toBeLessThan(0.6)
    // A 1 Hz: dos cambios por segundo, se ve parpadear.
    const lenta = new VigiaDeDestellos()
    const vistos = new Set<number>()
    for (let t = 0; t <= 3000; t += 1000 / 60) {
      const r = lenta.revisar('d2', Math.floor(t / 500) % 2 ? 1 : 0, t, t)
      expect(r.conmuta).toBe(false)
      vistos.add(r.brillo)
    }
    expect(vistos).toEqual(new Set([0, 1]))
    expect(CAMBIOS_ENTRA).toBe(6)
  })

  it('la misma muestra dibujada en muchos cuadros cuenta una vez', () => {
    // 2 Hz (cuatro cambios por segundo) con lecturas de 10 Hz y la capa rehecha a 60 cuadros por segundo.
    const v = new VigiaDeDestellos()
    for (let t = 0; t <= 3000; t += 1000 / 60) {
      const muestra = Math.floor(t / 100)
      const r = v.revisar('d', Math.floor((muestra * 100) / 250) % 2 ? 1 : 0, t, muestra)
      expect(r.conmuta).toBe(false)
    }
  })

  it('un temblor pequeño no cuenta: solo los cambios de más de una décima del brillo pleno', () => {
    const v = new VigiaDeDestellos()
    for (let t = 0; t <= 3000; t += 1000 / 60) expect(v.revisar('d', 0.5 + (Math.floor(t / 50) % 2 ? 0.04 : -0.04), t, t).conmuta).toBe(false)
    expect(CAMBIO_MINIMO).toBe(0.1)
  })

  it('con histéresis: entra con más de seis cambios por segundo y sale cuando lleva un segundo con cuatro o menos', () => {
    const v = new VigiaDeDestellos()
    let t = 0
    const correr = (hasta: number, mitad: number) => {
      let r = { brillo: 0, conmuta: false }
      for (; t <= hasta; t += 1000 / 60) r = v.revisar('d', Math.floor(t / mitad) % 2 ? 1 : 0, t, t)
      return r
    }
    expect(correr(1500, 50).conmuta).toBe(true)
    // Cinco cambios por segundo (2.5 Hz): sigue quieta.
    expect(correr(4000, 200).conmuta).toBe(true)
    // Dos por segundo: sale después de un segundo con cuatro o menos.
    expect(correr(4500, 500).conmuta).toBe(true)
    expect(correr(8000, 500).conmuta).toBe(false)
    expect(CAMBIOS_SALE).toBe(4)
  })
})
